import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, requireTier } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()
const CREDIT_COST = 50 // wallet points per DJ request

/** POST /api/dj-requests — submit a song request */
router.post('/', requireAuth, requireTier('BASIC', 'DJ Song Requests'), async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { eventId, venueId, song, artist, message } = req.body as {
      eventId?: string; venueId?: string; song: string; artist?: string; message?: string
    }
    if (!song?.trim()) throw new AppError('Song name required', 400)
    if (!eventId && !venueId) throw new AppError('eventId or venueId required', 400)

    // Deduct credits from wallet
    const wallet = await prisma.wallet.findUnique({ where: { userId } })
    if (!wallet || wallet.rewardPoints < CREDIT_COST) {
      throw new AppError(`Insufficient credits — ${CREDIT_COST} points required`, 402)
    }

    const [, request] = await prisma.$transaction([
      prisma.wallet.update({
        where: { userId },
        data: { rewardPoints: { decrement: CREDIT_COST } },
      }),
      prisma.djRequest.create({
        data: {
          userId, eventId: eventId ?? null, venueId: venueId ?? null,
          song: song.trim().slice(0, 100),
          artist: artist?.trim().slice(0, 80) ?? null,
          message: message?.trim().slice(0, 200) ?? null,
          creditCost: CREDIT_COST,
          walletPaid: true,   // reward-point deduction above counts as wallet payment
        },
      }),
    ])

    res.status(201).json({ data: { id: request.id, status: request.status, creditCost: CREDIT_COST } })
  } catch (err) { next(err) }
})

/** GET /api/dj-requests?eventId=&venueId= — list requests (host/venue-owner view only)
 *
 *  Security: only the event host or the venue's claimed owner may fetch the
 *  queue. Without this check any authenticated user could enumerate song
 *  requests (and the requesters' identity) for any event.
 */
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { eventId, venueId } = req.query as { eventId?: string; venueId?: string }

    if (!eventId && !venueId) throw new AppError('eventId or venueId required', 400)

    // Verify the caller owns the event or venue before exposing the queue
    if (eventId) {
      const event = await prisma.event.findUnique({ where: { id: eventId }, select: { hostId: true } })
      if (!event) throw new AppError('Event not found', 404)
      if (event.hostId !== userId) throw new AppError('Forbidden', 403)
    } else {
      const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { claimedById: true } })
      if (!venue) throw new AppError('Venue not found', 404)
      if (venue.claimedById !== userId) throw new AppError('Forbidden', 403)
    }

    const where = eventId ? { eventId } : { venueId: venueId! }
    const requests = await prisma.djRequest.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { displayName: true, photoUrl: true, username: true } } },
    })
    res.json({ data: requests })
  } catch (err) { next(err) }
})

/** PATCH /api/dj-requests/:id — update status (host/venue-owner only)
 *
 *  Security fixes:
 *  1. Verifies the caller is the event host or venue owner before allowing
 *     any status change — previously any authed user could approve/reject
 *     any request, effectively stealing wallet credits from other users.
 *  2. The refund (REJECTED) is now inside the same Prisma transaction as the
 *     status update, and only fires when transitioning from PENDING → REJECTED.
 *     Previously the two writes were separate, creating a race window where a
 *     concurrent retry could double-credit the requester's wallet.
 */
router.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { status } = req.body as { status: 'APPROVED' | 'REJECTED' | 'PLAYED' }
    if (!['APPROVED', 'REJECTED', 'PLAYED'].includes(status)) throw new AppError('Invalid status', 400)

    const result = await prisma.$transaction(async (tx) => {
      // Fetch first so we can check ownership and the current status
      const request = await tx.djRequest.findUnique({ where: { id: req.params['id'] } })
      if (!request) throw new AppError('DJ request not found', 404)

      // Verify caller is the event host or claimed venue owner
      if (request.eventId) {
        const event = await tx.event.findUnique({ where: { id: request.eventId }, select: { hostId: true } })
        if (!event || event.hostId !== userId) throw new AppError('Forbidden', 403)
      } else if (request.venueId) {
        const venue = await tx.venue.findUnique({ where: { id: request.venueId }, select: { claimedById: true } })
        if (!venue || venue.claimedById !== userId) throw new AppError('Forbidden', 403)
      } else {
        throw new AppError('Forbidden', 403)
      }

      // Guard: only refund on PENDING → REJECTED to prevent double-credit on retries
      const shouldRefund = status === 'REJECTED' && request.status === 'PENDING'

      const updated = await tx.djRequest.update({
        where: { id: request.id },
        data: { status },
      })

      if (shouldRefund) {
        await tx.wallet.update({
          where: { userId: request.userId },
          data: { rewardPoints: { increment: request.creditCost } },
        })
      }

      return updated
    })

    res.json({ data: result })
  } catch (err) { next(err) }
})

export default router
