'use client'

import { Suspense, useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Map, { Marker } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  ArrowLeft, MapPin, Phone, Globe, Tag, Calendar, Ticket,
  CheckCircle, Building2, Loader2, AlertTriangle, X,
  ImageIcon, Send, Heart, Clock, Music2, Unlink2, Bell, BellOff, Users,
  ShoppingCart, Plus, Minus,
} from 'lucide-react'

import { api } from '@/lib/api'
import { formatPrice } from '@/lib/currency'
import NowPlayingWidget from '@/components/spotify/NowPlayingWidget'
import { useAuth } from '@/hooks/useAuth'
const MAPBOX_TOKEN = process.env['NEXT_PUBLIC_MAPBOX_TOKEN'] ?? ''

// ─── Types ────────────────────────────────────────────────────────────────────

type VenueType = 'BAR' | 'NIGHTCLUB' | 'CONCERT_HALL' | 'ROOFTOP_BAR' | 'PUB' | 'LOUNGE'
type EventType = 'HOME_PARTY' | 'CLUB_NIGHT' | 'CONCERT' | 'PUB_NIGHT'

interface UpcomingEvent {
  id: string
  name: string
  startsAt: string
  endsAt?: string | null
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
  description?: string
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
  spotifyConnected?: boolean
  spotifyDisplayName?: string
  followersCount?: number
  isFollowing?: boolean
}

interface VenuePost {
  id: string
  text?: string
  imageUrl?: string
  likesCount: number
  commentsCount: number
  createdAt: string
  _count?: { likes: number }
  /** Carousel media — show media[0] when imageUrl is absent */
  media?: { url: string; type: string; thumbnailUrl?: string }[]
  /** PostTags on this post — used to detect feed-tagged posts */
  tags?: { taggedVenueId?: string | null; taggedVenue?: { id: string; name: string } | null }[]
  user: { id: string; displayName: string; username: string; photoUrl?: string }
}

interface DrinkMenuItem {
  id: string
  name: string
  description?: string | null
  price: number
  category: string
  imageUrl?: string | null
  isAvailable: boolean
}

interface MenuPartnership {
  id: string
  isActive: boolean
  drinkMenuItems: DrinkMenuItem[]
  venue: { id: string; name: string; address: string; city: string; photoUrl?: string | null }
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
  CLUB_NIGHT:  'var(--accent)',
  CONCERT:     '#3d5afe',
  PUB_NIGHT:   '#f59e0b',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  })
}

/** Returns whether an event is currently live (started but not yet ended). */
function isLiveNow(event: UpcomingEvent): boolean {
  const now = Date.now()
  const startMs = new Date(event.startsAt).getTime()
  if (startMs > now) return false          // hasn't started yet
  if (event.endsAt) return new Date(event.endsAt).getTime() > now
  // No explicit end — treat as live within 5 h of start
  return now - startMs < 5 * 3_600_000
}

// ─── Opening Hours component ──────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function OpeningHours({ hours }: { hours: unknown }) {
  if (!hours) return null
  const todayIdx = new Date().getDay()

  let entries: { day: string; times: string }[] = []

  // Google Places weekday_text stored as { weekday_text: [...] } object
  if (typeof hours === 'object' && !Array.isArray(hours) && (hours as any).weekday_text) {
    const texts: string[] = (hours as any).weekday_text
    entries = texts.map((text: string) => {
      const colonIdx = text.indexOf(':')
      if (colonIdx === -1) return { day: text, times: 'Closed' }
      return { day: text.slice(0, colonIdx).trim(), times: text.slice(colonIdx + 1).trim() }
    })
  // Google Places weekday_text stored as a plain string array: ["Monday: 9am-5pm", ...]
  } else if (Array.isArray(hours) && hours.length > 0 && typeof hours[0] === 'string') {
    entries = (hours as string[]).map((text) => {
      const colonIdx = text.indexOf(':')
      if (colonIdx === -1) return { day: text, times: 'Closed' }
      return { day: text.slice(0, colonIdx).trim(), times: text.slice(colonIdx + 1).trim() }
    })
  // Array of period objects: [{ day: 0|"Monday", open: "18:00", close: "03:00" }]
  } else if (Array.isArray(hours)) {
    entries = (hours as any[]).map((h) => ({
      day: typeof h.day === 'number' ? (DAY_NAMES[h.day] ?? String(h.day)) : String(h.day ?? ''),
      times: h.open && h.close ? `${h.open} – ${h.close}` : h.times ?? 'Closed',
    }))
  // Plain key→value object: { monday: "11:00–23:00", tuesday: "Closed" }
  } else if (typeof hours === 'object' && !Array.isArray(hours)) {
    entries = Object.entries(hours as Record<string, unknown>).map(([k, v]) => ({
      day: k.charAt(0).toUpperCase() + k.slice(1).toLowerCase(),
      times: typeof v === 'string' ? v : 'Closed',
    }))
  }

  if (entries.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Clock size={14} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
        <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>OPENING HOURS</p>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
        {entries.map((e, i) => {
          const isToday = e.day.toLowerCase() === DAY_NAMES[todayIdx]?.toLowerCase()
          const isClosed = e.times.toLowerCase() === 'closed' || e.times === ''
          return (
            <div key={i} className="flex items-center justify-between px-4 py-2.5"
              style={{
                background: isToday ? 'rgba(var(--accent-rgb),0.06)' : i % 2 === 0 ? 'rgba(0,0,0,0)' : 'rgba(var(--accent-rgb),0.02)',
                borderBottom: i < entries.length - 1 ? '1px solid rgba(var(--accent-rgb),0.06)' : 'none',
              }}>
              <span className="text-sm font-bold" style={{ color: isToday ? 'var(--accent)' : 'rgba(224,242,254,0.6)' }}>
                {isToday ? `${e.day} (Today)` : e.day}
              </span>
              <span className="text-sm font-bold" style={{ color: isClosed ? 'rgba(255,0,110,0.6)' : isToday ? 'var(--accent)' : 'rgba(224,242,254,0.8)' }}>
                {isClosed ? 'Closed' : e.times}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Claim Modal ──────────────────────────────────────────────────────────────

function ClaimModal({
  venueId, venueName, onClose, onClaimed,
}: {
  venueId: string
  venueName: string
  onClose: () => void
  onClaimed: () => void
}) {
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimed, setClaimed] = useState(false)

  async function handleClaim() {
    setClaiming(true)
    setClaimError(null)
    try {
      await api.post(`/venues/${venueId}/claim`, {})
      setClaimed(true)
      setTimeout(onClaimed, 1200)
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : 'Claim failed. Please try again.')
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}>
      <div className="rounded-2xl p-6 max-w-sm w-full" style={{ background: '#111118', border: '1px solid rgba(var(--accent-rgb),0.2)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 size={16} style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-black tracking-widest" style={{ color: 'var(--accent)' }}>CLAIM VENUE</span>
          </div>
          <button onClick={onClose}><X size={16} style={{ color: 'rgba(74,96,128,0.6)' }} /></button>
        </div>
        <p className="text-sm font-bold mb-2" style={{ color: '#e0f2fe' }}>{venueName}</p>

        {claimed ? (
          <p className="text-xs font-bold py-3 text-center" style={{ color: '#00ff88' }}>✓ Venue claimed! Redirecting…</p>
        ) : (
          <>
            <p className="text-xs leading-relaxed mb-5" style={{ color: 'rgba(224,242,254,0.5)' }}>
              Claim ownership to manage events, update details, and access venue analytics.
            </p>
            {claimError && (
              <p className="text-xs px-3 py-2 rounded-lg mb-3" style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
                {claimError}
              </p>
            )}
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}
            >
              {claiming
                ? <><div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> CLAIMING…</>
                : 'CLAIM THIS VENUE →'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function VenueDetailInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = params['id'] as string
  const { dbUser } = useAuth()
  const [spotifyToast, setSpotifyToast] = useState<string | null>(
    searchParams.get('spotify') === 'connected' ? '✅ Spotify connected!' :
    searchParams.get('spotify_error') ? '❌ Spotify connection failed' : null
  )

  // Clear toast and query param after showing
  useEffect(() => {
    if (!spotifyToast) return
    const t = setTimeout(() => setSpotifyToast(null), 4000)
    return () => clearTimeout(t)
  }, [spotifyToast])

  const [venue, setVenue] = useState<Venue | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'events' | 'menu' | 'feed'>('events')
  const [posts, setPosts] = useState<VenuePost[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [postText, setPostText] = useState('')
  const [posting, setPosting] = useState(false)
  const [spotifyConnecting, setSpotifyConnecting] = useState(false)
  const [spotifyDisconnecting, setSpotifyDisconnecting] = useState(false)

  // ── Follow state ──
  const [isFollowing, setIsFollowing] = useState(false)
  const [followersCount, setFollowersCount] = useState(0)
  const [followLoading, setFollowLoading] = useState(false)

  // ── Venue events (separate fetch so we always get fresh data regardless of embed)
  const [venueEvents, setVenueEvents] = useState<UpcomingEvent[]>([])
  const [pastEvents, setPastEvents] = useState<UpcomingEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState<string | null>(null)

  // ── Menu / order state ──
  const [menuData, setMenuData] = useState<MenuPartnership | null | undefined>(undefined)
  const [menuLoading, setMenuLoading] = useState(false)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [ordering, setOrdering] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState<{ total: number; newBalance: number; pointsEarned: number; message: string } | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await api.get<{ data: Venue }>(`/venues/${id}`)
        const data = res?.data ?? null
        if (!data) { setNotFound(true); return }
        setVenue(data)
        setIsFollowing(data.isFollowing ?? false)
        setFollowersCount(data.followersCount ?? 0)
      } catch (err) {
        console.error('[VenueDetail] fetch error:', err)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  useEffect(() => {
    if (!id) return
    setEventsLoading(true)
    // Fetch live + upcoming events, then past events in parallel
    Promise.all([
      api.get<{ data: UpcomingEvent[] }>(`/events?venueId=${id}&limit=20`),
      api.get<{ data: UpcomingEvent[] }>(`/events?venueId=${id}&past=true&limit=10`),
    ])
      .then(([upcoming, past]) => {
        setVenueEvents(upcoming?.data ?? [])
        setPastEvents(past?.data ?? [])
      })
      .catch(() => setEventsError('Failed to load events'))
      .finally(() => setEventsLoading(false))
  }, [id])

  useEffect(() => {
    if (!id) return
    setPostsLoading(true)
    api.get<{ data: VenuePost[] }>(`/posts/venue/${id}?limit=20`)
      .then((json) => setPosts(json?.data ?? []))
      .catch(() => {})
      .finally(() => setPostsLoading(false))
  }, [id])

  // Load menu partnership (including available items) the first time menu tab opens
  useEffect(() => {
    if (activeTab !== 'menu' || menuData !== undefined) return
    setMenuLoading(true)
    api.get<{ data: MenuPartnership }>(`/partnerships/venue/${id}`)
      .then((json) => setMenuData(json?.data ?? null))
      .catch(() => setMenuData(null))
      .finally(() => setMenuLoading(false))
  }, [activeTab, id, menuData])

  // Load wallet balance once when menu tab opens (refreshed after a successful order)
  useEffect(() => {
    if (activeTab !== 'menu' || !dbUser || walletBalance !== null) return
    api.get<{ data: { balance: number } }>('/wallet')
      .then((json) => setWalletBalance(json?.data?.balance ?? 0))
      .catch(() => {})
  }, [activeTab, dbUser, walletBalance])

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d0d0f' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    )
  }

  // ── Not found ──
  if (notFound || !venue) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0d0d0f' }}>
        <AlertTriangle size={32} style={{ color: 'rgba(var(--accent-rgb),0.3)' }} />
        <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.6)' }}>VENUE NOT FOUND</p>
        <Link href="/venues" className="text-xs font-bold" style={{ color: 'var(--accent)' }}>← Back to Venues</Link>
      </div>
    )
  }

  const color = TYPE_COLORS[venue.type]
  const isOwner = !!(dbUser && venue.claimedById && dbUser.id === venue.claimedById)

  async function connectSpotify() {
    if (!isOwner || spotifyConnecting) return
    setSpotifyConnecting(true)
    try {
      const json = await api.get<{ data: { url: string } }>(`/spotify/connect-url/${id}`)
      if (json?.data?.url) window.location.href = json.data.url
    } catch {}
    finally { setSpotifyConnecting(false) }
  }

  async function disconnectSpotify() {
    if (!isOwner || spotifyDisconnecting) return
    setSpotifyDisconnecting(true)
    try {
      await api.delete(`/spotify/connect/${id}`)
      setVenue((v) => v ? { ...v, spotifyConnected: false, spotifyDisplayName: undefined } : v)
    } catch {}
    finally { setSpotifyDisconnecting(false) }
  }

  async function toggleFollow() {
    if (!dbUser) return
    setFollowLoading(true)
    try {
      if (isFollowing) {
        const res = await api.delete<{ data: { isFollowing: boolean; followersCount: number } }>(`/venues/${id}/follow`)
        setIsFollowing(res?.data?.isFollowing ?? false)
        setFollowersCount(res?.data?.followersCount ?? Math.max(0, followersCount - 1))
      } else {
        const res = await api.post<{ data: { isFollowing: boolean; followersCount: number } }>(`/venues/${id}/follow`, {})
        setIsFollowing(res?.data?.isFollowing ?? true)
        setFollowersCount(res?.data?.followersCount ?? followersCount + 1)
      }
    } catch {}
    finally { setFollowLoading(false) }
  }

  async function submitPost() {
    if (!postText.trim()) return
    setPosting(true)
    try {
      const json = await api.post<{ data: VenuePost }>('/posts', { text: postText.trim(), venueId: id })
      if (json?.data) {
        setPosts((prev) => [json.data, ...prev])
      }
      setPostText('')
    } catch {}
    finally { setPosting(false) }
  }

  function addToCart(itemId: string) {
    setCart((c) => ({ ...c, [itemId]: (c[itemId] ?? 0) + 1 }))
  }
  function removeFromCart(itemId: string) {
    setCart((c) => {
      const qty = (c[itemId] ?? 0) - 1
      if (qty <= 0) { const next = { ...c }; delete next[itemId]; return next }
      return { ...c, [itemId]: qty }
    })
  }
  async function placeOrder() {
    if (ordering || !menuData) return
    const cartEntries = Object.entries(cart).filter(([, q]) => q > 0)
    if (cartEntries.length === 0) return
    setOrdering(true)
    setOrderError(null)
    try {
      type OrderResult = { total: number; newBalance: number; pointsEarned: number; message: string }
      const json = await api.post<{ data: OrderResult }>(
        `/partnerships/venue/${id}/order`,
        { items: cartEntries.map(([itemId, qty]) => ({ itemId, qty })) },
      )
      if (json?.data) {
        setOrderSuccess(json.data)
        setCart({})
        setWalletBalance(json.data.newBalance)
      }
    } catch (err: unknown) {
      const msg = (err as any)?.message ?? 'Order failed. Please try again.'
      setOrderError(msg)
    } finally {
      setOrdering(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#0d0d0f', paddingTop: 56, paddingBottom: 88 }}>

      {claimOpen && (
        <ClaimModal
          venueId={venue.id}
          venueName={venue.name}
          onClose={() => setClaimOpen(false)}
          onClaimed={() => {
            setVenue((v) => v ? { ...v, isClaimed: true } : v)
            setClaimOpen(false)
          }}
        />
      )}

      {/* ─── Spotify toast ─── */}
      {spotifyToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-bold shadow-xl"
          style={{ background: 'rgba(7,7,26,0.95)', border: '1px solid rgba(30,215,96,0.3)', color: '#e0f2fe', backdropFilter: 'blur(12px)' }}>
          {spotifyToast}
        </div>
      )}

      {/* ─── Hero ─── */}
      <div className="relative h-52 md:h-72">
        {venue.photoUrl ? (
          <img src={venue.photoUrl} alt={venue.name} className="w-full h-full object-cover" style={{ filter: 'brightness(0.45) saturate(1.1)' }} />
        ) : (
          <div className="w-full h-full" style={{ background: `radial-gradient(ellipse at 30% 40%, ${color}22 0%, #07071a 70%)` }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(13,13,15,0.1) 0%, rgba(13,13,15,0.95) 100%)' }} />

        {/* Back button — goes to previous page (discover venues tab OR /venues list) */}
        <button
          onClick={() => window.history.length > 1 ? router.back() : router.push('/venues')}
          className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
          style={{ background: 'rgba(4,4,13,0.6)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: '#e0f2fe', backdropFilter: 'blur(8px)' }}
        >
          <ArrowLeft size={12} /> BACK
        </button>

        {/* Top-right action cluster */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {/* Follow button — visible to logged-in non-owners */}
          {dbUser && !isOwner && (
            <button
              onClick={toggleFollow}
              disabled={followLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
              style={{
                background: isFollowing ? 'rgba(var(--accent-rgb),0.18)' : 'rgba(4,4,13,0.6)',
                border: isFollowing ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(var(--accent-rgb),0.2)',
                color: isFollowing ? 'var(--accent)' : '#e0f2fe',
                backdropFilter: 'blur(8px)',
                opacity: followLoading ? 0.6 : 1,
              }}
            >
              {followLoading
                ? <Loader2 size={11} className="animate-spin" />
                : isFollowing
                  ? <BellOff size={11} />
                  : <Bell size={11} />
              }
              {isFollowing ? 'FOLLOWING' : 'FOLLOW'}
            </button>
          )}

          {/* Manage button — owner only */}
          {isOwner && (
            <button
              onClick={() => router.push(`/venues/${id}/manage`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ background: 'rgba(var(--accent-rgb),0.15)', border: '1px solid rgba(var(--accent-rgb),0.35)', color: 'var(--accent)', backdropFilter: 'blur(8px)' }}
            >
              ⚙ MANAGE
            </button>
          )}
        </div>

        {/* Name + type */}
        <div className="absolute bottom-5 left-4 right-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-bold px-2.5 py-1 rounded"
              style={{ color, background: `${color}18`, border: `1px solid ${color}40` }}>
              {TYPE_LABELS[venue.type]}
            </span>
            {venue.isClaimed && (
              <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded"
                style={{ color: 'var(--accent)', background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
                <CheckCircle size={8} /> VERIFIED
              </span>
            )}
          </div>
          <h1 className="text-2xl md:text-3xl font-black" style={{ color: '#e0f2fe', textShadow: '0 2px 20px rgba(0,0,0,0.8)' }}>
            {venue.name}
          </h1>
          <div className="flex items-center gap-3 mt-1.5">
            <p className="text-sm" style={{ color: 'rgba(224,242,254,0.55)' }}>{venue.address}</p>
            {followersCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold"
                style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>
                <Users size={10} />
                {followersCount.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* ─── Info grid ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {venue.phone && (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
              <Phone size={14} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
              <div>
                <p className="text-[9px] font-bold tracking-widest mb-0.5" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>PHONE</p>
                <a href={`tel:${venue.phone}`} className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{venue.phone}</a>
              </div>
            </div>
          )}

          {venue.website && (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
              <Globe size={14} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
              <div>
                <p className="text-[9px] font-bold tracking-widest mb-0.5" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>WEBSITE</p>
                <a href={venue.website} target="_blank" rel="noopener noreferrer" className="text-sm font-bold hover:underline" style={{ color: 'var(--accent)' }}>
                  {venue.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
            <MapPin size={14} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
            <div>
              <p className="text-[9px] font-bold tracking-widest mb-0.5" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>LOCATION</p>
              <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{venue.city}</p>
            </div>
          </div>

          {venue.rating && (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
              <Tag size={14} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
              <div>
                <p className="text-[9px] font-bold tracking-widest mb-0.5" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>RATING</p>
                <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>★ {venue.rating.toFixed(1)}</p>
              </div>
            </div>
          )}
        </div>

        {/* ─── Vibe tags ─── */}
        {venue.vibeTags.length > 0 && (
          <div>
            <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>VIBE</p>
            <div className="flex flex-wrap gap-2">
              {venue.vibeTags.map((tag) => (
                <span key={tag} className="text-xs px-3 py-1 rounded-full"
                  style={{ color: 'rgba(var(--accent-rgb),0.7)', background: 'rgba(var(--accent-rgb),0.07)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ─── Description ─── */}
        {venue.description && (
          <div className="rounded-xl p-4" style={{ background: 'rgba(var(--accent-rgb),0.02)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
            <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>ABOUT</p>
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'rgba(224,242,254,0.7)' }}>{venue.description}</p>
          </div>
        )}

        {/* ─── Now Playing ─── */}
        {venue.spotifyConnected && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Music2 size={13} style={{ color: 'rgba(30,215,96,0.5)' }} />
              <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(30,215,96,0.4)' }}>MUSIC</p>
            </div>
            <NowPlayingWidget venueId={id} />
          </div>
        )}

        {/* ─── Spotify connect (owner only) ─── */}
        {isOwner && (
          <div className="rounded-xl p-4" style={{ background: 'rgba(30,215,96,0.03)', border: '1px solid rgba(30,215,96,0.12)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Music2 size={13} style={{ color: 'rgba(30,215,96,0.5)' }} />
              <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(30,215,96,0.4)' }}>SPOTIFY</p>
            </div>
            {venue.spotifyConnected ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>
                    Connected as <span style={{ color: '#1ed760' }}>{venue.spotifyDisplayName ?? 'Spotify user'}</span>
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.35)' }}>
                    Live now-playing is public on this venue page
                  </p>
                </div>
                <button
                  onClick={disconnectSpotify}
                  disabled={spotifyDisconnecting}
                  className="flex items-center gap-1.5 shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-40"
                  style={{ background: 'rgba(255,0,110,0.07)', color: 'rgba(255,0,110,0.6)', border: '1px solid rgba(255,0,110,0.2)' }}
                >
                  <Unlink2 size={10} /> {spotifyDisconnecting ? '...' : 'DISCONNECT'}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>Connect Spotify</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.35)' }}>
                    Show live now-playing to everyone at your venue
                  </p>
                </div>
                <button
                  onClick={connectSpotify}
                  disabled={spotifyConnecting}
                  className="flex items-center gap-1.5 shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-40"
                  style={{ background: 'rgba(30,215,96,0.1)', color: '#1ed760', border: '1px solid rgba(30,215,96,0.25)' }}
                >
                  <Music2 size={10} /> {spotifyConnecting ? 'CONNECTING...' : 'CONNECT'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── Opening hours ─── */}
        {venue.openingHours != null ? <OpeningHours hours={venue.openingHours} /> : null}

        {/* ─── Tab switcher ─── */}
        <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
          {(['events', 'menu', 'feed'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="flex-1 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all"
              style={{
                background: activeTab === tab ? 'rgba(var(--accent-rgb),0.1)' : 'transparent',
                border: activeTab === tab ? '1px solid rgba(var(--accent-rgb),0.25)' : '1px solid transparent',
                color: activeTab === tab ? 'var(--accent)' : 'rgba(255,255,255,0.3)',
              }}>
              {tab === 'events' ? '📅 EVENTS' : tab === 'menu' ? '🍺 MENU' : '📸 FEED'}
            </button>
          ))}
        </div>

        {/* ─── Events tab ─── */}
        {activeTab === 'events' && (() => {
          const liveEvents     = venueEvents.filter(isLiveNow)
          const upcomingEvents = venueEvents.filter((e) => !isLiveNow(e))

          function EventCard({ event, dim }: { event: UpcomingEvent; dim?: boolean }) {
            const ec = EVENT_TYPE_COLORS[event.type] ?? 'var(--accent)'
            return (
              <Link key={event.id} href={`/events/${event.id}`}
                className="flex items-center gap-3 p-3 rounded-xl transition-all"
                style={{
                  background: 'rgba(var(--accent-rgb),0.03)',
                  border: '1px solid rgba(var(--accent-rgb),0.08)',
                  opacity: dim ? 0.6 : 1,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(var(--accent-rgb),0.2)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(var(--accent-rgb),0.08)' }}
              >
                {event.coverImageUrl ? (
                  <img src={event.coverImageUrl} alt={event.name} className="w-12 h-12 rounded-lg object-cover shrink-0"
                    style={{ filter: dim ? 'grayscale(60%)' : 'none' }} />
                ) : (
                  <div className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-xl"
                    style={{ background: `${ec}12`, border: `1px solid ${ec}30` }}>
                    🎉
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{event.name}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.45)' }}>{formatDate(event.startsAt)}</p>
                  {event.host?.displayName && (
                    <p className="text-[9px] mt-0.5" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
                      by {event.host.displayName}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded"
                    style={{ color: ec, background: `${ec}15`, border: `1px solid ${ec}30` }}>
                    {event.type.replace(/_/g, ' ')}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-bold" style={{ color: event.price === 0 ? '#00ff88' : '#e0f2fe' }}>
                    <Ticket size={10} /> {formatPrice(event.price)}
                  </span>
                </div>
              </Link>
            )
          }

          if (eventsLoading) {
            return (
              <div className="flex flex-col gap-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.06)' }} />
                ))}
              </div>
            )
          }

          const totalCount = liveEvents.length + upcomingEvents.length + pastEvents.length
          if (eventsError && totalCount === 0) {
            return (
              <div className="py-8 rounded-xl flex flex-col items-center gap-2" style={{ background: 'rgba(255,0,110,0.03)', border: '1px solid rgba(255,0,110,0.12)' }}>
                <Calendar size={24} style={{ color: 'rgba(255,0,110,0.3)' }} />
                <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(255,0,110,0.5)' }}>FAILED TO LOAD</p>
                <p className="text-[10px] text-center px-6" style={{ color: 'rgba(224,242,254,0.3)' }}>
                  {eventsError} — pull to refresh
                </p>
              </div>
            )
          }
          if (totalCount === 0) {
            return (
              <div className="py-8 rounded-xl flex flex-col items-center gap-2" style={{ background: 'rgba(var(--accent-rgb),0.02)', border: '1px solid rgba(var(--accent-rgb),0.06)' }}>
                <Calendar size={24} style={{ color: 'rgba(var(--accent-rgb),0.2)' }} />
                <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.4)' }}>NO EVENTS</p>
                <p className="text-[10px] text-center px-6" style={{ color: 'rgba(224,242,254,0.25)' }}>
                  Nothing scheduled here yet — check back soon
                </p>
              </div>
            )
          }

          return (
            <div className="flex flex-col gap-5">

              {/* ── Happening Now ── */}
              {liveEvents.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#ff006e' }} />
                      <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#ff006e' }} />
                    </span>
                    <p className="text-[10px] font-bold tracking-widest" style={{ color: '#ff006e' }}>HAPPENING NOW</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {liveEvents.map((event) => <EventCard key={event.id} event={event} />)}
                  </div>
                </div>
              )}

              {/* ── Upcoming ── */}
              {upcomingEvents.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar size={12} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
                    <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
                      UPCOMING — {upcomingEvents.length}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {upcomingEvents.map((event) => <EventCard key={event.id} event={event} />)}
                  </div>
                </div>
              )}

              {/* ── Past ── */}
              {pastEvents.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock size={12} style={{ color: 'rgba(var(--accent-rgb),0.3)' }} />
                    <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.3)' }}>
                      PAST EVENTS — {pastEvents.length}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {pastEvents.map((event) => <EventCard key={event.id} event={event} dim />)}
                  </div>
                </div>
              )}

            </div>
          )
        })()}

        {/* ─── Menu tab ─── */}
        {activeTab === 'menu' && (() => {
          if (menuLoading || menuData === undefined) {
            return (
              <div className="flex flex-col gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.06)' }} />
                ))}
              </div>
            )
          }

          if (!menuData || !menuData.isActive) {
            return (
              <div className="py-12 rounded-xl flex flex-col items-center gap-2" style={{ background: 'rgba(var(--accent-rgb),0.02)', border: '1px solid rgba(var(--accent-rgb),0.06)' }}>
                <span style={{ fontSize: 28 }}>🍺</span>
                <p className="text-[10px] font-bold tracking-widest mt-1" style={{ color: 'rgba(74,96,128,0.4)' }}>
                  {!menuData ? 'NO MENU AVAILABLE' : 'MENU TEMPORARILY UNAVAILABLE'}
                </p>
                <p className="text-[10px] text-center px-6" style={{ color: 'rgba(224,242,254,0.25)' }}>
                  {!menuData
                    ? "This venue hasn't set up in-app ordering yet"
                    : 'In-app ordering is currently paused — visit the venue directly'}
                </p>
              </div>
            )
          }

          if (menuData.drinkMenuItems.length === 0) {
            return (
              <div className="py-12 rounded-xl flex flex-col items-center gap-2" style={{ background: 'rgba(var(--accent-rgb),0.02)', border: '1px solid rgba(var(--accent-rgb),0.06)' }}>
                <span style={{ fontSize: 28 }}>🍺</span>
                <p className="text-[10px] font-bold tracking-widest mt-1" style={{ color: 'rgba(74,96,128,0.4)' }}>MENU COMING SOON</p>
                <p className="text-[10px] text-center px-6" style={{ color: 'rgba(224,242,254,0.25)' }}>No items have been added yet</p>
              </div>
            )
          }

          const categories = [...new Set(menuData.drinkMenuItems.map((i) => i.category))]
          const cartEntries = Object.entries(cart).filter(([, q]) => q > 0)
          const cartTotal = cartEntries.reduce((sum, [iid, qty]) => {
            const item = menuData.drinkMenuItems.find((i) => i.id === iid)
            return sum + (item?.price ?? 0) * qty
          }, 0)
          const cartCount = cartEntries.reduce((sum, [, q]) => sum + q, 0)

          return (
            <div className="flex flex-col gap-5">

              {/* Order success banner */}
              {orderSuccess && (
                <div className="rounded-xl p-4" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)' }}>
                  <p className="text-sm font-bold mb-1" style={{ color: '#00ff88' }}>✓ Order placed!</p>
                  <p className="text-xs" style={{ color: 'rgba(224,242,254,0.6)' }}>
                    £{orderSuccess.total.toFixed(2)} paid · {orderSuccess.message}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.35)' }}>
                    New balance: £{orderSuccess.newBalance.toFixed(2)}
                  </p>
                  <button onClick={() => setOrderSuccess(null)} className="mt-2 text-[10px] font-bold" style={{ color: 'rgba(0,255,136,0.55)' }}>
                    DISMISS
                  </button>
                </div>
              )}

              {/* Wallet balance strip */}
              {dbUser && walletBalance !== null && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
                  <span className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>WALLET BALANCE</span>
                  <span className="text-sm font-black" style={{ color: 'var(--accent)' }}>£{walletBalance.toFixed(2)}</span>
                </div>
              )}

              {/* Items grouped by category */}
              {categories.map((cat) => (
                <div key={cat}>
                  <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
                    {cat.toUpperCase()}
                  </p>
                  <div className="flex flex-col gap-2">
                    {menuData.drinkMenuItems.filter((i) => i.category === cat).map((item) => {
                      const qty = cart[item.id] ?? 0
                      return (
                        <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl"
                          style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-14 h-14 rounded-lg shrink-0 flex items-center justify-center text-2xl"
                              style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
                              🍺
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{item.name}</p>
                            {item.description && (
                              <p className="text-[10px] mt-0.5 line-clamp-2" style={{ color: 'rgba(224,242,254,0.4)' }}>{item.description}</p>
                            )}
                            <p className="text-sm font-black mt-1" style={{ color: 'var(--accent)' }}>£{item.price.toFixed(2)}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {qty > 0 ? (
                              <>
                                <button onClick={() => removeFromCart(item.id)}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                                  style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>
                                  <Minus size={12} />
                                </button>
                                <span className="w-5 text-center text-sm font-bold" style={{ color: '#e0f2fe' }}>{qty}</span>
                                <button onClick={() => addToCart(item.id)}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                                  style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>
                                  <Plus size={12} />
                                </button>
                              </>
                            ) : (
                              <button onClick={() => addToCart(item.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold"
                                style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>
                                <Plus size={10} /> ADD
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Cart summary */}
              {cartEntries.length > 0 && (
                <div className="rounded-2xl p-4" style={{ background: 'rgba(7,7,26,0.95)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ShoppingCart size={14} style={{ color: 'var(--accent)' }} />
                      <span className="text-xs font-bold" style={{ color: '#e0f2fe' }}>
                        {cartCount} item{cartCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="text-base font-black" style={{ color: 'var(--accent)' }}>£{cartTotal.toFixed(2)}</span>
                  </div>

                  {orderError && (
                    <p className="text-[10px] font-bold mb-2" style={{ color: '#ff006e' }}>{orderError}</p>
                  )}

                  {!dbUser ? (
                    <Link href="/account"
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold"
                      style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}>
                      Sign in to order →
                    </Link>
                  ) : walletBalance !== null && walletBalance < cartTotal ? (
                    <div className="text-center">
                      <p className="text-[10px] font-bold mb-1.5" style={{ color: 'rgba(255,0,110,0.7)' }}>Insufficient wallet balance</p>
                      <Link href="/wallet" className="text-[10px] font-bold" style={{ color: 'var(--accent)' }}>
                        Top up wallet →
                      </Link>
                    </div>
                  ) : (
                    <button onClick={placeOrder} disabled={ordering}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
                      style={{ background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.3)' }}>
                      {ordering ? <Loader2 size={13} className="animate-spin" /> : <ShoppingCart size={13} />}
                      {ordering ? 'PLACING ORDER...' : 'PAY WITH WALLET'}
                    </button>
                  )}
                </div>
              )}

            </div>
          )
        })()}

        {/* ─── Feed tab ─── */}
        {activeTab === 'feed' && (
          <div className="space-y-3">
            {/* Post composer */}
            <div className="p-3 rounded-2xl space-y-3" style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
              <textarea
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder={`What's happening at ${venue?.name ?? 'this venue'}?`}
                rows={2}
                maxLength={300}
                className="w-full bg-transparent resize-none text-sm focus:outline-none"
                style={{ color: '#e0f2fe' }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.25)' }}>{postText.length}/300</span>
                <button onClick={submitPost} disabled={posting || !postText.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all disabled:opacity-40"
                  style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.25)', color: 'var(--accent)' }}>
                  <Send size={11} /> {posting ? 'POSTING...' : 'POST'}
                </button>
              </div>
            </div>

            {/* Posts list */}
            {postsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'rgba(var(--accent-rgb),0.04)' }} />
              ))
            ) : posts.length === 0 ? (
              <div className="py-12 flex flex-col items-center gap-2">
                <ImageIcon size={24} style={{ color: 'rgba(var(--accent-rgb),0.2)' }} />
                <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.4)' }}>NO POSTS YET</p>
                <p className="text-[11px]" style={{ color: 'rgba(224,242,254,0.25)' }}>Be the first to share what's going on</p>
              </div>
            ) : posts.map((post) => {
              const displayImage = post.imageUrl ?? post.media?.[0]?.url
              const isTagged = post.tags?.some((t) => t.taggedVenueId === id) ?? false
              const likeCount = post.likesCount ?? post._count?.likes ?? 0
              return (
                <div key={post.id} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(7,7,26,0.6)', border: '1px solid rgba(var(--accent-rgb),0.07)' }}>
                  {/* Image / media */}
                  {displayImage && (
                    <img src={displayImage} alt="" className="w-full object-cover" style={{ maxHeight: 280 }} />
                  )}

                  <div className="p-3">
                    {/* Author row */}
                    <div className="flex items-center gap-2 mb-2">
                      <Link href={`/profile/${post.user.username}`}>
                        {post.user.photoUrl
                          ? <img src={post.user.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                          : <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0"
                              style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)' }}>
                              {post.user.displayName[0]?.toUpperCase()}
                            </div>}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link href={`/profile/${post.user.username}`}>
                          <p className="text-xs font-bold hover:underline truncate" style={{ color: '#e0f2fe' }}>{post.user.displayName}</p>
                        </Link>
                        <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>
                          {new Date(post.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {' · '}
                          {new Date(post.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {/* "Tagged here" chip for posts sourced via PostTag from the main feed */}
                      {isTagged && (
                        <span className="shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.18)', color: 'rgba(var(--accent-rgb),0.6)' }}>
                          📌 tagged
                        </span>
                      )}
                    </div>

                    {/* Caption */}
                    {post.text && (
                      <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(224,242,254,0.75)' }}>{post.text}</p>
                    )}

                    {/* Footer */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Heart size={12} style={{ color: 'rgba(255,0,110,0.5)' }} />
                        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{likeCount}</span>
                      </div>
                      {(post.commentsCount ?? 0) > 0 && (
                        <div className="flex items-center gap-1">
                          <Send size={11} style={{ color: 'rgba(var(--accent-rgb),0.35)' }} />
                          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{post.commentsCount}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ─── Map ─── */}
        <div>
          <p className="text-[10px] font-bold tracking-widest mb-3" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>LOCATION</p>
          <div className="rounded-xl overflow-hidden" style={{ height: 220, border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
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
            style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
            <div>
              <p className="text-xs font-bold mb-0.5" style={{ color: '#e0f2fe' }}>Is this your venue?</p>
              <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>Claim it to manage events and details.</p>
            </div>
            <button
              onClick={() => setClaimOpen(true)}
              className="shrink-0 text-[10px] font-bold px-4 py-2 rounded-lg"
              style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}
            >
              CLAIM
            </button>
          </div>
        )}

        {/* ─── Claimed by ─── */}
        {venue.isClaimed && venue.claimedBy && (
          <div className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
            {venue.claimedBy.photoUrl
              ? <img src={venue.claimedBy.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
              : <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(var(--accent-rgb),0.1)' }}><Building2 size={14} style={{ color: 'var(--accent)' }} /></div>}
            <div>
              <p className="text-[9px] font-bold tracking-widest mb-0.5" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>MANAGED BY</p>
              <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>{venue.claimedBy.displayName}</p>
            </div>
            <CheckCircle size={14} className="ml-auto" style={{ color: 'var(--accent)' }} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function VenueDetailPage() {
  return (
    <Suspense fallback={null}>
      <VenueDetailInner />
    </Suspense>
  )
}
