'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Rss, Zap, Users, MapPin, Calendar, Heart, Plus } from 'lucide-react'

import { API_URL as API_BASE } from '@/lib/api'
import { DEV_MODE } from '@/lib/firebase'

function timeAgo(dateStr: string) {
  const s = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}

const TYPE_COLORS: Record<string, string> = {
  HOME_PARTY: '#ff006e',
  CLUB_NIGHT: '#00e5ff',
  CONCERT: '#3d5afe',
  PUB_NIGHT: '#f59e0b',
}
const TYPE_LABELS: Record<string, string> = {
  HOME_PARTY: 'HOME PARTY',
  CLUB_NIGHT: 'CLUB NIGHT',
  CONCERT: 'CONCERT',
  PUB_NIGHT: 'PUB NIGHT',
}

const CROWD_CONFIG: Record<string, { color: string; label: string }> = {
  QUIET:  { color: '#00ff88', label: 'QUIET'  },
  BUSY:   { color: '#ffd600', label: 'BUSY'   },
  RAMMED: { color: '#ff006e', label: 'RAMMED' },
}

type FeedTab = 'foryou' | 'following'

interface FeedUser { displayName: string; photoUrl?: string | null }
interface FeedEvent { name: string; type?: string }
interface FeedVenue { name: string }

interface FeedItem {
  id?: string
  type: 'RSVP' | 'CHECKIN' | 'POST'
  user: FeedUser
  event?: FeedEvent | null
  venue?: FeedVenue | null
  crowdLevel?: string
  text?: string | null
  imageUrl?: string | null
  likesCount?: number
  createdAt: string
}

const DEMO_FEED: FeedItem[] = [
  { type: 'RSVP',    user: { displayName: 'Jamie K', photoUrl: null },    event: { name: 'Sub Club — Techno Night', type: 'CLUB_NIGHT' }, createdAt: new Date(Date.now() - 15*60*1000).toISOString() },
  { type: 'CHECKIN', user: { displayName: 'Sarah M', photoUrl: null },    venue: { name: 'SWG3' }, crowdLevel: 'BUSY',   createdAt: new Date(Date.now() - 32*60*1000).toISOString() },
  { type: 'RSVP',    user: { displayName: 'Lewis R', photoUrl: null },    event: { name: 'Òran Mór Live', type: 'CONCERT' }, createdAt: new Date(Date.now() - 1*60*60*1000).toISOString() },
  { type: 'POST',    user: { displayName: 'Chloe B', photoUrl: null },    event: { name: 'Rooftop Party' }, text: 'Best night 🔥', imageUrl: null, likesCount: 12, createdAt: new Date(Date.now() - 2*60*60*1000).toISOString() },
  { type: 'CHECKIN', user: { displayName: 'Ryan T', photoUrl: null },     venue: { name: 'Stereo' }, crowdLevel: 'RAMMED', createdAt: new Date(Date.now() - 3*60*60*1000).toISOString() },
]

const DEMO_STORIES = [
  { name: 'Jamie K', active: true  },
  { name: 'Sarah M', active: true  },
  { name: 'Lewis R', active: false },
  { name: 'Chloe B', active: true  },
  { name: 'Ryan T',  active: false },
]

// ─── Avatar ────────────────────────────────────────────────────────────────
function Avatar({ user, size = 36 }: { user: FeedUser; size?: number }) {
  const initials = user.displayName?.[0]?.toUpperCase() ?? '?'
  if (user.photoUrl) {
    return (
      <img
        src={user.photoUrl}
        alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: '1px solid rgba(0,229,255,0.25)', boxShadow: '0 0 8px rgba(0,229,255,0.12)' }}
      />
    )
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-black shrink-0"
      style={{
        width: size, height: size,
        background: 'rgba(0,229,255,0.08)',
        border: '1px solid rgba(0,229,255,0.2)',
        color: '#00e5ff',
        fontSize: size * 0.38,
      }}
    >
      {initials}
    </div>
  )
}

// ─── RSVP Card ─────────────────────────────────────────────────────────────
function RSVPCard({ item }: { item: FeedItem }) {
  const typeColor = item.event?.type ? (TYPE_COLORS[item.event.type] ?? '#00e5ff') : '#00e5ff'
  const typeLabel = item.event?.type ? (TYPE_LABELS[item.event.type] ?? item.event.type) : ''
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(24,24,27,0.95)', border: '1px solid rgba(0,229,255,0.1)' }}
    >
      <div className="flex items-center gap-3 p-3">
        <Avatar user={item.user} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black leading-tight" style={{ color: '#e0f2fe' }}>
            <span style={{ color: '#00e5ff' }}>{item.user.displayName}</span>
            <span style={{ color: 'rgba(224,242,254,0.55)', fontWeight: 600 }}> is going to</span>
          </p>
        </div>
        <span className="text-[10px] font-bold shrink-0" style={{ color: 'rgba(74,96,128,0.55)' }}>
          {timeAgo(item.createdAt)}
        </span>
      </div>
      {item.event && (
        <div
          className="mx-3 mb-3 p-3 rounded-xl flex items-center gap-3"
          style={{ background: `${typeColor}08`, border: `1px solid ${typeColor}25` }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black leading-tight truncate" style={{ color: '#e0f2fe' }}>{item.event.name}</p>
            {typeLabel && (
              <span
                className="inline-block text-[9px] font-black px-2 py-0.5 rounded mt-1"
                style={{ color: typeColor, border: `1px solid ${typeColor}50`, background: `${typeColor}15`, letterSpacing: '0.12em' }}
              >
                {typeLabel}
              </span>
            )}
          </div>
          <span
            className="text-[9px] font-black px-2 py-1 rounded shrink-0"
            style={{ color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)', background: 'rgba(0,255,136,0.08)', letterSpacing: '0.1em' }}
          >
            RSVP&apos;D
          </span>
        </div>
      )}
    </div>
  )
}

// ─── CheckIn Card ──────────────────────────────────────────────────────────
function CheckInCard({ item }: { item: FeedItem }) {
  const crowd = item.crowdLevel ? (CROWD_CONFIG[item.crowdLevel] ?? { color: '#00e5ff', label: item.crowdLevel }) : null
  return (
    <div
      className="rounded-2xl p-3"
      style={{ background: 'rgba(24,24,27,0.95)', border: '1px solid rgba(0,229,255,0.1)' }}
    >
      <div className="flex items-center gap-3">
        <Avatar user={item.user} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black leading-tight" style={{ color: '#e0f2fe' }}>
            <span style={{ color: '#00e5ff' }}>{item.user.displayName}</span>
            <span style={{ color: 'rgba(224,242,254,0.55)', fontWeight: 600 }}> checked in at </span>
            <span style={{ color: '#e0f2fe' }}>{item.venue?.name ?? item.event?.name ?? '??'}</span>
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <MapPin size={10} style={{ color: 'rgba(0,229,255,0.4)' }} />
            {crowd && (
              <span
                className="text-[9px] font-black px-2 py-0.5 rounded"
                style={{ color: crowd.color, border: `1px solid ${crowd.color}40`, background: `${crowd.color}10`, letterSpacing: '0.1em' }}
              >
                {crowd.label}
              </span>
            )}
            <span className="text-[10px] font-bold" style={{ color: 'rgba(74,96,128,0.55)' }}>
              {timeAgo(item.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Post Card ─────────────────────────────────────────────────────────────
function PostCard({ item }: { item: FeedItem }) {
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(item.likesCount ?? 0)

  function handleLike() {
    setLiked((v) => !v)
    setLikes((c) => c + (liked ? -1 : 1))
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(24,24,27,0.95)', border: '1px solid rgba(0,229,255,0.1)' }}
    >
      <div className="flex items-center gap-3 p-3">
        <Avatar user={item.user} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{item.user.displayName}</p>
          {item.event && (
            <p className="text-[10px] flex items-center gap-1 mt-0.5" style={{ color: 'rgba(0,229,255,0.5)' }}>
              <Calendar size={9} /> {item.event.name}
            </p>
          )}
        </div>
        <span className="text-[10px] font-bold shrink-0" style={{ color: 'rgba(74,96,128,0.55)' }}>
          {timeAgo(item.createdAt)}
        </span>
      </div>

      {item.imageUrl && (
        <div style={{ maxHeight: 260, overflow: 'hidden' }}>
          <img src={item.imageUrl} alt="" className="w-full object-cover" style={{ maxHeight: 260 }} />
        </div>
      )}

      {item.text && (
        <p className="px-4 py-3 text-sm leading-relaxed" style={{ color: 'rgba(224,242,254,0.8)' }}>
          {item.text}
        </p>
      )}

      <div
        className="flex items-center gap-3 px-4 py-2.5"
        style={{ borderTop: '1px solid rgba(0,229,255,0.06)' }}
      >
        <button
          onClick={handleLike}
          className="flex items-center gap-1.5 transition-all duration-200"
          style={{ color: liked ? '#ec4899' : 'rgba(74,96,128,0.6)' }}
        >
          <Heart
            size={15}
            fill={liked ? '#ec4899' : 'none'}
            style={{ filter: liked ? 'drop-shadow(0 0 4px rgba(236,72,153,0.6))' : 'none' }}
          />
          <span className="text-xs font-bold">{likes > 0 ? likes : ''}</span>
        </button>
        <div className="ml-auto">
          <Zap size={11} style={{ color: 'rgba(0,229,255,0.15)' }} />
        </div>
      </div>
    </div>
  )
}

// ─── Feed Item Router ──────────────────────────────────────────────────────
function FeedItemCard({ item }: { item: FeedItem }) {
  if (item.type === 'RSVP')    return <RSVPCard item={item} />
  if (item.type === 'CHECKIN') return <CheckInCard item={item} />
  if (item.type === 'POST')    return <PostCard item={item} />
  return null
}

// ─── Stories Bar ───────────────────────────────────────────────────────────
function StoriesBar() {
  return (
    <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
      <div className="flex gap-3 px-4" style={{ minWidth: 'max-content' }}>
        {/* Your Story */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center relative"
            style={{
              background: 'rgba(0,229,255,0.06)',
              border: '2px dashed rgba(0,229,255,0.3)',
            }}
          >
            <Plus size={18} style={{ color: 'rgba(0,229,255,0.5)' }} />
          </div>
          <span className="text-[9px] font-bold tracking-wide" style={{ color: 'rgba(0,229,255,0.5)' }}>YOUR STORY</span>
        </div>

        {/* Friend stories — only show demo data in dev mode */}
        {(DEV_MODE ? DEMO_STORIES : []).map((s) => (
          <div key={s.name} className="flex flex-col items-center gap-1.5 shrink-0">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(0,229,255,0.08)',
                border: s.active
                  ? '2px solid #00e5ff'
                  : '2px solid rgba(74,96,128,0.3)',
                boxShadow: s.active ? '0 0 12px rgba(0,229,255,0.35)' : 'none',
              }}
            >
              <span className="text-lg font-black" style={{ color: s.active ? '#00e5ff' : 'rgba(74,96,128,0.6)' }}>
                {s.name[0]}
              </span>
            </div>
            <span
              className="text-[9px] font-bold tracking-wide truncate"
              style={{ color: s.active ? 'rgba(224,242,254,0.7)' : 'rgba(74,96,128,0.5)', maxWidth: 56 }}
            >
              {s.name.split(' ')[0]!.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Empty State ───────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
        style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.12)' }}
      >
        <Users size={28} style={{ color: 'rgba(0,229,255,0.3)' }} />
      </div>
      <p className="text-sm font-black tracking-widest mb-2" style={{ color: 'rgba(224,242,254,0.4)' }}>
        NOTHING YET
      </p>
      <p className="text-xs mb-5" style={{ color: 'rgba(74,96,128,0.6)' }}>
        Follow people to see their activity here
      </p>
      <Link
        href="/discover"
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all duration-200"
        style={{
          background: 'rgba(0,229,255,0.08)',
          border: '1px solid rgba(0,229,255,0.25)',
          color: '#00e5ff',
          letterSpacing: '0.1em',
        }}
      >
        <Rss size={12} /> DISCOVER EVENTS
      </Link>
    </div>
  )
}

// ─── Main Feed Page ─────────────────────────────────────────────────────────
export default function FeedPage() {
  const [tab, setTab] = useState<FeedTab>('foryou')
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadFeed() {
      setLoading(true)
      try {
        const token = typeof window !== 'undefined'
          ? localStorage.getItem('partyradar_mock_session') ?? ''
          : ''

        const endpoint = tab === 'following' ? '/feed' : '/feed/discover'
        const res = await fetch(`${API_BASE}${endpoint}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (res.ok) {
          const json = await res.json()
          const items: FeedItem[] = (json?.data ?? json ?? [])
          setFeedItems(items.length > 0 ? items : DEV_MODE ? DEMO_FEED : [])
        } else {
          setFeedItems(DEV_MODE ? DEMO_FEED : [])
        }
      } catch {
        setFeedItems(DEV_MODE ? DEMO_FEED : [])
      } finally {
        setLoading(false)
      }
    }
    loadFeed()
  }, [tab])

  return (
    <div className="min-h-screen pb-28" style={{ background: '#04040d' }}>
      {/* ── Top line ── */}
      <div className="absolute top-14 inset-x-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.2), transparent)' }} />

      {/* ── Header ── */}
      <div
        className="sticky top-14 z-30 px-4 pt-4 pb-0"
        style={{
          background: 'rgba(4,4,13,0.95)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(0,229,255,0.07)',
        }}
      >
        <div className="max-w-xl mx-auto">
          {/* Title row */}
          <div className="flex items-center gap-3 mb-4">
            <Rss size={16} style={{ color: '#00e5ff', filter: 'drop-shadow(0 0 6px rgba(0,229,255,0.7))' }} />
            <h1
              className="text-sm font-black tracking-[0.25em]"
              style={{ color: '#00e5ff', textShadow: '0 0 16px rgba(0,229,255,0.5)' }}
            >
              FEED
            </h1>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 border-b" style={{ borderColor: 'rgba(0,229,255,0.08)' }}>
            {([['foryou', 'FOR YOU'], ['following', 'FOLLOWING']] as [FeedTab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="relative px-5 py-2.5 text-[10px] font-black tracking-widest transition-all duration-200"
                style={{
                  color: tab === key ? '#00e5ff' : 'rgba(74,96,128,0.6)',
                  textShadow: tab === key ? '0 0 10px rgba(0,229,255,0.6)' : 'none',
                }}
              >
                {label}
                {tab === key && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-px"
                    style={{ background: 'linear-gradient(90deg, transparent, #00e5ff, transparent)' }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stories ── */}
      <div className="max-w-xl mx-auto pt-4 mb-1">
        <StoriesBar />
      </div>

      {/* ── Divider ── */}
      <div className="max-w-xl mx-auto px-4 mb-4">
        <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.15), transparent)' }} />
      </div>

      {/* ── Feed ── */}
      <div className="max-w-xl mx-auto px-4 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center py-20 gap-4">
            <div
              className="w-10 h-10 rounded-full border-2 animate-spin"
              style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }}
            />
            <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.4)' }}>
              LOADING FEED...
            </p>
          </div>
        ) : feedItems.length === 0 ? (
          <EmptyState />
        ) : (
          feedItems.map((item, i) => (
            <FeedItemCard key={item.id ?? i} item={item} />
          ))
        )}
      </div>
    </div>
  )
}
