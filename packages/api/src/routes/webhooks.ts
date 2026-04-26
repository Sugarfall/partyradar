import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma, type CardDesign } from '@partyradar/db'
import { ensureStripe, platformFeeCents } from '../lib/stripe'
import type Stripe from 'stripe'
import { v4 as uuidv4 } from 'uuid'
import { sendNotificationToMany } from '../lib/fcm'
import { PUSH_BLAST_TIERS, TIERS, REVENUE_MODEL, WALLET_CONFIG } from '@partyradar/shared'
import { haversineDistance } from '../lib/fcm'
import { creditReferrer } from './referrals'

const router = Router()

/** POST /api/webhooks/stripe */
router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature']
  if (!sig || Array.isArray(sig)) {
    res.status(400).send('Missing stripe-signature header')
    return
  }
  const webhookSecret        = process.env['STRIPE_WEBHOOK_SECRET']
  const connectWebhookSecret = process.env['STRIPE_CONNECT_WEBHOOK_SECRET']

  if (!webhookSecret && !connectWebhookSecret) {
    console.error('[webhook] No webhook secrets configured — rejecting webhook')
    res.status(503).send('Webhook receiver not configured')
    return
  }

  // Stripe signs Connect events (account.updated, account.application.deauthorized)
  // with the Connect endpoint secret, not the platform secret — both land at this
  // same URL, so we must try both. Try the platform secret first (most events),
  // fall back to the Connect secret.
  const stripe = ensureStripe()
  let event: Stripe.Event | undefined
  for (const secret of [webhookSecret, connectWebhookSecret]) {
    if (!secret) continue
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret)
      break
    } catch { /* try next secret */ }
  }
  if (!event) {
    res.status(400).send('Webhook signature verification failed')
    return
  }

  // Idempotency guard: Stripe retries on network failure and we must not
  // re-credit a wallet or re-issue a ticket. A unique-constraint violation on
  // the `id` primary key means we've already handled this event — ack it and
  // skip.
  try {
    await prisma.processedStripeEvent.create({
      data: { id: event.id, type: event.type },
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.json({ received: true, duplicate: true })
      return
    }
    console.error('[Webhook] Idempotency write failed — returning 500 for Stripe retry', err)
    res.status(500).send('Idempotency write failed')
    return
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutComplete(session)
        break
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        await handleInvoicePaid(invoice)
        break
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        await handleSubscriptionUpdated(sub)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await handleSubscriptionDeleted(sub)
        break
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        if (pi.metadata?.type === 'wallet_topup') {
          await handleWalletTopUpFromIntent(pi)
        }
        break
      }
      case 'account.updated': {
        // Sent when a connected Express account changes — mirror the
        // verification flags onto the host's User row so we can gate
        // checkout without hitting Stripe on every request.
        const account = event.data.object as Stripe.Account
        await handleConnectAccountUpdated(account)
        break
      }
      case 'account.application.deauthorized': {
        // Host disconnected PartyRadar from their Stripe dashboard.
        // Clear their Connect state so checkout refuses new sales until
        // they re-onboard — otherwise tickets sell but Stripe rejects the
        // transfer at checkout time. The payload's data.object is a
        // Stripe.Application (the platform); the actual deauthorized
        // connected account ID lives in event.account.
        const connectedAccountId = event.account
        if (connectedAccountId) {
          await handleConnectAccountDeauthorized(connectedAccountId)
        }
        break
      }
    }

    res.json({ received: true })
  } catch (err) {
    console.error('[Webhook Error]', err)
    res.status(500).send('Webhook handler error')
  }
})

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const { eventId, userId, quantity } = session.metadata ?? {}

  // Push blast checkout (from /api/notifications/blast — uses 'push_blast' type)
  if (session.metadata?.['type'] === 'push_blast') {
    await handlePushBlastPaid(session)
    return
  }

  // Dashboard-queued push blast (from /api/dashboard/blast — uses 'push_blast_queued' type)
  if (session.metadata?.['type'] === 'push_blast_queued') {
    await handlePushBlastQueued(session)
    return
  }

  // Wallet top-up
  if (session.metadata?.['type'] === 'wallet_topup') {
    await handleWalletTopUp(session)
    return
  }

  // Card order
  if (session.metadata?.['type'] === 'card_order') {
    await handleCardOrder(session)
    return
  }

  // Group subscription checkout — user subscribes to a paid community group
  if (session.mode === 'subscription' && session.metadata?.['type'] === 'group_subscription') {
    await handleGroupSubscriptionCheckout(session)
    return
  }

  // Platform subscription checkout (BASIC / PRO / PREMIUM host tiers)
  if (session.mode === 'subscription') {
    const { userId: subUserId, tier } = session.metadata ?? {}
    if (!subUserId || !tier) return

    const stripe = ensureStripe()
    const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string)

    await prisma.subscription.upsert({
      where: { userId: subUserId },
      create: {
        userId: subUserId,
        tier: tier as 'BASIC' | 'PRO' | 'PREMIUM',
        stripeSubscriptionId: stripeSub.id,
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      },
      update: {
        tier: tier as 'BASIC' | 'PRO' | 'PREMIUM',
        stripeSubscriptionId: stripeSub.id,
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        cancelAtPeriodEnd: false,
      },
    })

    await prisma.user.update({
      where: { id: subUserId },
      data: { subscriptionTier: tier as 'BASIC' | 'PRO' | 'PREMIUM' },
    })

    // Record platform revenue + credit referrer (100% of sub price is platform revenue)
    const tierConfig = TIERS[tier as 'BASIC' | 'PRO' | 'PREMIUM']
    const subRevenue = tierConfig?.price ?? 0
    if (subRevenue > 0) {
      await prisma.platformRevenue.create({
        data: {
          source: 'subscription',
          amount: subRevenue,
          referenceId: subUserId,
          description: `${tierConfig.name} subscription (initial)`,
        },
      })
      await creditReferrer(subUserId, subRevenue)
    }
    return
  }

  // Ticket checkout
  if (!eventId || !userId || !quantity) return

  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) return

  const qty = Number(quantity)
  const pricePaid = event.price
  // Use the same formula as stripe.ts platformFeeCents (5% + £0.30/ticket)
  // so the revenue recorded here matches what Stripe actually transfers to us.
  const platformFee = platformFeeCents(pricePaid, 1) / 100        // per-ticket in GBP
  const totalPlatformRevenue = Number((platformFee * qty).toFixed(2))

  // Idempotency: if we've already processed this session, skip.
  const already = await prisma.ticket.findFirst({ where: { stripeSessionId: session.id } })
  if (already) return

  // Capacity guard: prevent overselling when two webhooks arrive simultaneously
  // for the last remaining tickets. We re-check inside the transaction so the
  // pre-check + decrement are effectively atomic at the DB level.
  if (event.ticketsRemaining < qty) {
    console.warn(
      `[Webhook] Oversell guard: event ${eventId} has ${event.ticketsRemaining} ticket(s) remaining, ` +
      `requested ${qty}. Session ${session.id} not fulfilled.`,
    )
    return
  }

  const ticketData = Array.from({ length: qty }, () => ({
    eventId,
    userId,
    qrCode: uuidv4(),
    stripePaymentId: session.payment_intent as string,
    stripeSessionId: session.id,
    pricePaid,
    platformFee,
  }))

  // Atomically: create tickets, decrement capacity, upsert guest, record revenue.
  // Uses an interactive transaction so we can re-validate capacity inside the
  // serialisation boundary — prevents a second concurrent webhook from also
  // decrementing past zero if both passed the pre-check above.
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.event.findUnique({
      where: { id: eventId },
      select: { ticketsRemaining: true },
    })
    if (!fresh || fresh.ticketsRemaining < qty) {
      throw Object.assign(new Error('Sold out'), { code: 'SOLD_OUT' })
    }

    await tx.ticket.createMany({ data: ticketData })
    await tx.event.update({
      where: { id: eventId },
      data: { ticketsRemaining: { decrement: qty } },
    })
    await tx.eventGuest.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, status: 'CONFIRMED' },
      update: { status: 'CONFIRMED' },
    })
    if (totalPlatformRevenue > 0) {
      await tx.platformRevenue.create({
        data: {
          source: 'ticket_fee',
          amount: totalPlatformRevenue,
          referenceId: eventId,
          description: `Ticket fee · ${qty}× ${event.name}`,
        },
      })
    }
  })

  // Referral credit runs outside the transaction — it's secondary bookkeeping
  // and should never block the ticket from being recorded if it fails.
  if (totalPlatformRevenue > 0) {
    await creditReferrer(userId, totalPlatformRevenue)
  }
}

async function handlePushBlastPaid(session: Stripe.Checkout.Session) {
  const { eventId, tierId, message, userId: buyerId } = session.metadata ?? {}
  if (!eventId || !tierId || !message) return

  const tier = PUSH_BLAST_TIERS.find((t) => t.id === tierId)
  if (!tier) return

  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) return

  // Record platform revenue + credit referrer — 100% of blast price is platform revenue
  if (buyerId && tier.price > 0) {
    await prisma.platformRevenue.create({
      data: {
        source: 'push_blast',
        amount: tier.price,
        referenceId: eventId,
        description: `Push blast · ${tier.label}`,
      },
    })
    await creditReferrer(buyerId, tier.price)
  }

  // Find candidate users: all users with an FCM token
  const candidates = await prisma.user.findMany({
    where: { fcmToken: { not: null }, isBanned: false },
    select: { id: true, lastKnownLat: true, lastKnownLng: true },
  })

  let targetUserIds: string[]

  if (tier.radius === 0) {
    // City-wide — everyone with a token
    targetUserIds = candidates.map((u) => u.id)
  } else {
    // Filter by haversine distance from event coordinates
    targetUserIds = candidates
      .filter((u) => {
        if (u.lastKnownLat == null || u.lastKnownLng == null) return false
        return haversineDistance(
          event.lat, event.lng,
          u.lastKnownLat, u.lastKnownLng,
        ) <= tier.radius
      })
      .map((u) => u.id)
  }

  if (targetUserIds.length === 0) return

  await sendNotificationToMany(targetUserIds, {
    type: 'PARTY_BLAST',
    title: `🎉 ${event.name}`,
    body: message,
    data: { eventId },
  })
}

// Handles dashboard-queued push blasts (type === 'push_blast_queued').
// Uses `title` + `body` from metadata (not the single `message` field used by
// the direct notifications/blast route).
async function handlePushBlastQueued(session: Stripe.Checkout.Session) {
  const { eventId, tierId, title, body, userId: buyerId, scheduledFor } = session.metadata ?? {}
  if (!eventId || !tierId || !title || !body) return

  const tier = PUSH_BLAST_TIERS.find((t) => t.id === tierId)
  if (!tier) return

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, lat: true, lng: true, hostId: true },
  })
  if (!event) return

  const hostId = buyerId ?? event.hostId

  // Record platform revenue — 100% of blast price is platform revenue
  if (tier.price > 0) {
    await prisma.platformRevenue.create({
      data: {
        source: 'push_blast',
        amount: tier.price,
        referenceId: eventId,
        description: `Push blast (queued) · ${tier.label}`,
      },
    })
    await creditReferrer(hostId, tier.price)
  }

  // Find candidate users with FCM tokens
  const candidates = await prisma.user.findMany({
    where: { fcmToken: { not: null }, isBanned: false },
    select: { id: true, lastKnownLat: true, lastKnownLng: true },
  })

  let targetUserIds: string[]
  if (tier.radius === 0) {
    targetUserIds = candidates.map((u) => u.id)
  } else {
    targetUserIds = candidates
      .filter((u) => {
        if (u.lastKnownLat == null || u.lastKnownLng == null) return false
        return haversineDistance(
          event.lat, event.lng,
          u.lastKnownLat, u.lastKnownLng,
        ) <= tier.radius
      })
      .map((u) => u.id)
  }

  // Create the PushBlast record (QUEUED → send immediately, update to SENT)
  const blast = await prisma.pushBlast.create({
    data: {
      eventId,
      hostId,
      tierId,
      radius: tier.radius,
      price: tier.price,
      reach: tier.reach,
      title,
      body,
      status: 'SENDING',
      scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
      stripeSessionId: session.id,
      recipientCount: targetUserIds.length,
    },
  })

  if (targetUserIds.length > 0) {
    await sendNotificationToMany(targetUserIds, {
      type: 'PARTY_BLAST',
      title,
      body,
      data: { eventId },
    })
  }

  await prisma.pushBlast.update({
    where: { id: blast.id },
    data: { status: 'SENT', sentAt: new Date() },
  })
}

/**
 * C2 fix: credit the group creator's wallet with their revenue share after each
 * subscription payment. Previously the platform recorded its cut but the creator
 * received nothing — their revenue never reached a wallet they could withdraw.
 *
 * creatorShare = totalPrice * (1 - GROUP_PLATFORM_CUT_PERCENT / 100)
 */
async function creditGroupCreator(groupId: string, creatorShare: number, description: string) {
  if (creatorShare <= 0) return

  const group = await prisma.groupChat.findUnique({
    where: { id: groupId },
    select: { createdById: true, name: true },
  })
  if (!group?.createdById) return

  const wallet = await prisma.wallet.upsert({
    where: { userId: group.createdById },
    create: { userId: group.createdById },
    update: {},
  })

  // Enforce MAX_BALANCE for creator wallet too
  const headroom = Math.max(0, WALLET_CONFIG.MAX_BALANCE - wallet.balance)
  const effective = Number(Math.min(creatorShare, headroom).toFixed(2))
  if (effective <= 0) return

  const updated = await prisma.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: effective } },
  })

  await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'GROUP_SUB_REVENUE',
      amount: effective,
      balanceAfter: updated.balance,
      description,
    },
  })
}

async function handleGroupSubscriptionCheckout(session: Stripe.Checkout.Session) {
  const { groupId, userId } = session.metadata ?? {}
  if (!groupId || !userId || !session.subscription) return

  const stripe = ensureStripe()
  const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string)
  const periodEnd = new Date(stripeSub.current_period_end * 1000)

  await prisma.groupSubscription.upsert({
    where: { groupId_userId: { groupId, userId } },
    create: {
      groupId,
      userId,
      stripeSubscriptionId: stripeSub.id,
      currentPeriodEnd: periodEnd,
    },
    update: {
      stripeSubscriptionId: stripeSub.id,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
  })

  // Ensure membership row exists so the user actually has access
  const membership = await prisma.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  if (!membership) {
    await prisma.groupMembership.create({ data: { groupId, userId } })
    await prisma.groupChat.update({
      where: { id: groupId },
      data: { memberCount: { increment: 1 } },
    })
  }

  // Platform takes GROUP_PLATFORM_CUT_PERCENT of each group subscription payment
  const group = await prisma.groupChat.findUnique({
    where: { id: groupId },
    select: { priceMonthly: true, name: true, createdById: true },
  })
  const price = group?.priceMonthly ?? 0
  const platformCut = Number(((price * REVENUE_MODEL.GROUP_PLATFORM_CUT_PERCENT) / 100).toFixed(2))
  if (platformCut > 0) {
    await prisma.platformRevenue.create({
      data: {
        source: 'group_subscription',
        amount: platformCut,
        referenceId: groupId,
        description: `Group sub · ${group?.name ?? groupId} (initial)`,
      },
    })
    await creditReferrer(userId, platformCut)
  }

  // C2 fix: credit the group creator with their share of the subscription payment
  const creatorShare = Number((price - platformCut).toFixed(2))
  await creditGroupCreator(groupId, creatorShare, `Group subscription · ${group?.name ?? groupId} (new member)`)
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // H2 fix: invoice.subscription was deprecated in Stripe API 2024-09-30.acacia.
  // The subscription ID now lives at invoice.parent.subscription_details.subscription.
  // We read both paths so existing events stored in Stripe's retry queue still work.
  const subscriptionId: string | null | undefined =
    (invoice as any).parent?.subscription_details?.subscription
    ?? (invoice as any).subscription
  if (!subscriptionId) return
  const stripe = ensureStripe()
  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId)
  const periodEnd = new Date(stripeSub.current_period_end * 1000)

  // Skip the very first invoice — already credited in handleCheckoutComplete.
  // Stripe marks the first invoice of a subscription with billing_reason 'subscription_create'.
  const isRenewal = invoice.billing_reason === 'subscription_cycle'
  const amountPaid = Number(((invoice.amount_paid ?? 0) / 100).toFixed(2))

  // Platform host subscription renewal
  const platformSub = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSub.id },
    select: { userId: true },
  })
  if (platformSub) {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: stripeSub.id },
      data: { currentPeriodEnd: periodEnd },
    })
    if (isRenewal && amountPaid > 0) {
      await prisma.platformRevenue.create({
        data: {
          source: 'subscription',
          amount: amountPaid,
          referenceId: platformSub.userId,
          description: `Subscription renewal`,
        },
      })
      await creditReferrer(platformSub.userId, amountPaid)
    }
    return
  }

  // Group subscription renewal
  const groupSub = await prisma.groupSubscription.findFirst({
    where: { stripeSubscriptionId: stripeSub.id },
    select: { id: true, groupId: true, userId: true },
  })
  if (groupSub) {
    await prisma.groupSubscription.update({
      where: { id: groupSub.id },
      data: { currentPeriodEnd: periodEnd },
    })
    if (isRenewal && amountPaid > 0) {
      const platformCut = Number(((amountPaid * REVENUE_MODEL.GROUP_PLATFORM_CUT_PERCENT) / 100).toFixed(2))
      if (platformCut > 0) {
        await prisma.platformRevenue.create({
          data: {
            source: 'group_subscription',
            amount: platformCut,
            referenceId: groupSub.groupId,
            description: `Group sub renewal`,
          },
        })
        await creditReferrer(groupSub.userId, platformCut)
      }
      // C2 fix: credit creator with their renewal share
      const creatorShare = Number((amountPaid - platformCut).toFixed(2))
      await creditGroupCreator(groupSub.groupId, creatorShare, `Group subscription renewal`)
    }
  }
}

async function handleSubscriptionUpdated(stripeSub: Stripe.Subscription) {
  const periodEnd = new Date(stripeSub.current_period_end * 1000)

  // Platform subscription update
  const platformSub = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: stripeSub.id } })
  if (platformSub) {
    await prisma.subscription.update({
      where: { id: platformSub.id },
      data: {
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      },
    })
    return
  }

  // Group subscription update
  const groupSub = await prisma.groupSubscription.findFirst({ where: { stripeSubscriptionId: stripeSub.id } })
  if (groupSub) {
    await prisma.groupSubscription.update({
      where: { id: groupSub.id },
      data: {
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      },
    })
  }
}

async function handleSubscriptionDeleted(stripeSub: Stripe.Subscription) {
  // Platform subscription deletion
  const sub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: stripeSub.id } })
  if (sub) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { tier: 'FREE', stripeSubscriptionId: null, currentPeriodEnd: null },
    })
    await prisma.user.update({
      where: { id: sub.userId },
      data: { subscriptionTier: 'FREE' },
    })

    // H4 fix: clear isFeatured on all future events for this host — the featured
    // flag was set at creation time based on their tier and is never automatically
    // reconciled when the subscription lapses.
    await prisma.event.updateMany({
      where: { hostId: sub.userId, isFeatured: true, startsAt: { gte: new Date() } },
      data: { isFeatured: false },
    })

    return
  }

  // Group subscription deletion — revoke membership so they lose access
  const groupSub = await prisma.groupSubscription.findFirst({ where: { stripeSubscriptionId: stripeSub.id } })
  if (groupSub) {
    await prisma.groupSubscription.delete({ where: { id: groupSub.id } })
    await prisma.groupMembership.deleteMany({
      where: { groupId: groupSub.groupId, userId: groupSub.userId },
    })
    await prisma.groupChat.update({
      where: { id: groupSub.groupId },
      data: { memberCount: { decrement: 1 } },
    })
  }
}

// ─── Wallet Top-Up ───────────────────────────────────────────────────────────

async function handleWalletTopUp(session: Stripe.Checkout.Session) {
  const { userId, walletId, topUpAmount, bonusPercent } = session.metadata ?? {}
  if (!userId || !walletId || !topUpAmount) return

  // Idempotency: skip if this session was already processed
  const existing = await prisma.walletTransaction.findFirst({ where: { stripeSessionId: session.id } })
  if (existing) return

  const amount = Number(topUpAmount)
  const bonus = Number(bonusPercent ?? 0)
  const bonusAmount = Number((amount * bonus / 100).toFixed(2))
  const totalCredit = amount + bonusAmount

  // Atomic interactive transaction: increment balance and record tx in one DB round-trip.
  // Using increment (not read-then-write) prevents a stale balance if two top-ups
  // complete for the same wallet within the same millisecond.
  await prisma.$transaction(async (tx) => {
    // M13 fix: read current balance inside the transaction so we can cap the
    // credit at MAX_BALANCE. The upfront check in wallet.ts can be bypassed by
    // a race — the webhook is the authoritative write path.
    const current = await tx.wallet.findUnique({ where: { id: walletId }, select: { balance: true } })
    const headroom = Math.max(0, WALLET_CONFIG.MAX_BALANCE - (current?.balance ?? 0))
    const effectiveCredit = Number(Math.min(totalCredit, headroom).toFixed(2))
    if (effectiveCredit <= 0) return // balance already at cap — nothing to credit

    const updated = await tx.wallet.update({
      where: { id: walletId },
      data: {
        balance: { increment: effectiveCredit },
        lifetimeTopUp: { increment: amount },
      },
    })

    await tx.walletTransaction.create({
      data: {
        walletId,
        type: 'TOP_UP',
        amount: effectiveCredit,
        balanceAfter: updated.balance,
        description: bonusAmount > 0
          ? `Top-up £${amount} + £${bonusAmount.toFixed(2)} bonus (${bonus}%)`
          : `Top-up £${amount}`,
        stripePaymentId: session.payment_intent as string,
        stripeSessionId: session.id,
      },
    })
  })

  // Record platform revenue (we hold the float)
  await prisma.platformRevenue.create({
    data: {
      source: 'wallet_topup',
      amount,
      referenceId: userId,
      description: `Wallet top-up £${amount}`,
    },
  })
}

// ─── Wallet Top-Up from PaymentIntent (Payment Elements flow) ────────────────

async function handleWalletTopUpFromIntent(pi: Stripe.PaymentIntent) {
  const { userId, walletId, topUpAmount, bonusPercent } = pi.metadata ?? {}
  if (!userId || !walletId || !topUpAmount) return

  // Idempotency: skip if this PaymentIntent was already processed
  const existing = await prisma.walletTransaction.findFirst({ where: { stripePaymentId: pi.id } })
  if (existing) return

  const amount = Number(topUpAmount)
  const bonus = Number(bonusPercent ?? 0)
  const bonusAmount = Number((amount * bonus / 100).toFixed(2))
  const totalCredit = amount + bonusAmount

  // Atomic interactive transaction: increment balance and record tx in one DB round-trip.
  await prisma.$transaction(async (tx) => {
    // M13 fix: enforce MAX_BALANCE inside the transaction (same as Checkout flow above).
    const current = await tx.wallet.findUnique({ where: { id: walletId }, select: { balance: true } })
    const headroom = Math.max(0, WALLET_CONFIG.MAX_BALANCE - (current?.balance ?? 0))
    const effectiveCredit = Number(Math.min(totalCredit, headroom).toFixed(2))
    if (effectiveCredit <= 0) return

    const updated = await tx.wallet.update({
      where: { id: walletId },
      data: {
        balance: { increment: effectiveCredit },
        lifetimeTopUp: { increment: amount },
      },
    })

    await tx.walletTransaction.create({
      data: {
        walletId,
        type: 'TOP_UP',
        amount: effectiveCredit,
        balanceAfter: updated.balance,
        description: bonusAmount > 0
          ? `Top-up £${amount} + £${bonusAmount.toFixed(2)} bonus (${bonus}%)`
          : `Top-up £${amount}`,
        stripePaymentId: pi.id,
      },
    })
  })

  // Record platform revenue (we hold the float)
  await prisma.platformRevenue.create({
    data: {
      source: 'wallet_topup',
      amount,
      referenceId: userId,
      description: `Wallet top-up £${amount}`,
    },
  })
}

// ─── Card Order ──────────────────────────────────────────────────────────────

async function handleCardOrder(session: Stripe.Checkout.Session) {
  const meta = session.metadata ?? {}
  const { userId, walletId, design, nameOnCard, shippingAddress, shippingCity, shippingPostcode } = meta
  if (!userId || !walletId || !design || !nameOnCard) return

  const { CARD_DESIGNS } = await import('@partyradar/shared')
  const cardDesign = CARD_DESIGNS.find((c) => c.id === design)
  if (!cardDesign) return

  await prisma.cardOrder.create({
    data: {
      walletId,
      userId,
      design: design as CardDesign,
      customImageUrl: meta['customImageUrl'] || null,
      nameOnCard,
      shippingAddress: shippingAddress ?? '',
      shippingCity: shippingCity ?? '',
      shippingPostcode: shippingPostcode ?? '',
      price: cardDesign.price,
      stripePaymentId: session.payment_intent as string,
    },
  })

  // Record platform revenue
  const CARD_COST = 3.50
  await prisma.platformRevenue.create({
    data: {
      source: 'card_sale',
      amount: cardDesign.price - CARD_COST,
      referenceId: userId,
      description: `${cardDesign.name} card order`,
    },
  })
}

// ─── Stripe Connect Account Update ───────────────────────────────────────────

async function handleConnectAccountUpdated(account: Stripe.Account) {
  const userId = (account.metadata?.['partyradarUserId'] as string | undefined)
  // Two lookup paths: metadata (set at account creation) or the stored
  // accountId on the user row. Fall back to the accountId lookup so we still
  // sync accounts that predate the metadata tag.
  const where = userId
    ? { id: userId }
    : { stripeConnectAccountId: account.id }
  const user = await prisma.user.findFirst({ where, select: { id: true } })
  if (!user) return

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeConnectChargesEnabled: account.charges_enabled,
      stripeConnectPayoutsEnabled: account.payouts_enabled,
      stripeConnectDetailsSubmitted: account.details_submitted,
    },
  })

  // H18 fix: if this host can no longer accept charges, unpublish all their
  // future paid events so buyers can't purchase tickets they'll never be able
  // to refund via Stripe. Free events (ticketPrice 0) are left published.
  if (!account.charges_enabled) {
    await prisma.event.updateMany({
      where: {
        hostId: user.id,
        isPublished: true,
        isCancelled: false,
        price: { gt: 0 },
        startsAt: { gte: new Date() },
      },
      data: { isPublished: false },
    })
  }
}

async function handleConnectAccountDeauthorized(connectedAccountId: string) {
  const user = await prisma.user.findFirst({
    where: { stripeConnectAccountId: connectedAccountId },
    select: { id: true },
  })
  if (!user) return

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeConnectAccountId: null,
      stripeConnectChargesEnabled: false,
      stripeConnectPayoutsEnabled: false,
      stripeConnectDetailsSubmitted: false,
    },
  })
}

export default router
