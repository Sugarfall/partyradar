'use client'

/**
 * UserLocationContext — single, app-wide GPS detection.
 *
 * Detection pipeline (fastest first):
 *   1. localStorage('pr_loc') — written by the discover page's watchPosition.
 *      If the stored value is < 5 minutes old we use it immediately.
 *   2. navigator.geolocation.getCurrentPosition (network-accuracy, ~1 s)
 *      — updates the context and localStorage on success.
 *   3. If geolocation is denied/unavailable and no stored location exists,
 *      we fall back to a null-island ( 0, 0 ) with ready=false so consumers
 *      can show a loading state until they get a real value.
 *
 * The discover page continues to run watchPosition for live tracking;
 * that keeps pr_loc fresh. Every other page just consumes this context.
 */

import { createContext, useContext, useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

const STORAGE_KEY = 'pr_loc'
const MAX_AGE_MS = 5 * 60 * 1000   // 5 minutes — use cached location if fresh enough
const MAPBOX_TOKEN = typeof process !== 'undefined'
  ? (process.env['NEXT_PUBLIC_MAPBOX_TOKEN'] ?? '')
  : ''

export interface UserLocation {
  lat: number
  lng: number
  city: string | null
  /** true once we have a non-default, real location */
  ready: boolean
}

interface UserLocationContextValue extends UserLocation {
  /** Override — used by discover page to push its watchPosition result */
  setLocation: (loc: { lat: number; lng: number; city?: string | null }) => void
}

const defaultValue: UserLocationContextValue = {
  lat: 0, lng: 0, city: null, ready: false,
  setLocation: () => {},
}

const UserLocationContext = createContext<UserLocationContextValue>(defaultValue)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readStored(): { lat: number; lng: number; city: string | null } | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { lat?: number; lng?: number; city?: string; ts?: number }
    if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') return null
    // Accept if fresh enough
    if (parsed.ts && Date.now() - parsed.ts < MAX_AGE_MS) {
      return { lat: parsed.lat, lng: parsed.lng, city: parsed.city ?? null }
    }
    return null
  } catch { return null }
}

function writeStored(lat: number, lng: number, city: string | null) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lat, lng, city, ts: Date.now() }))
  } catch {}
}

async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  if (!MAPBOX_TOKEN) return null
  try {
    const r = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
      `?types=place&limit=1&access_token=${MAPBOX_TOKEN}`
    )
    if (!r.ok) return null
    const j = await r.json()
    return j.features?.[0]?.text ?? null
  } catch { return null }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function UserLocationProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState<UserLocation>({ lat: 0, lng: 0, city: null, ready: false })
  const didInit = useRef(false)

  function setLocation({ lat, lng, city = null }: { lat: number; lng: number; city?: string | null }) {
    setLoc({ lat, lng, city: city ?? null, ready: true })
    writeStored(lat, lng, city ?? null)
  }

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true

    // Step 1 — check fresh localStorage immediately (no async needed)
    const cached = readStored()
    if (cached) {
      setLoc({ ...cached, ready: true })
      // Still fire geolocation below to keep the cache fresh
    }

    // Step 2 — real geolocation
    if (typeof window === 'undefined' || !navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords

        // Get city name async — don't block ready state on it
        const cachedCity = readStored()?.city ?? null
        setLoc({ lat, lng, city: cachedCity, ready: true })

        const city = await reverseGeocodeCity(lat, lng)
        setLoc({ lat, lng, city, ready: true })
        writeStored(lat, lng, city)
      },
      () => {
        // Permission denied or timeout — if we already had cached data we're fine,
        // otherwise stay with ready:false so pages can show appropriate UI
        if (cached) {
          setLoc({ ...cached, ready: true })
        }
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 },
    )
  }, [])

  return (
    <UserLocationContext.Provider value={{ ...loc, setLocation }}>
      {children}
    </UserLocationContext.Provider>
  )
}

export function useUserLocation(): UserLocationContextValue {
  return useContext(UserLocationContext)
}
