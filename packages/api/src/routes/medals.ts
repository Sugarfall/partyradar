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
