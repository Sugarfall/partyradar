import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../lib/auth'
import type { AuthRequest } from '../lib/auth'

const router = Router()

// Haversine distance in km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// GET /api/match/deck — up to 20 candidate profiles
router.get('/deck', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const me = req.user!
    const myUser = await prisma.user.findUnique({
      where: { id: me.id },
      select: { gender: true, lastKnownLat: true, lastKnownLng: true },
    })
    if (!myUser) return res.status(404).json({ error: { message: 'User not found' } })

    const targetGenders: string[] =
      myUser.gender === 'MALE' ? ['FEMALE'] :
      myUser.gender === 'FEMALE' ? ['MALE'] :
      ['MALE', 'FEMALE', 'NON_BINARY']

    const alreadySwiped = await prisma.swipeLike.findMany({
      where: { fromUserId: me.id },
      select: { toUserId: true },
    })
    const excludeIds = [me.id, ...alreadySwiped.map((s) => s.toUserId)]

    const candidates = await prisma.user.findMany({
      where: {
        id: { notIn: excludeIds },
        gender: { in: targetGenders as any },
        isBanned: false,
        photoUrl: { not: null },
      },
      select: {
        id: true,
        displayName: true,
        username: true,
        photoUrl: true,
        bio: true,
        interests: true,
        gender: true,
        lastKnownLat: true,
        lastKnownLng: true,
        lastSeenAt: true,
      },
      take: 40,
      orderBy: { lastSeenAt: 'desc' },
    })

    const withDistance = candidates.map((c) => {
      let distance: number | null = null
      if (myUser.lastKnownLat && myUser.lastKnownLng && c.lastKnownLat && c.lastKnownLng) {
        distance = Math.round(haversine(myUser.lastKnownLat, myUser.lastKnownLng, c.lastKnownLat, c.lastKnownLng))
      }
      return {
        id: c.id,
        displayName: c.displayName,
        username: c.username,
        photoUrl: c.photoUrl,
        bio: c.bio,
        interests: c.interests,
        gender: c.gender,
        distance,
        lastSeenAt: c.lastSeenAt,
      }
    })

    withDistance.sort((a, b) => {
      if (a.distance === null && b.distance === null) return 0
      if (a.distance === null) return 1
      if (b.distance === null) return -1
      return a.distance - b.distance
    })

    res.json({ data: withDistance.slice(0, 20) })
  } catch (err) {
    next(err)
  }
})

// POST /api/match/swipe — record a swipe, returns { match: boolean }
router.post('/swipe', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const me = req.user!
    const { toUserId, liked } = req.body as { toUserId: string; liked: boolean }
    if (!toUserId || typeof liked !== 'boolean') {
      return res.status(400).json({ error: { message: 'toUserId and liked are required' } })
    }

    await prisma.swipeLike.upsert({
      where: { fromUserId_toUserId: { fromUserId: me.id, toUserId } },
      create: { fromUserId: me.id, toUserId, liked },
      update: { liked },
    })

    let isMatch = false
    if (liked) {
      const mutual = await prisma.swipeLike.findFirst({
        where: { fromUserId: toUserId, toUserId: me.id, liked: true },
      })
      if (mutual) isMatch = true
    }

    // If it's a match, auto-open a DM conversation so they can message immediately
    let conversationId: string | null = null
    if (isMatch) {
      // Find or create a conversation between the two users
      const existing = await prisma.conversation.findFirst({
        where: {
          participants: {
            every: { userId: { in: [me.id, toUserId] } },
          },
          AND: [
            { participants: { some: { userId: me.id } } },
            { participants: { some: { userId: toUserId } } },
          ],
        },
        select: { id: true },
      })
      if (existing) {
        conversationId = existing.id
      } else {
        const convo = await prisma.conversation.create({
          data: {
            participants: {
              create: [
                { userId: me.id, isAccepted: true },
                { userId: toUserId, isAccepted: true },
              ],
            },
          },
        })
        conversationId = convo.id
      }
    }

    res.json({ data: { match: isMatch, conversationId } })
  } catch (err) {
    next(err)
  }
})

// GET /api/match/matches — get all mutual matches
router.get('/matches', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const me = req.user!

    const iLiked = await prisma.swipeLike.findMany({
      where: { fromUserId: me.id, liked: true },
      select: { toUserId: true },
    })
    const iLikedIds = iLiked.map((s) => s.toUserId)
    if (iLikedIds.length === 0) return res.json({ data: [] })

    const theyLikedMe = await prisma.swipeLike.findMany({
      where: { fromUserId: { in: iLikedIds }, toUserId: me.id, liked: true },
      select: { fromUserId: true, createdAt: true },
    })
    const matchIds = theyLikedMe.map((s) => s.fromUserId)
    if (matchIds.length === 0) return res.json({ data: [] })

    const users = await prisma.user.findMany({
      where: { id: { in: matchIds } },
      select: { id: true, displayName: true, username: true, photoUrl: true, bio: true, interests: true },
    })

    res.json({ data: users })
  } catch (err) {
    next(err)
  }
})

export default router
