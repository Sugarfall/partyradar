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
    const id = req.params['id'] as string

    const event = await prisma.event.findUnique({ where: { id } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== userId) throw new AppError('Forbidden', 403)

    // Fetch related data separately for clean typing
    const [guests, tickets, checkIns, reviews] = await Promise.all([
      prisma.eventGuest.findMany({ where: { eventId: id }, select: { status: true, invitedAt: true } }),
      prisma.ticket.findMany({ where: { eventId: id }, select: { pricePaid: true, platformFee: true, scannedAt: true } }),
      prisma.checkIn.findMany({ where: { eventId: id }, select: { createdAt: true, crowdLevel: true } }),
      prisma.eventReview.findMany({ where: { eventId: id }, select: { rating: true, vibeRating: true, musicRating: true } }),
    ])

    // RSVP breakdown
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

    // Ticket revenue
    const ticketRevenue = tickets.reduce((sum, t) => sum + t.pricePaid, 0)
    const platformFees  = tickets.reduce((sum, t) => sum + t.platformFee, 0)
    const scanned       = tickets.filter(t => t.scannedAt).length

    // Reviews avg
    const reviewCount = reviews.length
    const avgRating = reviewCount > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviewCount : null
    const avgVibe   = reviewCount > 0 ? reviews.filter(r => r.vibeRating != null).reduce((s, r) => s + (r.vibeRating ?? 0), 0) / reviewCount : null
    const avgMusic  = reviewCount > 0 ? reviews.filter(r => r.musicRating != null).reduce((s, r) => s + (r.musicRating ?? 0), 0) / reviewCount : null

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
        reviews: { count: reviewCount, avgRating, avgVibe, avgMusic },
      },
    })
  } catch (err) { next(err) }
})

export default router
