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

export default router
