'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Map, SlidersHorizontal, Calendar, MapPin, Users, Star, Lock, Search, X, LayoutList, Layers, ExternalLink, Phone, Globe, Heart, Wine } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEvents, GLASGOW_VENUES } from '@/hooks/useEvents'
import type { DemoVenue } from '@/hooks/useEvents'
import { useVenueDiscover } from '@/hooks/useVenues'
import type { LiveVenue } from '@/hooks/useVenues'
import { EventFilters } from '@/components/events/EventFilters'
import type { EventType, Event } from '@partyradar/shared'
import { AGE_RESTRICTION_LABELS, ALCOHOL_POLICY_LABELS } from '@partyradar/shared'

const EventMap = dynamic(() => import('@/components/events/EventMap').then((m) => m.EventMap), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center" style={{ background: '#07071a' }}>
      <span style={{ color: 'rgba(0,229,255,0.5)', letterSpacing: '0.15em', fontSize: 12 }}>LOADING MAP...</span>
    </div>
  ),
})

const VenuesMiniMap = dynamic(() => import('@/components/venues/VenuesMiniMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full flex items-center justify-center" style={{ height: 200, background: 'rgba(7,7,26,0.95)' }}>
      <span style={{ color: 'rgba(255,214,0,0.4)', letterSpacing: '0.15em', fontSize: 11 }}>LOADING MAP...</span>
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
  PUB_NIGHT: '#f59e0b',
}
const TYPE_LABELS: Record<string, string> = {
  HOME_PARTY: 'HOUSE PARTY',
  CLUB_NIGHT: 'CLUB NIGHT',
  CONCERT: 'CONCERT',
  PUB_NIGHT: 'PUB NIGHT',
}

type SlideDir = 'next' | 'prev' | null

// ── Compact list card for list view ──────────────────────────────────────────
function EventListCard({ event, live }: { event: Event; live?: boolean }) {
  const color = TYPE_COLORS[event.type] ?? '#00e5ff'
  const isFree = event.price === 0

  function timeUntil(dateStr: string) {
    const diff = new Date(dateStr).getTime() - Date.now()
    if (diff <= 0) return 'Now'
    const h = Math.floor(diff / 3600000)
    const d = Math.floor(h / 24)
    if (d > 0) return `in ${d}d`
    if (h > 0) return `in ${h}h`
    const m = Math.floor(diff / 60000)
    return `in ${m}m`
  }

  return (
    <Link href={`/events/${event.id}`}
      className="flex gap-3 p-3 rounded-2xl transition-all"
      style={{ background: 'rgba(7,7,26,0.85)', border: `1px solid ${live ? 'rgba(255,0,110,0.2)' : 'rgba(0,229,255,0.08)'}` }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = live ? 'rgba(255,0,110,0.4)' : 'rgba(0,229,255,0.2)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = live ? 'rgba(255,0,110,0.2)' : 'rgba(0,229,255,0.08)')}>

      {/* Cover / color swatch */}
      <div className="shrink-0 relative" style={{ width: 64, height: 64 }}>
        {event.coverImageUrl ? (
          <img src={event.coverImageUrl} alt="" className="w-full h-full rounded-xl object-cover" />
        ) : (
          <div className="w-full h-full rounded-xl flex items-center justify-center"
            style={{ background: `${color}12`, border: `1px solid ${color}30` }}>
            <Calendar size={22} style={{ color }} />
          </div>
        )}
        {live && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse"
            style={{ background: '#ff006e', boxShadow: '0 0 6px #ff006e', border: '2px solid #04040d' }} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-bold truncate leading-tight" style={{ color: '#e0f2fe' }}>{event.name}</p>
          <span className="shrink-0 text-sm font-bold" style={{ color: isFree ? '#00ff88' : '#e0f2fe' }}>
            {isFree ? 'FREE' : `£${event.price.toFixed(2)}`}
          </span>
        </div>
        <p className="text-[10px] truncate mb-1.5" style={{ color: 'rgba(224,242,254,0.45)' }}>
          <MapPin size={9} className="inline mr-0.5" />{event.neighbourhood ?? event.address}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
            style={{ color, background: `${color}12`, border: `1px solid ${color}30`, letterSpacing: '0.1em' }}>
            {event.type.replace('_', ' ')}
          </span>
          {live ? (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ color: '#ff006e', background: 'rgba(255,0,110,0.1)', border: '1px solid rgba(255,0,110,0.3)' }}>
              ● LIVE
            </span>
          ) : (
            <span className="text-[9px]" style={{ color: 'rgba(0,229,255,0.5)' }}>
              {timeUntil(event.startsAt)}
            </span>
          )}
          {event.vibeTags.slice(0, 2).map(t => (
            <span key={t} className="text-[9px]" style={{ color: 'rgba(0,229,255,0.35)' }}>#{t}</span>
          ))}
        </div>
      </div>
    </Link>
  )
}

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

function VenueCard({ venue }: { venue: DemoVenue | LiveVenue }) {
  const color = VENUE_TYPE_COLORS[venue.type] ?? '#00e5ff'
  const typeLabel = VENUE_TYPE_LABELS[venue.type] ?? venue.type
  const rating = typeof venue.rating === 'number' ? venue.rating : null
  const website = 'website' in venue ? venue.website : null
  const phone = 'phone' in venue ? venue.phone : null
  const photoUrl = 'photoUrl' in venue ? venue.photoUrl : null

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(7,7,26,0.95)', border: `1px solid ${color}25`, boxShadow: `0 0 20px ${color}08` }}
    >
      {/* Cover photo or color band */}
      {photoUrl ? (
        <div className="relative h-24 overflow-hidden">
          <img src={photoUrl} alt={venue.name} className="w-full h-full object-cover" style={{ filter: 'brightness(0.55) saturate(1.2)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(7,7,26,0.95) 100%)' }} />
          <span className="absolute bottom-2 left-3 text-[9px] font-bold px-2 py-0.5 rounded"
            style={{ color, border: `1px solid ${color}50`, background: `rgba(7,7,26,0.75)`, backdropFilter: 'blur(4px)', letterSpacing: '0.12em' }}>
            {typeLabel}
          </span>
          {rating && (
            <span className="absolute bottom-2 right-3 text-[10px] font-bold" style={{ color: '#ffd600' }}>★ {rating.toFixed(1)}</span>
          )}
        </div>
      ) : (
        <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${color}60, transparent)` }} />
      )}

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
          {!photoUrl && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[9px] font-bold px-2 py-0.5 rounded"
                style={{ color, border: `1px solid ${color}50`, background: `${color}12`, letterSpacing: '0.12em' }}>
                {typeLabel}
              </span>
              {rating && <span className="text-[10px] font-bold" style={{ color: '#ffd600' }}>★ {rating.toFixed(1)}</span>}
            </div>
          )}
        </div>

        {/* Vibe tags */}
        {venue.vibeTags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {venue.vibeTags.slice(0, 5).map((tag) => (
              <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{ color: `${color}bb`, border: `1px solid ${color}25`, background: `${color}0a`, letterSpacing: '0.08em' }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Contact links */}
        {(phone || website) && (
          <div className="flex gap-3">
            {phone && (
              <a href={`tel:${phone}`} className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(0,229,255,0.5)' }}>
                <Phone size={9} /> {phone}
              </a>
            )}
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(0,229,255,0.5)' }}>
                <Globe size={9} /> Website <ExternalLink size={8} />
              </a>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Link href={`/venues/${venue.id}`}
            className="flex-1 text-center py-2 rounded-lg text-[10px] font-black"
            style={{ background: `${color}15`, border: `1px solid ${color}40`, color, letterSpacing: '0.1em' }}>
            VIEW EVENTS →
          </Link>
          {!venue.isClaimed ? (
            <button
              className="flex-1 text-center py-2 rounded-lg text-[10px] font-black"
              style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.35)', color: '#ffd600', letterSpacing: '0.08em' }}
              onClick={() => alert(`Claim flow for ${venue.name} — coming soon!`)}>
              CLAIM VENUE ★
            </button>
          ) : (
            <span className="flex-1 text-center py-2 rounded-lg text-[10px] font-bold"
              style={{ border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88', letterSpacing: '0.08em' }}>
              ✓ CLAIMED
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Venues list ───────────────────────────────────────────────────────────────
interface VenuesListProps {
  liveVenues: LiveVenue[]
  venuesLoading: boolean
  venueCity: string | null
  mapCenter: { lat: number; lng: number } | null
  isTracking: boolean
  onCitySearch: (city: string, lat: number, lng: number) => void
  onWiderSearch: () => void
}

function VenuesList({ liveVenues, venuesLoading, venueCity, mapCenter, isTracking, onCitySearch, onWiderSearch }: VenuesListProps) {
  const [venueSearch, setVenueSearch] = useState('')
  const [cityInput, setCityInput] = useState('')
  const [citySearching, setCitySearching] = useState(false)
  const [cityError, setCityError] = useState('')
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null)
  // When GPS is active, city search starts collapsed
  const [showCitySearch, setShowCitySearch] = useState(!isTracking)

  const hasRealVenues = liveVenues.length > 0
  const mapVenues = hasRealVenues ? liveVenues : GLASGOW_VENUES

  const filtered = venueSearch
    ? liveVenues.filter((v) =>
        v.name.toLowerCase().includes(venueSearch.toLowerCase()) ||
        v.vibeTags.some((t) => t.toLowerCase().includes(venueSearch.toLowerCase())) ||
        v.type.toLowerCase().includes(venueSearch.toLowerCase())
      )
    : liveVenues

  async function handleCitySearch(e: React.FormEvent) {
    e.preventDefault()
    const q = cityInput.trim()
    if (!q || citySearching) return
    setCitySearching(true)
    setCityError('')
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } },
      )
      const results = await r.json() as Array<{ lat: string; lon: string; display_name: string }>
      if (!results.length) { setCityError('City not found — try a different name'); return }
      const { lat, lon, display_name } = results[0]!
      const cityName = display_name.split(',')[0]!.trim()
      onCitySearch(cityName, parseFloat(lat), parseFloat(lon))
      setCityInput('')
    } catch {
      setCityError('Search failed — check your connection')
    } finally {
      setCitySearching(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Location header / City explorer bar ── */}
      <div className="flex-shrink-0" style={{ background: 'rgba(4,4,13,0.9)', borderBottom: '1px solid rgba(255,214,0,0.12)' }}>
        {/* GPS active: show detected city prominently */}
        {isTracking && venueCity ? (
          <div className="px-4 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
                <div>
                  <p className="text-[8px] font-black tracking-widest" style={{ color: 'rgba(0,255,136,0.55)' }}>VENUES NEAR YOU</p>
                  <p className="text-sm font-black leading-tight" style={{ color: '#e0f2fe', letterSpacing: '0.06em' }}>{venueCity}</p>
                </div>
              </div>
              <button
                onClick={() => setShowCitySearch((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all"
                style={{
                  background: showCitySearch ? 'rgba(255,214,0,0.12)' : 'rgba(255,214,0,0.06)',
                  border: `1px solid ${showCitySearch ? 'rgba(255,214,0,0.45)' : 'rgba(255,214,0,0.2)'}`,
                  color: showCitySearch ? '#ffd600' : 'rgba(255,214,0,0.55)',
                }}
              >
                🌍 {showCitySearch ? 'HIDE' : 'EXPLORE ELSEWHERE'}
              </button>
            </div>
          </div>
        ) : !isTracking ? (
          /* No GPS: show city search prominently as the primary way to get started */
          <div className="px-4 py-3">
            <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: 'rgba(255,214,0,0.5)' }}>
              🌍 EXPLORE A CITY
            </p>
          </div>
        ) : (
          /* GPS active but city not yet resolved */
          <div className="px-4 py-2.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
            <p className="text-[9px] font-black tracking-widest" style={{ color: 'rgba(0,255,136,0.55)' }}>LOCATING YOU...</p>
          </div>
        )}

        {/* City search form — shown when GPS is off OR user toggled "Explore elsewhere" */}
        {(!isTracking || showCitySearch) && (
          <div className="px-4 pb-3">
            <form onSubmit={handleCitySearch} className="flex gap-2">
              <div className="relative flex-1">
                <MapPin size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,214,0,0.45)' }} />
                <input
                  type="text"
                  placeholder="London, New York, Tokyo..."
                  value={cityInput}
                  onChange={(e) => { setCityInput(e.target.value); setCityError('') }}
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-xs bg-transparent outline-none"
                  style={{ border: '1px solid rgba(255,214,0,0.25)', color: '#e0f2fe' }}
                />
              </div>
              <button
                type="submit"
                disabled={!cityInput.trim() || citySearching}
                className="px-3 py-2 rounded-lg text-[10px] font-black tracking-widest transition-all disabled:opacity-40"
                style={{ background: 'rgba(255,214,0,0.12)', border: '1px solid rgba(255,214,0,0.35)', color: '#ffd600' }}
              >
                {citySearching ? '...' : 'GO'}
              </button>
            </form>
            {cityError && (
              <p className="text-[10px] mt-1.5 font-bold" style={{ color: '#ff006e' }}>{cityError}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Mini venues map (flies to new city) ── */}
      <div className="flex-shrink-0" style={{ height: 180, borderBottom: '1px solid rgba(255,214,0,0.08)' }}>
        <VenuesMiniMap
          venues={mapVenues}
          selectedId={selectedVenueId}
          onSelect={(id) => setSelectedVenueId(id === selectedVenueId ? null : id)}
          flyToCenter={mapCenter}
        />
      </div>

      {/* ── Venue name filter ── */}
      <div className="flex-shrink-0 px-4 py-2" style={{ background: 'rgba(4,4,13,0.8)', borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(0,229,255,0.35)' }} />
          <input
            type="text"
            placeholder="Filter by name, vibe, type..."
            value={venueSearch}
            onChange={(e) => setVenueSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg text-xs bg-transparent outline-none"
            style={{ border: '1px solid rgba(0,229,255,0.12)', color: '#e0f2fe' }}
          />
          {venueSearch && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setVenueSearch('')}>
              <X size={12} style={{ color: 'rgba(74,96,128,0.6)' }} />
            </button>
          )}
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="flex-shrink-0 px-4 py-1.5 flex items-center justify-between" style={{ background: 'rgba(4,4,13,0.6)' }}>
        {venuesLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border border-t-transparent animate-spin" style={{ borderColor: 'rgba(255,214,0,0.3)', borderTopColor: '#ffd600' }} />
            <span className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(255,214,0,0.5)' }}>SCANNING VENUES...</span>
          </div>
        ) : (
          <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.45)' }}>
            {filtered.length} VENUES
            {venueCity ? ` · ${venueCity.toUpperCase()}` : hasRealVenues ? ' · NEARBY' : ' · GLASGOW (DEMO)'}
          </p>
        )}
        {hasRealVenues && !venuesLoading && (
          <button
            onClick={onWiderSearch}
            className="text-[9px] font-black tracking-widest px-2 py-1 rounded transition-all"
            style={{ color: 'rgba(0,229,255,0.5)', border: '1px solid rgba(0,229,255,0.15)' }}
          >
            WIDER →
          </button>
        )}
      </div>

      {/* ── Scrollable venue list ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-20">
        {venuesLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(255,214,0,0.1)', borderTopColor: '#ffd600' }} />
            <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(255,214,0,0.4)' }}>SCANNING NEARBY VENUES...</p>
          </div>
        )}
        {!venuesLoading && filtered.map((venue) => (
          <VenueCard key={venue.id} venue={venue} />
        ))}
        {!venuesLoading && !hasRealVenues && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
            <span style={{ fontSize: 36 }}>🌍</span>
            <p className="text-sm font-black tracking-widest" style={{ color: 'rgba(255,214,0,0.6)' }}>EXPLORE VENUES WORLDWIDE</p>
            <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(224,242,254,0.3)', maxWidth: 280 }}>
              {isTracking
                ? 'Scanning for venues near you — this may take a moment.'
                : 'Allow location access to auto-discover venues around you, or type any city above — London, Berlin, Tokyo, New York.'}
            </p>
            {!isTracking && (
              <button
                onClick={onWiderSearch}
                className="mt-1 px-5 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all"
                style={{ background: 'rgba(255,214,0,0.1)', border: '1px solid rgba(255,214,0,0.35)', color: '#ffd600' }}
              >
                📍 USE MY LOCATION
              </button>
            )}
          </div>
        )}
        {!venuesLoading && hasRealVenues && filtered.length === 0 && (
          <div className="py-10 text-center text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>
            No venues match "{venueSearch}"
          </div>
        )}
      </div>
    </div>
  )
}

// ── Empty / loading placeholders ─────────────────────────────────────────────
function EmptyState({ loading, onRetry }: { loading: boolean; onRetry?: () => void }) {
  const [retrying, setRetrying] = useState(false)

  const handleRetry = async () => {
    if (!onRetry || retrying) return
    setRetrying(true)
    try { await onRetry() } catch {} finally { setRetrying(false) }
  }

  const showSpinner = loading || retrying

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      {showSpinner ? (
        <>
          <div
            className="w-12 h-12 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }}
          />
          <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.5)' }}>
            {retrying ? 'RETRYING...' : 'FINDING EVENTS NEAR YOU...'}
          </p>
        </>
      ) : (
        <>
          <div style={{ fontSize: 40 }}>📡</div>
          <p className="text-sm font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.5)' }}>
            NO EVENTS NEAR YOU YET
          </p>
          <p className="text-xs text-center" style={{ color: 'rgba(74,96,128,0.7)', maxWidth: 260 }}>
            PartyRadar is growing — no events have been listed in your area yet. Be the first to create one, or try searching a different city.
          </p>
          {onRetry && (
            <button onClick={handleRetry}
              className="mt-2 px-5 py-2 rounded-xl text-xs font-black tracking-widest transition-all"
              style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', color: '#00e5ff' }}>
              RETRY
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DiscoverPage() {
  const [tab, setTab] = useState<'events' | 'venues'>('events')
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list')
  const [now, setNow] = useState(() => Date.now())
  const [index, setIndex] = useState(0)
  const [slideDir, setSlideDir] = useState<SlideDir>(null)
  const [showMap, setShowMap] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<{ type?: EventType; search?: string; showFree?: boolean; tonight?: boolean }>({})
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [geoResolved, setGeoResolved] = useState(false)
  const [isTracking, setIsTracking] = useState(false)   // true when watchPosition is active

  // ── Venue discovery state (lifted here so it survives tab switches) ──────────
  const { venues: liveVenues, loading: venuesLoading, source: venueSource, discover } = useVenueDiscover()
  const [venueCity, setVenueCity] = useState<string | null>(null)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null)

  // Track the last position we fetched for, to avoid re-fetching on tiny GPS jitter
  const lastFetchedPos = useRef<{ lat: number; lng: number } | null>(null)

  // Haversine distance in km between two coords
  function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  // watchPosition — continuously tracks; re-fetches events + venues when moved >500 m
  useEffect(() => {
    if (!navigator.geolocation) { setGeoResolved(true); return }

    const fallback = setTimeout(() => setGeoResolved(true), 8500)

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        clearTimeout(fallback)
        setIsTracking(true)

        const last = lastFetchedPos.current
        const moved = last ? haversineKm(last.lat, last.lng, lat, lng) : Infinity

        // Only re-fetch when first lock OR moved more than 500 m
        if (moved > 0.5) {
          lastFetchedPos.current = { lat, lng }
          setUserLocation({ lat, lng })
          setMapCenter({ lat, lng })
          discover(lat, lng, 15000)

          // Reverse-geocode for display label (throttled by the moved>500m guard)
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
            .then((r) => r.json())
            .then((d) => setVenueCity(d?.address?.city || d?.address?.town || d?.address?.county || null))
            .catch(() => {})
        }
      },
      () => { clearTimeout(fallback); setGeoResolved(true); setIsTracking(false) },
      {
        timeout: 10000,
        maximumAge: 30000,      // accept a cached fix up to 30 s old between updates
        enableHighAccuracy: false, // battery-efficient
      },
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
      clearTimeout(fallback)
    }
  }, [discover])

  // City search from the Venues tab search bar — also refreshes events for that location
  function handleCitySearch(cityName: string, lat: number, lng: number) {
    setVenueCity(cityName)
    setMapCenter({ lat, lng })
    discover(lat, lng, 15000)
    // Update userLocation so useEvents re-fetches for this city
    setUserLocation({ lat, lng })
    // Allow auto-retry to fire again for the new city
    autoRetried.current = false
    setSyncing(false)
  }

  // "Use my location" / "Wider area"
  function handleVenueWiderSearch() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords
          lastFetchedPos.current = { lat, lng }
          discover(lat, lng, 25000)
          setMapCenter({ lat, lng })
        },
        () => {},
        { timeout: 8000 },
      )
    }
  }

  const { events, isLoading, mutate, forceRetry } = useEvents({
    ...filters,
    ...(userLocation ? { lat: userLocation.lat, lng: userLocation.lng, radius: 50 } : {}),
    limit: 100,
  })

  // Clear the loading guard once we have a location fix and the first event fetch completes
  useEffect(() => {
    if (userLocation && !isLoading) setGeoResolved(true)
    // Also clear if no location (denied) and events fetch finished
    if (!userLocation && !isLoading) setGeoResolved(true)
  }, [userLocation, isLoading])

  // Auto-retry once when 0 events returned with a location — the first load triggers
  // the background sync; 4 s later events will be in the DB and a re-fetch will find them.
  const autoRetried = useRef(false)
  const [syncing, setSyncing] = useState(false)
  useEffect(() => {
    if (autoRetried.current) return
    if (isLoading || !geoResolved || !userLocation || events.length > 0) return
    autoRetried.current = true
    setSyncing(true)
    const t = setTimeout(async () => {
      await forceRetry().catch(() => {})
      setSyncing(false)
    }, 4000)
    return () => clearTimeout(t)
  }, [isLoading, geoResolved, userLocation, events.length, forceRetry])

  // locationLoading: spinner until geo is settled and we have event data
  const locationLoading = !geoResolved || (isLoading && events.length === 0)

  const [partyAlert, setPartyAlert] = useState<null | Event>(null)
  const [alertDismissed, setAlertDismissed] = useState(false)

  // Reset index when events change
  useEffect(() => { setIndex(0) }, [events.length])

  // Tick every 60s so LIVE/UPCOMING sections re-classify without page reload
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

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
        {/* Tab switcher + live tracking badge */}
        <div className="flex items-center gap-2">
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
          {/* Live location tracking badge */}
          {isTracking && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg"
              style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
              <span className="text-[9px] font-black tracking-widest" style={{ color: '#00ff88' }}>LIVE</span>
            </div>
          )}
        </div>

        {/* Counter + controls */}
        <div className="flex items-center gap-2">
          {tab === 'events' && !isLoading && !locationLoading && events.length > 0 && (
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
                onClick={() => setViewMode(v => v === 'list' ? 'card' : 'list')}
                className="p-1.5 rounded transition-all duration-200"
                title={viewMode === 'list' ? 'Card view' : 'List view'}
                style={{
                  border: '1px solid rgba(0,229,255,0.12)',
                  color: 'rgba(0,229,255,0.7)',
                  background: 'transparent',
                }}
              >
                {viewMode === 'list' ? <Layers size={14} /> : <LayoutList size={14} />}
              </button>
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="p-1.5 rounded transition-all duration-200 relative"
                style={{
                  border: showFilters ? '1px solid rgba(0,229,255,0.4)' : '1px solid rgba(0,229,255,0.12)',
                  color: showFilters ? '#00e5ff' : 'rgba(74,96,128,0.7)',
                  background: showFilters ? 'rgba(0,229,255,0.08)' : 'transparent',
                }}
              >
                <SlidersHorizontal size={14} />
                {(filters.type || filters.showFree || filters.tonight || filters.search) && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: '#00e5ff', boxShadow: '0 0 6px #00e5ff' }} />
                )}
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

      {/* ── Venues tab — always mounted, hidden when not active to preserve discovery state ── */}
      <div style={{ display: tab === 'venues' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
        <VenuesList
          liveVenues={liveVenues}
          venuesLoading={venuesLoading}
          venueCity={venueCity}
          mapCenter={mapCenter}
          isTracking={isTracking}
          onCitySearch={handleCitySearch}
          onWiderSearch={handleVenueWiderSearch}
        />
      </div>

      {/* ── Events tab content ── */}
      {tab === 'events' && <>

      {/* ── Event type filter pills (always visible) ── */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-4 py-2 overflow-x-auto no-scrollbar"
        style={{ background: 'rgba(4,4,13,0.85)', borderBottom: '1px solid rgba(0,229,255,0.08)' }}
      >
        {([undefined, 'HOME_PARTY', 'CLUB_NIGHT', 'CONCERT', 'PUB_NIGHT'] as (EventType | undefined)[]).map((type) => {
          const isActive = filters.type === type
          const label = type ? TYPE_LABELS[type] : 'ALL'
          const color = type ? TYPE_COLORS[type] : '#00e5ff'
          return (
            <button
              key={type ?? 'all'}
              onClick={() => setFilters(f => ({ ...f, type }))}
              className="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black transition-all duration-200"
              style={{
                background: isActive ? `${color}18` : 'transparent',
                border: `1px solid ${isActive ? `${color}60` : 'rgba(0,229,255,0.1)'}`,
                color: isActive ? color : 'rgba(74,96,128,0.6)',
                boxShadow: isActive ? `0 0 10px ${color}20` : 'none',
                letterSpacing: '0.12em',
              }}
            >
              {label}
            </button>
          )
        })}
        <button
          onClick={() => setFilters(f => ({ ...f, tonight: !f.tonight }))}
          className="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black transition-all duration-200"
          style={{
            background: filters.tonight ? 'rgba(255,214,0,0.12)' : 'transparent',
            border: `1px solid ${filters.tonight ? 'rgba(255,214,0,0.5)' : 'rgba(0,229,255,0.1)'}`,
            color: filters.tonight ? '#ffd600' : 'rgba(74,96,128,0.6)',
            letterSpacing: '0.12em',
          }}
        >
          🌙 TONIGHT
        </button>
        <button
          onClick={() => setFilters(f => ({ ...f, showFree: !f.showFree }))}
          className="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black transition-all duration-200"
          style={{
            background: filters.showFree ? 'rgba(0,255,136,0.1)' : 'transparent',
            border: `1px solid ${filters.showFree ? 'rgba(0,255,136,0.4)' : 'rgba(0,229,255,0.1)'}`,
            color: filters.showFree ? '#00ff88' : 'rgba(74,96,128,0.6)',
            letterSpacing: '0.12em',
          }}
        >
          FREE
        </button>
      </div>

      {/* ── Filter panel (collapsible — search + advanced) ── */}
      {showFilters && (
        <div
          className="flex-shrink-0 px-4 py-3 animate-fade-up"
          style={{ background: 'rgba(7,7,26,0.95)', borderBottom: '1px solid rgba(0,229,255,0.1)' }}
        >
          <EventFilters filters={filters} onChange={setFilters} />
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {viewMode === 'list' && (
        <div className="flex-1 overflow-y-auto pb-20">
          {/* Map overlay */}
          {showMap && (
            <div className="relative" style={{ height: 220, borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
              <EventMap events={events} centerLat={userLocation?.lat} centerLng={userLocation?.lng} />
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] font-bold px-4 py-1.5 rounded-full"
                style={{ background: 'rgba(4,4,13,0.85)', border: '1px solid rgba(0,229,255,0.2)', color: 'rgba(0,229,255,0.7)', backdropFilter: 'blur(8px)', letterSpacing: '0.1em' }}>
                {(isLoading || locationLoading) ? 'SCANNING...' : `${events.length} EVENTS`}
              </div>
            </div>
          )}

          {(isLoading || locationLoading) ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-10 h-10 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
              <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.5)' }}>SCANNING AREA...</p>
            </div>
          ) : events.length === 0 ? (
            <EmptyState loading={syncing} onRetry={forceRetry} />
          ) : (() => {
            const liveEvents = events.filter(e => {
              const start = new Date(e.startsAt).getTime()
              const end = e.endsAt ? new Date(e.endsAt).getTime() : start + 6 * 3600000
              return start <= now && now <= end
            })
            const upcomingEvents = events.filter(e => new Date(e.startsAt).getTime() > now)

            return (
              <div className="px-4 py-4 space-y-6">
                {/* LIVE NOW */}
                {liveEvents.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#ff006e', boxShadow: '0 0 8px #ff006e' }} />
                      <span className="text-[11px] font-black tracking-widest" style={{ color: '#ff006e' }}>LIVE NOW</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: 'rgba(255,0,110,0.1)', border: '1px solid rgba(255,0,110,0.3)', color: '#ff006e' }}>
                        {liveEvents.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {liveEvents.map(e => <EventListCard key={e.id} event={e} live />)}
                    </div>
                  </div>
                )}

                {/* UPCOMING */}
                {upcomingEvents.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar size={12} style={{ color: '#00e5ff' }} />
                      <span className="text-[11px] font-black tracking-widest" style={{ color: '#00e5ff' }}>UPCOMING</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}>
                        {upcomingEvents.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {upcomingEvents.map(e => <EventListCard key={e.id} event={e} />)}
                    </div>
                  </div>
                )}

                {liveEvents.length === 0 && upcomingEvents.length === 0 && (
                  <EmptyState loading={false} onRetry={forceRetry} />
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── CARD VIEW ── */}
      {viewMode === 'card' && <>

      {/* Progress bar */}
      {events.length > 1 && (
        <div className="flex-shrink-0 flex gap-0.5 px-4 py-1.5" style={{ background: 'rgba(4,4,13,0.6)' }}>
          {events.map((_, i) => (
            <button key={i}
              onClick={() => { setSlideDir(i > index ? 'next' : 'prev'); setIndex(i); setTimeout(() => setSlideDir(null), 400) }}
              className="flex-1 rounded-full transition-all duration-300"
              style={{
                height: 2,
                background: i === index ? '#00e5ff' : i < index ? 'rgba(0,229,255,0.25)' : 'rgba(0,229,255,0.08)',
                boxShadow: i === index ? '0 0 6px rgba(0,229,255,0.7)' : 'none',
              }} />
          ))}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {showMap && (
            <div className="absolute inset-0 z-10" style={{ background: '#07071a', border: '1px solid rgba(0,229,255,0.1)' }}>
              <EventMap events={events} centerLat={userLocation?.lat} centerLng={userLocation?.lng} />
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] font-bold px-4 py-1.5 rounded-full"
                style={{ background: 'rgba(4,4,13,0.85)', border: '1px solid rgba(0,229,255,0.2)', color: 'rgba(0,229,255,0.7)', backdropFilter: 'blur(8px)', letterSpacing: '0.1em' }}>
                {isLoading ? 'SCANNING...' : `${events.length} EVENTS NEARBY`}
              </div>
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            {(isLoading || locationLoading) || events.length === 0 ? <EmptyState loading={isLoading || locationLoading || syncing} onRetry={forceRetry} /> : <EventStage event={event!} dir={slideDir} />}
          </div>
          {events.length > 1 && (
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3"
              style={{ background: 'rgba(4,4,13,0.85)', borderTop: '1px solid rgba(0,229,255,0.08)' }}>
              <button onClick={goPrev} disabled={index === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs transition-all duration-200 disabled:opacity-25"
                style={{ background: index === 0 ? 'transparent' : 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff', letterSpacing: '0.1em' }}>
                <ChevronLeft size={14} /> PREV
              </button>
              <div className="flex items-center gap-1.5">
                {events.slice(Math.max(0, index - 2), index + 3).map((_, relI) => {
                  const absI = Math.max(0, index - 2) + relI
                  return (
                    <div key={absI} className="rounded-full transition-all duration-300"
                      style={{ width: absI === index ? 18 : 5, height: 5, background: absI === index ? '#00e5ff' : 'rgba(0,229,255,0.2)', boxShadow: absI === index ? '0 0 8px rgba(0,229,255,0.7)' : 'none' }} />
                  )
                })}
              </div>
              <button onClick={goNext} disabled={index === events.length - 1}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs transition-all duration-200 disabled:opacity-25"
                style={{ background: index === events.length - 1 ? 'transparent' : 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff', letterSpacing: '0.1em' }}>
                NEXT <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
      </>}
      </>}
    </div>
  )
}
