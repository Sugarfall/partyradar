'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar, MapPin, Users, Wine, ShieldCheck, Shirt,
  QrCode, ArrowLeft, Star, Share2, Lock, Loader2, Check,
  ChevronRight, Zap, Link2, ChevronDown, ChevronUp, UserCircle2,
  Megaphone, Radio, Eye, EyeOff, XCircle, AlertTriangle, MessageCircle, TrendingUp,
  Clock, Music, Package, Info, Navigation, Ticket, Sparkles, Heart, X
} from 'lucide-react'
import SaveButton from '@/components/events/SaveButton'
import { useEvent, updateEvent, cancelEvent } from '@/hooks/useEvents'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { uploadImage } from '@/lib/cloudinary'
import { DEV_MODE } from '@/lib/firebase'
import EventChat from '@/components/EventChat'
import InterestMatch from '@/components/InterestMatch'
import { ALCOHOL_POLICY_LABELS, AGE_RESTRICTION_LABELS, PUSH_BLAST_TIERS } from '@partyradar/shared'
import { formatPrice } from '@/lib/currency'
import type { PushBlastTier } from '@partyradar/shared'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'
import type { EventGuest } from '@partyradar/shared'

const TYPE_CONFIG: Record<string, { color: string; glow: string; label: string }> = {
  HOME_PARTY:  { color: '#ff006e', glow: 'rgba(255,0,110,0.25)',   label: 'HOME PARTY'  },
  CLUB_NIGHT:  { color: 'var(--accent)', glow: 'rgba(var(--accent-rgb),0.25)',   label: 'CLUB NIGHT'  },
  CONCERT:     { color: '#3d5afe', glow: 'rgba(61,90,254,0.25)',   label: 'CONCERT'     },
  PUB_NIGHT:   { color: '#f59e0b', glow: 'rgba(245,158,11,0.25)',  label: 'PUB NIGHT'   },
  BEACH_PARTY: { color: '#06b6d4', glow: 'rgba(6,182,212,0.25)',   label: 'BEACH PARTY' },
  YACHT_PARTY: { color: '#0ea5e9', glow: 'rgba(14,165,233,0.25)',  label: 'YACHT PARTY' },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function MetaCell({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="p-4 rounded-xl flex flex-col gap-2" style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
      <div className="flex items-center gap-1.5">
        <Icon size={11} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
        <span className="text-[9px] font-bold tracking-[0.18em]" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>{label}</span>
      </div>
      <p className="text-sm font-bold leading-tight" style={{ color: '#e0f2fe' }}>{value}</p>
    </div>
  )
}

const WMO: Record<number, { label: string; emoji: string }> = {
  0: { label: 'Clear sky', emoji: '☀️' },
  1: { label: 'Mainly clear', emoji: '🌤️' },
  2: { label: 'Partly cloudy', emoji: '⛅' },
  3: { label: 'Overcast', emoji: '☁️' },
  45: { label: 'Foggy', emoji: '🌫️' },
  48: { label: 'Foggy', emoji: '🌫️' },
  51: { label: 'Light drizzle', emoji: '🌦️' },
  61: { label: 'Light rain', emoji: '🌧️' },
  63: { label: 'Rain', emoji: '🌧️' },
  65: { label: 'Heavy rain', emoji: '🌧️' },
  71: { label: 'Light snow', emoji: '🌨️' },
  80: { label: 'Showers', emoji: '🌦️' },
  95: { label: 'Thunderstorm', emoji: '⛈️' },
  99: { label: 'Thunderstorm', emoji: '⛈️' },
}

function getWmo(code: number) {
  return WMO[code] ?? WMO[Math.floor(code / 10) * 10] ?? { label: 'Unknown', emoji: '🌡️' }
}

function WeatherWidget({ lat, lng, eventDate }: { lat: number; lng: number; eventDate: string }) {
  const [weather, setWeather] = useState<{ emoji: string; label: string; high: number; low: number } | null>(null)

  useEffect(() => {
    const targetDay = new Date(eventDate).toISOString().split('T')[0]!
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`
    )
      .then(r => r.json())
      .then((data) => {
        const idx = (data.daily.time as string[]).indexOf(targetDay)
        if (idx === -1) return
        const code = data.daily.weathercode[idx] as number
        const wmo = getWmo(code)
        setWeather({
          emoji: wmo.emoji,
          label: wmo.label,
          high: Math.round(data.daily.temperature_2m_max[idx] as number),
          low: Math.round(data.daily.temperature_2m_min[idx] as number),
        })
      })
      .catch(() => {})
  }, [lat, lng, eventDate])

  if (!weather) return null

  return (
    <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl"
      style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
      <span className="text-2xl">{weather.emoji}</span>
      <div className="flex-1">
        <p className="text-[9px] font-bold tracking-[0.15em] mb-0.5" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>WEATHER FORECAST</p>
        <p className="text-sm font-medium" style={{ color: '#e0f2fe' }}>{weather.label}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{weather.high}°</p>
        <p className="text-xs" style={{ color: 'rgba(224,242,254,0.4)' }}>{weather.low}°</p>
      </div>
    </div>
  )
}

function CountdownTimer({ startsAt, endsAt, color }: { startsAt: string; endsAt?: string | null; color: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const start = new Date(startsAt).getTime()
  const end = endsAt ? new Date(endsAt).getTime() : start + 6 * 3600000
  const isLive = now >= start && now <= end
  const isPast = now > end
  const diff = start - now

  if (isPast) return null

  if (isLive) {
    const remaining = end - now
    const h = Math.floor(remaining / 3600000)
    const m = Math.floor((remaining % 3600000) / 60000)
    return (
      <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl"
        style={{ background: 'rgba(255,0,110,0.06)', border: '1px solid rgba(255,0,110,0.25)' }}>
        <span className="w-3 h-3 rounded-full animate-pulse" style={{ background: '#ff006e', boxShadow: '0 0 12px #ff006e' }} />
        <div className="flex-1">
          <p className="text-[9px] font-bold tracking-[0.15em]" style={{ color: '#ff006e' }}>HAPPENING NOW</p>
          <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{h}h {m}m remaining</p>
        </div>
      </div>
    )
  }

  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)

  return (
    <div className="mb-5 p-4 rounded-xl" style={{ background: `${color}06`, border: `1px solid ${color}20` }}>
      <p className="text-[9px] font-bold tracking-[0.18em] mb-3 text-center" style={{ color: `${color}90` }}>STARTS IN</p>
      <div className="flex justify-center gap-3">
        {days > 0 && (
          <div className="text-center">
            <div className="text-2xl font-black tabular-nums" style={{ color: '#e0f2fe' }}>{days}</div>
            <div className="text-[8px] font-bold tracking-[0.15em] mt-0.5" style={{ color: `${color}60` }}>DAYS</div>
          </div>
        )}
        <div className="text-center">
          <div className="text-2xl font-black tabular-nums" style={{ color: '#e0f2fe' }}>{hours}</div>
          <div className="text-[8px] font-bold tracking-[0.15em] mt-0.5" style={{ color: `${color}60` }}>HRS</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-black tabular-nums" style={{ color: '#e0f2fe' }}>{mins}</div>
          <div className="text-[8px] font-bold tracking-[0.15em] mt-0.5" style={{ color: `${color}60` }}>MIN</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-black tabular-nums" style={{ color }}>{ secs}</div>
          <div className="text-[8px] font-bold tracking-[0.15em] mt-0.5" style={{ color: `${color}60` }}>SEC</div>
        </div>
      </div>
    </div>
  )
}

function MiniLocationMap({ lat, lng, address, color }: { lat: number; lng: number; address: string; color: string }) {
  const [imgFailed, setImgFailed] = useState(false)
  const token = process.env['NEXT_PUBLIC_MAPBOX_TOKEN']
  // Only use Mapbox if token is present and color is a hex (not a CSS variable)
  const hexColor = color.startsWith('#') ? color.replace('#', '') : '8b5cf6'
  const mapUrl = token && !imgFailed
    ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/pin-s+${hexColor}(${lng},${lat})/${lng},${lat},14,0/400x200@2x?access_token=${token}`
    : null

  const mapsHref = `https://maps.google.com/?q=${encodeURIComponent(address)}`

  return (
    <div className="mb-5 rounded-xl overflow-hidden" style={{ border: `1px solid ${color}20` }}>
      {mapUrl ? (
        <a href={mapsHref} target="_blank" rel="noopener noreferrer">
          <img
            src={mapUrl}
            alt={address}
            className="w-full h-[140px] object-cover"
            style={{ filter: 'brightness(0.85) saturate(1.3)' }}
            onError={() => setImgFailed(true)}
          />
        </a>
      ) : (
        /* Fallback: styled address block when map image can't load */
        <a href={mapsHref} target="_blank" rel="noopener noreferrer"
          className="w-full h-[80px] flex items-center justify-center gap-3 no-underline"
          style={{ background: `${color}08` }}>
          <MapPin size={20} style={{ color, opacity: 0.6 }} />
          <div>
            <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{address}</p>
            <p className="text-[10px] font-bold tracking-widest" style={{ color: `${color}80` }}>TAP TO OPEN MAPS →</p>
          </div>
        </a>
      )}
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'rgba(4,4,13,0.9)' }}>
        <Navigation size={11} style={{ color: `${color}80` }} />
        <span className="text-xs font-medium truncate" style={{ color: 'rgba(224,242,254,0.7)' }}>{address}</span>
        <a href={mapsHref} target="_blank" rel="noopener noreferrer"
          className="ml-auto text-[9px] font-bold shrink-0 px-2 py-1 rounded"
          style={{ color, border: `1px solid ${color}40`, letterSpacing: '0.1em' }}>
          OPEN MAP
        </a>
      </div>
    </div>
  )
}

function EventHighlights({ event, color }: { event: any; color: string }) {
  const highlights: { icon: any; text: string }[] = []

  // Duration
  if (event.endsAt) {
    const durationHrs = Math.round((new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) / 3600000)
    if (durationHrs > 0) highlights.push({ icon: Clock, text: `${durationHrs} hour${durationHrs > 1 ? 's' : ''} of ${event.type === 'CONCERT' ? 'live music' : event.type === 'HOME_PARTY' ? 'partying' : 'nightlife'}` })
  }

  // Tickets
  if (event.price > 0 && event.ticketsRemaining > 0) {
    highlights.push({ icon: Ticket, text: `${event.ticketsRemaining} tickets remaining` })
  } else if (event.price === 0) {
    highlights.push({ icon: Sparkles, text: 'Free entry — no ticket needed' })
  }

  // Going / interest vibe
  if ((event.guestCount ?? 0) >= 50) highlights.push({ icon: Zap, text: 'Very popular — lots of people going!' })
  else if ((event.guestCount ?? 0) >= 10) highlights.push({ icon: Users, text: `${event.guestCount} people going` })

  // Lineup
  if ((event as any).lineup) highlights.push({ icon: Music, text: (event as any).lineup })

  // Dress code
  if (event.dressCode) highlights.push({ icon: Shirt, text: `Dress code: ${event.dressCode}` })

  // Age
  if (event.ageRestriction !== 'ALL_AGES') {
    highlights.push({ icon: ShieldCheck, text: event.ageRestriction === 'AGE_18' ? 'Over 18s only — ID required' : 'Over 21s only — ID required' })
  }

  // Alcohol
  if (event.alcoholPolicy === 'PROVIDED') highlights.push({ icon: Wine, text: 'Drinks provided at the venue' })
  else if (event.alcoholPolicy === 'BYOB') highlights.push({ icon: Wine, text: 'BYOB — bring your own drinks' })

  if (highlights.length === 0) return null

  return (
    <div className="mb-5 p-4 rounded-xl" style={{ background: `${color}05`, border: `1px solid ${color}15` }}>
      <p className="text-[9px] font-bold tracking-[0.18em] mb-3" style={{ color: `${color}80` }}>EVENT HIGHLIGHTS</p>
      <div className="space-y-2.5">
        {highlights.map((h, i) => (
          <div key={i} className="flex items-start gap-3">
            <h.icon size={13} className="shrink-0 mt-0.5" style={{ color: `${color}70` }} />
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(224,242,254,0.75)' }}>{h.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

interface HighlightPost {
  id: string
  userId: string
  userName: string
  userPhoto?: string
  imageUrl: string
  caption?: string
  likes: number
  createdAt: string
}

function HighlightsOfTheNight({ event, color }: { event: any; color: string }) {
  const [highlights, setHighlights] = useState<HighlightPost[]>([])
  const [viewingIdx, setViewingIdx] = useState<number | null>(null)
  const [liked, setLiked] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  const { dbUser } = useAuth()
  const scrollRef = useRef<HTMLDivElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Map raw API post shape to flat HighlightPost interface
  function mapPost(p: any): HighlightPost {
    return {
      id: p.id,
      userId: p.userId ?? p.user?.id ?? '',
      userName: p.user?.displayName ?? 'User',
      userPhoto: p.user?.photoUrl ?? undefined,
      imageUrl: p.imageUrl ?? '',
      caption: p.text ?? undefined,
      likes: p._count?.likes ?? 0,
      createdAt: p.createdAt,
    }
  }

  useEffect(() => {
    // Fetch highlights from API — filter to image-only posts
    api.get<{ data: any[] }>(`/posts/event/${event.id}?limit=20`)
      .then(r => {
        const mapped = (r?.data ?? []).filter((p) => p.imageUrl).map(mapPost)
        if (mapped.length > 0) setHighlights(mapped)
        else throw new Error('no images')
      })
      .catch(() => {
        // Demo highlights for dev mode
        setHighlights([
          {
            id: 'h1', userId: 'u1', userName: 'Sophie L', userPhoto: undefined,
            imageUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&h=500&fit=crop&crop=center',
            caption: 'The vibes tonight 🔥🔥', likes: 24,
            createdAt: new Date(Date.now() - 1800000).toISOString(),
          },
          {
            id: 'h2', userId: 'u2', userName: 'DJ Marco', userPhoto: undefined,
            imageUrl: 'https://images.unsplash.com/photo-1571266028243-3716f02d2d74?w=400&h=500&fit=crop&crop=center',
            caption: 'Behind the decks 🎧', likes: 41,
            createdAt: new Date(Date.now() - 1200000).toISOString(),
          },
          {
            id: 'h3', userId: 'u3', userName: 'Alex R', userPhoto: undefined,
            imageUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=500&fit=crop&crop=center',
            caption: 'Crowd going crazy', likes: 18,
            createdAt: new Date(Date.now() - 600000).toISOString(),
          },
          {
            id: 'h4', userId: 'u4', userName: 'Jamie K', userPhoto: undefined,
            imageUrl: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=400&h=500&fit=crop&crop=center',
            caption: 'Light show is insane 💡', likes: 33,
            createdAt: new Date(Date.now() - 300000).toISOString(),
          },
          {
            id: 'h5', userId: 'u5', userName: 'Mia Chen', userPhoto: undefined,
            imageUrl: 'https://images.unsplash.com/photo-1504680177321-2e6a879aac86?w=400&h=500&fit=crop&crop=center',
            caption: 'Best night out 🌙', likes: 12,
            createdAt: new Date(Date.now() - 120000).toISOString(),
          },
        ])
      })
  }, [event.id])

  function toggleLike(id: string) {
    setLiked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  if (highlights.length === 0) return null

  const viewing = viewingIdx !== null ? highlights[viewingIdx] : null

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-bold tracking-[0.18em]" style={{ color: `${color}80` }}>
            📸 HIGHLIGHTS OF THE NIGHT
          </p>
          <span className="text-[9px] font-bold" style={{ color: 'rgba(224,242,254,0.3)' }}>
            {highlights.length} photos
          </span>
        </div>

        {/* Horizontal scrolling story-style thumbnails */}
        <div ref={scrollRef} className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4">
          {/* Upload button */}
          {dbUser && (
            <>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  e.target.value = ''
                  setUploading(true)
                  try {
                    const imageUrl = await uploadImage(file, 'events')
                    const res = await api.post<{ data: any }>('/posts', { eventId: event.id, imageUrl })
                    if (res?.data) setHighlights((prev) => [mapPost(res.data), ...prev])
                  } catch {}
                  finally { setUploading(false) }
                }}
              />
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploading}
                className="shrink-0 flex flex-col items-center justify-center gap-1.5 rounded-xl transition-opacity disabled:opacity-50"
                style={{
                  width: 80, height: 110,
                  background: `${color}08`, border: `2px dashed ${color}30`,
                }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
                  style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                  <span style={{ color }}>{uploading ? '…' : '+'}</span>
                </div>
                <span className="text-[8px] font-bold" style={{ color: `${color}60`, letterSpacing: '0.08em' }}>
                  {uploading ? 'UPLOADING' : 'ADD'}
                </span>
              </button>
            </>
          )}

          {/* Photo thumbnails */}
          {highlights.map((h, i) => (
            <button key={h.id} onClick={() => setViewingIdx(i)}
              className="shrink-0 rounded-xl overflow-hidden relative group"
              style={{ width: 80, height: 110 }}>
              <img src={h.imageUrl} alt="" className="w-full h-full object-cover" />
              {/* Gradient overlay */}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.7) 100%)' }} />
              {/* User ring */}
              <div className="absolute top-1.5 left-1.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold"
                  style={{ background: 'rgba(0,0,0,0.5)', border: `2px solid ${color}`, color: '#e0f2fe' }}>
                  {h.userName[0]}
                </div>
              </div>
              {/* Bottom info */}
              <div className="absolute bottom-1.5 left-1.5 right-1.5">
                <p className="text-[8px] font-bold truncate" style={{ color: '#fff' }}>{h.userName}</p>
                <p className="text-[7px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{timeAgo(h.createdAt)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Fullscreen viewer overlay ── */}
      {viewing && viewingIdx !== null && (
        <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: 'rgba(0,0,0,0.95)' }}>
          {/* Progress bar */}
          <div className="flex gap-1 px-3 pt-3 pb-1">
            {highlights.map((_, i) => (
              <div key={i} className="flex-1 h-0.5 rounded-full"
                style={{ background: i <= viewingIdx ? color : 'rgba(255,255,255,0.15)' }} />
            ))}
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: `${color}20`, border: `2px solid ${color}`, color }}>
                {viewing.userName[0]}
              </div>
              <div>
                <p className="text-xs font-bold" style={{ color: '#fff' }}>{viewing.userName}</p>
                <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{timeAgo(viewing.createdAt)}</p>
              </div>
            </div>
            <button onClick={() => setViewingIdx(null)} style={{ color: 'rgba(255,255,255,0.7)', padding: 4 }}>
              <X size={20} />
            </button>
          </div>

          {/* Image */}
          <div className="flex-1 flex items-center justify-center px-4 relative"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - rect.left
              if (x < rect.width / 3) setViewingIdx(Math.max(0, viewingIdx - 1))
              else if (x > rect.width * 2 / 3) {
                if (viewingIdx >= highlights.length - 1) setViewingIdx(null)
                else setViewingIdx(viewingIdx + 1)
              }
            }}>
            <img src={viewing.imageUrl} alt="" className="max-w-full max-h-full rounded-xl object-contain" />
          </div>

          {/* Caption + actions */}
          <div className="px-4 py-4">
            {viewing.caption && (
              <p className="text-sm mb-3" style={{ color: '#e0f2fe' }}>{viewing.caption}</p>
            )}
            <div className="flex items-center gap-4">
              <button onClick={() => toggleLike(viewing.id)} className="flex items-center gap-1.5">
                <Heart size={18} fill={liked.has(viewing.id) ? '#ff006e' : 'none'} style={{ color: liked.has(viewing.id) ? '#ff006e' : 'rgba(255,255,255,0.6)' }} />
                <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {viewing.likes + (liked.has(viewing.id) ? 1 : 0)}
                </span>
              </button>
              <span className="text-[9px] font-bold px-2 py-1 rounded" style={{ background: `${color}15`, border: `1px solid ${color}30`, color, letterSpacing: '0.08em' }}>
                📍 {event.name}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function VenueCommunityChat({ venueId, venueName }: { venueId: string; venueName: string }) {
  interface VenuePost { id: string; user: { displayName: string; photoUrl?: string | null }; text?: string | null; createdAt: string }
  const [posts, setPosts] = useState<VenuePost[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const { dbUser } = useAuth()

  useEffect(() => {
    api.get<{ data: VenuePost[] }>(`/posts/venue/${venueId}?limit=20`)
      .then((r) => setPosts((r?.data ?? []).filter((p) => p.text)))
      .catch(() => {})
  }, [venueId])

  async function sendPost() {
    const text = input.trim()
    if (!text || !dbUser || sending) return
    setSending(true)
    setInput('')
    try {
      const res = await api.post<{ data: VenuePost }>('/posts', { text, venueId })
      if (res?.data) setPosts((prev) => [res.data, ...prev])
    } catch {}
    finally { setSending(false) }
  }

  const visiblePosts = expanded ? posts : posts.slice(0, 3)

  function timeAgoShort(iso: string) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (m < 1) return 'now'
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
  }

  return (
    <div style={{ background: 'rgba(4,4,13,0.6)' }}>
      {/* Posts */}
      <div className="px-4 py-3 space-y-3 max-h-60 overflow-y-auto">
        {posts.length === 0 && (
          <p className="text-center text-[10px] py-2" style={{ color: 'rgba(74,96,128,0.4)' }}>
            No posts yet — be the first!
          </p>
        )}
        {!expanded && posts.length > 3 && (
          <button onClick={() => setExpanded(true)}
            className="w-full text-center text-[9px] font-bold tracking-widest py-1"
            style={{ color: 'rgba(255,214,0,0.5)' }}>
            ▲ SHOW {posts.length - 3} MORE
          </button>
        )}
        {visiblePosts.map((p) => (
          <div key={p.id} className="flex gap-2.5">
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold overflow-hidden"
              style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'var(--accent)' }}>
              {p.user.photoUrl
                ? <img src={p.user.photoUrl} alt="" className="w-full h-full object-cover" />
                : p.user.displayName[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold" style={{ color: '#e0f2fe' }}>{p.user.displayName}</span>
                <span className="text-[9px]" style={{ color: 'rgba(74,96,128,0.5)' }}>{timeAgoShort(p.createdAt)}</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(224,242,254,0.65)' }}>{p.text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,214,0,0.08)' }}>
        {!dbUser ? (
          <p className="flex-1 text-center text-[10px] font-bold" style={{ color: 'rgba(74,96,128,0.4)', letterSpacing: '0.08em' }}>
            LOG IN TO CHAT
          </p>
        ) : (
          <>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendPost() }}
              placeholder={`Say something in ${venueName}...`}
              maxLength={200}
              className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
              style={{ background: 'rgba(4,4,13,0.8)', border: '1px solid rgba(255,214,0,0.12)', color: '#e0f2fe', caretColor: '#ffd600' }}
            />
            <button
              onClick={sendPost}
              disabled={!input.trim() || sending}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: input.trim() ? 'rgba(255,214,0,0.12)' : 'rgba(255,214,0,0.04)',
                border: `1px solid ${input.trim() ? 'rgba(255,214,0,0.35)' : 'rgba(255,214,0,0.08)'}`,
                color: input.trim() ? '#ffd600' : 'rgba(255,214,0,0.25)',
              }}>
              <Zap size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function EventDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { dbUser } = useAuth()
  const { event, isLoading, error, mutate } = useEvent(params['id'] as string)

  const [rsvpLoading, setRsvpLoading] = useState(false)
  const [ticketLoading, setTicketLoading] = useState(false)
  const [ticketQty, setTicketQty] = useState(1)
  const [rsvpDone, setRsvpDone] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [guestListOpen, setGuestListOpen] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [blastOpen, setBlastOpen] = useState(false)
  const [blastTier, setBlastTier] = useState<PushBlastTier>(PUSH_BLAST_TIERS[0]!)
  const [blastMessage, setBlastMessage] = useState('')
  const [blastLoading, setBlastLoading] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [publishLoading, setPublishLoading] = useState(false)
  const [friendsGoing, setFriendsGoing] = useState<{ count: number; friends: Array<{ id: string; displayName: string; photoUrl: string | null }> }>({ count: 0, friends: [] })
  const [msgOpen, setMsgOpen] = useState(false)
  const [msgText, setMsgText] = useState('')
  const [msgSending, setMsgSending] = useState(false)
  const [msgSent, setMsgSent] = useState(false)
  const [interested, setInterested] = useState(false)

  const isHostView = !!dbUser && event?.hostId === dbUser.id

  useEffect(() => {
    if (!dbUser || !event) return
    api.get<{ data: { count: number; friends: Array<{ id: string; displayName: string; photoUrl: string | null }> } }>(
      `/events/${event.id}/friends-going`
    ).then(r => setFriendsGoing(r.data)).catch(() => {})
  }, [dbUser, event?.id])

  const { data: guestData } = useSWR<{ data: EventGuest[] }>(
    isHostView && guestListOpen ? `/events/${params['id']}/guests` : null,
    fetcher
  )

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
        <p className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>LOADING EVENT...</p>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm font-bold tracking-widest" style={{ color: 'rgba(255,0,110,0.7)' }}>EVENT NOT FOUND</p>
        <Link href="/discover" className="btn-primary text-xs px-4 py-2" style={{ letterSpacing: '0.1em' }}>
          ← BACK TO DISCOVER
        </Link>
      </div>
    )
  }

  const tc = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.CLUB_NIGHT
  const isHost = dbUser?.id === event.hostId
  const isFree = event.price === 0
  const capacityPct = Math.round(((event.guestCount ?? 0) / event.capacity) * 100)
  const isFull = capacityPct >= 100

  async function handleRSVP() {
    if (!dbUser) { router.push('/login'); return }
    setRsvpLoading(true)
    setActionError(null)
    try {
      await api.post(`/events/${event!.id}/guests/rsvp`)
      await mutate()
      setRsvpDone(true)
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'RSVP failed')
    } finally {
      setRsvpLoading(false)
    }
  }

  async function handleTicketCheckout() {
    if (!dbUser) { router.push('/login'); return }
    setTicketLoading(true)
    try {
      const res = await api.post<{ data: { url: string } }>('/tickets/checkout', { eventId: event!.id, quantity: ticketQty })
      window.location.href = res.data.url
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Checkout failed')
      setTicketLoading(false)
    }
  }

  async function handleInviteLink() {
    setInviteLoading(true)
    try {
      const res = await api.post<{ data: { inviteToken: string } }>(`/events/${event!.id}/guests/invite/link`, {})
      const link = `${window.location.origin}/events/invite/${res.data.inviteToken}`
      await navigator.clipboard.writeText(link)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2500)
    } catch {
      // Fallback: copy current URL
      await navigator.clipboard.writeText(window.location.href)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2500)
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleCancel() {
    if (!cancelConfirm) { setCancelConfirm(true); return }
    setCancelLoading(true)
    try {
      await cancelEvent(event!.id)
      if (!DEV_MODE) await mutate()
      else router.push('/host')
      setCancelConfirm(false)
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Cancel failed')
    } finally {
      setCancelLoading(false)
    }
  }

  async function handleTogglePublish() {
    setPublishLoading(true)
    try {
      await updateEvent(event!.id, { isPublished: !event!.isPublished } as any)
      if (!DEV_MODE) await mutate()
      else router.refresh()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setPublishLoading(false)
    }
  }

  async function handleBlast() {
    if (!blastMessage.trim()) return
    setBlastLoading(true)
    try {
      const res = await api.post<{ data: { url: string } }>('/notifications/blast', {
        eventId: event!.id,
        tierId: blastTier.id,
        message: blastMessage.trim(),
      })
      window.location.href = res.data.url
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Blast failed')
      setBlastLoading(false)
    }
  }

  async function handleMessageGuests() {
    if (!msgText.trim()) return
    setMsgSending(true)
    try {
      await api.post<{ data: { sent: number } }>('/messages/guests', {
        eventId: event!.id,
        message: msgText.trim(),
      })
      setMsgSent(true)
      setMsgText('')
      setTimeout(() => { setMsgOpen(false); setMsgSent(false) }, 2000)
    } catch {
      // ignore
    } finally {
      setMsgSending(false)
    }
  }

  function addToCalendar() {
    const e = event!
    const start = new Date(e.startsAt).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const end = e.endsAt
      ? new Date(e.endsAt).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
      : new Date(new Date(e.startsAt).getTime() + 3 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const location = e.showNeighbourhoodOnly ? e.neighbourhood : (e.address ?? e.neighbourhood)
    const url = window.location.href
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//PartyRadar//EN',
      'BEGIN:VEVENT',
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${e.name}`,
      `DESCRIPTION:${e.description?.replace(/\n/g, '\\n').slice(0, 500) ?? ''}`,
      `LOCATION:${location}`,
      `URL:${url}`,
      `UID:${e.id}@partyradar`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const blob = new Blob([ics], { type: 'text/calendar' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${e.name.replace(/[^a-z0-9]/gi, '-')}.ics`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function handleShare() {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: event!.name, url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {}
  }

  return (
    <div className="min-h-screen pb-32" style={{ background: '#04040d' }}>
      {/* ── Hero image ── */}
      <div className="relative" style={{ height: 280 }}>
        {event.coverImageUrl ? (
          <img src={event.coverImageUrl} alt={event.name} className="w-full h-full object-cover"
            style={{ filter: 'brightness(0.5) saturate(1.2)' }} />
        ) : (
          <div className="w-full h-full relative overflow-hidden"
            style={{ background: `radial-gradient(ellipse at 30% 50%, ${tc.color}20 0%, #04040d 70%)` }}>
            {/* Decorative pattern */}
            <div className="absolute inset-0" style={{ opacity: 0.04, backgroundImage: `repeating-linear-gradient(45deg, ${tc.color} 0px, ${tc.color} 1px, transparent 1px, transparent 20px)` }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-6xl opacity-20">
              {event.type === 'HOME_PARTY' ? '🏠' : event.type === 'CONCERT' ? '🎵' : '🎧'}
            </div>
          </div>
        )}
        {/* Gradient fade to background */}
        <div className="absolute inset-0"
          style={{ background: `linear-gradient(to bottom, rgba(4,4,13,0.2) 0%, rgba(4,4,13,0.6) 60%, #04040d 100%)` }} />

        {/* Neon color overlay at top edge */}
        <div className="absolute top-0 inset-x-0 h-1"
          style={{ background: `linear-gradient(90deg, transparent, ${tc.color}, transparent)`, boxShadow: `0 0 20px ${tc.color}` }} />

        {/* Back button */}
        <Link href="/discover"
          className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200"
          style={{ background: 'rgba(4,4,13,0.7)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'rgba(var(--accent-rgb),0.7)', backdropFilter: 'blur(8px)' }}>
          <ArrowLeft size={12} /> DISCOVER
        </Link>

        {/* Share button */}
        <button onClick={handleShare}
          className="absolute top-4 right-4 p-2 rounded-lg transition-all duration-200 flex items-center gap-1.5"
          style={{ background: 'rgba(4,4,13,0.7)', border: '1px solid rgba(var(--accent-rgb),0.2)', backdropFilter: 'blur(8px)' }}>
          {copied
            ? <><Check size={13} style={{ color: '#00ff88' }} /><span className="text-[10px] font-bold" style={{ color: '#00ff88' }}>COPIED</span></>
            : <Share2 size={14} style={{ color: 'rgba(var(--accent-rgb),0.6)' }} />
          }
        </button>

        {/* Save button (guests only) */}
        {!isHost && event && (
          <div className="absolute top-4 right-14">
            <SaveButton eventId={event.id} />
          </div>
        )}

        {/* Type badge + featured overlay */}
        <div className="absolute bottom-4 left-4 flex gap-2 flex-wrap">
          <span className="text-[9px] font-bold px-2.5 py-1 rounded"
            style={{ color: tc.color, border: `1px solid ${tc.color}50`, background: `${tc.color}15`, letterSpacing: '0.15em', boxShadow: `0 0 10px ${tc.glow}` }}>
            {tc.label}
          </span>
          {event.isFeatured && (
            <span className="text-[9px] font-bold px-2.5 py-1 rounded"
              style={{ color: '#ffd600', border: '1px solid rgba(255,214,0,0.4)', background: 'rgba(255,214,0,0.1)', letterSpacing: '0.12em' }}>
              ★ FEATURED
            </span>
          )}
          {event.isInviteOnly && (
            <span className="text-[9px] font-bold px-2 py-1 rounded flex items-center gap-1"
              style={{ color: 'rgba(224,242,254,0.5)', border: '1px solid rgba(224,242,254,0.15)', background: 'rgba(4,4,13,0.6)' }}>
              <Lock size={9} /> INVITE ONLY
            </span>
          )}
          {event.isCancelled && (
            <span className="text-[9px] font-bold px-2.5 py-1 rounded"
              style={{ color: '#ff006e', border: '1px solid rgba(255,0,110,0.4)', background: 'rgba(255,0,110,0.1)', letterSpacing: '0.12em' }}>
              CANCELLED
            </span>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-2xl mx-auto px-4 -mt-2">
        {/* Title */}
        <h1 className="text-2xl font-black leading-tight mb-4" style={{ color: '#e0f2fe' }}>{event.name}</h1>

        {/* Host row */}
        <div className="flex items-center gap-3 mb-6 p-3 rounded-xl"
          style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
          {event.host.photoUrl ? (
            <img src={event.host.photoUrl} alt="" className="w-10 h-10 rounded-lg object-cover"
              style={{ border: `1px solid ${tc.color}40`, boxShadow: `0 0 8px ${tc.glow}` }} />
          ) : (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-base"
              style={{ background: `${tc.color}15`, border: `1px solid ${tc.color}40`, color: tc.color }}>
              {event.host.displayName[0]}
            </div>
          )}
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{event.host.displayName}</p>
            {event.hostRating && (
              <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: '#ffd600' }}>
                <Star size={10} fill="currentColor" /> {event.hostRating.toFixed(1)} host rating
              </p>
            )}
          </div>
          {/* Price */}
          <div className="text-right">
            <p className="text-xl font-black"
              style={{ color: isFree ? '#00ff88' : '#e0f2fe', textShadow: isFree ? '0 0 12px rgba(0,255,136,0.6)' : 'none' }}>
              {formatPrice(event.price)}
            </p>
            {!isFree && <p className="text-[10px] font-bold" style={{ color: 'rgba(74,96,128,0.6)' }}>PER TICKET</p>}
          </div>
        </div>

        {/* Countdown timer */}
        <CountdownTimer startsAt={event.startsAt} endsAt={event.endsAt} color={tc.color} />

        {/* Divider */}
        <div className="mb-5 h-px" style={{ background: `linear-gradient(90deg, transparent, ${tc.color}30, transparent)` }} />

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <MetaCell icon={Calendar} label="STARTS" value={formatDate(event.startsAt)} color={tc.color} />
          {event.endsAt && (
            <MetaCell icon={Clock} label="ENDS" value={formatDate(event.endsAt)} color={tc.color} />
          )}
          <MetaCell icon={MapPin} label="LOCATION" value={event.showNeighbourhoodOnly ? event.neighbourhood : (event.address ?? event.neighbourhood)} color={tc.color} />
          <MetaCell icon={Wine} label="ALCOHOL" value={ALCOHOL_POLICY_LABELS[event.alcoholPolicy] ?? event.alcoholPolicy} color={tc.color} />
          <MetaCell icon={ShieldCheck} label="AGE POLICY" value={AGE_RESTRICTION_LABELS[event.ageRestriction] ?? event.ageRestriction} color={tc.color} />
          <MetaCell icon={Users} label="GOING" value={`${event.guestCount ?? 0} ${(event.guestCount ?? 0) === 1 ? 'person' : 'people'}`} color={tc.color} />
        </div>

        {/* Quick actions row */}
        <div className="flex gap-2 mb-5 flex-wrap">
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(event.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'rgba(var(--accent-rgb),0.8)' }}
          >
            <MapPin size={13} /> Directions
          </a>
          <button
            onClick={addToCalendar}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'rgba(var(--accent-rgb),0.8)' }}
          >
            <Calendar size={13} /> Add to Calendar
          </button>
        </div>

        {/* Interested / Going social stats */}
        {((event.guestCount ?? 0) > 0 || (event as any).savesCount > 0) && (
          <div className="mb-6 p-4 rounded-xl flex items-center gap-6" style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
            {(event as any).savesCount > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xl font-black" style={{ color: '#ffd600' }}>{(event as any).savesCount}</span>
                <span className="text-[9px] font-bold tracking-[0.18em]" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>INTERESTED</span>
              </div>
            )}
            {(event.guestCount ?? 0) > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xl font-black" style={{ color: tc.color }}>{event.guestCount ?? 0}</span>
                <span className="text-[9px] font-bold tracking-[0.18em]" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>GOING</span>
              </div>
            )}
          </div>
        )}

        {/* Event highlights */}
        <EventHighlights event={event} color={tc.color} />

        {/* Mini location map */}
        {event.lat && event.lng && !event.showNeighbourhoodOnly && (
          <MiniLocationMap lat={event.lat} lng={event.lng} address={event.address ?? event.neighbourhood} color={tc.color} />
        )}

        {/* What to bring */}
        {event.whatToBring && event.whatToBring.length > 0 && (
          <div className="mb-5 p-4 rounded-xl" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.15)' }}>
            <p className="text-[9px] font-bold tracking-[0.18em] mb-3" style={{ color: 'rgba(168,85,247,0.6)' }}>WHAT TO BRING</p>
            <div className="space-y-2">
              {event.whatToBring.map((item: string, i: number) => (
                <div key={i} className="flex items-center gap-2.5">
                  <Package size={12} style={{ color: 'rgba(168,85,247,0.5)' }} />
                  <span className="text-sm" style={{ color: 'rgba(224,242,254,0.75)' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Friends going */}
        {friendsGoing.count > 0 && (
          <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
            <div className="flex -space-x-2">
              {friendsGoing.friends.slice(0, 3).map(f => (
                f.photoUrl
                  ? <img key={f.id} src={f.photoUrl} alt={f.displayName} className="w-7 h-7 rounded-full object-cover ring-2 ring-[#04040d]" />
                  : <div key={f.id} className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-[#04040d]"
                      style={{ background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)' }}>
                      {f.displayName[0]}
                    </div>
              ))}
            </div>
            <p className="text-xs" style={{ color: 'rgba(224,242,254,0.6)' }}>
              <span className="font-semibold" style={{ color: '#e0f2fe' }}>
                {friendsGoing.count === 1 ? friendsGoing.friends[0]?.displayName : `${friendsGoing.count} friends`}
              </span>
              {friendsGoing.count === 1 ? ' is' : ' are'} going
            </p>
          </div>
        )}

        {/* Gender ratio */}
        {event.genderRatio && event.genderRatio.total > 0 && (() => {
          const { male, female, nonBinary, total } = event.genderRatio!
          const malePct  = Math.round((male      / total) * 100)
          const femPct   = Math.round((female    / total) * 100)
          const nbPct    = Math.max(0, 100 - malePct - femPct)
          return (
            <div className="mb-6 p-4 rounded-xl" style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold tracking-[0.18em]" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>CROWD MIX</span>
                </div>
                <span className="text-[10px] font-bold" style={{ color: 'rgba(224,242,254,0.4)' }}>{total} attending</span>
              </div>
              {/* Ratio bar */}
              <div className="flex h-2 rounded-full overflow-hidden gap-px mb-3">
                {malePct > 0 && (
                  <div style={{ width: `${malePct}%`, background: '#3b82f6', boxShadow: '0 0 6px rgba(59,130,246,0.5)', transition: 'width 0.7s' }} />
                )}
                {femPct > 0 && (
                  <div style={{ width: `${femPct}%`, background: '#ec4899', boxShadow: '0 0 6px rgba(236,72,153,0.5)', transition: 'width 0.7s' }} />
                )}
                {nbPct > 0 && (
                  <div style={{ width: `${nbPct}%`, background: 'var(--accent)', boxShadow: '0 0 6px rgba(var(--accent-rgb),0.4)', transition: 'width 0.7s' }} />
                )}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#3b82f6', boxShadow: '0 0 4px rgba(59,130,246,0.6)' }} />
                  <span className="text-[10px] font-bold" style={{ color: 'rgba(59,130,246,0.8)' }}>♂ {malePct}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#ec4899', boxShadow: '0 0 4px rgba(236,72,153,0.6)' }} />
                  <span className="text-[10px] font-bold" style={{ color: 'rgba(236,72,153,0.8)' }}>♀ {femPct}%</span>
                </div>
                {nbPct > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 4px rgba(var(--accent-rgb),0.5)' }} />
                    <span className="text-[10px] font-bold" style={{ color: 'rgba(var(--accent-rgb),0.7)' }}>⚧ {nbPct}%</span>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* About */}
        <div className="mb-6 p-4 rounded-xl" style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
          <p className="text-[9px] font-bold tracking-[0.2em] mb-3" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>ABOUT THIS EVENT</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(224,242,254,0.75)' }}>{event.description}</p>
        </div>

        {/* Venue info card */}
        {(event as any).venue && (
          <div className="mb-5 rounded-xl overflow-hidden" style={{ border: `1px solid ${tc.color}15` }}>
            <div className="h-1" style={{ background: `linear-gradient(90deg, ${tc.color}60, transparent)` }} />
            <div className="p-4" style={{ background: 'rgba(4,4,13,0.8)' }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-[9px] font-bold tracking-[0.15em] mb-1" style={{ color: `${tc.color}80` }}>VENUE</p>
                  <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{(event as any).venue.name}</p>
                </div>
                {(event as any).venue.rating && (
                  <span className="text-xs font-bold flex items-center gap-1" style={{ color: '#ffd600' }}>
                    <Star size={10} fill="currentColor" /> {(event as any).venue.rating.toFixed(1)}
                  </span>
                )}
              </div>
              {(event as any).venue.vibeTags?.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-2">
                  {(event as any).venue.vibeTags.slice(0, 4).map((tag: string) => (
                    <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                      style={{ color: `${tc.color}80`, border: `1px solid ${tc.color}20`, background: `${tc.color}06` }}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <WeatherWidget lat={event.lat} lng={event.lng} eventDate={event.startsAt} />

        {/* Get home safe */}
        {event.lat && event.lng && (
          <a
            href={`https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${event.lat}&pickup[longitude]=${event.lng}&pickup[nickname]=${encodeURIComponent(event.showNeighbourhoodOnly ? event.neighbourhood : event.address ?? '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mb-5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
          >
            🚗 Get home safe
          </a>
        )}

        {/* Dress code */}
        {event.dressCode && (
          <div className="flex gap-3 mb-4 p-3 rounded-xl"
            style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
            <Shirt size={14} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} className="shrink-0 mt-0.5" />
            <div>
              <p className="text-[9px] font-bold tracking-[0.15em] mb-0.5" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>DRESS CODE</p>
              <p className="text-sm" style={{ color: '#e0f2fe' }}>{event.dressCode}</p>
            </div>
          </div>
        )}

        {/* House rules */}
        {event.houseRules && (
          <div className="mb-6 p-4 rounded-xl"
            style={{ background: 'rgba(255,214,0,0.04)', border: '1px solid rgba(255,214,0,0.15)' }}>
            <p className="text-[9px] font-bold tracking-[0.15em] mb-2" style={{ color: 'rgba(255,214,0,0.6)' }}>HOUSE RULES</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(224,242,254,0.7)' }}>{event.houseRules}</p>
          </div>
        )}

        {/* Party signals — HOME_PARTY only, visible to all on detail page */}
        {event.type === 'HOME_PARTY' && (event as any).partySigns?.length > 0 && (
          <div className="mb-6 p-4 rounded-xl" style={{ background: 'rgba(255,0,110,0.03)', border: '1px solid rgba(255,0,110,0.12)' }}>
            <p className="text-[9px] font-bold tracking-[0.2em] mb-3" style={{ color: 'rgba(255,0,110,0.5)' }}>WHAT'S HAPPENING</p>
            <div className="flex gap-3 flex-wrap">
              {(event as any).partySigns.map((code: string) => {
                const SIGNALS: Record<string, string> = { BAR:'🍾', GAMING:'🎮', GAMES:'🎲', FLOOR:'🕺', FIRE:'🔥', KARAOKE:'🎤', FOOD:'🍕', COSTUME:'🎭', LATENIGHT:'🌙', HOTTUB:'♨️', LIVE:'🎸', PONG:'🎯', POOL:'🏊', CHILL:'🌿', FLIRTY:'💋', SNACKS:'🍩' }
                return SIGNALS[code] ? (
                  <span key={code} className="text-2xl" title={code} style={{ filter: 'drop-shadow(0 0 6px rgba(255,0,110,0.4))' }}>
                    {SIGNALS[code]}
                  </span>
                ) : null
              })}
            </div>
          </div>
        )}

        {/* Lineup — club/concert */}
        {(event as any).lineup && (
          <div className="flex gap-3 mb-5 p-3 rounded-xl" style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
            <div>
              <p className="text-[9px] font-bold tracking-[0.15em] mb-0.5" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>LINEUP</p>
              <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{(event as any).lineup}</p>
            </div>
          </div>
        )}

        {/* Vibe tags */}
        {event.vibeTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {event.vibeTags.map((tag: string) => (
              <span key={tag} className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                style={{ color: `${tc.color}80`, border: `1px solid ${tc.color}20`, background: `${tc.color}06`, letterSpacing: '0.08em' }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* ── Highlights of the Night ── */}
        <HighlightsOfTheNight event={event} color={tc.color} />

        {/* ── Venue Community Chat ── */}
        {(event as any).venue && (
          <div className="mb-6 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,214,0,0.15)' }}>
            <div className="h-1" style={{ background: 'linear-gradient(90deg, rgba(255,214,0,0.5), transparent)' }} />
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(255,214,0,0.03)' }}>
              <div className="flex items-center gap-2">
                <MessageCircle size={13} style={{ color: 'rgba(255,214,0,0.6)' }} />
                <span className="text-[10px] font-black tracking-[0.15em]" style={{ color: '#ffd600' }}>VENUE COMMUNITY</span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.2)', color: 'rgba(255,214,0,0.7)' }}>
                  {(event as any).venue.name}
                </span>
              </div>
            </div>
            <VenueCommunityChat venueId={(event as any).venue.id} venueName={(event as any).venue.name} />
          </div>
        )}

        {/* Host controls */}
        {isHost && (
          <div className="mt-2 space-y-3">
            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Link href={`/events/${event.id}/scan`}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200"
                style={{ border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)', letterSpacing: '0.1em' }}>
                <QrCode size={13} /> SCAN TICKETS
              </Link>
              <Link href={`/events/${event.id}/edit`}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200"
                style={{ border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'rgba(var(--accent-rgb),0.6)', letterSpacing: '0.1em' }}>
                EDIT EVENT
              </Link>
              <Link href={`/events/${event.id}/analytics`}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200"
                style={{ border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'rgba(var(--accent-rgb),0.6)', letterSpacing: '0.1em' }}>
                <TrendingUp size={13} /> ANALYTICS
              </Link>
              <button
                onClick={handleInviteLink}
                disabled={inviteLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 disabled:opacity-50"
                style={{ border: `1px solid ${inviteCopied ? 'rgba(0,255,136,0.4)' : 'rgba(var(--accent-rgb),0.15)'}`, color: inviteCopied ? '#00ff88' : 'rgba(var(--accent-rgb),0.6)', letterSpacing: '0.1em' }}>
                {inviteLoading
                  ? <Loader2 size={12} className="animate-spin" />
                  : inviteCopied
                  ? <><Check size={12} /> LINK COPIED</>
                  : <><Link2 size={12} /> INVITE LINK</>
                }
              </button>
              {/* Message guests */}
              <button
                onClick={() => setMsgOpen(o => !o)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200"
                style={{ border: '1px solid rgba(168,85,247,0.3)', color: 'rgba(168,85,247,0.8)', letterSpacing: '0.1em' }}>
                <Megaphone size={13} /> MESSAGE GUESTS
              </button>
              {/* Live chat — host */}
              <EventChat eventId={event.id} eventName={event.name} hostId={event.hostId} hostName={event.host.displayName} />
              {/* Publish / Unpublish */}
              {!event.isCancelled && (
                <button
                  onClick={handleTogglePublish}
                  disabled={publishLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 disabled:opacity-50"
                  style={{
                    border: `1px solid ${event.isPublished ? 'rgba(255,214,0,0.3)' : 'rgba(0,255,136,0.3)'}`,
                    color: event.isPublished ? 'rgba(255,214,0,0.8)' : '#00ff88',
                    letterSpacing: '0.1em',
                  }}>
                  {publishLoading
                    ? <Loader2 size={12} className="animate-spin" />
                    : event.isPublished
                    ? <><EyeOff size={12} /> UNPUBLISH</>
                    : <><Eye size={12} /> PUBLISH</>
                  }
                </button>
              )}
              {/* Cancel event */}
              {!event.isCancelled && (
                <button
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 disabled:opacity-50"
                  style={{
                    border: `1px solid ${cancelConfirm ? 'rgba(255,0,110,0.6)' : 'rgba(255,0,110,0.2)'}`,
                    color: cancelConfirm ? '#ff006e' : 'rgba(255,0,110,0.5)',
                    background: cancelConfirm ? 'rgba(255,0,110,0.08)' : 'transparent',
                    letterSpacing: '0.1em',
                  }}>
                  {cancelLoading
                    ? <Loader2 size={12} className="animate-spin" />
                    : cancelConfirm
                    ? <><AlertTriangle size={12} /> CONFIRM CANCEL</>
                    : <><XCircle size={12} /> CANCEL EVENT</>
                  }
                </button>
              )}
            </div>

            {/* Message guests panel */}
            {msgOpen && (
              <div className="p-4 rounded-xl space-y-3"
                style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)' }}>
                <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(168,85,247,0.6)' }}>
                  MESSAGE ALL CONFIRMED GUESTS
                </p>
                <textarea
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  maxLength={200}
                  rows={3}
                  placeholder="e.g. Doors now open at 9pm — see you there! 🎉"
                  className="w-full px-3 py-2 rounded-lg text-sm resize-none focus:outline-none"
                  style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', color: '#e0f2fe' }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{msgText.length}/200</span>
                  <button
                    onClick={handleMessageGuests}
                    disabled={msgSending || !msgText.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-40 transition-all"
                    style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.35)', color: '#a855f7' }}>
                    {msgSent ? '✓ Sent!' : msgSending ? 'Sending...' : 'Send to all guests'}
                  </button>
                </div>
              </div>
            )}

            {/* Push blast panel */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,0,110,0.2)' }}>
              <button
                onClick={() => setBlastOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 transition-all"
                style={{ background: 'rgba(255,0,110,0.04)' }}>
                <div className="flex items-center gap-2">
                  <Megaphone size={12} style={{ color: 'rgba(255,0,110,0.6)' }} />
                  <span className="text-xs font-black tracking-widest" style={{ color: '#e0f2fe' }}>SEND BLAST</span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,0,110,0.12)', color: '#ff006e', border: '1px solid rgba(255,0,110,0.25)' }}>
                    PAID
                  </span>
                </div>
                {blastOpen
                  ? <ChevronUp size={14} style={{ color: 'rgba(255,0,110,0.4)' }} />
                  : <ChevronDown size={14} style={{ color: 'rgba(255,0,110,0.4)' }} />
                }
              </button>

              {blastOpen && (
                <div className="p-4 space-y-4" style={{ borderTop: '1px solid rgba(255,0,110,0.1)' }}>
                  {/* Tier selector */}
                  <div>
                    <p className="text-[9px] font-bold tracking-[0.18em] mb-2" style={{ color: 'rgba(255,0,110,0.5)' }}>
                      BLAST RADIUS
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {PUSH_BLAST_TIERS.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setBlastTier(t)}
                          className="p-3 rounded-xl text-left transition-all"
                          style={{
                            background: blastTier.id === t.id ? 'rgba(255,0,110,0.12)' : 'rgba(4,4,13,0.6)',
                            border: `1px solid ${blastTier.id === t.id ? 'rgba(255,0,110,0.5)' : 'rgba(255,0,110,0.1)'}`,
                            boxShadow: blastTier.id === t.id ? '0 0 12px rgba(255,0,110,0.15)' : 'none',
                          }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-black" style={{ color: blastTier.id === t.id ? '#ff006e' : 'rgba(224,242,254,0.6)' }}>
                              {t.label}
                            </span>
                            <span className="text-[11px] font-black" style={{ color: blastTier.id === t.id ? '#ff006e' : 'rgba(224,242,254,0.5)' }}>
                              £{t.price.toFixed(2)}
                            </span>
                          </div>
                          <p className="text-[9px]" style={{ color: 'rgba(74,96,128,0.7)' }}>{t.reach}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Message input */}
                  <div>
                    <p className="text-[9px] font-bold tracking-[0.18em] mb-2" style={{ color: 'rgba(255,0,110,0.5)' }}>
                      NOTIFICATION MESSAGE
                    </p>
                    <textarea
                      value={blastMessage}
                      onChange={(e) => setBlastMessage(e.target.value.slice(0, 120))}
                      placeholder="e.g. Party just started — doors open now, limited spots left! 🎉"
                      rows={3}
                      className="w-full resize-none rounded-xl px-3 py-2.5 text-xs outline-none transition-all"
                      style={{
                        background: 'rgba(4,4,13,0.8)',
                        border: '1px solid rgba(255,0,110,0.2)',
                        color: '#e0f2fe',
                        caretColor: '#ff006e',
                      }}
                    />
                    <p className="text-right text-[9px] mt-1" style={{ color: 'rgba(74,96,128,0.5)' }}>
                      {blastMessage.length}/120
                    </p>
                  </div>

                  {/* Estimated reach */}
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                    style={{ background: 'rgba(255,0,110,0.04)', border: '1px solid rgba(255,0,110,0.1)' }}>
                    <Radio size={11} style={{ color: 'rgba(255,0,110,0.5)' }} />
                    <span className="text-[10px] font-bold" style={{ color: 'rgba(224,242,254,0.5)' }}>ESTIMATED REACH</span>
                    <span className="ml-auto text-[11px] font-black" style={{ color: '#ff006e' }}>{blastTier.reach}</span>
                  </div>

                  {/* Pay & blast CTA */}
                  <button
                    onClick={handleBlast}
                    disabled={blastLoading || !blastMessage.trim()}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-xs transition-all duration-200 disabled:opacity-40"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,0,110,0.2), rgba(255,0,110,0.1))',
                      border: '1px solid rgba(255,0,110,0.45)',
                      color: '#ff006e',
                      boxShadow: '0 0 20px rgba(255,0,110,0.2)',
                      letterSpacing: '0.1em',
                    }}>
                    {blastLoading
                      ? <><Loader2 size={13} className="animate-spin" /> REDIRECTING TO PAYMENT...</>
                      : <><Megaphone size={13} /> PAY £{blastTier.price.toFixed(2)} &amp; BLAST →</>
                    }
                  </button>
                </div>
              )}
            </div>

            {/* Guest list toggle */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(var(--accent-rgb),0.12)' }}>
              <button
                onClick={() => setGuestListOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 transition-all"
                style={{ background: 'rgba(var(--accent-rgb),0.03)' }}>
                <div className="flex items-center gap-2">
                  <Users size={12} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
                  <span className="text-xs font-black tracking-widest" style={{ color: '#e0f2fe' }}>
                    GUEST LIST
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)' }}>
                    {event.guestCount ?? 0}
                  </span>
                </div>
                {guestListOpen
                  ? <ChevronUp size={14} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
                  : <ChevronDown size={14} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
                }
              </button>

              {guestListOpen && (
                <div style={{ borderTop: '1px solid rgba(var(--accent-rgb),0.08)' }}>
                  {!guestData ? (
                    <div className="flex items-center justify-center py-6 gap-2">
                      <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin"
                        style={{ color: 'rgba(var(--accent-rgb),0.3)' }} />
                      <span className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.3)' }}>LOADING...</span>
                    </div>
                  ) : guestData.data.length === 0 ? (
                    <div className="py-6 text-center">
                      <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.4)' }}>NO GUESTS YET</p>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto divide-y" style={{ borderColor: 'rgba(var(--accent-rgb),0.05)' }}>
                      {guestData.data.map((guest) => (
                        <div key={guest.id} className="flex items-center gap-3 px-4 py-2.5">
                          {(guest as any).user?.photoUrl ? (
                            <img src={(guest as any).user.photoUrl} alt=""
                              className="w-7 h-7 rounded-full object-cover shrink-0"
                              style={{ border: '1px solid rgba(var(--accent-rgb),0.2)' }} />
                          ) : (
                            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                              style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}>
                              <UserCircle2 size={14} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate" style={{ color: '#e0f2fe' }}>
                              {(guest as any).user?.displayName ?? 'Unknown'}
                            </p>
                            <p className="text-[10px]" style={{ color: 'rgba(74,96,128,0.6)' }}>
                              @{(guest as any).user?.username ?? '—'}
                            </p>
                          </div>
                          <span className="text-[9px] font-black px-2 py-0.5 rounded tracking-wide"
                            style={{
                              color: guest.status === 'CONFIRMED' ? '#00ff88' : guest.status === 'CANCELLED' ? '#ff006e' : 'rgba(255,214,0,0.8)',
                              background: guest.status === 'CONFIRMED' ? 'rgba(0,255,136,0.08)' : guest.status === 'CANCELLED' ? 'rgba(255,0,110,0.08)' : 'rgba(255,214,0,0.08)',
                              border: `1px solid ${guest.status === 'CONFIRMED' ? 'rgba(0,255,136,0.2)' : guest.status === 'CANCELLED' ? 'rgba(255,0,110,0.2)' : 'rgba(255,214,0,0.2)'}`,
                            }}>
                            {guest.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed action bar (guests only) ── */}
      {!isHost && !event.isCancelled && (
        <div
          className="z-30 px-4 py-3"
          style={{
            position: 'fixed',
            bottom: 64,
            left: 0,
            right: 0,
            background: 'rgba(4,4,13,0.96)',
            borderTop: '1px solid rgba(var(--accent-rgb),0.1)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="max-w-2xl mx-auto">
            {actionError && (
              <p className="text-xs font-medium mb-2 px-3 py-2 rounded-lg"
                style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
                {actionError}
              </p>
            )}

            {rsvpDone ? (
              <div className="flex items-center justify-center gap-3 py-3 rounded-xl"
                style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: '#00ff88', boxShadow: '0 0 16px rgba(0,255,136,0.5)' }}>
                  <Check size={14} color="#04040d" strokeWidth={3} />
                </div>
                <div>
                  <p className="text-sm font-black" style={{ color: '#00ff88' }}>YOU'RE GOING!</p>
                  <p className="text-[10px]" style={{ color: 'rgba(0,255,136,0.6)' }}>RSVP confirmed · See you there</p>
                </div>
                <Link href="/profile"
                  className="ml-auto text-[10px] font-bold flex items-center gap-1 px-3 py-1.5 rounded-lg"
                  style={{ border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>
                  VIEW <ChevronRight size={10} />
                </Link>
              </div>
            ) : isFull ? (
              <div className="space-y-2">
                <div className="flex items-center justify-center py-3 rounded-xl"
                  style={{ background: 'rgba(255,0,110,0.06)', border: '1px solid rgba(255,0,110,0.2)' }}>
                  <p className="text-sm font-black tracking-widest" style={{ color: '#ff006e' }}>EVENT IS FULL</p>
                </div>
                {!interested && (
                  <button onClick={() => setInterested(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all"
                    style={{ background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.25)', color: '#ffd600', letterSpacing: '0.1em' }}>
                    <Star size={13} /> INTERESTED — NOTIFY WHEN SPOTS OPEN
                  </button>
                )}
                {interested && (
                  <div className="flex items-center justify-center gap-2 py-3 rounded-xl"
                    style={{ background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.25)' }}>
                    <Check size={13} style={{ color: '#ffd600' }} />
                    <span className="text-xs font-black" style={{ color: '#ffd600' }}>INTERESTED — WE'LL NOTIFY YOU</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Going / Interested / Ticket row */}
                <div className="flex gap-2 mb-2">
                  {isFree ? (
                    <>
                      <button
                        onClick={handleRSVP}
                        disabled={rsvpLoading}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm transition-all duration-200 disabled:opacity-50"
                        style={{
                          background: 'linear-gradient(135deg, rgba(0,255,136,0.15), rgba(var(--accent-rgb),0.1))',
                          border: '1px solid rgba(0,255,136,0.45)',
                          color: '#00ff88',
                          boxShadow: '0 0 20px rgba(0,255,136,0.15)',
                          letterSpacing: '0.08em',
                        }}>
                        {rsvpLoading
                          ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /></>
                          : <><Check size={14} /> GOING</>
                        }
                      </button>
                      <button
                        onClick={() => setInterested(!interested)}
                        className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-black text-xs transition-all"
                        style={{
                          background: interested ? 'rgba(255,214,0,0.12)' : 'rgba(255,214,0,0.04)',
                          border: `1px solid ${interested ? 'rgba(255,214,0,0.5)' : 'rgba(255,214,0,0.2)'}`,
                          color: interested ? '#ffd600' : 'rgba(255,214,0,0.6)',
                          letterSpacing: '0.08em',
                        }}>
                        <Star size={13} fill={interested ? 'currentColor' : 'none'} />
                        {interested ? 'SAVED' : 'INTERESTED'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleTicketCheckout}
                        disabled={ticketLoading}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm transition-all duration-200 disabled:opacity-50"
                        style={{
                          background: `linear-gradient(135deg, ${tc.color}18, rgba(61,90,254,0.12))`,
                          border: `1px solid ${tc.color}50`,
                          color: tc.color,
                          boxShadow: `0 0 20px ${tc.glow}`,
                          letterSpacing: '0.08em',
                        }}>
                        {ticketLoading
                          ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /></>
                          : <><QrCode size={14} /> BUY TICKET — {formatPrice(event.price * ticketQty)}</>
                        }
                      </button>
                      <button
                        onClick={() => setInterested(!interested)}
                        className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-black text-xs transition-all"
                        style={{
                          background: interested ? 'rgba(255,214,0,0.12)' : 'rgba(255,214,0,0.04)',
                          border: `1px solid ${interested ? 'rgba(255,214,0,0.5)' : 'rgba(255,214,0,0.2)'}`,
                          color: interested ? '#ffd600' : 'rgba(255,214,0,0.6)',
                          letterSpacing: '0.08em',
                        }}>
                        <Star size={13} fill={interested ? 'currentColor' : 'none'} />
                      </button>
                    </>
                  )}
                </div>

                {/* Ticket qty selector for paid events */}
                {!isFree && (
                  <div className="flex items-center justify-center gap-3 mb-1">
                    <button onClick={() => setTicketQty(q => Math.max(1, q - 1))}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e0f2fe' }}>−</button>
                    <span className="text-xs font-bold w-14 text-center" style={{ color: '#e0f2fe' }}>
                      {ticketQty} ticket{ticketQty > 1 ? 's' : ''}
                    </span>
                    <button onClick={() => setTicketQty(q => Math.min(10, q + 1))}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e0f2fe' }}>+</button>
                  </div>
                )}

                {/* People going */}
                <div className="flex items-center justify-center gap-1.5">
                  <Users size={10} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
                  <span className="text-[10px] font-bold" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>
                    {(event.guestCount ?? 0) > 0
                      ? `${event.guestCount} going`
                      : 'Be the first to go'}
                  </span>
                </div>
              </>
            )}

            {/* Live chat */}
            <div className="mt-1.5 flex justify-center">
              <EventChat eventId={event.id} eventName={event.name} hostId={event.hostId} hostName={event.host.displayName} />
            </div>
          </div>
        </div>
      )}

      {/* Interest match toast (auto-shows in DEV_MODE after 10s) */}
      <InterestMatch eventId={event.id} />
    </div>
  )
}
