import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

// GET /api/events/:id/analytics — host-only analytics
router.get('/:id/analytics', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const event = await prisma.event.findUnique({
      where: { id: req.params['id']! },
      include: {
        guests: { select: { status: true, invitedAt: true } },
        tickets: { select: { pricePaid: true, platformFee: true, scannedAt: true, createdAt: true } },
        checkIns: { select: { createdAt: true, crowdLevel: true } },
        reviews: { select: { rating: true, vibeRating: true, musicRating: true, crowdRating: true } },
      },
    })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== userId) throw new AppError('Forbidden', 403)

    // RSVP breakdown
    const rsvpCounts = event.guests.reduce((acc, g) => {
      acc[g.status] = (acc[g.status] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    // RSVP over time (daily buckets from event creation to now)
    const rsvpByDay: Record<string, number> = {}
    for (const g of event.guests) {
      const day = g.invitedAt.toISOString().split('T')[0]!
      rsvpByDay[day] = (rsvpByDay[day] ?? 0) + 1
    }

    // Ticket revenue
    const ticketRevenue = event.tickets.reduce((sum, t) => sum + t.pricePaid, 0)
    const platformFees = event.tickets.reduce((sum, t) => sum + t.platformFee, 0)
    const scanned = event.tickets.filter(t => t.scannedAt).length

    // Reviews avg
    const reviewCount = event.reviews.length
    const avgRating = reviewCount > 0 ? event.reviews.reduce((s, r) => s + r.rating, 0) / reviewCount : null
    const avgVibe = reviewCount > 0 ? event.reviews.filter(r => r.vibeRating).reduce((s, r) => s + (r.vibeRating ?? 0), 0) / reviewCount : null
    const avgMusic = reviewCount > 0 ? event.reviews.filter(r => r.musicRating).reduce((s, r) => s + (r.musicRating ?? 0), 0) / reviewCount : null

    res.json({
      data: {
        rsvpCounts,
        rsvpByDay,
        totalGuests: event.guests.length,
        confirmedGuests: rsvpCounts['CONFIRMED'] ?? 0,
        waitlisted: rsvpCounts['WAITLISTED'] ?? 0,
        capacityPct: Math.round(((rsvpCounts['CONFIRMED'] ?? 0) / event.capacity) * 100),
        tickets: { count: event.tickets.length, revenue: ticketRevenue, fees: platformFees, scanned },
        checkIns: event.checkIns.length,
        reviews: { count: reviewCount, avgRating, avgVibe, avgMusic },
      },
    })
  } catch (err) { next(err) }
})

export default router
