import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAdmin } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { stripe } from '../lib/stripe'

const router = Router()

/** GET /api/admin/events */
router.get('/events', requireAdmin, async (_req, res, next) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        host: { select: { id: true, username: true, displayName: true, email: true } },
        _count: { select: { guests: true, tickets: true } },
      },
      take: 100,
    })
    res.json({ data: events })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/admin/events/:id/feature */
router.put('/events/:id/feature', requireAdmin, async (req, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params['id'] } })
    if (!event) throw new AppError('Event not found', 404)
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: { isFeatured: !event.isFeatured },
    })
    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/admin/events/:id */
router.delete('/events/:id', requireAdmin, async (req, res, next) => {
  try {
    await prisma.event.update({ where: { id: req.params['id'] }, data: { isCancelled: true, isPublished: false } })
    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/admin/sightings */
router.get('/sightings', requireAdmin, async (_req, res, next) => {
  try {
    const sightings = await prisma.celebritySighting.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, username: true, displayName: true } },
      },
      take: 100,
    })
    res.json({ data: sightings })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/admin/sightings/:id/verify */
router.put('/sightings/:id/verify', requireAdmin, async (req, res, next) => {
  try {
    const updated = await prisma.celebritySighting.update({
      where: { id: req.params['id'] },
      data: { isVerified: true },
    })
    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/admin/sightings/:id */
router.delete('/sightings/:id', requireAdmin, async (req, res, next) => {
  try {
    await prisma.celebritySighting.delete({ where: { id: req.params['id'] } })
    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/admin/users */
router.get('/users', requireAdmin, async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, username: true, displayName: true,
        subscriptionTier: true, ageVerified: true, isBanned: true,
        isAdmin: true, createdAt: true,
        _count: { select: { hostedEvents: true, tickets: true } },
      },
      take: 200,
    })
    res.json({ data: users })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/admin/users/:id/ban */
router.put('/users/:id/ban', requireAdmin, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params['id'] } })
    if (!user) throw new AppError('User not found', 404)
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { isBanned: !user.isBanned },
    })
    res.json({ data: { isBanned: updated.isBanned } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/admin/revenue */
router.get('/revenue', requireAdmin, async (_req, res, next) => {
  try {
    // Get Stripe balance
    const balance = await stripe.balance.retrieve()

    // Platform revenue from ticket fees
    const tickets = await prisma.ticket.aggregate({ _sum: { platformFee: true, pricePaid: true } })

    // Subscription counts by tier
    const tierCounts = await prisma.user.groupBy({
      by: ['subscriptionTier'],
      _count: true,
    })

    // Recent tickets
    const recentTickets = await prisma.ticket.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        event: { select: { name: true } },
        user: { select: { username: true } },
      },
    })

    res.json({
      data: {
        stripeBalance: balance.available,
        ticketRevenue: tickets._sum.pricePaid ?? 0,
        platformFees: tickets._sum.platformFee ?? 0,
        tierCounts,
        recentTickets,
      },
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/admin/seed-venues — seed Glasgow venues (idempotent) */
router.post('/seed-venues', async (_req, res, next) => {
  try {
    const venues = [
      { name: 'Sub Club', address: '22 Jamaica St, Glasgow G1 4QD', city: 'Glasgow', lat: 55.8585, lng: -4.2534, type: 'NIGHTCLUB' as const, website: 'https://subclub.co.uk', vibeTags: ['Techno', 'House', 'Underground', 'Intimate'] },
      { name: 'SWG3', address: 'Eastvale Place, Glasgow G3 8QG', city: 'Glasgow', lat: 55.8648, lng: -4.2887, type: 'CONCERT_HALL' as const, website: 'https://swg3.tv', vibeTags: ['Live Music', 'Art', 'Warehouse', 'Eclectic'] },
      { name: 'Barrowland Ballroom', address: '244 Gallowgate, Glasgow G4 0TT', city: 'Glasgow', lat: 55.8564, lng: -4.2368, type: 'CONCERT_HALL' as const, website: 'https://barrowland-ballroom.co.uk', vibeTags: ['Live Music', 'Iconic', 'Rock', 'Indie'] },
      { name: 'Òran Mór', address: 'Top of Byres Rd, Glasgow G12 8QX', city: 'Glasgow', lat: 55.8748, lng: -4.2932, type: 'BAR' as const, website: 'https://oranmor.co.uk', vibeTags: ['Comedy', 'Live Music', 'Theatre', 'Whisky'] },
      { name: 'Merchant City Inn', address: '52 Virginia St, Glasgow G1 1TY', city: 'Glasgow', lat: 55.8603, lng: -4.2437, type: 'PUB' as const, vibeTags: ['Cosy', 'Real Ale', 'Sports', 'Locals'] },
      { name: 'The Garage', address: '490 Sauchiehall St, Glasgow G2 3LW', city: 'Glasgow', lat: 55.8658, lng: -4.2706, type: 'NIGHTCLUB' as const, website: 'https://garageglasgow.co.uk', vibeTags: ['Student', 'Pop', 'R&B', 'Live Music'] },
      { name: 'Buff Club', address: '142 Bath Ln, Glasgow G2 4SQ', city: 'Glasgow', lat: 55.8647, lng: -4.2680, type: 'NIGHTCLUB' as const, vibeTags: ['House', 'Dance', 'Student', 'Late Night'] },
      { name: 'Nice N Sleazy', address: '421 Sauchiehall St, Glasgow G2 3LG', city: 'Glasgow', lat: 55.8655, lng: -4.2693, type: 'BAR' as const, vibeTags: ['Indie', 'Rock', 'Live Music', 'Grungy'] },
      { name: 'Stereo', address: '20-28 Renfield Ln, Glasgow G2 6PH', city: 'Glasgow', lat: 55.8622, lng: -4.2593, type: 'BAR' as const, website: 'https://stereo-glasgow.com', vibeTags: ['Vegan', 'Indie', 'Alternative', 'Live Music'] },
      { name: 'The Hug and Pint', address: '171 Great Western Rd, Glasgow G4 9AW', city: 'Glasgow', lat: 55.8702, lng: -4.2764, type: 'PUB' as const, vibeTags: ['Live Music', 'Vegan', 'Intimate', 'Acoustic'] },
      { name: 'King Tut\'s Wah Wah Hut', address: '272A St Vincent St, Glasgow G2 5RL', city: 'Glasgow', lat: 55.8631, lng: -4.2678, type: 'CONCERT_HALL' as const, website: 'https://kingtuts.co.uk', vibeTags: ['Live Music', 'Indie', 'Historic', 'Intimate'] },
      { name: 'Room 2', address: '50 Renfrew St, Glasgow G2 3BW', city: 'Glasgow', lat: 55.8665, lng: -4.2662, type: 'NIGHTCLUB' as const, vibeTags: ['House', 'Techno', 'LGBT+', 'Late Night'] },
      { name: 'The ABC', address: '300 Sauchiehall St, Glasgow G2 3HD', city: 'Glasgow', lat: 55.8660, lng: -4.2683, type: 'CONCERT_HALL' as const, vibeTags: ['Live Music', 'Alternative', 'Rock', 'Big Nights'] },
      { name: 'Avant Garde', address: '33 Parnie St, Glasgow G1 5RJ', city: 'Glasgow', lat: 55.8577, lng: -4.2430, type: 'BAR' as const, vibeTags: ['Craft Beer', 'Industrial', 'Hipster', 'Art'] },
      { name: 'Drygate Brewery', address: '85 Drygate, Glasgow G4 0UT', city: 'Glasgow', lat: 55.8607, lng: -4.2301, type: 'BAR' as const, website: 'https://drygate.com', vibeTags: ['Craft Beer', 'Brewery', 'Casual', 'Food'] },
      { name: 'The Pot Still', address: '154 Hope St, Glasgow G2 2TH', city: 'Glasgow', lat: 55.8634, lng: -4.2618, type: 'PUB' as const, vibeTags: ['Whisky', 'Traditional', 'Classic', 'Cosy'] },
      { name: 'Civic House', address: '26 Civic St, Glasgow G4 9RH', city: 'Glasgow', lat: 55.8721, lng: -4.2697, type: 'LOUNGE' as const, vibeTags: ['Community', 'Events', 'Alternative', 'Creative'] },
      { name: 'The Admiral Bar', address: '72A Waterloo St, Glasgow G2 7DA', city: 'Glasgow', lat: 55.8620, lng: -4.2598, type: 'BAR' as const, vibeTags: ['Live Music', 'Rock', 'Intimate', 'Grassroots'] },
    ]

    let created = 0
    let skipped = 0

    for (const venue of venues) {
      const existing = await prisma.venue.findFirst({ where: { name: venue.name, city: venue.city } })
      if (existing) { skipped++; continue }
      await prisma.venue.create({ data: venue })
      created++
    }

    res.json({ message: `Seeded ${created} venues, skipped ${skipped} existing` })
  } catch (err) {
    next(err)
  }
})

export default router
