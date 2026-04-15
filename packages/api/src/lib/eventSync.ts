/**
 * Multi-source external event sync utility.
 * Supports Ticketmaster, Skiddle, and Eventbrite.
 * Throttled to once per 30 minutes per city.
 */
import { prisma } from '@partyradar/db'

// ── Throttle ──────────────────────────────────────────────────────────────────

const lastSyncTime = new Map<string, number>()
const SYNC_THROTTLE_MS = 30 * 60 * 1000 // 30 minutes

// ── Type helpers ──────────────────────────────────────────────────────────────

type EventTypeName = 'HOME_PARTY' | 'CLUB_NIGHT' | 'CONCERT' | 'PUB_NIGHT'

interface SyncResult {
  imported: number
  skipped: number
  sources: string[]
}

function truncateDescription(text: string | undefined | null, fallback: string): string {
  const desc = text?.trim() || fallback
  return desc.slice(0, 2000)
}

// ── Ticketmaster ──────────────────────────────────────────────────────────────

interface TMImage {
  ratio?: string
  width?: number
  url?: string
}

interface TMPriceRange {
  min?: number
}

interface TMVenue {
  name?: string
  city?: { name?: string }
  address?: { line1?: string }
  location?: { latitude?: string; longitude?: string }
}

interface TMClassification {
  segment?: { name?: string }
  genre?: { name?: string }
}

interface TMEvent {
  id: string
  name?: string
  url?: string
  info?: string
  pleaseNote?: string
  images?: TMImage[]
  dates?: {
    start?: { dateTime?: string }
    end?: { dateTime?: string }
  }
  priceRanges?: TMPriceRange[]
  _embedded?: { venues?: TMVenue[] }
  classifications?: TMClassification[]
}

interface TMResponse {
  _embedded?: { events?: TMEvent[] }
  page?: { totalElements?: number }
}

function mapTMEventType(classifications: TMClassification[] | undefined): EventTypeName {
  if (!classifications) return 'CONCERT'
  const names = classifications
    .flatMap((c) => [c.segment?.name ?? '', c.genre?.name ?? ''])
    .join(' ')
    .toLowerCase()
  if (names.includes('nightlife') || names.includes('club') || names.includes('dj')) return 'CLUB_NIGHT'
  return 'CONCERT'
}

async function syncTicketmaster(
  city: string,
  hostId: string
): Promise<{ imported: number; skipped: number }> {
  const apiKey = process.env['TICKETMASTER_API_KEY']
  if (!apiKey) return { imported: 0, skipped: 0 }

  const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json')
  url.searchParams.set('apikey', apiKey)
  url.searchParams.set('city', city)
  url.searchParams.set('countryCode', 'GB')
  url.searchParams.set('classificationName', 'music')
  url.searchParams.set('radius', '20')
  url.searchParams.set('unit', 'miles')
  url.searchParams.set('sort', 'date,asc')
  url.searchParams.set('size', '50')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Ticketmaster API error: ${res.status}`)
  const data = (await res.json()) as TMResponse

  const events = data._embedded?.events ?? []
  let imported = 0
  let skipped = 0

  for (const ev of events) {
    try {
      const venue = ev._embedded?.venues?.[0]
      const lat = parseFloat(venue?.location?.latitude ?? '55.8642')
      const lng = parseFloat(venue?.location?.longitude ?? '-4.2518')
      const address = [venue?.address?.line1, venue?.city?.name].filter(Boolean).join(', ') || 'Glasgow'
      const neighbourhood = venue?.city?.name ?? 'Glasgow'
      const name = ev.name ?? 'Unnamed Event'
      const description = truncateDescription(ev.info ?? ev.pleaseNote, name)
      const startsAt = ev.dates?.start?.dateTime ? new Date(ev.dates.start.dateTime) : new Date()
      const endsAt = ev.dates?.end?.dateTime ? new Date(ev.dates.end.dateTime) : undefined
      const price = ev.priceRanges?.[0]?.min ?? 0
      const coverImageUrl = ev.images?.find(
        (img) => img.ratio === '16_9' && (img.width ?? 0) > 500
      )?.url ?? ev.images?.[0]?.url ?? undefined
      const type = mapTMEventType(ev.classifications)

      await prisma.event.upsert({
        where: { ticketmasterId: ev.id },
        update: {
          name,
          description,
          startsAt,
          endsAt,
          lat,
          lng,
          address,
          neighbourhood,
          coverImageUrl,
          price,
          socialSourceUrl: ev.url,
        },
        create: {
          hostId,
          name,
          type,
          description,
          startsAt,
          endsAt: endsAt ?? null,
          lat,
          lng,
          address,
          neighbourhood,
          showNeighbourhoodOnly: false,
          capacity: 200,
          price,
          ticketQuantity: 0,
          ticketsRemaining: 0,
          alcoholPolicy: 'PROVIDED',
          ageRestriction: 'AGE_18',
          vibeTags: [],
          whatToBring: [],
          isPublished: true,
          isCancelled: false,
          coverImageUrl,
          ticketmasterId: ev.id,
          externalSource: 'ticketmaster',
          socialSourceUrl: ev.url,
        },
      })
      imported++
    } catch {
      skipped++
    }
  }

  return { imported, skipped }
}

// ── Skiddle ───────────────────────────────────────────────────────────────────

interface SkiddleVenue {
  address?: string
  town?: string
  latitude?: string | number
  longitude?: string | number
}

interface SkiddleEvent {
  id: string
  eventname?: string
  link?: string
  imageurl?: string
  description?: string
  date?: string
  enddate?: string
  entryprice?: string | number
  venue?: SkiddleVenue
  genres?: Array<{ name?: string }>
}

interface SkiddleResponse {
  results?: SkiddleEvent[]
}

function mapSkiddleEventType(genres: Array<{ name?: string }> | undefined): EventTypeName {
  if (!genres) return 'CLUB_NIGHT'
  const names = genres.map((g) => g.name ?? '').join(' ').toLowerCase()
  if (names.includes('live') || names.includes('acoustic') || names.includes('singer')) return 'CONCERT'
  return 'CLUB_NIGHT'
}

async function syncSkiddle(
  lat: number,
  lng: number,
  hostId: string
): Promise<{ imported: number; skipped: number }> {
  const apiKey = process.env['SKIDDLE_API_KEY']
  if (!apiKey) return { imported: 0, skipped: 0 }

  const url = new URL('https://www.skiddle.com/api/v1/events/search/')
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('radius', '20')
  url.searchParams.set('limit', '50')
  url.searchParams.set('order', 'date')
  url.searchParams.set('description', '1')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Skiddle API error: ${res.status}`)
  const data = (await res.json()) as SkiddleResponse

  const events = data.results ?? []
  let imported = 0
  let skipped = 0

  for (const ev of events) {
    try {
      const evLat = parseFloat(String(ev.venue?.latitude ?? lat))
      const evLng = parseFloat(String(ev.venue?.longitude ?? lng))
      const address = ev.venue?.address ?? 'Glasgow'
      const neighbourhood = ev.venue?.town ?? 'Glasgow'
      const name = ev.eventname ?? 'Unnamed Event'
      const description = truncateDescription(ev.description, name)
      const startsAt = ev.date ? new Date(ev.date) : new Date()
      const endsAt = ev.enddate ? new Date(ev.enddate) : undefined
      const price = parseFloat(String(ev.entryprice ?? '0')) || 0
      const type = mapSkiddleEventType(ev.genres)

      await prisma.event.upsert({
        where: { skiddleId: ev.id },
        update: {
          name,
          description,
          startsAt,
          endsAt,
          lat: evLat,
          lng: evLng,
          address,
          neighbourhood,
          coverImageUrl: ev.imageurl ?? null,
          price,
          socialSourceUrl: ev.link,
        },
        create: {
          hostId,
          name,
          type,
          description,
          startsAt,
          endsAt: endsAt ?? null,
          lat: evLat,
          lng: evLng,
          address,
          neighbourhood,
          showNeighbourhoodOnly: false,
          capacity: 200,
          price,
          ticketQuantity: 0,
          ticketsRemaining: 0,
          alcoholPolicy: 'PROVIDED',
          ageRestriction: 'AGE_18',
          vibeTags: [],
          whatToBring: [],
          isPublished: true,
          isCancelled: false,
          coverImageUrl: ev.imageurl ?? null,
          skiddleId: ev.id,
          externalSource: 'skiddle',
          socialSourceUrl: ev.link,
        },
      })
      imported++
    } catch {
      skipped++
    }
  }

  return { imported, skipped }
}

// ── Eventbrite ────────────────────────────────────────────────────────────────

interface EBVenue {
  address?: { localized_address_display?: string; latitude?: string; longitude?: string }
  name?: string
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

interface EBResponse {
  events?: EBEvent[]
  pagination?: { page_count?: number }
}

function mapEBEventType(categories: string[]): EventTypeName {
  const cat = categories.join(' ').toLowerCase()
  if (cat.includes('music') || cat.includes('concert') || cat.includes('festival')) return 'CONCERT'
  if (cat.includes('nightlife') || cat.includes('club') || cat.includes('party')) return 'CLUB_NIGHT'
  if (cat.includes('pub') || cat.includes('bar') || cat.includes('quiz') || cat.includes('karaoke') || cat.includes('drinks')) return 'PUB_NIGHT'
  // Default to PUB_NIGHT for unmatched venue events — HOME_PARTY is reserved for private house parties
  return 'PUB_NIGHT'
}

async function syncEventbrite(
  city: string,
  hostId: string
): Promise<{ imported: number; skipped: number }> {
  const token = process.env['EVENTBRITE_PRIVATE_TOKEN']
  if (!token) return { imported: 0, skipped: 0 }

  const url = new URL('https://www.eventbriteapi.com/v3/events/search/')
  url.searchParams.set('location.address', `${city}, UK`)
  url.searchParams.set('location.within', '20km')
  url.searchParams.set('expand', 'venue,category,subcategory,ticket_availability,logo')
  url.searchParams.set('sort_by', 'date')
  url.searchParams.set('page', '1')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Eventbrite API error: ${res.status}`)
  const data = (await res.json()) as EBResponse

  const events = data.events ?? []
  let imported = 0
  let skipped = 0

  for (const ev of events) {
    try {
      const addr = ev.venue?.address ?? {}
      const evLat = parseFloat(addr.latitude ?? '55.8642')
      const evLng = parseFloat(addr.longitude ?? '-4.2518')
      const address = addr.localized_address_display ?? city
      const neighbourhood = address.split(',')[0] ?? city
      const name = ev.name?.text ?? 'Unnamed Event'
      const description = truncateDescription(ev.description?.text, name)
      const startsAt = ev.start?.utc ? new Date(ev.start.utc) : new Date()
      const endsAt = ev.end?.utc ? new Date(ev.end.utc) : undefined
      const price = ev.is_free
        ? 0
        : parseFloat(ev.ticket_availability?.minimum_ticket_price?.major_value ?? '0') || 0
      const capacity = ev.capacity ?? 100
      const categories = [ev.category?.name ?? '', ev.subcategory?.name ?? '']
      const type = mapEBEventType(categories)
      const coverImageUrl = ev.logo?.original?.url ?? null

      await prisma.event.upsert({
        where: { eventbriteId: ev.id },
        update: {
          name,
          description,
          startsAt,
          endsAt,
          lat: evLat,
          lng: evLng,
          address,
          neighbourhood,
          coverImageUrl,
          price,
          eventbriteUrl: ev.url,
          socialSourceUrl: ev.url,
        },
        create: {
          hostId,
          name,
          type,
          description,
          startsAt,
          endsAt: endsAt ?? null,
          lat: evLat,
          lng: evLng,
          address,
          neighbourhood,
          showNeighbourhoodOnly: false,
          capacity,
          price,
          ticketQuantity: price > 0 ? capacity : 0,
          ticketsRemaining: price > 0 ? capacity : 0,
          alcoholPolicy: 'PROVIDED',
          ageRestriction: 'AGE_18',
          vibeTags: [],
          whatToBring: [],
          isPublished: true,
          isCancelled: false,
          coverImageUrl,
          eventbriteId: ev.id,
          eventbriteUrl: ev.url,
          externalSource: 'eventbrite',
          socialSourceUrl: ev.url,
        },
      })
      imported++
    } catch {
      skipped++
    }
  }

  return { imported, skipped }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function syncExternalEvents(
  city: string,
  lat: number,
  lng: number,
  _hostIdHint: string
): Promise<SyncResult> {
  // Throttle: skip if synced this city recently
  const key = city.toLowerCase()
  const last = lastSyncTime.get(key) ?? 0
  if (Date.now() - last < SYNC_THROTTLE_MS) {
    return { imported: 0, skipped: 0, sources: [] }
  }
  lastSyncTime.set(key, Date.now())

  // Resolve admin hostId from DB
  const adminUser = await prisma.user.findFirst({ where: { isAdmin: true } })
  if (!adminUser) return { imported: 0, skipped: 0, sources: [] }
  const hostId = adminUser.id

  let totalImported = 0
  let totalSkipped = 0
  const sources: string[] = []

  // Ticketmaster
  if (process.env['TICKETMASTER_API_KEY']) {
    try {
      const result = await syncTicketmaster(city, hostId)
      totalImported += result.imported
      totalSkipped += result.skipped
      sources.push('ticketmaster')
    } catch {
      // source failure is non-fatal
    }
  }

  // Skiddle
  if (process.env['SKIDDLE_API_KEY']) {
    try {
      const result = await syncSkiddle(lat, lng, hostId)
      totalImported += result.imported
      totalSkipped += result.skipped
      sources.push('skiddle')
    } catch {
      // source failure is non-fatal
    }
  }

  // Eventbrite
  if (process.env['EVENTBRITE_PRIVATE_TOKEN']) {
    try {
      const result = await syncEventbrite(city, hostId)
      totalImported += result.imported
      totalSkipped += result.skipped
      sources.push('eventbrite')
    } catch {
      // source failure is non-fatal
    }
  }

  return { imported: totalImported, skipped: totalSkipped, sources }
}
