'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Map, SlidersHorizontal, Calendar, MapPin, Users, Star, Lock, Search, X, LayoutList, Layers, ExternalLink, Phone, Globe, Heart } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEvents, GLASGOW_VENUES } from '@/hooks/useEvents'
import type { DemoVenue } from '@/hooks/useEvents'
import { useVenueDiscover } from '@/hooks/useVenues'
import type { LiveVenue } from '@/hooks/useVenues'
import { EventFilters } from '@/components/events/EventFilters'
import type { EventType, Event } from '@partyradar/shared'
import { AGE_RESTRICTION_LABELS, getTier } from '@partyradar/shared'
import { useAuth } from '@/hooks/useAuth'
import { api, API_URL } from '@/lib/api'
import { silent } from '@/lib/logError'
import DiscoverFeedTab from '@/components/feed/DiscoverFeedTab'
import { formatPrice, detectCurrency } from '@/lib/currency'

// ── Country → currency mapping (for city search) ─────────────────────────────
const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  'United Kingdom': 'GBP', 'England': 'GBP', 'Scotland': 'GBP', 'Wales': 'GBP',
  'Northern Ireland': 'GBP',
  'Ireland': 'EUR', 'Netherlands': 'EUR', 'France': 'EUR', 'Germany': 'EUR',
  'Spain': 'EUR', 'Italy': 'EUR', 'Belgium': 'EUR', 'Portugal': 'EUR',
  'Greece': 'EUR', 'Austria': 'EUR', 'Finland': 'EUR',
  'United States': 'USD',
  'Canada': 'CAD',
  'Australia': 'AUD', 'New Zealand': 'NZD',
  'Japan': 'JPY', 'Singapore': 'SGD', 'Hong Kong': 'HKD',
  'United Arab Emirates': 'AED', 'Switzerland': 'CHF',
  'Sweden': 'SEK', 'Norway': 'NOK', 'Denmark': 'DKK',
  'Poland': 'PLN', 'Mexico': 'MXN', 'Brazil': 'BRL',
  'South Africa': 'ZAR', 'India': 'INR', 'Thailand': 'THB',
}

function currencyFromDisplayName(displayName: string): string {
  const parts = displayName.split(',')
  for (let i = parts.length - 1; i >= 0; i--) {
    const country = parts[i]!.trim()
    if (COUNTRY_CURRENCY_MAP[country]) return COUNTRY_CURRENCY_MAP[country]!
  }
  return detectCurrency()
}

const EventMap = dynamic(() => import('@/components/events/EventMap').then((m) => m.EventMap), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center" style={{ background: '#07071a' }}>
      <span style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.15em', fontSize: 12 }}>LOADING MAP...</span>
    </div>
  ),
})

const VenuesMiniMap = dynamic(() => import('@/components/venues/VenuesMiniMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full" style={{ background: '#07071a' }} />,
})


function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const TYPE_COLORS: Record<string, string> = {
  HOME_PARTY: '#ff006e',
  CLUB_NIGHT: 'var(--accent)',
  CONCERT: '#3d5afe',
  PUB_NIGHT: '#f59e0b',
  BEACH_PARTY: '#06b6d4',
  YACHT_PARTY: '#0ea5e9',
}
const TYPE_LABELS: Record<string, string> = {
  HOME_PARTY: 'HOUSE PARTY',
  CLUB_NIGHT: 'CLUB NIGHT',
  CONCERT: 'CONCERT',
  PUB_NIGHT: 'PUB NIGHT',
  BEACH_PARTY: 'BEACH PARTY',
  YACHT_PARTY: 'YACHT PARTY',
}

type SlideDir = 'next' | 'prev' | null

// ── Locked card shown to FREE users for YACHT_PARTY / BEACH_PARTY events ──────
function LockedEventListCard({ event, color, label }: { event: Event; color: string; label: string }) {
  return (
    <Link href="/pricing"
      className="flex gap-3 p-3 rounded-2xl relative overflow-hidden transition-all"
      style={{ background: 'rgba(7,7,26,0.85)', border: `1px solid ${color}30` }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${color}60`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = `${color}30`)}
    >
      {/* Blurred thumbnail */}
      <div className="shrink-0 relative" style={{ width: 64, height: 64 }}>
        <div className="w-full h-full rounded-xl flex items-center justify-center"
          style={{ background: `${color}12`, border: `1px solid ${color}30` }}>
          <Calendar size={22} style={{ color, opacity: 0.3 }} />
        </div>
      </div>

      {/* Blurred info */}
      <div className="flex-1 min-w-0 select-none" style={{ filter: 'blur(4px)', pointerEvents: 'none' }}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-bold truncate leading-tight" style={{ color: '#e0f2fe' }}>{event.name}</p>
          <span className="shrink-0 text-sm font-bold" style={{ color: '#e0f2fe' }}>£??</span>
        </div>
        <p className="text-[10px] truncate mb-1.5" style={{ color: 'rgba(224,242,254,0.45)' }}>
          <MapPin size={9} className="inline mr-0.5" />Hidden location
        </p>
        <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
          style={{ color, background: `${color}12`, border: `1px solid ${color}30`, letterSpacing: '0.1em' }}>
          {label}
        </span>
      </div>

      {/* Lock badge overlay */}
      <div className="absolute inset-0 flex items-center justify-center rounded-2xl"
        style={{ background: 'rgba(7,7,26,0.55)', backdropFilter: 'blur(2px)' }}>
        <div className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl"
          style={{ background: `${color}12`, border: `1px solid ${color}50` }}>
          <Lock size={13} style={{ color }} />
          <span className="text-[9px] font-black tracking-widest" style={{ color }}>PRO+ TO UNLOCK</span>
        </div>
      </div>
    </Link>
  )
}

// ── Compact list card for list view ──────────────────────────────────────────
function EventListCard({ event, live, userTier, currency }: { event: Event; live?: boolean; userTier?: string; currency?: string }) {
  // Gate YACHT_PARTY and BEACH_PARTY for FREE users
  if (event.type === 'YACHT_PARTY' && !getTier(userTier).canViewYachtParties) {
    return <LockedEventListCard event={event} color="#0ea5e9" label="YACHT PARTY" />
  }
  if (event.type === 'BEACH_PARTY' && !getTier(userTier).canViewBeachParties) {
    return <LockedEventListCard event={event} color="#06b6d4" label="BEACH PARTY" />
  }

  const color = TYPE_COLORS[event.type] ?? 'var(--accent)'
  const isFree = (event.price ?? 0) === 0

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
      style={{ background: 'rgba(7,7,26,0.85)', border: `1px solid ${live ? 'rgba(255,0,110,0.2)' : 'rgba(var(--accent-rgb),0.08)'}` }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = live ? 'rgba(255,0,110,0.4)' : 'rgba(var(--accent-rgb),0.2)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = live ? 'rgba(255,0,110,0.2)' : 'rgba(var(--accent-rgb),0.08)')}>

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
            {isFree ? 'FREE' : formatPrice(event.price ?? 0, currency)}
          </span>
        </div>
        <p className="text-[10px] truncate mb-0.5" style={{ color: 'rgba(224,242,254,0.45)' }}>
          <MapPin size={9} className="inline mr-0.5" />{event.neighbourhood ?? event.address?.split(',')[0]}
        </p>
        {event.address && event.address !== event.neighbourhood && (
          <p className="text-[9px] truncate mb-1" style={{ color: 'rgba(224,242,254,0.25)' }}>
            {event.address}
          </p>
        )}
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
            <span className="text-[9px]" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
              {timeUntil(event.startsAt)}
            </span>
          )}
          {(event.guestCount ?? 0) > 0 && (
            <span className="text-[9px] font-bold" style={{ color: 'rgba(0,255,136,0.6)' }}>
              👥 {event.guestCount} going
            </span>
          )}
          {event.vibeTags?.slice(0, 1).map(t => (
            <span key={t} className="text-[9px]" style={{ color: 'rgba(var(--accent-rgb),0.35)' }}>#{t}</span>
          ))}
        </div>
      </div>
    </Link>
  )
}

// ── Full-screen sequential event card ────────────────────────────────────────
function EventStage({ event, dir, userTier, currency }: { event: Event; dir: SlideDir; userTier?: string; currency?: string }) {
  const color = TYPE_COLORS[event.type] ?? 'var(--accent)'
  const isFree = (event.price ?? 0) === 0
  const [interested, setInterested] = useState(false)
  const [requested, setRequested] = useState(false)
  const [friendsGoing, setFriendsGoing] = useState<{
    count: number
    friends: Array<{ id: string; displayName: string; photoUrl?: string | null; username: string }>
  }>({ count: 0, friends: [] })

  useEffect(() => {
    api.get<{ data: { count: number; friends: Array<{ id: string; displayName: string; photoUrl?: string | null; username: string }> } }>(
      `/events/${event.id}/friends-going`
    )
      .then(r => { if (r?.data) setFriendsGoing(r.data) })
      .catch(silent('discover:friends-going'))
  }, [event.id])

  const isYachtLocked = event.type === 'YACHT_PARTY' && !getTier(userTier).canViewYachtParties
  const isBeachLocked = event.type === 'BEACH_PARTY' && !getTier(userTier).canViewBeachParties
  const isLocked = isYachtLocked || isBeachLocked
  const lockedColor = isYachtLocked ? '#0ea5e9' : '#06b6d4'
  const lockedEmoji = isYachtLocked ? '⛵' : '🏖️'
  const lockedLabel = isYachtLocked ? 'YACHT PARTY' : 'BEACH PARTY'
  const lockedDesc = isYachtLocked
    ? 'Exclusive yacht parties are available to'
    : 'Exclusive beach parties are available to'

  return (
    <div
      className={dir === 'next' ? 'animate-slide-next' : dir === 'prev' ? 'animate-slide-prev' : ''}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}
    >
      {/* Yacht / Beach Party lock overlay for FREE users */}
      {isLocked && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4"
          style={{ background: 'rgba(7,7,26,0.85)', backdropFilter: 'blur(12px)' }}>
          <div className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl text-center"
            style={{ background: `${lockedColor}08`, border: `1px solid ${lockedColor}40`, maxWidth: 280 }}>
            <span style={{ fontSize: 40 }}>{lockedEmoji}</span>
            <div>
              <p className="text-sm font-black tracking-widest mb-1" style={{ color: lockedColor, letterSpacing: '0.12em' }}>
                {lockedLabel}
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(224,242,254,0.55)' }}>
                {lockedDesc} <strong style={{ color: 'var(--accent)' }}>Basic</strong> subscribers and above.
              </p>
            </div>
            <Link
              href="/pricing"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all"
              style={{ background: `${lockedColor}18`, border: `1px solid ${lockedColor}60`, color: lockedColor }}
            >
              <Lock size={11} /> UPGRADE TO BASIC — £4.99/mo
            </Link>
          </div>
        </div>
      )}

      {/* Cover image / colour header */}
      <div className="relative flex-shrink-0" style={{ height: 220, filter: isLocked ? 'blur(6px)' : 'none' }}>
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
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ filter: isLocked ? 'blur(6px)' : 'none', pointerEvents: isLocked ? 'none' : undefined }}>
        {/* Host row */}
        <div className="flex items-center gap-3">
          {event.host?.photoUrl ? (
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
              {event.host?.displayName?.[0] ?? '?'}
            </div>
          )}
          <div>
            <p className="text-xs font-bold" style={{ color: 'rgba(224,242,254,0.9)', letterSpacing: '0.05em' }}>
              {event.host?.displayName ?? 'Host'}
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
              {isFree ? 'FREE' : formatPrice(event.price ?? 0, currency)}
            </p>
          </div>
        </div>

        {/* Horizontal divider */}
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.2), transparent)' }} />

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-lg p-3 space-y-1"
            style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
          >
            <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>DATE &amp; TIME</p>
            <p className="text-xs font-medium" style={{ color: '#e0f2fe' }}>{formatDate(event.startsAt)}</p>
          </div>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(event.address ?? event.neighbourhood ?? '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-3 space-y-1 block"
            style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.1)', textDecoration: 'none' }}
          >
            <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>📍 LOCATION</p>
            <p className="text-xs font-medium leading-snug" style={{ color: '#e0f2fe' }}>
              {event.neighbourhood ?? event.address?.split(',')[0]}
            </p>
            {event.address && (
              <p className="text-[9px] leading-snug" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>
                {event.address}
              </p>
            )}
          </a>
          <div
            className="rounded-lg p-3 space-y-1"
            style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
          >
            <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>FRIENDS GOING</p>
            <div className="flex items-center gap-1.5">
              {friendsGoing.friends.slice(0, 3).map(f => (
                f.photoUrl
                  ? <img key={f.id} src={f.photoUrl} alt={f.displayName} className="w-5 h-5 rounded-full object-cover shrink-0" style={{ border: '1px solid rgba(var(--accent-rgb),0.2)' }} />
                  : <div key={f.id} className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black shrink-0"
                      style={{ background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)' }}>
                      {f.displayName[0]?.toUpperCase()}
                    </div>
              ))}
              <p className="text-xs font-medium" style={{ color: '#e0f2fe' }}>
                {friendsGoing.count > 0
                  ? `${friendsGoing.count} friend${friendsGoing.count !== 1 ? 's' : ''} · ${event.guestCount ?? 0} total`
                  : `${event.guestCount ?? 0} going`}
              </p>
            </div>
          </div>
          <div
            className="rounded-lg p-3 space-y-1"
            style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
          >
            <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>AGE POLICY</p>
            <p className="text-xs font-medium" style={{ color: '#e0f2fe' }}>
              {AGE_RESTRICTION_LABELS[event.ageRestriction] ?? 'All Ages'}
            </p>
          </div>
        </div>

        {/* Vibe tags */}
        {event.vibeTags?.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {event.vibeTags?.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                style={{
                  color: 'rgba(var(--accent-rgb),0.7)',
                  border: '1px solid rgba(var(--accent-rgb),0.2)',
                  background: 'rgba(var(--accent-rgb),0.05)',
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
            <div className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>CROWD MIX</p>
                <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>{total} attending</span>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden gap-px mb-1.5">
                {malePct > 0 && <div style={{ width: `${malePct}%`, background: '#3b82f6' }} />}
                {femPct  > 0 && <div style={{ width: `${femPct}%`,  background: '#ec4899' }} />}
                {nbPct   > 0 && <div style={{ width: `${nbPct}%`,   background: 'var(--accent)' }} />}
              </div>
              <div className="flex gap-3">
                <span className="text-[9px] font-bold" style={{ color: 'rgba(59,130,246,0.7)' }}>♂ {malePct}%</span>
                <span className="text-[9px] font-bold" style={{ color: 'rgba(236,72,153,0.7)' }}>♀ {femPct}%</span>
                {nbPct > 0 && <span className="text-[9px] font-bold" style={{ color: 'rgba(var(--accent-rgb),0.6)' }}>⚧ {nbPct}%</span>}
              </div>
            </div>
          )
        })()}

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
          <p className="text-[11px] font-medium truncate" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
            🎧 {(event as any).lineup}
          </p>
        )}
      </div>

      {/* CTA */}
      <div className="px-5 pb-6 pt-3 flex-shrink-0 space-y-2" style={{ filter: isLocked ? 'blur(6px)' : 'none', pointerEvents: isLocked ? 'none' : undefined }}>
        {/* Primary action */}
        <Link
          href={`/events/${event.id}`}
          className="flex items-center justify-center w-full font-black py-3 rounded-xl text-sm transition-all duration-200"
          style={{
            background: `linear-gradient(135deg, ${color}20, rgba(61,90,254,0.15))`,
            border: `1px solid ${color}50`,
            color,
            boxShadow: `0 0 20px ${color}25`,
            letterSpacing: '0.1em',
          }}
        >
          {event.isInviteOnly ? '🔒 REQUEST TO JOIN' : isFree ? '⚡ RSVP FREE' : `🎟 BUY TICKET — ${formatPrice(event.price ?? 0, currency)}`}
        </Link>

        {/* Secondary actions */}
        <div className="flex gap-2">
          <button
            onClick={() => setInterested((v) => !v)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200"
            style={{
              background: interested ? 'rgba(255,214,0,0.1)' : 'rgba(var(--accent-rgb),0.03)',
              border: interested ? '1px solid rgba(255,214,0,0.4)' : '1px solid rgba(var(--accent-rgb),0.12)',
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
              background: 'rgba(var(--accent-rgb),0.03)',
              border: '1px solid rgba(var(--accent-rgb),0.12)',
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
  NIGHTCLUB: 'var(--accent)', BAR: '#a855f7', PUB: '#22c55e',
  CONCERT_HALL: '#3d5afe', ROOFTOP_BAR: '#f59e0b', LOUNGE: '#ec4899',
}

function VenueCard({ venue }: { venue: DemoVenue | LiveVenue }) {
  const color = VENUE_TYPE_COLORS[venue.type] ?? 'var(--accent)'
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
        {venue.vibeTags && venue.vibeTags.length > 0 && (
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
              <a href={`tel:${phone}`} className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
                <Phone size={9} /> {phone}
              </a>
            )}
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
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
  venueSource: 'google' | 'database' | 'google_places' | null   // null = never fetched yet
  mapCenter: { lat: number; lng: number } | null
  isTracking: boolean
  onCitySearch: (city: string, lat: number, lng: number, currency?: string) => void
  onWiderSearch: () => void
}

function VenuesList({ liveVenues, venuesLoading, venueCity, venueSource, mapCenter, isTracking, onCitySearch, onWiderSearch }: VenuesListProps) {
  const [venueSearch, setVenueSearch] = useState('')
  const [cityInput, setCityInput] = useState('')
  const [citySearching, setCitySearching] = useState(false)
  const [cityError, setCityError] = useState('')
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null)
  // When GPS is active, city search starts collapsed
  const [showCitySearch, setShowCitySearch] = useState(!isTracking)

  const hasRealVenues = liveVenues.length > 0
  // Only use the Glasgow static list as a very-first-paint fallback —
  // once ANY location-based search has been done (venueSource !== null) we show
  // real results only (or an empty/loading state). This prevents Glasgow venues
  // appearing for Tokyo, New York, etc.
  const useStaticFallback = !hasRealVenues && venueSource === null && !venuesLoading
  const displayVenues: LiveVenue[] = hasRealVenues
    ? liveVenues
    : useStaticFallback ? (GLASGOW_VENUES as unknown as LiveVenue[]) : []
  const mapVenues = hasRealVenues ? liveVenues : (useStaticFallback ? GLASGOW_VENUES : [])

  const filtered = venueSearch
    ? displayVenues.filter((v) =>
        v.name.toLowerCase().includes(venueSearch.toLowerCase()) ||
        (v.vibeTags ?? []).some((t) => t.toLowerCase().includes(venueSearch.toLowerCase())) ||
        v.type.toLowerCase().includes(venueSearch.toLowerCase())
      )
    : displayVenues

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
      const currency = currencyFromDisplayName(display_name)
      onCitySearch(cityName, parseFloat(lat), parseFloat(lon), currency)
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
      <div className="flex-shrink-0 px-4 py-2" style={{ background: 'rgba(4,4,13,0.8)', borderBottom: '1px solid rgba(var(--accent-rgb),0.08)' }}>
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(var(--accent-rgb),0.35)' }} />
          <input
            type="text"
            placeholder="Filter by name, vibe, type..."
            value={venueSearch}
            onChange={(e) => setVenueSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg text-xs bg-transparent outline-none"
            style={{ border: '1px solid rgba(var(--accent-rgb),0.12)', color: '#e0f2fe' }}
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
          <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>
            {hasRealVenues ? `${filtered.length} VENUES` : 'NO VENUES'}
            {venueCity ? ` · ${venueCity.toUpperCase()}` : hasRealVenues ? ' · NEARBY' : ''}
          </p>
        )}
        {hasRealVenues && !venuesLoading && (
          <button
            onClick={onWiderSearch}
            className="text-[9px] font-black tracking-widest px-2 py-1 rounded transition-all"
            style={{ color: 'rgba(var(--accent-rgb),0.5)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}
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
        {/* No venues yet + not loading → location-aware empty state */}
        {!venuesLoading && !hasRealVenues && venueSource === null && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
            <span style={{ fontSize: 36 }}>📍</span>
            <p className="text-xs font-black tracking-widest" style={{ color: 'rgba(255,214,0,0.6)', letterSpacing: '0.15em' }}>
              LOCATING YOU
            </p>
            <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(224,242,254,0.4)' }}>
              Allow location access or search a city above to see nearby venues
            </p>
            {!isTracking && (
              <button
                onClick={onWiderSearch}
                className="mt-1 px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all"
                style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.3)', color: '#ffd600' }}
              >
                USE MY LOCATION
              </button>
            )}
          </div>
        )}
        {/* Searched but found nothing */}
        {!venuesLoading && !hasRealVenues && venueSource !== null && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
            <span style={{ fontSize: 36 }}>🔍</span>
            <p className="text-xs font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.15em' }}>
              NO VENUES FOUND
            </p>
            <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(224,242,254,0.35)' }}>
              {venueCity
                ? `No venues found in ${venueCity} yet — try a wider area or check back later.`
                : 'No venues found nearby. Try expanding your search radius.'}
            </p>
            <button
              onClick={onWiderSearch}
              className="mt-1 px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all"
              style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}
            >
              WIDER SEARCH
            </button>
          </div>
        )}
        {!venuesLoading && filtered.map((venue) => (
          <VenueCard key={venue.id} venue={venue} />
        ))}
        {!venuesLoading && hasRealVenues && filtered.length === 0 && venueSearch && (
          <div className="py-10 text-center text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>
            No venues match &ldquo;{venueSearch}&rdquo;
          </div>
        )}
      </div>
    </div>
  )
}

// ── Empty / loading placeholders ─────────────────────────────────────────────
const FEATURED_VENUES = [
  { name: 'Sub Club', tag: 'Techno · Underground', emoji: '🖤', city: 'Glasgow' },
  { name: 'SWG3', tag: 'Warehouse · DJ Sets', emoji: '🏭', city: 'Glasgow' },
  { name: 'Fabric', tag: 'House · Techno', emoji: '⚫', city: 'London' },
  { name: 'Printworks', tag: 'Electronic · Rave', emoji: '🏗️', city: 'London' },
  { name: 'The Warehouse Project', tag: 'Bass · Electronic', emoji: '🔊', city: 'Manchester' },
  { name: 'Egg London', tag: 'Club · House', emoji: '🥚', city: 'London' },
]

const QUICK_CITIES = ['Glasgow', 'Edinburgh', 'London', 'Manchester', 'Birmingham', 'Bristol']

function EmptyState({ loading, onRetry, onSearch, onCreateEvent }: {
  loading: boolean
  onRetry?: () => void
  onSearch?: () => void
  onCreateEvent?: () => void
}) {
  const [retrying, setRetrying] = useState(false)
  const [anyEvents, setAnyEvents] = useState<{ id: string; name: string; type: string; startsAt: string; neighbourhood?: string }[]>([])

  // On mount, fetch UK events as suggestions (Glasgow-centric, 400mi radius covers all UK)
  useEffect(() => {
    fetch(`${API_URL}/events?limit=6&lat=55.86&lng=-4.25&radius=400`)
      .then(r => r.json())
      .then(j => { if (Array.isArray(j?.data)) setAnyEvents(j.data) })
      .catch(silent('discover:empty-state-suggestions'))
  }, [])

  const handleRetry = async () => {
    if (!onRetry || retrying) return
    setRetrying(true)
    try { await onRetry() } catch (e) { silent('discover:retry')(e) } finally { setRetrying(false) }
  }

  if (loading || retrying) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
        <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
          {retrying ? 'RETRYING...' : 'SCANNING FOR EVENTS...'}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto h-full pb-6">
      {/* Hero */}
      <div className="flex flex-col items-center pt-8 pb-5 px-6 text-center">
        <div className="text-4xl mb-3">📡</div>
        <p className="text-sm font-black tracking-widest mb-1" style={{ color: 'var(--accent)' }}>
          NO EVENTS IN YOUR AREA
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'rgba(74,96,128,0.7)', maxWidth: 260 }}>
          PartyRadar is growing. No events near you yet — search another city, create one yourself, or explore below.
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-4 mb-5">
        {onSearch && (
          <button onClick={onSearch}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all"
            style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)', letterSpacing: '0.1em' }}>
            <Search size={12} /> SEARCH EVENTS
          </button>
        )}
        {onCreateEvent && (
          <button onClick={onCreateEvent}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all"
            style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88', letterSpacing: '0.1em' }}>
            + CREATE EVENT
          </button>
        )}
      </div>

      {/* Any events from platform */}
      {anyEvents.length > 0 && (
        <div className="px-4 mb-5">
          <p className="text-[10px] font-black tracking-widest mb-3" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
            EVENTS ON THE PLATFORM
          </p>
          <div className="space-y-2">
            {anyEvents.map(ev => (
              <Link key={ev.id} href={`/events/${ev.id}`}>
                <div className="flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98]"
                  style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-base"
                    style={{ background: `${TYPE_COLORS[ev.type] ?? 'var(--accent)'}15`, border: `1px solid ${TYPE_COLORS[ev.type] ?? 'var(--accent)'}30` }}>
                    {ev.type === 'HOME_PARTY' ? '🏠' : ev.type === 'CLUB_NIGHT' ? '🎧' : ev.type === 'CONCERT' ? '🎵' : '🎉'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black truncate" style={{ color: '#e0f2fe' }}>{ev.name}</p>
                    <p className="text-[10px] truncate" style={{ color: 'rgba(224,242,254,0.4)' }}>
                      {ev.neighbourhood ?? ''} · {new Date(ev.startsAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <ChevronRight size={12} style={{ color: 'rgba(var(--accent-rgb),0.4)', flexShrink: 0 }} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick city search */}
      <div className="px-4 mb-5">
        <p className="text-[10px] font-black tracking-widest mb-3" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
          SEARCH BY CITY
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_CITIES.map(city => (
            <Link key={city} href={`/discover?city=${encodeURIComponent(city)}`}>
              <span className="px-3 py-1.5 rounded-full text-[10px] font-black transition-all"
                style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'rgba(var(--accent-rgb),0.7)', letterSpacing: '0.08em' }}>
                {city}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Featured venues */}
      <div className="px-4">
        <p className="text-[10px] font-black tracking-widest mb-3" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
          ICONIC VENUES
        </p>
        <div className="grid grid-cols-2 gap-2">
          {FEATURED_VENUES.map(v => (
            <div key={v.name} className="p-3 rounded-xl"
              style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
              <div className="text-xl mb-1">{v.emoji}</div>
              <p className="text-xs font-black" style={{ color: '#e0f2fe' }}>{v.name}</p>
              <p className="text-[9px] mt-0.5" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>{v.tag}</p>
              <p className="text-[9px] mt-0.5 font-bold" style={{ color: 'rgba(74,96,128,0.5)' }}>{v.city}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Retry */}
      {onRetry && (
        <div className="flex justify-center mt-5">
          <button onClick={handleRetry}
            className="px-5 py-2 rounded-xl text-xs font-black tracking-widest transition-all"
            style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'rgba(var(--accent-rgb),0.6)' }}>
            RETRY LOCATION SCAN
          </button>
        </div>
      )}
    </div>
  )
}

// ── Full-screen search overlay ────────────────────────────────────────────────
interface SearchOverlayProps {
  onClose: () => void
  userTier: string
}

function SearchOverlay({ onClose, userTier }: SearchOverlayProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<Event[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-focus input when overlay opens
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Debounce query by 400 ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setDebouncedQuery('')
      setResults([])
      setSearched(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Fetch when debounced query changes
  useEffect(() => {
    if (!debouncedQuery) return
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({ q: debouncedQuery, limit: '20' })
    fetch(`${API_URL}/events?${params.toString()}`)
      .then((r) => r.json())
      .then((json: { data?: Event[] }) => {
        if (cancelled) return
        setResults(json.data ?? [])
        setSearched(true)
      })
      .catch(() => { if (!cancelled) { setResults([]); setSearched(true) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debouncedQuery])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: '#04040d' }}
    >
      {/* Search header */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.15)', background: 'rgba(4,4,13,0.97)', backdropFilter: 'blur(16px)' }}
      >
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--accent)' }}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search events by name, vibe, area..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm outline-none bg-transparent"
            style={{
              border: '1px solid rgba(var(--accent-rgb),0.25)',
              color: '#e0f2fe',
              background: 'rgba(var(--accent-rgb),0.04)',
            }}
          />
          {query && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2"
              onClick={() => { setQuery(''); setResults([]); setSearched(false); inputRef.current?.focus() }}
            >
              <X size={14} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 px-3 py-2 rounded-lg text-xs font-black tracking-widest transition-all"
          style={{ border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'rgba(var(--accent-rgb),0.6)', background: 'transparent' }}
        >
          CANCEL
        </button>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-20">
        {/* Loading spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div
              className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }}
            />
            <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>SEARCHING...</p>
          </div>
        )}

        {/* Empty prompt — not yet searched */}
        {!loading && !searched && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Search size={40} style={{ color: 'rgba(var(--accent-rgb),0.15)' }} />
            <p className="text-sm font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>FIND YOUR NEXT PARTY</p>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(224,242,254,0.25)', maxWidth: 240 }}>
              Type to search by event name, description, neighbourhood, or event type.
            </p>
          </div>
        )}

        {/* No results */}
        {!loading && searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <span style={{ fontSize: 40 }}>📡</span>
            <p className="text-sm font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>NO EVENTS FOUND</p>
            <p className="text-xs" style={{ color: 'rgba(224,242,254,0.25)' }}>
              Try a different search term or check back later.
            </p>
          </div>
        )}

        {/* Results list */}
        {!loading && results.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black tracking-widest mb-3" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>
              {results.length} RESULT{results.length !== 1 ? 'S' : ''} FOR &ldquo;{debouncedQuery}&rdquo;
            </p>
            {results.map((e) => (
              <div key={e.id} onClick={onClose}>
                <EventListCard event={e} userTier={userTier} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DiscoverPage() {
  const { dbUser } = useAuth()
  const userTier = dbUser?.subscriptionTier ?? 'FREE'

  const [tab, setTab] = useState<'events' | 'venues' | 'feed'>('feed')
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list')
  const [searchOpen, setSearchOpen] = useState(false)
  // Use 0 as server-safe initial value to avoid SSR/client hydration mismatch.
  // useEffect sets the real timestamp on the client after hydration.
  const [now, setNow] = useState(0)
  const [index, setIndex] = useState(0)
  const [slideDir, setSlideDir] = useState<SlideDir>(null)
  const [showMap, setShowMap] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<{ type?: EventType; search?: string; showFree?: boolean; tonight?: boolean }>({})
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [geoResolved, setGeoResolved] = useState(false)
  // locationReady = we have actual coordinates (GPS lock OR user searched a city).
  // This is the ONLY gate for the events fetch — prevents global/Amsterdam events
  // appearing when GPS times out without giving us a position.
  const [locationReady, setLocationReady] = useState(false)
  const [isTracking, setIsTracking] = useState(false)   // true when watchPosition is active

  // AI event scan state — fires once when GPS provides first fix
  const [aiSyncing, setAiSyncing] = useState(false)
  const [aiCity, setAiCity] = useState<string | null>(null)
  const [aiFound, setAiFound] = useState<number | null>(null)
  const aiSyncedRef = useRef(false)
  const aiFoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cap the full-screen "RADAR ASSISTANT SCANNING" UI at 3s for manual city changes.
  // AI sync continues in the background; mutate() refreshes results when done.
  const [aiScanTimedOut, setAiScanTimedOut] = useState(false)
  const aiScanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks whether real GPS has fired at least once.
  // On first GPS fix we always reset aiSyncedRef so the AI sync re-fires for the
  // correct city (IP geo can give the wrong city — e.g. London instead of Glasgow).
  const gpsFirstFix = useRef(false)

  // ── Venue discovery state (lifted here so it survives tab switches) ──────────
  const { venues: liveVenues, loading: venuesLoading, source: venueSource, discover } = useVenueDiscover()
  const [venueCity, setVenueCity] = useState<string | null>(null)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null)
  // Currency for the currently viewed city — defaults to user's own timezone currency
  const [currentCurrency, setCurrentCurrency] = useState(() => detectCurrency())

  // Track the last position we fetched for, to avoid re-fetching on tiny GPS jitter
  const lastFetchedPos = useRef<{ lat: number; lng: number } | null>(null)

  // Ref so async geo callbacks can check locationReady without stale closure
  const locationReadyRef = useRef(false)
  useEffect(() => { locationReadyRef.current = locationReady }, [locationReady])

  // ── Robust geolocation bootstrap ─────────────────────────────────────────────
  // Priority order:
  //   1. localStorage cached location (instant, works on repeat visits)
  //   2. HTTPS IP-geo services (ip-api.com is HTTP-only → blocked by browsers on HTTPS)
  //   3. Glasgow fallback after 5 s (app's home city — prevents global/Amsterdam events)
  //   GPS watchPosition always overrides all of the above when it fires.
  useEffect(() => {
    function applyLocation(lat: number, lng: number, city: string | null, persist = false) {
      if (locationReadyRef.current) return   // GPS already beat us to it
      lastFetchedPos.current = { lat, lng }
      setUserLocation({ lat, lng })
      setLocationReady(true)
      setGeoResolved(true)
      setMapCenter({ lat, lng })
      setVenueCity(city)
      discover(lat, lng, 15000)
      if (persist) {
        try {
          localStorage.setItem('pr_loc', JSON.stringify({ lat, lng, city, ts: Date.now() }))
        } catch {}
      }
    }

    // 1 — localStorage cache (12-hour TTL)
    try {
      const raw = localStorage.getItem('pr_loc')
      if (raw) {
        const s = JSON.parse(raw) as { lat: number; lng: number; city: string | null; ts: number }
        if (s.lat && s.lng && Date.now() - s.ts < 12 * 3_600_000) {
          applyLocation(s.lat, s.lng, s.city, false)
        }
      }
    } catch {}

    // 2 — HTTPS IP-geo services (tried in order, 3 s timeout each)
    function fetchJson(url: string, timeoutMs: number) {
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), timeoutMs)
      return fetch(url, { signal: ctrl.signal })
        .then((r) => r.json())
        .finally(() => clearTimeout(tid))
    }

    const ipGeoServices: Array<() => Promise<{ lat: number; lng: number; city: string | null }>> = [
      () =>
        fetchJson('https://freeipapi.com/api/json', 3000)
          .then((d: { latitude?: number; longitude?: number; cityName?: string }) => {
            if (!d.latitude || !d.longitude) throw new Error('no coords')
            return { lat: Number(d.latitude), lng: Number(d.longitude), city: d.cityName ?? null }
          }),
      () =>
        fetchJson('https://ipapi.co/json/', 3000)
          .then((d: { latitude?: number; longitude?: number; city?: string }) => {
            if (!d.latitude || !d.longitude) throw new Error('no coords')
            return { lat: Number(d.latitude), lng: Number(d.longitude), city: d.city ?? null }
          }),
    ]

    let ipResolved = false
    ;(async () => {
      for (const svc of ipGeoServices) {
        if (ipResolved || locationReadyRef.current) break
        try {
          const { lat, lng, city } = await svc()
          if (ipResolved || locationReadyRef.current) break
          ipResolved = true
          applyLocation(lat, lng, city, true)
        } catch { /* try next service */ }
      }
    })()

    // 3 — Glasgow fallback after 5 s (prevents Amsterdam / global events)
    const glasgowTimer = setTimeout(() => {
      if (locationReadyRef.current) return
      ipResolved = true
      applyLocation(55.8617, -4.2583, 'Glasgow', false)
    }, 5000)

    return () => clearTimeout(glasgowTimer)
  }, [discover])

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
    if (typeof window === 'undefined' || !navigator.geolocation) { setGeoResolved(true); return }

    const fallback = setTimeout(() => setGeoResolved(true), 8500)

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        clearTimeout(fallback)
        setIsTracking(true)
        // GPS settled — allow events fetch to start (gated on geoResolved)
        setGeoResolved(true)

        const last = lastFetchedPos.current
        const moved = last ? haversineKm(last.lat, last.lng, lat, lng) : Infinity

        // Only re-fetch when first lock OR moved more than 500 m
        if (moved > 0.5) {
          lastFetchedPos.current = { lat, lng }
          setUserLocation({ lat, lng })
          setLocationReady(true)   // We now have real coordinates — unlock events fetch
          locationReadyRef.current = true
          setMapCenter({ lat, lng })
          discover(lat, lng, 15000)

          // CRITICAL: First GPS fix always overrides IP geo.
          // IP geo often returns the wrong city (e.g. London for someone in Glasgow
          // because the ISP's IP is routed through London). Reset the AI sync ref
          // so syncPerplexity/Ticketmaster fires for the REAL GPS city, not IP geo city.
          if (!gpsFirstFix.current) {
            gpsFirstFix.current = true
            aiSyncedRef.current = false   // force AI re-sync for GPS city
            autoRetried.current = false   // allow retry mechanism to fire again
            setSyncing(false)
          }

          // Reverse-geocode for display label + currency (throttled by the moved>500m guard)
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
            .then((r) => r.json())
            .then((d) => {
              const city = d?.address?.city || d?.address?.town || d?.address?.county || null
              setVenueCity(city)
              // Update currency from GPS country
              const displayName = d?.display_name ?? ''
              if (displayName) setCurrentCurrency(currencyFromDisplayName(displayName))
              // Persist precise GPS location for instant results on next visit
              try { localStorage.setItem('pr_loc', JSON.stringify({ lat, lng, city, ts: Date.now() })) } catch {}
            })
            .catch(silent('discover:reverse-geocode'))
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

  // Shared city-change logic (used by Venues search bar and city quick-select)
  function handleCitySearch(cityName: string, lat: number, lng: number, currency?: string) {
    // Clear old city's events immediately so stale data doesn't linger
    mutate(undefined, false)
    setVenueCity(cityName)
    setMapCenter({ lat, lng })
    if (currency) setCurrentCurrency(currency)
    discover(lat, lng, 15000)
    setUserLocation({ lat, lng })
    setLocationReady(true)
    setGeoResolved(true)
    locationReadyRef.current = true
    // Persist so next visit opens on correct city
    try { localStorage.setItem('pr_loc', JSON.stringify({ lat, lng, city: cityName, ts: Date.now() })) } catch {}
    // Reset AI sync + auto-retry so they fire for the new city
    autoRetried.current = false
    aiSyncedRef.current = false
    setSyncing(false)
    // Kick off AI sync immediately for the new city (bypass throttle with force=true)
    // — don't wait for the useEffect, fire it right now so events arrive faster
    setAiSyncing(true)
    setAiCity(cityName)
    setAiFound(null)
    // Cap the full-screen scanning UI — show it for 3s max, then show events/empty state
    setAiScanTimedOut(false)
    if (aiScanTimeoutRef.current) clearTimeout(aiScanTimeoutRef.current)
    aiScanTimeoutRef.current = setTimeout(() => setAiScanTimedOut(true), 3000)
    api.post<{ data: { imported: number; skipped: number } }>(
      '/events/ai-sync',
      { city: cityName, lat, lng, force: true },
    ).then((res) => {
      const found = res?.data?.imported ?? 0
      setAiFound(found)
      setAiSyncing(false)
      mutate()  // revalidate to show new city events
      aiSyncedRef.current = true  // mark done so the useEffect doesn't double-fire
      if (aiFoundTimerRef.current) clearTimeout(aiFoundTimerRef.current)
      aiFoundTimerRef.current = setTimeout(() => setAiFound(null), 5000)
    }).catch(() => {
      setAiSyncing(false)
      mutate()
      aiSyncedRef.current = true
    })
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

  // Events ONLY fetch once we have real coordinates (GPS, IP geo, or Glasgow fallback).
  // skip=!locationReady ensures Amsterdam / global events never bleed in.
  // userLocation is always set before locationReady, so lat/lng is always present in the query.
  const { events, isLoading, mutate, forceRetry } = useEvents({
    ...filters,
    ...(userLocation ? { lat: userLocation.lat, lng: userLocation.lng, radius: 50 } : {}),
    limit: 100,
  }, !locationReady)

  // AI sync — fires once when we get the first GPS fix.
  // Calls POST /api/events/ai-sync which runs Perplexity + Ticketmaster/Skiddle
  // for the user's city, then revalidates the events list when done.
  useEffect(() => {
    if (!userLocation || aiSyncedRef.current) return
    aiSyncedRef.current = true

    const { lat, lng } = userLocation
    setAiSyncing(true)
    setAiFound(null)

    // Resolve city name then run AI sync
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
      .then((r) => r.json())
      .then((d: { address?: { city?: string; town?: string; county?: string } }) => {
        const city =
          d?.address?.city || d?.address?.town || d?.address?.county ||
          `${lat.toFixed(2)},${lng.toFixed(2)}`
        setAiCity(city)
        return api.post<{ data: { imported: number; skipped: number; sources: string[] } }>(
          '/events/ai-sync',
          { city, lat, lng, force: true },
        )
      })
      .then((res) => {
        const found = res?.data?.imported ?? 0
        setAiFound(found)
        setAiSyncing(false)
        // Revalidate events list so newly synced events appear
        mutate()
        // Hide the "found X events" badge after 5s
        if (aiFoundTimerRef.current) clearTimeout(aiFoundTimerRef.current)
        aiFoundTimerRef.current = setTimeout(() => setAiFound(null), 5000)
      })
      .catch(() => {
        setAiSyncing(false)
        mutate() // still revalidate on error — fire-and-forget may have persisted something
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation])

  // Auto-retry once when 0 events returned after getting location.
  // Don't fire while AI sync is running — it will call mutate() when done.
  const autoRetried = useRef(false)
  const [syncing, setSyncing] = useState(false)
  useEffect(() => {
    if (autoRetried.current) return
    if (isLoading || !locationReady || events.length > 0 || aiSyncing) return
    autoRetried.current = true
    setSyncing(true)
    const t = setTimeout(async () => {
      await forceRetry().catch(silent('discover:force-retry'))
      setSyncing(false)
    }, 4000)
    return () => clearTimeout(t)
  }, [isLoading, locationReady, events.length, aiSyncing, forceRetry])

  // locationLoading: spinner while waiting for coordinates OR initial events fetch
  const locationLoading = !locationReady || (isLoading && events.length === 0)
  // gpsDenied: only true when GPS settled AND IP geo also failed AND no localStorage cache
  // (rare: means all three geo methods failed — we'll show Glasgow fallback within 5 s anyway)
  const gpsDenied = geoResolved && !locationReady

  // Reset index when events change
  useEffect(() => { setIndex(0) }, [events.length])

  // ── Impression tracking ───────────────────────────────────────────────────
  const impressionsTrackedRef = useRef(new Set<string>())

  // List view: batch-send all visible event IDs after a 1.5s dwell
  useEffect(() => {
    if (!events.length || viewMode !== 'list' || tab !== 'events') return
    const newIds = events.map(e => e.id).filter(id => !impressionsTrackedRef.current.has(id))
    if (!newIds.length) return
    const timer = setTimeout(() => {
      newIds.forEach(id => impressionsTrackedRef.current.add(id))
      api.post<unknown>('/events/impressions', { eventIds: newIds }).catch(silent('discover:impressions-batch'))
    }, 1500)
    return () => clearTimeout(timer)
  }, [events, viewMode, tab])

  // Card view: send impression when swiped to a new card
  useEffect(() => {
    if (!events.length || viewMode !== 'card' || tab !== 'events') return
    const ev = events[index]
    if (!ev || impressionsTrackedRef.current.has(ev.id)) return
    impressionsTrackedRef.current.add(ev.id)
    api.post<unknown>('/events/impressions', { eventIds: [ev.id] }).catch(silent('discover:impression-card'))
  }, [events, index, viewMode, tab])

  // Set real timestamp on client after hydration, then tick every 60s
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

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

  // Keyboard navigation — use refs so we always call the latest callbacks
  const goNextRef = useRef(goNext)
  const goPrevRef = useRef(goPrev)
  useEffect(() => { goNextRef.current = goNext }, [goNext])
  useEffect(() => { goPrevRef.current = goPrev }, [goPrev])

  useEffect(() => {
    if (typeof window === 'undefined') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goNextRef.current()
      if (e.key === 'ArrowLeft') goPrevRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Clamp index so a stale value never exceeds the new array length during the
  // one render before the setIndex(0) useEffect fires on events.length change.
  const safeIndex = events.length > 0 ? Math.min(index, events.length - 1) : 0
  const event = events[safeIndex] ?? null

  return (
    <>
      {/* ── Full-screen search overlay ── */}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} userTier={userTier} />}

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

      {/* ── Header bar ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 gap-3"
        style={{
          background: 'rgba(4,4,13,0.9)',
          borderBottom: '1px solid rgba(var(--accent-rgb),0.1)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Tab switcher + live tracking badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'rgba(var(--accent-rgb),0.05)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
            <button
              onClick={() => setTab('events')}
              className="px-3 py-1 rounded text-[10px] font-black transition-all duration-200"
              style={{
                background: tab === 'events' ? 'rgba(var(--accent-rgb),0.15)' : 'transparent',
                color: tab === 'events' ? 'var(--accent)' : 'rgba(74,96,128,0.6)',
                letterSpacing: '0.12em',
                boxShadow: tab === 'events' ? '0 0 8px rgba(var(--accent-rgb),0.2)' : 'none',
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
            <button
              onClick={() => setTab('feed')}
              className="px-3 py-1 rounded text-[10px] font-black transition-all duration-200"
              style={{
                background: tab === 'feed' ? 'rgba(236,72,153,0.12)' : 'transparent',
                color: tab === 'feed' ? '#ec4899' : 'rgba(74,96,128,0.6)',
                letterSpacing: '0.12em',
                boxShadow: tab === 'feed' ? '0 0 8px rgba(236,72,153,0.15)' : 'none',
              }}
            >
              FEED
            </button>
          </div>
          {/* Live location tracking badge */}
          {isTracking && !aiSyncing && aiFound === null && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg"
              style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
              <span className="text-[9px] font-black tracking-widest" style={{ color: '#00ff88' }}>LIVE</span>
            </div>
          )}
          {/* AI event scan status badge */}
          {aiSyncing && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
              style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)' }}>
              <div className="w-2.5 h-2.5 rounded-full border border-t-transparent animate-spin shrink-0"
                style={{ borderColor: 'rgba(139,92,246,0.3)', borderTopColor: '#8b5cf6' }} />
              <span className="text-[9px] font-black tracking-widest whitespace-nowrap" style={{ color: '#8b5cf6' }}>
                SEARCHING{aiCity ? ` · ${aiCity.toUpperCase()}` : '...'}
              </span>
            </div>
          )}
          {!aiSyncing && aiFound !== null && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg"
              style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)' }}>
              <span className="text-[9px] font-black tracking-widest whitespace-nowrap" style={{ color: '#00ff88' }}>
                ✨ {aiFound > 0 ? `+${aiFound} EVENTS` : 'SCANNED'}
              </span>
            </div>
          )}
        </div>

        {/* Counter + controls */}
        <div className="flex items-center gap-2">
          {tab === 'events' && !isLoading && !locationLoading && events.length > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ color: 'rgba(var(--accent-rgb),0.6)', border: '1px solid rgba(var(--accent-rgb),0.15)', background: 'rgba(var(--accent-rgb),0.05)', letterSpacing: '0.08em' }}
            >
              {index + 1} / {events.length}
            </span>
          )}
          {tab === 'events' && (
            <>
              {/* Search button — opens full-screen search overlay */}
              <button
                onClick={() => setSearchOpen(true)}
                className="p-1.5 rounded transition-all duration-200"
                title="Search events"
                style={{
                  border: '1px solid rgba(var(--accent-rgb),0.25)',
                  color: 'var(--accent)',
                  background: 'rgba(var(--accent-rgb),0.08)',
                  boxShadow: '0 0 8px rgba(var(--accent-rgb),0.15)',
                }}
              >
                <Search size={14} />
              </button>
              <button
                onClick={() => setViewMode(v => v === 'list' ? 'card' : 'list')}
                className="p-1.5 rounded transition-all duration-200"
                title={viewMode === 'list' ? 'Card view' : 'List view'}
                style={{
                  border: '1px solid rgba(var(--accent-rgb),0.12)',
                  color: 'rgba(var(--accent-rgb),0.7)',
                  background: 'transparent',
                }}
              >
                {viewMode === 'list' ? <Layers size={14} /> : <LayoutList size={14} />}
              </button>
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="p-1.5 rounded transition-all duration-200 relative"
                style={{
                  border: showFilters ? '1px solid rgba(var(--accent-rgb),0.4)' : '1px solid rgba(var(--accent-rgb),0.12)',
                  color: showFilters ? 'var(--accent)' : 'rgba(74,96,128,0.7)',
                  background: showFilters ? 'rgba(var(--accent-rgb),0.08)' : 'transparent',
                }}
              >
                <SlidersHorizontal size={14} />
                {(filters.type || filters.showFree || filters.tonight || filters.search) && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
                )}
              </button>
              <button
                onClick={() => setShowMap((v) => !v)}
                className="p-1.5 rounded transition-all duration-200"
                style={{
                  border: showMap ? '1px solid rgba(var(--accent-rgb),0.4)' : '1px solid rgba(var(--accent-rgb),0.12)',
                  color: showMap ? 'var(--accent)' : 'rgba(74,96,128,0.7)',
                  background: showMap ? 'rgba(var(--accent-rgb),0.08)' : 'transparent',
                }}
              >
                <Map size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Feed tab ── */}
      {tab === 'feed' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DiscoverFeedTab
            dbUser={dbUser ? { id: dbUser.id, username: dbUser.username ?? '', displayName: dbUser.displayName ?? '', photoUrl: dbUser.photoUrl } : null}
            isLoggedIn={!!dbUser}
          />
        </div>
      )}

      {/* ── Venues tab — always mounted, hidden when not active to preserve discovery state ── */}
      <div style={{ display: tab === 'venues' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
        <VenuesList
          liveVenues={liveVenues}
          venuesLoading={venuesLoading}
          venueCity={venueCity}
          venueSource={venueSource}
          mapCenter={mapCenter}
          isTracking={isTracking}
          onCitySearch={handleCitySearch}
          onWiderSearch={handleVenueWiderSearch}
        />
      </div>

      {/* ── Events tab content ── */}
      {tab === 'events' && <>

      {/* ── Thin location bar — just shows detected city, tap to search ── */}
      <div className="flex-shrink-0" style={{ background: 'rgba(4,4,13,0.92)', borderBottom: '1px solid rgba(var(--accent-rgb),0.08)' }}>
        <div className="flex items-center justify-between px-4 py-1.5">
          {/* Left: location pill */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5"
          >
            {(isTracking || locationReady) ? (
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isTracking ? '#00ff88' : 'rgba(var(--accent-rgb),0.5)', boxShadow: isTracking ? '0 0 4px #00ff88' : 'none' }} />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: '#ffd600', boxShadow: '0 0 4px #ffd600' }} />
            )}
            <span className="text-[10px] font-bold" style={{ color: locationReady ? 'rgba(224,242,254,0.7)' : 'rgba(255,214,0,0.6)' }}>
              {venueCity
                ? venueCity.toUpperCase()
                : locationReady
                  ? 'NEARBY'
                  : 'LOCATING...'}
            </span>
          </button>
          {/* Right: search-city button */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1 text-[9px] font-black tracking-widest"
            style={{ color: 'rgba(var(--accent-rgb),0.4)' }}
          >
            <Search size={9} /> SEARCH
          </button>
        </div>
      </div>

      {/* ── Event type filter pills (always visible) ── */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-4 py-2 overflow-x-auto no-scrollbar"
        style={{ background: 'rgba(4,4,13,0.85)', borderBottom: '1px solid rgba(var(--accent-rgb),0.08)' }}
      >
        {([undefined, 'HOME_PARTY', 'CLUB_NIGHT', 'PUB_NIGHT', 'CONCERT'] as (EventType | undefined)[]).map((type) => {
          const isActive = filters.type === type
          const label = type === 'CONCERT' ? '🎭 CONCERTS' : type ? TYPE_LABELS[type] : 'ALL'
          const color = type ? TYPE_COLORS[type] : 'var(--accent)'
          return (
            <button
              key={type ?? 'all'}
              onClick={() => setFilters(f => ({ ...f, type }))}
              className="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black transition-all duration-200"
              style={{
                background: isActive ? `${color}18` : 'transparent',
                border: `1px solid ${isActive ? `${color}60` : 'rgba(var(--accent-rgb),0.1)'}`,
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
            border: `1px solid ${filters.tonight ? 'rgba(255,214,0,0.5)' : 'rgba(var(--accent-rgb),0.1)'}`,
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
            border: `1px solid ${filters.showFree ? 'rgba(0,255,136,0.4)' : 'rgba(var(--accent-rgb),0.1)'}`,
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
          style={{ background: 'rgba(7,7,26,0.95)', borderBottom: '1px solid rgba(var(--accent-rgb),0.1)' }}
        >
          <EventFilters filters={filters} onChange={setFilters} />
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {viewMode === 'list' && (
        <div className="flex-1 overflow-y-auto pb-20">
          {/* Map overlay */}
          {showMap && (
            <div className="relative" style={{ height: 220, borderBottom: '1px solid rgba(var(--accent-rgb),0.1)' }}>
              <EventMap events={events} centerLat={userLocation?.lat} centerLng={userLocation?.lng} />
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] font-bold px-4 py-1.5 rounded-full"
                style={{ background: 'rgba(4,4,13,0.85)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'rgba(var(--accent-rgb),0.7)', backdropFilter: 'blur(8px)', letterSpacing: '0.1em' }}>
                {(isLoading || locationLoading) ? 'SCANNING...' : `${events.length} EVENTS`}
              </div>
            </div>
          )}

          {/* GPS denied banner — rare (shows only if GPS + IP geo + localStorage all fail) */}
          {gpsDenied && (
            <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
              style={{ background: 'rgba(255,214,0,0.06)', borderBottom: '1px solid rgba(255,214,0,0.15)' }}>
              <span className="text-[10px]">📍</span>
              <p className="text-[10px] flex-1" style={{ color: 'rgba(255,214,0,0.7)' }}>
                Detecting your location…{' '}
                <button onClick={() => setTab('venues')} className="underline font-bold" style={{ color: '#ffd600' }}>Search a city</button>
                {' '}to load local events now.
              </p>
            </div>
          )}
          {(isLoading || locationLoading) ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-10 h-10 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
              <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
                {!locationReady ? 'LOCATING YOU...' : 'SCANNING AREA...'}
              </p>
            </div>
          ) : events.length === 0 && aiSyncing && !aiScanTimedOut ? (
            /* AI sync running — show scanning state for max 3s on city change */
            <div className="flex flex-col items-center justify-center py-20 gap-4 px-6">
              <div className="w-12 h-12 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(139,92,246,0.15)', borderTopColor: '#8b5cf6' }} />
              <div className="text-center">
                <p className="text-xs font-black tracking-widest mb-1" style={{ color: '#8b5cf6' }}>
                  RADAR ASSISTANT SCANNING
                </p>
                <p className="text-[11px]" style={{ color: 'rgba(224,242,254,0.4)' }}>
                  Searching {aiCity ? aiCity : 'your area'} for club nights, concerts &amp; bar events…
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center mt-1">
                {['🎧 RA', '🎟 Dice.fm', '🎵 Skiddle', '📍 Local'].map(s => (
                  <span key={s} className="text-[9px] font-bold px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: 'rgba(139,92,246,0.6)', letterSpacing: '0.08em' }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ) : events.length === 0 ? (
            <EmptyState loading={syncing} onRetry={forceRetry} onSearch={() => setSearchOpen(true)} onCreateEvent={() => { if (typeof window !== 'undefined') window.location.href = '/events/create' }} />
          ) : (() => {
            const TYPE_PRIORITY: Record<string, number> = { HOME_PARTY: 0, CLUB_NIGHT: 1, PUB_NIGHT: 2 }
            const byTypeThenDate = (a: (typeof events)[0], b: (typeof events)[0]) => {
              const pa = TYPE_PRIORITY[a.type] ?? 3
              const pb = TYPE_PRIORITY[b.type] ?? 3
              if (pa !== pb) return pa - pb
              return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
            }
            const liveEvents = events.filter(e => {
              const start = new Date(e.startsAt).getTime()
              const end = e.endsAt ? new Date(e.endsAt).getTime() : start + 6 * 3600000
              return start <= now && now <= end
            }).sort(byTypeThenDate)
            const upcomingEvents = events.filter(e => new Date(e.startsAt).getTime() > now).sort(byTypeThenDate)

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
                      {liveEvents.map(e => <EventListCard key={e.id} event={e} live userTier={userTier} currency={currentCurrency} />)}
                    </div>
                  </div>
                )}

                {/* UPCOMING */}
                {upcomingEvents.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar size={12} style={{ color: 'var(--accent)' }} />
                      <span className="text-[11px] font-black tracking-widest" style={{ color: 'var(--accent)' }}>UPCOMING</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>
                        {upcomingEvents.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {upcomingEvents.map(e => <EventListCard key={e.id} event={e} userTier={userTier} currency={currentCurrency} />)}
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
                background: i === index ? 'var(--accent)' : i < index ? 'rgba(var(--accent-rgb),0.25)' : 'rgba(var(--accent-rgb),0.08)',
                boxShadow: i === index ? '0 0 6px rgba(var(--accent-rgb),0.7)' : 'none',
              }} />
          ))}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {showMap && (
            <div className="absolute inset-0 z-10" style={{ background: '#07071a', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
              <EventMap events={events} centerLat={userLocation?.lat} centerLng={userLocation?.lng} />
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] font-bold px-4 py-1.5 rounded-full"
                style={{ background: 'rgba(4,4,13,0.85)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'rgba(var(--accent-rgb),0.7)', backdropFilter: 'blur(8px)', letterSpacing: '0.1em' }}>
                {isLoading ? 'SCANNING...' : `${events.length} EVENTS NEARBY`}
              </div>
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            {(isLoading || locationLoading) || events.length === 0 || !event ? (
              <EmptyState loading={isLoading || locationLoading || syncing} onRetry={forceRetry} onSearch={() => setSearchOpen(true)} onCreateEvent={() => { if (typeof window !== 'undefined') window.location.href = '/events/create' }} />
            ) : (
              <EventStage event={event} dir={slideDir} userTier={userTier} currency={currentCurrency} />
            )}
          </div>
          {events.length > 1 && (
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3"
              style={{ background: 'rgba(4,4,13,0.85)', borderTop: '1px solid rgba(var(--accent-rgb),0.08)' }}>
              <button onClick={goPrev} disabled={index === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs transition-all duration-200 disabled:opacity-25"
                style={{ background: index === 0 ? 'transparent' : 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)', letterSpacing: '0.1em' }}>
                <ChevronLeft size={14} /> PREV
              </button>
              <div className="flex items-center gap-1.5">
                {events.slice(Math.max(0, index - 2), index + 3).map((_, relI) => {
                  const absI = Math.max(0, index - 2) + relI
                  return (
                    <div key={absI} className="rounded-full transition-all duration-300"
                      style={{ width: absI === index ? 18 : 5, height: 5, background: absI === index ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.2)', boxShadow: absI === index ? '0 0 8px rgba(var(--accent-rgb),0.7)' : 'none' }} />
                  )
                })}
              </div>
              <button onClick={goNext} disabled={index === events.length - 1}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs transition-all duration-200 disabled:opacity-25"
                style={{ background: index === events.length - 1 ? 'transparent' : 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)', letterSpacing: '0.1em' }}>
                NEXT <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
      </>}
      </>}
    </div>
    </>
  )
}
