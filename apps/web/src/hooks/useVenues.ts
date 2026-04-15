'use client'

import { useState, useCallback } from 'react'
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

export function useVenueDiscover() {
  const [venues, setVenues] = useState<LiveVenue[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<'google' | 'database' | 'google_places' | null>(null)

  const discover = useCallback(async (lat: number, lng: number, radius = 5000) => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.post<VenueDiscoverResult>('/venues/discover', { lat, lng, radius })
      setVenues(result.data ?? [])
      setSource(result.source ?? 'database')
    } catch (err: any) {
      setError(err.message ?? 'Failed to discover venues')
    } finally {
      setLoading(false)
    }
  }, [])

  return { venues, loading, error, source, discover }
}
