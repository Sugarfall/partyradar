import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  photoUrl: true,
  bio: true,
  interests: true,
  gender: true,
  createdAt: true,
  isAdmin: true,
  accountMode: true,
  subscriptionTier: true,
}

// ── GET /api/users/me/profile-views ────────────────────────────────────────────
// Returns how many people viewed your profile this week.
// Premium users (PREMIUM / VIP) also get the viewer list.
router.get('/me/profile-views', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { subscriptionTier: true } })
    const isPremium = me?.subscriptionTier === 'PREMIUM' || me?.subscriptionTier === 'VIP'

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // last 7 days

    const count = await prisma.profileView.count({
      where: { profileId: userId, viewerId: { not: userId }, updatedAt: { gte: since } },
    })

    if (!isPremium) {
      return res.json({ data: { count, viewers: null, isPremium: false } })
    }

    // Premium: return viewer details
    const views = await prisma.profileView.findMany({
      where: { profileId: userId, viewerId: { not: userId }, updatedAt: { gte: since } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { viewer: { select: { id: true, displayName: true, username: true, photoUrl: true } } },
    })

    res.json({
      data: {
        count,
        isPremium: true,
        viewers: views.map((v) => ({ ...v.viewer, viewedAt: v.updatedAt })),
      },
    })
  } catch (err) { next(err) }
})

// ── GET /api/users/me/nudges ───────────────────────────────────────────────────
router.get('/me/nudges', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const nudges = await prisma.nudge.findMany({
      where: { toId: userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      include: { from: { select: { id: true, displayName: true, username: true, photoUrl: true } } },
    })
    res.json({ data: nudges.map((n) => ({ ...n.from, nudgedAt: n.createdAt })) })
  } catch (err) { next(err) }
})

// ── GET /api/users/me/go-out-requests ─────────────────────────────────────────
router.get('/me/go-out-requests', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const requests = await prisma.goOutRequest.findMany({
      where: { toId: userId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: { from: { select: { id: true, displayName: true, username: true, photoUrl: true } } },
    })
    res.json({ data: requests.map((r) => ({ ...r.from, requestId: r.id, message: r.message, sentAt: r.createdAt })) })
  } catch (err) { next(err) }
})

// ── POST /api/users/:userId/nudge ─────────────────────────────────────────────
router.post('/:userId/nudge', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const fromId = req.user!.dbUser.id
    const { userId: toId } = req.params as { userId: string }
    if (fromId === toId) throw new AppError('Cannot nudge yourself', 400)

    const target = await prisma.user.findUnique({ where: { id: toId }, select: { id: true, displayName: true } })
    if (!target) throw new AppError('User not found', 404)

    await prisma.nudge.upsert({
      where: { fromId_toId: { fromId, toId } },
      create: { fromId, toId },
      update: { createdAt: new Date() },
    })

    // Notification
    const me = await prisma.user.findUnique({ where: { id: fromId }, select: { displayName: true, username: true } })
    await prisma.notification.create({
      data: {
        userId: toId,
        type: 'NUDGE',
        title: `${me?.displayName ?? 'Someone'} nudged you 👋`,
        body: 'Tap to see their profile',
        data: { fromUserId: fromId, fromUsername: me?.username },
      },
    }).catch(() => {})

    res.json({ data: { ok: true } })
  } catch (err) { next(err) }
})

// ── POST /api/users/:userId/ask-out ───────────────────────────────────────────
router.post('/:userId/ask-out', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const fromId = req.user!.dbUser.id
    const { userId: toId } = req.params as { userId: string }
    const { message } = req.body as { message?: string }
    if (fromId === toId) throw new AppError('Cannot ask yourself out', 400)

    const target = await prisma.user.findUnique({ where: { id: toId }, select: { id: true, displayName: true } })
    if (!target) throw new AppError('User not found', 404)

    // Check if already sent
    const existing = await prisma.goOutRequest.findUnique({
      where: { fromId_toId: { fromId, toId } },
    })
    if (existing) {
      return res.json({ data: { ok: true, status: existing.status, alreadySent: true } })
    }

    const req2 = await prisma.goOutRequest.create({
      data: { fromId, toId, message: message?.trim() ?? null },
    })

    const me = await prisma.user.findUnique({ where: { id: fromId }, select: { displayName: true, username: true } })
    await prisma.notification.create({
      data: {
        userId: toId,
        type: 'GO_OUT_REQUEST',
        title: `${me?.displayName ?? 'Someone'} wants to go out with you ✨`,
        body: message?.trim() ?? 'Tap to respond',
        data: { fromUserId: fromId, fromUsername: me?.username, requestId: req2.id },
      },
    }).catch(() => {})

    res.json({ data: { ok: true, status: 'pending', alreadySent: false } })
  } catch (err) { next(err) }
})

// ── POST /api/users/go-out-requests/:requestId/respond ────────────────────────
router.post('/go-out-requests/:requestId/respond', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { requestId } = req.params as { requestId: string }
    const { accept } = req.body as { accept: boolean }

    const request = await prisma.goOutRequest.findUnique({ where: { id: requestId } })
    if (!request) throw new AppError('Request not found', 404)
    if (request.toId !== userId) throw new AppError('Forbidden', 403)

    await prisma.goOutRequest.update({
      where: { id: requestId },
      data: { status: accept ? 'accepted' : 'declined' },
    })

    if (accept) {
      const me = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, username: true } })
      await prisma.notification.create({
        data: {
          userId: request.fromId,
          type: 'GO_OUT_ACCEPTED',
          title: `${me?.displayName ?? 'Someone'} said yes! 🎉`,
          body: 'They accepted your go out request — time to party!',
          data: { fromUserId: userId, fromUsername: me?.username },
        },
      }).catch(() => {})
    }

    res.json({ data: { ok: true } })
  } catch (err) { next(err) }
})

// ── GET /api/users/:username/followers ────────────────────────────────────────
router.get('/:username/followers', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { username } = req.params as { username: string }
    const currentUserId = req.user?.dbUser.id ?? null

    const user = await prisma.user.findUnique({ where: { username }, select: { id: true } })
    if (!user) throw new AppError('User not found', 404)

    const follows = await prisma.follow.findMany({
      where: { followingId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { follower: { select: PUBLIC_USER_SELECT } },
    })

    // Check which of these the current user is following
    let followingSet = new Set<string>()
    if (currentUserId) {
      const myFollows = await prisma.follow.findMany({
        where: { followerId: currentUserId, followingId: { in: follows.map((f) => f.followerId) } },
        select: { followingId: true },
      })
      followingSet = new Set(myFollows.map((f) => f.followingId))
    }

    res.json({
      data: follows.map((f) => ({
        ...f.follower,
        isFollowing: followingSet.has(f.follower.id),
        followedAt: f.createdAt,
      })),
    })
  } catch (err) { next(err) }
})

// ── GET /api/users/:username/following ────────────────────────────────────────
router.get('/:username/following', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { username } = req.params as { username: string }
    const currentUserId = req.user?.dbUser.id ?? null

    const user = await prisma.user.findUnique({ where: { username }, select: { id: true } })
    if (!user) throw new AppError('User not found', 404)

    const follows = await prisma.follow.findMany({
      where: { followerId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { following: { select: PUBLIC_USER_SELECT } },
    })

    let followingSet = new Set<string>()
    if (currentUserId) {
      const myFollows = await prisma.follow.findMany({
        where: { followerId: currentUserId, followingId: { in: follows.map((f) => f.followingId) } },
        select: { followingId: true },
      })
      followingSet = new Set(myFollows.map((f) => f.followingId))
    }

    res.json({
      data: follows.map((f) => ({
        ...f.following,
        isFollowing: followingSet.has(f.following.id),
        followedAt: f.createdAt,
      })),
    })
  } catch (err) { next(err) }
})

// ── GET /api/users/:username — main public profile ────────────────────────────
router.get('/:username', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { username } = req.params as { username: string }
    const currentUserId = req.user?.dbUser.id ?? null

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        ...PUBLIC_USER_SELECT,
        _count: {
          select: { followers: true, following: true },
        },
        hostedEvents: {
          where: { isPublished: true, isCancelled: false },
          orderBy: { startsAt: 'desc' },
          take: 10,
          select: {
            id: true, name: true, type: true, startsAt: true,
            neighbourhood: true, coverImageUrl: true, price: true,
          },
        },
        checkIns: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            event: { select: { id: true, name: true, type: true, startsAt: true } },
          },
        },
      },
    })

    if (!user) throw new AppError('User not found', 404)

    let isFollowing = false
    let mutualCount = 0
    let goOutStatus: string | null = null
    let hasNudged = false

    if (currentUserId && currentUserId !== user.id) {
      // Check follow status
      const [follow, myFollowing] = await Promise.all([
        prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: currentUserId, followingId: user.id } },
        }),
        prisma.follow.findMany({
          where: { followerId: currentUserId },
          select: { followingId: true },
        }),
      ])
      isFollowing = !!follow

      // Count mutuals
      const myFollowingSet = new Set(myFollowing.map((f) => f.followingId))
      const theirFollowing = await prisma.follow.findMany({
        where: { followerId: user.id, followingId: { in: [...myFollowingSet] } },
        select: { followingId: true },
      })
      mutualCount = theirFollowing.length

      // Check go-out and nudge
      const [goOut, nudge] = await Promise.all([
        prisma.goOutRequest.findUnique({ where: { fromId_toId: { fromId: currentUserId, toId: user.id } } }),
        prisma.nudge.findUnique({ where: { fromId_toId: { fromId: currentUserId, toId: user.id } } }),
      ])
      goOutStatus = goOut?.status ?? null
      hasNudged = !!nudge

      // Track profile view (fire and forget)
      prisma.profileView.upsert({
        where: { viewerId_profileId: { viewerId: currentUserId, profileId: user.id } },
        create: { viewerId: currentUserId, profileId: user.id },
        update: { updatedAt: new Date() },
      }).then(async () => {
        // Notify profile owner (throttled — only once per day per viewer)
        const recentNotif = await prisma.notification.findFirst({
          where: {
            userId: user.id,
            type: 'PROFILE_VIEW',
            data: { path: ['viewerId'], equals: currentUserId },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        })
        if (!recentNotif) {
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'PROFILE_VIEW',
              title: 'Someone viewed your profile 👀',
              body: 'Upgrade to see who',
              data: { viewerId: currentUserId },
            },
          }).catch(() => {})
        }
      }).catch(() => {})
    }

    // Profile view count for own profile
    let profileViewCount = 0
    if (currentUserId === user.id) {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      profileViewCount = await prisma.profileView.count({
        where: { profileId: user.id, viewerId: { not: user.id }, updatedAt: { gte: since } },
      })
    }

    res.json({
      data: {
        ...user,
        followersCount: user._count.followers,
        followingCount: user._count.following,
        eventsCount: user.hostedEvents.length,
        events: user.hostedEvents,
        recentCheckIns: user.checkIns,
        isFollowing,
        isMe: currentUserId === user.id,
        mutualCount,
        goOutStatus,
        hasNudged,
        profileViewCount,
      },
    })
  } catch (err) { next(err) }
})

export default router
