import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, requireTier } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

// Haversine distance in km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// GET /api/match/deck — up to 20 candidate profiles (BASIC+ required)
router.get('/deck', requireAuth, requireTier('BASIC', 'Matchmaking'), async (req: AuthRequest, res, next) => {
  try {
    const me = req.user!.dbUser
    const myUser = await prisma.user.findUnique({
      where: { id: me.id },
      select: { gender: true, lastKnownLat: true, lastKnownLng: true },
    })
    if (!myUser) return res.status(404).json({ error: { message: 'User not found' } })

    // Require gender to be set — Matchmaking is Male↔Female only
    if (!myUser.gender || (myUser.gender !== 'MALE' && myUser.gender !== 'FEMALE')) {
      return res.status(422).json({ error: 'GENDER_REQUIRED', message: 'Set your gender in your profile to start matching' })
    }

    // Strict heterosexual matching: male sees females, female sees males
    const targetGenders: string[] = myUser.gender === 'MALE' ? ['FEMALE'] : ['MALE']

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

// POST /api/match/swipe — record a swipe, returns { match: boolean } (BASIC+ required)
router.post('/swipe', requireAuth, requireTier('BASIC', 'Matchmaking'), async (req: AuthRequest, res, next) => {
  try {
    const me = req.user!.dbUser
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
      const existing = await prisma.conversation.findFirst({
        where: {
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
                { userId: me.id },
                { userId: toUserId },
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

// POST /api/match/setup-test — seed a test liker for the calling user (dev/QA)
router.post('/setup-test', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const me = req.user!.dbUser

    // 1. Ensure calling user has gender=MALE + subscription=BASIC so deck works
    await prisma.user.update({
      where: { id: me.id },
      data: {
        gender: 'MALE',
        subscriptionTier: 'BASIC',
        lastKnownLat:  55.8617,
        lastKnownLng: -4.2583,
        lastSeenAt:   new Date(),
      },
    })

    // 2. Upsert a realistic test "liker" (female, photo, Glasgow coords)
    const testUid = 'test_liker_female_01'
    const tester = await prisma.user.upsert({
      where:  { firebaseUid: testUid },
      create: {
        firebaseUid:    testUid,
        email:          'zara.test@partyradar.dev',
        username:       'zara_radar',
        displayName:    'Zara',
        gender:         'FEMALE',
        subscriptionTier: 'BASIC',
        photoUrl:       'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400&h=400&fit=crop&crop=face',
        bio:            'Love live music and late nights 🎶',
        interests:      ['Music', 'Nightlife', 'Festivals'],
        lastKnownLat:   55.8617,
        lastKnownLng:  -4.2583,
        lastSeenAt:     new Date(),
      },
      update: {
        photoUrl:    'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400&h=400&fit=crop&crop=face',
        gender:      'FEMALE',
        subscriptionTier: 'BASIC',
        lastKnownLat:  55.8617,
        lastKnownLng: -4.2583,
        lastSeenAt:   new Date(),
      },
    })

    // 3. Zara has already swiped right on the calling user
    await prisma.swipeLike.upsert({
      where:  { fromUserId_toUserId: { fromUserId: tester.id, toUserId: me.id } },
      create: { fromUserId: tester.id, toUserId: me.id, liked: true },
      update: { liked: true },
    })

    // 4. Clear any prior swipe from calling user → Zara so she appears in deck
    await prisma.swipeLike.deleteMany({
      where: { fromUserId: me.id, toUserId: tester.id },
    })

    res.json({ data: { testUserId: tester.id, displayName: tester.displayName, message: 'Test liker ready — refresh your deck!' } })
  } catch (err) {
    next(err)
  }
})

// GET /api/match/matches — get all mutual matches (BASIC+ required)
router.get('/matches', requireAuth, requireTier('BASIC', 'Matchmaking'), async (req: AuthRequest, res, next) => {
  try {
    const me = req.user!.dbUser

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
