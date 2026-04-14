'use client'

import { useEffect, useRef, useCallback } from 'react'
import useSWR from 'swr'
import { fetcher, api, API_URL } from '@/lib/api'
import type { Event, EventDiscoverQuery, CreateEventInput } from '@partyradar/shared'

// ─── Glasgow Venues (reference data for the Venues tab) ──────────────────────

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

export function useEvents(query: EventDiscoverQuery = {}) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined) params.set(k, String(v))
  })

  const swrKey = `/events?${params.toString()}`

  const { data, error, isLoading, isValidating, mutate } = useSWR<{ data: Event[]; total: number; hasMore: boolean }>(
    swrKey,
    fetcher,
    {
      shouldRetryOnError: true,
      errorRetryCount: 5,
      errorRetryInterval: 3000,
      refreshInterval: 120000,       // refresh every 2 min
      revalidateOnFocus: false,      // don't wipe events on tab switch
      revalidateOnMount: true,
      dedupingInterval: 5000,
      keepPreviousData: true,        // keep old events visible while new query loads
    }
  )

  // Safety net: if SWR stalls for 3s force a raw fetch
  const retried = useRef(false)
  useEffect(() => {
    if (data || retried.current) return
    const timer = setTimeout(() => {
      if (retried.current) return
      retried.current = true
      fetch(`${API_URL}${swrKey}`, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((j) => { if (j?.data) mutate(j, false) })
        .catch((err) => console.error('[useEvents] Raw fetch failed:', err))
    }, 3000)
    return () => clearTimeout(timer)
  }, [data, swrKey, mutate])

  // Manual retry — bypasses SWR cache entirely
  const forceRetry = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}${swrKey}`, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json?.data) mutate(json, false)
    } catch (err) {
      console.error('[useEvents] Force retry failed:', err)
      mutate()
    }
  }, [swrKey, mutate])

  return {
    events: data?.data ?? [],
    total: data?.total ?? 0,
    hasMore: data?.hasMore ?? false,
    isLoading: !data && (isLoading || isValidating) && !error,
    error: data ? null : error,
    mutate,
    forceRetry,
  }
}

export function useEvent(id: string | null) {
  const swrKey = id ? `/events/${id}` : null

  const { data, error, isLoading, mutate } = useSWR<{ data: Event }>(
    swrKey,
    fetcher,
    {
      shouldRetryOnError: true,
      errorRetryCount: 3,
      errorRetryInterval: 2000,
      revalidateOnMount: true,
      dedupingInterval: 0,
    }
  )

  // Safety net: force raw fetch if SWR stalls
  const retried = useRef(false)
  useEffect(() => {
    if (data || !swrKey || retried.current) return
    const timer = setTimeout(() => {
      if (retried.current) return
      retried.current = true
      fetch(`${API_URL}${swrKey}`, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((j) => { if (j?.data) mutate(j, false) })
        .catch((err) => console.error('[useEvent] Raw fetch failed:', err))
    }, 3000)
    return () => clearTimeout(timer)
  }, [data, swrKey, mutate])

  useEffect(() => { retried.current = false }, [id])

  return {
    event: data?.data ?? undefined,
    isLoading: isLoading && !data,
    error: data ? null : error,
    mutate,
  }
}

export async function createEvent(input: CreateEventInput & { hostId?: string }): Promise<Event> {
  const res = await api.post<{ data: Event }>('/events', input)
  return res.data
}

export async function updateEvent(id: string, input: Partial<CreateEventInput>): Promise<Event> {
  const res = await api.put<{ data: Event }>(`/events/${id}`, input)
  return res.data
}

export async function cancelEvent(id: string): Promise<void> {
  await api.delete(`/events/${id}`)
}
