'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Map, { Marker } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  ArrowLeft, MapPin, Phone, Globe, Tag, Calendar, Ticket,
  CheckCircle, Building2, Loader2, AlertTriangle, X
} from 'lucide-react'

import { API_URL as API_BASE } from '@/lib/api'
const MAPBOX_TOKEN = process.env['NEXT_PUBLIC_MAPBOX_TOKEN'] ?? ''

// ─── Types ────────────────────────────────────────────────────────────────────

type VenueType = 'BAR' | 'NIGHTCLUB' | 'CONCERT_HALL' | 'ROOFTOP_BAR' | 'PUB' | 'LOUNGE'
type EventType = 'HOME_PARTY' | 'CLUB_NIGHT' | 'CONCERT'

interface UpcomingEvent {
  id: string
  name: string
  startsAt: string
  price: number
  type: EventType
  coverImageUrl?: string
  host: { id: string; displayName: string; photoUrl?: string }
}

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
  rating?: number
  openingHours?: unknown
  vibeTags: string[]
  isClaimed: boolean
  claimedById?: string
  claimedBy?: { id: string; username: string; displayName: string; photoUrl?: string }
  events: UpcomingEvent[]
  createdAt: string
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

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  HOME_PARTY: '#ff006e',
  CLUB_NIGHT:  '#00e5ff',
  CONCERT:     '#3d5afe',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  })
}

function formatPrice(price: number) {
  return price === 0 ? 'Free' : `£${price.toFixed(2)}`
}

// ─── Claim Modal ──────────────────────────────────────────────────────────────

function ClaimModal({ venueName, onClose }: { venueName: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}>
      <div className="rounded-2xl p-6 max-w-sm w-full" style={{ background: '#111118', border: '1px solid rgba(0,229,255,0.2)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 size={16} style={{ color: '#00e5ff' }} />
            <span className="text-xs font-black tracking-widest" style={{ color: '#00e5ff' }}>CLAIM VENUE</span>
          </div>
          <button onClick={onClose}><X size={16} style={{ color: 'rgba(74,96,128,0.6)' }} /></button>
        </div>
        <p className="text-sm font-bold mb-2" style={{ color: '#e0f2fe' }}>{venueName}</p>
        <p className="text-xs leading-relaxed mb-5" style={{ color: 'rgba(224,242,254,0.5)' }}>
          To claim ownership of this venue and manage its details, please contact us. We'll verify your ownership and get you set up.
        </p>
        <a
          href="mailto:hello@partyradar.app?subject=Venue Claim Request"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all"
          style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.25)' }}
        >
          CONTACT US →
        </a>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VenueDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params['id'] as string

  const [venue, setVenue] = useState<Venue | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE}/venues/${id}`)
        if (res.status === 404) { setNotFound(true); return }
        if (!res.ok) throw new Error('Failed to fetch venue')
        const data = await res.json()
        setVenue(data)
      } catch (err) {
        console.error('[VenueDetail] fetch error:', err)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d0d0f' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: '#00e5ff' }} />
      </div>
    )
  }

  // ── Not found ──
  if (notFound || !venue) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0d0d0f' }}>
        <AlertTriangle size={32} style={{ color: 'rgba(0,229,255,0.3)' }} />
        <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.6)' }}>VENUE NOT FOUND</p>
        <Link href="/venues" className="text-xs font-bold" style={{ color: '#00e5ff' }}>← Back to Venues</Link>
      </div>
    )
  }

  const color = TYPE_COLORS[venue.type]

  return (
    <div className="min-h-screen" style={{ background: '#0d0d0f', paddingTop: 56 }}>

      {claimOpen && <ClaimModal venueName={venue.name} onClose={() => setClaimOpen(false)} />}

      {/* ─── Hero ─── */}
      <div className="relative h-52 md:h-72">
        {venue.photoUrl ? (
          <img src={venue.photoUrl} alt={venue.name} className="w-full h-full object-cover" style={{ filter: 'brightness(0.45) saturate(1.1)' }} />
        ) : (
          <div className="w-full h-full" style={{ background: `radial-gradient(ellipse at 30% 40%, ${color}22 0%, #07071a 70%)` }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(13,13,15,0.1) 0%, rgba(13,13,15,0.95) 100%)' }} />

        {/* Back button */}
        <button
          onClick={() => router.push('/venues')}
          className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
          style={{ background: 'rgba(4,4,13,0.6)', border: '1px solid rgba(0,229,255,0.15)', color: '#e0f2fe', backdropFilter: 'blur(8px)' }}
        >
          <ArrowLeft size={12} /> VENUES
        </button>

        {/* Name + type */}
        <div className="absolute bottom-5 left-4 right-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-bold px-2.5 py-1 rounded"
              style={{ color, background: `${color}18`, border: `1px solid ${color}40` }}>
              {TYPE_LABELS[venue.type]}
            </span>
            {venue.isClaimed && (
              <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded"
                style={{ color: '#00e5ff', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)' }}>
                <CheckCircle size={8} /> VERIFIED
              </span>
            )}
          </div>
          <h1 className="text-2xl md:text-3xl font-black" style={{ color: '#e0f2fe', textShadow: '0 2px 20px rgba(0,0,0,0.8)' }}>
            {venue.name}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(224,242,254,0.55)' }}>{venue.address}</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* ─── Info grid ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {venue.phone && (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}>
              <Phone size={14} style={{ color: 'rgba(0,229,255,0.5)' }} />
              <div>
                <p className="text-[9px] font-bold tracking-widest mb-0.5" style={{ color: 'rgba(0,229,255,0.4)' }}>PHONE</p>
                <a href={`tel:${venue.phone}`} className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{venue.phone}</a>
              </div>
            </div>
          )}

          {venue.website && (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}>
              <Globe size={14} style={{ color: 'rgba(0,229,255,0.5)' }} />
              <div>
                <p className="text-[9px] font-bold tracking-widest mb-0.5" style={{ color: 'rgba(0,229,255,0.4)' }}>WEBSITE</p>
                <a href={venue.website} target="_blank" rel="noopener noreferrer" className="text-sm font-bold hover:underline" style={{ color: '#00e5ff' }}>
                  {venue.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}>
            <MapPin size={14} style={{ color: 'rgba(0,229,255,0.5)' }} />
            <div>
              <p className="text-[9px] font-bold tracking-widest mb-0.5" style={{ color: 'rgba(0,229,255,0.4)' }}>LOCATION</p>
              <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{venue.city}</p>
            </div>
          </div>

          {venue.rating && (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}>
              <Tag size={14} style={{ color: 'rgba(0,229,255,0.5)' }} />
              <div>
                <p className="text-[9px] font-bold tracking-widest mb-0.5" style={{ color: 'rgba(0,229,255,0.4)' }}>RATING</p>
                <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>★ {venue.rating.toFixed(1)}</p>
              </div>
            </div>
          )}
        </div>

        {/* ─── Vibe tags ─── */}
        {venue.vibeTags.length > 0 && (
          <div>
            <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: 'rgba(0,229,255,0.4)' }}>VIBE</p>
            <div className="flex flex-wrap gap-2">
              {venue.vibeTags.map((tag) => (
                <span key={tag} className="text-xs px-3 py-1 rounded-full"
                  style={{ color: 'rgba(0,229,255,0.7)', background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.15)' }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ─── Upcoming Events ─── */}
        <div>
          <p className="text-[10px] font-bold tracking-widest mb-3" style={{ color: 'rgba(0,229,255,0.4)' }}>
            UPCOMING EVENTS {venue.events.length > 0 ? `— ${venue.events.length}` : ''}
          </p>

          {venue.events.length === 0 ? (
            <div className="py-8 rounded-xl flex flex-col items-center" style={{ background: 'rgba(0,229,255,0.02)', border: '1px solid rgba(0,229,255,0.06)' }}>
              <Calendar size={24} className="mb-2" style={{ color: 'rgba(0,229,255,0.2)' }} />
              <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.4)' }}>NO UPCOMING EVENTS</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {venue.events.map((event) => {
                const ec = EVENT_TYPE_COLORS[event.type]
                return (
                  <Link key={event.id} href={`/events/${event.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl transition-all"
                    style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,229,255,0.2)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,229,255,0.08)' }}
                  >
                    {event.coverImageUrl && (
                      <img src={event.coverImageUrl} alt={event.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{event.name}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.45)' }}>{formatDate(event.startsAt)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded"
                        style={{ color: ec, background: `${ec}15`, border: `1px solid ${ec}30` }}>
                        {event.type.replace('_', ' ')}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-bold" style={{ color: event.price === 0 ? '#00ff88' : '#e0f2fe' }}>
                        <Ticket size={10} /> {formatPrice(event.price)}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── Map ─── */}
        <div>
          <p className="text-[10px] font-bold tracking-widest mb-3" style={{ color: 'rgba(0,229,255,0.4)' }}>LOCATION</p>
          <div className="rounded-xl overflow-hidden" style={{ height: 220, border: '1px solid rgba(0,229,255,0.1)' }}>
            <Map
              initialViewState={{ latitude: venue.lat, longitude: venue.lng, zoom: 15 }}
              mapStyle="mapbox://styles/mapbox/dark-v11"
              mapboxAccessToken={MAPBOX_TOKEN}
              style={{ width: '100%', height: '100%' }}
              interactive={false}
            >
              <Marker latitude={venue.lat} longitude={venue.lng} anchor="center">
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: color, border: '2.5px solid rgba(255,255,255,0.9)',
                  boxShadow: `0 0 12px ${color}90`,
                }} />
              </Marker>
            </Map>
          </div>
        </div>

        {/* ─── Claim button ─── */}
        {!venue.isClaimed && (
          <div className="rounded-xl p-4 flex items-center justify-between gap-4"
            style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}>
            <div>
              <p className="text-xs font-bold mb-0.5" style={{ color: '#e0f2fe' }}>Is this your venue?</p>
              <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>Claim it to manage events and details.</p>
            </div>
            <button
              onClick={() => setClaimOpen(true)}
              className="shrink-0 text-[10px] font-bold px-4 py-2 rounded-lg"
              style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.25)' }}
            >
              CLAIM
            </button>
          </div>
        )}

        {/* ─── Claimed by ─── */}
        {venue.isClaimed && venue.claimedBy && (
          <div className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}>
            {venue.claimedBy.photoUrl
              ? <img src={venue.claimedBy.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
              : <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,229,255,0.1)' }}><Building2 size={14} style={{ color: '#00e5ff' }} /></div>}
            <div>
              <p className="text-[9px] font-bold tracking-widest mb-0.5" style={{ color: 'rgba(0,229,255,0.4)' }}>MANAGED BY</p>
              <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>{venue.claimedBy.displayName}</p>
            </div>
            <CheckCircle size={14} className="ml-auto" style={{ color: '#00e5ff' }} />
          </div>
        )}
      </div>
    </div>
  )
}
