import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

const userSelect = { id: true, username: true, displayName: true, photoUrl: true }
const eventSelect = { id: true, name: true, startsAt: true, address: true, neighbourhood: true, coverImageUrl: true }
const venueSelect = { id: true, name: true, address: true, photoUrl: true }

/** GET /api/feed — paginated social activity feed from followed users */
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { page = '1', limit = '20' } = req.query
    const pageNum = Number(page)
    const limitNum = Number(limit)

    // Get IDs of users the current user follows
    const followingRows = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    })
    const followingIds = followingRows.map((f) => f.followingId)

    if (followingIds.length === 0) {
      return res.json({ data: [], total: 0, page: pageNum, limit: limitNum, hasMore: false })
    }

    // Fetch RSVPs, check-ins, and posts in parallel
    const [rsvps, checkIns, posts] = await Promise.all([
      prisma.eventGuest.findMany({
        where: {
          userId: { in: followingIds },
          status: 'CONFIRMED',
          event: { isCancelled: false, isPublished: true },
        },
        orderBy: { invitedAt: 'desc' },
        take: 100,
        include: {
          user: { select: userSelect },
          event: { select: eventSelect },
        },
      }),
      prisma.checkIn.findMany({
        where: { userId: { in: followingIds } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          user: { select: userSelect },
          event: { select: eventSelect },
          venue: { select: venueSelect },
        },
      }),
      prisma.post.findMany({
        where: { userId: { in: followingIds }, OR: [{ isStory: false }, { expiresAt: { gt: new Date() } }] },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          user: { select: userSelect },
          event: { select: eventSelect },
          venue: { select: venueSelect },
        },
      }),
    ])

    // Merge all items into a unified feed
    const feedItems = [
      ...rsvps.map((r) => ({
        type: 'RSVP' as const,
        user: r.user,
        event: r.event,
        venue: null,
        post: null,
        checkin: null,
        createdAt: r.invitedAt,
      })),
      ...checkIns.map((c) => ({
        type: 'CHECKIN' as const,
        user: c.user,
        event: c.event,
        venue: c.venue,
        post: null,
        checkin: { id: c.id, crowdLevel: c.crowdLevel },
        createdAt: c.createdAt,
      })),
      ...posts.map((p) => ({
        type: 'POST' as const,
        user: p.user,
        event: p.event,
        venue: p.venue,
        post: { id: p.id, imageUrl: p.imageUrl, text: p.text, isStory: p.isStory, likesCount: p.likesCount, viewCount: p.viewCount },
        checkin: null,
        createdAt: p.createdAt,
      })),
    ]

    // Sort by createdAt descending
    feedItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    // Paginate
    const total = feedItems.length
    const skip = (pageNum - 1) * limitNum
    const paginated = feedItems.slice(skip, skip + limitNum)

    res.json({
      data: paginated,
      total,
      page: pageNum,
      limit: limitNum,
      hasMore: skip + paginated.length < total,
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/feed/discover — real posts only, newest first, past 7 days */
router.get('/discover', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const viewerId = req.user?.dbUser?.id ?? null

    // Fetch all real posts (non-story, or active story) from the last 7 days
    const posts = await prisma.post.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        isStory: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: {
        user: { select: userSelect },
        event: { select: eventSelect },
        venue: { select: venueSelect },
      },
    })

    // Prioritise: viewer's own posts + posts with media first, then text-only
    const sorted = [
      ...posts.filter(p => p.userId === viewerId),
      ...posts.filter(p => p.userId !== viewerId && p.imageUrl),
      ...posts.filter(p => p.userId !== viewerId && !p.imageUrl),
    ]

    // De-duplicate (own posts appear once)
    const seen = new Set<string>()
    const deduped = sorted.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true })

    const items = deduped.map((p) => ({
      type: 'POST' as const,
      user: p.user,
      event: p.event,
      venue: p.venue,
      post: { id: p.id, imageUrl: p.imageUrl, text: p.text, isStory: p.isStory, likesCount: p.likesCount, viewCount: p.viewCount },
      checkin: null,
      createdAt: p.createdAt,
    }))

    res.json({ data: items })
  } catch (err) {
    next(err)
  }
})

export default router
