import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { z } from 'zod'
import { ensureStripe } from '../lib/stripe'
import { REVENUE_MODEL } from '@partyradar/shared'

const GOOGLE_API_KEY = process.env['GOOGLE_PLACES_API_KEY'] ?? ''

/** Fetch opening hours from Google Places for a venue that has a googlePlaceId */
async function fetchAndStoreHours(venueId: string, googlePlaceId: string): Promise<string[] | null> {
  if (!GOOGLE_API_KEY) return null
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${googlePlaceId}&fields=opening_hours&key=${GOOGLE_API_KEY}`
    const r = await fetch(url)
    const data = await r.json() as { status: string; result?: { opening_hours?: { weekday_text?: string[] } } }
    if (data.status !== 'OK' || !data.result?.opening_hours?.weekday_text) return null
    const weekdayText = data.result.opening_hours.weekday_text
    // Persist back to DB so next request is instant
    await prisma.venue.update({ where: { id: venueId }, data: { openingHours: weekdayText } })
    return weekdayText
  } catch {
    return null
  }
}

const router = Router()

const venueSchema = z.object({
  name: z.string().min(2).max(120),
  address: z.string().min(3).max(200),
  city: z.string().min(2).max(100),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  type: z.enum(['BAR', 'NIGHTCLUB', 'CONCERT_HALL', 'ROOFTOP_BAR', 'PUB', 'LOUNGE']),
  description: z.string().max(2000).optional(),
  phone: z.string().max(30).optional(),
  website: z.string().url().optional(),
  photoUrl: z.string().url().optional(),
  vibeTags: z.array(z.string()).max(10).default([]),
})

const venueUpdateSchema = venueSchema.partial()

const venueSelect = {
  id: true,
  googlePlaceId: true,
  name: true,
  address: true,
  city: true,
  lat: true,
  lng: true,
  type: true,
  description: true,
  phone: true,
  website: true,
  photoUrl: true,
  rating: true,
  openingHours: true,
  vibeTags: true,
  isClaimed: true,
  claimedById: true,
  createdAt: true,
  updatedAt: true,
  spotifyConnected: true,
  spotifyDisplayName: true,
  isSponsored: true,
  sponsoredUntil: true,
  promotionRadius: true,
}

/** Normalise a venue name for cross-source deduplication.
 *  "The Stereo Glasgow" and "Stereo" both → "stereo". */
function normalizeVenueName(name: string): string {
  let s = name.toLowerCase()
  s = s.replace(/[^\p{L}\p{N}\s]/gu, '')      // strip punctuation
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/^(the|a|an)\s+/, '')           // strip leading articles
  s = s.replace(/([bcdfghjklmnpqrstvwxz])\1+/g, '$1') // collapse doubled consonants
  // Drop trailing city tokens — "stereo glasgow" → "stereo"
  s = s
    .replace(/\s+(glasgow|edinburgh|london|manchester|birmingham|liverpool|leeds|sheffield|bristol|cardiff|belfast|dublin|dundee|aberdeen|scotland|england|wales|uk)\s*$/gi, '')
    .trim()
  return s
}

/** Deduplicate venues that represent the same real-world location but were
 *  ingested from multiple sources (seed-venues + Google Places discover).
 *  When two records share the same normalised name + city, keep the one
 *  with the richer data (prefers googlePlaceId → longer address → first seen). */
function dedupeVenuesByName<T extends { id: string; name: string; city: string; googlePlaceId?: string | null; address?: string }>(venues: T[]): T[] {
  function score(v: T): number {
    return (v.googlePlaceId ? 4 : 0) + Math.min((v.address?.length ?? 0), 10)
  }
  const best = new Map<string, T>()
  for (const v of venues) {
    const key = `${normalizeVenueName(v.name)}|${v.city.toLowerCase().trim()}`
    const existing = best.get(key)
    if (!existing || score(v) > score(existing)) {
      best.set(key, v)
    }
  }
  // Preserve original order — keep only the winning record per key
  const winners = new Set(best.values())
  return venues.filter((v) => winners.has(v))
}

/** Haversine distance in km between two lat/lng points */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** GET /api/venues — list/search venues */
router.get('/', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const {
      q,
      lat,
      lng,
      radius = '10',
      type,
      city,
      page = '1',
      limit = '20',
    } = req.query

    const pageN  = Number(page)
    const limitN = Number(limit)
    const skip   = (pageN - 1) * limitN

    const where: Record<string, unknown> = {}

    if (city) where['city'] = { contains: city as string, mode: 'insensitive' }
    if (q)    where['name'] = { contains: q as string, mode: 'insensitive' }
    if (type) where['type'] = type

    const hasGeo = !!(lat && lng)
    let latN = 0, lngN = 0

    // Geo bounding box filter
    if (hasGeo) {
      latN = Number(lat)
      lngN = Number(lng)
      const radN     = Number(radius)
      const latDelta = radN / 111
      const lngDelta = radN / (111 * Math.cos((latN * Math.PI) / 180))
      where['lat'] = { gte: latN - latDelta, lte: latN + latDelta }
      where['lng'] = { gte: lngN - lngDelta, lte: lngN + lngDelta }
    }

    // Overfetch up to 500 so we can dedup + sort in JS before paginating.
    // Prisma can't ORDER BY a derived expression or a cross-source dedup result,
    // so we pull the full bounding-box/filter result and handle it ourselves.
    // Note: _count is intentionally omitted here — upcomingEventsCount is
    // computed efficiently via a single groupBy after pagination (see below),
    // avoiding a per-venue subquery on every list request.
    const rawVenues = await prisma.venue.findMany({
      where,
      take: 500,
      orderBy: hasGeo ? undefined : [{ name: 'asc' as const }],
      select: venueSelect,
    })

    // Collapse venues that were ingested from multiple sources (seed-venues +
    // Google Places discover) but represent the same real-world location.
    const dedupedRaw = dedupeVenuesByName(rawVenues)
    const total = dedupedRaw.length

    // Sort by Haversine distance when geo coords provided, then paginate in JS.
    // Sponsored venues are boosted to the top ONLY when the user is within that
    // venue's promotionRadius — geo-local promotion, not platform-wide.
    const now = new Date()
    const venues = hasGeo
      ? dedupedRaw
          .slice()
          .sort((a, b) => {
            const aDist = haversineKm(latN, lngN, a.lat, a.lng)
            const bDist = haversineKm(latN, lngN, b.lat, b.lng)
            const aSponsored = (a as any).isSponsored && (a as any).sponsoredUntil && new Date((a as any).sponsoredUntil) > now && aDist <= ((a as any).promotionRadius ?? 5)
            const bSponsored = (b as any).isSponsored && (b as any).sponsoredUntil && new Date((b as any).sponsoredUntil) > now && bDist <= ((b as any).promotionRadius ?? 5)
            if (aSponsored && !bSponsored) return -1
            if (bSponsored && !aSponsored) return 1
            return aDist - bDist
          })
          .slice(skip, skip + limitN)
      : dedupedRaw.slice(skip, skip + limitN)

    // Enrich with upcoming events count
    const venueIds = venues.map((v) => v.id)
    const upcomingCounts = await prisma.event.groupBy({
      by: ['venueId'],
      where: {
        venueId: { in: venueIds },
        startsAt: { gte: now },
        isPublished: true,
        isCancelled: false,
      },
      _count: { id: true },
    })
    const countMap: Record<string, number> = {}
    for (const row of upcomingCounts) {
      if (row.venueId) countMap[row.venueId] = row._count.id
    }

    const result = venues.map((v) => ({
      ...v,
      upcomingEventsCount: countMap[v.id] ?? 0,
    }))

    res.json({ data: result, total, page: pageN, limit: limitN })
  } catch (err) {
    next(err)
  }
})

/** GET /api/venues/mine — venues claimed by the authenticated user */
router.get('/mine', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const venues = await prisma.venue.findMany({
      where: { claimedById: userId },
      select: venueSelect,
      orderBy: { name: 'asc' },
    })
    res.json({ data: venues })
  } catch (err) { next(err) }
})

/**
 * GET /api/venues/admin/pending-claims — admin only
 * Returns venues where claimedById is set but isClaimed is still false (pending approval).
 * Includes the claimant's profile so the admin can identify who submitted the request.
 */
router.get('/admin/pending-claims', requireAdmin, async (_req, res, next) => {
  try {
    const venues = await prisma.venue.findMany({
      where: { claimedById: { not: null }, isClaimed: false },
      select: {
        ...venueSelect,
        claimedBy: {
          select: { id: true, username: true, displayName: true, email: true, photoUrl: true },
        },
      },
      orderBy: { updatedAt: 'asc' }, // oldest requests first
    })
    res.json({ data: venues })
  } catch (err) {
    next(err)
  }
})

// Unsplash photo IDs by venue type — used as fallback when Google Places photo is unavailable
const UNSPLASH_BY_TYPE: Record<string, string> = {
  NIGHTCLUB:    'photo-1514525253161-7a4d4e8bd3b8', // dark crowd / stage lights
  BAR:          'photo-1546171753-97d7676e4602', // bar interior with bottles
  PUB:          'photo-1567696911980-00b52b2ba191', // pub interior
  CONCERT_HALL: 'photo-1540039155650-f7584c87e2f2', // concert hall
  LOUNGE:       'photo-1560840886-a0f2e9c0f0de', // lounge seating
  ROOFTOP_BAR:  'photo-1533929736475-27c8e79cb3c4', // rooftop bar at night
}

/**
 * GET /api/venues/:id/photo — venue photo endpoint.
 * First tries to stream the real Google Places photo (key stays server-side, never exposed).
 * Falls back immediately to a venue-type Unsplash image if Google fails or returns quickly.
 * Uses a short 2 s Google timeout so the fallback fires fast instead of hanging.
 */
router.get('/:id/photo', async (req, res, next) => {
  try {
    const { id } = req.params
    const w = Math.min(Number(req.query['w'] ?? 800), 1200)

    const venue = await prisma.venue.findUnique({
      where: { id },
      select: { photoUrl: true, type: true },
    })

    if (!venue) return res.status(404).end()

    // Try Google Places photo — short 2 s timeout so failures resolve quickly
    if (venue.photoUrl && GOOGLE_API_KEY) {
      let photoRef: string | null = null
      try {
        photoRef = new URL(venue.photoUrl).searchParams.get('photo_reference')
      } catch { /* not a valid URL */ }

      if (photoRef) {
        const googleUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${w}&photo_reference=${photoRef}&key=${GOOGLE_API_KEY}`
        try {
          const ctrl = new AbortController()
          const timer = setTimeout(() => ctrl.abort(), 6000) // 6 s — give Google enough time
          const googleResp = await fetch(googleUrl, { signal: ctrl.signal })
          clearTimeout(timer)
          if (googleResp.ok && googleResp.url) {
            // fetch() follows the Google 302 → lh3.googleusercontent.com redirect automatically.
            // googleResp.url is that final CDN URL — publicly cacheable, no API key in it.
            // Redirecting the browser there is faster (no server byte-streaming) and lets
            // the browser cache the actual venue photo directly from Google's CDN.
            res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600')
            return res.redirect(302, googleResp.url)
          }
        } catch {
          // Google timed out or rejected — fall through to Unsplash immediately
        }
      }
    }

    // Serve Unsplash image by venue type — fetch server-side so the browser gets
    // a direct image response (no second round-trip redirect for the client)
    const photoId = UNSPLASH_BY_TYPE[venue.type ?? 'BAR'] ?? UNSPLASH_BY_TYPE['BAR']!
    const unsplashUrl = `https://images.unsplash.com/${photoId}?w=${w}&h=${Math.round(w * 0.625)}&fit=crop&auto=format&q=80`
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 5000)
      const unsplashResp = await fetch(unsplashUrl, { signal: ctrl.signal })
      clearTimeout(timer)
      if (unsplashResp.ok) {
        const ct = unsplashResp.headers.get('content-type') || 'image/jpeg'
        res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600')
        res.set('Content-Type', ct)
        return res.send(Buffer.from(await unsplashResp.arrayBuffer()))
      }
    } catch { /* fall through to redirect */ }

    // Last resort: simple redirect (client makes second request to Unsplash)
    return res.redirect(302, unsplashUrl)
  } catch (err) { next(err) }
})

/** GET /api/venues/me/following — venues the current user follows */
router.get('/me/following', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const page = Math.max(1, parseInt(String(req.query['page'] ?? '1')))
    const limit = Math.min(50, parseInt(String(req.query['limit'] ?? '20')))
    const skip = (page - 1) * limit

    const [follows, total] = await Promise.all([
      prisma.venueFollow.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          createdAt: true,
          venue: { select: { ...venueSelect } },
        },
      }),
      prisma.venueFollow.count({ where: { userId } }),
    ])

    res.json({
      data: follows.map((f) => f.venue),
      total,
      page,
      limit,
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/venues/:id — venue detail */
router.get('/:id', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user?.dbUser?.id ?? null

    // Pre-check claim status so embedded events can be scoped to the venue admin.
    // Claimed venues only show events created by their admin — scraped / third-party
    // events are hidden so the venue page reflects the admin's own listings.
    const claimInfo = await prisma.venue.findUnique({
      where: { id },
      select: { isClaimed: true, claimedById: true },
    })
    const embeddedEventsWhere: Record<string, unknown> = {
      isPublished: true,
      isCancelled: false,
      startsAt: { gte: new Date() },
      ...(claimInfo?.isClaimed && claimInfo.claimedById ? { hostId: claimInfo.claimedById } : {}),
    }

    const [venue, followersCount, isFollowing] = await Promise.all([
      prisma.venue.findUnique({
        where: { id },
        select: {
          ...venueSelect,
          claimedBy: {
            select: { id: true, username: true, displayName: true, photoUrl: true },
          },
          events: {
            where: embeddedEventsWhere,
            orderBy: { startsAt: 'asc' },
            take: 5,
            select: {
              id: true,
              name: true,
              startsAt: true,
              price: true,
              type: true,
              coverImageUrl: true,
              capacity: true,
              ticketsRemaining: true,
              host: { select: { id: true, username: true, displayName: true, photoUrl: true } },
            },
          },
        },
      }),
      prisma.venueFollow.count({ where: { venueId: id } }),
      userId
        ? prisma.venueFollow.findUnique({ where: { userId_venueId: { userId, venueId: id } } }).then(Boolean)
        : Promise.resolve(false),
    ])

    if (!venue) throw new AppError('Venue not found', 404)

    // Auto-fetch opening hours from Google Places when missing
    let openingHours = venue.openingHours
    if (openingHours == null && venue.googlePlaceId) {
      const fetched = await fetchAndStoreHours(venue.id, venue.googlePlaceId)
      if (fetched) openingHours = fetched
    }

    res.json({ data: { ...venue, openingHours, followersCount, isFollowing } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/venues/:id/follow — follow a venue */
router.post('/:id/follow', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user!.dbUser.id

    const venue = await prisma.venue.findUnique({ where: { id }, select: { id: true, name: true } })
    if (!venue) throw new AppError('Venue not found', 404)

    await prisma.venueFollow.upsert({
      where: { userId_venueId: { userId, venueId: id } },
      create: { userId, venueId: id },
      update: {},
    })

    const followersCount = await prisma.venueFollow.count({ where: { venueId: id } })
    res.json({ data: { isFollowing: true, followersCount } })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/venues/:id/follow — unfollow a venue */
router.delete('/:id/follow', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user!.dbUser.id

    await prisma.venueFollow.deleteMany({ where: { userId, venueId: id } })

    const followersCount = await prisma.venueFollow.count({ where: { venueId: id } })
    res.json({ data: { isFollowing: false, followersCount } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/venues/:id/followers — list users following this venue */
router.get('/:id/followers', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params
    const page = Math.max(1, parseInt(String(req.query['page'] ?? '1')))
    const limit = Math.min(50, parseInt(String(req.query['limit'] ?? '20')))
    const skip = (page - 1) * limit

    const venue = await prisma.venue.findUnique({ where: { id }, select: { id: true } })
    if (!venue) throw new AppError('Venue not found', 404)

    const [followers, total] = await Promise.all([
      prisma.venueFollow.findMany({
        where: { venueId: id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          user: { select: { id: true, username: true, displayName: true, photoUrl: true } },
          createdAt: true,
        },
      }),
      prisma.venueFollow.count({ where: { venueId: id } }),
    ])

    res.json({
      data: followers.map((f) => ({ ...f.user, followedAt: f.createdAt })),
      total,
      page,
      limit,
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/venues — create venue */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const data = venueSchema.parse(req.body)
    const userId = req.user!.dbUser.id

    const venue = await prisma.venue.create({
      data: {
        ...data,
        claimedById: userId,
        isClaimed: true,
      },
    })

    res.status(201).json({ data: venue })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/venues/:id — update venue */
router.put('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user!.dbUser.id
    const isAdmin = req.user!.dbUser.isAdmin

    const venue = await prisma.venue.findUnique({ where: { id }, select: { id: true, claimedById: true } })
    if (!venue) throw new AppError('Venue not found', 404)

    if (!isAdmin && venue.claimedById !== userId) {
      throw new AppError('You do not have permission to update this venue', 403)
    }

    const data = venueUpdateSchema.parse(req.body)
    const updated = await prisma.venue.update({ where: { id }, data })

    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

/** POST /api/venues/:id/claim — submit a claim request (pending admin approval) */
router.post('/:id/claim', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user!.dbUser.id

    const venue = await prisma.venue.findUnique({ where: { id }, select: { id: true, isClaimed: true, claimedById: true } })
    if (!venue) throw new AppError('Venue not found', 404)

    if (venue.isClaimed) {
      throw new AppError('This venue has already been claimed', 409)
    }
    // claimedById set + isClaimed still false = pending approval
    if (venue.claimedById) {
      throw new AppError('A claim request is already pending for this venue', 409)
    }

    const updated = await prisma.venue.update({
      where: { id },
      // isClaimed stays false — admin must approve before it flips to true
      data: { claimedById: userId },
    })

    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

/** POST /api/venues/:id/claim/approve — admin approves a pending claim */
router.post('/:id/claim/approve', requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params

    const venue = await prisma.venue.findUnique({ where: { id }, select: { id: true, isClaimed: true, claimedById: true } })
    if (!venue) throw new AppError('Venue not found', 404)
    if (!venue.claimedById) throw new AppError('No pending claim for this venue', 400)
    if (venue.isClaimed) throw new AppError('Venue is already approved', 409)

    const updated = await prisma.venue.update({
      where: { id },
      data: { isClaimed: true },
    })

    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

/** POST /api/venues/:id/claim/reject — admin rejects a pending claim */
router.post('/:id/claim/reject', requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params

    const venue = await prisma.venue.findUnique({ where: { id }, select: { id: true, isClaimed: true, claimedById: true } })
    if (!venue) throw new AppError('Venue not found', 404)
    if (!venue.claimedById) throw new AppError('No pending claim for this venue', 400)
    if (venue.isClaimed) throw new AppError('Venue is already approved — cannot reject', 409)

    const updated = await prisma.venue.update({
      where: { id },
      data: { claimedById: null },
    })

    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

const promoteSchema = z.object({
  promotionRadius: z.number().min(1).max(50).default(5),
})

/**
 * POST /api/venues/:id/promote
 *
 * Creates a Stripe Checkout subscription (£49.99/month) that, once paid, gives
 * the venue a boosted position in the discovery feed — but ONLY for users within
 * `promotionRadius` km of the venue (geo-local promotion, not platform-wide).
 *
 * Requirements:
 *  - Caller must be the venue's claimant (claimedById === userId)
 *  - Venue must already be claimed (isClaimed === true)
 */
router.post('/:id/promote', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user!.dbUser.id

    const venue = await prisma.venue.findUnique({
      where: { id },
      select: { id: true, name: true, isClaimed: true, claimedById: true, isSponsored: true, sponsoredUntil: true },
    })
    if (!venue) throw new AppError('Venue not found', 404)

    if (!venue.isClaimed || venue.claimedById !== userId) {
      throw new AppError('You must be the venue owner to promote it', 403)
    }

    // Already actively sponsored?
    const now = new Date()
    if (venue.isSponsored && venue.sponsoredUntil && venue.sponsoredUntil > now) {
      res.json({ data: { alreadySponsored: true, sponsoredUntil: venue.sponsoredUntil } })
      return
    }

    const { promotionRadius } = promoteSchema.parse(req.body)

    const stripe = ensureStripe()

    // Fetch full user row to get stripeCustomerId (auth middleware only exposes a subset)
    const fullUser = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, stripeCustomerId: true },
    })

    // Ensure the user has a Stripe customer
    let stripeCustomerId = fullUser.stripeCustomerId
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: fullUser.email,
        name: fullUser.displayName,
        metadata: { userId },
      })
      stripeCustomerId = customer.id
      await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId } })
    }

    const frontendUrl = process.env['FRONTEND_URL'] ?? 'https://partyradar.app'

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            recurring: { interval: 'month' },
            unit_amount: Math.round(REVENUE_MODEL.SPONSORED_VENUE_MONTHLY * 100), // £49.99 in pence
            product_data: {
              name: `Venue Spotlight — ${venue.name}`,
              description: `Featured placement on PartyRadar for locals within ${promotionRadius}km of your venue`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${frontendUrl}/venues/${id}?promoted=true`,
      cancel_url: `${frontendUrl}/venues/${id}`,
      metadata: {
        type: 'venue_sponsorship',
        venueId: id,
        userId,
        promotionRadius: String(promotionRadius),
      },
    })

    res.json({ data: { checkoutUrl: session.url } })
  } catch (err) {
    next(err)
  }
})

/**
 * DELETE /api/venues/:id/promote — cancel venue sponsorship
 *
 * Cancels the Stripe subscription at period end and marks the venue so it
 * stops being boosted once the paid period expires.
 */
router.delete('/:id/promote', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user!.dbUser.id

    const venue = await prisma.venue.findUnique({
      where: { id },
      select: { id: true, isClaimed: true, claimedById: true, stripeVenueSubId: true, isSponsored: true },
    })
    if (!venue) throw new AppError('Venue not found', 404)
    if (!venue.isClaimed || venue.claimedById !== userId) {
      throw new AppError('You must be the venue owner to manage its promotion', 403)
    }
    if (!venue.isSponsored || !venue.stripeVenueSubId) {
      throw new AppError('This venue does not have an active promotion', 400)
    }

    const stripe = ensureStripe()
    // Cancel at period end — venue stays promoted until the paid window closes
    await stripe.subscriptions.update(venue.stripeVenueSubId, { cancel_at_period_end: true })

    res.json({ data: { message: 'Venue promotion will expire at the end of the current billing period.' } })
  } catch (err) {
    next(err)
  }
})

export default router
