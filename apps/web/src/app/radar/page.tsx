'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, ThumbsUp, ThumbsDown, X, Search, Star, Clock, ChevronDown, ChevronUp, Crosshair } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { DEV_MODE } from '@/lib/firebase'
import { api } from '@/lib/api'

// Dynamic import for map (SSR safe)
const RadarMap = dynamic(() => import('@/components/radar/RadarMap'), { ssr: false, loading: () => (
  <div className="w-full h-full flex items-center justify-center" style={{ background: '#04040d' }}>
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(255,214,0,0.1)', borderTopColor: '#ffd600' }} />
      <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(255,214,0,0.5)' }}>INITIALISING RADAR...</p>
    </div>
  </div>
)})

// ── Mock sightings for preview ────────────────────────────────────────────────
type Sighting = {
  id: string
  celebrity: string
  description: string
  lat: number
  lng: number
  upvotes: number
  downvotes: number
  expiresAt: string
  createdAt: string
  userVote: 'up' | 'down' | null
  photoUrl?: string
}

// Dates computed inside a factory so they're never calculated during SSR
function makeMockSightings(): Sighting[] {
  const now = Date.now()
  return [
    { id: '1', celebrity: 'Stormzy',        description: 'Spotted leaving the studio, looked relaxed', lat: 51.512, lng: -0.123, upvotes: 34,  downvotes: 2, expiresAt: new Date(now + 3 * 3600000).toISOString(), createdAt: new Date(now - 1 * 3600000).toISOString(),    userVote: null },
    { id: '2', celebrity: 'Dua Lipa',        description: 'At Nobu Mayfair with friends',               lat: 51.509, lng: -0.145, upvotes: 89,  downvotes: 5, expiresAt: new Date(now + 2 * 3600000).toISOString(), createdAt: new Date(now - 2 * 3600000).toISOString(),    userVote: 'up' },
    { id: '3', celebrity: 'Lewis Hamilton',  description: 'Seen at a rooftop bar in Shoreditch',        lat: 51.524, lng: -0.072, upvotes: 52,  downvotes: 8, expiresAt: new Date(now + 4 * 3600000).toISOString(), createdAt: new Date(now - 30 * 60000).toISOString(),     userVote: null },
    { id: '4', celebrity: 'Harry Styles',    description: 'Outside Electric Ballroom, Camden',          lat: 51.542, lng: -0.149, upvotes: 112, downvotes: 3, expiresAt: new Date(now + 5 * 3600000).toISOString(), createdAt: new Date(now - 15 * 60000).toISOString(),     userVote: null },
  ]
}

function timeLeft(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'EXPIRED'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function timeAgo(createdAt: string) {
  const diff = Date.now() - new Date(createdAt).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

// ── Report form ───────────────────────────────────────────────────────────────
function ReportForm({ onClose, onSubmit, userLat, userLng }: {
  onClose: () => void
  onSubmit: (s: Sighting) => void
  userLat: number | null
  userLng: number | null
}) {
  const [celebrity, setCelebrity] = useState('')
  const [desc, setDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!celebrity.trim()) return
    setSubmitting(true)
    // Use actual GPS with small random offset so exact location isn't exposed
    const baseLat = userLat ?? 51.505
    const baseLng = userLng ?? -0.09
    await new Promise((r) => setTimeout(r, 600))
    onSubmit({
      id: Date.now().toString(),
      celebrity: celebrity.trim(),
      description: desc.trim(),
      lat: baseLat + (Math.random() - 0.5) * 0.01,
      lng: baseLng + (Math.random() - 0.5) * 0.01,
      upvotes: 1,
      downvotes: 0,
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      userVote: 'up',
    })
    setSubmitting(false)
    onClose()
  }

  return (
    <div className="animate-fade-up p-5 rounded-2xl space-y-4"
      style={{ background: 'rgba(7,7,26,0.97)', border: '1px solid rgba(255,214,0,0.2)', boxShadow: '0 0 40px rgba(255,214,0,0.1)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-bold tracking-[0.3em]" style={{ color: 'rgba(255,214,0,0.5)' }}>NEW SIGHTING</p>
          <h3 className="text-base font-black" style={{ color: '#ffd600', textShadow: '0 0 12px rgba(255,214,0,0.4)' }}>REPORT SIGHTING</h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg"
          style={{ border: '1px solid rgba(255,214,0,0.2)', color: 'rgba(255,214,0,0.5)' }}>
          <X size={14} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold tracking-[0.15em]" style={{ color: 'rgba(255,214,0,0.55)' }}>WHO DID YOU SEE? *</label>
          <input
            value={celebrity}
            onChange={(e) => setCelebrity(e.target.value)}
            onFocus={() => setFocused('name')}
            onBlur={() => setFocused(null)}
            placeholder="Who did you see?"
            required
            className="w-full px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-all duration-200"
            style={{ background: 'rgba(255,214,0,0.04)', border: focused === 'name' ? '1px solid rgba(255,214,0,0.5)' : '1px solid rgba(255,214,0,0.15)', color: '#e0f2fe', boxShadow: focused === 'name' ? '0 0 12px rgba(255,214,0,0.1)' : 'none' }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold tracking-[0.15em]" style={{ color: 'rgba(255,214,0,0.55)' }}>DETAILS (OPTIONAL)</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onFocus={() => setFocused('desc')}
            onBlur={() => setFocused(null)}
            rows={2}
            placeholder="Where exactly? What were they doing?"
            className="w-full px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-all duration-200 resize-none"
            style={{ background: 'rgba(255,214,0,0.04)', border: focused === 'desc' ? '1px solid rgba(255,214,0,0.5)' : '1px solid rgba(255,214,0,0.15)', color: '#e0f2fe' }}
          />
        </div>

        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(255,214,0,0.04)', border: '1px solid rgba(255,214,0,0.12)', color: 'rgba(255,214,0,0.5)' }}>
          <Crosshair size={11} />
          Using your current location · Sighting expires in 6 hours
        </div>

        <button type="submit" disabled={submitting || !celebrity.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all duration-200 disabled:opacity-40"
          style={{ background: 'rgba(255,214,0,0.12)', border: '1px solid rgba(255,214,0,0.45)', color: '#ffd600', boxShadow: '0 0 20px rgba(255,214,0,0.12)', letterSpacing: '0.1em' }}>
          {submitting
            ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> REPORTING...</>
            : <><Star size={14} fill="currentColor" /> REPORT SIGHTING</>
          }
        </button>
      </form>
    </div>
  )
}

// ── Sighting card ─────────────────────────────────────────────────────────────
function SightingCard({ sighting, onVote }: { sighting: Sighting; onVote: (id: string, dir: 'up' | 'down') => void }) {
  const [expanded, setExpanded] = useState(false)
  const score = sighting.upvotes - sighting.downvotes
  const confidence = Math.min(100, Math.round((sighting.upvotes / Math.max(1, sighting.upvotes + sighting.downvotes)) * 100))

  return (
    <div className="rounded-xl overflow-hidden transition-all duration-200"
      style={{ background: 'rgba(7,7,26,0.9)', border: '1px solid rgba(255,214,0,0.15)', boxShadow: '0 0 16px rgba(255,214,0,0.05)' }}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          {/* Gold star avatar */}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,214,0,0.1)', border: '1px solid rgba(255,214,0,0.3)' }}>
            <Star size={16} fill="#ffd600" style={{ color: '#ffd600' }} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-black leading-tight" style={{ color: '#e0f2fe' }}>{sighting.celebrity}</p>
            {sighting.description && (
              <p className="text-xs mt-0.5 leading-snug" style={{ color: 'rgba(224,242,254,0.5)' }}>
                {expanded ? sighting.description : sighting.description.slice(0, 60) + (sighting.description.length > 60 ? '…' : '')}
              </p>
            )}
          </div>

          {/* Confidence pill */}
          <div className="text-center shrink-0">
            <p className="text-base font-black" style={{ color: confidence > 70 ? '#00ff88' : confidence > 40 ? '#ffd600' : '#ff006e' }}>
              {confidence}%
            </p>
            <p className="text-[8px] font-bold tracking-widest" style={{ color: 'rgba(224,242,254,0.3)' }}>CONF.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-3">
            {/* Votes */}
            <button
              onClick={() => onVote(sighting.id, 'up')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-200"
              style={{
                background: sighting.userVote === 'up' ? 'rgba(0,255,136,0.12)' : 'rgba(var(--accent-rgb),0.04)',
                border: sighting.userVote === 'up' ? '1px solid rgba(0,255,136,0.4)' : '1px solid rgba(var(--accent-rgb),0.1)',
                color: sighting.userVote === 'up' ? '#00ff88' : 'rgba(224,242,254,0.5)',
              }}
            >
              <ThumbsUp size={10} /> {sighting.upvotes}
            </button>
            <button
              onClick={() => onVote(sighting.id, 'down')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-200"
              style={{
                background: sighting.userVote === 'down' ? 'rgba(255,0,110,0.12)' : 'rgba(var(--accent-rgb),0.04)',
                border: sighting.userVote === 'down' ? '1px solid rgba(255,0,110,0.4)' : '1px solid rgba(var(--accent-rgb),0.1)',
                color: sighting.userVote === 'down' ? '#ff006e' : 'rgba(224,242,254,0.5)',
              }}
            >
              <ThumbsDown size={10} /> {sighting.downvotes}
            </button>
          </div>

          <div className="flex items-center gap-3 text-[9px] font-bold" style={{ color: 'rgba(255,214,0,0.45)' }}>
            <span className="flex items-center gap-1"><Clock size={9} /> {timeLeft(sighting.expiresAt)}</span>
            <span>{timeAgo(sighting.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RadarPage() {
  const { dbUser } = useAuth()
  // Start empty to avoid SSR/client hydration mismatch; populate on mount
  const [sightings, setSightings] = useState<Sighting[]>([])
  const [sightingsLoading, setSightingsLoading] = useState(true)
  const [showReport, setShowReport] = useState(false)
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)

  // Capture GPS on mount for sighting placement
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude) },
      () => {},
      { timeout: 8000 },
    )
  }, [])

  useEffect(() => {
    if (DEV_MODE) {
      setSightings(makeMockSightings())
      setSightingsLoading(false)
      return
    }
    // Production: fetch real sightings from API
    async function loadSightings() {
      setSightingsLoading(true)
      try {
        const res = await api.get<{ data: Sighting[] }>('/sightings')
        setSightings(res?.data ?? [])
      } catch {
        setSightings([])
      } finally {
        setSightingsLoading(false)
      }
    }
    loadSightings()
  }, [])
  const [showList, setShowList] = useState(true)
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)

  const filtered = sightings.filter((s) =>
    !search || s.celebrity.toLowerCase().includes(search.toLowerCase())
  )

  function handleVote(id: string, dir: 'up' | 'down') {
    setSightings((prev) => prev.map((s) => {
      if (s.id !== id) return s
      const wasUp = s.userVote === 'up'
      const wasDown = s.userVote === 'down'
      if (dir === 'up') return { ...s, upvotes: wasUp ? s.upvotes - 1 : s.upvotes + 1, downvotes: wasDown ? s.downvotes - 1 : s.downvotes, userVote: wasUp ? null : 'up' }
      return { ...s, downvotes: wasDown ? s.downvotes - 1 : s.downvotes + 1, upvotes: wasUp ? s.upvotes - 1 : s.upvotes, userVote: wasDown ? null : 'down' }
    }))
  }

  function handleNewSighting(s: Sighting) {
    setSightings((prev) => [s, ...prev])
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 3.5rem)', overflow: 'hidden', background: '#04040d' }}>
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 py-3 flex items-center justify-between"
        style={{ background: 'rgba(4,4,13,0.95)', borderBottom: '1px solid rgba(255,214,0,0.1)', backdropFilter: 'blur(12px)' }}>
        <div>
          <h1 className="text-sm font-black tracking-[0.2em]"
            style={{ color: '#ffd600', textShadow: '0 0 16px rgba(255,214,0,0.5)' }}>
            ★ RADAR
          </h1>
          <p className="text-[9px] font-bold tracking-[0.15em]" style={{ color: 'rgba(255,214,0,0.4)' }}>
            {filtered.length} ACTIVE SIGHTINGS
          </p>
        </div>
        <button
          onClick={() => setShowReport((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl font-black text-xs transition-all duration-200"
          style={{
            background: showReport ? 'rgba(255,214,0,0.15)' : 'rgba(255,214,0,0.08)',
            border: showReport ? '1px solid rgba(255,214,0,0.5)' : '1px solid rgba(255,214,0,0.2)',
            color: '#ffd600',
            boxShadow: showReport ? '0 0 20px rgba(255,214,0,0.2)' : 'none',
            letterSpacing: '0.1em',
          }}
        >
          <MapPin size={13} />
          REPORT
        </button>
      </div>

      {/* ── Report form (slide in) ── */}
      {showReport && (
        <div className="flex-shrink-0 px-4 pt-3">
          <ReportForm onClose={() => setShowReport(false)} onSubmit={handleNewSighting} userLat={userLat} userLng={userLng} />
        </div>
      )}

      {/* ── Map ── */}
      <div className="flex-shrink-0" style={{ height: showList ? 220 : 'calc(100% - 60px)', transition: 'height 0.3s ease' }}>
        <RadarMap sightings={filtered} />
      </div>

      {/* ── Toggle bar ── */}
      <button
        onClick={() => setShowList((v) => !v)}
        className="flex-shrink-0 flex items-center justify-center gap-2 py-2 text-[10px] font-bold tracking-widest transition-all duration-200"
        style={{ background: 'rgba(7,7,26,0.9)', borderTop: '1px solid rgba(255,214,0,0.1)', color: 'rgba(255,214,0,0.5)' }}
      >
        {showList ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        {showList ? 'HIDE LIST' : 'SHOW LIST'}
        {showList ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>

      {/* ── Sightings list ── */}
      {showList && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {/* Search */}
          <div className="relative mb-3">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,214,0,0.4)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search sightings..."
              className="w-full pl-8 pr-3 py-2 rounded-lg text-xs font-medium focus:outline-none transition-all duration-200"
              style={{
                background: 'rgba(255,214,0,0.04)',
                border: searchFocused ? '1px solid rgba(255,214,0,0.4)' : '1px solid rgba(255,214,0,0.12)',
                color: '#e0f2fe',
              }}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-3xl">⭐</p>
              <p className="text-sm font-bold tracking-widest" style={{ color: 'rgba(255,214,0,0.5)' }}>NO SIGHTINGS</p>
              <p className="text-xs text-center" style={{ color: 'rgba(74,96,128,0.6)' }}>No sightings reported yet — be the first!</p>
            </div>
          ) : (
            filtered.map((s) => (
              <SightingCard key={s.id} sighting={s} onVote={handleVote} />
            ))
          )}
        </div>
      )}
    </div>
  )
}
