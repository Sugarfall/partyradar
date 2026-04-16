import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  photoUrl: true,
  bio: true,
}

/** GET /api/follow/suggestions — users who attend same events, not yet followed */
router.get('/suggestions', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id

    // Get event IDs the current user has RSVPd to
    const myRsvps = await prisma.eventGuest.findMany({
      where: { userId, status: 'CONFIRMED' },
      select: { eventId: true },
    })
    const myEventIds = myRsvps.map((r) => r.eventId)

    // Get already-followed user IDs
    const alreadyFollowing = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    })
    const followingIds = alreadyFollowing.map((f) => f.followingId)

    // Find other users attending the same events
    const suggestions = await prisma.user.findMany({
      where: {
        id: { not: userId, notIn: followingIds },
        guestEntries: {
          some: {
            eventId: { in: myEventIds },
            status: 'CONFIRMED',
          },
        },
      },
      select: {
        ...userSelect,
        _count: { select: { followers: true } },
      },
      take: 10,
    })

    res.json({ data: suggestions })
  } catch (err) {
    next(err)
  }
})

/** GET /api/follow/followers — list users following me */
router.get('/followers', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { page = '1', limit = '20' } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const [followers, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followingId: userId },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { follower: { select: userSelect } },
      }),
      prisma.follow.count({ where: { followingId: userId } }),
    ])

    res.json({
      data: followers.map((f) => f.follower),
      total,
      page: Number(page),
      limit: Number(limit),
      hasMore: skip + followers.length < total,
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/follow/following — list users I follow */
router.get('/following', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { page = '1', limit = '20' } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const [following, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: userId },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { following: { select: userSelect } },
      }),
      prisma.follow.count({ where: { followerId: userId } }),
    ])

    res.json({
      data: following.map((f) => f.following),
      total,
      page: Number(page),
      limit: Number(limit),
      hasMore: skip + following.length < total,
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/follow/:userId — check if I follow userId + get their counts */
router.get('/:userId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const currentUserId = req.user!.dbUser.id
    const targetUserId = req.params['userId']!

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: userSelect,
    })
    if (!target) throw new AppError('User not found', 404)

    const [isFollowing, followersCount, followingCount] = await Promise.all([
      prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: currentUserId, followingId: targetUserId } },
      }),
      prisma.follow.count({ where: { followingId: targetUserId } }),
      prisma.follow.count({ where: { followerId: targetUserId } }),
    ])

    res.json({
      data: {
        ...target,
        isFollowing: !!isFollowing,
        followersCount,
        followingCount,
      },
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/follow/:userId — follow a user */
router.post('/:userId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const followerId = req.user!.dbUser.id
    const followingId = req.params['userId']!

    if (followerId === followingId) throw new AppError('Cannot follow yourself', 400)

    const target = await prisma.user.findUnique({ where: { id: followingId }, select: { id: true } })
    if (!target) throw new AppError('User not found', 404)

    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    })
    if (existing) throw new AppError('Already following this user', 409)

    const follow = await prisma.follow.create({ data: { followerId, followingId } })

    // Notify the followed user
    const me = await prisma.user.findUnique({ where: { id: followerId }, select: { displayName: true, username: true } })
    prisma.notification.create({
      data: {
        userId: followingId,
        type: 'FOLLOW',
        title: `${me?.displayName ?? 'Someone'} started following you`,
        body: `@${me?.username ?? ''} is now following you`,
        data: { fromUserId: followerId, fromUsername: me?.username },
      },
    }).catch(() => {})

    res.status(201).json({ data: follow })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/follow/:userId — unfollow a user */
router.delete('/:userId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const followerId = req.user!.dbUser.id
    const followingId = req.params['userId']!

    // Prevent unfollowing admin/official accounts
    const targetUser = await prisma.user.findUnique({
      where: { id: followingId },
      select: { isAdmin: true },
    })
    if (targetUser?.isAdmin) {
      throw new AppError('Cannot unfollow official accounts', 403)
    }

    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    })
    if (!existing) throw new AppError('Not following this user', 404)

    await prisma.follow.delete({ where: { followerId_followingId: { followerId, followingId } } })
    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

export default router
