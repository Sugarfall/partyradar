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
    const pageNum = Math.max(1, Number(page))
    const limitNum = Math.min(50, Math.max(1, Number(limit)))

    // Get IDs of users the current user follows
    const followingRows = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    })
    // Following tab: only show posts from people the user follows, not their own
    const feedUserIds = [...new Set(followingRows.map((f) => f.followingId))]

    // Fetch RSVPs, check-ins, and posts in parallel
    const [rsvps, checkIns, posts] = await Promise.all([
      prisma.eventGuest.findMany({
        where: {
          userId: { in: feedUserIds },
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
        where: { userId: { in: feedUserIds } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          user: { select: userSelect },
          event: { select: eventSelect },
          venue: { select: venueSelect },
        },
      }),
      prisma.post.findMany({
        where: {
          userId: { in: feedUserIds },
          isStory: false,
          user: { firebaseUid: { not: { startsWith: 'demo_' } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          user: { select: userSelect },
          event: { select: eventSelect },
          venue: { select: venueSelect },
          // Phase 2/3/4: hydrate carousel media, tags, and counters so the
          // feed cards render with full fidelity (viewer overlays, share
          // count, video autoplay) without extra round-trips.
          media: { orderBy: { sortOrder: 'asc' as const } },
          tags: {
            include: {
              taggedUser: { select: userSelect },
              taggedVenue: { select: { id: true, name: true, address: true, photoUrl: true, type: true } },
            },
          },
          originalPost: {
            include: {
              user:  { select: userSelect },
              event: { select: eventSelect },
              venue: { select: venueSelect },
              media: { orderBy: { sortOrder: 'asc' as const } },
            },
          },
        },
      }),
    ])

    // Batch-fetch which posts the current user has liked
    const postIds = posts.map((p) => p.id)
    const likedRows = postIds.length > 0
      ? await prisma.postLike.findMany({
          where: { userId, postId: { in: postIds } },
          select: { postId: true },
        })
      : []
    const likedSet = new Set(likedRows.map((l) => l.postId))

    // Merge all items into a unified, FLAT feed structure
    const feedItems = [
      ...rsvps.map((r) => ({
        type: 'RSVP' as const,
        user: r.user,
        event: r.event,
        venue: null as null,
        crowdLevel: null as string | null,
        id: null as string | null,
        text: null as string | null,
        imageUrl: null as string | null,
        isStory: false,
        likesCount: 0,
        commentsCount: 0,
        viewCount: 0,
        sharesCount: 0,
        repostsCount: 0,
        media: null as null,
        tags: null as null,
        originalPost: null as null,
        hasLiked: false,
        createdAt: r.invitedAt,
      })),
      ...checkIns.map((c) => ({
        type: 'CHECKIN' as const,
        user: c.user,
        event: c.event,
        venue: c.venue,
        crowdLevel: c.crowdLevel as string | null,
        id: null as string | null,
        text: null as string | null,
        imageUrl: null as string | null,
        isStory: false,
        likesCount: 0,
        commentsCount: 0,
        viewCount: 0,
        sharesCount: 0,
        repostsCount: 0,
        media: null as null,
        tags: null as null,
        originalPost: null as null,
        hasLiked: false,
        createdAt: c.createdAt,
      })),
      ...posts.map((p) => ({
        type: 'POST' as const,
        user: p.user,
        event: p.event,
        venue: p.venue,
        crowdLevel: null as string | null,
        id: p.id,
        text: p.text,
        imageUrl: p.imageUrl,
        isStory: p.isStory,
        likesCount: p.likesCount,
        commentsCount: p.commentsCount,
        viewCount: p.viewCount,
        sharesCount: p.sharesCount,
        repostsCount: p.repostsCount,
        media: p.media,
        tags: p.tags,
        originalPost: p.originalPost ?? null,
        hasLiked: likedSet.has(p.id),
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

/** GET /api/feed/discover — posts + check-ins + RSVPs, newest first */
// Posts:     real (non-demo) posts from the past 7 days
// Check-ins: all users (incl. demo) from the past 24 h — gives seeded content immediately
// RSVPs:     confirmed, non-cancelled events from the past 24 h
// This means the "For You" tab is populated as soon as seed-activity runs on a
// fresh deploy, rather than waiting for real users to start posting.
router.get('/discover', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const oneDayAgo    = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const viewerId     = req.user?.dbUser?.id ?? null

    const [posts, checkIns, rsvps] = await Promise.all([
      // Real (non-demo) posts — kept at 7-day window for richer content over time
      prisma.post.findMany({
        where: {
          createdAt: { gte: sevenDaysAgo },
          isStory: false,
          user: { firebaseUid: { not: { startsWith: 'demo_' } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: { select: userSelect },
          event: { select: eventSelect },
          venue: { select: venueSelect },
          media: { orderBy: { sortOrder: 'asc' as const } },
          tags: {
            include: {
              taggedUser: { select: userSelect },
              taggedVenue: { select: { id: true, name: true, address: true, photoUrl: true, type: true } },
            },
          },
          originalPost: {
            include: {
              user:  { select: userSelect },
              event: { select: eventSelect },
              venue: { select: venueSelect },
              media: { orderBy: { sortOrder: 'asc' as const } },
            },
          },
        },
      }),

      // Check-ins from all users (incl. seeded demo accounts) — past 24 h
      prisma.checkIn.findMany({
        where: { createdAt: { gte: oneDayAgo } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          user:  { select: userSelect },
          event: { select: eventSelect },
          venue: { select: venueSelect },
        },
      }),

      // Confirmed RSVPs on live events — past 24 h
      prisma.eventGuest.findMany({
        where: {
          invitedAt: { gte: oneDayAgo },
          status: 'CONFIRMED',
          event: { isCancelled: false, isPublished: true },
        },
        orderBy: { invitedAt: 'desc' },
        take: 30,
        include: {
          user:  { select: userSelect },
          event: { select: eventSelect },
        },
      }),
    ])

    // Batch-fetch which posts the viewer has liked
    const postIds  = posts.map((p) => p.id)
    const likedRows = viewerId && postIds.length > 0
      ? await prisma.postLike.findMany({
          where: { userId: viewerId, postId: { in: postIds } },
          select: { postId: true },
        })
      : []
    const likedSet = new Set(likedRows.map((l) => l.postId))

    // Merge all three item types into a single flat FeedItem array
    const items = [
      ...posts.map((p) => ({
        type: 'POST' as const,
        user: p.user,
        event: p.event,
        venue: p.venue,
        crowdLevel: null as string | null,
        id: p.id,
        text: p.text,
        imageUrl: p.imageUrl,
        isStory: p.isStory,
        likesCount: p.likesCount,
        commentsCount: p.commentsCount,
        viewCount: p.viewCount,
        sharesCount: p.sharesCount,
        repostsCount: p.repostsCount,
        media: p.media,
        tags: p.tags,
        originalPost: p.originalPost ?? null,
        hasLiked: likedSet.has(p.id),
        createdAt: p.createdAt,
      })),
      ...checkIns.map((c) => ({
        type: 'CHECKIN' as const,
        user: c.user,
        event: c.event,
        venue: c.venue,
        crowdLevel: c.crowdLevel as string | null,
        id: null as string | null,
        text: null as string | null,
        imageUrl: null as string | null,
        isStory: false,
        likesCount: 0,
        commentsCount: 0,
        viewCount: 0,
        sharesCount: 0,
        repostsCount: 0,
        media: null as null,
        tags: null as null,
        originalPost: null as null,
        hasLiked: false,
        createdAt: c.createdAt,
      })),
      ...rsvps.map((r) => ({
        type: 'RSVP' as const,
        user: r.user,
        event: r.event,
        venue: null as null,
        crowdLevel: null as string | null,
        id: null as string | null,
        text: null as string | null,
        imageUrl: null as string | null,
        isStory: false,
        likesCount: 0,
        commentsCount: 0,
        viewCount: 0,
        sharesCount: 0,
        repostsCount: 0,
        media: null as null,
        tags: null as null,
        originalPost: null as null,
        hasLiked: false,
        createdAt: r.invitedAt,
      })),
    ]

    // Unified newest-first sort across all item types
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    res.json({ data: items })
  } catch (err) {
    next(err)
  }
})

export default router
