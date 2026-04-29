import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma, type CardDesign } from '@partyradar/db'
import { ensureStripe, platformFeeCents } from '../lib/stripe'
import type Stripe from 'stripe'
import { v4 as uuidv4 } from 'uuid'
import { sendNotificationToMany } from '../lib/fcm'
import { PUSH_BLAST_TIERS, HOST_TIERS, REVENUE_MODEL, WALLET_CONFIG } from '@partyradar/shared'
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
  const sigErrors: string[] = []
  for (const secret of [webhookSecret, connectWebhookSecret]) {
    if (!secret) continue
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret)
      break
    } catch (err: any) {
      // Collect per-secret errors so we can log them all if every secret fails.
      // This makes signature mismatches (e.g. wrong key in Railway env) visible
      // in logs instead of silently returning 400.
      sigErrors.push(err?.message ?? String(err))
    }
  }
  if (!event) {
    console.error('[webhook] Signature verification failed for all configured secrets:', sigErrors)
    res.status(400).send('Webhook signature verification failed')
    return
  }

  // ── Fast path: real-time issuing authorization ────────────────────────────
  // issuing_authorization.request has a hard 2-second Stripe deadline.
  // We must NOT hit the idempotency DB write before responding — that alone
  // can consume 100-300 ms and tip us over the limit on a cold connection.
  //
  // Stripe reads the `approved` field from the HTTP response body (synchronous
  // webhook mode), so we never need to call stripe.issuing.authorizations
  // .approve/.decline() — responding with { approved: false } IS the decline.
  // This removes an entire Stripe API round-trip from the critical path.
  //
  // Any exception defaults to declined so we never return 500 to Stripe.
  if (event.type === 'issuing_authorization.request') {
    const authorization = event.data.object as Stripe.Issuing.Authorization
    let approved = false
    try {
      approved = await decideIssuingAuthorization(authorization)
    } catch (err) {
      console.error('[issuing] authorization decision threw — declining for safety', err)
    }
    res.json({ approved })
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

      // ── Stripe Issuing ─────────────────────────────────────────────────────
      // NOTE: issuing_authorization.request is handled above in the fast path
      // (before the idempotency write) so it never reaches this switch.

      // issuing_transaction.created fires once the charge settles (usually
      // instantly for card-present or within seconds for online). This is where
      // we create the permanent ledger entry and link it to the IssuedCard.
      case 'issuing_transaction.created': {
        const txn = event.data.object as Stripe.Issuing.Transaction
        await handleIssuingTransaction(txn)
        break
      }

      // issuing_authorization.updated fires when an auth is reversed without
      // a matching capture (e.g. hotel hold released, merchant cancelled).
      // We add the held funds back to the user's wallet.
      case 'issuing_authorization.updated': {
        const authorization = event.data.object as Stripe.Issuing.Authorization
        if (authorization.status === 'reversed' || authorization.status === 'closed') {
          await handleIssuingAuthorizationReversed(authorization)
        }
        break
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute
        await handleChargeDispute(dispute, stripe)
        break
      }

      // Dispute resolved — restore clawed-back funds if platform won
      case 'charge.dispute.closed': {
        const dispute = event.data.object as Stripe.Dispute
        if (dispute.status === 'won') {
          await handleDisputeWon(dispute, stripe)
        }
        break
      }

      // Subscription renewal payment failed — notify the user; downgrade after 3 failures
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        await handleInvoicePaymentFailed(invoice)
        break
      }

      // Physical card shipping status updates
      case 'issuing_card.updated': {
        const card = event.data.object as Stripe.Issuing.Card
        if (card.shipping?.status) {
          await prisma.issuedCard.updateMany({
            where: { stripeCardId: card.id },
            data: {
              shippingStatus: card.shipping.status,
              trackingUrl: card.shipping.tracking_url ?? undefined,
              // H1 fix: was incorrectly setting 'SHIPPING' on delivery — card
              // would arrive but remain permanently un-usable.
              ...(card.shipping.status === 'delivered' ? { status: 'ACTIVE' } : {}),
            },
          })
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

  // Venue sponsorship checkout — venue owner pays for local spotlight
  if (session.mode === 'subscription' && session.metadata?.['type'] === 'venue_sponsorship') {
    await handleVenueSponsorshipCheckout(session)
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
    const tierConfig = HOST_TIERS[tier as 'BASIC' | 'PRO' | 'PREMIUM']
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
  const headroom = Math.max(0, WALLET_CONFIG.MAX_BALANCE - wallet.balance.toNumber())
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

  const dropped = Number((creatorShare - effective).toFixed(2))
  if (dropped > 0) {
    await prisma.platformRevenue.create({
      data: {
        source: 'creator_cap_retention',
        amount: dropped,
        referenceId: groupId ?? '',
        description: `Creator wallet at cap — £${dropped.toFixed(2)} retained (group sub)`,
      },
    }).catch(() => {}) // best-effort
  }
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

// ─── Venue Sponsorship ────────────────────────────────────────────────────────

/**
 * Activates venue spotlight after the initial Stripe Checkout payment.
 * The venue is boosted in discovery feeds for users within `promotionRadius` km.
 * Subsequent monthly renewals are handled by handleInvoicePaid.
 */
async function handleVenueSponsorshipCheckout(session: Stripe.Checkout.Session) {
  const { venueId, userId, promotionRadius } = session.metadata ?? {}
  if (!venueId || !userId) return

  const stripe = ensureStripe()
  const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string)
  const radius = promotionRadius ? Number(promotionRadius) : 5
  const sponsoredUntil = new Date(stripeSub.current_period_end * 1000)

  await prisma.venue.update({
    where: { id: venueId },
    data: {
      isSponsored: true,
      sponsoredUntil,
      promotionRadius: radius,
      stripeVenueSubId: stripeSub.id,
    },
  })

  await prisma.platformRevenue.create({
    data: {
      source: 'sponsored_venue',
      amount: REVENUE_MODEL.SPONSORED_VENUE_MONTHLY,
      referenceId: venueId,
      description: `Venue spotlight — ${radius}km radius (initial)`,
    },
  })
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
    return
  }

  // Venue sponsorship renewal — extend sponsoredUntil to the new period end
  const venueForSub = await prisma.venue.findFirst({
    where: { stripeVenueSubId: stripeSub.id },
    select: { id: true, promotionRadius: true },
  })
  if (venueForSub) {
    await prisma.venue.update({
      where: { id: venueForSub.id },
      data: { isSponsored: true, sponsoredUntil: periodEnd },
    })
    if (isRenewal && amountPaid > 0) {
      await prisma.platformRevenue.create({
        data: {
          source: 'sponsored_venue',
          amount: amountPaid,
          referenceId: venueForSub.id,
          description: `Venue spotlight renewal — ${venueForSub.promotionRadius ?? 5}km radius`,
        },
      })
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
    return
  }

  // Venue sponsorship deletion — revoke spotlight immediately on cancellation
  const sponsoredVenue = await prisma.venue.findFirst({
    where: { stripeVenueSubId: stripeSub.id },
    select: { id: true },
  })
  if (sponsoredVenue) {
    await prisma.venue.update({
      where: { id: sponsoredVenue.id },
      data: {
        isSponsored: false,
        sponsoredUntil: null,
        stripeVenueSubId: null,
      },
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

  // ── Determine net received after Stripe's processing fee ─────────────────
  // Calculating the bonus on the gross charge means the platform subsidises
  // both the Stripe fee AND the bonus. Instead we:
  //   1. Always credit the user the full gross they paid (no hidden deduction).
  //   2. Calculate the bonus only on the net actually received.
  // Example: £25 charge → £23.99 net → bonus = £23.99 × 5% = £1.20
  //          wallet credit = £25 + £1.20 = £26.20  (vs £26.25 on gross)
  //          platform cost = bonus only; Stripe fee is accepted as payment COGS.
  let netReceived = amount  // safe fallback if we cannot expand the balance transaction
  try {
    const stripe = ensureStripe()
    const pi = await stripe.paymentIntents.retrieve(
      session.payment_intent as string,
      { expand: ['latest_charge.balance_transaction'] },
    )
    const bt = (pi.latest_charge as Stripe.Charge | null)
      ?.balance_transaction as Stripe.BalanceTransaction | null
    if (bt && typeof bt.net === 'number') netReceived = bt.net / 100
  } catch (err) {
    console.warn('[wallet topup] Could not fetch balance transaction; bonus will be on gross:', err)
  }

  const bonusAmount = Number((netReceived * bonus / 100).toFixed(2))

  // Split deposit and bonus into two separate transaction records so each maps
  // 1:1 to what the user sees in Stripe and can be reconciled independently:
  //   TOP_UP row  → matches the Stripe charge amount exactly (£amount)
  //   BONUS row   → platform-awarded bonus, clearly separate (£bonusAmount)
  await prisma.$transaction(async (tx) => {
    // M13 fix: read current balance inside the transaction so we can cap the
    // credit at MAX_BALANCE. The upfront check in wallet.ts can be bypassed by
    // a race — the webhook is the authoritative write path.
    const current = await tx.wallet.findUnique({ where: { id: walletId }, select: { balance: true } })
    const currentBalance = current?.balance?.toNumber() ?? 0
    const headroom = Math.max(0, WALLET_CONFIG.MAX_BALANCE - currentBalance)
    if (headroom <= 0) return // balance already at cap — nothing to credit

    // 1 — Deposit (matches the Stripe charge exactly)
    const depositCredit = Number(Math.min(amount, headroom).toFixed(2))
    const afterDeposit = await tx.wallet.update({
      where: { id: walletId },
      data: {
        balance: { increment: depositCredit },
        lifetimeTopUp: { increment: depositCredit },
      },
    })

    await tx.walletTransaction.create({
      data: {
        walletId,
        type: 'TOP_UP',
        amount: depositCredit,
        balanceAfter: afterDeposit.balance,
        description: `Wallet top-up £${amount}`,
        stripePaymentId: session.payment_intent as string,
        stripeSessionId: session.id,
      },
    })

    // 2 — Bonus (separate record, clearly labelled)
    if (bonusAmount > 0) {
      const bonusHeadroom = Math.max(0, WALLET_CONFIG.MAX_BALANCE - afterDeposit.balance.toNumber())
      const effectiveBonus = Number(Math.min(bonusAmount, bonusHeadroom).toFixed(2))
      if (effectiveBonus > 0) {
        const afterBonus = await tx.wallet.update({
          where: { id: walletId },
          data: { balance: { increment: effectiveBonus } },
        })
        await tx.walletTransaction.create({
          data: {
            walletId,
            type: 'BONUS',
            amount: effectiveBonus,
            balanceAfter: afterBonus.balance,
            description: `Top-up bonus ${bonus}% on £${amount}`,
            stripePaymentId: session.payment_intent as string,
            stripeSessionId: session.id,
          },
        })
      }
    }
  })

  // Record platform revenue: use net received (not gross) so the dashboard
  // reflects actual cash held, not the amount before Stripe's cut.
  await prisma.platformRevenue.create({
    data: {
      source: 'wallet_topup',
      amount: netReceived,
      referenceId: userId,
      description: `Wallet top-up £${amount} (net £${netReceived.toFixed(2)} after Stripe fees)`,
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

  // ── Net received after Stripe fees (same logic as Checkout flow) ──────────
  let netReceived = amount
  try {
    const stripe = ensureStripe()
    const expanded = await stripe.paymentIntents.retrieve(pi.id, {
      expand: ['latest_charge.balance_transaction'],
    })
    const bt = (expanded.latest_charge as Stripe.Charge | null)
      ?.balance_transaction as Stripe.BalanceTransaction | null
    if (bt && typeof bt.net === 'number') netReceived = bt.net / 100
  } catch (err) {
    console.warn('[wallet topup intent] Could not fetch balance transaction; bonus will be on gross:', err)
  }

  const bonusAmount = Number((netReceived * bonus / 100).toFixed(2))

  // Same split-record approach as the Checkout flow above.
  await prisma.$transaction(async (tx) => {
    // M13 fix: enforce MAX_BALANCE inside the transaction (same as Checkout flow above).
    const current = await tx.wallet.findUnique({ where: { id: walletId }, select: { balance: true } })
    const currentBalance = current?.balance?.toNumber() ?? 0
    const headroom = Math.max(0, WALLET_CONFIG.MAX_BALANCE - currentBalance)
    if (headroom <= 0) return

    // 1 — Deposit (mirrors the Stripe charge amount)
    const depositCredit = Number(Math.min(amount, headroom).toFixed(2))
    const afterDeposit = await tx.wallet.update({
      where: { id: walletId },
      data: {
        balance: { increment: depositCredit },
        lifetimeTopUp: { increment: depositCredit },
      },
    })

    await tx.walletTransaction.create({
      data: {
        walletId,
        type: 'TOP_UP',
        amount: depositCredit,
        balanceAfter: afterDeposit.balance,
        description: `Wallet top-up £${amount}`,
        stripePaymentId: pi.id,
      },
    })

    // 2 — Bonus (separate, clearly labelled)
    if (bonusAmount > 0) {
      const bonusHeadroom = Math.max(0, WALLET_CONFIG.MAX_BALANCE - afterDeposit.balance.toNumber())
      const effectiveBonus = Number(Math.min(bonusAmount, bonusHeadroom).toFixed(2))
      if (effectiveBonus > 0) {
        const afterBonus = await tx.wallet.update({
          where: { id: walletId },
          data: { balance: { increment: effectiveBonus } },
        })
        await tx.walletTransaction.create({
          data: {
            walletId,
            type: 'BONUS',
            amount: effectiveBonus,
            balanceAfter: afterBonus.balance,
            description: `Top-up bonus ${bonus}% on £${amount}`,
            stripePaymentId: pi.id,
          },
        })
      }
    }
  })

  // Record actual net received — not the gross charge
  await prisma.platformRevenue.create({
    data: {
      source: 'wallet_topup',
      amount: netReceived,
      referenceId: userId,
      description: `Wallet top-up £${amount} (net £${netReceived.toFixed(2)} after Stripe fees)`,
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
  await prisma.platformRevenue.create({
    data: {
      source: 'card_sale',
      amount: cardDesign.price - REVENUE_MODEL.CARD_COST_OF_GOODS,
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

// ─── Stripe Issuing handlers ──────────────────────────────────────────────────

/**
 * SYNCHRONOUS authorization gate — must call approve/decline within 2 seconds.
 * Strategy: deduct from wallet in a DB transaction first. If that succeeds,
 * approve. If it fails (insufficient funds or DB error), decline. If Stripe
 * approve call fails after a successful deduction, add funds back.
 */
/**
 * Real-time issuing authorization decision.
 *
 * Returns true (approve) or false (decline). The caller responds with
 * { approved } directly in the HTTP body — Stripe reads that field
 * synchronously, so no separate approve/decline API call is required.
 *
 * Balance reconciliation on approval failure is handled by the existing
 * issuing_authorization.updated / issuing_transaction.created webhooks:
 *   • Auth reversed/closed → handleIssuingAuthorizationReversed refunds ✓
 *   • Transaction settled  → handleIssuingTransaction debits the settled amount ✓
 */
async function decideIssuingAuthorization(
  authorization: Stripe.Issuing.Authorization,
): Promise<boolean> {
  const stripeCardId = authorization.card.id
  const amountPence  = authorization.amount   // Stripe always sends pence
  const amountGBP    = amountPence / 100

  const card = await prisma.issuedCard.findUnique({
    where: { stripeCardId },
    select: { id: true, walletId: true, status: true },
  })

  // Decline unknown or non-active cards immediately
  if (!card || card.status !== 'ACTIVE') return false

  // Platform transaction fee deducted from the wallet on top of the spend.
  // The merchant still receives only amountGBP — the fee is retained by the
  // platform as the spread between wallet deduction and Issuing balance debit.
  // This fee is fully refunded if the auth is reversed or the merchant refunds.
  const feeRate      = REVENUE_MODEL.CARD_TRANSACTION_FEE_PERCENT / 100
  const platformFee  = Math.max(
    REVENUE_MODEL.CARD_MIN_TRANSACTION_FEE,
    Number((amountGBP * feeRate).toFixed(2)),
  )
  const totalDeduct  = amountGBP + platformFee   // e.g. £25 + £0.38 = £25.38

  // Atomic balance check + deduction
  try {
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { id: card.walletId },
        select: { id: true, balance: true },
      })
      // Must have enough to cover spend AND platform fee
      if (wallet.balance.toNumber() < totalDeduct) throw new Error('INSUFFICIENT_FUNDS')
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: totalDeduct } },
      })
    })
    return true
  } catch {
    // Insufficient funds, DB error, or timeout → decline
    return false
  }
}

/**
 * Called when a card transaction settles. Creates the permanent ledger entry
 * and IssuingTransaction record. Balance was already deducted at authorization;
 * for refunds we add funds back here.
 */
async function handleIssuingTransaction(txn: Stripe.Issuing.Transaction) {
  const stripeCardId       = typeof txn.card === 'string' ? txn.card : txn.card?.id
  const stripeAuthId       = typeof txn.authorization === 'string' ? txn.authorization : txn.authorization?.id
  const stripeTransactionId = txn.id
  const amountGBP          = Math.abs(txn.amount) / 100
  const isRefund           = txn.type === 'refund'
  const merchantName       = txn.merchant_data?.name ?? 'Card payment'
  const merchantCity       = txn.merchant_data?.city ?? null
  const merchantCategory   = txn.merchant_data?.category ?? null

  if (!stripeCardId) return

  const card = await prisma.issuedCard.findUnique({
    where: { stripeCardId },
    select: { id: true, walletId: true, userId: true, last4: true },
  })
  if (!card) { console.warn('[issuing] Transaction for unknown card:', stripeCardId); return }

  // Platform transaction fee — same rate used at authorization time.
  // For spends:   wallet was debited (amountGBP + fee) at auth; fee is now realised revenue.
  // For refunds:  merchant returns amountGBP; we also refund the fee to the user.
  const feeRate     = REVENUE_MODEL.CARD_TRANSACTION_FEE_PERCENT / 100
  const platformFee = Math.max(
    REVENUE_MODEL.CARD_MIN_TRANSACTION_FEE,
    Number((amountGBP * feeRate).toFixed(2)),
  )

  // Idempotency check is inside the transaction so it is atomic with the write:
  // if two retries run concurrently, exactly one issuingTransaction.create will
  // succeed; the other rolls back without double-crediting the wallet.
  await prisma.$transaction(async (tx) => {
    const exists = await tx.issuingTransaction.findUnique({ where: { stripeTransactionId } })
    if (exists) return   // already processed — bail before any balance change

    if (isRefund) {
      // Merchant refund: return the spend amount AND the platform fee to the user.
      // The balance was deducted (amountGBP + fee) at auth — restore the full amount.
      await tx.wallet.update({
        where: { id: card.walletId },
        data: { balance: { increment: amountGBP + platformFee } },
      })
    } else {
      // Settled spend: balance already deducted at auth; update lifetime tracking.
      await tx.wallet.update({
        where: { id: card.walletId },
        data: { lifetimeSpent: { increment: amountGBP } },
      })
    }

    // Ledger entry (for wallet transaction history display)
    const walletBalance = await tx.wallet.findUniqueOrThrow({
      where: { id: card.walletId },
      select: { balance: true },
    })

    const walletTx = await tx.walletTransaction.create({
      data: {
        walletId: card.walletId,
        type: isRefund ? 'CARD_REFUND' : 'CARD_PAYMENT',
        // Spend: show full wallet deduction (spend + fee). Refund: full restoration.
        amount: isRefund ? amountGBP + platformFee : -(amountGBP + platformFee),
        balanceAfter: walletBalance.balance,
        description: isRefund
          ? `Refund · ${merchantName}`
          : `${merchantName}${merchantCity ? ` · ${merchantCity}` : ''} · ${REVENUE_MODEL.CARD_TRANSACTION_FEE_PERCENT}% fee`,
        status: 'COMPLETED',
        metadata: {
          merchantName,
          merchantCity,
          merchantCategory,
          cardLast4: card.last4,
          stripeTransactionId,
          platformFee,
        },
      },
    })

    // IssuingTransaction record (for card-specific history tab)
    await tx.issuingTransaction.create({
      data: {
        cardId: card.id,
        userId: card.userId,
        walletId: card.walletId,
        stripeTransactionId,
        stripeAuthorizationId: stripeAuthId ?? null,
        amount: isRefund ? amountGBP : -amountGBP,
        currency: txn.currency.toUpperCase(),
        merchantName,
        merchantCity,
        merchantCategory,
        type: txn.type,
        status: 'settled',
        walletTransactionId: walletTx.id,
      },
    })
  })

  // ── Record platform transaction fee as revenue (or reverse it on refund) ──
  await prisma.platformRevenue.create({
    data: {
      source: 'card_transaction_fee',
      // Positive on spend (revenue earned), negative on merchant refund (fee returned to user)
      amount: isRefund ? -platformFee : platformFee,
      referenceId: card.userId,
      description: isRefund
        ? `Card fee refunded · ${merchantName} · £${amountGBP.toFixed(2)}`
        : `Card fee ${REVENUE_MODEL.CARD_TRANSACTION_FEE_PERCENT}% · ${merchantName} · £${amountGBP.toFixed(2)}`,
    },
  }).catch(err => console.warn('[issuing] Could not record card fee revenue:', err))

  // ── Capture interchange & fee data from the settled BalanceTransaction ────
  //
  // Stripe Issuing economics per card spend:
  //   • Stripe debits the platform Issuing balance the spend amount
  //   • Stripe charges a small per-transaction issuing fee (~£0.10)
  //   • The merchant's acquirer pays interchange (~0.2% UK debit) back to Stripe
  //     which is shared with the platform — this partially or fully offsets the fee
  //
  // Stripe BalanceTransaction convention:
  //   net = amount - fee   (fee is always a positive number)
  //
  // We record:
  //   - 'card_interchange' (positive revenue) when interchange > issuing fee
  //   - 'card_issuing_fee' (negative, i.e. net cost) when fee > interchange
  //
  // Falls back silently — this is best-effort accounting, not user-facing.
  if (!isRefund) {
    try {
      const stripe = ensureStripe()
      const settled = await stripe.issuing.transactions.retrieve(stripeTransactionId, {
        expand: ['balance_transaction'],
      })
      const bt = settled.balance_transaction as Stripe.BalanceTransaction | null
      if (bt) {
        // net = amount - fee  →  surplus (interchange) = amount - fee - net
        // Positive surplus = platform earned more than the gross debit (interchange credit)
        // Negative surplus = net cost (Stripe fee exceeded any interchange)
        const surplusPence = bt.amount - bt.fee - bt.net  // positive = earned, negative = cost
        if (Math.abs(surplusPence) >= 1) {  // only record if ≥ 1p — avoid dust entries
          await prisma.platformRevenue.create({
            data: {
              source: surplusPence > 0 ? 'card_interchange' : 'card_issuing_fee',
              // positive for income, negative for net cost
              amount: surplusPence / 100,
              referenceId: card.userId,
              description: surplusPence > 0
                ? `Interchange · ${merchantName} · £${amountGBP.toFixed(2)} spend`
                : `Issuing fee · ${merchantName} · £${amountGBP.toFixed(2)} spend`,
            },
          })
        }
      }
    } catch (err) {
      console.warn('[issuing] Could not capture interchange/fee data — accounting only:', err)
    }
  }
}

/**
 * Authorization reversed without a matching capture — add held funds back.
 * Guards against duplicate credit via the IssuingTransaction unique index.
 */
async function handleIssuingAuthorizationReversed(authorization: Stripe.Issuing.Authorization) {
  const stripeCardId = authorization.card.id
  const amountGBP    = authorization.amount / 100

  // If a transaction was already recorded for this auth, funds are handled
  const alreadySettled = await prisma.issuingTransaction.findUnique({
    where: { stripeAuthorizationId: authorization.id },
  })
  if (alreadySettled) return

  const card = await prisma.issuedCard.findUnique({
    where: { stripeCardId },
    select: { id: true, walletId: true },
  })
  if (!card) return

  // The wallet was debited (spend + fee) at auth — refund both in full.
  const feeRate     = REVENUE_MODEL.CARD_TRANSACTION_FEE_PERCENT / 100
  const platformFee = Math.max(
    REVENUE_MODEL.CARD_MIN_TRANSACTION_FEE,
    Number((amountGBP * feeRate).toFixed(2)),
  )
  const totalRefund = amountGBP + platformFee

  await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.update({
      where: { id: card.walletId },
      data: { balance: { increment: totalRefund } },
      select: { balance: true },
    })

    await tx.walletTransaction.create({
      data: {
        walletId: card.walletId,
        type: 'CARD_REFUND',
        amount: totalRefund,
        balanceAfter: wallet.balance,
        description: 'Authorization reversed · full refund incl. card fee',
        status: 'COMPLETED',
        metadata: { authorizationId: authorization.id, platformFee },
      },
    })

    // Record so future reversed events don't double-credit
    await tx.issuingTransaction.create({
      data: {
        cardId: card.id,
        userId: (await prisma.issuedCard.findUnique({ where: { id: card.id }, select: { userId: true } }))!.userId,
        walletId: card.walletId,
        stripeTransactionId: `rev_${authorization.id}`,
        stripeAuthorizationId: authorization.id,
        amount: totalRefund,
        currency: 'GBP',
        merchantName: 'Authorization reversed',
        type: 'refund',
        status: 'reversed',
        walletTransactionId: null,
      },
    })
  })

  // Auth was never captured — fee was never earned, so record a reversal entry
  // to keep PlatformRevenue balanced (negative = fee returned to user).
  await prisma.platformRevenue.create({
    data: {
      source: 'card_transaction_fee',
      amount: -platformFee,
      referenceId: card.id,
      description: `Card fee reversed · auth ${authorization.id} · £${amountGBP.toFixed(2)}`,
    },
  }).catch(err => console.warn('[issuing] Could not record fee reversal:', err))
}

async function handleChargeDispute(
  dispute: Stripe.Dispute,
  stripe: ReturnType<typeof ensureStripe>,
) {
  // Retrieve the charge to get the payment intent and metadata
  const charge = await stripe.charges.retrieve(
    typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id,
    { expand: ['payment_intent'] }
  )
  const pi = charge.payment_intent as Stripe.PaymentIntent | null
  if (!pi) {
    console.warn('[dispute] No payment intent on charge:', charge.id)
    return
  }

  const meta = pi.metadata ?? {}
  const disputeAmount = dispute.amount / 100

  // ── Ticket purchase dispute ───────────────────────────────────────────────
  if (meta['eventId'] && meta['userId']) {
    // Delete tickets from this payment so the buyer cannot use them after
    // getting their money back. Ticket model has no status field — deletion
    // is the correct revocation mechanism.
    await prisma.ticket.deleteMany({
      where: { stripePaymentId: pi.id },
    })

    // The application_fee is clawed back by Stripe automatically on Connect disputes.
    // Record the lost revenue for accounting.
    const applicationFee = dispute.amount / 100  // approximate — actual fee is in balance tx
    await prisma.platformRevenue.create({
      data: {
        source: 'dispute_loss',
        amount: -applicationFee,
        referenceId: meta['userId'],
        description: `Chargeback on ticket purchase — charge ${charge.id}, event ${meta['eventId']}`,
      },
    })

    console.warn(`[dispute] Tickets revoked for payment ${pi.id}, event ${meta['eventId']}, user ${meta['userId']}`)
    return
  }

  // ── Wallet top-up dispute ─────────────────────────────────────────────────
  if (meta['type'] === 'wallet_topup' && meta['walletId']) {
    // Buyer got their money back from Stripe but still has wallet credit — claw it back
    const wallet = await prisma.wallet.findUnique({
      where: { id: meta['walletId'] },
      select: { id: true, balance: true },
    })
    let deduct = 0
    if (wallet) {
      deduct = Math.min(wallet.balance.toNumber(), disputeAmount)
      if (deduct > 0) {
        await prisma.$transaction([
          prisma.wallet.update({
            where: { id: wallet.id },
            data: { balance: { decrement: deduct } },
          }),
          prisma.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: 'CARD_REFUND',
              amount: -deduct,
              balanceAfter: wallet.balance.toNumber() - deduct,
              description: `Chargeback clawback — disputed top-up ${charge.id}`,
              status: 'COMPLETED',
            },
          }),
        ])
      }
    }

    await prisma.platformRevenue.create({
      data: {
        source: 'dispute_loss',
        amount: -disputeAmount,
        referenceId: meta['userId'] ?? '',
        description: `Chargeback on wallet top-up — charge ${charge.id}`,
      },
    })

    console.warn(`[dispute] Wallet clawback £${deduct} for top-up dispute ${charge.id}`)
    return
  }

  // ── Unknown charge type — log for manual review ───────────────────────────
  console.warn(`[dispute] Unhandled dispute on charge ${charge.id}, PI type: ${meta['type'] ?? 'unknown'}`, dispute)
}

/**
 * Subscription renewal payment failed.
 *
 * Stripe fires this on every failed attempt (typically 4 over ~1 week) before
 * eventually issuing customer.subscription.deleted. We:
 *   • Notify the user to update their payment method on the first failure.
 *   • Proactively downgrade / cancel on the 3rd+ attempt so the UI reflects
 *     the degraded state before Stripe formally deletes the subscription — this
 *     avoids a window where the user still sees paid-tier features while Stripe
 *     is in retry limbo.
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  // Mirror the subscription ID extraction pattern used in handleInvoicePaid.
  const subscriptionId: string | null | undefined =
    (invoice as any).parent?.subscription_details?.subscription
    ?? (invoice as any).subscription
  if (!subscriptionId) return

  const attemptCount = invoice.attempt_count ?? 1

  // ── Platform subscription ─────────────────────────────────────────────────
  const platformSub = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true, userId: true },
  })
  if (platformSub) {
    await sendNotificationToMany([platformSub.userId], {
      type: 'PAYMENT_FAILED',
      title: 'Payment failed',
      body: attemptCount >= 3
        ? 'Your subscription has been downgraded. Update your payment method to re-subscribe.'
        : 'Your subscription renewal failed. Please update your payment method to keep access.',
      data: { screen: 'pricing' },
    })
    // Proactive downgrade at 3rd attempt — customer.subscription.deleted will
    // also fire eventually and is idempotent, so double-applying is fine.
    if (attemptCount >= 3) {
      await prisma.subscription.update({
        where: { id: platformSub.id },
        data: { tier: 'FREE', stripeSubscriptionId: null, currentPeriodEnd: null },
      })
      await prisma.user.update({
        where: { id: platformSub.userId },
        data: { subscriptionTier: 'FREE' },
      })
      // H4 mirror: clear featured flag on future events
      await prisma.event.updateMany({
        where: { hostId: platformSub.userId, isFeatured: true, startsAt: { gte: new Date() } },
        data: { isFeatured: false },
      })
    }
    return
  }

  // ── Group subscription ────────────────────────────────────────────────────
  const groupSub = await prisma.groupSubscription.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true, userId: true, groupId: true },
  })
  if (groupSub) {
    const group = await prisma.groupChat.findUnique({
      where: { id: groupSub.groupId },
      select: { name: true },
    })
    const groupName = group?.name ?? 'the group'
    await sendNotificationToMany([groupSub.userId], {
      type: 'PAYMENT_FAILED',
      title: 'Payment failed',
      body: attemptCount >= 3
        ? `Your membership to ${groupName} has been cancelled due to payment failure.`
        : `Payment for ${groupName} membership failed. Update your payment method to keep access.`,
      data: { groupId: groupSub.groupId, screen: 'group' },
    })
    return
  }

  // ── Venue sponsorship ─────────────────────────────────────────────────────
  const sponsoredVenue = await prisma.venue.findFirst({
    where: { stripeVenueSubId: subscriptionId },
    select: { id: true, claimedById: true, name: true },
  })
  if (sponsoredVenue?.claimedById) {
    await sendNotificationToMany([sponsoredVenue.claimedById], {
      type: 'PAYMENT_FAILED',
      title: 'Venue spotlight payment failed',
      body: attemptCount >= 3
        ? `Spotlight for ${sponsoredVenue.name} has been cancelled due to payment failure.`
        : `Payment for ${sponsoredVenue.name} spotlight failed. Update your payment method to keep your listing boosted.`,
      data: { venueId: sponsoredVenue.id, screen: 'venue' },
    })
    // Revoke spotlight proactively after 3 failures
    if (attemptCount >= 3) {
      await prisma.venue.update({
        where: { id: sponsoredVenue.id },
        data: { isSponsored: false, sponsoredUntil: null, stripeVenueSubId: null },
      })
    }
  }
}

/**
 * Dispute resolved in the platform's favour.
 *
 * Stripe returns the disputed funds to the platform. We reverse the clawback
 * recorded in handleChargeDispute:
 *   • Wallet top-up: restore the deducted balance (capped at MAX_BALANCE).
 *   • Ticket purchase: tickets were deleted and cannot be auto-restored — notify
 *     the user to contact support for re-issue.
 * In both cases we record a positive PlatformRevenue entry to offset the
 * negative dispute_loss written at dispute creation.
 */
async function handleDisputeWon(
  dispute: Stripe.Dispute,
  stripe: ReturnType<typeof ensureStripe>,
) {
  const charge = await stripe.charges.retrieve(
    typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id,
    { expand: ['payment_intent'] },
  )
  const pi = charge.payment_intent as Stripe.PaymentIntent | null
  if (!pi) {
    console.warn('[dispute:won] No payment intent on charge:', charge.id)
    return
  }

  const meta = pi.metadata ?? {}
  const restoredAmountGBP = dispute.amount / 100

  // ── Wallet top-up — restore clawed-back balance ───────────────────────────
  if (meta['type'] === 'wallet_topup' && meta['walletId']) {
    const wallet = await prisma.wallet.findUnique({
      where: { id: meta['walletId'] },
      select: { id: true, balance: true },
    })
    if (wallet) {
      const headroom = Math.max(0, WALLET_CONFIG.MAX_BALANCE - wallet.balance.toNumber())
      const toRestore = Number(Math.min(restoredAmountGBP, headroom).toFixed(2))

      if (toRestore > 0) {
        const updated = await prisma.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: toRestore } },
        })
        await prisma.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'TOP_UP',
            amount: toRestore,
            balanceAfter: updated.balance,
            description: `Dispute won — balance restored (charge ${charge.id})`,
            status: 'COMPLETED',
          },
        })
      }

      if (meta['userId']) {
        await sendNotificationToMany([meta['userId']], {
          type: 'PAYMENT_FAILED',
          title: 'Dispute resolved in your favour',
          body: toRestore > 0
            ? `Your dispute was upheld and £${toRestore.toFixed(2)} has been restored to your wallet.`
            : 'Your dispute was upheld. Your wallet was already at the maximum balance so no further credit was added.',
          data: { screen: 'wallet' },
        })
      }
    }

    // Offset the negative dispute_loss recorded in handleChargeDispute
    await prisma.platformRevenue.create({
      data: {
        source: 'dispute_recovery',
        amount: restoredAmountGBP,
        referenceId: meta['userId'] ?? '',
        description: `Dispute won — wallet top-up · charge ${charge.id}`,
      },
    })
    return
  }

  // ── Ticket purchase — cannot auto-restore deleted tickets ─────────────────
  if (meta['eventId'] && meta['userId']) {
    await sendNotificationToMany([meta['userId']], {
      type: 'PAYMENT_FAILED',
      title: 'Dispute resolved in your favour',
      body: 'Your chargeback dispute was upheld. Please contact support to have your tickets re-issued.',
      data: { eventId: meta['eventId'], screen: 'support' },
    })

    await prisma.platformRevenue.create({
      data: {
        source: 'dispute_recovery',
        amount: restoredAmountGBP,
        referenceId: meta['userId'],
        description: `Dispute won — ticket purchase · charge ${charge.id}, event ${meta['eventId']}`,
      },
    })
    return
  }

  console.warn(
    `[dispute:won] Unhandled dispute win on charge ${charge.id}, PI type: ${meta['type'] ?? 'unknown'}`,
    dispute,
  )
}

export default router
