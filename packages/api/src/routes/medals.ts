import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, requireAdmin } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

async function getUserStats(userId: string) {
  const [
    followersCount, followingCount, eventsAttended, eventsOrganised,
    ticketsBought, checkinsCount, referralsMade, venuesVisited, postsCount,
  ] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
    prisma.eventGuest.count({ where: { userId, status: 'CONFIRMED' } }),
    prisma.event.count({ where: { hostId: userId, isPublished: true, isCancelled: false } }),
    prisma.ticket.count({ where: { userId } }),
    prisma.checkIn.count({ where: { userId } }),
    prisma.referral.count({ where: { referrerId: userId } }),
    prisma.checkIn.findMany({ where: { userId, venueId: { not: null } }, distinct: ['venueId'], select: { venueId: true } }).then(r => r.length),
    prisma.post.count({ where: { userId } }),
  ])
  return { FOLLOWERS_COUNT: followersCount, FOLLOWING_COUNT: followingCount, EVENTS_ATTENDED: eventsAttended, EVENTS_ORGANISED: eventsOrganised, TICKETS_BOUGHT: ticketsBought, CHECKINS_COUNT: checkinsCount, REFERRALS_MADE: referralsMade, VENUES_VISITED: venuesVisited, POSTS_COUNT: postsCount }
}

/**
 * Same shape as getUserStats but scoped to a time window — used for Special
 * Event medals where the threshold must be hit DURING the event, not all-time.
 *
 * e.g. "Easter Pub Crawl: check in at 5 different venues during Easter weekend"
 *      → VENUES_VISITED conditionType with threshold 5, window = Easter dates
 */
async function getSpecialEventStats(userId: string, startsAt: Date, endsAt: Date) {
  const window = { gte: startsAt, lte: endsAt }
  const [checkinsCount, venuesVisited, eventsAttended, eventsOrganised, ticketsBought, postsCount] = await Promise.all([
    prisma.checkIn.count({ where: { userId, createdAt: window } }),
    prisma.checkIn.findMany({ where: { userId, venueId: { not: null }, createdAt: window }, distinct: ['venueId'], select: { venueId: true } }).then(r => r.length),
    // Count events the user confirmed that START within the special-event window
    prisma.eventGuest.count({ where: { userId, status: 'CONFIRMED', event: { startsAt: window } } }),
    prisma.event.count({ where: { hostId: userId, isPublished: true, isCancelled: false, startsAt: window } }),
    prisma.ticket.count({ where: { userId, createdAt: window } }),
    prisma.post.count({ where: { userId, createdAt: window } }),
  ])
  // Social/referral counts don't make sense as time-windowed special-event goals
  return { FOLLOWERS_COUNT: 0, FOLLOWING_COUNT: 0, REFERRALS_MADE: 0, EVENTS_ATTENDED: eventsAttended, EVENTS_ORGANISED: eventsOrganised, TICKETS_BOUGHT: ticketsBought, CHECKINS_COUNT: checkinsCount, VENUES_VISITED: venuesVisited, POSTS_COUNT: postsCount }
}

/** Build a window-keyed cache of special-event stats for a list of medals. */
async function buildWindowCache(userId: string, medals: Array<{ specialEventId: string | null; startsAt: Date | null; endsAt: Date | null }>) {
  type Stats = Awaited<ReturnType<typeof getUserStats>>
  const cache = new Map<string, Stats>()
  const seen = new Set<string>()
  await Promise.all(medals.map(async m => {
    if (!m.specialEventId || !m.startsAt || !m.endsAt) return
    const key = `${m.startsAt.toISOString()}|${m.endsAt.toISOString()}`
    if (seen.has(key)) return
    seen.add(key)
    cache.set(key, await getSpecialEventStats(userId, m.startsAt, m.endsAt))
  }))
  return cache
}

function pickStats<T extends { specialEventId: string | null; startsAt: Date | null; endsAt: Date | null }>(
  medal: T,
  allTimeStats: Awaited<ReturnType<typeof getUserStats>>,
  windowCache: Map<string, Awaited<ReturnType<typeof getUserStats>>>,
) {
  if (medal.specialEventId && medal.startsAt && medal.endsAt) {
    const key = `${medal.startsAt.toISOString()}|${medal.endsAt.toISOString()}`
    return windowCache.get(key) ?? allTimeStats
  }
  return allTimeStats
}

// Public: list user's medals
router.get('/user/:userId', async (req, res, next) => {
  try {
    const medals = await prisma.userMedal.findMany({
      where: { userId: req.params['userId'] },
      include: { medal: { select: { id: true, slug: true, name: true, icon: true, tier: true, category: true } } },
      orderBy: { earnedAt: 'desc' },
    })
    res.json({ data: medals })
  } catch (err) { next(err) }
})

// All active medals
router.get('/', async (_req, res, next) => {
  try {
    const medals = await prisma.medal.findMany({ where: { isActive: true }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { tier: 'asc' }] })
    res.json({ data: medals })
  } catch (err) { next(err) }
})

// Admin: all medals with earn counts
router.get('/admin', requireAdmin, async (_req: AuthRequest, res, next) => {
  try {
    const medals = await prisma.medal.findMany({ orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { tier: 'asc' }], include: { _count: { select: { earnedBy: true } } } })
    res.json({ data: medals })
  } catch (err) { next(err) }
})

// My medals + progress (special-event medals show time-windowed progress)
router.get('/mine', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const [medals, userMedals, stats] = await Promise.all([
      prisma.medal.findMany({ where: { isActive: true }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { tier: 'asc' }] }),
      prisma.userMedal.findMany({ where: { userId }, include: { medal: true } }),
      getUserStats(userId),
    ])
    const earnedIds = new Set(userMedals.map(um => um.medalId))

    // For special-event medals, compute progress against their time window, not all-time counts
    const windowCache = await buildWindowCache(userId, medals)

    const withProgress = medals.map(m => {
      const currentStats = pickStats(m, stats, windowCache)
      const currentValue = m.conditionType === 'SPECIFIC_EVENT' ? 0 : (currentStats[m.conditionType as keyof typeof currentStats] ?? 0)
      return { ...m, earned: earnedIds.has(m.id), earnedAt: userMedals.find(um => um.medalId === m.id)?.earnedAt ?? null, progress: Math.min(currentValue / m.threshold, 1), currentValue }
    })
    res.json({ data: withProgress, earned: userMedals })
  } catch (err) { next(err) }
})

// Check + auto-award new medals
router.post('/check', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id

    // Auto-seed medal definitions if any standard medals are missing.
    // Uses upsert so existing custom/special medals are never overwritten.
    const EXPECTED_STANDARD = MEDAL_DEFS.reduce((n, d) => n + d.tiers.length, 0)
    const existingStandard = await prisma.medal.count({
      where: { slug: { in: MEDAL_DEFS.map(d => d.slug) } },
    })
    if (existingStandard < EXPECTED_STANDARD) {
      for (const def of MEDAL_DEFS) {
        for (const t of def.tiers) {
          await prisma.medal.upsert({
            where: { slug_tier: { slug: def.slug, tier: t.tier } },
            create: { slug: def.slug, name: def.name, description: t.description, icon: def.icon, tier: t.tier, category: def.category, conditionType: def.conditionType, threshold: t.threshold, sortOrder: def.sortOrder },
            update: {},
          })
        }
      }
    }

    const now = new Date()
    const [medals, alreadyEarned, stats] = await Promise.all([
      prisma.medal.findMany({
        where: {
          isActive: true,
          NOT: { conditionType: 'SPECIFIC_EVENT' },
          // Respect optional time windows — only include medals whose window is currently open
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
      }),
      prisma.userMedal.findMany({ where: { userId }, select: { medalId: true } }),
      getUserStats(userId),
    ])
    const earnedIds = new Set(alreadyEarned.map(e => e.medalId))

    // Special-event medals count activity within their time window, not all-time
    const windowCache = await buildWindowCache(userId, medals)

    // Social score awarded per medal tier
    const MEDAL_TIER_SCORE: Record<string, number> = { BRONZE: 10, SILVER: 25, GOLD: 50 }

    const newlyEarned: string[] = []
    let socialScoreGain = 0
    for (const medal of medals) {
      if (earnedIds.has(medal.id)) continue
      const currentStats = pickStats(medal, stats, windowCache)
      const value = currentStats[medal.conditionType as keyof typeof currentStats] ?? 0
      if (value >= medal.threshold) {
        await prisma.userMedal.upsert({ where: { userId_medalId: { userId, medalId: medal.id } }, create: { userId, medalId: medal.id }, update: {} })
        newlyEarned.push(medal.id)
        socialScoreGain += MEDAL_TIER_SCORE[medal.tier] ?? 0
      }
    }

    // Increment socialScore in a single write — avoids N round-trips per earned medal
    if (socialScoreGain > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { socialScore: { increment: socialScoreGain } },
      })
    }

    res.json({ newlyEarned, count: newlyEarned.length, socialScoreGain })
  } catch (err) { next(err) }
})

// ── Medal seed definitions ──────────────────────────────────────────────────
const MEDAL_DEFS = [
  { slug: 'social-butterfly', name: 'Social Butterfly', icon: '🦋', category: 'SOCIAL' as const, conditionType: 'FOLLOWERS_COUNT' as const, sortOrder: 1,
    tiers: [{ tier: 'BRONZE' as const, threshold: 10, description: 'Gain your first 10 followers' }, { tier: 'SILVER' as const, threshold: 1000, description: 'Reach 1,000 followers' }, { tier: 'GOLD' as const, threshold: 10000, description: 'Become a star with 10,000 followers' }] },
  { slug: 'connector', name: 'Connector', icon: '🔗', category: 'SOCIAL' as const, conditionType: 'REFERRALS_MADE' as const, sortOrder: 2,
    tiers: [{ tier: 'BRONZE' as const, threshold: 1, description: 'Refer your first friend to PartyRadar' }, { tier: 'SILVER' as const, threshold: 10, description: 'Bring 10 friends to the party' }, { tier: 'GOLD' as const, threshold: 50, description: "You've built a crew of 50 referrals" }] },
  { slug: 'networker', name: 'Networker', icon: '🌐', category: 'SOCIAL' as const, conditionType: 'FOLLOWING_COUNT' as const, sortOrder: 3,
    tiers: [{ tier: 'BRONZE' as const, threshold: 25, description: 'Follow 25 people on PartyRadar' }, { tier: 'SILVER' as const, threshold: 250, description: 'You know 250 party-goers' }, { tier: 'GOLD' as const, threshold: 1000, description: 'An elite network of 1,000+ connections' }] },
  { slug: 'party-animal', name: 'Party Animal', icon: '🎉', category: 'EVENTS' as const, conditionType: 'EVENTS_ATTENDED' as const, sortOrder: 1,
    tiers: [{ tier: 'BRONZE' as const, threshold: 5, description: 'Attend 5 events' }, { tier: 'SILVER' as const, threshold: 25, description: 'Hit 25 events attended' }, { tier: 'GOLD' as const, threshold: 100, description: 'A century of parties — legendary!' }] },
  { slug: 'ticket-holder', name: 'Ticket Holder', icon: '🎟️', category: 'EVENTS' as const, conditionType: 'TICKETS_BOUGHT' as const, sortOrder: 2,
    tiers: [{ tier: 'BRONZE' as const, threshold: 1, description: 'Buy your first ticket' }, { tier: 'SILVER' as const, threshold: 10, description: 'Collect 10 tickets' }, { tier: 'GOLD' as const, threshold: 50, description: 'An impressive 50 tickets purchased' }] },
  { slug: 'party-host', name: 'Party Host', icon: '🎪', category: 'HOST' as const, conditionType: 'EVENTS_ORGANISED' as const, sortOrder: 1,
    tiers: [{ tier: 'BRONZE' as const, threshold: 1, description: 'Host your first event' }, { tier: 'SILVER' as const, threshold: 10, description: 'Run 10 successful events' }, { tier: 'GOLD' as const, threshold: 50, description: 'A veteran organiser with 50 events' }] },
  { slug: 'venue-hopper', name: 'Venue Hopper', icon: '📍', category: 'EXPLORER' as const, conditionType: 'VENUES_VISITED' as const, sortOrder: 1,
    tiers: [{ tier: 'BRONZE' as const, threshold: 3, description: 'Check in at 3 different venues' }, { tier: 'SILVER' as const, threshold: 15, description: 'Explore 15 unique venues' }, { tier: 'GOLD' as const, threshold: 50, description: 'A true explorer — 50 venues visited' }] },
  { slug: 'loyal-raver', name: 'Loyal Raver', icon: '🔥', category: 'LOYALTY' as const, conditionType: 'CHECKINS_COUNT' as const, sortOrder: 1,
    tiers: [{ tier: 'BRONZE' as const, threshold: 5, description: 'Check in to 5 events' }, { tier: 'SILVER' as const, threshold: 25, description: 'A regular with 25 check-ins' }, { tier: 'GOLD' as const, threshold: 100, description: 'Legendary commitment — 100 check-ins!' }] },
]

// Admin: seed all medal definitions (idempotent upsert)
router.post('/seed', requireAdmin, async (_req: AuthRequest, res, next) => {
  try {
    let upserted = 0
    for (const def of MEDAL_DEFS) {
      for (const t of def.tiers) {
        await prisma.medal.upsert({
          where: { slug_tier: { slug: def.slug, tier: t.tier } },
          create: { slug: def.slug, name: def.name, description: t.description, icon: def.icon, tier: t.tier, category: def.category, conditionType: def.conditionType, threshold: t.threshold, sortOrder: def.sortOrder },
          update: { name: def.name, description: t.description, icon: def.icon, threshold: t.threshold, sortOrder: def.sortOrder },
        })
        upserted++
      }
    }
    res.json({ ok: true, upserted, message: `${upserted} medals seeded` })
  } catch (err) { next(err) }
})

// Admin: create medal
router.post('/', requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const { slug, name, description, icon, tier, category, conditionType, threshold, eventId, sortOrder, specialEventId, startsAt, endsAt } = req.body
    const medal = await prisma.medal.create({
      data: {
        slug, name, description, icon, tier, category, conditionType,
        threshold: threshold ?? 1,
        eventId: eventId ?? null,
        sortOrder: sortOrder ?? 0,
        specialEventId: specialEventId ?? null,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
      },
    })
    res.json({ data: medal })
  } catch (err) { next(err) }
})

// Admin: update medal
router.put('/:id', requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const medal = await prisma.medal.update({ where: { id: req.params['id'] }, data: req.body })
    res.json({ data: medal })
  } catch (err) { next(err) }
})

// Admin: delete medal
router.delete('/:id', requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    await prisma.medal.delete({ where: { id: req.params['id'] } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// Admin: manually award medal to user (accepts username OR user ID)
router.post('/:id/award/:userRef', requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const userRef = req.params['userRef']!

    // Resolve userRef — could be a cuid (user ID) or a username string
    const targetUser = await prisma.user.findFirst({
      where: { OR: [{ id: userRef }, { username: userRef }] },
      select: { id: true, displayName: true, username: true },
    })
    if (!targetUser) {
      return res.status(404).json({ error: `No user found with ID or username "${userRef}"` })
    }

    const um = await prisma.userMedal.upsert({
      where: { userId_medalId: { userId: targetUser.id, medalId: req.params['id']! } },
      create: { userId: targetUser.id, medalId: req.params['id']! },
      update: {},
    })
    res.json({ data: um, user: { id: targetUser.id, displayName: targetUser.displayName, username: targetUser.username } })
  } catch (err) { next(err) }
})

export default router
