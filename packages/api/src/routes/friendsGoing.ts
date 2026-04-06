import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

// GET /api/events/:id/friends-going — followed users who have CONFIRMED RSVP
router.get('/:id/friends-going', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId  = req.user!.dbUser.id
    const eventId = req.params['id'] as string

    // Get IDs of users this person follows
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    })
    const followingIds = following.map(f => f.followingId)

    if (followingIds.length === 0) {
      return res.json({ data: { count: 0, friends: [] } })
    }

    // Find which of those are confirmed guests
    const friends = await prisma.eventGuest.findMany({
      where: { eventId, status: 'CONFIRMED', userId: { in: followingIds } },
      include: {
        user: { select: { id: true, displayName: true, photoUrl: true, username: true } },
      },
      take: 5,
    })

    const total = await prisma.eventGuest.count({
      where: { eventId, status: 'CONFIRMED', userId: { in: followingIds } },
    })

    res.json({ data: { count: total, friends: friends.map(g => g.user) } })
  } catch (err) { next(err) }
})

export default router
