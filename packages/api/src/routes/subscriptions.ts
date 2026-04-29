import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { ensureStripe, getOrCreateStripeCustomer } from '../lib/stripe'
import { HOST_TIERS } from '@partyradar/shared'
import { z } from 'zod'

const router = Router()

const PRICE_IDS: Record<string, string> = {
  BASIC: process.env['STRIPE_BASIC_PRICE_ID'] ?? '',
  PRO: process.env['STRIPE_PRO_PRICE_ID'] ?? '',
  PREMIUM: process.env['STRIPE_PREMIUM_PRICE_ID'] ?? '',
}

/** GET /api/subscriptions/plans
 *  Also returns `configured` — a per-tier flag indicating whether the
 *  corresponding Stripe price ID is set. Clients use this to show
 *  "Coming soon" instead of triggering a checkout that would 503. */
router.get('/plans', (_req, res) => {
  const configured: Record<string, boolean> = {
    FREE:    true, // free tier never needs a price ID
    BASIC:   !!PRICE_IDS['BASIC'],
    PRO:     !!PRICE_IDS['PRO'],
    PREMIUM: !!PRICE_IDS['PREMIUM'],
  }
  res.json({ data: HOST_TIERS, configured })
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
    const stripe = ensureStripe()
    const { tier } = schema.parse(req.body)
    const priceId = PRICE_IDS[tier]
    if (!priceId) throw new AppError(`The ${tier} subscription is not configured yet — try again later.`, 503)

    const userId = req.user!.dbUser.id
    // Use the shared helper which validates the stored Stripe customer still
    // exists and creates a fresh one if it doesn't (handles account/mode
    // switches where the stored cus_xxx no longer exists in Stripe).
    const stripeCustomerId = await getOrCreateStripeCustomer(
      userId, req.user!.dbUser.email, prisma,
    )

    // Use || rather than ?? so an empty-string FRONTEND_URL still falls back
    // to the production URL (an empty string is falsy but not null/undefined).
    const baseUrl = process.env['FRONTEND_URL'] || 'https://partyradar-web.vercel.app'

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${baseUrl}/subscriptions?success=true`,
      cancel_url: `${baseUrl}/subscriptions`,
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
    const stripe = ensureStripe()
    const userId = req.user!.dbUser.id

    // Use the same helper as /checkout so the customer always exists in Stripe.
    // Previously this was a raw lookup that threw 400 when stripeCustomerId was
    // null — blocking users who had never completed a paid checkout from managing
    // their subscription in the billing portal.
    const stripeCustomerId = await getOrCreateStripeCustomer(
      userId, req.user!.dbUser.email, prisma,
    )

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env['FRONTEND_URL'] || 'https://partyradar-web.vercel.app'}/settings`,
    })

    res.json({ data: { url: session.url } })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/subscriptions */
router.delete('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const stripe = ensureStripe()
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
