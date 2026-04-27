'use client'

/**
 * CurrencyContext — detects and distributes the user's local currency app-wide.
 *
 * Detection pipeline (each step is a fallback for the one before):
 *   1. localStorage('pr_currency')     — instant, from a previous session
 *   2. Intl.Locale(navigator.language) — sync, correct for most devices
 *   3. UserLocationContext lat/lng → Mapbox country reverse-geocode → COUNTRY_CURRENCY map
 *      → stored in localStorage for next session
 *
 * Step 3 is the authoritative source and requires no per-country hardcoding:
 * Mapbox returns a country code ("LT", "FR", "JP" …) which we look up in
 * a comprehensive ISO 3166 → ISO 4217 table. Any country in the world just works.
 * Uses the shared UserLocationContext so there's only one GPS call for the whole app.
 */

import { createContext, useContext, useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { detectCurrency, getCurrencyFromCountryCode, getCurrencySymbol } from '@/lib/currency'
import { useUserLocation } from '@/contexts/UserLocationContext'

const STORAGE_KEY = 'pr_currency'
const MAPBOX_TOKEN = typeof process !== 'undefined'
  ? (process.env['NEXT_PUBLIC_MAPBOX_TOKEN'] ?? '')
  : ''

interface CurrencyContextValue {
  currency: string   // ISO 4217 code, e.g. 'EUR', 'USD', 'GBP'
  symbol: string     // display symbol, e.g. '€', '$', '£'
  setCurrency: (code: string) => void
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: 'GBP',
  symbol: '£',
  setCurrency: () => {},
})

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const userLoc = useUserLocation()
  const didLookup = useRef(false)

  const [currency, setCurrencyState] = useState<string>(() => {
    // Step 1 & 2 — sync init so there's no flash on first render
    if (typeof window === 'undefined') return detectCurrency()
    return localStorage.getItem(STORAGE_KEY) ?? detectCurrency()
  })

  function setCurrency(code: string) {
    setCurrencyState(code)
    try { localStorage.setItem(STORAGE_KEY, code) } catch {}
  }

  // Step 3 — once the shared UserLocationContext has GPS coords, do a single
  // Mapbox country lookup and update currency. Only runs once per session.
  useEffect(() => {
    if (!userLoc.ready || didLookup.current || !MAPBOX_TOKEN) return
    didLookup.current = true

    const { lat, lng } = userLoc
    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
      `?types=country&limit=1&access_token=${MAPBOX_TOKEN}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        // Mapbox returns short_code like "lt", "gb", "us"
        const countryCode: string | undefined =
          json?.features?.[0]?.properties?.short_code
        if (countryCode) setCurrency(getCurrencyFromCountryCode(countryCode))
      })
      .catch(() => { /* Silent — keep whatever we already resolved */ })
  }, [userLoc.ready]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <CurrencyContext.Provider value={{ currency, symbol: getCurrencySymbol(currency), setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext)
}
