import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { PUSH_BLAST_TIERS } from '@partyradar/shared'
import { ensureStripe } from '../lib/stripe'

const router = Router()

// ── GET /api/dashboard — host overview (analytics, sales, events, groups) ────
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id

    // Fetch host's events with guest & ticket counts
    const events = await prisma.event.findMany({
      where: { hostId: userId },
      orderBy: { startsAt: 'desc' },
      include: {
        _count: { select: { guests: true, tickets: true } },
      },
    })

    // Total ticket revenue for this host
    const ticketAgg = await prisma.ticket.aggregate({
      where: { event: { hostId: userId } },
      _sum: { pricePaid: true, platformFee: true },
      _count: true,
    })

    // Group earnings (paid groups owned by host)
    const ownedGroups = await prisma.groupChat.findMany({
      where: { createdById: userId },
      include: {
        _count: { select: { memberships: true, subscriptions: true } },
      },
    })

    const groupRevenue = ownedGroups
      .filter((g) => g.isPaid && g.priceMonthly)
      .reduce((sum, g) => {
        const subCount = g._count.subscriptions
        // Creator gets 80% of price × subscribers
        return sum + (g.priceMonthly! * 0.8 * subCount)
      }, 0)

    // Upcoming events (not cancelled, starts in future)
    const upcoming = events.filter(
      (e) => !e.isCancelled && new Date(e.startsAt) > new Date()
    )

    // Past events
    const past = events.filter(
      (e) => new Date(e.startsAt) <= new Date()
    )

    // Recent attendees across all host events
    const recentGuests = await prisma.eventGuest.findMany({
      where: { event: { hostId: userId }, status: { in: ['CONFIRMED', 'PENDING'] } },
      orderBy: { invitedAt: 'desc' },
      take: 50,
      include: {
        user: {
          select: { id: true, displayName: true, username: true, photoUrl: true },
        },
        event: {
          select: { id: true, name: true, startsAt: true },
        },
      },
    })

    // Push blast history
    const blasts = await prisma.pushBlast.findMany({
      where: { hostId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // Queue position: how many blasts are queued ahead of this user
    const queuedAhead = await prisma.pushBlast.count({
      where: { status: 'QUEUED', scheduledFor: { lte: new Date() } },
    })

    // Referral info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralBalance: true, referralCode: true },
    })

    res.json({
      data: {
        stats: {
          totalEvents: events.length,
          upcomingEvents: upcoming.length,
          totalTicketsSold: ticketAgg._count,
          ticketRevenue: ticketAgg._sum.pricePaid?.toNumber() ?? 0,
          platformFees: ticketAgg._sum.platformFee?.toNumber() ?? 0,
          groupRevenue,
          totalGroups: ownedGroups.length,
          totalSubscribers: ownedGroups.reduce((s, g) => s + g._count.subscriptions, 0),
          referralBalance: user?.referralBalance?.toNumber() ?? 0,
        },
        events: events.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          startsAt: e.startsAt.toISOString(),
          endsAt: e.endsAt?.toISOString() ?? null,
          coverImageUrl: e.coverImageUrl,
          price: e.price,
          capacity: e.capacity,
          ticketsRemaining: e.ticketsRemaining,
          isCancelled: e.isCancelled,
          isFeatured: e.isFeatured,
          guestCount: e._count.guests,
          ticketCount: e._count.tickets,
          neighbourhood: e.neighbourhood,
        })),
        groups: ownedGroups.map((g) => ({
          id: g.id,
          name: g.name,
          emoji: g.emoji,
          isPaid: g.isPaid,
          priceMonthly: g.priceMonthly,
          memberCount: g._count.memberships,
          subscriberCount: g._count.subscriptions,
          monthlyRevenue: g.isPaid && g.priceMonthly
            ? g.priceMonthly * 0.8 * g._count.subscriptions
            : 0,
        })),
        recentAttendees: recentGuests.map((g) => ({
          id: g.id,
          user: g.user,
          event: g.event,
          status: g.status,
          invitedAt: g.invitedAt.toISOString(),
        })),
        blasts,
        blastQueue: { queuedAhead },
      },
    })
  } catch (err) { next(err) }
})

// ── GET /api/dashboard/events/:id/attendees — full attendee list for an event
router.get('/events/:id/attendees', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const eventId = req.params['id']!

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== userId) throw new AppError('Forbidden', 403)

    const guests = await prisma.eventGuest.findMany({
      where: { eventId },
      orderBy: { invitedAt: 'desc' },
      include: {
        user: {
          select: { id: true, displayName: true, username: true, photoUrl: true, gender: true },
        },
      },
    })

    const tickets = await prisma.ticket.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, displayName: true, username: true, photoUrl: true },
        },
      },
    })

    // Gender breakdown
    const genderCounts = { male: 0, female: 0, nonBinary: 0, unknown: 0 }
    for (const g of guests) {
      if (g.user.gender === 'MALE') genderCounts.male++
      else if (g.user.gender === 'FEMALE') genderCounts.female++
      else if (g.user.gender === 'NON_BINARY') genderCounts.nonBinary++
      else genderCounts.unknown++
    }

    res.json({
      data: {
        guests: guests.map((g) => ({
          id: g.id,
          user: g.user,
          status: g.status,
          invitedAt: g.invitedAt.toISOString(),
        })),
        tickets: tickets.map((t) => ({
          id: t.id,
          user: t.user,
          pricePaid: t.pricePaid.toNumber(),
          scannedAt: t.scannedAt?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
        })),
        genderBreakdown: genderCounts,
        totalGuests: guests.length,
        totalTickets: tickets.length,
      },
    })
  } catch (err) { next(err) }
})

// ── POST /api/dashboard/blast — queue a push blast with conflict handling ─────
router.post('/blast', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const stripe = ensureStripe()
    const userId = req.user!.dbUser.id
    const { eventId, tierId, title, body } = req.body as {
      eventId: string; tierId: string; title: string; body: string
    }

    if (!title?.trim() || !body?.trim()) throw new AppError('Title and body required', 400)

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== userId) throw new AppError('Forbidden', 403)

    const tier = PUSH_BLAST_TIERS.find((t) => t.id === tierId)
    if (!tier) throw new AppError('Invalid blast tier', 400)

    // Check how many blasts are already queued — space them 3 minutes apart
    const queuedCount = await prisma.pushBlast.count({
      where: { status: 'QUEUED' },
    })

    const scheduledFor = new Date(Date.now() + queuedCount * 3 * 60 * 1000) // 3 min gap per queued blast

    // Create Stripe checkout for blast payment
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          unit_amount: Math.round(tier.price * 100),
          product_data: {
            name: `PartyRadar Push Blast — ${tier.label}`,
            description: `Notify ${tier.reach} nearby users`,
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env['FRONTEND_URL'] ?? 'https://partyradar-web.vercel.app'}/dashboard?blast=queued`,
      cancel_url: `${process.env['FRONTEND_URL'] ?? 'https://partyradar-web.vercel.app'}/dashboard`,
      metadata: {
        type: 'push_blast_queued',
        eventId,
        tierId,
        title: title.slice(0, 100),
        body: body.slice(0, 200),
        userId,
        scheduledFor: scheduledFor.toISOString(),
      },
    })

    res.json({
      data: {
        checkoutUrl: session.url,
        queuePosition: queuedCount + 1,
        estimatedSendTime: scheduledFor.toISOString(),
        tier: {
          label: tier.label,
          price: tier.price,
          reach: tier.reach,
          radius: tier.radius,
        },
      },
    })
  } catch (err) { next(err) }
})

// ── GET /api/dashboard/blast/queue — view current blast queue ─────────────────
router.get('/blast/queue', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const queued = await prisma.pushBlast.findMany({
      where: { status: { in: ['QUEUED', 'SENDING'] } },
      orderBy: { scheduledFor: 'asc' },
      take: 20,
    })

    res.json({
      data: {
        queue: queued.map((b) => ({
          id: b.id,
          eventId: b.eventId,
          tierId: b.tierId,
          title: b.title,
          scheduledFor: b.scheduledFor.toISOString(),
          status: b.status,
          reach: b.reach,
        })),
        totalQueued: queued.length,
      },
    })
  } catch (err) { next(err) }
})

// ── PUT /api/dashboard/events/:id — quick update event from dashboard ────────
router.put('/events/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const eventId = req.params['id']!

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== userId) throw new AppError('Forbidden', 403)

    // Allow updating key fields
    const allowed = [
      'name', 'description', 'capacity', 'price', 'isCancelled',
      'isPublished', 'coverImageUrl', 'accentColor', 'dressCode',
      'houseRules', 'alcoholPolicy', 'ageRestriction', 'isInviteOnly',
    ] as const

    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key]
    }

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: update,
    })

    res.json({ data: updated })
  } catch (err) { next(err) }
})

// ── DELETE /api/dashboard/guests/:id — remove a guest from event ─────────────
router.delete('/guests/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const guestId = req.params['id']!

    const guest = await prisma.eventGuest.findUnique({
      where: { id: guestId },
      include: { event: { select: { hostId: true } } },
    })
    if (!guest) throw new AppError('Guest not found', 404)
    if (guest.event.hostId !== userId) throw new AppError('Forbidden', 403)

    await prisma.eventGuest.update({
      where: { id: guestId },
      data: { status: 'REMOVED' },
    })

    res.json({ data: { success: true } })
  } catch (err) { next(err) }
})

export default router
