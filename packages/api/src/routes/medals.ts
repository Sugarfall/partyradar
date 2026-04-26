import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
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
router.get('/admin', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user?.dbUser.isAdmin) return res.status(403).json({ error: 'Admin only' })
    const medals = await prisma.medal.findMany({ orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { tier: 'asc' }], include: { _count: { select: { earnedBy: true } } } })
    res.json({ data: medals })
  } catch (err) { next(err) }
})

// My medals + progress
router.get('/mine', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const [medals, userMedals, stats] = await Promise.all([
      prisma.medal.findMany({ where: { isActive: true }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { tier: 'asc' }] }),
      prisma.userMedal.findMany({ where: { userId }, include: { medal: true } }),
      getUserStats(userId),
    ])
    const earnedIds = new Set(userMedals.map(um => um.medalId))
    const withProgress = medals.map(m => {
      const currentValue = m.conditionType === 'SPECIFIC_EVENT' ? 0 : (stats[m.conditionType as keyof typeof stats] ?? 0)
      return { ...m, earned: earnedIds.has(m.id), earnedAt: userMedals.find(um => um.medalId === m.id)?.earnedAt ?? null, progress: Math.min(currentValue / m.threshold, 1), currentValue }
    })
    res.json({ data: withProgress, earned: userMedals })
  } catch (err) { next(err) }
})

// Check + auto-award new medals
router.post('/check', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id

    // Auto-seed medal definitions on first ever call so admins don't need to
    // manually hit /medals/seed before medals start working.
    const existingCount = await prisma.medal.count()
    if (existingCount === 0) {
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

    const [medals, alreadyEarned, stats] = await Promise.all([
      prisma.medal.findMany({ where: { isActive: true, NOT: { conditionType: 'SPECIFIC_EVENT' } } }),
      prisma.userMedal.findMany({ where: { userId }, select: { medalId: true } }),
      getUserStats(userId),
    ])
    const earnedIds = new Set(alreadyEarned.map(e => e.medalId))
    const newlyEarned: string[] = []
    for (const medal of medals) {
      if (earnedIds.has(medal.id)) continue
      const value = stats[medal.conditionType as keyof typeof stats] ?? 0
      if (value >= medal.threshold) {
        await prisma.userMedal.upsert({ where: { userId_medalId: { userId, medalId: medal.id } }, create: { userId, medalId: medal.id }, update: {} })
        newlyEarned.push(medal.id)
      }
    }
    res.json({ newlyEarned, count: newlyEarned.length })
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
router.post('/seed', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user?.dbUser.isAdmin) return res.status(403).json({ error: 'Admin only' })
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
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user?.dbUser.isAdmin) return res.status(403).json({ error: 'Admin only' })
    const { slug, name, description, icon, tier, category, conditionType, threshold, eventId, sortOrder } = req.body
    const medal = await prisma.medal.create({ data: { slug, name, description, icon, tier, category, conditionType, threshold: threshold ?? 1, eventId, sortOrder: sortOrder ?? 0 } })
    res.json({ data: medal })
  } catch (err) { next(err) }
})

// Admin: update medal
router.put('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user?.dbUser.isAdmin) return res.status(403).json({ error: 'Admin only' })
    const medal = await prisma.medal.update({ where: { id: req.params['id'] }, data: req.body })
    res.json({ data: medal })
  } catch (err) { next(err) }
})

// Admin: delete medal
router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user?.dbUser.isAdmin) return res.status(403).json({ error: 'Admin only' })
    await prisma.medal.delete({ where: { id: req.params['id'] } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// Admin: manually award medal to user
router.post('/:id/award/:userId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user?.dbUser.isAdmin) return res.status(403).json({ error: 'Admin only' })
    const um = await prisma.userMedal.upsert({
      where: { userId_medalId: { userId: req.params['userId']!, medalId: req.params['id']! } },
      create: { userId: req.params['userId']!, medalId: req.params['id']! },
      update: {},
    })
    res.json({ data: um })
  } catch (err) { next(err) }
})

export default router
