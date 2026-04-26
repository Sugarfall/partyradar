import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { z } from 'zod'

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

    // Sort by Haversine distance when geo coords provided, then paginate in JS
    const venues = hasGeo
      ? dedupedRaw
          .slice()
          .sort((a, b) => haversineKm(latN, lngN, a.lat, a.lng) - haversineKm(latN, lngN, b.lat, b.lng))
          .slice(skip, skip + limitN)
      : dedupedRaw.slice(skip, skip + limitN)

    // Enrich with upcoming events count
    const now = new Date()
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
          const timer = setTimeout(() => ctrl.abort(), 2000) // 2 s max — fail fast
          const googleResp = await fetch(googleUrl, { signal: ctrl.signal })
          clearTimeout(timer)
          if (googleResp.ok) {
            const ct = googleResp.headers.get('content-type') || 'image/jpeg'
            res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600')
            res.set('Content-Type', ct)
            return res.send(Buffer.from(await googleResp.arrayBuffer()))
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

/** GET /api/venues/:id — venue detail */
router.get('/:id', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params

    const venue = await prisma.venue.findUnique({
      where: { id },
      select: {
        ...venueSelect,
        claimedBy: {
          select: { id: true, username: true, displayName: true, photoUrl: true },
        },
        events: {
          where: {
            isPublished: true,
            isCancelled: false,
            startsAt: { gte: new Date() },
          },
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
    })

    if (!venue) throw new AppError('Venue not found', 404)

    // Auto-fetch opening hours from Google Places when missing
    let openingHours = venue.openingHours
    if (openingHours == null && venue.googlePlaceId) {
      const fetched = await fetchAndStoreHours(venue.id, venue.googlePlaceId)
      if (fetched) openingHours = fetched
    }

    res.json({ data: { ...venue, openingHours } })
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

/** POST /api/venues/:id/claim — claim ownership of a venue */
router.post('/:id/claim', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user!.dbUser.id

    const venue = await prisma.venue.findUnique({ where: { id }, select: { id: true, isClaimed: true, claimedById: true } })
    if (!venue) throw new AppError('Venue not found', 404)

    if (venue.isClaimed) {
      throw new AppError('This venue has already been claimed', 409)
    }

    const updated = await prisma.venue.update({
      where: { id },
      data: { isClaimed: true, claimedById: userId },
    })

    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

export default router
