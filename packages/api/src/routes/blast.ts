import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { ensureStripe } from '../lib/stripe'
import { PUSH_BLAST_TIERS, getTier } from '@partyradar/shared'
import { z } from 'zod'

const router = Router()

const blastSchema = z.object({
  eventId: z.string().min(1),
  tierId:  z.enum(['LOCAL', 'NEARBY', 'DISTRICT', 'CITY']),
  message: z.string().min(1, 'Message is required').max(200, 'Message too long (max 200 chars)'),
})

// POST /api/blast — create Stripe checkout for push blast, then schedule notification
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const stripe = ensureStripe()
    const parsed = blastSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(parsed.error.errors[0]?.message ?? 'Invalid request', 400)
    const { eventId, tierId, message } = parsed.data
    const userId = req.user!.dbUser.id

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== userId) throw new AppError('Forbidden', 403)

    // ── Tier gate: check subscription allows push blasts ─────────────────────
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true, stripeCustomerId: true },
    })
    const userTierConfig = getTier(userRecord?.subscriptionTier)
    const blastLimit = userTierConfig.pushBlastsPerMonth

    if (blastLimit === 0) {
      throw new AppError(
        'Push blasts are not available on your current plan. Upgrade to Pro or Premium to send push blasts.',
        403,
      )
    }

    if (blastLimit > 0) {
      // Count blasts already sent this calendar month
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const blastsSentThisMonth = await prisma.pushBlast.count({
        where: {
          hostId: userId,
          createdAt: { gte: startOfMonth },
        },
      })

      if (blastsSentThisMonth >= blastLimit) {
        throw new AppError(
          `You have reached your monthly push blast limit (${blastLimit}). Your allowance resets at the start of next month.`,
          403,
        )
      }
    }
    // blastLimit === -1 means unlimited — no further check needed

    const tier = PUSH_BLAST_TIERS.find(t => t.id === tierId)
    if (!tier) throw new AppError('Invalid blast tier', 400)

    // Ensure a Stripe customer exists so the checkout is linked to the user's
    // billing profile (previously the session was anonymous — no customer field).
    let stripeCustomerId = userRecord?.stripeCustomerId ?? null
    if (!stripeCustomerId) {
      const dbUser = req.user!.dbUser
      const customer = await stripe.customers.create({ email: dbUser.email, metadata: { userId } })
      stripeCustomerId = customer.id
      await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId } })
    }

    // Create Stripe checkout for blast payment
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          unit_amount: Math.round(tier.price * 100),
          product_data: { name: `PartyRadar Push Blast — ${tier.label}`, description: `Notify ${tier.reach} nearby users` },
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env['FRONTEND_URL'] ?? 'https://partyradar-web.vercel.app'}/events/${eventId}?blast=success`,
      cancel_url: `${process.env['FRONTEND_URL'] ?? 'https://partyradar-web.vercel.app'}/events/${eventId}`,
      metadata: { type: 'push_blast', eventId, tierId, message: message.slice(0, 200), userId },
    })

    res.json({ data: { url: session.url } })
  } catch (err) { next(err) }
})

export default router
