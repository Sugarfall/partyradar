import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { stripe, platformFeeCents } from '../lib/stripe'
import QRCode from 'qrcode'
import { z } from 'zod'

const router = Router()

const eventSelect = {
  id: true, name: true, type: true, startsAt: true,
  neighbourhood: true, address: true, coverImageUrl: true,
  showNeighbourhoodOnly: true, stripePriceId: true, price: true,
  hostId: true, ticketsRemaining: true,
}

/** POST /api/tickets/checkout — create Stripe Checkout session */
router.post('/checkout', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({ eventId: z.string(), quantity: z.number().int().min(1).max(10).default(1) })
  try {
    const { eventId, quantity } = schema.parse(req.body)
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: eventSelect })
    if (!event) throw new AppError('Event not found', 404)
    if (!event.stripePriceId) throw new AppError('Event does not have tickets', 400)
    if (event.ticketsRemaining < quantity) throw new AppError('Not enough tickets remaining', 400)

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
      line_items: [{ price: event.stripePriceId, quantity }],
      mode: 'payment',
      success_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/events/${eventId}`,
      metadata: { eventId, userId, quantity: String(quantity) },
      payment_intent_data: {
        application_fee_amount: platformFeeCents(event.price) * quantity,
      },
    })

    res.json({ data: { url: session.url, sessionId: session.id } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/tickets/my — user's tickets */
router.get('/my', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const tickets = await prisma.ticket.findMany({
      where: { userId: req.user!.dbUser.id },
      include: { event: { select: eventSelect } },
      orderBy: { createdAt: 'desc' },
    })

    const withQR = await Promise.all(
      tickets.map(async (t) => ({
        ...t,
        qrDataUrl: await QRCode.toDataURL(t.qrCode, { width: 300, margin: 2 }),
      }))
    )

    res.json({ data: withQR })
  } catch (err) {
    next(err)
  }
})

/** GET /api/tickets/:id */
router.get('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params['id'] },
      include: { event: { select: eventSelect } },
    })

    if (!ticket) throw new AppError('Ticket not found', 404)
    if (ticket.userId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    const qrDataUrl = await QRCode.toDataURL(ticket.qrCode, { width: 300, margin: 2 })
    res.json({ data: { ...ticket, qrDataUrl } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/tickets/scan — host scans a QR code */
router.post('/scan', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({ qrCode: z.string() })
  try {
    const { qrCode } = schema.parse(req.body)

    const ticket = await prisma.ticket.findUnique({
      where: { qrCode },
      include: {
        event: { select: { ...eventSelect, hostId: true } },
        user: { select: { id: true, displayName: true, username: true, photoUrl: true } },
      },
    })

    if (!ticket) throw new AppError('Invalid QR code', 404)
    if (ticket.event.hostId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)
    if (ticket.scannedAt) throw new AppError('Ticket already scanned', 409)

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { scannedAt: new Date() },
      include: { user: { select: { id: true, displayName: true, username: true, photoUrl: true } } },
    })

    res.json({ data: { valid: true, ticket: updated } })
  } catch (err) {
    next(err)
  }
})

export default router
