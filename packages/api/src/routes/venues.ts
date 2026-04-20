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

    const skip = (Number(page) - 1) * Number(limit)

    const where: Record<string, unknown> = {}

    if (city) where['city'] = { contains: city as string, mode: 'insensitive' }
    if (q) where['name'] = { contains: q as string, mode: 'insensitive' }
    if (type) where['type'] = type

    // Geo bounding box filter
    if (lat && lng) {
      const latN = Number(lat)
      const lngN = Number(lng)
      const radN = Number(radius)
      const latDelta = radN / 111
      const lngDelta = radN / (111 * Math.cos((latN * Math.PI) / 180))
      where['lat'] = { gte: latN - latDelta, lte: latN + latDelta }
      where['lng'] = { gte: lngN - lngDelta, lte: lngN + lngDelta }
    }

    const orderBy = lat && lng
      ? [{ name: 'asc' as const }]
      : [{ name: 'asc' as const }]

    const [venues, total] = await Promise.all([
      prisma.venue.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy,
        select: {
          ...venueSelect,
          _count: { select: { events: true } },
        },
      }),
      prisma.venue.count({ where }),
    ])

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

    res.json({ data: result, total, page: Number(page), limit: Number(limit) })
  } catch (err) {
    next(err)
  }
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
