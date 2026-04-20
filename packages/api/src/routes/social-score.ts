import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

const VALID_CATEGORIES = ['vibe', 'punctuality', 'friendliness', 'host_quality']

// ── Proximity helpers ─────────────────────────────────────────────────────────

/** Haversine distance between two GPS points, in metres */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const PROXIMITY_RADIUS_M = 1000  // 1 km
const PROXIMITY_WINDOW_H = 12    // last 12 hours

/**
 * Returns true if the target user (toUserId) has been within PROXIMITY_RADIUS_M
 * of the given coordinates in the last PROXIMITY_WINDOW_H hours, based on:
 *   1. Their check-ins at events/venues whose coordinates are near (lat, lng)
 *   2. Both users being confirmed guests at the same event in the same window
 */
async function wasNearby(
  fromUserId: string,
  toUserId: string,
  fromLat: number,
  fromLng: number,
): Promise<boolean> {
  const since = new Date(Date.now() - PROXIMITY_WINDOW_H * 3_600_000)

  // ── Check 1: B's check-ins near A's current location ─────────────────────
  const bCheckIns = await prisma.checkIn.findMany({
    where: { userId: toUserId, createdAt: { gte: since } },
    include: {
      event: { select: { lat: true, lng: true } },
      venue: { select: { lat: true, lng: true } },
    },
  })

  for (const ci of bCheckIns) {
    const lat = ci.event?.lat ?? ci.venue?.lat
    const lng = ci.event?.lng ?? ci.venue?.lng
    if (lat == null || lng == null) continue
    if (haversineMeters(fromLat, fromLng, lat, lng) <= PROXIMITY_RADIUS_M) return true
  }

  // ── Check 2: shared event attendance ─────────────────────────────────────
  // Both users confirmed at the same event (started or ends within window)
  const aEvents = await prisma.eventGuest.findMany({
    where: {
      userId: fromUserId,
      status: 'CONFIRMED',
      event: { startsAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
    },
    select: { eventId: true },
  })
  const aEventIds = aEvents.map((g) => g.eventId)

  if (aEventIds.length > 0) {
    const sharedEvent = await prisma.eventGuest.findFirst({
      where: { userId: toUserId, status: 'CONFIRMED', eventId: { in: aEventIds } },
    })
    if (sharedEvent) return true
  }

  return false
}

/** GET /api/social-score/:username — get public social score + feedback */
router.get('/:username', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params['username'] },
      select: { id: true, socialScore: true },
    })
    if (!user) throw new AppError('User not found', 404)

    const feedback = await prisma.anonymousFeedback.findMany({
      where: { toUserId: user.id, isHidden: false },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { category: true, score: true, comment: true, createdAt: true },
    })

    const avgByCategory: Record<string, number> = {}
    for (const cat of VALID_CATEGORIES) {
      const items = feedback.filter(f => f.category === cat)
      if (items.length > 0) avgByCategory[cat] = Math.round(items.reduce((s, f) => s + f.score, 0) / items.length * 10) / 10
    }

    res.json({ data: { socialScore: user.socialScore, avgByCategory, recentFeedback: feedback } })
  } catch (err) { next(err) }
})

/** POST /api/social-score/:userId/feedback — leave anonymous feedback */
router.post('/:userId/feedback', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const fromUserId = req.user!.dbUser.id
    const toUserId = req.params['userId']
    if (fromUserId === toUserId) throw new AppError('Cannot rate yourself', 400)

    const { category, score, comment, lat, lng } = req.body as {
      category: string; score: number; comment?: string
      lat?: number; lng?: number
    }
    if (!VALID_CATEGORIES.includes(category)) throw new AppError('Invalid category', 400)
    if (typeof score !== 'number' || score < 1 || score > 5) throw new AppError('Score must be 1–5', 400)
    if (comment && comment.length > 300) throw new AppError('Comment too long (max 300 chars)', 400)

    // ── Proximity check ───────────────────────────────────────────────────────
    // Require GPS coordinates from the submitter
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new AppError('Location required — enable GPS to leave feedback', 403, 'LOCATION_REQUIRED')
    }

    const nearby = await wasNearby(fromUserId, toUserId, lat, lng)
    if (!nearby) {
      throw new AppError(
        'You can only leave feedback on people you\'ve been near recently. Check in to an event or venue first.',
        403,
        'NOT_NEARBY',
      )
    }
    // ─────────────────────────────────────────────────────────────────────────

    const target = await prisma.user.findUnique({ where: { id: toUserId } })
    if (!target) throw new AppError('User not found', 404)

    // Rate limit: one feedback per from→to pair per 24h
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recent = await prisma.anonymousFeedback.findFirst({
      where: { fromUserId, toUserId, createdAt: { gte: dayAgo } },
    })
    if (recent) throw new AppError('You can only leave feedback once per 24 hours per person', 429)

    await prisma.anonymousFeedback.create({
      data: { fromUserId, toUserId, category, score, comment: comment?.trim().slice(0, 300) ?? null },
    })

    // Recompute social score: sum of all scores * 10 (unbounded — acts as leaderboard)
    const allScores = await prisma.anonymousFeedback.aggregate({
      where: { toUserId, isHidden: false },
      _sum: { score: true },
    })
    const newScore = ((allScores._sum?.score) ?? 0) * 10
    await prisma.user.update({ where: { id: toUserId }, data: { socialScore: newScore } })

    res.status(201).json({ data: { ok: true } })
  } catch (err) { next(err) }
})

/** POST /api/social-score/feedback/:id/report */
router.post('/feedback/:id/report', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const fb = await prisma.anonymousFeedback.findUnique({ where: { id: req.params['id'] } })
    if (!fb) throw new AppError('Feedback not found', 404)
    await prisma.anonymousFeedback.update({
      where: { id: fb.id },
      data: { reportCount: { increment: 1 }, isHidden: fb.reportCount + 1 >= 3 },
    })
    res.json({ data: { ok: true } })
  } catch (err) { next(err) }
})

export default router
