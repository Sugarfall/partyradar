import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth, hasRole } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { getTier } from '@partyradar/shared'
import { ensureStripe } from '../lib/stripe'
import { assertOwnImageUrl } from '../lib/cloudinary'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import type { SubscriptionTier } from '@partyradar/shared'
import { dedupeEvents } from '../lib/dedupeEvents'
// Static import — avoids tsx's dynamic ESM loader blocking the Node.js main
// thread on the first ai-sync request (the dynamic import() previously
// triggered a synchronous 54KB TypeScript transformation that froze the
// event loop, causing the server to appear dead / zombie for 30+ seconds).
import { syncExternalEvents } from '../lib/eventSync'
import { moderateText, recordViolation } from '../lib/moderation'

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
    const { type, lat, lng, radius = 50, alcohol, search: searchParam, q, page = '1', tonight } = req.query
    // Support both ?q= (new search bar) and ?search= (existing filters panel)
    const search = q ?? searchParam

    const now = new Date()
    // Events without an explicit endsAt use a 5h window from startsAt — this matches
    // the longest default in eventTiming.ts (CLUB_NIGHT / HOME_PARTY). The frontend
    // trims further per type using effectiveEndMs so pubs don't show "LIVE" at 4 AM.
    const fiveHoursAgo = new Date(Date.now() - 5 * 3_600_000)

    const where: Record<string, unknown> = {
      isPublished: true,
      isCancelled: false,
      // Use nested OR so ended events don't leak through regardless of their startsAt.
      AND: [
        {
          OR: [
            { startsAt: { gte: now } },                           // future events
            { endsAt: { gte: now } },                             // live with explicit end time
            { endsAt: null, startsAt: { gte: fiveHoursAgo } },   // live without end (5h max window)
          ],
        },
      ],
    }

    if (tonight === 'true') {
      const midnight = new Date()
      midnight.setHours(23, 59, 59, 999)
      // Tonight: only events starting today, that are live or upcoming
      ;(where['AND'] as any[])[0] = {
        OR: [
          { startsAt: { gte: now, lte: midnight } },
          { endsAt: { gte: now }, startsAt: { lte: midnight } },
          { endsAt: null, startsAt: { gte: fiveHoursAgo, lte: midnight } },
        ],
      }
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
      // Push search into AND so it doesn't overwrite the timing OR filter above
      ;(where['AND'] as any[]).push({
        OR: [
          { name:          { contains: search as string, mode: 'insensitive' } },
          { description:   { contains: search as string, mode: 'insensitive' } },
          { address:       { contains: search as string, mode: 'insensitive' } },
          { neighbourhood: { contains: search as string, mode: 'insensitive' } },
          { type:          { contains: search as string, mode: 'insensitive' } },
        ],
      })
    }

    // Filter by specific venue or host
    const { venueId, hostId: hostIdFilter } = req.query
    if (venueId) where['venueId'] = venueId as string
    if (hostIdFilter) where['hostId'] = hostIdFilter as string

    // Geo filter
    if (lat && lng) {
      const latN = Number(lat), lngN = Number(lng)
      // Clamp radius to 1–500 km to prevent abuse / runaway DB scans
      const radN = Math.min(Math.max(Number(radius), 1), 500)
      // Bug 13 fix: 111 km per degree latitude (was 69, which is miles — radius is in km)
      const latDelta = radN / 111
      const lngDelta = radN / (111 * Math.cos((latN * Math.PI) / 180))
      where['lat'] = { gte: latN - latDelta, lte: latN + latDelta }
      where['lng'] = { gte: lngN - lngDelta, lte: lngN + lngDelta }
    }

    // ── SAFE QUERY STRATEGY (Neon free-tier stabilisation) ──────────────────
    // Root cause of previous 60-second hangs: any findMany with take>~5 causes
    // Prisma's Rust engine to block on a socket read that never completes (cold
    // Neon compute + zombie pool connections), freezing the Node.js event loop
    // and preventing even setTimeout race-timeouts from firing.
    //
    // Solution: run multiple sequential queries each capped at QUERY_LIMIT (5),
    // combining their results to serve PAGE_LIMIT (20) events per logical page.
    // This gives users 20 events/page while each individual DB query stays safe.
    // Cross-source dedup remains temporarily disabled (re-enable once Neon pooler
    // is active or the serverless driver is adopted).
    const PAGE_LIMIT  = 20  // logical events per page returned to client
    const QUERY_LIMIT = 5   // max safe `take` per individual Prisma query

    // Recalculate skip using PAGE_LIMIT (ignore client's `limit` param for skip
    // so pagination is always consistent regardless of what the frontend sends).
    const pageSkip = (Number(page) - 1) * PAGE_LIMIT

    const race = <T>(label: string, p: Promise<T>): Promise<T> =>
      Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after 12s`)), 12_000)
        ),
      ])

    // Step 1: count (fast ~200ms, used for hasMore detection)
    const total = await race('count', prisma.event.count({ where }))

    // Step 2: collect PAGE_LIMIT events via sequential safe sub-queries.
    // ORDER BY startsAt ASC is index-backed — safe on Neon free-tier.
    const events: Awaited<ReturnType<typeof prisma.event.findMany>> = []
    const batchCount = Math.ceil(PAGE_LIMIT / QUERY_LIMIT)
    for (let b = 0; b < batchCount && events.length < PAGE_LIMIT; b++) {
      const batch = await race(`findMany_b${b}`, prisma.event.findMany({
        where,
        take: QUERY_LIMIT,
        skip: pageSkip + b * QUERY_LIMIT,
        orderBy: { startsAt: 'asc' },
      }))
      events.push(...batch)
      if (batch.length < QUERY_LIMIT) break  // reached end of results early
    }

    const pagedIds = events.map((e) => e.id)

    // Step 3: host lookup for this page's events (sequential, single connection)
    type HostRow = { id: string; username: string; displayName: string; photoUrl: string | null; bio: string | null; ageVerified: boolean; alcoholFriendly: boolean; subscriptionTier: string }
    const hostMap: Record<string, HostRow> = {}
    const uniqueHostIds = [...new Set(events.map((e) => e.hostId))]
    if (uniqueHostIds.length > 0) {
      const hosts = await race('hostLookup', prisma.user.findMany({
        where: { id: { in: uniqueHostIds } },
        select: userSelect,
      }))
      for (const h of hosts) hostMap[h.id] = h as HostRow
    }

    // Step 4: guestCount + savesCount via groupBy
    type GBRow = { eventId: string; _count: { id: number } }
    let guestRows: GBRow[] = []
    let savesRows: GBRow[] = []
    if (pagedIds.length > 0) {
      guestRows = await race('guestGroupBy',
        prisma.eventGuest.groupBy({
          by: ['eventId'],
          where: { eventId: { in: pagedIds }, status: 'CONFIRMED' },
          _count: { id: true },
        }) as unknown as Promise<GBRow[]>
      )
      savesRows = await race('savesGroupBy',
        prisma.savedEvent.groupBy({
          by: ['eventId'],
          where: { eventId: { in: pagedIds } },
          _count: { id: true },
        }) as unknown as Promise<GBRow[]>
      )
    }
    const guestCountMap: Record<string, number> = {}
    for (const r of guestRows) guestCountMap[r.eventId] = r._count.id
    const savesCountMap: Record<string, number> = {}
    for (const r of savesRows) savesCountMap[r.eventId] = r._count.id

    const data = events.map((e) => ({
      ...e,
      host: hostMap[e.hostId] ?? null,
      // Hide exact address for neighbourhood-only events
      address: e.showNeighbourhoodOnly && !req.user ? e.neighbourhood : e.address,
      guestCount: guestCountMap[e.id] ?? 0,
      savesCount: savesCountMap[e.id] ?? 0,
    }))

    res.json({ data, total, page: Number(page), limit: PAGE_LIMIT, hasMore: pageSkip + data.length < total })
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

// Per-city cooldown to prevent quota drain on Eventbrite/SerpAPI/Perplexity.
// Admins can bypass via `force: true` (already auth-gated so no abuse surface).
const aiSyncCooldowns = new Map<string, number>()
const AI_SYNC_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes per city

/** Evict expired cooldown entries — called on every write to bound map size. */
function pruneAiSyncCooldowns(): void {
  const cutoff = Date.now() - AI_SYNC_COOLDOWN_MS
  for (const [city, ts] of aiSyncCooldowns) {
    if (ts < cutoff) aiSyncCooldowns.delete(city)
  }
}

/** POST /api/events/ai-sync — trigger AI event discovery for a city (fire-and-forget) */
// Returns 202 immediately so the caller never hits a timeout. The actual
// Eventbrite + SerpAPI + Perplexity sync runs in the background. The frontend
// polls GET /events every 12 s while aiSyncing=true so events appear as each
// source completes rather than waiting for all sources to finish.
router.post('/ai-sync', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { city, lat, lng, force } = req.body as {
      city?: string; lat?: number; lng?: number; force?: boolean
    }
    if (!city || lat == null || lng == null) {
      throw new AppError('city, lat and lng are required', 400)
    }

    const cityKey = String(city).trim().toLowerCase().slice(0, 100)
    // Reject city names containing special characters to prevent prompt injection / log spam
    if (!/^[a-z0-9\s\-',\.]+$/.test(cityKey)) {
      throw new AppError('Invalid city name — letters, numbers and basic punctuation only', 400)
    }
    const isAdmin = req.user!.dbUser.isAdmin
    const forceOverride = force === true && isAdmin

    // Enforce cooldown for non-admin users (or non-forced admin calls)
    if (!forceOverride) {
      const lastSync = aiSyncCooldowns.get(cityKey) ?? 0
      const elapsed = Date.now() - lastSync
      if (elapsed < AI_SYNC_COOLDOWN_MS) {
        const waitSecs = Math.ceil((AI_SYNC_COOLDOWN_MS - elapsed) / 1000)
        res.status(429).json({ error: `City sync on cooldown — try again in ${waitSecs}s` })
        return
      }
    }

    pruneAiSyncCooldowns()
    aiSyncCooldowns.set(cityKey, Date.now())

    // Acknowledge immediately — sync runs in background
    res.status(202).json({ data: { status: 'syncing', city } })

    // Fire-and-forget: syncExternalEvents is statically imported so there is no
    // dynamic module-loading cost here that could block the event loop.
    syncExternalEvents(cityKey, Number(lat), Number(lng), 'user', forceOverride)
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
        venue: {
          select: {
            id: true, name: true,
            address: true, lat: true, lng: true,
            photoUrl: true, website: true,
          },
        },
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

    // Redact exact address for neighbourhood-only events.
    // Only the host and confirmed guests see the full address — everyone else
    // gets the neighbourhood string, matching the intention of the flag.
    let displayAddress = event.address
    if (event.showNeighbourhoodOnly) {
      const isHost = req.user?.dbUser.id === event.hostId
      if (!isHost) {
        const isConfirmedGuest = req.user
          ? !!(await prisma.eventGuest.findFirst({
              where: {
                eventId: event.id,
                userId: req.user.dbUser.id,
                status: 'CONFIRMED',
              },
              select: { id: true },
            }))
          : false
        if (!isConfirmedGuest) displayAddress = event.neighbourhood
      }
    }

    // When a verified venue is linked, its address/coordinates are more
    // reliable than what was scraped from external ticket APIs.  Override
    // the event-level geo fields so the map, weather widget, and Uber link
    // all point to the correct physical location.
    const v = (event as any).venue
    const resolvedLat     = v?.lat     ?? event.lat
    const resolvedLng     = v?.lng     ?? event.lng
    const resolvedAddress = v?.address ?? displayAddress

    res.json({
      data: {
        ...event,
        address:     event.showNeighbourhoodOnly ? displayAddress : resolvedAddress,
        lat:         resolvedLat,
        lng:         resolvedLng,
        guestCount:  event._count.guests,
        savesCount:  event._count.savedBy,
      },
    })
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

    // Tier check: event creation limits — count by startsAt so hosts who
    // create next month's event early don't lose quota for this month.
    if (tier.maxEventsPerMonth !== -1) {
      const thisMonth = new Date()
      thisMonth.setDate(1)
      thisMonth.setHours(0, 0, 0, 0)
      const count = await prisma.event.count({
        where: { hostId: user.id, isCancelled: false, startsAt: { gte: thisMonth } },
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

    // Validate date strings before using them (new Date("garbage") gives Invalid Date,
    // which compares as NaN and silently passes the <= check — reject early with a clear error)
    const startsAtDate = new Date(body.startsAt)
    if (isNaN(startsAtDate.getTime())) throw new AppError('Invalid startsAt date', 400)
    if (startsAtDate <= new Date()) throw new AppError('Event start date must be in the future', 400)

    let endsAtDate: Date | null = null
    if (body.endsAt) {
      endsAtDate = new Date(body.endsAt)
      if (isNaN(endsAtDate.getTime())) throw new AppError('Invalid endsAt date', 400)
      if (endsAtDate <= startsAtDate) throw new AppError('Event end time must be after the start time', 400)
    }

    // Content moderation — check name + description for illegal/hateful content
    const textToCheck = [body.name, body.description, body.houseRules].filter(Boolean).join(' ')
    const modResult = await moderateText(textToCheck)
    if (!modResult.passed) {
      await recordViolation({
        userId: user.id,
        contentType: 'event',
        content: textToCheck.slice(0, 500),
        flagType: modResult.flagType ?? 'UNKNOWN',
        confidence: modResult.confidence ?? 1,
        reason: modResult.reason ?? 'Content policy violation',
        action: 'BLOCKED',
      }).catch(() => {})  // non-blocking — don't fail the request if logging fails
      throw new AppError(
        'Event content violates our community guidelines. Please review your event name and description.',
        422,
        'CONTENT_VIOLATION',
      )
    }

    // If a known venue is linked, trust its curated address/coordinates
    // over whatever the client submitted — prevents wrong pins on the map.
    let venueGeo: { address: string; lat: number; lng: number } | null = null
    if (body.venueId) {
      venueGeo = await prisma.venue.findUnique({
        where: { id: body.venueId },
        select: { address: true, lat: true, lng: true },
      })
    }

    const event = await prisma.event.create({
      data: {
        ...body,
        ...(venueGeo ?? {}),
        startsAt: startsAtDate,
        endsAt: endsAtDate,
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

    // Reject hotlinked cover images — must be uploaded through our Cloudinary
    if (rest.coverImageUrl) assertOwnImageUrl(rest.coverImageUrl)

    // If the price changed for a paid event, Stripe Prices are immutable —
    // we must create a new Price and archive the old one, otherwise checkout
    // sessions will still charge the old amount.
    let newStripePriceId: string | undefined
    if (
      rest.price !== undefined &&
      rest.price > 0 &&
      rest.price !== event.price &&
      event.stripeProductId
    ) {
      try {
        const stripe = ensureStripe()
        const newPrice = await stripe.prices.create({
          product: event.stripeProductId,
          unit_amount: Math.round(rest.price * 100),
          currency: 'gbp',
        })
        newStripePriceId = newPrice.id
        // Archive the old price so it can't be used for new purchases
        if (event.stripePriceId) {
          await stripe.prices.update(event.stripePriceId, { active: false }).catch(() => {
            // Non-fatal — old price becomes inactive asynchronously;
            // if it already has no active checkout sessions this is fine.
          })
        }
      } catch (stripeErr) {
        console.error('[Events] Failed to update Stripe Price on event edit:', stripeErr)
        // Don't block the DB update — worst case the checkout uses the old price
        // until the next deploy. Log it so we can investigate.
      }
    }

    // If price changed to 0 (making event free), archive the old Stripe Price
    if (rest.price === 0 && event.price > 0 && event.stripePriceId) {
      try {
        const stripe = ensureStripe()
        await stripe.prices.update(event.stripePriceId, { active: false }).catch(() => {})
      } catch {}
    }

    // If a venue is being linked (new or changed), pull its curated coordinates
    const venueIdForUpdate = rest.venueId ?? event.venueId
    let updateVenueGeo: { address: string; lat: number; lng: number } | null = null
    if (venueIdForUpdate && (rest.venueId || !event.venueId)) {
      updateVenueGeo = await prisma.venue.findUnique({
        where: { id: venueIdForUpdate },
        select: { address: true, lat: true, lng: true },
      })
    }

    const updated = await prisma.event.update({
      where: { id: event.id },
      data: {
        ...rest,
        ...(updateVenueGeo ?? {}),
        startsAt: rest.startsAt ? new Date(rest.startsAt) : undefined,
        endsAt: rest.endsAt ? new Date(rest.endsAt) : undefined,
        accentColor: accentColor !== undefined ? accentColor : undefined,
        lineup: lineup !== undefined ? lineup : undefined,
        partySigns: partySigns !== undefined ? partySigns : undefined,
        // Clear Stripe IDs when event becomes free; set new price ID when changed
        ...(rest.price === 0 && event.price > 0
          ? { stripePriceId: null, stripeProductId: null }
          : newStripePriceId
          ? { stripePriceId: newStripePriceId }
          : {}),
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

    // Refund all unscanned paid tickets.
    // • Stripe-paid tickets → issue a Stripe refund (money back to card).
    // • Tickets without a stripePaymentId → credit the user's wallet instead.
    let refundCount = 0
    if (event.price > 0) {
      const tickets = await prisma.ticket.findMany({
        where: { eventId, scannedAt: null },
        select: { id: true, userId: true, pricePaid: true, stripePaymentId: true },
      })

      for (const ticket of tickets) {
        if (ticket.pricePaid <= 0) continue

        if (ticket.stripePaymentId) {
          // Return money to the original card via Stripe refund
          try {
            const stripe = ensureStripe()
            await stripe.refunds.create({ payment_intent: ticket.stripePaymentId })
          } catch (stripeErr) {
            // Log but don't abort — the event is already cancelled. If the
            // refund fails (e.g. already refunded), the user can raise a dispute.
            console.error(`[cancel-event] Stripe refund failed for ticket ${ticket.id}:`, stripeErr)
          }
        } else {
          // No Stripe payment on record → credit wallet (free-tier or legacy flow)
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
                type:        'TOP_UP',
                amount:      ticket.pricePaid,
                balanceAfter: wallet.balance + ticket.pricePaid,
                description: `Refund: Event cancelled — "${event.name.slice(0, 60)}"`,
                status:      'COMPLETED',
                eventId,
              },
            }),
          ])
        }
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
