/**
 * Eventbrite auto-import routes
 * GET  /api/eventbrite/search   — search Eventbrite for Glasgow events (preview, no DB save)
 * POST /api/eventbrite/import   — import a specific Eventbrite event into the DB
 * POST /api/eventbrite/sync     — sync all upcoming Glasgow events (admin/cron)
 */
import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, requireAdmin } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

const EVENTBRITE_TOKEN = process.env['EVENTBRITE_PRIVATE_TOKEN']
const EB_BASE = 'https://www.eventbriteapi.com/v3'

// ── helpers ────────────────────────────────────────────────────────────────────

async function ebFetch(path: string, params: Record<string, string> = {}) {
  if (!EVENTBRITE_TOKEN) throw new AppError('Eventbrite token not configured', 503)
  const url = new URL(`${EB_BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${EVENTBRITE_TOKEN}` },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new AppError(`Eventbrite API error: ${err}`, 502)
  }
  return res.json() as Promise<Record<string, unknown>>
}

/** Map Eventbrite event type/category to our EventType enum */
function mapEventType(categories: string[]): 'HOME_PARTY' | 'CLUB_NIGHT' | 'CONCERT' {
  const cat = (categories.join(' ')).toLowerCase()
  if (cat.includes('music') || cat.includes('concert') || cat.includes('festival')) return 'CONCERT'
  if (cat.includes('nightlife') || cat.includes('club') || cat.includes('party')) return 'CLUB_NIGHT'
  return 'HOME_PARTY'
}

interface EBVenue {
  address?: { localized_address_display?: string; latitude?: string; longitude?: string }
}

interface EBEvent {
  id: string
  name?: { text?: string }
  description?: { text?: string }
  start?: { utc?: string }
  end?: { utc?: string }
  venue?: EBVenue
  is_free?: boolean
  ticket_availability?: { minimum_ticket_price?: { major_value?: string } }
  capacity?: number
  category?: { name?: string }
  subcategory?: { name?: string }
  logo?: { original?: { url?: string } }
  url?: string
}

function mapEBEvent(ev: EBEvent) {
  const venue = ev.venue ?? {}
  const addr = venue.address ?? {}
  const lat = parseFloat(addr.latitude ?? '55.8642')
  const lng = parseFloat(addr.longitude ?? '-4.2518')
  const name = ev.name?.text ?? 'Unnamed Event'
  const description = ev.description?.text ?? name
  const startsAt = ev.start?.utc ? new Date(ev.start.utc) : new Date()
  const endsAt = ev.end?.utc ? new Date(ev.end.utc) : undefined
  const price = ev.is_free ? 0 : parseFloat(ev.ticket_availability?.minimum_ticket_price?.major_value ?? '0')
  const capacity = ev.capacity ?? 100
  const address = addr.localized_address_display ?? 'Glasgow'
  const categories = [ev.category?.name ?? '', ev.subcategory?.name ?? '']
  const type = mapEventType(categories)
  const coverImageUrl = ev.logo?.original?.url ?? undefined

  return { name, description, startsAt, endsAt, lat, lng, address, price, capacity, type, coverImageUrl }
}

// ── GET /api/eventbrite/search ─────────────────────────────────────────────────

router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query['q'] as string) || ''
    const page = (req.query['page'] as string) || '1'

    const params: Record<string, string> = {
      'location.address': 'Glasgow, UK',
      'location.within': '20km',
      expand: 'venue,category,subcategory,ticket_availability,logo',
      sort_by: 'date',
      page,
    }
    if (q) params['q'] = q

    const data = await ebFetch('/events/search/', params)
    const events = (data['events'] as EBEvent[] | undefined) ?? []

    res.json({
      events: events.map((ev) => ({
        id: ev.id,
        url: ev.url,
        ...mapEBEvent(ev),
      })),
      page: (data['pagination'] as Record<string, unknown>)?.['page_number'] ?? 1,
      total: (data['pagination'] as Record<string, unknown>)?.['object_count'] ?? 0,
    })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/eventbrite/import ────────────────────────────────────────────────
// Import a single Eventbrite event into our DB as a published event
// Requires auth — the importing user becomes the host

router.post('/import', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { eventbriteId } = req.body as { eventbriteId?: string }
    if (!eventbriteId) throw new AppError('eventbriteId required', 400)

    // Fetch full event details
    const ev = (await ebFetch(`/events/${eventbriteId}/`, {
      expand: 'venue,category,subcategory,ticket_availability,logo',
    })) as unknown as EBEvent

    const mapped = mapEBEvent(ev)

    // Check if already imported
    const existing = await prisma.event.findFirst({
      where: { eventbriteId },
    })
    if (existing) {
      return res.json({ event: existing, imported: false, message: 'Already imported' })
    }

    // Determine neighbourhood from address (first part before first comma)
    const neighbourhood = mapped.address.split(',')[0] ?? 'Glasgow'

    const created = await prisma.event.create({
      data: {
        hostId: req.user!.dbUser.id,
        name: mapped.name,
        type: mapped.type,
        description: mapped.description.slice(0, 2000),
        startsAt: mapped.startsAt,
        endsAt: mapped.endsAt,
        lat: mapped.lat,
        lng: mapped.lng,
        address: mapped.address,
        neighbourhood,
        showNeighbourhoodOnly: false,
        capacity: mapped.capacity,
        price: mapped.price,
        ticketQuantity: mapped.price > 0 ? mapped.capacity : 0,
        ticketsRemaining: mapped.price > 0 ? mapped.capacity : 0,
        alcoholPolicy: 'NONE',
        ageRestriction: 'ALL_AGES',
        vibeTags: [],
        whatToBring: [],
        isPublished: true,
        isCancelled: false,
        coverImageUrl: mapped.coverImageUrl,
        eventbriteId,
        eventbriteUrl: ev.url,
      },
    })

    res.status(201).json({ event: created, imported: true })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/eventbrite/sync ──────────────────────────────────────────────────
// Admin/cron: bulk-import upcoming Glasgow events from Eventbrite

router.post('/sync', requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const pages = parseInt((req.query['pages'] as string) ?? '3', 10)
    let imported = 0
    let skipped = 0

    for (let page = 1; page <= pages; page++) {
      const data = await ebFetch('/events/search/', {
        'location.address': 'Glasgow, UK',
        'location.within': '20km',
        expand: 'venue,category,subcategory,ticket_availability,logo',
        sort_by: 'date',
        page: String(page),
      })

      const events = (data['events'] as EBEvent[] | undefined) ?? []
      if (events.length === 0) break

      for (const ev of events) {
        try {
          const existing = await prisma.event.findFirst({ where: { eventbriteId: ev.id } })
          if (existing) { skipped++; continue }

          const mapped = mapEBEvent(ev)
          const neighbourhood = mapped.address.split(',')[0] ?? 'Glasgow'

          await prisma.event.create({
            data: {
              hostId: req.user!.dbUser.id,
              name: mapped.name,
              type: mapped.type,
              description: mapped.description.slice(0, 2000),
              startsAt: mapped.startsAt,
              endsAt: mapped.endsAt,
              lat: mapped.lat,
              lng: mapped.lng,
              address: mapped.address,
              neighbourhood,
              showNeighbourhoodOnly: false,
              capacity: mapped.capacity,
              price: mapped.price,
              ticketQuantity: mapped.price > 0 ? mapped.capacity : 0,
              ticketsRemaining: mapped.price > 0 ? mapped.capacity : 0,
              alcoholPolicy: 'NONE',
              ageRestriction: 'ALL_AGES',
              vibeTags: [],
              whatToBring: [],
              isPublished: true,
              isCancelled: false,
              coverImageUrl: mapped.coverImageUrl,
              eventbriteId: ev.id,
              eventbriteUrl: ev.url,
            },
          })
          imported++
        } catch {
          skipped++
        }
      }
    }

    res.json({ imported, skipped })
  } catch (err) {
    next(err)
  }
})

export default router
