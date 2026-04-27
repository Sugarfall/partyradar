import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, requireTier } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { sendNotification } from '../lib/fcm'

const router = Router()

// Haversine distance in km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── GET /api/match/deck ───────────────────────────────────────────────────────
// All authenticated users may VIEW the deck. Only BASIC+ can SWIPE.
// Users with showInMatchDeck = false are excluded from results.
router.get('/deck', requireAuth, async (req: AuthRequest, res, next) => {
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
        showInMatchDeck: true,   // ← respect opt-out
      },
      select: {
        id: true,
        displayName: true,
        username: true,
        photoUrl: true,
        bio: true,
        interests: true,
        profilePrompts: true,
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
        profilePrompts: c.profilePrompts ?? [],
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

// ── POST /api/match/swipe — record a swipe (BASIC+ required to swipe) ─────────
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

      // Notify the liked user
      const likedUser = await prisma.user.findUnique({
        where: { id: toUserId },
        select: { fcmToken: true, subscriptionTier: true, displayName: true, username: true },
      })
      if (likedUser?.fcmToken) {
        if (isMatch) {
          // Both users get a match notification
          await sendNotification(likedUser.fcmToken, {
            title: '💘 It\'s a Match!',
            body: `You and ${me.displayName} liked each other!`,
            data: { type: 'MATCH', userId: me.id },
          })
        } else if (likedUser.subscriptionTier === 'FREE') {
          // Non-subscriber: tell them someone liked them (but hide who)
          await sendNotification(likedUser.fcmToken, {
            title: '💛 Someone liked you!',
            body: 'Upgrade to Basic to see who it is and start matching.',
            data: { type: 'LIKED_ME', screen: '/nearby' },
          })
        }
      }

      // Also create a DB notification for the liked user
      await prisma.notification.create({
        data: {
          userId: toUserId,
          type: isMatch ? 'INTEREST_MATCH' : 'FOLLOW',  // reuse INTEREST_MATCH for match, FOLLOW for like
          title: isMatch ? '💘 It\'s a Match!' : '💛 Someone liked your profile',
          body: isMatch
            ? `You and ${me.displayName} liked each other! Start chatting.`
            : 'Someone swiped right on you. Subscribe to see who.',
          data: JSON.stringify({ type: isMatch ? 'MATCH' : 'LIKED_ME', fromUserId: me.id }),
        },
      }).catch(() => {}) // Non-blocking
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

// ── GET /api/match/liked-me — who liked me ─────────────────────────────────────
// FREE tier: gets count only (paywall to see who)
// BASIC+: gets full profile list
router.get('/liked-me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const me = req.user!.dbUser
    const tierOrder: Record<string, number> = { FREE: 0, BASIC: 1, PRO: 2, PREMIUM: 3 }
    const isPaid = (tierOrder[me.subscriptionTier] ?? 0) >= 1

    // Find everyone who liked me (liked=true, not already mutual)
    const likes = await prisma.swipeLike.findMany({
      where: { toUserId: me.id, liked: true },
      select: { fromUserId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })

    if (!isPaid) {
      // Free tier: just return the count — don't reveal who
      return res.json({ data: { count: likes.length, profiles: null, locked: true } })
    }

    // Paid: return profiles of who liked me
    const likerIds = likes.map((l) => l.fromUserId)
    const profiles = likerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: likerIds }, isBanned: false },
          select: { id: true, displayName: true, username: true, photoUrl: true, bio: true, interests: true, profilePrompts: true },
        })
      : []

    res.json({ data: { count: likes.length, profiles, locked: false } })
  } catch (err) {
    next(err)
  }
})

// ── GET /api/match/matches — mutual matches (BASIC+) ─────────────────────────
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
      select: { id: true, displayName: true, username: true, photoUrl: true, bio: true, interests: true, profilePrompts: true },
    })

    res.json({ data: users })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/match/setup-test ────────────────────────────────────────────────
router.post('/setup-test', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const me = req.user!.dbUser

    await prisma.user.update({
      where: { id: me.id },
      data: { gender: 'MALE', subscriptionTier: 'BASIC', lastKnownLat: 55.8617, lastKnownLng: -4.2583, lastSeenAt: new Date() },
    })

    const testUid = 'test_liker_female_01'
    const tester = await prisma.user.upsert({
      where: { firebaseUid: testUid },
      create: {
        firebaseUid: testUid, email: 'zara.test@partyradar.dev', username: 'zara_radar',
        displayName: 'Zara', gender: 'FEMALE', subscriptionTier: 'BASIC',
        photoUrl: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400&h=400&fit=crop&crop=face',
        bio: 'Love live music and late nights 🎶', interests: ['Music', 'Nightlife', 'Festivals'],
        lastKnownLat: 55.8617, lastKnownLng: -4.2583, lastSeenAt: new Date(),
        showInMatchDeck: true,
        profilePrompts: [{ question: 'My idea of a perfect night out', answer: 'Live music then dancing until 3am 🎵' }],
      },
      update: {
        photoUrl: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400&h=400&fit=crop&crop=face',
        gender: 'FEMALE', subscriptionTier: 'BASIC', lastKnownLat: 55.8617, lastKnownLng: -4.2583,
        lastSeenAt: new Date(), showInMatchDeck: true,
      },
    })

    await prisma.swipeLike.upsert({
      where: { fromUserId_toUserId: { fromUserId: tester.id, toUserId: me.id } },
      create: { fromUserId: tester.id, toUserId: me.id, liked: true },
      update: { liked: true },
    })

    await prisma.swipeLike.deleteMany({ where: { fromUserId: me.id, toUserId: tester.id } })

    res.json({ data: { testUserId: tester.id, displayName: tester.displayName, message: 'Test liker ready — refresh your deck!' } })
  } catch (err) {
    next(err)
  }
})

export default router
