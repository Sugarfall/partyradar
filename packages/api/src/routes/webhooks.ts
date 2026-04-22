import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '@partyradar/db'
import { ensureStripe } from '../lib/stripe'
import type Stripe from 'stripe'
import { v4 as uuidv4 } from 'uuid'
import { sendNotificationToMany } from '../lib/fcm'
import { PUSH_BLAST_TIERS, TIERS, REVENUE_MODEL } from '@partyradar/shared'
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
  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET']
  if (!webhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not configured — rejecting webhook')
    res.status(503).send('Webhook receiver not configured')
    return
  }

  let event: Stripe.Event
  try {
    const stripe = ensureStripe()
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret)
  } catch {
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
    console.error('[Webhook idempotency write failed]', err)
    // Fall through — we'd rather risk a double-process than 500 on Stripe
    // and let them retry indefinitely.
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

  // Push blast checkout
  if (session.metadata?.['type'] === 'push_blast') {
    await handlePushBlastPaid(session)
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
  const platformFee = (pricePaid * Number(process.env['PLATFORM_FEE_PERCENT'] ?? 5)) / 100
  const totalPlatformRevenue = Number((platformFee * qty).toFixed(2))

  // Idempotency: if we've already processed this session, skip.
  const already = await prisma.ticket.findFirst({ where: { stripeSessionId: session.id } })
  if (already) return

  // Atomically: create tickets, decrement capacity, upsert guest, record revenue.
  // If any step fails, nothing is written — capacity stays correct.
  const ticketData = Array.from({ length: qty }, () => ({
    eventId,
    userId,
    qrCode: uuidv4(),
    stripePaymentId: session.payment_intent as string,
    stripeSessionId: session.id,
    pricePaid,
    platformFee,
  }))

  await prisma.$transaction([
    prisma.ticket.createMany({ data: ticketData }),
    prisma.event.update({
      where: { id: eventId },
      data: { ticketsRemaining: { decrement: qty } },
    }),
    prisma.eventGuest.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId, status: 'CONFIRMED' },
      update: { status: 'CONFIRMED' },
    }),
    ...(totalPlatformRevenue > 0
      ? [
          prisma.platformRevenue.create({
            data: {
              source: 'ticket_fee',
              amount: totalPlatformRevenue,
              referenceId: eventId,
              description: `Ticket fee · ${qty}× ${event.name}`,
            },
          }),
        ]
      : []),
  ])

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
    select: { priceMonthly: true, name: true },
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
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return
  const stripe = ensureStripe()
  const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription as string)
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

  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } })
  if (!wallet) return

  const newBalance = Number((wallet.balance + totalCredit).toFixed(2))

  await prisma.wallet.update({
    where: { id: walletId },
    data: {
      balance: newBalance,
      lifetimeTopUp: { increment: amount },
    },
  })

  // Main top-up transaction
  await prisma.walletTransaction.create({
    data: {
      walletId,
      type: 'TOP_UP',
      amount: totalCredit,
      balanceAfter: newBalance,
      description: bonusAmount > 0
        ? `Top-up £${amount} + £${bonusAmount.toFixed(2)} bonus (${bonus}%)`
        : `Top-up £${amount}`,
      stripePaymentId: session.payment_intent as string,
      stripeSessionId: session.id,
    },
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

  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } })
  if (!wallet) return

  const newBalance = Number((wallet.balance + totalCredit).toFixed(2))

  await prisma.wallet.update({
    where: { id: walletId },
    data: {
      balance: newBalance,
      lifetimeTopUp: { increment: amount },
    },
  })

  // Main top-up transaction
  await prisma.walletTransaction.create({
    data: {
      walletId,
      type: 'TOP_UP',
      amount: totalCredit,
      balanceAfter: newBalance,
      description: bonusAmount > 0
        ? `Top-up £${amount} + £${bonusAmount.toFixed(2)} bonus (${bonus}%)`
        : `Top-up £${amount}`,
      stripePaymentId: pi.id,
    },
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
      design: design as any,
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
