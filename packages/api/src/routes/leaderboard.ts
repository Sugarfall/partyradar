import { Router } from 'express'
import { prisma } from '@partyradar/db'

const router = Router()

const userSelect = { id: true, username: true, displayName: true, photoUrl: true }

/** GET /api/leaderboard/hosts — Top hosts ranked by number of events hosted */
router.get('/hosts', async (_req, res, next) => {
  try {
    const hosts = await prisma.event.groupBy({
      by: ['hostId'],
      where: { isPublished: true, isCancelled: false },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 50,
    })

    const hostIds = hosts.map((h) => h.hostId)

    // Fetch user info for all hosts
    const users = await prisma.user.findMany({
      where: { id: { in: hostIds } },
      select: userSelect,
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    // Fetch average rating per host from their events
    const ratings = await prisma.event.groupBy({
      by: ['hostId'],
      where: { hostId: { in: hostIds }, hostRating: { not: null } },
      _avg: { hostRating: true },
    })
    const ratingMap = new Map(ratings.map((r) => [r.hostId, r._avg.hostRating]))

    const data = hosts.map((h) => {
      const user = userMap.get(h.hostId)
      return {
        id: h.hostId,
        username: user?.username ?? null,
        displayName: user?.displayName ?? null,
        photoUrl: user?.photoUrl ?? null,
        eventCount: h._count.id,
        avgRating: ratingMap.get(h.hostId) ?? null,
      }
    })

    res.json({ data })
  } catch (err) {
    next(err)
  }
})

/** GET /api/leaderboard/venues — Top venues ranked by event count */
router.get('/venues', async (_req, res, next) => {
  try {
    const venues = await prisma.event.groupBy({
      by: ['venueId'],
      where: { isPublished: true, isCancelled: false, venueId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 50,
    })

    const venueIds = venues
      .map((v) => v.venueId)
      .filter((id): id is string => id !== null)

    // Fetch venue details
    const venueRecords = await prisma.venue.findMany({
      where: { id: { in: venueIds } },
      select: { id: true, name: true, address: true, rating: true },
    })
    const venueMap = new Map(venueRecords.map((v) => [v.id, v]))

    // Fetch average review rating per venue's events
    const eventsByVenue = await prisma.event.findMany({
      where: { venueId: { in: venueIds }, isPublished: true, isCancelled: false },
      select: { id: true, venueId: true },
    })

    // Group event IDs by venue
    const venueEventIds = new Map<string, string[]>()
    for (const e of eventsByVenue) {
      if (!e.venueId) continue
      const arr = venueEventIds.get(e.venueId) ?? []
      arr.push(e.id)
      venueEventIds.set(e.venueId, arr)
    }

    // Get average review rating across all events at each venue
    const allEventIds = eventsByVenue.map((e) => e.id)
    const reviewAgg = allEventIds.length > 0
      ? await prisma.eventReview.groupBy({
          by: ['eventId'],
          where: { eventId: { in: allEventIds } },
          _avg: { rating: true },
        })
      : []
    const eventRatingMap = new Map(reviewAgg.map((r) => [r.eventId, r._avg.rating]))

    // Compute per-venue average rating from event reviews
    const venueAvgRating = new Map<string, number | null>()
    for (const [vid, eids] of venueEventIds) {
      const ratings = eids
        .map((eid) => eventRatingMap.get(eid))
        .filter((r): r is number => r !== null && r !== undefined)
      venueAvgRating.set(
        vid,
        ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
      )
    }

    const data = venues.map((v) => {
      const venue = v.venueId ? venueMap.get(v.venueId) : null
      return {
        name: venue?.name ?? 'Unknown Venue',
        address: venue?.address ?? null,
        eventCount: v._count.id,
        avgRating: (v.venueId ? venueAvgRating.get(v.venueId) : null) ?? venue?.rating ?? null,
      }
    })

    res.json({ data })
  } catch (err) {
    next(err)
  }
})

/** GET /api/leaderboard/partygoers — Top partygoers ranked by events attended */
router.get('/partygoers', async (_req, res, next) => {
  try {
    const goers = await prisma.eventGuest.groupBy({
      by: ['userId'],
      where: { status: 'CONFIRMED' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 50,
    })

    const userIds = goers.map((g) => g.userId)

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: userSelect,
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    const data = goers.map((g) => {
      const user = userMap.get(g.userId)
      return {
        id: g.userId,
        username: user?.username ?? null,
        displayName: user?.displayName ?? null,
        photoUrl: user?.photoUrl ?? null,
        eventsAttended: g._count.id,
      }
    })

    res.json({ data })
  } catch (err) {
    next(err)
  }
})

/** GET /api/leaderboard/social — Top users ranked by social score */
router.get('/social', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { socialScore: { gt: 0 } },
      orderBy: { socialScore: 'desc' },
      take: 50,
      select: {
        id: true,
        username: true,
        displayName: true,
        photoUrl: true,
        socialScore: true,
        subscriptionTier: true,
      },
    })
    res.json({ data: users })
  } catch (err) {
    next(err)
  }
})

export default router
