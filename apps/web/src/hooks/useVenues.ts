'use client'

import { useState, useCallback, useEffect } from 'react'
import { api } from '@/lib/api'

export interface LiveVenue {
  id: string
  name: string
  address: string
  city: string
  lat: number
  lng: number
  type: string
  photoUrl?: string | null
  phone?: string | null
  website?: string | null
  rating?: number | null
  vibeTags: string[]
  isClaimed: boolean
  checkInCount?: number
}

interface VenueCache {
  venues: LiveVenue[]
  source: 'google' | 'database' | 'google_places'
  lat: number
  lng: number
  radius: number
  ts: number
}

const CACHE_KEY = 'partyradar_venues_cache'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
// Distance threshold (degrees) beyond which we consider it a different city (~50 km)
const CITY_CHANGE_THRESHOLD = 0.45

function loadCache(): VenueCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as VenueCache
    if (Date.now() - c.ts > CACHE_TTL_MS) { sessionStorage.removeItem(CACHE_KEY); return null }
    return c
  } catch { return null }
}

function saveCache(c: VenueCache) {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch {}
}

function clearCache() {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(CACHE_KEY) } catch {}
}

export function useVenueDiscover() {
  const [venues, setVenues] = useState<LiveVenue[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // null = never fetched; 'google'/'database' = fetched (even if result was empty)
  const [source, setSource] = useState<'google' | 'database' | 'google_places' | null>(null)
  // true once discover() has completed at least once (success or error).
  // Used by VenuesList to distinguish "not yet fetched" from "fetched but empty".
  const [hasFetched, setHasFetched] = useState(false)

  // Hydrate from cache on first render
  useEffect(() => {
    const c = loadCache()
    if (c) {
      setVenues(c.venues)
      setSource(c.source)
      setHasFetched(true)
    }
  }, [])

  const discover = useCallback(async (lat: number, lng: number, radius = 5000) => {
    const existing = loadCache()

    if (existing) {
      const dLat = Math.abs(existing.lat - lat)
      const dLng = Math.abs(existing.lng - lng)

      // Same area — serve from cache
      if (dLat < 0.01 && dLng < 0.01 && existing.radius >= radius) {
        const sorted = existing.venues.slice().sort((a, b) =>
          Math.hypot(a.lat - lat, a.lng - lng) - Math.hypot(b.lat - lat, b.lng - lng)
        )
        setVenues(sorted)
        setSource(existing.source)
        return
      }

      // Different city — clear stale venues immediately so old city data doesn't linger
      if (dLat > CITY_CHANGE_THRESHOLD || dLng > CITY_CHANGE_THRESHOLD) {
        clearCache()
        setVenues([])
        setSource(null)
      }
    }

    setLoading(true)
    setError(null)
    try {
      // Server returns { data: { venues: [...], source: '...', discovered: n } }
      const result = await api.post<{
        data: { venues: LiveVenue[]; source: 'google' | 'database' | 'google_places'; discovered: number }
      }>('/venues/discover', { lat, lng, radius })

      const inner = result.data
      const resultVenues = inner?.venues ?? []
      const resultSource = inner?.source ?? 'database'

      setVenues(resultVenues)

      // Only mark source as non-null (which suppresses the static Glasgow fallback)
      // when we actually got results OR when Google confirmed there's genuinely nothing here.
      // If source is 'database' and we got 0 results, it means no Google key is configured
      // and the DB has no venues for this area — keep source null so the static fallback shows.
      if (resultVenues.length > 0 || resultSource === 'google' || resultSource === 'google_places') {
        setSource(resultSource)
      }

      if (resultVenues.length > 0) {
        saveCache({ venues: resultVenues, source: resultSource, lat, lng, radius, ts: Date.now() })
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to discover venues')
      // Keep source as null on error so caller knows it failed
    } finally {
      setLoading(false)
      setHasFetched(true)
    }
  }, [])

  return { venues, loading, error, source, hasFetched, discover }
}
