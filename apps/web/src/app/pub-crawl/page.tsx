'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Beer, Users, Clock, MapPin, Zap, ChevronRight,
  Navigation, Loader2, Sparkles, ArrowRight, Star,
  CheckCircle, RotateCcw, Share2, Route, UserCheck, Map,
  LocateFixed, AlertCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

// ── Client-side haversine (metres) ────────────────────────────────────────────
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const CHECKIN_RADIUS_M = 200

// ─── Types ────────────────────────────────────────────────────────────────────

interface CrawlStop {
  order: number
  venueId: string
  name: string
  address: string
  city: string
  lat: number
  lng: number
  type: string
  photoUrl: string | null
  vibeTags: string[]
  rating: number | null
  isClaimed: boolean
  distanceFromPrevKm: number
  walkingMins: number
  arrivalTime: string
  departureTime: string
  durationMins: number
  description: string
}

interface CrawlResult {
  crawlTitle: string
  openingLine: string
  groupSize: number
  startTime: string
  endTime: string
  totalStops: number
  totalDistanceKm: number
  totalDurationMins: number
  route: CrawlStop[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  BAR: '#f59e0b', NIGHTCLUB: '#a855f7', CONCERT_HALL: '#3b82f6',
  ROOFTOP_BAR: '#06b6d4', PUB: '#22c55e', LOUNGE: '#ec4899',
}
const TYPE_LABELS: Record<string, string> = {
  BAR: 'Bar', NIGHTCLUB: 'Nightclub', CONCERT_HALL: 'Concert Hall',
  ROOFTOP_BAR: 'Rooftop Bar', PUB: 'Pub', LOUNGE: 'Lounge',
}
const TYPE_EMOJIS: Record<string, string> = {
  BAR: '🍸', NIGHTCLUB: '🪩', CONCERT_HALL: '🎸',
  ROOFTOP_BAR: '🌆', PUB: '🍺', LOUNGE: '🛋️',
}

const VIBE_OPTIONS = [
  'Relaxed', 'Lively', 'Dancing', 'Live Music', 'Craft Beer',
  'Cocktails', 'LGBT+', 'Sports', 'Rooftop', 'Student',
]

const STOP_OPTIONS = [3, 4, 5, 6, 7, 8]

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// ─── Stop Card ────────────────────────────────────────────────────────────────

type CheckInState = 'idle' | 'locating' | 'posting' | 'success' | 'tooFar' | 'error'

function StopCard({ stop, isLast }: { stop: CrawlStop; isLast: boolean }) {
  const color = TYPE_COLORS[stop.type] ?? '#00e5ff'
  const emoji = TYPE_EMOJIS[stop.type] ?? '🍻'

  const [ciState, setCiState] = useState<CheckInState>('idle')
  const [ciError, setCiError] = useState('')
  const [distAway, setDistAway] = useState<number | null>(null)

  async function handleCheckIn() {
    if (ciState === 'success' || ciState === 'locating' || ciState === 'posting') return
    setCiError('')
    setDistAway(null)

    if (!navigator.geolocation) {
      setCiState('error')
      setCiError('Geolocation not supported by your browser')
      return
    }

    setCiState('locating')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        const dist = haversineM(latitude, longitude, stop.lat, stop.lng)
        setDistAway(Math.round(dist))

        if (dist > CHECKIN_RADIUS_M) {
          setCiState('tooFar')
          return
        }

        setCiState('posting')
        try {
          await api.post('/checkins', { venueId: stop.venueId, userLat: latitude, userLng: longitude })
          setCiState('success')
        } catch (err: any) {
          setCiState('error')
          setCiError(err?.message ?? 'Check-in failed — please try again')
        }
      },
      () => {
        setCiState('error')
        setCiError('Could not get your location — please enable GPS and try again')
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    )
  }

  return (
    <div className="relative flex gap-4">
      {/* Timeline spine */}
      {!isLast && (
        <div className="absolute left-[19px] top-14 bottom-0 w-px" style={{ background: 'rgba(var(--accent-rgb),0.12)' }} />
      )}

      {/* Step number bubble */}
      <div
        className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-black text-sm z-10 border-2 mt-1"
        style={{
          background: ciState === 'success' ? 'rgba(0,255,136,0.15)' : `${color}18`,
          borderColor: ciState === 'success' ? 'rgba(0,255,136,0.6)' : `${color}60`,
          color: ciState === 'success' ? '#00ff88' : color,
          boxShadow: ciState === 'success' ? '0 0 16px rgba(0,255,136,0.3)' : `0 0 16px ${color}30`,
        }}
      >
        {ciState === 'success' ? <CheckCircle size={16} /> : stop.order}
      </div>

      {/* Card + check-in */}
      <div className="flex-1 mb-4">
        {/* Main card — tappable to open venue */}
        <Link
          href={`/venues/${stop.venueId}`}
          className="rounded-2xl overflow-hidden block transition-all active:scale-[0.98]"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${ciState === 'success' ? 'rgba(0,255,136,0.25)' : `${color}25`}`,
          }}
        >
          {/* Photo banner */}
          {stop.photoUrl ? (
            <div className="w-full h-28 relative overflow-hidden">
              <img src={stop.photoUrl} alt={stop.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: `linear-gradient(to top, rgba(7,7,26,0.9) 0%, transparent 60%)` }} />
              <div className="absolute top-2 left-3">
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                  style={{ background: `${color}22`, color, border: `1px solid ${color}50` }}>
                  {TYPE_LABELS[stop.type] ?? stop.type}
                </span>
              </div>
              <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
                <p className="text-sm font-black" style={{ color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>{stop.name}</p>
                {stop.rating && (
                  <span className="text-[10px] font-bold" style={{ color: '#ffd600' }}>★ {stop.rating.toFixed(1)}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="px-4 pt-3.5 pb-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{emoji}</span>
                  <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{stop.name}</p>
                </div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                  style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}>
                  {TYPE_LABELS[stop.type] ?? stop.type}
                </span>
              </div>
            </div>
          )}

          <div className="px-4 py-3">
            {/* Time row */}
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-1.5">
                <Clock size={11} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
                <span className="text-xs font-black" style={{ color: 'var(--accent)' }}>{stop.arrivalTime}</span>
                <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.35)' }}>→</span>
                <span className="text-xs font-black" style={{ color: 'var(--accent)' }}>{stop.departureTime}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(var(--accent-rgb),0.06)', color: 'rgba(var(--accent-rgb),0.5)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
                {formatDuration(stop.durationMins)} here
              </span>
              {stop.isClaimed && (
                <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ color: 'var(--accent)', background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
                  <CheckCircle size={8} /> CLAIMED
                </span>
              )}
            </div>

            {/* AI description */}
            {stop.description && (
              <p className="text-xs mb-2 leading-relaxed" style={{ color: 'rgba(224,242,254,0.55)' }}>
                {stop.description}
              </p>
            )}

            {/* Address + vibes */}
            <p className="text-[10px] truncate mb-1.5" style={{ color: 'rgba(224,242,254,0.3)' }}>{stop.address}</p>
            {stop.vibeTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {stop.vibeTags.slice(0, 4).map((t) => (
                  <span key={t} className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{ color: 'rgba(var(--accent-rgb),0.45)', background: 'rgba(var(--accent-rgb),0.05)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Link>

        {/* ── GPS-gated check-in button ── */}
        {ciState === 'success' ? (
          <div className="mt-2 flex items-center justify-center gap-1.5 py-2 rounded-xl"
            style={{ background: 'rgba(0,255,136,0.07)', border: '1px solid rgba(0,255,136,0.2)' }}>
            <CheckCircle size={12} style={{ color: '#00ff88' }} />
            <span className="text-[10px] font-black" style={{ color: '#00ff88' }}>CHECKED IN ✓</span>
          </div>
        ) : (
          <button
            onClick={handleCheckIn}
            disabled={ciState === 'locating' || ciState === 'posting'}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-black transition-all active:scale-95 disabled:opacity-60"
            style={{
              background: ciState === 'tooFar' || ciState === 'error'
                ? 'rgba(255,0,110,0.08)'
                : 'rgba(var(--accent-rgb),0.07)',
              border: `1px solid ${ciState === 'tooFar' || ciState === 'error' ? 'rgba(255,0,110,0.25)' : 'rgba(var(--accent-rgb),0.2)'}`,
              color: ciState === 'tooFar' || ciState === 'error' ? '#ff006e' : 'var(--accent)',
              letterSpacing: '0.1em',
            }}
          >
            {ciState === 'locating' && <><Loader2 size={11} className="animate-spin" /> GETTING LOCATION…</>}
            {ciState === 'posting'  && <><Loader2 size={11} className="animate-spin" /> CHECKING IN…</>}
            {ciState === 'tooFar'   && (
              <>
                <AlertCircle size={11} />
                YOU&apos;RE {distAway != null ? `${distAway}M` : 'TOO FAR'} AWAY — NEED TO BE WITHIN 200M
              </>
            )}
            {ciState === 'error' && (
              <>
                <AlertCircle size={11} />
                {ciError || 'TRY AGAIN'}
              </>
            )}
            {ciState === 'idle' && <><LocateFixed size={11} /> CHECK IN HERE</>}
          </button>
        )}

        {/* Retry hint for tooFar */}
        {ciState === 'tooFar' && (
          <button
            onClick={() => setCiState('idle')}
            className="mt-1 w-full text-center text-[9px]"
            style={{ color: 'rgba(224,242,254,0.25)' }}
          >
            Tap to retry once you&apos;re closer
          </button>
        )}
      </div>
    </div>
  )
}

// ── Walking connector ─────────────────────────────────────────────────────────

function WalkConnector({ stop }: { stop: CrawlStop }) {
  if (stop.order === 1 || stop.walkingMins === 0) return null
  return (
    <div className="flex gap-4 mb-1 -mt-3">
      <div className="w-10 shrink-0" />
      <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg mb-3"
        style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
        <Navigation size={10} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
        <span className="text-[10px]" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>
          {stop.walkingMins} min walk · {stop.distanceFromPrevKm < 1
            ? `${Math.round(stop.distanceFromPrevKm * 1000)}m`
            : `${stop.distanceFromPrevKm.toFixed(1)}km`}
        </span>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PubCrawlPage() {
  const router = useRouter()
  const { dbUser } = useAuth()

  const [groupSize, setGroupSize] = useState(6)
  const [startTime, setStartTime] = useState('19:00')
  const [numStops, setNumStops] = useState(5)
  const [selectedVibes, setSelectedVibes] = useState<string[]>([])
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationDenied, setLocationDenied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<CrawlResult | null>(null)
  const [error, setError] = useState('')
  // Group opt-in state
  const [optIns, setOptIns] = useState<string[]>([])
  const [optInInput, setOptInInput] = useState('')
  const [hasOptedIn, setHasOptedIn] = useState(false)

  // Request geolocation on mount
  useEffect(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ lat: coords.latitude, lng: coords.longitude })
        setLocating(false)
      },
      () => {
        // Glasgow city centre fallback — inform the user
        setLocation({ lat: 55.8642, lng: -4.2518 })
        setLocationDenied(true)
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }, [])

  function toggleVibe(vibe: string) {
    setSelectedVibes((prev) =>
      prev.includes(vibe) ? prev.filter((v) => v !== vibe) : [...prev, vibe],
    )
  }

  const generate = useCallback(async () => {
    if (!location) return
    setGenerating(true)
    setError('')
    setResult(null)
    setOptIns([])
    setHasOptedIn(false)
    try {
      const json = await api.post<{ data: CrawlResult }>('/pub-crawl/generate', {
        lat: location.lat,
        lng: location.lng,
        groupSize,
        startTime,
        vibes: selectedVibes,
        stops: numStops,
      })
      if (json?.data) setResult(json.data)
      else setError('No route generated — try a different area or fewer stops.')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to generate route')
    } finally {
      setGenerating(false)
    }
  }, [location, groupSize, startTime, selectedVibes, numStops])

  return (
    <div className="min-h-screen pb-24" style={{ background: '#0d0d0f', paddingTop: 56 }}>

      {/* ── Header ── */}
      <div className="px-4 pt-6 pb-5" style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.08)' }}>
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <Beer size={16} style={{ color: 'var(--accent)' }} />
            <h1 className="text-base font-black tracking-[0.2em]" style={{ color: 'var(--accent)' }}>PUB CRAWL</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.25)' }}>
              <Sparkles size={8} /> PARTYRADAR PLANNER
            </span>
          </div>
          <p className="text-xs" style={{ color: 'rgba(224,242,254,0.4)' }}>
            PartyRadar picks the best venues nearby, builds a walking route, and times each stop for your group.
          </p>
        </div>
      </div>

      <div className="px-4 max-w-lg mx-auto">

        {/* ── Config card ── */}
        {!result && (
          <div className="mt-5 rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>

            {/* Group size */}
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.06)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Users size={13} style={{ color: 'rgba(var(--accent-rgb),0.6)' }} />
                <span className="text-[11px] font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.6)' }}>GROUP SIZE</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setGroupSize((n) => Math.max(2, n - 1))}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold transition-all active:scale-90"
                  style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>
                  −
                </button>
                <span className="text-2xl font-black w-12 text-center" style={{ color: '#e0f2fe' }}>{groupSize}</span>
                <button
                  onClick={() => setGroupSize((n) => Math.min(30, n + 1))}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold transition-all active:scale-90"
                  style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>
                  +
                </button>
                <span className="text-[11px] ml-1" style={{ color: 'rgba(224,242,254,0.35)' }}>people</span>
              </div>
            </div>

            {/* Start time + stops */}
            <div className="px-5 py-4 flex gap-4" style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.06)' }}>
              {/* Start time */}
              <div className="flex-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock size={12} style={{ color: 'rgba(var(--accent-rgb),0.55)' }} />
                  <span className="text-[11px] font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>START TIME</span>
                </div>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm font-bold outline-none"
                  style={{
                    background: 'rgba(var(--accent-rgb),0.05)',
                    border: '1px solid rgba(var(--accent-rgb),0.15)',
                    color: '#e0f2fe',
                    colorScheme: 'dark',
                  }}
                />
              </div>

              {/* Stops */}
              <div className="flex-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <Route size={12} style={{ color: 'rgba(var(--accent-rgb),0.55)' }} />
                  <span className="text-[11px] font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>STOPS</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {STOP_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setNumStops(n)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: numStops === n ? 'rgba(var(--accent-rgb),0.15)' : 'rgba(var(--accent-rgb),0.04)',
                        border: `1px solid ${numStops === n ? 'rgba(var(--accent-rgb),0.45)' : 'rgba(var(--accent-rgb),0.12)'}`,
                        color: numStops === n ? 'var(--accent)' : 'rgba(224,242,254,0.4)',
                      }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Vibe tags */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Sparkles size={12} style={{ color: 'rgba(var(--accent-rgb),0.55)' }} />
                <span className="text-[11px] font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>VIBE (OPTIONAL)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {VIBE_OPTIONS.map((vibe) => {
                  const active = selectedVibes.includes(vibe)
                  return (
                    <button
                      key={vibe}
                      onClick={() => toggleVibe(vibe)}
                      className="px-3 py-1.5 rounded-full text-[10px] font-bold transition-all"
                      style={{
                        background: active ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)',
                        border: active ? '1px solid rgba(168,85,247,0.45)' : '1px solid rgba(74,96,128,0.2)',
                        color: active ? '#a855f7' : 'rgba(224,242,254,0.4)',
                      }}>
                      {vibe}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Location status ── */}
        {locating && !result && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl"
            style={{ background: 'rgba(var(--accent-rgb),0.05)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
            <Loader2 size={11} className="animate-spin" style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
            <span className="text-[11px]" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>Getting your location…</span>
          </div>
        )}
        {location && !locating && !result && !locationDenied && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl"
            style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)' }}>
            <MapPin size={11} style={{ color: '#00ff88' }} />
            <span className="text-[10px]" style={{ color: 'rgba(0,255,136,0.6)' }}>
              Location ready · {location.lat.toFixed(3)}, {location.lng.toFixed(3)}
            </span>
          </div>
        )}
        {locationDenied && !locating && !result && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <MapPin size={11} style={{ color: '#f59e0b' }} />
            <span className="text-[10px]" style={{ color: 'rgba(245,158,11,0.8)' }}>
              Location access denied — using Glasgow city centre. Enable GPS for better results.
            </span>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="mt-3 px-4 py-3 rounded-xl space-y-2"
            style={{ background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
            <p className="text-sm" style={{ color: '#ff006e' }}>{error}</p>
            {error.includes('Not enough venues') && (
              <Link href="/venues"
                className="flex items-center gap-1.5 text-xs font-black w-full justify-center py-2 rounded-lg mt-1"
                style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)' }}>
                <Map size={12} /> OPEN VENUES MAP FIRST →
              </Link>
            )}
          </div>
        )}

        {/* ── Generate button ── */}
        {!result && (
          <button
            onClick={generate}
            disabled={generating || locating || !location}
            className="mt-5 w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            style={{
              background: generating
                ? 'rgba(var(--accent-rgb),0.06)'
                : 'linear-gradient(135deg, rgba(var(--accent-rgb),0.18) 0%, rgba(168,85,247,0.18) 100%)',
              border: `1px solid ${generating ? 'rgba(var(--accent-rgb),0.15)' : 'rgba(var(--accent-rgb),0.4)'}`,
              color: 'var(--accent)',
              boxShadow: generating ? 'none' : '0 0 30px rgba(var(--accent-rgb),0.15)',
              letterSpacing: '0.1em',
              opacity: (!location || locating) ? 0.5 : 1,
            }}>
            {generating
              ? <><Loader2 size={15} className="animate-spin" /> BUILDING YOUR ROUTE…</>
              : <><Sparkles size={15} /> GENERATE PARTYRADAR ROUTE <ArrowRight size={14} /></>
            }
          </button>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* RESULT                                                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        {result && (
          <div className="mt-5">

            {/* Title card */}
            <div className="rounded-2xl overflow-hidden mb-5"
              style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.1) 0%, rgba(168,85,247,0.1) 100%)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
              <div className="h-0.5" style={{ background: 'linear-gradient(90deg, var(--accent), #a855f7)' }} />
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black tracking-[0.2em] mb-1" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>
                      PARTYRADAR ROUTE
                    </p>
                    <h2 className="text-lg font-black leading-tight mb-1.5" style={{ color: '#e0f2fe' }}>
                      {result.crawlTitle}
                    </h2>
                    <p className="text-xs" style={{ color: 'rgba(224,242,254,0.55)' }}>{result.openingLine}</p>
                  </div>
                  <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-2xl"
                    style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
                    🍺
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex flex-wrap gap-3 mt-4 pt-4" style={{ borderTop: '1px solid rgba(var(--accent-rgb),0.1)' }}>
                  {[
                    { icon: <Users size={11} />, label: `${result.groupSize} people` },
                    { icon: <MapPin size={11} />, label: `${result.totalStops} stops` },
                    { icon: <Navigation size={11} />, label: `${result.totalDistanceKm}km walk` },
                    { icon: <Clock size={11} />, label: `${result.startTime} → ${result.endTime}` },
                  ].map(({ icon, label }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>{icon}</span>
                      <span className="text-[10px] font-bold" style={{ color: 'rgba(224,242,254,0.55)' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Route timeline */}
            <div>
              {result.route.map((stop, i) => (
                <div key={stop.venueId}>
                  <WalkConnector stop={stop} />
                  <StopCard stop={stop} isLast={i === result.route.length - 1} />
                </div>
              ))}
            </div>

            {/* Finish banner */}
            <div className="mt-2 rounded-2xl px-5 py-4 flex items-center gap-3 mb-5"
              style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)' }}>
              <span className="text-2xl">🎉</span>
              <div>
                <p className="text-xs font-black" style={{ color: '#00ff88' }}>CRAWL COMPLETE BY {result.endTime}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(0,255,136,0.5)' }}>
                  {formatDuration(result.totalDurationMins)} total · {result.totalDistanceKm}km on foot
                </p>
              </div>
            </div>

            {/* ── Who's In? opt-in section ── */}
            <div className="rounded-2xl overflow-hidden mb-5"
              style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <div className="px-4 py-3 flex items-center justify-between"
                style={{ borderBottom: '1px solid rgba(168,85,247,0.12)' }}>
                <div className="flex items-center gap-2">
                  <UserCheck size={13} style={{ color: '#a855f7' }} />
                  <span className="text-[11px] font-black tracking-widest" style={{ color: '#a855f7' }}>
                    WHO&apos;S IN? {optIns.length > 0 && `· ${optIns.length}/${result.groupSize}`}
                  </span>
                </div>
                {optIns.length > 0 && (
                  <span className="text-[10px]" style={{ color: 'rgba(168,85,247,0.5)' }}>
                    {result.groupSize - optIns.length} spot{result.groupSize - optIns.length !== 1 ? 's' : ''} left
                  </span>
                )}
              </div>

              <div className="px-4 py-3 space-y-3">
                {/* Opt-in list */}
                {optIns.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {optIns.map((name) => (
                      <div key={name} className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                        style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00ff88' }} />
                        <span className="text-[10px] font-bold" style={{ color: '#a855f7' }}>{name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* "I'm In" quick button or custom name input */}
                {!hasOptedIn ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const name = dbUser?.displayName ?? 'Me'
                        if (!optIns.includes(name)) setOptIns((prev) => [...prev, name])
                        setHasOptedIn(true)
                      }}
                      className="flex-1 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.35)', color: '#00ff88', letterSpacing: '0.08em' }}
                    >
                      🙋 I&apos;M IN
                    </button>
                    <div className="flex gap-1.5 flex-1">
                      <input
                        value={optInInput}
                        onChange={(e) => setOptInInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && optInInput.trim()) {
                            const name = optInInput.trim()
                            if (!optIns.includes(name)) setOptIns((prev) => [...prev, name])
                            setOptInInput('')
                          }
                        }}
                        placeholder="Add a name…"
                        className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', color: '#e0f2fe' }}
                      />
                      <button
                        onClick={() => {
                          const name = optInInput.trim()
                          if (name && !optIns.includes(name)) {
                            setOptIns((prev) => [...prev, name])
                            setOptInInput('')
                          }
                        }}
                        disabled={!optInInput.trim()}
                        className="px-3 py-2 rounded-xl text-xs font-black disabled:opacity-40 transition-all"
                        style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7' }}
                      >
                        + ADD
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 py-2 px-3 rounded-xl"
                      style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)' }}>
                      <CheckCircle size={12} style={{ color: '#00ff88' }} />
                      <span className="text-[11px] font-black" style={{ color: '#00ff88' }}>YOU&apos;RE IN!</span>
                    </div>
                    {/* Add more people */}
                    <div className="flex gap-1.5 flex-1">
                      <input
                        value={optInInput}
                        onChange={(e) => setOptInInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && optInInput.trim()) {
                            const name = optInInput.trim()
                            if (!optIns.includes(name)) setOptIns((prev) => [...prev, name])
                            setOptInInput('')
                          }
                        }}
                        placeholder="Add friend…"
                        className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
                        style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', color: '#e0f2fe' }}
                      />
                      <button
                        onClick={() => {
                          const name = optInInput.trim()
                          if (name && !optIns.includes(name)) {
                            setOptIns((prev) => [...prev, name])
                            setOptInInput('')
                          }
                        }}
                        disabled={!optInInput.trim()}
                        className="px-3 py-2 rounded-xl text-xs font-black disabled:opacity-40 transition-all"
                        style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7' }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {optIns.length === 0 && (
                  <p className="text-[10px] text-center" style={{ color: 'rgba(224,242,254,0.25)' }}>
                    Tap &quot;I&apos;m In&quot; to commit to the crawl, or add your crew&apos;s names above
                  </p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => { setResult(null); setError('') }}
                className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-black transition-all active:scale-95"
                style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'rgba(var(--accent-rgb),0.6)', letterSpacing: '0.08em' }}>
                <RotateCcw size={13} /> NEW ROUTE
              </button>
              <button
                onClick={() => {
                  const text = `${result.crawlTitle}\n${result.route.map((s, i) => `${i + 1}. ${s.name} ${s.arrivalTime}–${s.departureTime}`).join('\n')}\nGenerated by PartyRadar 🍺`
                  if (navigator.share) {
                    navigator.share({ title: result.crawlTitle, text })
                  } else {
                    navigator.clipboard.writeText(text).catch(() => {})
                  }
                }}
                className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-black transition-all active:scale-95"
                style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7', letterSpacing: '0.08em' }}>
                <Share2 size={13} /> SHARE
              </button>
            </div>

            {/* Re-generate with tweaks */}
            <button
              onClick={generate}
              disabled={generating}
              className="mt-3 w-full py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-95"
              style={{
                background: 'rgba(var(--accent-rgb),0.04)',
                border: '1px solid rgba(var(--accent-rgb),0.12)',
                color: 'rgba(var(--accent-rgb),0.5)',
                letterSpacing: '0.08em',
                opacity: generating ? 0.5 : 1,
              }}>
              {generating
                ? <><Loader2 size={12} className="animate-spin" /> REGENERATING…</>
                : <><Sparkles size={12} /> REGENERATE</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
