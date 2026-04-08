'use client'

import useSWR from 'swr'
import { fetcher, api } from '@/lib/api'
import type { Event, EventDiscoverQuery, CreateEventInput } from '@partyradar/shared'
import { DEV_MODE } from '@/lib/firebase'

// ─── Dev-mode localStorage store ─────────────────────────────────────────────
const DEV_EVENTS_KEY = 'partyradar_dev_events'

function getDevEvents(): Event[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(DEV_EVENTS_KEY) ?? '[]') } catch { return [] }
}

function saveDevEvents(events: Event[]) {
  localStorage.setItem(DEV_EVENTS_KEY, JSON.stringify(events))
}

// ─── Glasgow Venues ───────────────────────────────────────────────────────────

export interface DemoVenue {
  id: string
  name: string
  address: string
  city: string
  lat: number
  lng: number
  type: 'NIGHTCLUB' | 'BAR' | 'PUB' | 'CONCERT_HALL' | 'ROOFTOP_BAR' | 'LOUNGE'
  rating: number
  vibeTags: string[]
  phone?: string
  website?: string
  isClaimed: boolean
}

export const GLASGOW_VENUES: DemoVenue[] = [
  { id: 'venue-g1',  name: 'SWG3',               address: '100 Eastvale Pl, Glasgow G3 8QG',       city: 'Glasgow', lat: 55.8625, lng: -4.2892, type: 'NIGHTCLUB',    rating: 4.7, vibeTags: ['techno', 'warehouse', 'underground', 'DJ'],      phone: '0141 576 5018', website: 'https://swg3.tv',          isClaimed: false },
  { id: 'venue-g2',  name: 'Sub Club',            address: '22 Jamaica St, Glasgow G1 4QD',         city: 'Glasgow', lat: 55.8569, lng: -4.2553, type: 'NIGHTCLUB',    rating: 4.8, vibeTags: ['techno', 'underground', 'iconic', 'DJ'],        phone: '0141 248 4600', website: 'https://subclub.co.uk',    isClaimed: false },
  { id: 'venue-g3',  name: 'Sanctuary',           address: '18-22 Union St, Glasgow G1 3QF',        city: 'Glasgow', lat: 55.8595, lng: -4.2524, type: 'NIGHTCLUB',    rating: 4.3, vibeTags: ['house', 'club night', 'DJ'],                    isClaimed: false },
  { id: 'venue-g4',  name: 'Oran Mor',            address: 'Top of Byres Rd, Glasgow G12 8QX',      city: 'Glasgow', lat: 55.8737, lng: -4.2879, type: 'LOUNGE',       rating: 4.5, vibeTags: ['live music', 'cocktails', 'rooftop'],           isClaimed: false },
  { id: 'venue-g5',  name: 'The Hug and Pint',   address: '171 Great Western Rd, Glasgow G4 9AW',  city: 'Glasgow', lat: 55.8695, lng: -4.2726, type: 'PUB',          rating: 4.4, vibeTags: ['live music', 'indie', 'chill'],                 isClaimed: false },
  { id: 'venue-g6',  name: 'Nice N Sleazy',       address: '421 Sauchiehall St, Glasgow G2 3LG',    city: 'Glasgow', lat: 55.8651, lng: -4.2699, type: 'BAR',          rating: 4.3, vibeTags: ['indie', 'rock', 'live music', 'underground'],   isClaimed: false },
  { id: 'venue-g7',  name: 'Broadcast',           address: '427 Sauchiehall St, Glasgow G2 3LG',    city: 'Glasgow', lat: 55.8652, lng: -4.2702, type: 'BAR',          rating: 4.4, vibeTags: ['indie', 'alternative', 'live music'],           isClaimed: false },
  { id: 'venue-g8',  name: 'The Polo Lounge',     address: '84 Wilson St, Glasgow G1 1UZ',          city: 'Glasgow', lat: 55.8573, lng: -4.2438, type: 'NIGHTCLUB',    rating: 4.2, vibeTags: ['inclusive', 'club night', 'DJ'],               isClaimed: false },
  { id: 'venue-g9',  name: 'Buff Club',           address: '142 Bath Ln, Glasgow G2 4SQ',           city: 'Glasgow', lat: 55.8627, lng: -4.2652, type: 'NIGHTCLUB',    rating: 4.1, vibeTags: ['house', 'garage', 'DJ'],                       isClaimed: false },
  { id: 'venue-g10', name: 'Stereo',              address: '20-28 Renfield Ln, Glasgow G2 6PH',     city: 'Glasgow', lat: 55.8617, lng: -4.2575, type: 'BAR',          rating: 4.6, vibeTags: ['alternative', 'vegan', 'live music', 'chill'], isClaimed: false },
  { id: 'venue-g11', name: 'Brel',                address: 'Ashton Ln, Glasgow G12 8SJ',            city: 'Glasgow', lat: 55.8732, lng: -4.2849, type: 'BAR',          rating: 4.5, vibeTags: ['cocktails', 'rooftop', 'chill'],               isClaimed: false },
  { id: 'venue-g12', name: 'Chinaskis',           address: '2 North Frederick St, Glasgow G1 2BS',  city: 'Glasgow', lat: 55.8620, lng: -4.2490, type: 'BAR',          rating: 4.3, vibeTags: ['rock', 'cocktails', 'indie'],                  isClaimed: false },
  { id: 'venue-g13', name: 'The Garage',          address: '490 Sauchiehall St, Glasgow G2 3LW',    city: 'Glasgow', lat: 55.8651, lng: -4.2725, type: 'NIGHTCLUB',    rating: 3.9, vibeTags: ['mainstream', 'club night', 'student'],         isClaimed: false },
  { id: 'venue-g14', name: 'Room 2',              address: '22-26 Clyde Pl, Glasgow G5 8AQ',        city: 'Glasgow', lat: 55.8537, lng: -4.2568, type: 'NIGHTCLUB',    rating: 4.0, vibeTags: ['house', 'techno', 'rave'],                     isClaimed: false },
  { id: 'venue-g15', name: 'The Admiral Bar',     address: '72A Waterloo St, Glasgow G2 7DA',       city: 'Glasgow', lat: 55.8604, lng: -4.2620, type: 'PUB',          rating: 4.5, vibeTags: ['live music', 'indie', 'rock'],                 isClaimed: false },
  { id: 'venue-g16', name: 'Drygate Brewery',     address: '85 Drygate, Glasgow G4 0UT',            city: 'Glasgow', lat: 55.8628, lng: -4.2330, type: 'BAR',          rating: 4.5, vibeTags: ['craft beer', 'chill', 'rooftop'],             isClaimed: false },
  { id: 'venue-g17', name: 'The Flying Duck',     address: '142 Renfield St, Glasgow G2 3AU',       city: 'Glasgow', lat: 55.8613, lng: -4.2571, type: 'BAR',          rating: 4.4, vibeTags: ['alternative', 'indie', 'DJ', 'underground'],   isClaimed: false },
  { id: 'venue-g18', name: 'Cathouse Rock Club',  address: '15 Union St, Glasgow G1 3RB',           city: 'Glasgow', lat: 55.8594, lng: -4.2528, type: 'NIGHTCLUB',    rating: 4.1, vibeTags: ['rock', 'metal', 'alternative', 'live music'],  isClaimed: false },
  { id: 'venue-g19', name: 'O2 ABC Glasgow',      address: '300 Sauchiehall St, Glasgow G2 3JA',    city: 'Glasgow', lat: 55.8650, lng: -4.2676, type: 'CONCERT_HALL', rating: 4.3, vibeTags: ['live music', 'concerts', 'DJ'],               isClaimed: false },
  { id: 'venue-g20', name: "King Tut's Wah Wah Hut", address: '272 St Vincent St, Glasgow G2 5RL', city: 'Glasgow', lat: 55.8624, lng: -4.2687, type: 'CONCERT_HALL', rating: 4.7, vibeTags: ['live music', 'indie', 'iconic', 'intimate'],  isClaimed: false },
]

// Generate demo events for each Glasgow venue
function makeVenueEvent(venue: DemoVenue, offset: number): any {
  const typeMap: Record<string, string> = {
    NIGHTCLUB: 'CLUB_NIGHT', BAR: 'CLUB_NIGHT', PUB: 'CLUB_NIGHT',
    CONCERT_HALL: 'CONCERT', ROOFTOP_BAR: 'CLUB_NIGHT', LOUNGE: 'CONCERT',
  }
  const hosts = ['Alex Rivera', 'Sophia Chen', 'Marcus Webb', 'Priya Sharma', 'Jake Morrison']
  const host = hosts[offset % hosts.length]!
  const hostId = `mock_${host.replace(' ', '').toLowerCase()}@partyradar.app`
  const price = [0, 5, 8, 10, 12, 15, 18, 20][offset % 8]!
  const capacity = [80, 120, 200, 300, 400, 500][offset % 6]!
  const remaining = Math.floor(capacity * (0.1 + Math.random() * 0.6))
  return {
    id: `venue-event-${venue.id}`,
    hostId,
    host: { id: hostId, displayName: host, username: host.replace(' ', '').toLowerCase(), photoUrl: null },
    name: venue.type === 'CONCERT_HALL'
      ? `LIVE NIGHT @ ${venue.name.toUpperCase()}`
      : venue.type === 'PUB' || venue.type === 'BAR' || venue.type === 'LOUNGE'
        ? `${venue.name.toUpperCase()} — TONIGHT`
        : `${venue.name.toUpperCase()} — CLUB NIGHT`,
    type: typeMap[venue.type] ?? 'CLUB_NIGHT',
    description: `${venue.name} presents tonight's event. ${venue.vibeTags.join(' · ')}. Doors from 9pm.`,
    startsAt: new Date(Date.now() + (offset * 1.5 + 2) * 3600000).toISOString(),
    endsAt: new Date(Date.now() + (offset * 1.5 + 10) * 3600000).toISOString(),
    lat: venue.lat,
    lng: venue.lng,
    address: venue.address,
    neighbourhood: venue.address.split(',')[1]?.trim() ?? 'Glasgow',
    showNeighbourhoodOnly: false,
    capacity,
    price,
    ticketQuantity: capacity,
    ticketsRemaining: remaining,
    alcoholPolicy: 'PROVIDED',
    ageRestriction: 'AGE_18',
    dressCode: venue.type === 'NIGHTCLUB' ? 'Smart casual' : null,
    whatToBring: [],
    houseRules: null,
    vibeTags: venue.vibeTags,
    isInviteOnly: false,
    isPublished: true,
    isCancelled: false,
    isFeatured: offset < 3,
    coverImageUrl: null,
    guestCount: capacity - remaining,
    hostRating: venue.rating,
    genderRatio: null,
    lineup: venue.type === 'CONCERT_HALL' ? 'Local artists · Special guests' : null,
    partySigns: [],
    venueId: venue.id,
    venueName: venue.name,
    createdAt: new Date().toISOString(),
  }
}

export const GLASGOW_VENUE_EVENTS: any[] = GLASGOW_VENUES.map((v, i) => makeVenueEvent(v, i))

export const DEMO_EVENTS: Event[] = [
  {
    id: 'demo-1',
    hostId: 'mock_demo@partyradar.app',
    host: { id: 'mock_demo@partyradar.app', displayName: 'Alex Rivera', username: 'alexrivera', photoUrl: null },
    name: 'WAREHOUSE RAVE — LONDON',
    type: 'CLUB_NIGHT',
    description: 'Underground techno night across 3 rooms. Fabric residents + special guests. Doors 10pm till 6am.',
    startsAt: new Date(Date.now() + 6 * 3600000).toISOString(),
    endsAt: new Date(Date.now() + 18 * 3600000).toISOString(),
    lat: 51.5201,
    lng: -0.1020,
    address: '77a Charterhouse St, London EC1M 6HJ',
    neighbourhood: 'Farringdon',
    showNeighbourhoodOnly: false,
    capacity: 500,
    price: 15,
    ticketQuantity: 500,
    ticketsRemaining: 187,
    alcoholPolicy: 'PROVIDED',
    ageRestriction: 'AGE_18',
    dressCode: 'All black',
    whatToBring: [],
    houseRules: 'Respect the space. No phones on the dancefloor.',
    vibeTags: ['techno', 'underground', 'dark', 'warehouse'],
    isInviteOnly: false,
    isPublished: true,
    isCancelled: false,
    isFeatured: true,
    coverImageUrl: null,
    guestCount: 313,
    hostRating: 4.8,
    genderRatio: { male: 168, female: 124, nonBinary: 21, total: 313 },
    lineup: 'Blawan b2b Surgeon · Paula Temple · DJ Stingray',
    partySigns: [],
    createdAt: new Date().toISOString(),
  } as any,
  {
    id: 'demo-2',
    hostId: 'mock_demo2@partyradar.app',
    host: { id: 'mock_demo2@partyradar.app', displayName: 'Sophia Chen', username: 'sophiachen', photoUrl: null },
    name: 'ROOFTOP HOUSE PARTY 🏠',
    type: 'HOME_PARTY',
    description: 'Rooftop session in Shoreditch. Bring your vibe, drinks provided. Strictly invite + approved RSVPs.',
    startsAt: new Date(Date.now() + 2 * 3600000).toISOString(),
    endsAt: new Date(Date.now() + 10 * 3600000).toISOString(),
    lat: 51.5242,
    lng: -0.0772,
    address: 'Shoreditch, London',
    neighbourhood: 'Shoreditch',
    showNeighbourhoodOnly: true,
    capacity: 40,
    price: 0,
    ticketQuantity: 0,
    ticketsRemaining: 0,
    alcoholPolicy: 'PROVIDED',
    ageRestriction: 'AGE_18',
    dressCode: null,
    whatToBring: [],
    houseRules: 'Approved guests only. No gate-crashing.',
    vibeTags: ['rooftop', 'house', 'vibes', 'summer'],
    isInviteOnly: true,
    isPublished: true,
    isCancelled: false,
    isFeatured: false,
    coverImageUrl: null,
    guestCount: 28,
    hostRating: 4.9,
    genderRatio: { male: 12, female: 14, nonBinary: 2, total: 28 },
    lineup: null,
    partySigns: ['BAR', 'FLOOR', 'FIRE', 'FOOD', 'DJ'],
    createdAt: new Date().toISOString(),
  } as any,
  {
    id: 'demo-3',
    hostId: 'mock_demo3@partyradar.app',
    host: { id: 'mock_demo3@partyradar.app', displayName: 'Marcus Webb', username: 'marcuswebb', photoUrl: null },
    name: 'JAZZ & SOUL NIGHT',
    type: 'CONCERT',
    description: 'An evening of live jazz, soul and neo-soul. Full bar, candlelit venue. Limited seats.',
    startsAt: new Date(Date.now() + 4 * 3600000).toISOString(),
    endsAt: new Date(Date.now() + 10 * 3600000).toISOString(),
    lat: 51.5074,
    lng: -0.1278,
    address: 'Ronnie Scott\'s, 47 Frith St, London W1D 4HT',
    neighbourhood: 'Soho',
    showNeighbourhoodOnly: false,
    capacity: 120,
    price: 22,
    ticketQuantity: 120,
    ticketsRemaining: 34,
    alcoholPolicy: 'PROVIDED',
    ageRestriction: 'ALL_AGES',
    dressCode: 'Smart casual',
    whatToBring: [],
    houseRules: null,
    vibeTags: ['jazz', 'soul', 'live', 'intimate'],
    isInviteOnly: false,
    isPublished: true,
    isCancelled: false,
    isFeatured: false,
    coverImageUrl: null,
    guestCount: 86,
    hostRating: 4.7,
    genderRatio: { male: 44, female: 38, nonBinary: 4, total: 86 },
    lineup: 'The Marcus Webb Quartet · Maya Rose (vocals)',
    partySigns: [],
    createdAt: new Date().toISOString(),
  } as any,
]

export function useEvents(query: EventDiscoverQuery = {}) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined) params.set(k, String(v))
  })

  const { data, error, isLoading, isValidating, mutate } = useSWR<{ data: Event[]; total: number; hasMore: boolean }>(
    `/events?${params.toString()}`,
    fetcher,
    {
      shouldRetryOnError: true,
      errorRetryCount: 5,
      errorRetryInterval: 3000,
      refreshInterval: 60000,
      revalidateOnFocus: true,
      revalidateOnMount: true,
      dedupingInterval: 0,        // always fetch fresh on mount
      keepPreviousData: true,     // never flash empty while revalidating
    }
  )

  // In dev mode merge demo events + Glasgow venue events + any user-created events from localStorage
  const devEvents = [...DEMO_EVENTS, ...GLASGOW_VENUE_EVENTS, ...getDevEvents()]
  const events = (DEV_MODE && (!data || error)) ? devEvents : (data?.data ?? [])

  return {
    events,
    total: DEV_MODE && (!data || error) ? devEvents.length : (data?.total ?? 0),
    hasMore: false,
    // Keep showing spinner until data arrives — don't flash empty on initial load or retries
    isLoading: !DEV_MODE && !data && (isLoading || isValidating || !error),
    error: data ? null : error,
    mutate,
  }
}

export function useEvent(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ data: Event }>(
    id ? `/events/${id}` : null,
    fetcher,
    { shouldRetryOnError: false }
  )

  // In dev mode fall back to demo events + Glasgow venue events + localStorage events
  const devEvent = DEV_MODE && id
    ? [...DEMO_EVENTS, ...GLASGOW_VENUE_EVENTS, ...getDevEvents()].find((e) => e.id === id)
    : undefined

  const event = data?.data ?? devEvent

  return { event, isLoading: !DEV_MODE && isLoading, error: event ? null : error, mutate }
}

export async function createEvent(input: CreateEventInput & { hostId?: string }): Promise<Event> {
  if (DEV_MODE) {
    const now = new Date().toISOString()
    const newEvent: Event = {
      id: `dev-${Date.now()}`,
      hostId: input.hostId ?? 'mock_demo@partyradar.app',
      host: { id: input.hostId ?? 'mock_demo@partyradar.app', displayName: 'You', username: 'demo', photoUrl: null },
      name: input.name,
      type: input.type,
      description: input.description,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      lat: input.lat,
      lng: input.lng,
      address: input.address,
      neighbourhood: input.neighbourhood,
      showNeighbourhoodOnly: input.showNeighbourhoodOnly ?? false,
      capacity: input.capacity ?? 50,
      price: input.price ?? 0,
      ticketQuantity: input.ticketQuantity ?? 0,
      ticketsRemaining: input.ticketQuantity ?? 0,
      alcoholPolicy: input.alcoholPolicy ?? 'NONE',
      ageRestriction: input.ageRestriction ?? 'ALL_AGES',
      dressCode: input.dressCode ?? null,
      whatToBring: input.whatToBring ?? [],
      houseRules: (input as any).houseRules ?? null,
      vibeTags: input.vibeTags ?? [],
      isInviteOnly: input.isInviteOnly ?? false,
      isPublished: true,
      isCancelled: false,
      isFeatured: false,
      coverImageUrl: input.coverImageUrl ?? null,
      guestCount: 0,
      hostRating: null,
      genderRatio: null,
      lineup: (input as any).lineup ?? null,
      partySigns: (input as any).partySigns ?? [],
      createdAt: now,
    } as any
    const existing = getDevEvents()
    saveDevEvents([...existing, newEvent])
    return newEvent
  }
  const res = await api.post<{ data: Event }>('/events', input)
  return res.data
}

export async function updateEvent(id: string, input: Partial<CreateEventInput>): Promise<Event> {
  if (DEV_MODE) {
    const events = getDevEvents()
    const idx = events.findIndex((e) => e.id === id)
    if (idx >= 0) {
      events[idx] = { ...events[idx]!, ...input } as Event
      saveDevEvents(events)
      return events[idx]!
    }
    // DEMO_EVENTS are static — return as-is
    const demo = DEMO_EVENTS.find((e) => e.id === id)
    return { ...(demo as Event), ...input }
  }
  const res = await api.put<{ data: Event }>(`/events/${id}`, input)
  return res.data
}

export async function cancelEvent(id: string): Promise<void> {
  if (DEV_MODE) {
    const events = getDevEvents()
    const idx = events.findIndex((e) => e.id === id)
    if (idx >= 0) {
      events[idx] = { ...events[idx]!, isCancelled: true } as Event
      saveDevEvents(events)
    }
    return
  }
  await api.delete(`/events/${id}`)
}
