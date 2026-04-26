import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { ensureStripe } from '../lib/stripe'
import { PUSH_BLAST_TIERS } from '@partyradar/shared'
import { z } from 'zod'

const router = Router()

/** GET /api/notifications */
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const page = Math.max(1, Number(req.query['page'] ?? 1))
    const limit = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 20)))
    const skip = (page - 1) * limit

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.dbUser.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId: req.user!.dbUser.id } }),
    ])

    const unreadCount = await prisma.notification.count({
      where: { userId: req.user!.dbUser.id, read: false },
    })

    res.json({ data: notifications, total, page, limit, hasMore: skip + notifications.length < total, unreadCount })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/notifications/:id/read */
router.put('/:id/read', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const notif = await prisma.notification.findUnique({ where: { id: req.params['id'] } })
    if (!notif) throw new AppError('Notification not found', 404)
    if (notif.userId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    await prisma.notification.update({ where: { id: notif.id }, data: { read: true } })
    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/notifications/read-all */
router.put('/read-all', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.dbUser.id, read: false },
      data: { read: true },
    })
    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/notifications/location — update user's last known location for geo-targeted blasts */
router.put('/location', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  try {
    const { lat, lng } = schema.parse(req.body)
    // Write both column pairs: lastKnownLat/lastKnownLng (push blasts, match, go-out)
    // and lastLat/lastLng (nearby users feature) so both features stay in sync.
    await prisma.user.update({
      where: { id: req.user!.dbUser.id },
      data: { lastKnownLat: lat, lastKnownLng: lng, lastLat: lat, lastLng: lng },
    })
    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/notifications/fcm-token */
router.post('/fcm-token', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({ token: z.string().min(10) })
  try {
    const { token } = schema.parse(req.body)
    await prisma.user.update({ where: { id: req.user!.dbUser.id }, data: { fcmToken: token } })
    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/notifications/blast
 *  Host initiates a paid push-blast for an event. Creates a Stripe one-time
 *  checkout. On success the webhook fires the actual FCM blast.
 */
router.post('/blast', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({
    eventId:  z.string().min(1),
    tierId:   z.enum(['LOCAL', 'NEARBY', 'DISTRICT', 'CITY']),
    message:  z.string().min(1).max(120),
  })
  try {
    const stripe = ensureStripe()
    const { eventId, tierId, message } = schema.parse(req.body)

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    const tier = PUSH_BLAST_TIERS.find((t) => t.id === tierId)
    if (!tier) throw new AppError('Unknown blast tier', 400)

    const userId = req.user!.dbUser.id
    let stripeCustomerId = (
      await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } })
    )?.stripeCustomerId

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({ email: req.user!.dbUser.email })
      stripeCustomerId = customer.id
      await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId } })
    }

    const amountPence = Math.round(tier.price * 100)

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          unit_amount: amountPence,
          product_data: {
            name: `Push Blast — ${tier.label}`,
            description: `Notify ${tier.reach} near "${event.name}"`,
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env['FRONTEND_URL'] ?? 'https://partyradar-web.vercel.app'}/events/${eventId}?blast=sent`,
      cancel_url:  `${process.env['FRONTEND_URL'] ?? 'https://partyradar-web.vercel.app'}/events/${eventId}`,
      metadata: {
        type:    'push_blast',
        eventId,
        userId,
        tierId,
        message,
      },
    })

    res.json({ data: { url: session.url } })
  } catch (err) {
    next(err)
  }
})

export default router
