'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Search, MapPin, Phone, Globe, Zap, CheckCircle, X, Loader2, Compass } from 'lucide-react'

import { api } from '@/lib/api'
const MAPBOX_TOKEN = process.env['NEXT_PUBLIC_MAPBOX_TOKEN'] ?? ''

// ─── Types ────────────────────────────────────────────────────────────────────

type VenueType = 'BAR' | 'NIGHTCLUB' | 'CONCERT_HALL' | 'ROOFTOP_BAR' | 'PUB' | 'LOUNGE'

interface Venue {
  id: string
  name: string
  address: string
  city: string
  lat: number
  lng: number
  type: VenueType
  phone?: string
  website?: string
  photoUrl?: string
  vibeTags: string[]
  isClaimed: boolean
  claimedById?: string
  rating?: number
  upcomingEventsCount?: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<VenueType, string> = {
  BAR:          '#f59e0b',
  NIGHTCLUB:    '#a855f7',
  CONCERT_HALL: '#3b82f6',
  ROOFTOP_BAR:  '#06b6d4',
  PUB:          '#22c55e',
  LOUNGE:       '#ec4899',
}

const TYPE_LABELS: Record<VenueType, string> = {
  BAR:          'Bar',
  NIGHTCLUB:    'Nightclub',
  CONCERT_HALL: 'Concert Hall',
  ROOFTOP_BAR:  'Rooftop Bar',
  PUB:          'Pub',
  LOUNGE:       'Lounge',
}

const FILTER_TABS: { label: string; value: VenueType | 'ALL' }[] = [
  { label: 'All',          value: 'ALL' },
  { label: 'Bar',          value: 'BAR' },
  { label: 'Nightclub',    value: 'NIGHTCLUB' },
  { label: 'Concert Hall', value: 'CONCERT_HALL' },
  { label: 'Rooftop',      value: 'ROOFTOP_BAR' },
  { label: 'Pub',          value: 'PUB' },
  { label: 'Lounge',       value: 'LOUNGE' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function zoomToRadius(zoom: number): number {
  // Approximate radius in meters from zoom level
  // zoom 12 ≈ 5km, zoom 14 ≈ 1.5km, zoom 10 ≈ 20km
  return Math.round(40075000 / Math.pow(2, zoom + 1))
}

/** Haversine distance in km between two lat/lng points */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── VenueCard ────────────────────────────────────────────────────────────────

function VenueCard({ venue, onClick, distanceKm }: { venue: Venue; onClick: () => void; distanceKm?: number }) {
  const color = TYPE_COLORS[venue.type]
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-4 transition-all duration-200 border-b"
      style={{ borderColor: 'rgba(var(--accent-rgb),0.06)', background: 'transparent' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(var(--accent-rgb),0.04)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center"
          style={{
            background: venue.photoUrl ? undefined : `${color}18`,
            border: `1px solid ${color}40`,
            overflow: 'hidden',
          }}
        >
          {venue.photoUrl
            ? <img src={venue.photoUrl} alt={venue.name} className="w-full h-full object-cover" />
            : <MapPin size={16} style={{ color }} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{venue.name}</span>
            {venue.rating && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ color: '#ffd600', background: 'rgba(255,214,0,0.1)', border: '1px solid rgba(255,214,0,0.2)' }}>
                ★ {venue.rating.toFixed(1)}
              </span>
            )}
            {venue.isClaimed && (
              <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ color: 'var(--accent)', background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
                <CheckCircle size={8} /> CLAIMED
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}>
              {TYPE_LABELS[venue.type]}
            </span>
            {venue.city && (
              <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.35)' }}>
                {venue.city}
              </span>
            )}
            {distanceKm != null && (
              <span className="text-[10px] font-bold" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
                {distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm.toFixed(1)}km`}
              </span>
            )}
            {(venue.upcomingEventsCount ?? 0) > 0 && (
              <span className="text-[10px] font-bold" style={{ color: '#00ff88' }}>
                {venue.upcomingEventsCount} upcoming
              </span>
            )}
          </div>

          <p className="text-[11px] mt-1 truncate" style={{ color: 'rgba(224,242,254,0.4)' }}>
            {venue.address}
          </p>

          {venue.vibeTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {venue.vibeTags.slice(0, 4).map((tag) => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded"
                  style={{ color: 'rgba(var(--accent-rgb),0.5)', background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function VenueSkeleton() {
  return (
    <div className="flex flex-col gap-0">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="px-4 py-4 border-b animate-pulse" style={{ borderColor: 'rgba(var(--accent-rgb),0.06)' }}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg" style={{ background: 'rgba(var(--accent-rgb),0.06)' }} />
            <div className="flex-1">
              <div className="h-3.5 rounded mb-2 w-2/3" style={{ background: 'rgba(var(--accent-rgb),0.08)' }} />
              <div className="h-2.5 rounded w-1/3" style={{ background: 'rgba(var(--accent-rgb),0.05)' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VenuesPage() {
  const router = useRouter()

  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<VenueType | 'ALL'>('ALL')
  const [popupVenue, setPopupVenue] = useState<Venue | null>(null)
  const [discoveredCount, setDiscoveredCount] = useState(0)
  const [cityLabel, setCityLabel] = useState('NEARBY')
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [viewState, setViewState] = useState({
    latitude: 55.8642,
    longitude: -4.2518,
    zoom: 12,
  })

  // Track last discovered center to avoid re-fetching same area
  const lastDiscoverRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null)
  const discoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Request user's geolocation on mount
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        // Also center the map on user's location
        setViewState((v) => ({ ...v, latitude: pos.coords.latitude, longitude: pos.coords.longitude }))
      },
      () => { /* permission denied or unavailable — keep default Glasgow center */ },
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }, [])

  // Fetch venues from DB based on current viewport
  const fetchVenues = useCallback(async (lat: number, lng: number, radius: number) => {
    try {
      const params = new URLSearchParams({
        lat: lat.toString(),
        lng: lng.toString(),
        radius: (radius / 1000).toString(), // API expects km
        limit: '100',
      })
      if (search) params.set('q', search)
      if (typeFilter !== 'ALL') params.set('type', typeFilter)

      const json = await api.get<{ data: Venue[] }>(`/venues?${params}`)
      setVenues(json?.data ?? [])
    } catch (err) {
      console.error('[VenuesPage] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter])

  // Discover new venues via Google Places API
  const discoverVenues = useCallback(async (lat: number, lng: number, radius: number) => {
    setDiscovering(true)
    try {
      const json = await api.post<{ data: { discovered: number } }>('/venues/discover', { lat, lng, radius: Math.round(radius) })
      if ((json?.data?.discovered ?? 0) > 0) {
        setDiscoveredCount((c) => c + (json?.data?.discovered ?? 0))
        // Refetch from DB to get the enriched data
        await fetchVenues(lat, lng, radius)
      }
    } catch (err) {
      console.error('[VenuesPage] discover error:', err)
    } finally {
      setDiscovering(false)
    }
  }, [fetchVenues])

  // On map move — debounce discover + fetch
  const handleMapMove = useCallback((lat: number, lng: number, zoom: number) => {
    const radius = zoomToRadius(zoom)

    // Always fetch from DB on move
    fetchVenues(lat, lng, radius)

    // Only trigger Google discover if moved significantly (>30% of viewport)
    const last = lastDiscoverRef.current
    if (last) {
      const dist = Math.sqrt(Math.pow(lat - last.lat, 2) + Math.pow(lng - last.lng, 2))
      const threshold = 0.02 * Math.pow(2, 15 - zoom) // scale threshold with zoom
      if (dist < threshold && Math.abs(zoom - last.zoom) < 2) return
    }

    // Debounce the discover call
    if (discoverTimeoutRef.current) clearTimeout(discoverTimeoutRef.current)
    discoverTimeoutRef.current = setTimeout(() => {
      lastDiscoverRef.current = { lat, lng, zoom }
      discoverVenues(lat, lng, radius)
    }, 1500) // 1.5s debounce
  }, [fetchVenues, discoverVenues])

  // Initial load
  useEffect(() => {
    const radius = zoomToRadius(viewState.zoom)
    fetchVenues(viewState.latitude, viewState.longitude, radius)
    // Also trigger discover on initial load
    discoverVenues(viewState.latitude, viewState.longitude, radius)
    lastDiscoverRef.current = { lat: viewState.latitude, lng: viewState.longitude, zoom: viewState.zoom }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch from DB when search/filter changes
  useEffect(() => {
    const t = setTimeout(() => {
      const radius = zoomToRadius(viewState.zoom)
      setLoading(true)
      fetchVenues(viewState.latitude, viewState.longitude, radius)
    }, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search, typeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reverse geocode to get city label
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${viewState.longitude},${viewState.latitude}.json?types=place&limit=1&access_token=${MAPBOX_TOKEN}`
        )
        const j = await r.json()
        const city = j.features?.[0]?.text
        if (city) setCityLabel(city.toUpperCase())
      } catch {}
    }, 800)
    return () => clearTimeout(t)
  }, [viewState.latitude, viewState.longitude])

  // Filtered venues for display, sorted by proximity when user location is available
  const filteredVenues = typeFilter === 'ALL'
    ? venues
    : venues.filter((v) => v.type === typeFilter)

  const displayVenues = userLocation
    ? [...filteredVenues].sort(
        (a, b) =>
          haversineKm(userLocation.lat, userLocation.lng, a.lat, a.lng) -
          haversineKm(userLocation.lat, userLocation.lng, b.lat, b.lng),
      )
    : filteredVenues

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0d0d0f', paddingTop: 56 }}>

      {/* ─── Header ─── */}
      <div className="px-4 pt-6 pb-4" style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.08)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MapPin size={16} style={{ color: 'var(--accent)' }} />
              <h1 className="text-base font-black tracking-[0.2em]" style={{ color: 'var(--accent)' }}>VENUES</h1>
              <span className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.35)' }}>
                — {cityLabel}
              </span>
            </div>
            {discovering && (
              <div className="flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
                <span className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.35)' }}>
                  DISCOVERING...
                </span>
              </div>
            )}
            {!discovering && discoveredCount > 0 && (
              <span className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(0,255,136,0.4)' }}>
                +{discoveredCount} NEW
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search venues anywhere..."
              className="w-full pl-8 pr-4 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'rgba(var(--accent-rgb),0.04)',
                border: '1px solid rgba(var(--accent-rgb),0.15)',
                color: '#e0f2fe',
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X size={12} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
              </button>
            )}
          </div>

          {/* Type filter tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {FILTER_TABS.map(({ label, value }) => {
              const active = typeFilter === value
              const color = value === 'ALL' ? 'var(--accent)' : TYPE_COLORS[value as VenueType]
              return (
                <button
                  key={value}
                  onClick={() => setTypeFilter(value)}
                  className="shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-full transition-all"
                  style={{
                    color: active ? (value === 'ALL' ? 'var(--accent)' : color) : 'rgba(74,96,128,0.7)',
                    background: active ? `${color}18` : 'transparent',
                    border: active ? `1px solid ${color}40` : '1px solid rgba(74,96,128,0.2)',
                    letterSpacing: '0.08em',
                  }}
                >
                  {label.toUpperCase()}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ─── Two-column layout ─── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden" style={{ minHeight: 0 }}>

        {/* Map (top on mobile, right on desktop) */}
        <div className="w-full h-64 md:h-auto md:w-[60%] order-1 md:order-2 relative">
          <Map
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            onMoveEnd={(evt) => {
              const vs = evt.viewState
              handleMapMove(vs.latitude, vs.longitude, vs.zoom)
            }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
            style={{ width: '100%', height: '100%' }}
          >
            <NavigationControl position="top-right" showCompass={false} />

            {displayVenues.map((venue) => (
              <Marker
                key={venue.id}
                latitude={venue.lat}
                longitude={venue.lng}
                anchor="center"
                onClick={(e) => { e.originalEvent.stopPropagation(); setPopupVenue(venue) }}
              >
                <div
                  style={{
                    width: popupVenue?.id === venue.id ? 18 : 14,
                    height: popupVenue?.id === venue.id ? 18 : 14,
                    borderRadius: '50%',
                    background: TYPE_COLORS[venue.type],
                    border: '2px solid rgba(255,255,255,0.8)',
                    boxShadow: `0 0 ${popupVenue?.id === venue.id ? 12 : 8}px ${TYPE_COLORS[venue.type]}80`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                />
              </Marker>
            ))}

            {popupVenue && (
              <Popup
                latitude={popupVenue.lat}
                longitude={popupVenue.lng}
                anchor="bottom"
                onClose={() => setPopupVenue(null)}
                closeButton={false}
                offset={10}
              >
                <div style={{ background: 'rgba(7,7,26,0.97)', border: '1px solid rgba(var(--accent-rgb),0.2)', borderRadius: 10, padding: '10px 12px', minWidth: 160 }}>
                  <p className="text-xs font-bold mb-0.5" style={{ color: '#e0f2fe' }}>{popupVenue.name}</p>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[10px]" style={{ color: TYPE_COLORS[popupVenue.type] }}>
                      {TYPE_LABELS[popupVenue.type]}
                    </p>
                    {popupVenue.rating && (
                      <p className="text-[10px]" style={{ color: '#ffd600' }}>★ {popupVenue.rating.toFixed(1)}</p>
                    )}
                  </div>
                  <p className="text-[9px] mb-2 truncate" style={{ color: 'rgba(224,242,254,0.4)', maxWidth: 200 }}>
                    {popupVenue.address}
                  </p>
                  <button
                    onClick={() => router.push(`/venues/${popupVenue.id}`)}
                    className="text-[10px] font-bold px-3 py-1 rounded w-full"
                    style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}
                  >
                    VIEW VENUE →
                  </button>
                </div>
              </Popup>
            )}
          </Map>

          {/* Discover hint overlay */}
          {discovering && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(4,4,13,0.9)', border: '1px solid rgba(var(--accent-rgb),0.2)', backdropFilter: 'blur(8px)' }}>
              <Loader2 size={10} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <span className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.6)' }}>
                SCANNING FOR VENUES
              </span>
            </div>
          )}
        </div>

        {/* Venue list (bottom on mobile, left on desktop) */}
        <div className="w-full md:w-[40%] order-2 md:order-1 overflow-y-auto" style={{ borderRight: '1px solid rgba(var(--accent-rgb),0.06)' }}>
          {loading ? (
            <VenueSkeleton />
          ) : displayVenues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <MapPin size={32} className="mb-1" style={{ color: 'rgba(var(--accent-rgb),0.2)' }} />
              <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>NO VENUES FOUND</p>
              <p className="text-[10px] text-center px-8" style={{ color: 'rgba(224,242,254,0.3)' }}>
                Pan the map to a new area to discover venues via Google Places
              </p>
            </div>
          ) : (
            <div>
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.06)' }}>
                <span className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
                  {displayVenues.length} VENUE{displayVenues.length !== 1 ? 'S' : ''}
                </span>
                {discovering && (
                  <Loader2 size={10} className="animate-spin" style={{ color: 'rgba(var(--accent-rgb),0.3)' }} />
                )}
              </div>
              {displayVenues.map((venue) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  distanceKm={userLocation ? haversineKm(userLocation.lat, userLocation.lng, venue.lat, venue.lng) : undefined}
                  onClick={() => {
                    setViewState((v) => ({ ...v, latitude: venue.lat, longitude: venue.lng, zoom: 15 }))
                    setPopupVenue(venue)
                    router.push(`/venues/${venue.id}`)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
