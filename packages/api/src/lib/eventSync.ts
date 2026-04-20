/**
 * Multi-source external event sync utility.
 * Supports Ticketmaster, Skiddle, Eventbrite, SerpAPI Google Events, and Perplexity AI.
 * Throttled to once per 30 minutes per city.
 */
import { prisma } from '@partyradar/db'
import { createHash } from 'crypto'

// ── Throttle ──────────────────────────────────────────────────────────────────

const lastSyncTime = new Map<string, number>()
const SYNC_THROTTLE_MS = 30 * 60 * 1000 // 30 minutes

// ── Type helpers ──────────────────────────────────────────────────────────────

type EventTypeName = 'HOME_PARTY' | 'CLUB_NIGHT' | 'CONCERT' | 'PUB_NIGHT' | 'BEACH_PARTY' | 'YACHT_PARTY'

interface SyncResult {
  imported: number
  skipped: number
  sources: string[]
}

function truncateDescription(text: string | undefined | null, fallback: string): string {
  const desc = text?.trim() || fallback
  return desc.slice(0, 2000)
}

// ── Nightlife-only filter ─────────────────────────────────────────────────────

/**
 * Keyword blocklist — any event whose name OR description contains one of these
 * is NOT a nightlife event and must be rejected before import.
 */
const REJECT_KEYWORDS = [
  // Attractions & family
  'aquarium', 'sea life', 'zoo', 'wildlife', 'safari', 'museum', 'gallery',
  'science centre', 'discovery centre', 'planetarium',
  'theme park', 'funland', 'funfair', 'fairground', 'amusement',
  'soft play', 'trampoline park', 'bowling',
  // Kids/family explicit
  'for kids', 'for children', "children's", 'family friendly', 'family fun',
  'kids activity', 'toddler', 'baby', 'school holiday', 'half term',
  'kids show', 'kids party', "children's party",
  // Seasonal family events
  'easter egg hunt', 'easter trail', 'easter funland', 'easter fair',
  'halloween trail', 'halloween family', 'halloween for kids',
  'christmas grotto', 'santa grotto', 'santa visit', 'meet santa',
  'nativity', 'pantomime', 'panto',
  // Sports & fitness
  'half marathon', 'fun run', '5k run', '10k run', 'marathon', 'triathlon',
  'cycling event', 'obstacle course', 'tough mudder', 'colour run',
  'yoga class', 'pilates', 'meditation', 'wellness retreat',
  'fitness class', 'bootcamp',
  // Education & professional
  'conference', 'seminar', 'workshop', 'webinar', 'networking event',
  'business breakfast', 'career fair', 'job fair', 'trade show',
  'craft fair', 'artisan market', 'farmers market', 'car boot sale',
  'jumble sale', 'flea market',
  // Arts & culture (non-nightlife)
  'art exhibition', 'photo exhibition', 'guided tour', 'heritage tour',
  'walking tour', 'ghost tour', 'history walk', 'architecture walk',
  'pottery class', 'painting class', 'drawing class', 'art class',
  'cooking class', 'baking class',
  // Religion
  'church service', 'mass ', 'prayer meeting', 'sermon', 'worship',
  // Cinema & theatre (non-nightlife)
  'film screening', 'movie screening', 'cinema night',
  'theatre show', 'theatre performance', 'play performance',
  'ballet', 'opera',
  // Talks & charity
  'charity walk', 'sponsored walk', 'fundraiser walk',
  'ted talk', 'book club', 'reading group', 'author talk',
  // Other
  'dog show', 'horse show', 'equestrian', 'agricultural show',
  'antiques fair', 'collectors fair',
  // Non-nightlife social events only (keep pub events like quiz/karaoke/bingo)
  'casino night', 'gambling event', 'afternoon tea', 'baby shower', 'wedding reception',
  'funeral', 'corporate event', 'corporate dinner', 'awards ceremony',
  // Ticketmaster ticket-upgrade listings (not real separate events)
  'venue premium', 'comfort seats', 'parking permit', 'vip package', 'hospitality package',
  'platinum seats', 'accessible tickets', 'wheelchair',
]

/**
 * Returns true if the event looks like a nightlife/music event worth importing.
 * Returns false if it matches a blocked keyword (family, tourist, fitness, etc.)
 */
function isNightlifeEvent(name: string, description: string): boolean {
  const text = `${name} ${description}`.toLowerCase()
  return !REJECT_KEYWORDS.some((kw) => text.includes(kw))
}

function stableHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 32)
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
  // Electronic/Dance genres are typically club nights, not concerts
  if (
    names.includes('electronic') || names.includes('dance') || names.includes('techno') ||
    names.includes('house') || names.includes('drum') || names.includes('bass') ||
    names.includes('trance') || names.includes('rave') || names.includes('edm') ||
    names.includes('jungle') || names.includes('garage') || names.includes('dubstep') ||
    names.includes('ambient') || names.includes('electronica')
  ) return 'CLUB_NIGHT'
  if (names.includes('pub') || names.includes('bar') || names.includes('tavern')) return 'PUB_NIGHT'
  return 'CONCERT'
}

async function syncTicketmaster(
  lat: number,
  lng: number,
  hostId: string
): Promise<{ imported: number; skipped: number }> {
  const apiKey = process.env['TICKETMASTER_API_KEY']
  if (!apiKey) return { imported: 0, skipped: 0 }

  const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json')
  url.searchParams.set('apikey', apiKey)
  url.searchParams.set('latlong', `${lat},${lng}`)
  url.searchParams.set('classificationName', 'music')
  url.searchParams.set('radius', '30')
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
      const evLat = parseFloat(venue?.location?.latitude ?? String(lat))
      const evLng = parseFloat(venue?.location?.longitude ?? String(lng))
      const address = [venue?.address?.line1, venue?.city?.name].filter(Boolean).join(', ') || venue?.city?.name || 'Unknown'
      const neighbourhood = venue?.city?.name ?? address.split(',')[0] ?? 'Unknown'
      const name = ev.name ?? 'Unnamed Event'
      const description = truncateDescription(ev.info ?? ev.pleaseNote, name)

      // Skip non-nightlife events
      if (!isNightlifeEvent(name, description)) { skipped++; continue }

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
          lat: evLat,
          lng: evLng,
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
  if (names.includes('pub') || names.includes('bar') || names.includes('quiz') ||
      names.includes('karaoke') || names.includes('comedy') || names.includes('open mic') ||
      names.includes('acoustic') || names.includes('drag') || names.includes('bingo')) return 'PUB_NIGHT'
  if (names.includes('live') || names.includes('singer') || names.includes('band') || names.includes('concert')) return 'CONCERT'
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
  // Include all nightlife codes: CLUB=Club night, LIVE=Live music, FEST=Festival,
  // GRDN=Garden party, PARK=Park event, COMEDY=Comedy, KARAOKE=Karaoke, BARPUB=Bar/Pub night
  url.searchParams.set('eventcode', 'CLUB,LIVE,FEST,GRDN,PARK,COMEDY,KARAOKE,BARPUB')

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
      const address = ev.venue?.address ?? ev.venue?.town ?? 'Unknown'
      const neighbourhood = ev.venue?.town ?? ev.venue?.address?.split(',')[0] ?? 'Unknown'
      const name = ev.eventname ?? 'Unnamed Event'
      const description = truncateDescription(ev.description, name)

      // Skip non-nightlife events
      if (!isNightlifeEvent(name, description)) { skipped++; continue }

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
  if (cat.includes('pub') || cat.includes('bar') || cat.includes('tavern') || cat.includes('brewery')) return 'PUB_NIGHT'
  return 'HOME_PARTY'
}

async function syncEventbrite(
  lat: number,
  lng: number,
  hostId: string
): Promise<{ imported: number; skipped: number }> {
  const token = process.env['EVENTBRITE_PRIVATE_TOKEN']
  if (!token) return { imported: 0, skipped: 0 }

  const url = new URL('https://www.eventbriteapi.com/v3/events/search/')
  url.searchParams.set('location.latitude', String(lat))
  url.searchParams.set('location.longitude', String(lng))
  url.searchParams.set('location.within', '20km')
  url.searchParams.set('expand', 'venue,category,subcategory,ticket_availability,logo')
  url.searchParams.set('sort_by', 'date')
  url.searchParams.set('page', '1')
  // Filter to Music (103) and Nightlife (105) categories only
  url.searchParams.set('categories', '103,105')

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
      const evLat = parseFloat(addr.latitude ?? String(lat))
      const evLng = parseFloat(addr.longitude ?? String(lng))
      const address = addr.localized_address_display ?? ev.venue?.name ?? 'Unknown'
      const neighbourhood = address.split(',')[0] ?? 'Unknown'
      const name = ev.name?.text ?? 'Unnamed Event'
      const description = truncateDescription(ev.description?.text, name)

      // Skip non-nightlife events even within music/nightlife categories
      if (!isNightlifeEvent(name, description)) { skipped++; continue }

      // Also skip if Eventbrite category is not music/nightlife
      const catName = (ev.category?.name ?? '').toLowerCase()
      if (catName && !catName.includes('music') && !catName.includes('nightlife') && !catName.includes('party')) {
        skipped++; continue
      }

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

// ── SerpAPI Google Events ─────────────────────────────────────────────────────

interface SerpEvent {
  title?: string
  date?: { start_date?: string; when?: string }
  address?: string[]
  link?: string
  description?: string
  thumbnail?: string
  ticket_info?: Array<{ source?: string; link?: string; is_paid?: boolean }>
  venue?: { name?: string }
}

interface SerpResponse {
  events_results?: SerpEvent[]
}

function parseSerpDate(when: string | undefined, startDate: string | undefined): Date {
  const str = when ?? startDate ?? ''
  if (!str) return new Date()
  // Try direct parse
  const d = new Date(str)
  if (!isNaN(d.getTime())) return d
  // Append current year and retry (handles "Mon, Apr 14, 8:00 PM")
  const d2 = new Date(`${str} ${new Date().getFullYear()}`)
  if (!isNaN(d2.getTime())) return d2
  return new Date()
}

// Known nightclub venues — events at these venues are always CLUB_NIGHT even if title lacks keywords
const KNOWN_CLUB_VENUES = [
  // Glasgow
  'sub club', 'subclub', 'swg3', 'the garage', 'garage glasgow', 'room 2', 'room2',
  'buff club', 'sanctuary', 'cathouse', 'sauchiehall', 'polo lounge', 'bamboo',
  // UK
  'fabric', 'xoyo', 'corsica studios', 'egg london', 'printworks', 'rave cave',
  'studio 338', 'oval space', 'fold', 'heaven', 'ministry of sound',
  'warehouse project', 'hidden', 'albert hall', 'junction 2',
  // International
  'berghain', 'tresor', 'watergate', 'about blank', 'kater blau',
  'amnesia', 'pacha', 'dc10', 'privilege', 'ushuaia',
]

function mapSerpEventType(title: string, description: string): EventTypeName | null {
  const text = `${title} ${description}`.toLowerCase()
  if (text.includes('concert') || text.includes('live music') || text.includes('festival') || text.includes('gig') || text.includes(' tour')) return 'CONCERT'
  if (
    text.includes('club night') || text.includes('nightclub') || text.includes(' dj ') ||
    text.includes('dj set') || text.includes('rave') || text.includes('techno') ||
    text.includes('dance night') || text.includes('club event') ||
    text.includes('electronic') || text.includes('house music') || text.includes('drum & bass') ||
    text.includes('drum and bass') || text.includes('dnb') || text.includes('garage night') ||
    KNOWN_CLUB_VENUES.some(v => text.includes(v))
  ) return 'CLUB_NIGHT'
  if (
    text.includes(' pub ') || text.includes('pub night') || text.includes('bar night') ||
    text.includes('pub quiz') || text.includes('quiz night') || text.includes('trivia night') ||
    text.includes('open mic') || text.includes('karaoke') || text.includes('comedy night') ||
    text.includes('drag night') || text.includes('drag show') || text.includes('bingo night') ||
    text.includes('speed dating') || text.includes('pub crawl') || text.includes('tavern') ||
    text.includes('live band') || text.includes('acoustic night') || text.includes('open stage')
  ) return 'PUB_NIGHT'
  if (text.includes('beach party') || text.includes('pool party')) return 'BEACH_PARTY'
  if (text.includes('yacht') || text.includes('boat party')) return 'YACHT_PARTY'
  if (text.includes('house party') || text.includes('home party')) return 'HOME_PARTY'
  // For nightlife-queried events that don't match specific types, default to CONCERT
  // (rather than null/skip — SerpAPI query already filters for nightlife)
  return 'CONCERT'
}

async function syncSerpApi(
  city: string,
  lat: number,
  lng: number,
  hostId: string
): Promise<{ imported: number; skipped: number }> {
  const apiKey = process.env['SERPAPI_KEY']
  if (!apiKey) return { imported: 0, skipped: 0 }

  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google_events')
  // Explicit nightlife query — avoids returning aquariums, fairs, family events etc.
  url.searchParams.set('q', `nightlife events clubs DJ nights raves techno house pubs bars karaoke quiz night open mic comedy night concerts live music ${city} this weekend site:ra.co OR site:dice.fm OR site:skiddle.com OR site:ents24.com OR site:eventbrite.co.uk OR site:facebook.com/events`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('hl', 'en')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`SerpAPI error: ${res.status}`)
  const data = (await res.json()) as SerpResponse

  const events = data.events_results ?? []
  let imported = 0
  let skipped = 0

  for (const ev of events) {
    try {
      const name = ev.title ?? 'Unnamed Event'
      const startsAt = parseSerpDate(ev.date?.when, ev.date?.start_date)
      if (startsAt < new Date()) { skipped++; continue }

      const description = truncateDescription(ev.description, name)

      // Skip non-nightlife events — query filters but Google still returns misc results
      if (!isNightlifeEvent(name, description)) { skipped++; continue }

      // Skip if type can't be determined from keywords (not nightlife enough)
      const type = mapSerpEventType(name, ev.description ?? '')
      if (!type) { skipped++; continue }

      const serpApiId = stableHash(`${name}|${ev.date?.start_date ?? ''}|${ev.address?.[0] ?? ''}`)
      const address = ev.address?.join(', ') ?? city
      const neighbourhood = ev.venue?.name ?? address.split(',')[0] ?? city
      const coverImageUrl = ev.thumbnail ?? null
      const socialSourceUrl = ev.ticket_info?.find((t) => t.link)?.link ?? ev.link
      const isPaid = ev.ticket_info?.some((t) => t.is_paid) ?? false
      const price = isPaid ? 10 : 0

      await prisma.event.upsert({
        where: { serpApiId },
        update: { name, description, startsAt, address, neighbourhood, coverImageUrl, socialSourceUrl },
        create: {
          hostId, name, type, description, startsAt, endsAt: null,
          lat, lng, address, neighbourhood,
          showNeighbourhoodOnly: false, capacity: 500, price,
          ticketQuantity: 0, ticketsRemaining: 0,
          alcoholPolicy: 'PROVIDED', ageRestriction: 'AGE_18',
          vibeTags: [], whatToBring: [],
          isPublished: true, isCancelled: false,
          coverImageUrl, serpApiId,
          externalSource: 'serpapi', socialSourceUrl,
        },
      })
      imported++
    } catch {
      skipped++
    }
  }

  return { imported, skipped }
}

// ── Perplexity AI Search ──────────────────────────────────────────────────────

interface PerplexityEvent {
  name?: string
  date?: string
  endDate?: string
  venue?: string
  address?: string
  price?: number
  type?: string
  description?: string
  url?: string
  imageUrl?: string
}

async function syncPerplexity(
  city: string,
  lat: number,
  lng: number,
  hostId: string
): Promise<{ imported: number; skipped: number }> {
  const apiKey = process.env['PERPLEXITY_API_KEY']
  if (!apiKey) return { imported: 0, skipped: 0 }

  const today = new Date().toISOString().split('T')[0]
  const twoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const citySlug = city.toLowerCase().replace(/\s+/g, '-')

  // City-specific venue hints to help AI find the right events
  const isGlasgow = city.toLowerCase().includes('glasgow')
  const venueHint = isGlasgow
    ? `\nKey Glasgow CLUB venues to search: Sub Club, SWG3, The Garage, Room 2, Buff Club, Sanctuary, Cathouse, Polo Lounge, Bamboo Glasgow, AXM Glasgow, Kushion.\n` +
      `Key Glasgow PUB/BAR venues: Nice N Sleazy, Broadcast, The Hug and Pint, Admiral Bar, Stereo, Drygate, Oran Mor, Brel, Bloc+ Bar, The Horseshoe Bar, The Ben Nevis, Solid Rock Café, The State Bar, King Tut's Wah Wah Hut, Òran Mór.\n` +
      `Check these specific sites: https://ra.co/events/uk/glasgow, https://www.skiddle.com/whats-on/glasgow/, https://dice.fm (search "Glasgow"), https://www.ents24.com/glasgow/\n`
    : ''

  const prompt =
    `You have live internet access. Search RIGHT NOW for ALL upcoming nightlife events in ${city} ` +
    `from ${today} to ${twoWeeks}. Find EVERY type of nightlife event:\n\n` +
    `CLUB NIGHTS: DJ sets, raves, techno/house/drum & bass/garage/jungle/electronic nights at nightclubs\n` +
    `PUB NIGHTS: karaoke, pub quiz / quiz nights, open mic, comedy nights, drag shows, bingo nights, ` +
    `speed dating, live acoustic sessions, pub crawls, open stage nights at pubs and bars\n` +
    `BAR EVENTS: themed nights, cocktail events, bottomless brunches with DJs, rooftop parties\n` +
    `LIVE MUSIC: gigs, concerts, bands playing live at venues\n` +
    `CONCERTS & FESTIVALS: ticketed shows at larger venues\n\n` +
    venueHint +
    `Search these URLs for ${city}:\n` +
    `- https://ra.co/events/uk/${citySlug}\n` +
    `- https://dice.fm (search "${city} events")\n` +
    `- https://www.skiddle.com/whats-on/${citySlug}/\n` +
    `- https://www.ents24.com/${citySlug}/\n` +
    `- https://www.eventbrite.co.uk/d/united-kingdom--${citySlug}/nightlife/\n` +
    `- Google: "karaoke ${city}", "quiz night ${city}", "open mic ${city}", "comedy night ${city}", ` +
    `"drag night ${city}", "club night ${city} this weekend", "DJ night ${city}"\n\n` +
    `Find 25+ events minimum. Include a good MIX — some pub/bar events AND club nights AND concerts.\n` +
    `IMPORTANT: Club nights (DJ/rave/techno/house) must use type "CLUB_NIGHT". Pub events (quiz/karaoke/open mic) must use type "PUB_NIGHT".\n` +
    `DO NOT include: family events, kids events, sports, fitness, theatre, cinema, exhibitions, ` +
    `craft fairs, church, conferences, funerals, weddings, or corporate events.\n\n` +
    `Return ONLY a valid JSON array (no markdown, no prose):\n` +
    `[{"name":"","date":"ISO8601","endDate":"ISO8601 or null","venue":"exact venue name","address":"full address, ${city}","price":0,"type":"PUB_NIGHT","description":"what happens — music/host/atmosphere","url":"direct link","imageUrl":""}]\n` +
    `type must be one of: CONCERT | CLUB_NIGHT | PUB_NIGHT | HOME_PARTY | BEACH_PARTY | YACHT_PARTY\n` +
    `price is a number (0 if free). Only REAL future events with real venue names — no placeholders.`

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content:
            'You are a nightlife event aggregator with live internet access. ' +
            'Find ALL types of nightlife: club nights, DJ events, raves, live music, pub nights, ' +
            'karaoke, quiz nights, open mic, comedy nights, drag shows, bingo nights, bar events. ' +
            'Browse Resident Advisor, Dice.fm, Skiddle, Ents24, Eventbrite, and Google to find real events. ' +
            'Return ONLY a valid JSON array — no markdown, no prose, no extra text.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 8000,
    }),
  })

  if (!res.ok) throw new Error(`Perplexity API error: ${res.status}`)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content ?? ''

  // Extract JSON array — handle both raw and markdown-wrapped responses
  let events: PerplexityEvent[] = []
  const tryParse = (str: string) => { try { return JSON.parse(str) as PerplexityEvent[] } catch { return null } }
  const jsonBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  const arrayMatch = content.match(/\[[\s\S]*\]/)
  events = tryParse(content) ?? (jsonBlock ? tryParse(jsonBlock[1] ?? '') : null) ?? (arrayMatch ? tryParse(arrayMatch[0] ?? '') : null) ?? []

  if (!Array.isArray(events)) return { imported: 0, skipped: 0 }

  let imported = 0
  let skipped = 0
  const validTypes: EventTypeName[] = ['CONCERT', 'CLUB_NIGHT', 'HOME_PARTY', 'PUB_NIGHT', 'BEACH_PARTY', 'YACHT_PARTY']

  for (const ev of events) {
    try {
      const name = ev.name ?? 'Unnamed Event'
      const startsAt = new Date(ev.date ?? '')
      if (isNaN(startsAt.getTime()) || startsAt < new Date()) { skipped++; continue }

      const endsAt = ev.endDate ? new Date(ev.endDate) : undefined
      const aiEventId = stableHash(`perplexity|${name}|${ev.date ?? ''}|${city}`)
      const address = ev.address ?? ev.venue ?? city
      const neighbourhood = ev.venue ?? address.split(',')[0] ?? city
      const description = truncateDescription(ev.description, name)

      if (!isNightlifeEvent(name, description)) { skipped++; continue }

      const type: EventTypeName = validTypes.includes(ev.type as EventTypeName) ? (ev.type as EventTypeName) : 'CONCERT'
      const price = typeof ev.price === 'number' ? ev.price : 0

      await prisma.event.upsert({
        where: { aiEventId },
        update: {
          name, description, startsAt, endsAt,
          address, neighbourhood,
          coverImageUrl: ev.imageUrl ?? null,
          socialSourceUrl: ev.url,
        },
        create: {
          hostId, name, type, description, startsAt,
          endsAt: endsAt ?? null, lat, lng, address, neighbourhood,
          showNeighbourhoodOnly: false, capacity: 300, price,
          ticketQuantity: 0, ticketsRemaining: 0,
          alcoholPolicy: 'PROVIDED', ageRestriction: 'AGE_18',
          vibeTags: [], whatToBring: [],
          isPublished: true, isCancelled: false,
          coverImageUrl: ev.imageUrl ?? null,
          aiEventId, externalSource: 'perplexity',
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
  _hostIdHint: string,
  force = false,
): Promise<SyncResult> {
  // Throttle: skip if synced this city recently (unless forced — e.g. explicit user AI scan)
  const key = city.toLowerCase()
  const last = lastSyncTime.get(key) ?? 0
  if (!force && Date.now() - last < SYNC_THROTTLE_MS) {
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
      const result = await syncTicketmaster(lat, lng, hostId)
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
      const result = await syncEventbrite(lat, lng, hostId)
      totalImported += result.imported
      totalSkipped += result.skipped
      sources.push('eventbrite')
    } catch {
      // source failure is non-fatal
    }
  }

  // SerpAPI Google Events
  if (process.env['SERPAPI_KEY']) {
    try {
      const result = await syncSerpApi(city, lat, lng, hostId)
      totalImported += result.imported
      totalSkipped += result.skipped
      sources.push('serpapi')
    } catch {
      // source failure is non-fatal
    }
  }

  // Perplexity AI Search
  if (process.env['PERPLEXITY_API_KEY']) {
    try {
      const result = await syncPerplexity(city, lat, lng, hostId)
      totalImported += result.imported
      totalSkipped += result.skipped
      sources.push('perplexity')
    } catch {
      // source failure is non-fatal
    }
  }

  return { imported: totalImported, skipped: totalSkipped, sources }
}
