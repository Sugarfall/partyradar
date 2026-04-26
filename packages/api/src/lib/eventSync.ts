/**
 * Multi-source external event sync utility.
 * Supports Ticketmaster, Skiddle, Eventbrite, SerpAPI Google Events, and Perplexity AI.
 * Throttled to once per 30 minutes per city.
 */
import { prisma } from '@partyradar/db'
import { createHash } from 'crypto'

// ── Geocoding helpers ─────────────────────────────────────────────────────────

const GOOGLE_API_KEY = process.env['GOOGLE_PLACES_API_KEY'] ?? ''

/**
 * Reverse-geocode a lat/lng pair to a full formatted street address.
 * Returns null if the API key is missing, the request fails, or no results.
 */
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!GOOGLE_API_KEY) return null
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}`
    const r = await fetch(url)
    const data = await r.json() as {
      status: string
      results: Array<{ formatted_address: string; types: string[] }>
    }
    if (data.status !== 'OK' || !data.results.length) return null
    // Prefer a result typed as street_address, premise, or establishment
    const preferred = data.results.find(
      (res) =>
        res.types.includes('street_address') ||
        res.types.includes('premise') ||
        res.types.includes('establishment')
    )
    return (preferred ?? data.results[0])?.formatted_address ?? null
  } catch {
    return null
  }
}

/**
 * Google Places Text Search — resolve a venue name in a city to its canonical
 * address + lat/lng. Used to verify Perplexity-sourced venue addresses because
 * Perplexity routinely hallucinates street numbers/postcodes that look
 * plausible (e.g. "The Admiral Bar, 156-158 Great Western Road, Glasgow G4 9AE"
 * when the real Admiral Bar is at "126 Admiral St, Glasgow G41 1HU"). Cached
 * in-process for the session to avoid paying for the same venue twice.
 *
 * Returns null silently on any failure so callers can fall back to whatever
 * the source supplied.
 */
interface PlaceLookup {
  formattedAddress: string
  lat: number
  lng: number
}
const placeCache = new Map<string, PlaceLookup | null>()

async function findPlace(venueName: string, city: string): Promise<PlaceLookup | null> {
  if (!GOOGLE_API_KEY) return null
  const key = `${venueName.toLowerCase().trim()}|${city.toLowerCase().trim()}`
  if (placeCache.has(key)) return placeCache.get(key) ?? null
  try {
    const q = encodeURIComponent(`${venueName}, ${city}`)
    const url =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${q}&inputtype=textquery` +
      `&fields=formatted_address,geometry,name` +
      `&key=${GOOGLE_API_KEY}`
    const r = await fetch(url)
    const data = await r.json() as {
      status: string
      candidates?: Array<{
        formatted_address?: string
        name?: string
        geometry?: { location?: { lat: number; lng: number } }
      }>
    }
    if (data.status !== 'OK' || !data.candidates?.length) {
      placeCache.set(key, null)
      return null
    }
    const best = data.candidates[0]!
    const loc = best.geometry?.location
    if (!best.formatted_address || !loc) {
      placeCache.set(key, null)
      return null
    }
    const result: PlaceLookup = {
      formattedAddress: best.formatted_address,
      lat: loc.lat,
      lng: loc.lng,
    }
    placeCache.set(key, result)
    return result
  } catch {
    placeCache.set(key, null)
    return null
  }
}

// ── Venue geo resolver ────────────────────────────────────────────────────────

const venueGeoCache = new Map<string, { id: string; address: string; lat: number; lng: number } | null>()

/**
 * Given a venue name and city, looks up our curated Venue record (case-
 * insensitive partial match).  When found, returns its verified address and
 * coordinates so they override whatever the external source provided.
 *
 * Results are cached in-process for the lifetime of the sync run to avoid
 * repeated DB hits for the same venue across many events.
 */
async function resolveVenueGeo(
  venueName: string | null | undefined,
  cityOrAddress?: string,
): Promise<{ id: string; address: string; lat: number; lng: number } | null> {
  if (!venueName?.trim()) return null
  // Extract a usable city token: prefer an explicit city param, otherwise pull the
  // first word-only token from an address string ("100 Eastvale Pl, Glasgow G3 8QG" → "Glasgow")
  const cityToken = cityOrAddress?.trim()
    ? (cityOrAddress.includes(',')
        ? cityOrAddress.split(',').find(p => /^[A-Za-z\s]+$/.test(p.trim()))?.trim() ?? cityOrAddress.trim()
        : cityOrAddress.trim())
    : ''
  const key = `${cityToken}::${venueName.trim().toLowerCase()}`
  if (venueGeoCache.has(key)) return venueGeoCache.get(key)!

  try {
    const venues = await prisma.venue.findMany({
      where: {
        ...(cityToken ? { city: { contains: cityToken, mode: 'insensitive' } } : {}),
        name: { contains: venueName.trim(), mode: 'insensitive' },
      },
      select: { id: true, name: true, address: true, lat: true, lng: true },
      take: 1,
    })
    const result = venues[0]
      ? { id: venues[0].id, address: venues[0].address, lat: venues[0].lat, lng: venues[0].lng }
      : null
    venueGeoCache.set(key, result)
    return result
  } catch {
    return null
  }
}

/** Returns true when an address string is too vague to be useful (just city/Unknown). */
function isVagueAddress(address: string, city: string): boolean {
  const a = address.toLowerCase().trim()
  const c = city.toLowerCase().trim()
  if (a === 'unknown' || a === '') return true
  if (a === c) return true
  // Less than 2 comma-separated parts almost always means it's just a city/region
  return a.split(',').length < 2
}

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
 * Venue-level blocklist — rejects events whose VENUE/ADDRESS is clearly
 * not a nightlife establishment, even if the event title/description is
 * generic. Catches cases where Perplexity/SerpAPI classified Aldi as a
 * "pub" or a BetFred betting shop as a "bar". Keep entries lower-case
 * and distinctive (avoid common words like "bar" that legit pubs contain).
 */
const VENUE_REJECT_KEYWORDS = [
  // Betting shops / bookmakers (NOT nightlife)
  'betfred', 'bet365', 'betting shop', 'bookmaker', 'bookmakers',
  'paddy power', 'ladbrokes', 'william hill', 'coral betting', 'betting office',
  // Supermarkets & grocery (NOT nightlife)
  'aldi', 'tesco', 'sainsbury', "sainsbury's", 'asda', 'lidl', 'morrisons',
  'waitrose', 'iceland foods', 'marks & spencer', 'm&s food', 'co-operative food',
  'supermarket', 'grocery store', 'grocery shop', 'corner shop', 'convenience store',
  // Banks & offices
  ' bank ', 'barclays', 'hsbc', 'natwest', 'lloyds bank', 'santander bank',
  'halifax bank', 'post office', 'royal mail',
  // Health / pharmacy / services (not venues)
  'pharmacy', 'boots pharmacy', 'superdrug', 'chemist', 'gp surgery',
  'dentist', 'opticians', 'hospital', 'clinic',
  // Fitness / gyms (not nightlife)
  'pure gym', 'puregym', 'the gym group', 'virgin active', 'david lloyd',
  'fitness first', 'anytime fitness',
  // Fast food / chains that aren't nightlife venues
  "mcdonald's", 'mcdonalds', 'kfc', 'burger king', 'subway sandwich',
  'greggs', 'costa coffee', 'starbucks', "domino's pizza", 'pizza hut',
  // Retail
  'primark', 'h&m store', 'zara store', 'next store', 'argos',
  'b&q', 'ikea', 'home bargains', 'poundland', 'b&m',
  // Transport / logistics
  'petrol station', 'gas station', 'car park', 'parking garage',
  'bus station', 'train station', 'airport terminal',
]

/**
 * Returns true if the event looks like a nightlife/music event worth importing.
 * Returns false if the name, description, OR venue/address matches a blocked
 * keyword (family, tourist, fitness, betting shop, supermarket, etc.).
 * The venue check is critical: Perplexity sometimes classifies an Aldi or a
 * BetFred betting shop as a "PUB_NIGHT", and without this they'd leak through.
 */
function isNightlifeEvent(name: string, description: string, venue?: string | null, address?: string | null): boolean {
  const text = `${name} ${description}`.toLowerCase()
  if (REJECT_KEYWORDS.some((kw) => text.includes(kw))) return false
  const venueText = `${venue ?? ''} ${address ?? ''}`.toLowerCase()
  if (venueText.trim() && VENUE_REJECT_KEYWORDS.some((kw) => venueText.includes(kw))) return false
  return true
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
  state?: { name?: string; stateCode?: string }
  country?: { name?: string; countryCode?: string }
  address?: { line1?: string; line2?: string }
  postalCode?: string
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
      const cityName = venue?.city?.name ?? ''
      // Build the fullest possible address from Ticketmaster venue fields
      const addrParts = [
        venue?.address?.line1 || venue?.name,  // street or venue name as fallback
        venue?.address?.line2,
        cityName,
        venue?.state?.stateCode ?? venue?.state?.name,
        venue?.postalCode,
      ].filter(Boolean)
      let address = addrParts.join(', ') || cityName || 'Unknown'
      // If still vague, reverse-geocode the exact coordinates
      if (isVagueAddress(address, cityName)) {
        const geo = await reverseGeocode(evLat, evLng)
        if (geo) address = geo
      }
      const neighbourhood = (cityName || address.split(',')[0]) ?? 'Unknown'
      const venueName = venue?.name ?? null
      const name = ev.name ?? 'Unnamed Event'
      const description = truncateDescription(ev.info ?? ev.pleaseNote, name)

      // Skip non-nightlife events (also rejects betting shops, supermarkets, etc. by venue name)
      if (!isNightlifeEvent(name, description, venueName, address)) { skipped++; continue }

      const startsAt = ev.dates?.start?.dateTime ? new Date(ev.dates.start.dateTime) : new Date()
      const endsAt = ev.dates?.end?.dateTime ? new Date(ev.dates.end.dateTime) : undefined
      const price = ev.priceRanges?.[0]?.min ?? 0
      const coverImageUrl = ev.images?.find(
        (img) => img.ratio === '16_9' && (img.width ?? 0) > 500
      )?.url ?? ev.images?.[0]?.url ?? undefined
      const type = overrideTypeByVenue(venueName, mapTMEventType(ev.classifications))
      const vg = await resolveVenueGeo(venueName, address)
      const geo = vg
        ? { lat: vg.lat, lng: vg.lng, address: vg.address, venueId: vg.id }
        : { lat: evLat, lng: evLng, address }

      await prisma.event.upsert({
        where: { ticketmasterId: ev.id },
        update: {
          name, description, startsAt, endsAt,
          ...geo,
          neighbourhood, venueName, coverImageUrl, price,
          socialSourceUrl: ev.url,
        },
        create: {
          hostId, name, type, description, startsAt,
          endsAt: endsAt ?? null,
          ...geo,
          neighbourhood, venueName,
          showNeighbourhoodOnly: false, capacity: 200, price,
          ticketQuantity: 0, ticketsRemaining: 0,
          alcoholPolicy: 'PROVIDED', ageRestriction: 'AGE_18',
          vibeTags: [], whatToBring: [],
          isPublished: true, isCancelled: false,
          coverImageUrl, ticketmasterId: ev.id,
          externalSource: 'ticketmaster', socialSourceUrl: ev.url,
        },
      })
      imported++
    } catch (err: any) {
      if (err?.code !== 'P2002') console.warn('[sync:ticketmaster] import error:', err?.message ?? err)
      skipped++
    }
  }

  return { imported, skipped }
}

// ── Skiddle ───────────────────────────────────────────────────────────────────

interface SkiddleVenue {
  name?: string
  address?: string
  town?: string
  postcode?: string
  country?: string
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
      const townName = ev.venue?.town ?? ''
      // Build full address: venue name + street address + town + postcode
      const addrParts = [
        ev.venue?.address && ev.venue.address !== townName ? ev.venue.address : ev.venue?.name,
        townName,
        ev.venue?.postcode,
      ].filter(Boolean)
      let address = addrParts.join(', ') || townName || 'Unknown'
      // If still vague, reverse-geocode the exact coordinates
      if (isVagueAddress(address, townName)) {
        const geo = await reverseGeocode(evLat, evLng)
        if (geo) address = geo
      }
      const neighbourhood = (townName || address.split(',')[0]) ?? 'Unknown'
      const venueName = ev.venue?.name ?? null
      const name = ev.eventname ?? 'Unnamed Event'
      const description = truncateDescription(ev.description, name)

      // Skip non-nightlife events (also rejects betting shops, supermarkets, etc. by venue name)
      if (!isNightlifeEvent(name, description, venueName, address)) { skipped++; continue }

      const startsAt = ev.date ? new Date(ev.date) : new Date()
      const endsAt = ev.enddate ? new Date(ev.enddate) : undefined
      const price = parseFloat(String(ev.entryprice ?? '0')) || 0
      const type = overrideTypeByVenue(venueName, mapSkiddleEventType(ev.genres))
      const vg = await resolveVenueGeo(venueName, address)
      const geo = vg
        ? { lat: vg.lat, lng: vg.lng, address: vg.address, venueId: vg.id }
        : { lat: evLat, lng: evLng, address }

      await prisma.event.upsert({
        where: { skiddleId: ev.id },
        update: {
          name, description, startsAt, endsAt,
          ...geo,
          neighbourhood, venueName,
          coverImageUrl: ev.imageurl ?? null, price,
          socialSourceUrl: ev.link,
        },
        create: {
          hostId, name, type, description, startsAt,
          endsAt: endsAt ?? null,
          ...geo,
          neighbourhood, venueName,
          showNeighbourhoodOnly: false, capacity: 200, price,
          ticketQuantity: 0, ticketsRemaining: 0,
          alcoholPolicy: 'PROVIDED', ageRestriction: 'AGE_18',
          vibeTags: [], whatToBring: [],
          isPublished: true, isCancelled: false,
          coverImageUrl: ev.imageurl ?? null, skiddleId: ev.id,
          externalSource: 'skiddle', socialSourceUrl: ev.link,
        },
      })
      imported++
    } catch (err: any) {
      if (err?.code !== 'P2002') console.warn('[sync:skiddle] import error:', err?.message ?? err)
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
      const venueName = ev.venue?.name ?? null
      const name = ev.name?.text ?? 'Unnamed Event'
      const description = truncateDescription(ev.description?.text, name)

      // Skip non-nightlife events even within music/nightlife categories
      // (also rejects betting shops, supermarkets, etc. by venue name)
      if (!isNightlifeEvent(name, description, venueName, address)) { skipped++; continue }

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
      const type = overrideTypeByVenue(venueName, mapEBEventType(categories))
      const coverImageUrl = ev.logo?.original?.url ?? null
      const vg = await resolveVenueGeo(venueName, address)
      const geo = vg
        ? { lat: vg.lat, lng: vg.lng, address: vg.address, venueId: vg.id }
        : { lat: evLat, lng: evLng, address }

      await prisma.event.upsert({
        where: { eventbriteId: ev.id },
        update: {
          name, description, startsAt, endsAt,
          ...geo,
          neighbourhood, venueName, coverImageUrl, price,
          eventbriteUrl: ev.url, socialSourceUrl: ev.url,
        },
        create: {
          hostId, name, type, description, startsAt,
          endsAt: endsAt ?? null,
          ...geo,
          neighbourhood, venueName,
          showNeighbourhoodOnly: false, capacity, price,
          ticketQuantity: price > 0 ? capacity : 0,
          ticketsRemaining: price > 0 ? capacity : 0,
          alcoholPolicy: 'PROVIDED', ageRestriction: 'AGE_18',
          vibeTags: [], whatToBring: [],
          isPublished: true, isCancelled: false,
          coverImageUrl, eventbriteId: ev.id,
          eventbriteUrl: ev.url, externalSource: 'eventbrite',
          socialSourceUrl: ev.url,
        },
      })
      imported++
    } catch (err: any) {
      if (err?.code !== 'P2002') console.warn('[sync:eventbrite] import error:', err?.message ?? err)
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
  const whenStr = when ?? ''
  const dateStr = startDate ?? ''

  // 1. Direct ISO parse of 'when' (handles strings with embedded timezone like "2026-04-26T21:00:00+01:00")
  if (whenStr) {
    const d = new Date(whenStr)
    if (!isNaN(d.getTime())) return d
  }

  // 2. SerpAPI most commonly returns:
  //    when  = "Saturday, April 26 · 9 PM – 3 AM"   (or "Sat, Apr 26 · 9:30 PM")
  //    startDate = "2026-04-26"                       (date-only ISO string)
  // Combine startDate + time extracted from 'when', treating the time as Europe/London.
  if (dateStr) {
    const baseDate = new Date(dateStr)
    if (!isNaN(baseDate.getTime())) {
      // Extract time after "·" or "," separator — e.g. "· 9 PM", "· 9:30 PM"
      const timeMatch = whenStr.match(/[·,]\s*(\d{1,2}(?::\d{2})?)\s*(AM|PM)/i)
      if (timeMatch) {
        const parts = timeMatch[1].split(':')
        let hour = parseInt(parts[0], 10)
        const minute = parts[1] ? parseInt(parts[1], 10) : 0
        const isPM = timeMatch[2].toUpperCase() === 'PM'
        if (isPM && hour !== 12) hour += 12
        if (!isPM && hour === 12) hour = 0
        const y  = baseDate.getUTCFullYear()
        const mo = baseDate.getUTCMonth()
        const d  = baseDate.getUTCDate()
        // Convert London local time → UTC (respects BST/GMT automatically)
        const offsetMs = getLondonOffsetMs(y, mo, d)
        return new Date(Date.UTC(y, mo, d, hour, minute, 0) - offsetMs)
      }
      // No time info in 'when' — return midnight-UTC base date (adjustDateByType will correct it)
      return baseDate
    }
  }

  // 3. Fallback: append current year (handles "Mon, Apr 14, 8:00 PM" with no year)
  if (whenStr) {
    const d2 = new Date(`${whenStr} ${new Date().getFullYear()}`)
    if (!isNaN(d2.getTime())) {
      // No timezone info — treat parsed hours as Europe/London local time
      const y   = d2.getFullYear()
      const mo  = d2.getMonth()
      const day = d2.getDate()
      const h   = d2.getHours()
      const m   = d2.getMinutes()
      const offsetMs = getLondonOffsetMs(y, mo, day)
      return new Date(Date.UTC(y, mo, day, h, m, 0) - offsetMs)
    }
  }

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

// Known concert halls / arenas — events here are always CONCERT, even when
// sources (especially Perplexity) misclassify them as PUB_NIGHT. The Barrowland
// bug was a live Perplexity row tagged PUB_NIGHT — this override fixes it.
const KNOWN_CONCERT_VENUES = [
  // Glasgow
  'barrowland', 'barrowlands', 'barrowland ballroom',
  'ovo hydro', 'sse hydro', 'the hydro',
  "king tut's", "king tut's wah wah hut",
  'o2 academy glasgow', 'academy glasgow',
  'oran mor', 'òran mór',
  // UK arenas / concert halls
  'o2 arena', 'o2 academy', 'o2 forum', 'o2 shepherd',
  'ao arena', 'co-op live', 'royal albert hall',
  'wembley arena', 'wembley stadium', 'the ovo arena',
  'alexandra palace', 'brixton academy', 'hammersmith apollo',
  'manchester apollo', 'first direct arena', 'utilita arena',
  'sse arena', 'bonus arena', 'p&j live',
  'symphony hall', 'royal festival hall', 'royal concert hall',
  'usher hall', 'edinburgh playhouse',
  // International
  'madison square garden', 'red rocks', 'the forum inglewood',
  'greek theatre', 'hollywood bowl',
]

/**
 * If the venue name matches a known concert hall, force the type to CONCERT.
 * Otherwise return the fallback (typically whatever the source returned).
 * Case-insensitive substring match.
 */
function overrideTypeByVenue(venueName: string | null | undefined, fallback: EventTypeName): EventTypeName {
  if (!venueName) return fallback
  const v = venueName.toLowerCase()
  if (KNOWN_CONCERT_VENUES.some((name) => v.includes(name))) return 'CONCERT'
  if (KNOWN_CLUB_VENUES.some((name) => v.includes(name))) return 'CLUB_NIGHT'
  return fallback
}

/**
 * Parse a Perplexity-returned date string into a Date. When the value is
 * date-only (YYYY-MM-DD) or parses to exactly 00:00 UTC — which Perplexity
 * commonly does as a placeholder "I don't actually know the start time" — we
 * infer a type-appropriate local time (Europe/London) so the event doesn't
 * display as "starts at 01:00" (BST of midnight UTC).
 *
 * Quirk we're fixing: a pub quiz returned as "2026-04-23" was parsed as
 * 00:00Z → shown as 01:00 BST the next day → with the old 6h LIVE fallback,
 * it stayed in "HAPPENING NOW" until 07:00 BST, showing "4h remaining at 3am".
 */
function parsePerplexityStart(raw: string | undefined, rawType: string): Date {
  if (!raw) return new Date(NaN)
  const d = new Date(raw)
  if (isNaN(d.getTime())) return d

  // Detect date-only or midnight-UTC placeholder.
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())
  const isMidnightUtc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
  if (!isDateOnly && !isMidnightUtc) return d

  // Type-appropriate local hour (Europe/London — most of our cities are UK).
  // These are conservative "when do these events usually start".
  const localHourByType: Record<string, number> = {
    CLUB_NIGHT:  22,
    HOME_PARTY:  21,
    PUB_NIGHT:   20,
    CONCERT:     19,
    BEACH_PARTY: 16,
    YACHT_PARTY: 18,
  }
  const localHour = localHourByType[rawType] ?? 20

  // Compose UTC using the date portion of `raw` at the local hour, converting
  // to UTC via the Europe/London offset for that calendar day (handles BST/GMT
  // transitions automatically via Intl formatToParts — works reliably in Node
  // where `new Date(toLocaleString(...))` returns Invalid Date).
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth()
  const day = d.getUTCDate()
  const offsetMs = getLondonOffsetMs(year, month, day)
  return new Date(Date.UTC(year, month, day, localHour, 0, 0) - offsetMs)
}

/**
 * Europe/London offset from UTC in milliseconds on the given date (handles
 * the BST/GMT boundary). Uses Intl.DateTimeFormat 'longOffset' which Node
 * reliably formats as "GMT+01:00" / "GMT".
 */
function getLondonOffsetMs(year: number, month: number, day: number): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    timeZoneName: 'longOffset',
  })
  const probe = new Date(Date.UTC(year, month, day, 12, 0, 0))
  const parts = fmt.formatToParts(probe)
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const match = tzName.match(/GMT([+-])(\d{1,2}):?(\d{2})?/)
  if (!match) return 0
  const sign = match[1] === '+' ? 1 : -1
  const hours = parseInt(match[2] ?? '0', 10)
  const mins = match[3] ? parseInt(match[3], 10) : 0
  return sign * (hours * 3600_000 + mins * 60_000)
}

function mapSerpEventType(title: string, description: string, venueName?: string): EventTypeName | null {
  const text = `${title} ${description}`.toLowerCase()
  const venue = (venueName ?? '').toLowerCase()
  // Venue-based overrides first — any event at a known concert hall is
  // CONCERT even if the title says "Quiz Night" (protects against miscategorised
  // affiliate listings at Barrowland / O2 Academy / etc.)
  if (venue && KNOWN_CONCERT_VENUES.some(v => venue.includes(v))) return 'CONCERT'
  if (venue && KNOWN_CLUB_VENUES.some(v => venue.includes(v))) return 'CLUB_NIGHT'
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

      // Compute venue + raw address early so isNightlifeEvent can reject
      // non-nightlife venues (betting shops / supermarkets / offices etc.)
      const venueName = ev.venue?.name ?? ''
      const rawAddr = (ev.address ?? []).join(', ')

      // Skip non-nightlife events — query filters but Google still returns misc results
      if (!isNightlifeEvent(name, description, venueName, rawAddr)) { skipped++; continue }

      // Skip if type can't be determined from keywords (not nightlife enough)
      const type = mapSerpEventType(name, ev.description ?? '', venueName)
      if (!type) { skipped++; continue }

      const serpApiId = stableHash(`${name}|${ev.date?.start_date ?? ''}|${ev.address?.[0] ?? ''}`)
      // SerpAPI returns address as an array — e.g. ["123 High St", "Glasgow, Scotland"]
      // Prepend venue name if it isn't already in the address array
      const addrArray = ev.address ?? []
      const fullAddrParts = [
        venueName && !addrArray.some(a => a.toLowerCase().includes(venueName.toLowerCase())) ? venueName : null,
        ...addrArray,
      ].filter(Boolean) as string[]
      let address = fullAddrParts.length > 0 ? fullAddrParts.join(', ') : city
      // Verify the venue address against Google Places so SerpAPI's partial
      // address arrays get upgraded to canonical postcoded strings when
      // available. Silent no-op if the lookup fails.
      let serpLat = lat
      let serpLng = lng
      if (venueName) {
        const place = await findPlace(venueName, city)
        if (place) {
          address = place.formattedAddress
          serpLat = place.lat
          serpLng = place.lng
        }
      }
      const neighbourhood = (venueName || address.split(',')[0]) ?? city
      const coverImageUrl = ev.thumbnail ?? null
      const socialSourceUrl = ev.ticket_info?.find((t) => t.link)?.link ?? ev.link
      const isPaid = ev.ticket_info?.some((t) => t.is_paid) ?? false
      const price = isPaid ? 10 : 0

      const vg = await resolveVenueGeo(venueName, city)
      const geo = vg
        ? { lat: vg.lat, lng: vg.lng, address: vg.address, venueId: vg.id }
        : { lat: serpLat, lng: serpLng, address }

      await prisma.event.upsert({
        where: { serpApiId },
        update: { name, description, startsAt, ...geo, neighbourhood, venueName: venueName || null, coverImageUrl, socialSourceUrl },
        create: {
          hostId, name, type, description, startsAt, endsAt: null,
          ...geo,
          neighbourhood, venueName: venueName || null,
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
    } catch (err: any) {
      if (err?.code !== 'P2002') console.warn('[sync:serpapi] import error:', err?.message ?? err)
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
    `[{"name":"","date":"ISO8601","endDate":"ISO8601 or null","venue":"exact venue name","address":"FULL street address including street number, street name, city, postcode — e.g. 22 Jamaica St, Glasgow G1 4QD","price":0,"type":"PUB_NIGHT","description":"what happens — music/host/atmosphere","url":"direct link","imageUrl":""}]\n` +
    `CRITICAL: "address" must be a FULL street address (number + street + city + postcode), NOT just the city name. ` +
    `If you don't know the full address, look it up from the venue name.\n` +
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
      // Infer a reasonable local time when Perplexity returns a date-only
      // value or a midnight-UTC placeholder. Without this, a "Quiz Night
      // 2026-04-23" comes back as 00:00Z, which displays as 01:00 BST the
      // next morning — users saw quiz events "starting at 1am" and, with
      // the old 6h end fallback, still "live" at 3am the following day.
      const rawType = (ev.type && typeof ev.type === 'string' ? ev.type : '').toUpperCase()
      const startsAt = parsePerplexityStart(ev.date, rawType)
      if (isNaN(startsAt.getTime()) || startsAt < new Date()) { skipped++; continue }

      const endsAt = ev.endDate ? new Date(ev.endDate) : undefined
      const aiEventId = stableHash(`perplexity|${name}|${ev.date ?? ''}|${city}`)
      // Build the fullest address from AI response: prefer explicit address > venue name + city
      let address = ev.address && !isVagueAddress(ev.address, city)
        ? ev.address
        : ev.venue
          ? `${ev.venue}, ${city}`
          : city
      // Verify & replace with Google Places canonical address whenever we
      // have a venue name — Perplexity routinely hallucinates plausible-but-
      // wrong street/postcode combos (e.g. two "Admiral Bar" rows with
      // different G4 / G41 postcodes that don't actually exist). Google
      // Places Text Search resolves "The Admiral Bar, Glasgow" → the real
      // canonical address. Also pins lat/lng to the real venue so the
      // dedupe geo-keys align across sources.
      let venueLat = lat
      let venueLng = lng
      if (ev.venue) {
        const place = await findPlace(ev.venue, city)
        if (place) {
          address = place.formattedAddress
          venueLat = place.lat
          venueLng = place.lng
        }
      }
      // If still vague (no venue, no place match), reverse-geocode the city pin
      if (isVagueAddress(address, city)) {
        const geo = await reverseGeocode(venueLat, venueLng)
        if (geo) address = geo
      }
      const neighbourhood = ev.venue ?? address.split(',')[0] ?? city
      const venueName = ev.venue ?? null
      const description = truncateDescription(ev.description, name)

      // Reject betting shops, supermarkets, etc. by venue name — Perplexity
      // occasionally returns Aldi / BetFred etc. classified as "PUB_NIGHT".
      if (!isNightlifeEvent(name, description, venueName, address)) { skipped++; continue }

      // Start with Perplexity's suggested type, but override with venue-based
      // lookup so Barrowland / O2 Academy / etc. are always CONCERT regardless
      // of what the AI guessed.
      const aiType: EventTypeName = validTypes.includes(ev.type as EventTypeName) ? (ev.type as EventTypeName) : 'CONCERT'
      const type: EventTypeName = overrideTypeByVenue(venueName, aiType)
      const price = typeof ev.price === 'number' ? ev.price : 0

      const vg = await resolveVenueGeo(venueName, city)
      const geo = vg
        ? { lat: vg.lat, lng: vg.lng, address: vg.address, venueId: vg.id }
        : { lat: venueLat, lng: venueLng, address }

      await prisma.event.upsert({
        where: { aiEventId },
        update: {
          name, description, startsAt, endsAt,
          ...geo,
          neighbourhood, venueName,
          coverImageUrl: ev.imageUrl ?? null,
          socialSourceUrl: ev.url,
        },
        create: {
          hostId, name, type, description, startsAt,
          endsAt: endsAt ?? null,
          ...geo,
          neighbourhood, venueName,
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
    } catch (err: any) {
      if (err?.code !== 'P2002') console.warn('[sync:perplexity] import error:', err?.message ?? err)
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

  // Use (or create) the dedicated PartyRadar Assistant system account as hostId for all
  // externally-synced events — avoids mixing real admin accounts with bot-created content.
  const systemUser = await prisma.user.upsert({
    where: { firebaseUid: 'partyradar_system' },
    create: {
      firebaseUid: 'partyradar_system',
      email: 'assistant@partyradar.app',
      username: 'partyradar',
      displayName: 'PartyRadar Assistant',
      photoUrl: 'https://partyradar.app/icons/icon-192.png',
      interests: [],
      subscriptionTier: 'FREE',
    },
    update: {
      displayName: 'PartyRadar Assistant',
      photoUrl: 'https://partyradar.app/icons/icon-192.png',
    },
  })
  const hostId = systemUser.id

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
    } catch (err) {
      console.error('[sync:ticketmaster] source sync failed:', err)
    }
  }

  // Skiddle
  if (process.env['SKIDDLE_API_KEY']) {
    try {
      const result = await syncSkiddle(lat, lng, hostId)
      totalImported += result.imported
      totalSkipped += result.skipped
      sources.push('skiddle')
    } catch (err) {
      console.error('[sync:skiddle] source sync failed:', err)
    }
  }

  // Eventbrite
  if (process.env['EVENTBRITE_PRIVATE_TOKEN']) {
    try {
      const result = await syncEventbrite(lat, lng, hostId)
      totalImported += result.imported
      totalSkipped += result.skipped
      sources.push('eventbrite')
    } catch (err) {
      console.error('[sync:eventbrite] source sync failed:', err)
    }
  }

  // SerpAPI Google Events
  if (process.env['SERPAPI_KEY']) {
    try {
      const result = await syncSerpApi(city, lat, lng, hostId)
      totalImported += result.imported
      totalSkipped += result.skipped
      sources.push('serpapi')
    } catch (err) {
      console.error('[sync:serpapi] source sync failed:', err)
    }
  }

  // Perplexity AI Search
  if (process.env['PERPLEXITY_API_KEY']) {
    try {
      const result = await syncPerplexity(city, lat, lng, hostId)
      totalImported += result.imported
      totalSkipped += result.skipped
      sources.push('perplexity')
    } catch (err) {
      console.error('[sync:perplexity] source sync failed:', err)
    }
  }

  return { imported: totalImported, skipped: totalSkipped, sources }
}
