import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { z } from 'zod'

const router = Router()

const reviewSchema = z.object({
  eventId: z.string(),
  rating: z.number().int().min(1).max(5),
  vibeRating: z.number().int().min(1).max(5).optional(),
  musicRating: z.number().int().min(1).max(5).optional(),
  crowdRating: z.number().int().min(1).max(5).optional(),
  text: z.string().max(2000).optional(),
})

const userSelect = { id: true, username: true, displayName: true, photoUrl: true }

/** POST /api/reviews — create a review */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = reviewSchema.parse(req.body)
    const userId = req.user!.dbUser.id

    // Check event exists
    const event = await prisma.event.findUnique({
      where: { id: body.eventId },
      select: { id: true, hostId: true },
    })
    if (!event) throw new AppError('Event not found', 404)

    // Prevent duplicate reviews
    const existing = await prisma.eventReview.findUnique({
      where: { userId_eventId: { userId, eventId: body.eventId } },
    })
    if (existing) throw new AppError('You have already reviewed this event', 409)

    const review = await prisma.eventReview.create({
      data: {
        userId,
        eventId: body.eventId,
        rating: body.rating,
        vibeRating: body.vibeRating ?? null,
        musicRating: body.musicRating ?? null,
        crowdRating: body.crowdRating ?? null,
        text: body.text ?? null,
      },
      include: { user: { select: userSelect } },
    })

    // Recalculate hostRating: average of all ratings across all of this host's events
    const hostEvents = await prisma.event.findMany({
      where: { hostId: event.hostId },
      select: { id: true },
    })
    const hostEventIds = hostEvents.map((e) => e.id)

    const agg = await prisma.eventReview.aggregate({
      where: { eventId: { in: hostEventIds } },
      _avg: { rating: true },
    })

    if (agg._avg.rating !== null) {
      // Update all of the host's events with new hostRating
      await prisma.event.updateMany({
        where: { hostId: event.hostId },
        data: { hostRating: agg._avg.rating },
      })
    }

    res.status(201).json({ data: review })
  } catch (err) {
    next(err)
  }
})

/** GET /api/reviews/event/:eventId — reviews for an event with avg ratings */
router.get('/event/:eventId', async (req, res, next) => {
  try {
    const { eventId } = req.params
    const { page = '1', limit = '20' } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const [reviews, total, agg] = await Promise.all([
      prisma.eventReview.findMany({
        where: { eventId },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: userSelect } },
      }),
      prisma.eventReview.count({ where: { eventId } }),
      prisma.eventReview.aggregate({
        where: { eventId },
        _avg: { rating: true, vibeRating: true, musicRating: true, crowdRating: true },
      }),
    ])

    res.json({
      data: reviews,
      total,
      page: Number(page),
      limit: Number(limit),
      hasMore: skip + reviews.length < total,
      averages: {
        rating: agg._avg.rating,
        vibeRating: agg._avg.vibeRating,
        musicRating: agg._avg.musicRating,
        crowdRating: agg._avg.crowdRating,
      },
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/reviews/my — my reviews */
router.get('/my', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { page = '1', limit = '20' } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const [reviews, total] = await Promise.all([
      prisma.eventReview.findMany({
        where: { userId },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          event: {
            select: { id: true, name: true, startsAt: true, coverImageUrl: true },
          },
        },
      }),
      prisma.eventReview.count({ where: { userId } }),
    ])

    res.json({
      data: reviews,
      total,
      page: Number(page),
      limit: Number(limit),
      hasMore: skip + reviews.length < total,
    })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/reviews/:id — delete my review */
router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { id } = req.params

    const review = await prisma.eventReview.findUnique({
      where: { id },
      include: { event: { select: { hostId: true } } },
    })
    if (!review) throw new AppError('Review not found', 404)
    if (review.userId !== userId) throw new AppError('Forbidden', 403)

    const hostId = review.event.hostId
    const eventId = review.eventId

    await prisma.eventReview.delete({ where: { id } })

    // Recalculate hostRating after deletion
    const hostEvents = await prisma.event.findMany({
      where: { hostId },
      select: { id: true },
    })
    const hostEventIds = hostEvents.map((e) => e.id)

    const agg = await prisma.eventReview.aggregate({
      where: { eventId: { in: hostEventIds } },
      _avg: { rating: true },
    })

    await prisma.event.updateMany({
      where: { hostId },
      data: { hostRating: agg._avg.rating ?? null },
    })

    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

export default router
