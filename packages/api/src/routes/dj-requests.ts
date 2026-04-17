import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()
const CREDIT_COST = 50 // wallet points per DJ request

/** POST /api/dj-requests — submit a song request */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
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
        },
      }),
    ])

    res.status(201).json({ data: { id: request.id, status: request.status, creditCost: CREDIT_COST } })
  } catch (err) { next(err) }
})

/** GET /api/dj-requests?eventId=&venueId= — list requests (host/DJ view) */
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { eventId, venueId } = req.query as { eventId?: string; venueId?: string }
    const where = eventId ? { eventId } : venueId ? { venueId } : {}
    const requests = await prisma.djRequest.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { displayName: true, photoUrl: true, username: true } } },
    })
    res.json({ data: requests })
  } catch (err) { next(err) }
})

/** PATCH /api/dj-requests/:id — update status (host only) */
router.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { status } = req.body as { status: 'APPROVED' | 'REJECTED' | 'PLAYED' }
    if (!['APPROVED', 'REJECTED', 'PLAYED'].includes(status)) throw new AppError('Invalid status', 400)

    const request = await prisma.djRequest.update({
      where: { id: req.params['id'] },
      data: { status },
    })

    // Refund if rejected
    if (status === 'REJECTED') {
      await prisma.wallet.update({
        where: { userId: request.userId },
        data: { rewardPoints: { increment: request.creditCost } },
      })
    }
    res.json({ data: request })
  } catch (err) { next(err) }
})

export default router
