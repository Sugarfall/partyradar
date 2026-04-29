import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { ensureStripe, platformFeeCents, getOrCreateStripeCustomer } from '../lib/stripe'
import { z } from 'zod'

const router = Router()

const eventSelect = {
  id: true, name: true, type: true, startsAt: true,
  neighbourhood: true, address: true, coverImageUrl: true,
  showNeighbourhoodOnly: true, stripePriceId: true, price: true,
  hostId: true, ticketsRemaining: true,
}

/** POST /api/tickets/checkout — create Stripe Checkout session.
 *
 *  Funds flow directly to the host's connected Stripe account via
 *  `transfer_data.destination` + `on_behalf_of`. We take our cut as an
 *  `application_fee_amount`. Host must have completed Connect Express
 *  onboarding (charges_enabled) before any tickets can sell.
 */
router.post('/checkout', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({ eventId: z.string(), quantity: z.number().int().min(1).max(10).default(1) })
  try {
    const stripe = ensureStripe()
    const { eventId, quantity } = schema.parse(req.body)
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: eventSelect })
    if (!event) throw new AppError('Event not found', 404)
    if (!event.stripePriceId) throw new AppError('Event does not have tickets', 400)
    if (event.ticketsRemaining < quantity) throw new AppError('Not enough tickets remaining', 400)

    // Check if host has Stripe Connect fully set up.
    // If not, we still allow the purchase but funds land on the platform account
    // instead of being split — this keeps ticket sales working in dev/test and
    // for hosts who haven't yet completed Connect onboarding.
    const host = await prisma.user.findUnique({
      where: { id: event.hostId },
      select: {
        stripeConnectAccountId: true,
        stripeConnectChargesEnabled: true,
      },
    })
    const hostConnectReady = !!(host?.stripeConnectAccountId && host?.stripeConnectChargesEnabled)

    const userId = req.user!.dbUser.id
    const stripeCustomerId = await getOrCreateStripeCustomer(userId, req.user!.dbUser.email, prisma)

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{ price: event.stripePriceId, quantity }],
      mode: 'payment',
      success_url: `${process.env['FRONTEND_URL'] || 'https://partyradar-web.vercel.app'}/checkout/success?session_id={CHECKOUT_SESSION_ID}&event_id=${eventId}`,
      cancel_url: `${process.env['FRONTEND_URL'] || 'https://partyradar-web.vercel.app'}/events/${eventId}`,
      metadata: { eventId, userId, quantity: String(quantity), hostId: event.hostId },
      // Only route via Connect when the host has completed Stripe onboarding.
      // Without Connect the transaction settles to the platform account.
      ...(hostConnectReady ? {
        payment_intent_data: {
          application_fee_amount: platformFeeCents(event.price, quantity),
          on_behalf_of: host!.stripeConnectAccountId!,
          transfer_data: { destination: host!.stripeConnectAccountId! },
        },
      } : {}),
    })

    res.json({ data: { url: session.url, sessionId: session.id } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/tickets/my — user's tickets
 *  QR codes are rendered client-side to keep the response fast even when a
 *  user has many tickets (server-side PNG encoding was O(n) blocking CPU).
 */
router.get('/my', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const tickets = await prisma.ticket.findMany({
      where: { userId: req.user!.dbUser.id },
      include: { event: { select: eventSelect } },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ data: tickets })
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

    res.json({ data: ticket })
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
