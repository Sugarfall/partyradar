import { Router } from 'express'
import type { Request, Response } from 'express'
import { prisma } from '@partyradar/db'
import { stripe } from '../lib/stripe'
import type Stripe from 'stripe'
import QRCode from 'qrcode'
import { v4 as uuidv4 } from 'uuid'
import { sendNotificationToMany } from '../lib/fcm'
import { PUSH_BLAST_TIERS } from '@partyradar/shared'
import { haversineDistance } from '../lib/fcm'

const router = Router()

/** POST /api/webhooks/stripe */
router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature']!
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      process.env['STRIPE_WEBHOOK_SECRET']!
    )
  } catch {
    res.status(400).send('Webhook signature verification failed')
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

  // Subscription checkout
  if (session.mode === 'subscription') {
    const { userId: subUserId, tier } = session.metadata ?? {}
    if (!subUserId || !tier) return

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
    return
  }

  // Ticket checkout
  if (!eventId || !userId || !quantity) return

  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) return

  const qty = Number(quantity)
  const pricePaid = event.price
  const platformFee = (pricePaid * Number(process.env['PLATFORM_FEE_PERCENT'] ?? 5)) / 100

  // Create ticket records
  for (let i = 0; i < qty; i++) {
    await prisma.ticket.create({
      data: {
        eventId,
        userId,
        qrCode: uuidv4(),
        stripePaymentId: session.payment_intent as string,
        stripeSessionId: session.id,
        pricePaid,
        platformFee,
      },
    })
  }

  // Decrement tickets remaining
  await prisma.event.update({
    where: { id: eventId },
    data: { ticketsRemaining: { decrement: qty } },
  })

  // Add as confirmed guest
  await prisma.eventGuest.upsert({
    where: { eventId_userId: { eventId, userId } },
    create: { eventId, userId, status: 'CONFIRMED' },
    update: { status: 'CONFIRMED' },
  })
}

async function handlePushBlastPaid(session: Stripe.Checkout.Session) {
  const { eventId, tierId, message } = session.metadata ?? {}
  if (!eventId || !tierId || !message) return

  const tier = PUSH_BLAST_TIERS.find((t) => t.id === tierId)
  if (!tier) return

  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) return

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

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return
  const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription as string)

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: stripeSub.id },
    data: { currentPeriodEnd: new Date(stripeSub.current_period_end * 1000) },
  })
}

async function handleSubscriptionUpdated(stripeSub: Stripe.Subscription) {
  const sub = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: stripeSub.id } })
  if (!sub) return

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    },
  })
}

async function handleSubscriptionDeleted(stripeSub: Stripe.Subscription) {
  const sub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: stripeSub.id } })
  if (!sub) return

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { tier: 'FREE', stripeSubscriptionId: null, currentPeriodEnd: null },
  })

  await prisma.user.update({
    where: { id: sub.userId },
    data: { subscriptionTier: 'FREE' },
  })
}

// ─── Wallet Top-Up ───────────────────────────────────────────────────────────

async function handleWalletTopUp(session: Stripe.Checkout.Session) {
  const { userId, walletId, topUpAmount, bonusPercent } = session.metadata ?? {}
  if (!userId || !walletId || !topUpAmount) return

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

export default router
