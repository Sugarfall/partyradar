import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { ensureStripe } from '../lib/stripe'
import { PUSH_BLAST_TIERS } from '@partyradar/shared'

const router = Router()

// POST /api/blast — create Stripe checkout for push blast, then schedule notification
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const stripe = ensureStripe()
    const { eventId, tierId, message } = req.body as { eventId: string; tierId: string; message: string }
    const userId = req.user!.dbUser.id

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== userId) throw new AppError('Forbidden', 403)

    const tier = PUSH_BLAST_TIERS.find(t => t.id === tierId)
    if (!tier) throw new AppError('Invalid blast tier', 400)

    // Create Stripe checkout for blast payment
    const session = await stripe.checkout.sessions.create({
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
      success_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/events/${eventId}?blast=success`,
      cancel_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/events/${eventId}`,
      metadata: { type: 'push_blast', eventId, tierId, message: message.slice(0, 200), userId },
    })

    res.json({ data: { url: session.url } })
  } catch (err) { next(err) }
})

export default router
