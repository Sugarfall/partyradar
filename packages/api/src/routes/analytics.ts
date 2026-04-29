import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

// ── POST /api/events/impressions — batch impression (must be BEFORE /:id routes)
router.post('/impressions', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { eventIds } = req.body as { eventIds?: string[] }
    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      return res.json({ data: { recorded: 0 } })
    }

    const userId = req.user?.dbUser.id ?? null
    // Only track authenticated users — anonymous impressions are inflated by
    // bots, crawlers and repeated loads and make host analytics unreliable.
    if (!userId) return res.json({ data: { recorded: 0 } })

    const limit      = eventIds.slice(0, 50)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    const toInsert: { eventId: string; userId: string }[] = []
    for (const eventId of limit) {
      const recent = await prisma.eventImpression.findFirst({
        where: { eventId, userId, createdAt: { gte: oneHourAgo } },
        select: { id: true },
      })
      if (!recent) toInsert.push({ eventId, userId })
    }

    if (toInsert.length > 0) {
      await prisma.eventImpression.createMany({ data: toInsert, skipDuplicates: true })
    }

    res.json({ data: { recorded: toInsert.length } })
  } catch (err) { next(err) }
})

// ── POST /api/events/:id/view — record one page view ─────────────────────────
router.post('/:id/view', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const eventId = req.params['id']!
    const userId  = req.user?.dbUser.id ?? null

    // Only track authenticated users for the same reason as impressions above.
    if (!userId) return res.json({ data: { recorded: false } })

    const sixHrsAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)
    const recent = await prisma.eventView.findFirst({
      where: { eventId, userId, createdAt: { gte: sixHrsAgo } },
      select: { id: true },
    })
    if (recent) return res.json({ data: { recorded: false } })

    await prisma.eventView.create({ data: { eventId, userId } })
    res.json({ data: { recorded: true } })
  } catch (err) { next(err) }
})

// ── GET /api/events/:id/analytics — host-only analytics ──────────────────────
router.get('/:id/analytics', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const id = req.params['id'] as string

    const event = await prisma.event.findUnique({ where: { id } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== userId) throw new AppError('Forbidden', 403)

    const [guests, tickets, checkIns, reviews, impressions, views] = await Promise.all([
      prisma.eventGuest.findMany({ where: { eventId: id }, select: { status: true, invitedAt: true } }),
      prisma.ticket.findMany({ where: { eventId: id }, select: { pricePaid: true, platformFee: true, scannedAt: true } }),
      prisma.checkIn.findMany({ where: { eventId: id }, select: { createdAt: true, crowdLevel: true } }),
      prisma.eventReview.findMany({ where: { eventId: id }, select: { rating: true, vibeRating: true, musicRating: true } }),
      prisma.eventImpression.findMany({ where: { eventId: id }, select: { userId: true, createdAt: true } }),
      prisma.eventView.findMany({ where: { eventId: id }, select: { userId: true, createdAt: true } }),
    ])

    // ── RSVP breakdown ────────────────────────────────────────────────────────
    const rsvpCounts = guests.reduce<Record<string, number>>((acc, g) => {
      acc[g.status] = (acc[g.status] ?? 0) + 1
      return acc
    }, {})

    // RSVP over time (daily buckets)
    const rsvpByDay = guests.reduce<Record<string, number>>((acc, g) => {
      const day = g.invitedAt.toISOString().split('T')[0]!
      acc[day] = (acc[day] ?? 0) + 1
      return acc
    }, {})

    // ── Ticket revenue ────────────────────────────────────────────────────────
    const ticketRevenue = tickets.reduce((sum, t) => sum + t.pricePaid.toNumber(), 0)
    const platformFees  = tickets.reduce((sum, t) => sum + t.platformFee.toNumber(), 0)
    const scanned       = tickets.filter(t => t.scannedAt).length

    // ── Reviews avg ───────────────────────────────────────────────────────────
    const reviewCount = reviews.length
    const avgRating   = reviewCount > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviewCount : null
    const avgVibe     = reviewCount > 0 ? reviews.filter(r => r.vibeRating != null).reduce((s, r) => s + (r.vibeRating ?? 0), 0) / reviewCount : null
    const avgMusic    = reviewCount > 0 ? reviews.filter(r => r.musicRating != null).reduce((s, r) => s + (r.musicRating ?? 0), 0) / reviewCount : null

    // ── Impression stats ──────────────────────────────────────────────────────
    const totalImpressions  = impressions.length
    const uniqueImpressions = new Set(impressions.filter(i => i.userId).map(i => i.userId)).size
    const impressionsByDay  = impressions.reduce<Record<string, number>>((acc, i) => {
      const day = i.createdAt.toISOString().split('T')[0]!
      acc[day] = (acc[day] ?? 0) + 1
      return acc
    }, {})

    // ── View stats ────────────────────────────────────────────────────────────
    const totalViews  = views.length
    const uniqueViews = new Set(views.filter(v => v.userId).map(v => v.userId)).size
    const viewsByDay  = views.reduce<Record<string, number>>((acc, v) => {
      const day = v.createdAt.toISOString().split('T')[0]!
      acc[day] = (acc[day] ?? 0) + 1
      return acc
    }, {})

    // Click-through rate: views / impressions (as %)
    const ctr = totalImpressions > 0 ? Math.round((totalViews / totalImpressions) * 100) : 0

    res.json({
      data: {
        rsvpCounts,
        rsvpByDay,
        totalGuests:     guests.length,
        confirmedGuests: rsvpCounts['CONFIRMED']  ?? 0,
        waitlisted:      rsvpCounts['WAITLISTED'] ?? 0,
        capacityPct: Math.round(((rsvpCounts['CONFIRMED'] ?? 0) / event.capacity) * 100),
        tickets: { count: tickets.length, revenue: ticketRevenue, fees: platformFees, scanned },
        checkIns: checkIns.length,
        reviews:  { count: reviewCount, avgRating, avgVibe, avgMusic },
        reach: {
          impressions: { total: totalImpressions, unique: uniqueImpressions, byDay: impressionsByDay },
          views:       { total: totalViews,       unique: uniqueViews,       byDay: viewsByDay },
          ctr,
        },
      },
    })
  } catch (err) { next(err) }
})

export default router
