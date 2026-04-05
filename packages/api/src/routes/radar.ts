import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { sendNotification, haversineDistance } from '../lib/fcm'
import { CELEBRITY_LIST, TIERS } from '@partyradar/shared'
import type { SubscriptionTier } from '@partyradar/shared'
import { z } from 'zod'

const EXPIRY_HOURS = Number(process.env['CELEBRITY_EXPIRY_HOURS'] ?? 6)

const router = Router()

const reporterSelect = {
  id: true, username: true, displayName: true,
  photoUrl: true, ageVerified: true, alcoholFriendly: true, subscriptionTier: true,
}

/** GET /api/radar/celebrities — autocomplete */
router.get('/celebrities', (_req, res) => {
  res.json({ data: CELEBRITY_LIST })
})

/** GET /api/radar — active sightings */
router.get('/', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { lat, lng, radius = '10' } = req.query
    const now = new Date()

    const where: Record<string, unknown> = { expiresAt: { gte: now } }

    if (lat && lng) {
      const latN = Number(lat), lngN = Number(lng), radN = Number(radius)
      const latDelta = radN / 69
      const lngDelta = radN / (69 * Math.cos((latN * Math.PI) / 180))
      where['lat'] = { gte: latN - latDelta, lte: latN + latDelta }
      where['lng'] = { gte: lngN - lngDelta, lte: lngN + lngDelta }
    }

    const sightings = await prisma.celebritySighting.findMany({
      where,
      include: {
        reporter: { select: reporterSelect },
        votes: req.user ? { where: { userId: req.user.dbUser.id } } : false,
      },
      orderBy: { createdAt: 'desc' },
    })

    const data = sightings.map((s) => ({
      ...s,
      userVote: req.user && s.votes?.length
        ? (s.votes[0]!.isUpvote ? 'up' : 'down')
        : null,
      votes: undefined,
    }))

    res.json({ data })
  } catch (err) {
    next(err)
  }
})

/** POST /api/radar — create sighting */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({
    celebrity: z.string().min(2).max(100),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    description: z.string().max(500).optional(),
    photoUrl: z.string().url().optional(),
  })

  try {
    const user = req.user!.dbUser
    const tier = TIERS[user.subscriptionTier as SubscriptionTier]

    if (!tier.radar) {
      throw new AppError('Upgrade to Pro or Premium to use Celebrity Radar', 403, 'TIER_LIMIT')
    }

    const body = schema.parse(req.body)
    const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000)

    const sighting = await prisma.celebritySighting.create({
      data: { ...body, reporterId: user.id, expiresAt },
      include: { reporter: { select: reporterSelect } },
    })

    // Notify users within 2 miles who have radar access
    const nearby = await prisma.user.findMany({
      where: { subscriptionTier: { in: ['PRO', 'PREMIUM'] } },
      select: { id: true, fcmToken: true },
    })

    // In production, you'd store user last-known location. For now, send to all Pro+ users.
    const notifyIds = nearby
      .filter((u) => u.id !== user.id && u.fcmToken)
      .map((u) => u.id)

    await Promise.allSettled(
      notifyIds.map((userId) =>
        sendNotification({
          userId,
          type: 'CELEBRITY_NEARBY',
          title: `${body.celebrity} spotted nearby!`,
          body: body.description ?? `Tap to see where they were just seen`,
          data: { sightingId: sighting.id },
        })
      )
    )

    res.status(201).json({ data: { ...sighting, userVote: null } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/radar/:id/vote */
router.post('/:id/vote', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({ isUpvote: z.boolean() })
  try {
    const user = req.user!.dbUser
    const tier = TIERS[user.subscriptionTier as SubscriptionTier]
    if (!tier.radar) throw new AppError('Upgrade to Pro to vote on sightings', 403, 'TIER_LIMIT')

    const { isUpvote } = schema.parse(req.body)
    const sighting = await prisma.celebritySighting.findUnique({ where: { id: req.params['id'] } })
    if (!sighting) throw new AppError('Sighting not found', 404)
    if (new Date() > sighting.expiresAt) throw new AppError('Sighting has expired', 400)

    const existing = await prisma.sightingVote.findUnique({
      where: { sightingId_userId: { sightingId: sighting.id, userId: user.id } },
    })

    if (existing) {
      if (existing.isUpvote === isUpvote) {
        // Remove vote
        await prisma.sightingVote.delete({ where: { id: existing.id } })
        await prisma.celebritySighting.update({
          where: { id: sighting.id },
          data: isUpvote ? { upvotes: { decrement: 1 } } : { downvotes: { decrement: 1 } },
        })
      } else {
        // Change vote
        await prisma.sightingVote.update({ where: { id: existing.id }, data: { isUpvote } })
        await prisma.celebritySighting.update({
          where: { id: sighting.id },
          data: isUpvote
            ? { upvotes: { increment: 1 }, downvotes: { decrement: 1 } }
            : { upvotes: { decrement: 1 }, downvotes: { increment: 1 } },
        })
      }
    } else {
      await prisma.sightingVote.create({ data: { sightingId: sighting.id, userId: user.id, isUpvote } })
      await prisma.celebritySighting.update({
        where: { id: sighting.id },
        data: isUpvote ? { upvotes: { increment: 1 } } : { downvotes: { increment: 1 } },
      })
    }

    const updated = await prisma.celebritySighting.findUnique({
      where: { id: sighting.id },
      include: {
        reporter: { select: reporterSelect },
        votes: { where: { userId: user.id } },
      },
    })

    res.json({
      data: {
        ...updated,
        userVote: updated!.votes.length ? (updated!.votes[0]!.isUpvote ? 'up' : 'down') : null,
        votes: undefined,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
