import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { stripe } from '../lib/stripe'
import { TIERS } from '@partyradar/shared'
import { z } from 'zod'

const router = Router()

const PRICE_IDS: Record<string, string> = {
  BASIC: process.env['STRIPE_BASIC_PRICE_ID'] ?? '',
  PRO: process.env['STRIPE_PRO_PRICE_ID'] ?? '',
  PREMIUM: process.env['STRIPE_PREMIUM_PRICE_ID'] ?? '',
}

/** GET /api/subscriptions/plans */
router.get('/plans', (_req, res) => {
  res.json({ data: TIERS })
})

/** GET /api/subscriptions/status */
router.get('/status', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId: req.user!.dbUser.id },
    })
    res.json({ data: sub })
  } catch (err) {
    next(err)
  }
})

/** POST /api/subscriptions/checkout */
router.post('/checkout', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({ tier: z.enum(['BASIC', 'PRO', 'PREMIUM']) })
  try {
    const { tier } = schema.parse(req.body)
    const priceId = PRICE_IDS[tier]
    if (!priceId) throw new AppError('Subscription tier unavailable', 400)

    const userId = req.user!.dbUser.id
    let stripeCustomerId = (await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } }))?.stripeCustomerId

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({ email: req.user!.dbUser.email })
      stripeCustomerId = customer.id
      await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId } })
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/subscriptions?success=true`,
      cancel_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/subscriptions`,
      metadata: { userId, tier },
    })

    res.json({ data: { url: session.url } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/subscriptions/portal */
router.post('/portal', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.dbUser.id },
      select: { stripeCustomerId: true },
    })

    if (!user?.stripeCustomerId) throw new AppError('No billing account found', 400)

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/settings`,
    })

    res.json({ data: { url: session.url } })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/subscriptions */
router.delete('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const sub = await prisma.subscription.findUnique({ where: { userId: req.user!.dbUser.id } })
    if (!sub?.stripeSubscriptionId) throw new AppError('No active subscription', 400)

    await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true })
    await prisma.subscription.update({
      where: { userId: req.user!.dbUser.id },
      data: { cancelAtPeriodEnd: true },
    })

    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

export default router
