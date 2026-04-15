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

interface VenueDiscoverResult {
  data: LiveVenue[]
  source: 'google' | 'database' | 'google_places'
  discovered: number
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

function loadCache(): VenueCache | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as VenueCache
    if (Date.now() - c.ts > CACHE_TTL_MS) { sessionStorage.removeItem(CACHE_KEY); return null }
    return c
  } catch { return null }
}

function saveCache(c: VenueCache) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch {}
}

export function useVenueDiscover() {
  const [venues, setVenues] = useState<LiveVenue[]>(() => loadCache()?.venues ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<'google' | 'database' | 'google_places' | null>(
    () => loadCache()?.source ?? null,
  )

  // On first render, hydrate from cache if fresh
  useEffect(() => {
    const c = loadCache()
    if (c) {
      setVenues(c.venues)
      setSource(c.source)
    }
  }, [])

  const discover = useCallback(async (lat: number, lng: number, radius = 5000) => {
    // If we have a fresh cache for the same area (within ~1 km), skip the network call
    const existing = loadCache()
    if (existing) {
      const dLat = Math.abs(existing.lat - lat)
      const dLng = Math.abs(existing.lng - lng)
      if (dLat < 0.01 && dLng < 0.01 && existing.radius >= radius) {
        setVenues(existing.venues)
        setSource(existing.source)
        return
      }
    }

    setLoading(true)
    setError(null)
    try {
      const result = await api.post<VenueDiscoverResult>('/venues/discover', { lat, lng, radius })
      const resultVenues = result.data ?? []
      const resultSource = result.source ?? 'database'
      setVenues(resultVenues)
      setSource(resultSource)
      // Cache successful results
      if (resultVenues.length > 0) {
        saveCache({ venues: resultVenues, source: resultSource, lat, lng, radius, ts: Date.now() })
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to discover venues')
    } finally {
      setLoading(false)
    }
  }, [])

  return { venues, loading, error, source, discover }
}
