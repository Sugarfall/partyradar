'use client'

/**
 * VenueAutoDiscover — silently calls POST /api/venues/discover once per session
 * using the user's current geolocation, so the venues DB is populated even when
 * the user never visits the /venues map page.
 *
 * Uses sessionStorage to gate the call to once per browser session.
 */

import { useEffect } from 'react'
import { api } from '@/lib/api'

const SESSION_KEY = 'partyradar_venue_discover_done'

export default function VenueAutoDiscover() {
  useEffect(() => {
    // Only run once per session
    if (sessionStorage.getItem(SESSION_KEY)) return
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          await api.post('/venues/discover', {
            lat: coords.latitude,
            lng: coords.longitude,
            radius: 5000,
          })
          sessionStorage.setItem(SESSION_KEY, '1')
        } catch {
          // Silently ignore — don't block the user experience
        }
      },
      () => {
        // Permission denied or timeout — mark done so we don't keep re-trying
        sessionStorage.setItem(SESSION_KEY, '1')
      },
      { timeout: 8000, maximumAge: 300000 }
    )
  }, [])

  return null
}
