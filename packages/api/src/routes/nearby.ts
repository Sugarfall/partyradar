import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

/** PUT /api/nearby/location */
router.put('/location', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { lat, lng } = req.body as { lat: number; lng: number }
    if (typeof lat !== 'number' || typeof lng !== 'number') throw new AppError('lat/lng required', 400)
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new AppError('Invalid coordinates', 400)

    await prisma.user.update({
      where: { id: userId },
      data: { lastLat: lat, lastLng: lng, lastKnownLat: lat, lastKnownLng: lng, lastSeenAt: new Date() },
    })
    res.json({ data: { ok: true } })
  } catch (err) { next(err) }
})

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** GET /api/nearby/people */
router.get('/people', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.dbUser.id ?? null
    const lat = Number(req.query['lat'])
    const lng = Number(req.query['lng'])
    if (isNaN(lat) || isNaN(lng)) throw new AppError('lat/lng required', 400)

    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const DELTA = 0.02

    const users = await prisma.user.findMany({
      where: {
        lastLat: { gte: lat - DELTA, lte: lat + DELTA },
        lastLng: { gte: lng - DELTA, lte: lng + DELTA },
        lastSeenAt: { gte: cutoff },
        id: { not: userId ?? 'none' },
        showInNearby: true,
      },
      select: {
        id: true, displayName: true, username: true, photoUrl: true,
        lastLat: true, lastLng: true, lastSeenAt: true, gender: true, bio: true,
      },
      take: 30,
    })

    const followedIds = userId ? new Set(
      (await prisma.follow.findMany({
        where: { followerId: userId, followingId: { in: users.map(u => u.id) } },
        select: { followingId: true },
      })).map(f => f.followingId)
    ) : new Set<string>()

    const data = users
      .map(u => ({
        id: u.id, displayName: u.displayName, username: u.username,
        photoUrl: u.photoUrl, bio: u.bio, gender: u.gender,
        distanceM: Math.round(distanceM(lat, lng, u.lastLat!, u.lastLng!)),
        lastSeenAt: u.lastSeenAt?.toISOString(),
        isFollowing: followedIds.has(u.id),
      }))
      .filter(u => u.distanceM <= 2000)
      .sort((a, b) => a.distanceM - b.distanceM)

    res.json({ data })
  } catch (err) { next(err) }
})

export default router
