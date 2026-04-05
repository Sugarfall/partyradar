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

export default router
