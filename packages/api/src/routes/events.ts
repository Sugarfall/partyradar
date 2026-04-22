import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth, hasRole } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { getTier } from '@partyradar/shared'
import { ensureStripe } from '../lib/stripe'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import type { SubscriptionTier } from '@partyradar/shared'
import { dedupeEvents } from '../lib/dedupeEvents'
// Static import — avoids tsx's dynamic ESM loader blocking the Node.js main
// thread on the first ai-sync request (the dynamic import() previously
// triggered a synchronous 54KB TypeScript transformation that froze the
// event loop, causing the server to appear dead / zombie for 30+ seconds).
import { syncExternalEvents } from '../lib/eventSync'

const router = Router()

const eventSchema = z.object({
  name: z.string().min(3).max(100),
  type: z.enum(['HOME_PARTY', 'CLUB_NIGHT', 'CONCERT', 'PUB_NIGHT', 'BEACH_PARTY', 'YACHT_PARTY']),
  description: z.string().min(10).max(2000),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().min(3).max(200),
  neighbourhood: z.string().min(2).max(100),
  showNeighbourhoodOnly: z.boolean().default(false),
  capacity: z.number().int().min(1).max(10000),
  price: z.number().min(0).default(0),
  ticketQuantity: z.number().int().min(0).default(0),
  alcoholPolicy: z.enum(['NONE', 'PROVIDED', 'BYOB']).default('NONE'),
  ageRestriction: z.enum(['ALL_AGES', 'AGE_18', 'AGE_21']).default('ALL_AGES'),
  dressCode: z.string().max(200).optional(),
  whatToBring: z.array(z.string()).default([]),
  houseRules: z.string().max(1000).optional(),
  vibeTags: z.array(z.string()).max(8).default([]),
  isInviteOnly: z.boolean().default(false),
  djRequestsEnabled: z.boolean().default(false),
  partySigns: z.array(z.string()).max(16).default([]),
  lineup: z.string().max(500).optional(),
  venueName: z.string().max(200).optional(),
  venueId: z.string().optional(),
  coverImageUrl: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().url().optional()
  ),
})

const userSelect = {
  id: true, username: true, displayName: true,
  photoUrl: true, bio: true, ageVerified: true,
  alcoholFriendly: true, subscriptionTier: true,
}

/** GET /api/events — discover events */
router.get('/', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { type, lat, lng, radius = 50, alcohol, search: searchParam, q, page = '1', limit = '20', tonight } = req.query
    // Support both ?q= (new search bar) and ?search= (existing filters panel)
    const search = q ?? searchParam

    const skip = (Number(page) - 1) * Number(limit)

    // Include events that are currently in progress (started up to 8 h ago) as well as future ones
    const eightHoursAgo = new Date(Date.now() - 8 * 3_600_000)

    const where: Record<string, unknown> = {
      isPublished: true,
      isCancelled: false,
      startsAt: { gte: eightHoursAgo },
    }

    if (tonight === 'true') {
      // Use the same 8-hour lookback as the base filter so in-progress events
      // (e.g. a concert that started at 7pm viewed at 9pm) still show up.
      const tonightStart = new Date(Date.now() - 8 * 3_600_000)
      const midnight = new Date()
      midnight.setHours(23, 59, 59, 999)
      where['startsAt'] = { gte: tonightStart, lte: midnight }
    }

    if (type) {
      where['type'] = type
    } else {
      const excludeTypes = req.query['excludeTypes']
        ? String(req.query['excludeTypes']).split(',')
        : []
      if (excludeTypes.length > 0) {
        where['type'] = { notIn: excludeTypes }
      }
    }
    if (search) {
      where['OR'] = [
        { name:          { contains: search as string, mode: 'insensitive' } },
        { description:   { contains: search as string, mode: 'insensitive' } },
        { address:       { contains: search as string, mode: 'insensitive' } },
        { neighbourhood: { contains: search as string, mode: 'insensitive' } },
        { type:          { contains: search as string, mode: 'insensitive' } },
      ]
    }

    // Filter by specific venue or host
    const { venueId, hostId: hostIdFilter } = req.query
    if (venueId) where['venueId'] = venueId as string
    if (hostIdFilter) where['hostId'] = hostIdFilter as string

    // Geo filter
    if (lat && lng) {
      const latN = Number(lat), lngN = Number(lng), radN = Number(radius)
      // Bug 13 fix: 111 km per degree latitude (was 69, which is miles — radius is in km)
      const latDelta = radN / 111
      const lngDelta = radN / (111 * Math.cos((latN * Math.PI) / 180))
      where['lat'] = { gte: latN - latDelta, lte: latN + latDelta }
      where['lng'] = { gte: lngN - lngDelta, lte: lngN + lngDelta }
    }

    // Cross-source dedup (e.g. one concert synced from Ticketmaster + Skiddle
    // + SerpAPI = 3 DB rows) requires us to fetch a widened window and
    // collapse in JS before paginating. Prisma can't dedupe on a derived
    // fingerprint (first-word + day + rounded geo). The cap of 500 is an order
    // of magnitude more than any geo-bounded page needs and keeps the request
    // bounded regardless of how noisy the external feeds get.
    const MAX_FETCH = 500
    const allEvents = await prisma.event.findMany({
      where,
      take: MAX_FETCH,
      orderBy: [{ isFeatured: 'desc' }, { startsAt: 'asc' }],
      include: {
        host: { select: userSelect },
        _count: {
          select: {
            guests: { where: { status: 'CONFIRMED' } },
            savedBy: true,
          },
        },
      },
    })

    const deduped = dedupeEvents(allEvents)
    const total = deduped.length
    const paged = deduped.slice(skip, skip + Number(limit))

    const data = paged.map((e) => ({
      ...e,
      // Hide exact address for neighbourhood-only events
      address: e.showNeighbourhoodOnly && !req.user ? e.neighbourhood : e.address,
      guestCount: e._count.guests,
      savesCount: e._count.savedBy,
    }))

    res.json({ data, total, page: Number(page), limit: Number(limit), hasMore: skip + data.length < total })
  } catch (err) {
    next(err)
  }
})

/** GET /api/events/mine — get authenticated host's own events */
router.get('/mine', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const events = await prisma.event.findMany({
      where: { hostId: userId, isCancelled: false },
      orderBy: { startsAt: 'desc' },
      include: {
        host: { select: userSelect },
        _count: { select: { guests: { where: { status: 'CONFIRMED' } } } },
      },
    })
    const data = events.map((e) => ({ ...e, guestCount: e._count.guests }))
    res.json({ data })
  } catch (err) {
    next(err)
  }
})

/** GET /api/events/invite/:token */
router.get('/invite/:token', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({
      where: { inviteToken: String(req.params['token']) },
      include: { host: { select: userSelect }, _count: { select: { guests: true } } },
    })
    if (!event) throw new AppError('Invite link not found', 404)
    res.json({ data: { ...event, guestCount: event._count.guests } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/events/diagnostics — pipeline health check for admin panel */
router.get('/diagnostics', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!.dbUser
    if (!hasRole(user, 'MODERATOR')) {
      throw new AppError('Admin or Moderator access required', 403)
    }

    const now = new Date()
    const eightHoursAgo = new Date(Date.now() - 8 * 3_600_000)

    // 1. Total event counts
    const [totalEvents, liveEvents, upcomingEvents] = await Promise.all([
      prisma.event.count({ where: { isCancelled: false } }),
      prisma.event.count({ where: { isCancelled: false, isPublished: true, startsAt: { gte: eightHoursAgo } } }),
      prisma.event.count({ where: { isCancelled: false, isPublished: true, startsAt: { gte: now } } }),
    ])

    // 2. Event count by external source
    const sourceGroups = await prisma.event.groupBy({
      by: ['externalSource'],
      _count: { _all: true },
      where: { isCancelled: false, isPublished: true, startsAt: { gte: eightHoursAgo } },
    })
    const bySource: Record<string, number> = {}
    for (const sg of sourceGroups) {
      bySource[sg.externalSource ?? 'manual'] = sg._count._all
    }

    // 3. Events by type
    const typeGroups = await prisma.event.groupBy({
      by: ['type'],
      _count: { _all: true },
      where: { isCancelled: false, isPublished: true, startsAt: { gte: eightHoursAgo } },
    })
    const byType: Record<string, number> = {}
    for (const tg of typeGroups) {
      byType[tg.type] = tg._count._all
    }

    // 4. Most recently synced events (last 5)
    const recentEvents = await prisma.event.findMany({
      where: { isCancelled: false, externalSource: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, type: true, externalSource: true, createdAt: true, startsAt: true, neighbourhood: true },
    })

    // 5. API key presence (never expose the actual keys)
    const apiKeys = {
      ticketmaster: !!process.env['TICKETMASTER_API_KEY'],
      skiddle: !!process.env['SKIDDLE_API_KEY'],
      eventbrite: !!process.env['EVENTBRITE_PRIVATE_TOKEN'],
      serpapi: !!process.env['SERPAPI_KEY'],
      perplexity: !!process.env['PERPLEXITY_API_KEY'],
    }

    res.json({
      data: {
        counts: { total: totalEvents, live: liveEvents, upcoming: upcomingEvents },
        bySource,
        byType,
        recentSynced: recentEvents,
        apiKeys,
      },
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/events/ai-sync — trigger AI event discovery for a city (fire-and-forget) */
// Returns 202 immediately so the caller never hits a timeout. The actual
// Eventbrite + SerpAPI + Perplexity sync runs in the background. The frontend
// polls GET /events every 12 s while aiSyncing=true so events appear as each
// source completes rather than waiting for all sources to finish.
router.post('/ai-sync', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { city, lat, lng, force } = req.body as {
      city?: string; lat?: number; lng?: number; force?: boolean
    }
    if (!city || lat == null || lng == null) {
      throw new AppError('city, lat and lng are required', 400)
    }

    // Acknowledge immediately — sync runs in background
    res.status(202).json({ data: { status: 'syncing', city } })

    // Fire-and-forget: syncExternalEvents is statically imported so there is no
    // dynamic module-loading cost here that could block the event loop.
    syncExternalEvents(String(city), Number(lat), Number(lng), 'user', force === true)
      .then((r) => console.log(`[ai-sync] ${city}: imported ${r.imported}, skipped ${r.skipped}`))
      .catch((err) => console.error('[ai-sync] sync error:', err))
  } catch (err) {
    next(err)
  }
})

/** GET /api/events/:id */
router.get('/:id', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: String(req.params['id']) },
      include: {
        host: { select: userSelect },
        _count: {
          select: {
            guests: { where: { status: 'CONFIRMED' } },
            savedBy: true,
          },
        },
      },
    })

    if (!event || event.isCancelled) throw new AppError('Event not found', 404)

    if (event.isInviteOnly) {
      const token = req.query['token']
      const isHost = req.user?.dbUser.id === event.hostId
      const isGuest = req.user
        ? await prisma.eventGuest.findUnique({ where: { eventId_userId: { eventId: event.id, userId: req.user.dbUser.id } } })
        : null
      if (!isHost && !isGuest && token !== event.inviteToken) {
        throw new AppError('This event is invite-only', 403)
      }
    }

    // Note: alcohol filter applies to *discovery listings*, not direct event links.
    // Removing it here so authenticated users can always view a specific event.

    res.json({ data: { ...event, guestCount: event._count.guests, savesCount: event._count.savedBy } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/events — create event */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = eventSchema.parse(req.body)
    const user = req.user!.dbUser
    const tier = getTier(user.subscriptionTier)

    // Tier check: event creation limits
    if (tier.maxEventsPerMonth !== -1) {
      const thisMonth = new Date()
      thisMonth.setDate(1)
      thisMonth.setHours(0, 0, 0, 0)
      const count = await prisma.event.count({
        where: { hostId: user.id, createdAt: { gte: thisMonth } },
      })
      if (count >= tier.maxEventsPerMonth) {
        throw new AppError(`Your ${tier.name} plan allows ${tier.maxEventsPerMonth} event(s)/month. Upgrade to host more.`, 403, 'TIER_LIMIT')
      }
    }

    // Yacht & Beach parties require BASIC+ subscription
    if (body.type === 'YACHT_PARTY' && !tier.canViewYachtParties) {
      throw new AppError('Upgrade to Basic or higher to create Yacht Party events', 403, 'TIER_LIMIT')
    }
    if (body.type === 'BEACH_PARTY' && !tier.canViewBeachParties) {
      throw new AppError('Upgrade to Basic or higher to create Beach Party events', 403, 'TIER_LIMIT')
    }

    // Ticket sales require Pro+
    if (body.price > 0 && !tier.ticketSales) {
      throw new AppError('Upgrade to Pro to sell tickets', 403, 'TIER_LIMIT')
    }

    // Paid events must have ticket quantity > 0
    if (body.price > 0 && body.ticketQuantity <= 0) {
      throw new AppError('Paid events must have a ticket quantity greater than 0', 400)
    }

    // Paid events require a connected Stripe account so funds can flow to the host.
    if (body.price > 0) {
      const connect = await prisma.user.findUnique({
        where: { id: user.id },
        select: { stripeConnectChargesEnabled: true },
      })
      if (!connect?.stripeConnectChargesEnabled) {
        throw new AppError(
          'Finish Stripe payout setup before publishing a paid event. Visit /payouts to connect.',
          403,
          'CONNECT_REQUIRED',
        )
      }
    }

    // startsAt must be in the future
    if (new Date(body.startsAt) <= new Date()) {
      throw new AppError('Event start date must be in the future', 400)
    }

    // endsAt must be after startsAt if provided
    if (body.endsAt && new Date(body.endsAt) <= new Date(body.startsAt)) {
      throw new AppError('Event end time must be after the start time', 400)
    }

    const event = await prisma.event.create({
      data: {
        ...body,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        hostId: user.id,
        ticketsRemaining: body.ticketQuantity,
        isPublished: true,
        inviteToken: body.isInviteOnly ? uuidv4() : null,
        isFeatured: getTier(user.subscriptionTier).featuredPlacement,
      },
      include: { host: { select: userSelect } },
    })

    // Create Stripe product + price for paid events
    if (event.price > 0) {
      const stripe = ensureStripe()
      const product = await stripe.products.create({ name: event.name })
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(event.price * 100),
        currency: 'gbp',
      })
      await prisma.event.update({
        where: { id: event.id },
        data: { stripeProductId: product.id, stripePriceId: price.id },
      })
    }

    res.status(201).json({ data: event })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/events/:id */
router.put('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: String(req.params['id']) } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    // Extended schema for updates — includes fields not in base create schema
    const updateSchema = eventSchema.partial().extend({
      accentColor: z.string().max(20).optional().nullable(),
      lineup: z.string().max(500).optional().nullable(),
      partySigns: z.array(z.string()).optional(),
    })

    const body = updateSchema.parse(req.body)
    const { accentColor, lineup, partySigns, ...rest } = body

    const updated = await prisma.event.update({
      where: { id: event.id },
      data: {
        ...rest,
        startsAt: rest.startsAt ? new Date(rest.startsAt) : undefined,
        endsAt: rest.endsAt ? new Date(rest.endsAt) : undefined,
        accentColor: accentColor !== undefined ? accentColor : undefined,
        lineup: lineup !== undefined ? lineup : undefined,
        partySigns: partySigns !== undefined ? partySigns : undefined,
      },
      include: { host: { select: userSelect } },
    })

    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/events/:id — cancel event + refund all paid tickets */
router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const eventId = String(req.params['id'])
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, hostId: true, name: true, price: true },
    })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    // Cancel the event
    await prisma.event.update({ where: { id: event.id }, data: { isCancelled: true } })

    // Refund wallet for all paid tickets on this event
    let refundCount = 0
    if (event.price > 0) {
      const tickets = await prisma.ticket.findMany({
        where: { eventId, scannedAt: null },
        select: { id: true, userId: true, pricePaid: true },
      })

      for (const ticket of tickets) {
        if (ticket.pricePaid <= 0) continue
        const wallet = await prisma.wallet.findUnique({ where: { userId: ticket.userId } })
        if (!wallet) continue
        await prisma.$transaction([
          prisma.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: ticket.pricePaid } },
          }),
          prisma.walletTransaction.create({
            data: {
              walletId:    wallet.id,
              type:        'BONUS',
              amount:      ticket.pricePaid,
              balanceAfter: wallet.balance + ticket.pricePaid,
              description: `Refund: Event cancelled — "${event.name.slice(0, 60)}"`,
              status:      'COMPLETED',
              eventId,
            },
          }),
        ])
        refundCount++
      }
    }

    res.json({ data: { success: true, ticketsRefunded: refundCount } })
  } catch (err) {
    next(err)
  }
})

// ── Moderator endpoints ────────────────────────────────────────────────────────

/** GET /api/events/:id/moderators — list moderators (host only) */
router.get('/:id/moderators', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: String(req.params['id']) } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    const moderators = await prisma.eventModerator.findMany({
      where: { eventId: event.id },
      include: {
        user: { select: { id: true, username: true, displayName: true, photoUrl: true } },
        addedBy: { select: { id: true, displayName: true } },
      },
      orderBy: { addedAt: 'asc' },
    })

    res.json({ data: moderators })
  } catch (err) {
    next(err)
  }
})

/** POST /api/events/:id/moderators — add a moderator (host only) */
router.post('/:id/moderators', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: String(req.params['id']) } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    const { userId } = req.body as { userId: string }
    if (!userId) throw new AppError('userId is required', 400)

    // Can't make the host a moderator of their own event
    if (userId === event.hostId) throw new AppError('The host cannot be added as a moderator', 400)

    // Ensure the user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true, photoUrl: true },
    })
    if (!targetUser) throw new AppError('User not found', 404)

    const moderator = await prisma.eventModerator.upsert({
      where: { eventId_userId: { eventId: event.id, userId } },
      create: { eventId: event.id, userId, addedById: req.user!.dbUser.id },
      update: {},
      include: {
        user: { select: { id: true, username: true, displayName: true, photoUrl: true } },
        addedBy: { select: { id: true, displayName: true } },
      },
    })

    res.status(201).json({ data: moderator })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/events/:id/moderators/:userId — remove a moderator (host only) */
router.delete('/:id/moderators/:userId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: String(req.params['id']) } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    const userId = String(req.params['userId'])
    await prisma.eventModerator.deleteMany({
      where: { eventId: event.id, userId },
    })

    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

export default router
