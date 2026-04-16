import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

/**
 * GET /api/users/:username
 * Public profile for any user. Returns profile data + follow status if authenticated.
 */
router.get('/:username', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { username } = req.params as { username: string }
    const currentUserId = req.user?.dbUser.id ?? null

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        displayName: true,
        photoUrl: true,
        bio: true,
        createdAt: true,
        isAdmin: true,
        _count: {
          select: { followers: true, following: true },
        },
        events: {
          where: { isPublished: true, isCancelled: false },
          orderBy: { startsAt: 'desc' },
          take: 10,
          select: {
            id: true,
            name: true,
            type: true,
            startsAt: true,
            neighbourhood: true,
            coverImageUrl: true,
            price: true,
          },
        },
      },
    })

    if (!user) throw new AppError('User not found', 404)

    let isFollowing = false
    if (currentUserId && currentUserId !== user.id) {
      const follow = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: currentUserId, followingId: user.id } },
      })
      isFollowing = !!follow
    }

    res.json({
      data: {
        ...user,
        followersCount: user._count.followers,
        followingCount: user._count.following,
        isFollowing,
        isMe: currentUserId === user.id,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
