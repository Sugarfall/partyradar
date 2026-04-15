'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Calendar, MapPin, Users, Star, Lock, ExternalLink } from 'lucide-react'
import type { Event } from '@partyradar/shared'

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  skiddle:      { label: 'Skiddle',      color: '#e91e63' },
  ticketmaster: { label: 'Ticketmaster', color: '#026cdf' },
  eventbrite:   { label: 'Eventbrite',   color: '#f05537' },
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

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function useCountdown(startsAt: string) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    function calc() {
      const diff = new Date(startsAt).getTime() - Date.now()
      if (diff <= 0) { setLabel('Now'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      if (h > 48) setLabel('')
      else if (h > 0) setLabel(`${h}h ${m}m`)
      else setLabel(`${m}m`)
    }
    calc()
    const id = setInterval(calc, 60000)
    return () => clearInterval(id)
  }, [startsAt])
  return label
}

interface EventCardProps {
  event: Event
  compact?: boolean
}

export function EventCard({ event, compact = false }: EventCardProps) {
  const isFree = event.price === 0
  const color = TYPE_COLORS[event.type] ?? '#00e5ff'
  const countdown = useCountdown(event.startsAt)
  const showCountdown = countdown && (event as any).host?.subscriptionTier !== 'FREE'

  return (
    <Link href={`/events/${event.id}`}>
      <div
        className="relative overflow-hidden rounded-xl transition-all duration-200 group cursor-pointer"
        style={{
          background: '#07071a',
          border: `1px solid rgba(0,229,255,0.1)`,
          boxShadow: '0 0 20px rgba(0,0,0,0.5)',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.border = `1px solid ${color}40`
          el.style.boxShadow = `0 0 24px ${color}18`
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.border = '1px solid rgba(0,229,255,0.1)'
          el.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)'
        }}
      >
        {/* Cover */}
        {event.coverImageUrl && !compact && (
          <div className="relative h-36 overflow-hidden">
            <img
              src={event.coverImageUrl}
              alt={event.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              style={{ filter: 'brightness(0.6) saturate(1.1)' }}
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to bottom, rgba(4,4,13,0.05), rgba(4,4,13,0.85))' }}
            />
            <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
              <span
                className="text-[9px] font-bold px-2 py-0.5 rounded"
                style={{
                  color,
                  border: `1px solid ${color}50`,
                  background: `${color}12`,
                  letterSpacing: '0.1em',
                }}
              >
                {TYPE_LABELS[event.type]}
              </span>
              {event.isFeatured && (
                <span
                  className="text-[9px] font-bold px-2 py-0.5 rounded"
                  style={{
                    color: '#ffd600',
                    border: '1px solid rgba(255,214,0,0.4)',
                    background: 'rgba(255,214,0,0.08)',
                    letterSpacing: '0.1em',
                  }}
                >
                  ★ FEAT
                </span>
              )}
              {event.isInviteOnly && (
                <span
                  className="text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-0.5"
                  style={{ color: 'rgba(224,242,254,0.5)', border: '1px solid rgba(224,242,254,0.15)', background: 'rgba(4,4,13,0.5)', letterSpacing: '0.1em' }}
                >
                  <Lock size={8} /> PRIVATE
                </span>
              )}
            </div>
          </div>
        )}

        <div className="p-3">
          {/* Badges (no cover) */}
          {(!event.coverImageUrl || compact) && (
            <div className="flex gap-1.5 flex-wrap mb-2">
              <span
                className="text-[9px] font-bold px-2 py-0.5 rounded"
                style={{ color, border: `1px solid ${color}50`, background: `${color}10`, letterSpacing: '0.1em' }}
              >
                {TYPE_LABELS[event.type]}
              </span>
              {event.isFeatured && (
                <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ color: '#ffd600', border: '1px solid rgba(255,214,0,0.3)', background: 'rgba(255,214,0,0.06)', letterSpacing: '0.1em' }}>★ FEAT</span>
              )}
            </div>
          )}

          <h3 className="font-bold text-sm leading-tight mb-2 line-clamp-2" style={{ color: '#e0f2fe' }}>
            {event.name}
          </h3>

          {/* Host */}
          <div className="flex items-center gap-1.5 mb-2">
            {event.host.photoUrl ? (
              <img src={event.host.photoUrl} alt="" className="w-4 h-4 rounded object-cover" />
            ) : (
              <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: `${color}20` }}>
                <span className="text-[8px] font-bold" style={{ color }}>{event.host.displayName[0]}</span>
              </div>
            )}
            <span className="text-[11px] truncate" style={{ color: 'rgba(74,96,128,0.9)' }}>{event.host.displayName}</span>
            {event.hostRating && (
              <span className="text-[10px] flex items-center gap-0.5 ml-auto" style={{ color: '#ffd600' }}>
                <Star size={8} fill="currentColor" /> {event.hostRating.toFixed(1)}
              </span>
            )}
          </div>

          {/* Meta */}
          <div className="space-y-1 text-[11px]" style={{ color: 'rgba(74,96,128,0.8)' }}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Calendar size={10} style={{ color: 'rgba(0,229,255,0.4)' }} />
              <span>{formatDate(event.startsAt)}</span>
              {showCountdown && (
                <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.2)' }}>
                  {countdown === 'Now' ? '🔴 LIVE' : `⏱ ${countdown}`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin size={10} style={{ color: 'rgba(0,229,255,0.4)' }} />
              <span className="truncate">{event.neighbourhood}</span>
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between mt-3 pt-2"
            style={{ borderTop: '1px solid rgba(0,229,255,0.07)' }}
          >
            <span
              className="text-xs font-bold"
              style={{
                color: isFree ? '#00ff88' : '#e0f2fe',
                textShadow: isFree ? '0 0 8px rgba(0,255,136,0.5)' : 'none',
              }}
            >
              {isFree ? 'FREE' : `£${event.price.toFixed(2)}`}
            </span>
            <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'rgba(74,96,128,0.7)' }}>
              <Users size={9} />
              {event.guestCount ?? 0}/{event.capacity}
            </span>
          </div>

          {/* External source attribution (required by Skiddle/Ticketmaster ToS) */}
          {event.externalSource && SOURCE_LABELS[event.externalSource] && (
            <div className="mt-2 pt-1.5" style={{ borderTop: '1px solid rgba(0,229,255,0.05)' }}>
              {event.socialSourceUrl ? (
                <a
                  href={event.socialSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[9px] font-medium"
                  style={{ color: SOURCE_LABELS[event.externalSource]!.color, opacity: 0.75 }}
                >
                  <ExternalLink size={8} />
                  via {SOURCE_LABELS[event.externalSource]!.label}
                </a>
              ) : (
                <span className="text-[9px]" style={{ color: SOURCE_LABELS[event.externalSource]!.color, opacity: 0.65 }}>
                  via {SOURCE_LABELS[event.externalSource]!.label}
                </span>
              )}
            </div>
          )}

          {/* Vibe tags */}
          {event.vibeTags.length > 0 && !compact && (
            <div className="flex gap-1 flex-wrap mt-2">
              {event.vibeTags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    color: 'rgba(0,229,255,0.5)',
                    border: '1px solid rgba(0,229,255,0.12)',
                    background: 'rgba(0,229,255,0.04)',
                    letterSpacing: '0.06em',
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
