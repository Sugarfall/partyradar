import { Router } from 'express'
import { prisma } from '@partyradar/db'
import type { VenueType } from '@prisma/client'
import { optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

const GOOGLE_API_KEY = process.env['GOOGLE_PLACES_API_KEY'] ?? ''

// Map Google Places types → our VenueType enum
const GOOGLE_TYPE_MAP: Record<string, VenueType> = {
  night_club: 'NIGHTCLUB',
  bar: 'BAR',
  pub: 'PUB',
  concert_hall: 'CONCERT_HALL',
  music_venue: 'CONCERT_HALL',
  performing_arts_theater: 'CONCERT_HALL',
  live_music_venue: 'CONCERT_HALL',
  karaoke: 'LOUNGE',
  lounge: 'LOUNGE',
  cocktail_bar: 'BAR',
  wine_bar: 'BAR',
  brewery: 'BAR',
  beer_hall: 'PUB',
  comedy_club: 'LOUNGE',
  dance_hall: 'NIGHTCLUB',
  sports_bar: 'BAR',
}

/**
 * A place must have at least one of these Google types to be accepted.
 * This prevents supermarkets, petrol stations, restaurants, etc. from appearing.
 */
const NIGHTLIFE_TYPES = new Set([
  'night_club', 'bar', 'pub', 'concert_hall', 'music_venue',
  'performing_arts_theater', 'live_music_venue', 'karaoke', 'lounge',
  'cocktail_bar', 'wine_bar', 'brewery', 'beer_hall', 'comedy_club',
  'dance_hall', 'sports_bar',
])

// Types to search for in Google Places
const SEARCH_TYPES = [
  'night_club',
  'bar',
  'pub',             // important for UK, Ireland, Australia
]

// Venue names containing these keywords are rejected regardless of type
const REJECT_VENUE_KEYWORDS = [
  'casino', 'casinos', 'betting', 'bookmaker', 'bookmakers',
  'ladbrokes', 'william hill', 'bet365', 'paddy power', 'coral',
  'betfair', 'skybet', 'sky bet', 'betfred', 'betvictor', 'unibet',
  '888sport', 'boyle sports', 'boylesports', 'stan james', 'grosvenor',
  'gambling', 'bingo hall', 'amusement arcade', 'slot machines', 'amusements',
]

function isRejectedVenue(name: string): boolean {
  const lower = name.toLowerCase()
  return REJECT_VENUE_KEYWORDS.some((kw) => lower.includes(kw))
}

// Additional text search queries to cover more venues
const TEXT_QUERIES = [
  'live music venue',
  'concert hall',
  'rooftop bar',
  'nightclub',
  'karaoke bar',
  'sports bar',
]

interface GooglePlace {
  place_id: string
  name: string
  geometry: { location: { lat: number; lng: number } }
  formatted_address?: string
  vicinity?: string
  types?: string[]
  rating?: number
  opening_hours?: { open_now?: boolean; weekday_text?: string[] }
  photos?: { photo_reference: string }[]
  business_status?: string
  price_level?: number
  user_ratings_total?: number
}

interface GoogleNearbyResponse {
  results: GooglePlace[]
  next_page_token?: string
  status: string
}

interface GooglePlaceDetails {
  result: {
    place_id: string
    name: string
    formatted_address: string
    formatted_phone_number?: string
    website?: string
    geometry: { location: { lat: number; lng: number } }
    types: string[]
    rating?: number
    opening_hours?: { weekday_text?: string[] }
    photos?: { photo_reference: string }[]
    address_components?: { long_name: string; types: string[] }[]
    reviews?: { text: string }[]
  }
  status: string
}

function extractCity(place: GooglePlace, addressComponents?: { long_name: string; types: string[] }[]): string {
  if (addressComponents) {
    const city = addressComponents.find((c) =>
      c.types.includes('locality') || c.types.includes('postal_town')
    )
    if (city) return city.long_name
  }
  // Fallback: extract from formatted_address or vicinity
  const addr = place.formatted_address ?? place.vicinity ?? ''
  const parts = addr.split(',').map((p) => p.trim())
  return parts.length >= 2 ? parts[parts.length - 2]! : parts[0] ?? 'Unknown'
}

function mapGoogleType(types: string[]): VenueType {
  for (const t of types) {
    if (GOOGLE_TYPE_MAP[t]) return GOOGLE_TYPE_MAP[t]!
  }
  // Fallback based on keywords
  const joined = types.join(' ')
  if (joined.includes('night_club') || joined.includes('nightclub')) return 'NIGHTCLUB'
  if (joined.includes('bar')) return 'BAR'
  if (joined.includes('pub')) return 'PUB'
  return 'BAR' // default
}

function extractVibeTags(place: GooglePlace): string[] {
  const tags: string[] = []
  const types = place.types ?? []
  if (types.includes('night_club')) tags.push('club night')
  if (types.includes('bar')) tags.push('cocktails')
  if (types.includes('pub')) tags.push('chill')
  if (types.includes('restaurant')) tags.push('food')
  if (types.includes('cafe')) tags.push('chill')
  if (place.rating && place.rating >= 4.5) tags.push('popular')
  if ((place.user_ratings_total ?? 0) > 500) tags.push('busy')
  if (types.includes('concert_hall') || types.includes('performing_arts_theater')) tags.push('live music')
  return tags.slice(0, 6)
}

function getPhotoUrl(place: GooglePlace): string | undefined {
  if (!place.photos?.[0]?.photo_reference || !GOOGLE_API_KEY) return undefined
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${place.photos[0].photo_reference}&key=${GOOGLE_API_KEY}`
}

async function fetchNearby(lat: number, lng: number, radius: number, type: string): Promise<GooglePlace[]> {
  if (!GOOGLE_API_KEY) return []
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${Math.min(radius, 50000)}&type=${type}&key=${GOOGLE_API_KEY}`
  try {
    const r = await fetch(url)
    const data = await r.json() as GoogleNearbyResponse
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error(`[venue-discover] Google API error (nearby ${type}):`, data.status)
    }
    return data.results ?? []
  } catch (err) {
    console.error(`[venue-discover] fetch error:`, err)
    return []
  }
}

async function fetchTextSearch(query: string, lat: number, lng: number, radius: number): Promise<GooglePlace[]> {
  if (!GOOGLE_API_KEY) return []
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${Math.min(radius, 50000)}&key=${GOOGLE_API_KEY}`
  try {
    const r = await fetch(url)
    const data = await r.json() as GoogleNearbyResponse
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error(`[venue-discover] Google API error (text "${query}"):`, data.status)
    }
    return data.results ?? []
  } catch (err) {
    console.error(`[venue-discover] text search error:`, err)
    return []
  }
}

async function fetchPlaceDetails(placeId: string): Promise<GooglePlaceDetails['result'] | null> {
  if (!GOOGLE_API_KEY) return null
  const fields = 'place_id,name,formatted_address,formatted_phone_number,website,geometry,types,rating,opening_hours,photos,address_components'
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_API_KEY}`
  try {
    const r = await fetch(url)
    const data = await r.json() as GooglePlaceDetails
    if (data.status !== 'OK') return null
    return data.result
  } catch { return null }
}

/**
 * POST /api/venues/discover
 * Body: { lat, lng, radius? }
 * Searches Google Places for nightlife venues near the given coords,
 * upserts them into the DB, and returns the results.
 */
router.post('/', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { lat, lng, radius = 5000 } = req.body as { lat: number; lng: number; radius?: number }

    if (!lat || !lng) throw new AppError('lat and lng required', 400)
    if (!GOOGLE_API_KEY) {
      // If no API key, just return existing venues from DB in that area
      const latDelta = (radius / 1000) / 111
      const lngDelta = (radius / 1000) / (111 * Math.cos((lat * Math.PI) / 180))
      const existing = await prisma.venue.findMany({
        where: {
          lat: { gte: lat - latDelta, lte: lat + latDelta },
          lng: { gte: lng - lngDelta, lte: lng + lngDelta },
        },
        take: 100,
      })
      const sortedExisting = existing.slice().sort((a, b) =>
        Math.hypot(a.lat - lat, a.lng - lng) - Math.hypot(b.lat - lat, b.lng - lng)
      )
      return res.json({ data: { venues: sortedExisting, source: 'database', discovered: 0 } })
    }

    // Fetch from multiple Google Places searches in parallel
    const searchRadius = Math.min(Math.round(radius), 50000)
    const [nearbyResults, textResults] = await Promise.all([
      Promise.all(SEARCH_TYPES.map((type) => fetchNearby(lat, lng, searchRadius, type))),
      Promise.all(TEXT_QUERIES.map((q) => fetchTextSearch(q, lat, lng, searchRadius))),
    ])

    // Dedupe by place_id, filtering to nightlife venues only
    const placeMap = new Map<string, GooglePlace>()
    for (const results of [...nearbyResults, ...textResults]) {
      for (const place of results) {
        if (place.business_status === 'CLOSED_PERMANENTLY') continue
        // Skip anything that isn't a real nightlife/drinking venue
        const types = place.types ?? []
        const isNightlife = types.some((t) => NIGHTLIFE_TYPES.has(t))
        if (!isNightlife) continue
        if (isRejectedVenue(place.name)) continue
        if (!placeMap.has(place.place_id)) {
          placeMap.set(place.place_id, place)
        }
      }
    }

    const allPlaces = Array.from(placeMap.values())
    let discovered = 0

    // Upsert each venue into DB (batch for performance)
    const upsertPromises = allPlaces.map(async (place) => {
      const googlePlaceId = place.place_id
      const types = place.types ?? []
      const venueType = mapGoogleType(types)
      const city = extractCity(place)
      const vibeTags = extractVibeTags(place)
      const photoUrl = getPhotoUrl(place)

      const existing = await prisma.venue.findFirst({
        where: { googlePlaceId },
      })

      if (existing) {
        // Update rating, photo, and address when better data is available
        const updates: Record<string, unknown> = {}
        if (place.rating && place.rating !== existing.rating) updates['rating'] = place.rating
        if (photoUrl && !existing.photoUrl) updates['photoUrl'] = photoUrl
        // Refresh address if it looks vague (just a city name or missing street)
        const addressIsVague = !existing.address || existing.address.split(',').length < 2
        if (addressIsVague) {
          const details = await fetchPlaceDetails(googlePlaceId)
          if (details?.formatted_address) updates['address'] = details.formatted_address
        }
        if (Object.keys(updates).length > 0) {
          await prisma.venue.update({ where: { id: existing.id }, data: updates })
        }
        return existing
      }

      // Fetch detailed info for new venues
      const details = await fetchPlaceDetails(googlePlaceId)

      const newVenue = await prisma.venue.create({
        data: {
          googlePlaceId,
          name: details?.name ?? place.name,
          address: details?.formatted_address ?? place.formatted_address ?? place.vicinity ?? '',
          city: details?.address_components
            ? extractCity(place, details.address_components)
            : city,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          type: venueType,
          phone: details?.formatted_phone_number ?? undefined,
          website: details?.website ?? undefined,
          photoUrl,
          rating: place.rating ?? undefined,
          openingHours: details?.opening_hours?.weekday_text
            ? JSON.parse(JSON.stringify(details.opening_hours.weekday_text))
            : undefined,
          vibeTags,
        },
      })
      discovered++
      return newVenue
    })

    const venues = await Promise.all(upsertPromises)

    // Sort by distance from the requested coords (closest first)
    const sorted = venues.slice().sort((a, b) => {
      const distA = Math.hypot(a.lat - lat, a.lng - lng)
      const distB = Math.hypot(b.lat - lat, b.lng - lng)
      return distA - distB
    })

    res.json({
      data: { venues: sorted, source: 'google', discovered, total: sorted.length },
    })
  } catch (err) { next(err) }
})

/**
 * GET /api/venues/discover/status
 * Returns whether Google Places API is configured
 */
router.get('/status', (_req, res) => {
  res.json({
    data: {
      googlePlacesEnabled: !!GOOGLE_API_KEY,
      searchTypes: SEARCH_TYPES,
      textQueries: TEXT_QUERIES,
    },
  })
})

/**
 * DELETE /api/venues/discover/purge-rejected
 * One-time cleanup: removes any casino/betting venues already in the DB.
 * Idempotent — safe to call multiple times.
 */
router.delete('/purge-rejected', async (_req, res, next) => {
  try {
    const all = await prisma.venue.findMany({ select: { id: true, name: true } })
    const toDelete = all.filter((v) => isRejectedVenue(v.name)).map((v) => v.id)
    if (toDelete.length > 0) {
      await prisma.venue.deleteMany({ where: { id: { in: toDelete } } })
    }
    res.json({ data: { deleted: toDelete.length, names: all.filter((v) => isRejectedVenue(v.name)).map((v) => v.name) } })
  } catch (err) { next(err) }
})

export default router
