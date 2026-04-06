import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { z } from 'zod'

const router = Router()

const checkInSchema = z.object({
  eventId: z.string().optional(),
  venueId: z.string().optional(),
  crowdLevel: z.enum(['QUIET', 'BUSY', 'RAMMED']).optional(),
})

const userSelect = { id: true, username: true, displayName: true, photoUrl: true }
const eventSelect = { id: true, name: true, startsAt: true, address: true, neighbourhood: true, coverImageUrl: true }
const venueSelect = { id: true, name: true, address: true, photoUrl: true }

/** POST /api/checkins — check in to an event or venue */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = checkInSchema.parse(req.body)
    const userId = req.user!.dbUser.id

    if (!body.eventId && !body.venueId) {
      throw new AppError('Must provide eventId or venueId', 400)
    }

    // Prevent duplicate check-in within 1 hour for same event/venue
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentCheckIn = await prisma.checkIn.findFirst({
      where: {
        userId,
        createdAt: { gte: oneHourAgo },
        ...(body.eventId ? { eventId: body.eventId } : {}),
        ...(body.venueId && !body.eventId ? { venueId: body.venueId } : {}),
      },
    })
    if (recentCheckIn) {
      throw new AppError('Already checked in within the last hour', 409)
    }

    const checkIn = await prisma.checkIn.create({
      data: {
        userId,
        eventId: body.eventId ?? null,
        venueId: body.venueId ?? null,
        crowdLevel: body.crowdLevel ?? null,
      },
      include: {
        user: { select: userSelect },
        event: { select: eventSelect },
        venue: { select: venueSelect },
      },
    })

    res.status(201).json({ data: checkIn })
  } catch (err) {
    next(err)
  }
})

/** GET /api/checkins/my — my recent check-ins */
router.get('/my', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { page = '1', limit = '20' } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const [checkIns, total] = await Promise.all([
      prisma.checkIn.findMany({
        where: { userId },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          event: { select: eventSelect },
          venue: { select: venueSelect },
        },
      }),
      prisma.checkIn.count({ where: { userId } }),
    ])

    res.json({
      data: checkIns,
      total,
      page: Number(page),
      limit: Number(limit),
      hasMore: skip + checkIns.length < total,
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/checkins/event/:eventId — list check-ins for an event */
router.get('/event/:eventId', async (req, res, next) => {
  try {
    const { eventId } = req.params
    const { page = '1', limit = '20' } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const [checkIns, total] = await Promise.all([
      prisma.checkIn.findMany({
        where: { eventId },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: userSelect },
          venue: { select: venueSelect },
        },
      }),
      prisma.checkIn.count({ where: { eventId } }),
    ])

    res.json({
      data: checkIns,
      total,
      page: Number(page),
      limit: Number(limit),
      hasMore: skip + checkIns.length < total,
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/checkins/venue/:venueId — live check-ins for a venue (last 3h) */
router.get('/venue/:venueId', async (req, res, next) => {
  try {
    const { venueId } = req.params
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000)

    const checkIns = await prisma.checkIn.findMany({
      where: { venueId, createdAt: { gte: threeHoursAgo } },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: userSelect },
        event: { select: eventSelect },
      },
    })

    res.json({ data: checkIns })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/checkins/:id — remove my check-in */
router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { id } = req.params

    const checkIn = await prisma.checkIn.findUnique({ where: { id } })
    if (!checkIn) throw new AppError('Check-in not found', 404)
    if (checkIn.userId !== userId) throw new AppError('Forbidden', 403)

    await prisma.checkIn.delete({ where: { id } })
    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

export default router
