'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Map, SlidersHorizontal, Calendar, MapPin, Users, Wine, Star, Heart, Lock, Search, X } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEvents, DEMO_EVENTS, GLASGOW_VENUES } from '@/hooks/useEvents'
import type { DemoVenue } from '@/hooks/useEvents'
import { EventFilters } from '@/components/events/EventFilters'
import type { EventType, Event } from '@partyradar/shared'
import { ALCOHOL_POLICY_LABELS, AGE_RESTRICTION_LABELS } from '@partyradar/shared'

const EventMap = dynamic(() => import('@/components/events/EventMap').then((m) => m.EventMap), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center" style={{ background: '#07071a' }}>
      <span style={{ color: 'rgba(0,229,255,0.5)', letterSpacing: '0.15em', fontSize: 12 }}>LOADING MAP...</span>
    </div>
  ),
})

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const TYPE_COLORS: Record<string, string> = {
  HOME_PARTY: '#ff006e',
  CLUB_NIGHT: '#00e5ff',
  CONCERT: '#3d5afe',
}
const TYPE_LABELS: Record<string, string> = {
  HOME_PARTY: 'HOME PARTY',
  CLUB_NIGHT: 'CLUB NIGHT',
  CONCERT: 'CONCERT',
}

type SlideDir = 'next' | 'prev' | null

// ── Full-screen sequential event card ────────────────────────────────────────
function EventStage({ event, dir }: { event: Event; dir: SlideDir }) {
  const color = TYPE_COLORS[event.type] ?? '#00e5ff'
  const isFree = event.price === 0
  const [interested, setInterested] = useState(false)
  const [requested, setRequested] = useState(false)

  return (
    <div
      className={dir === 'next' ? 'animate-slide-next' : dir === 'prev' ? 'animate-slide-prev' : ''}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {/* Cover image / colour header */}
      <div className="relative flex-shrink-0" style={{ height: 220 }}>
        {event.coverImageUrl ? (
          <img
            src={event.coverImageUrl}
            alt={event.name}
            className="w-full h-full object-cover"
            style={{ filter: 'brightness(0.55) saturate(1.2)' }}
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `radial-gradient(ellipse at 30% 40%, ${color}22 0%, #07071a 70%)`,
            }}
          />
        )}
        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(4,4,13,0.1) 0%, rgba(4,4,13,0.95) 100%)' }}
        />

        {/* Type badge */}
        <div className="absolute top-4 left-4">
          <span
            className="text-[10px] font-bold px-3 py-1 rounded"
            style={{
              color,
              border: `1px solid ${color}60`,
              background: `${color}15`,
              boxShadow: `0 0 10px ${color}30`,
              letterSpacing: '0.15em',
            }}
          >
            {TYPE_LABELS[event.type]}
          </span>
          {event.isFeatured && (
            <span
              className="ml-2 text-[10px] font-bold px-3 py-1 rounded"
              style={{
                color: '#ffd600',
                border: '1px solid rgba(255,214,0,0.4)',
                background: 'rgba(255,214,0,0.1)',
                letterSpacing: '0.12em',
              }}
            >
              ★ FEATURED
            </span>
          )}
        </div>

        {event.isInviteOnly && (
          <div className="absolute top-4 right-4">
            <span
              className="text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1"
              style={{
                color: 'rgba(224,242,254,0.5)',
                border: '1px solid rgba(224,242,254,0.15)',
                background: 'rgba(4,4,13,0.6)',
                letterSpacing: '0.1em',
              }}
            >
              <Lock size={9} /> INVITE ONLY
            </span>
          </div>
        )}

        {/* Title area at bottom of image */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-3">
          <h2
            className="text-2xl font-bold leading-tight"
            style={{ color: '#e0f2fe', textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}
          >
            {event.name}
          </h2>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Host row */}
        <div className="flex items-center gap-3">
          {event.host.photoUrl ? (
            <img
              src={event.host.photoUrl}
              alt=""
              className="w-8 h-8 rounded object-cover"
              style={{ border: `1px solid ${color}40`, boxShadow: `0 0 8px ${color}30` }}
            />
          ) : (
            <div
              className="w-8 h-8 rounded flex items-center justify-center text-sm font-bold"
              style={{ background: `${color}18`, border: `1px solid ${color}40`, color }}
            >
              {event.host.displayName[0]}
            </div>
          )}
          <div>
            <p className="text-xs font-bold" style={{ color: 'rgba(224,242,254,0.9)', letterSpacing: '0.05em' }}>
              {event.host.displayName}
            </p>
            {event.hostRating && (
              <p className="text-[10px] flex items-center gap-1" style={{ color: '#ffd600' }}>
                <Star size={9} fill="currentColor" /> {event.hostRating.toFixed(1)} rating
              </p>
            )}
          </div>
          <div className="ml-auto text-right">
            <p
              className="text-xl font-bold"
              style={{ color: isFree ? '#00ff88' : '#e0f2fe', textShadow: isFree ? '0 0 12px rgba(0,255,136,0.6)' : 'none' }}
            >
              {isFree ? 'FREE' : `£${event.price.toFixed(2)}`}
            </p>
          </div>
        </div>

        {/* Horizontal divider */}
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.2), transparent)' }} />

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-lg p-3 space-y-1"
            style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.1)' }}
          >
            <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.5)' }}>DATE &amp; TIME</p>
            <p className="text-xs font-medium" style={{ color: '#e0f2fe' }}>{formatDate(event.startsAt)}</p>
          </div>
          <div
            className="rounded-lg p-3 space-y-1"
            style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.1)' }}
          >
            <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.5)' }}>LOCATION</p>
            <p className="text-xs font-medium truncate" style={{ color: '#e0f2fe' }}>{event.neighbourhood}</p>
          </div>
          <div
            className="rounded-lg p-3 space-y-1"
            style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.1)' }}
          >
            <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.5)' }}>CAPACITY</p>
            <p className="text-xs font-medium" style={{ color: '#e0f2fe' }}>
              {event.guestCount ?? 0} / {event.capacity}
            </p>
          </div>
          <div
            className="rounded-lg p-3 space-y-1"
            style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.1)' }}
          >
            <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.5)' }}>AGE POLICY</p>
            <p className="text-xs font-medium" style={{ color: '#e0f2fe' }}>
              {AGE_RESTRICTION_LABELS[event.ageRestriction] ?? 'All Ages'}
            </p>
          </div>
        </div>

        {/* Vibe tags */}
        {event.vibeTags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {event.vibeTags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                style={{
                  color: 'rgba(0,229,255,0.7)',
                  border: '1px solid rgba(0,229,255,0.2)',
                  background: 'rgba(0,229,255,0.05)',
                  letterSpacing: '0.08em',
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Gender ratio */}
        {event.genderRatio && event.genderRatio.total > 0 && (() => {
          const { male, female, nonBinary, total } = event.genderRatio!
          const malePct = Math.round((male   / total) * 100)
          const femPct  = Math.round((female / total) * 100)
          const nbPct   = Math.max(0, 100 - malePct - femPct)
          return (
            <div className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.1)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.5)' }}>CROWD MIX</p>
                <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>{total} attending</span>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden gap-px mb-1.5">
                {malePct > 0 && <div style={{ width: `${malePct}%`, background: '#3b82f6' }} />}
                {femPct  > 0 && <div style={{ width: `${femPct}%`,  background: '#ec4899' }} />}
                {nbPct   > 0 && <div style={{ width: `${nbPct}%`,   background: '#00e5ff' }} />}
              </div>
              <div className="flex gap-3">
                <span className="text-[9px] font-bold" style={{ color: 'rgba(59,130,246,0.7)' }}>♂ {malePct}%</span>
                <span className="text-[9px] font-bold" style={{ color: 'rgba(236,72,153,0.7)' }}>♀ {femPct}%</span>
                {nbPct > 0 && <span className="text-[9px] font-bold" style={{ color: 'rgba(0,229,255,0.6)' }}>⚧ {nbPct}%</span>}
              </div>
            </div>
          )
        })()}

        {/* Alcohol */}
        {event.alcoholPolicy !== 'NONE' && (
          <p className="text-[11px] flex items-center gap-1.5" style={{ color: 'rgba(224,242,254,0.4)' }}>
            <Wine size={11} /> {ALCOHOL_POLICY_LABELS[event.alcoholPolicy]}
          </p>
        )}

        {/* Party signals (home party only) */}
        {event.type === 'HOME_PARTY' && (event as any).partySigns?.length > 0 && (
          <div className="flex gap-2 flex-wrap items-center">
            {(event as any).partySigns.slice(0, 8).map((code: string) => {
              const SIGNALS: Record<string, string> = { BAR:'🍾', GAMING:'🎮', GAMES:'🎲', FLOOR:'🕺', FIRE:'🔥', KARAOKE:'🎤', FOOD:'🍕', COSTUME:'🎭', LATENIGHT:'🌙', HOTTUB:'♨️', LIVE:'🎸', PONG:'🎯', POOL:'🏊', CHILL:'🌿', FLIRTY:'💋', SNACKS:'🍩' }
              return SIGNALS[code] ? <span key={code} className="text-lg">{SIGNALS[code]}</span> : null
            })}
          </div>
        )}

        {/* Lineup (club/concert) */}
        {(event as any).lineup && (
          <p className="text-[11px] font-medium truncate" style={{ color: 'rgba(0,229,255,0.5)' }}>
            🎧 {(event as any).lineup}
          </p>
        )}
      </div>

      {/* CTA */}
      <div className="px-5 pb-6 pt-3 flex-shrink-0 space-y-2">
        {/* Primary action */}
        <Link
          href={`/events/${event.id}`}
          className="block w-full text-center font-black py-3 rounded-xl text-sm transition-all duration-200"
          style={{
            background: `linear-gradient(135deg, ${color}20, rgba(61,90,254,0.15))`,
            border: `1px solid ${color}50`,
            color,
            boxShadow: `0 0 20px ${color}25`,
            letterSpacing: '0.1em',
          }}
        >
          {event.isInviteOnly ? '🔒 REQUEST TO JOIN' : isFree ? '⚡ RSVP FREE' : `🎟 BUY TICKET — £${event.price.toFixed(2)}`}
        </Link>

        {/* Secondary actions */}
        <div className="flex gap-2">
          <button
            onClick={() => setInterested((v) => !v)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200"
            style={{
              background: interested ? 'rgba(255,214,0,0.1)' : 'rgba(0,229,255,0.03)',
              border: interested ? '1px solid rgba(255,214,0,0.4)' : '1px solid rgba(0,229,255,0.12)',
              color: interested ? '#ffd600' : 'rgba(74,96,128,0.7)',
              letterSpacing: '0.08em',
            }}
          >
            <Star size={11} fill={interested ? 'currentColor' : 'none'} />
            {interested ? 'INTERESTED' : 'INTERESTED'}
          </button>
          <Link
            href={`/events/${event.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200"
            style={{
              background: 'rgba(0,229,255,0.03)',
              border: '1px solid rgba(0,229,255,0.12)',
              color: 'rgba(74,96,128,0.7)',
              letterSpacing: '0.08em',
            }}
          >
            VIEW MORE →
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Venue card ────────────────────────────────────────────────────────────────
const VENUE_TYPE_LABELS: Record<string, string> = {
  NIGHTCLUB: 'NIGHTCLUB', BAR: 'BAR', PUB: 'PUB',
  CONCERT_HALL: 'CONCERT HALL', ROOFTOP_BAR: 'ROOFTOP BAR', LOUNGE: 'LOUNGE',
}
const VENUE_TYPE_COLORS: Record<string, string> = {
  NIGHTCLUB: '#00e5ff', BAR: '#a855f7', PUB: '#22c55e',
  CONCERT_HALL: '#3d5afe', ROOFTOP_BAR: '#f59e0b', LOUNGE: '#ec4899',
}

function VenueCard({ venue }: { venue: DemoVenue }) {
  const color = VENUE_TYPE_COLORS[venue.type] ?? '#00e5ff'
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(7,7,26,0.95)', border: `1px solid ${color}25`, boxShadow: `0 0 20px ${color}08` }}
    >
      {/* Top color band */}
      <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${color}60, transparent)` }} />

      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-sm leading-tight truncate" style={{ color: '#e0f2fe', letterSpacing: '0.05em' }}>
              {venue.name}
            </h3>
            <p className="text-[10px] mt-0.5 truncate" style={{ color: 'rgba(224,242,254,0.35)' }}>
              <MapPin size={9} className="inline mr-0.5" />{venue.address}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded"
              style={{ color, border: `1px solid ${color}50`, background: `${color}12`, letterSpacing: '0.12em' }}
            >
              {VENUE_TYPE_LABELS[venue.type]}
            </span>
            <span className="text-[10px] font-bold" style={{ color: '#ffd600' }}>
              ★ {venue.rating.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Vibe tags */}
        <div className="flex gap-1 flex-wrap">
          {venue.vibeTags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="text-[9px] font-bold px-2 py-0.5 rounded-full"
              style={{ color: `${color}bb`, border: `1px solid ${color}25`, background: `${color}0a`, letterSpacing: '0.08em' }}
            >
              #{tag}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Link
            href={`/events/venue-event-${venue.id}`}
            className="flex-1 text-center py-2 rounded-lg text-[10px] font-black"
            style={{ background: `${color}15`, border: `1px solid ${color}40`, color, letterSpacing: '0.1em' }}
          >
            VIEW EVENTS →
          </Link>
          {!venue.isClaimed && (
            <button
              className="flex-1 text-center py-2 rounded-lg text-[10px] font-black"
              style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.35)', color: '#ffd600', letterSpacing: '0.08em' }}
              onClick={() => alert(`Claim flow for ${venue.name} — coming soon!`)}
            >
              CLAIM VENUE ★
            </button>
          )}
          {venue.isClaimed && (
            <span
              className="flex-1 text-center py-2 rounded-lg text-[10px] font-bold"
              style={{ border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88', letterSpacing: '0.08em' }}
            >
              ✓ CLAIMED
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Venues list ───────────────────────────────────────────────────────────────
function VenuesList() {
  const [search, setSearch] = useState('')
  const filtered = search
    ? GLASGOW_VENUES.filter((v) =>
        v.name.toLowerCase().includes(search.toLowerCase()) ||
        v.vibeTags.some((t) => t.toLowerCase().includes(search.toLowerCase())) ||
        v.type.toLowerCase().includes(search.toLowerCase())
      )
    : GLASGOW_VENUES

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search */}
      <div className="flex-shrink-0 px-4 py-2.5" style={{ background: 'rgba(4,4,13,0.8)', borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(0,229,255,0.4)' }} />
          <input
            type="text"
            placeholder="Search venues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg text-xs bg-transparent outline-none"
            style={{ border: '1px solid rgba(0,229,255,0.15)', color: '#e0f2fe' }}
          />
          {search && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
              <X size={12} style={{ color: 'rgba(74,96,128,0.6)' }} />
            </button>
          )}
        </div>
      </div>

      {/* Count */}
      <div className="flex-shrink-0 px-4 py-2" style={{ background: 'rgba(4,4,13,0.6)' }}>
        <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.45)' }}>
          {filtered.length} VENUES · GLASGOW
        </p>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-20">
        {filtered.map((venue) => (
          <VenueCard key={venue.id} venue={venue} />
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span style={{ fontSize: 32 }}>🏢</span>
            <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.4)' }}>NO VENUES FOUND</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Empty / loading placeholders ─────────────────────────────────────────────
function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      {loading ? (
        <>
          <div
            className="w-12 h-12 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }}
          />
          <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.5)' }}>
            SCANNING AREA...
          </p>
        </>
      ) : (
        <>
          <div style={{ fontSize: 40 }}>📡</div>
          <p className="text-sm font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.5)' }}>
            NO EVENTS DETECTED
          </p>
          <p className="text-xs text-center" style={{ color: 'rgba(74,96,128,0.7)', maxWidth: 240 }}>
            Try adjusting filters or check back later
          </p>
        </>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DiscoverPage() {
  const [tab, setTab] = useState<'events' | 'venues'>('events')
  const [index, setIndex] = useState(0)
  const [slideDir, setSlideDir] = useState<SlideDir>(null)
  const [showMap, setShowMap] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<{ type?: EventType; search?: string; showFree?: boolean }>({})
  const [mapBounds, setMapBounds] = useState<{ lat?: number; lng?: number; radius?: number }>({})

  const { events, isLoading } = useEvents({ ...filters, ...mapBounds })

  const [partyAlert, setPartyAlert] = useState<null | typeof DEMO_EVENTS[0]>(null)
  const [alertDismissed, setAlertDismissed] = useState(false)

  // Reset index when events change
  useEffect(() => { setIndex(0) }, [events.length])

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Simulate host push notification after 2s
  useEffect(() => {
    if (alertDismissed) return
    const t = setTimeout(() => {
      setPartyAlert(events[1] ?? events[0] ?? null) // show rooftop house party
    }, 2000)
    return () => clearTimeout(t)
  }, [events, alertDismissed])

  const goNext = useCallback(() => {
    if (index >= events.length - 1) return
    setSlideDir('next')
    setIndex((i) => i + 1)
    setTimeout(() => setSlideDir(null), 400)
  }, [index, events.length])

  const goPrev = useCallback(() => {
    if (index <= 0) return
    setSlideDir('prev')
    setIndex((i) => i - 1)
    setTimeout(() => setSlideDir(null), 400)
  }, [index])

  const event = events[index] ?? null

  return (
    <div
      className="flex flex-col"
      style={{ height: 'calc(100vh - 3.5rem)', overflow: 'hidden' }}
    >
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Host push notification toast ── */}
      {partyAlert && !alertDismissed && (
        <div
          className="fixed top-16 inset-x-0 z-50 flex justify-center px-3 pointer-events-none"
          style={{ animation: 'slideDown 0.4s ease' }}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden pointer-events-auto"
            style={{
              background: 'rgba(7,7,26,0.97)',
              border: '1px solid rgba(255,0,110,0.4)',
              boxShadow: '0 0 40px rgba(255,0,110,0.15), 0 8px 32px rgba(0,0,0,0.8)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div className="h-0.5" style={{ background: 'linear-gradient(90deg, transparent, #ff006e, transparent)' }} />
            <div className="p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-lg animate-bounce"
                  style={{ background: 'rgba(255,0,110,0.12)', border: '1px solid rgba(255,0,110,0.3)' }}>
                  🎉
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black tracking-[0.15em] mb-0.5" style={{ color: '#ff006e' }}>
                    PARTY ALERT · NEARBY
                  </p>
                  <p className="text-sm font-black leading-tight" style={{ color: '#e0f2fe' }}>{partyAlert.name}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.5)' }}>
                    {partyAlert.neighbourhood} · {partyAlert.price === 0 ? 'Free entry' : `£${partyAlert.price}`} · {partyAlert.capacity - (partyAlert.guestCount ?? 0)} spots left
                  </p>
                </div>
                <button onClick={() => setAlertDismissed(true)} style={{ color: 'rgba(74,96,128,0.5)', flexShrink: 0 }}>
                  ✕
                </button>
              </div>
              <div className="flex gap-2">
                <Link href={`/events/${partyAlert.id}`}
                  onClick={() => setAlertDismissed(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black"
                  style={{ background: 'rgba(255,0,110,0.12)', border: '1px solid rgba(255,0,110,0.4)', color: '#ff006e', letterSpacing: '0.1em' }}>
                  ⚡ I'M INTERESTED
                </Link>
                <button
                  onClick={() => setAlertDismissed(true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold"
                  style={{ border: '1px solid rgba(74,96,128,0.2)', color: 'rgba(74,96,128,0.5)', letterSpacing: '0.08em' }}>
                  DISMISS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Header bar ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 gap-3"
        style={{
          background: 'rgba(4,4,13,0.9)',
          borderBottom: '1px solid rgba(0,229,255,0.1)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.1)' }}>
          <button
            onClick={() => setTab('events')}
            className="px-3 py-1 rounded text-[10px] font-black transition-all duration-200"
            style={{
              background: tab === 'events' ? 'rgba(0,229,255,0.15)' : 'transparent',
              color: tab === 'events' ? '#00e5ff' : 'rgba(74,96,128,0.6)',
              letterSpacing: '0.12em',
              boxShadow: tab === 'events' ? '0 0 8px rgba(0,229,255,0.2)' : 'none',
            }}
          >
            EVENTS
          </button>
          <button
            onClick={() => setTab('venues')}
            className="px-3 py-1 rounded text-[10px] font-black transition-all duration-200"
            style={{
              background: tab === 'venues' ? 'rgba(255,214,0,0.12)' : 'transparent',
              color: tab === 'venues' ? '#ffd600' : 'rgba(74,96,128,0.6)',
              letterSpacing: '0.12em',
              boxShadow: tab === 'venues' ? '0 0 8px rgba(255,214,0,0.15)' : 'none',
            }}
          >
            VENUES
          </button>
        </div>

        {/* Counter + controls */}
        <div className="flex items-center gap-2">
          {tab === 'events' && !isLoading && events.length > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ color: 'rgba(0,229,255,0.6)', border: '1px solid rgba(0,229,255,0.15)', background: 'rgba(0,229,255,0.05)', letterSpacing: '0.08em' }}
            >
              {index + 1} / {events.length}
            </span>
          )}
          {tab === 'events' && (
            <>
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="p-1.5 rounded transition-all duration-200"
                style={{
                  border: showFilters ? '1px solid rgba(0,229,255,0.4)' : '1px solid rgba(0,229,255,0.12)',
                  color: showFilters ? '#00e5ff' : 'rgba(74,96,128,0.7)',
                  background: showFilters ? 'rgba(0,229,255,0.08)' : 'transparent',
                }}
              >
                <SlidersHorizontal size={14} />
              </button>
              <button
                onClick={() => setShowMap((v) => !v)}
                className="p-1.5 rounded transition-all duration-200"
                style={{
                  border: showMap ? '1px solid rgba(0,229,255,0.4)' : '1px solid rgba(0,229,255,0.12)',
                  color: showMap ? '#00e5ff' : 'rgba(74,96,128,0.7)',
                  background: showMap ? 'rgba(0,229,255,0.08)' : 'transparent',
                }}
              >
                <Map size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Venues tab ── */}
      {tab === 'venues' && <VenuesList />}

      {/* ── Events tab content ── */}
      {tab === 'events' && <>

      {/* ── Filter panel (collapsible) ── */}
      {showFilters && (
        <div
          className="flex-shrink-0 px-4 py-3 animate-fade-up"
          style={{
            background: 'rgba(7,7,26,0.95)',
            borderBottom: '1px solid rgba(0,229,255,0.1)',
          }}
        >
          <EventFilters filters={filters} onChange={setFilters} />
        </div>
      )}

      {/* ── Progress bar ── */}
      {events.length > 1 && (
        <div className="flex-shrink-0 flex gap-0.5 px-4 py-1.5" style={{ background: 'rgba(4,4,13,0.6)' }}>
          {events.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setSlideDir(i > index ? 'next' : 'prev')
                setIndex(i)
                setTimeout(() => setSlideDir(null), 400)
              }}
              className="flex-1 rounded-full transition-all duration-300"
              style={{
                height: 2,
                background: i === index
                  ? '#00e5ff'
                  : i < index
                  ? 'rgba(0,229,255,0.25)'
                  : 'rgba(0,229,255,0.08)',
                boxShadow: i === index ? '0 0 6px rgba(0,229,255,0.7)' : 'none',
              }}
            />
          ))}
        </div>
      )}

      {/* ── Main content area ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Card column */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {/* Map overlay (slide-over) */}
          {showMap && (
            <div
              className="absolute inset-0 z-10"
              style={{ background: '#07071a', border: '1px solid rgba(0,229,255,0.1)' }}
            >
              <EventMap events={events} onBoundsChange={setMapBounds} />
              <div
                className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] font-bold px-4 py-1.5 rounded-full"
                style={{
                  background: 'rgba(4,4,13,0.85)',
                  border: '1px solid rgba(0,229,255,0.2)',
                  color: 'rgba(0,229,255,0.7)',
                  backdropFilter: 'blur(8px)',
                  letterSpacing: '0.1em',
                }}
              >
                {isLoading ? 'SCANNING...' : `${events.length} EVENTS NEARBY`}
              </div>
            </div>
          )}

          {/* Event card */}
          <div className="flex-1 overflow-hidden">
            {isLoading || events.length === 0 ? (
              <EmptyState loading={isLoading} />
            ) : (
              <EventStage event={event!} dir={slideDir} />
            )}
          </div>

          {/* ── Navigation arrows ── */}
          {events.length > 1 && (
            <div
              className="flex-shrink-0 flex items-center justify-between px-4 py-3"
              style={{
                background: 'rgba(4,4,13,0.85)',
                borderTop: '1px solid rgba(0,229,255,0.08)',
              }}
            >
              <button
                onClick={goPrev}
                disabled={index === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs transition-all duration-200 disabled:opacity-25"
                style={{
                  background: index === 0 ? 'transparent' : 'rgba(0,229,255,0.06)',
                  border: '1px solid rgba(0,229,255,0.2)',
                  color: '#00e5ff',
                  letterSpacing: '0.1em',
                }}
              >
                <ChevronLeft size={14} />
                PREV
              </button>

              {/* Dot indicators */}
              <div className="flex items-center gap-1.5">
                {events.slice(Math.max(0, index - 2), index + 3).map((_, relI) => {
                  const absI = Math.max(0, index - 2) + relI
                  const isActive = absI === index
                  return (
                    <div
                      key={absI}
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: isActive ? 18 : 5,
                        height: 5,
                        background: isActive ? '#00e5ff' : 'rgba(0,229,255,0.2)',
                        boxShadow: isActive ? '0 0 8px rgba(0,229,255,0.7)' : 'none',
                      }}
                    />
                  )
                })}
              </div>

              <button
                onClick={goNext}
                disabled={index === events.length - 1}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs transition-all duration-200 disabled:opacity-25"
                style={{
                  background: index === events.length - 1 ? 'transparent' : 'rgba(0,229,255,0.06)',
                  border: '1px solid rgba(0,229,255,0.2)',
                  color: '#00e5ff',
                  letterSpacing: '0.1em',
                }}
              >
                NEXT
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
      </>}
    </div>
  )
}
