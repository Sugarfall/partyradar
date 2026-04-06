'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Map, { Marker, Popup } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Search, MapPin, Phone, Globe, Zap, CheckCircle, X } from 'lucide-react'

import { API_URL as API_BASE } from '@/lib/api'
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
  upcomingEventsCount: number
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

// ─── VenueCard ────────────────────────────────────────────────────────────────

function VenueCard({ venue, onClick }: { venue: Venue; onClick: () => void }) {
  const color = TYPE_COLORS[venue.type]
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-4 transition-all duration-200 border-b"
      style={{
        borderColor: 'rgba(0,229,255,0.06)',
        background: 'transparent',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.04)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <div className="flex items-start gap-3">
        {/* Color dot + photo */}
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
            {venue.isClaimed && (
              <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ color: '#00e5ff', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)' }}>
                <CheckCircle size={8} /> CLAIMED
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}>
              {TYPE_LABELS[venue.type]}
            </span>
            {venue.upcomingEventsCount > 0 && (
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
                  style={{ color: 'rgba(0,229,255,0.5)', background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.1)' }}>
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
        <div key={i} className="px-4 py-4 border-b animate-pulse" style={{ borderColor: 'rgba(0,229,255,0.06)' }}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg" style={{ background: 'rgba(0,229,255,0.06)' }} />
            <div className="flex-1">
              <div className="h-3.5 rounded mb-2 w-2/3" style={{ background: 'rgba(0,229,255,0.08)' }} />
              <div className="h-2.5 rounded w-1/3" style={{ background: 'rgba(0,229,255,0.05)' }} />
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
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<VenueType | 'ALL'>('ALL')
  const [popupVenue, setPopupVenue] = useState<Venue | null>(null)
  const [viewState, setViewState] = useState({
    latitude: 55.8642,
    longitude: -4.2518,
    zoom: 12,
  })

  const fetchVenues = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ city: 'Glasgow', limit: '100' })
      if (search) params.set('q', search)
      if (typeFilter !== 'ALL') params.set('type', typeFilter)

      const res = await fetch(`${API_BASE}/venues?${params}`)
      if (!res.ok) throw new Error('Failed to fetch venues')
      const json = await res.json()
      setVenues(json.data ?? [])
    } catch (err) {
      console.error('[VenuesPage] fetch error:', err)
      setVenues([])
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter])

  useEffect(() => {
    const t = setTimeout(() => { fetchVenues() }, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [fetchVenues, search])

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0d0d0f', paddingTop: 56 }}>

      {/* ─── Header ─── */}
      <div className="px-4 pt-6 pb-4" style={{ borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={16} style={{ color: '#00e5ff' }} />
            <h1 className="text-base font-black tracking-[0.2em]" style={{ color: '#00e5ff' }}>VENUES</h1>
            <span className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.35)' }}>— GLASGOW</span>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(0,229,255,0.4)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search venues..."
              className="w-full pl-8 pr-4 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'rgba(0,229,255,0.04)',
                border: '1px solid rgba(0,229,255,0.15)',
                color: '#e0f2fe',
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X size={12} style={{ color: 'rgba(0,229,255,0.4)' }} />
              </button>
            )}
          </div>

          {/* Type filter tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {FILTER_TABS.map(({ label, value }) => {
              const active = typeFilter === value
              const color = value === 'ALL' ? '#00e5ff' : TYPE_COLORS[value as VenueType]
              return (
                <button
                  key={value}
                  onClick={() => setTypeFilter(value)}
                  className="shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-full transition-all"
                  style={{
                    color: active ? (value === 'ALL' ? '#00e5ff' : color) : 'rgba(74,96,128,0.7)',
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
            mapStyle="mapbox://styles/mapbox/dark-v11"
            mapboxAccessToken={MAPBOX_TOKEN}
            style={{ width: '100%', height: '100%' }}
          >
            {venues.map((venue) => (
              <Marker
                key={venue.id}
                latitude={venue.lat}
                longitude={venue.lng}
                anchor="center"
                onClick={(e) => { e.originalEvent.stopPropagation(); setPopupVenue(venue) }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: TYPE_COLORS[venue.type],
                    border: '2px solid rgba(255,255,255,0.8)',
                    boxShadow: `0 0 8px ${TYPE_COLORS[venue.type]}80`,
                    cursor: 'pointer',
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
                <div style={{ background: 'rgba(7,7,26,0.97)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 10, padding: '10px 12px', minWidth: 140 }}>
                  <p className="text-xs font-bold mb-1" style={{ color: '#e0f2fe' }}>{popupVenue.name}</p>
                  <p className="text-[10px] mb-2" style={{ color: 'rgba(224,242,254,0.5)' }}>
                    {TYPE_LABELS[popupVenue.type]}
                  </p>
                  <button
                    onClick={() => router.push(`/venues/${popupVenue.id}`)}
                    className="text-[10px] font-bold px-3 py-1 rounded w-full"
                    style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.25)' }}
                  >
                    VIEW →
                  </button>
                </div>
              </Popup>
            )}
          </Map>
        </div>

        {/* Venue list (bottom on mobile, left on desktop) */}
        <div className="w-full md:w-[40%] order-2 md:order-1 overflow-y-auto" style={{ borderRight: '1px solid rgba(0,229,255,0.06)' }}>
          {loading ? (
            <VenueSkeleton />
          ) : venues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <MapPin size={32} className="mb-3" style={{ color: 'rgba(0,229,255,0.2)' }} />
              <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>NO VENUES FOUND</p>
            </div>
          ) : (
            <div>
              <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(0,229,255,0.06)' }}>
                <span className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.4)' }}>
                  {venues.length} VENUE{venues.length !== 1 ? 'S' : ''}
                </span>
              </div>
              {venues.map((venue) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
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
