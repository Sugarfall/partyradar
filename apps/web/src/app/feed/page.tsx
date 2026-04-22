'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Rss, Zap, Users, MapPin, Calendar, Heart, Plus, Ticket,
  Flag, MessageCircle, Trash2, Camera, Share2, BarChart2,
} from 'lucide-react'

import { api } from '@/lib/api'
import { logError } from '@/lib/logError'
import { DEV_MODE } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import ComposePostModal from '@/components/feed/ComposePostModal'
import PostMediaViewer, { type MediaItem, type PostTagLite } from '@/components/feed/PostMediaViewer'
import ShareSheet from '@/components/feed/ShareSheet'
import PostDetailModal from '@/components/feed/PostDetailModal'

function timeAgo(dateStr: string) {
  const s = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}

const TYPE_COLORS: Record<string, string> = {
  HOME_PARTY: '#ff006e',
  CLUB_NIGHT: 'var(--accent)',
  CONCERT: '#3d5afe',
  PUB_NIGHT: '#f59e0b',
}
const TYPE_LABELS: Record<string, string> = {
  HOME_PARTY: 'HOUSE PARTY',
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

interface FeedUser { id?: string; username?: string; displayName: string; photoUrl?: string | null }
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
  /** Phase 2/3: ordered carousel media. Falls back to `imageUrl` when empty. */
  media?: MediaItem[] | null
  /** Phase 2/3: resolved post tags with nested user/venue records. */
  tags?: PostTagLite[] | null
  likesCount?: number
  commentsCount?: number
  /** Phase 4: per-channel share counter (native + copy + repost). */
  sharesCount?: number
  hasLiked?: boolean
  createdAt: string
}

const DEMO_FEED: FeedItem[] = [
  { type: 'RSVP',    user: { displayName: 'Jamie K', photoUrl: null },    event: { name: 'Sub Club — Techno Night', type: 'CLUB_NIGHT' }, createdAt: new Date(Date.now() - 15*60*1000).toISOString() },
  { type: 'CHECKIN', user: { displayName: 'Sarah M', photoUrl: null },    venue: { name: 'SWG3' }, crowdLevel: 'BUSY',   createdAt: new Date(Date.now() - 32*60*1000).toISOString() },
  { type: 'RSVP',    user: { displayName: 'Lewis R', photoUrl: null },    event: { name: 'Òran Mór Live', type: 'CONCERT' }, createdAt: new Date(Date.now() - 1*60*60*1000).toISOString() },
  { type: 'POST',    user: { displayName: 'Chloe B', photoUrl: null },    event: { name: 'Rooftop Party' }, text: 'Best night 🔥', imageUrl: null, likesCount: 12, commentsCount: 3, createdAt: new Date(Date.now() - 2*60*60*1000).toISOString() },
  { type: 'CHECKIN', user: { displayName: 'Ryan T', photoUrl: null },     venue: { name: 'Stereo' }, crowdLevel: 'RAMMED', createdAt: new Date(Date.now() - 3*60*60*1000).toISOString() },
]

const DEMO_STORIES = [
  { name: 'Jamie K', active: true  },
  { name: 'Sarah M', active: true  },
  { name: 'Lewis R', active: false },
  { name: 'Chloe B', active: true  },
  { name: 'Ryan T',  active: false },
]

// ─── Mention renderer ──────────────────────────────────────────────────────
function renderMentions(text: string): React.ReactNode {
  const parts = text.split(/(@[\w.]+)/g)
  return parts.map((part, i) =>
    /^@\w/.test(part)
      ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 700 }}>{part}</span>
      : <span key={i}>{part}</span>
  )
}

// ─── Avatar ────────────────────────────────────────────────────────────────
function Avatar({ user, size = 36 }: { user: { displayName: string; photoUrl?: string | null }; size?: number }) {
  const initials = user.displayName?.[0]?.toUpperCase() ?? '?'
  if (user.photoUrl) {
    return (
      <img
        src={user.photoUrl}
        alt=""
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: '1px solid rgba(var(--accent-rgb),0.25)', boxShadow: '0 0 8px rgba(var(--accent-rgb),0.12)' }}
      />
    )
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-black shrink-0"
      style={{
        width: size, height: size,
        background: 'rgba(var(--accent-rgb),0.08)',
        border: '1px solid rgba(var(--accent-rgb),0.2)',
        color: 'var(--accent)',
        fontSize: size * 0.38,
      }}
    >
      {initials}
    </div>
  )
}

// PostDetailModal now lives in @/components/feed/PostDetailModal (imported above).

// ─── RSVP Card ─────────────────────────────────────────────────────────────
function RSVPCard({ item }: { item: FeedItem }) {
  const typeColor = item.event?.type ? (TYPE_COLORS[item.event.type] ?? 'var(--accent)') : 'var(--accent)'
  const typeLabel = item.event?.type ? (TYPE_LABELS[item.event.type] ?? item.event.type) : ''
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(24,24,27,0.95)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
    >
      <div className="flex items-center gap-3 p-3">
        <Avatar user={item.user} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black leading-tight" style={{ color: '#e0f2fe' }}>
            <span style={{ color: 'var(--accent)' }}>{item.user.displayName}</span>
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
  const crowd = item.crowdLevel ? (CROWD_CONFIG[item.crowdLevel] ?? { color: 'var(--accent)', label: item.crowdLevel }) : null
  return (
    <div
      className="rounded-2xl p-3"
      style={{ background: 'rgba(24,24,27,0.95)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
    >
      <div className="flex items-center gap-3">
        <Avatar user={item.user} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black leading-tight" style={{ color: '#e0f2fe' }}>
            <span style={{ color: 'var(--accent)' }}>{item.user.displayName}</span>
            <span style={{ color: 'rgba(224,242,254,0.55)', fontWeight: 600 }}> checked in at </span>
            <span style={{ color: '#e0f2fe' }}>{item.venue?.name ?? item.event?.name ?? '??'}</span>
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <MapPin size={10} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
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
function PostCard({ item, currentUserId, onDelete }: { item: FeedItem; currentUserId?: string | null; onDelete?: (id: string) => void }) {
  const [liked, setLiked] = useState(item.hasLiked ?? false)
  const [likes, setLikes] = useState(item.likesCount ?? 0)
  const [commentsCount, setCommentsCount] = useState(item.commentsCount ?? 0)
  const [reported, setReported] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [localShares, setLocalShares] = useState(item.sharesCount ?? 0)

  const isOwner = !!(currentUserId && item.user.id && currentUserId === item.user.id)

  async function handleLike(e: React.MouseEvent) {
    e.stopPropagation()
    if (!item.id) {
      const nowLiked = !liked
      setLiked(nowLiked)
      setLikes((c) => nowLiked ? c + 1 : Math.max(0, c - 1))
      return
    }
    try {
      const res = await api.post<{ data: { liked: boolean } }>(`/posts/${item.id}/like`, {})
      const nowLiked = res?.data?.liked ?? !liked
      setLiked(nowLiked)
      setLikes((c) => nowLiked ? c + 1 : Math.max(0, c - 1))
    } catch {
      const nowLiked = !liked
      setLiked(nowLiked)
      setLikes((c) => nowLiked ? c + 1 : Math.max(0, c - 1))
    }
  }

  async function handleReport(e: React.MouseEvent) {
    e.stopPropagation()
    if (!item.id || reported) return
    try {
      await api.post('/reports', { contentType: 'post', contentId: item.id, reason: 'OTHER' })
      setReported(true)
    } catch (err) { logError('feed:report-post', err) }
  }

  function openModal(e: React.MouseEvent) {
    e.stopPropagation()
    if (item.id) setShowModal(true)
  }

  return (
    <>
      <div
        className="rounded-2xl overflow-hidden transition-transform duration-150 active:scale-[0.99]"
        style={{
          background: 'rgba(24,24,27,0.95)',
          border: '1px solid rgba(var(--accent-rgb),0.1)',
          cursor: item.id ? 'pointer' : 'default',
        }}
        onClick={openModal}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-3">
          <Avatar user={item.user} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{item.user.displayName}</p>
            {item.event && (
              <p className="text-[10px] flex items-center gap-1 mt-0.5" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
                <Calendar size={9} /> {item.event.name}
              </p>
            )}
          </div>
          <span className="text-[10px] font-bold shrink-0" style={{ color: 'rgba(74,96,128,0.55)' }}>
            {timeAgo(item.createdAt)}
          </span>
        </div>

        {/* Media (carousel, autoplay video, tag overlays) */}
        {item.id && (item.imageUrl || (item.media && item.media.length > 0)) && (
          <div onClick={(e) => e.stopPropagation()}>
            <PostMediaViewer
              postId={item.id}
              media={item.media}
              imageUrl={item.imageUrl}
              tags={item.tags}
              onDoubleTap={() => {
                // Reuse handleLike's logic without the event arg.
                if (!item.id) return
                void (async () => {
                  try {
                    const res = await api.post<{ data: { liked: boolean } }>(`/posts/${item.id}/like`, {})
                    const nowLiked = res?.data?.liked ?? !liked
                    setLiked(nowLiked)
                    setLikes((c) => nowLiked ? c + 1 : Math.max(0, c - 1))
                  } catch { /* optimistic no-op */ }
                })()
              }}
              maxHeight={320}
            />
          </div>
        )}

        {/* Text */}
        {item.text && (
          <p className="px-4 py-3 text-sm leading-relaxed" style={{ color: 'rgba(224,242,254,0.8)' }}>
            {renderMentions(item.text)}
          </p>
        )}

        {/* Action bar */}
        <div
          className="flex items-center gap-3 px-4 py-2.5"
          style={{ borderTop: '1px solid rgba(var(--accent-rgb),0.06)' }}
        >
          {/* Like */}
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

          {/* Comment */}
          <button
            onClick={openModal}
            className="flex items-center gap-1.5 transition-all duration-200"
            style={{ color: 'rgba(74,96,128,0.6)' }}
          >
            <MessageCircle size={15} />
            <span className="text-xs font-bold">{commentsCount > 0 ? commentsCount : ''}</span>
          </button>

          {/* Share */}
          {item.id && (
            <button
              onClick={(e) => { e.stopPropagation(); setSharing(true) }}
              className="flex items-center gap-1.5 transition-all duration-200 active:scale-110"
              style={{ color: 'rgba(74,96,128,0.6)' }}
              title="Share"
            >
              <Share2 size={15} />
              {localShares > 0 && (
                <span className="text-xs font-bold">{localShares}</span>
              )}
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {isOwner && item.id && (
              <Link
                href={`/feed/${item.id}/insights`}
                onClick={(e) => e.stopPropagation()}
                title="View insights"
                style={{ color: 'rgba(var(--accent-rgb),0.6)' }}
                className="transition-colors hover:text-[var(--accent)]"
              >
                <BarChart2 size={13} />
              </Link>
            )}
            {isOwner && item.id && (
              <button
                onClick={async (e) => {
                  e.stopPropagation()
                  try {
                    await api.delete(`/posts/${item.id}`)
                    onDelete?.(item.id!)
                  } catch (err) { logError('feed:delete-post', err) }
                }}
                title="Delete post"
                style={{ color: 'rgba(239,68,68,0.5)' }}
              >
                <Trash2 size={13} />
              </button>
            )}
            {!isOwner && item.id && (
              <button
                onClick={handleReport}
                disabled={reported}
                title={reported ? 'Reported' : 'Report post'}
                style={{ color: reported ? 'rgba(239,68,68,0.4)' : 'rgba(74,96,128,0.4)' }}
              >
                <Flag size={13} />
              </button>
            )}
            <Zap size={11} style={{ color: 'rgba(var(--accent-rgb),0.15)' }} />
          </div>
        </div>
      </div>

      {/* Instagram-style modal */}
      {showModal && item.id && (
        <PostDetailModal
          post={{ ...item, id: item.id }}
          onClose={() => setShowModal(false)}
          onLikeToggle={(nowLiked, newCount) => { setLiked(nowLiked); setLikes(newCount) }}
          onCommentAdded={() => setCommentsCount((c) => c + 1)}
          currentUserId={currentUserId}
          onDelete={() => { setShowModal(false); onDelete?.(item.id!) }}
        />
      )}

      {/* Share sheet (native / copy / repost) */}
      {sharing && item.id && (
        <ShareSheet
          post={{
            id: item.id,
            text: item.text ?? null,
            imageUrl: item.imageUrl ?? null,
            user: {
              displayName: item.user.displayName,
              username: item.user.username ?? (item.user.displayName || 'user'),
              photoUrl: item.user.photoUrl ?? null,
            },
            media: (item.media ?? []).map((m, idx) => ({
              id: m.id ?? `${item.id}-${idx}`,
              url: m.url,
              type: (m.type ?? 'IMAGE') as 'IMAGE' | 'VIDEO',
            })),
          }}
          onClose={() => setSharing(false)}
          onShared={() => setLocalShares((c) => c + 1)}
        />
      )}
    </>
  )
}

// ─── Feed Item Router ──────────────────────────────────────────────────────
function FeedItemCard({ item, currentUserId, onDelete }: { item: FeedItem; currentUserId?: string | null; onDelete?: (id: string) => void }) {
  if (item.type === 'RSVP')    return <RSVPCard item={item} />
  if (item.type === 'CHECKIN') return <CheckInCard item={item} />
  if (item.type === 'POST')    return <PostCard item={item} currentUserId={currentUserId} onDelete={onDelete} />
  return null
}

// ─── Upcoming Event Card ──────────────────────────────────────────────────
interface UpcomingEvent {
  id: string
  name: string
  type: string
  startsAt: string
  address?: string
  neighbourhood?: string
  coverImageUrl?: string | null
  ticketPrice?: number | null
  host?: { displayName?: string | null; username?: string | null; photoUrl?: string | null } | null
  _guestsCount?: number
}

function UpcomingEventCard({ event }: { event: UpcomingEvent }) {
  const typeColor = TYPE_COLORS[event.type] ?? 'var(--accent)'
  const typeLabel = TYPE_LABELS[event.type] ?? event.type.replace('_', ' ')
  const dateStr = new Date(event.startsAt).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <Link href={`/events/${event.id}`}>
      <div
        className="rounded-2xl overflow-hidden transition-all duration-200 active:scale-[0.98]"
        style={{ background: 'rgba(24,24,27,0.95)', border: `1px solid ${typeColor}20` }}
      >
        {event.coverImageUrl && (
          <div style={{ height: 140, overflow: 'hidden' }}>
            <img src={event.coverImageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <span
                className="inline-block text-[9px] font-black px-2 py-0.5 rounded mb-1.5"
                style={{ color: typeColor, border: `1px solid ${typeColor}50`, background: `${typeColor}15`, letterSpacing: '0.12em' }}
              >
                {typeLabel}
              </span>
              <p className="text-sm font-black leading-tight" style={{ color: '#e0f2fe' }}>{event.name}</p>
            </div>
            {event.ticketPrice != null && event.ticketPrice > 0 ? (
              <span className="text-xs font-black shrink-0 px-2 py-1 rounded-lg"
                style={{ color: '#00ff88', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)' }}>
                £{event.ticketPrice.toFixed(2)}
              </span>
            ) : (
              <span className="text-[9px] font-black shrink-0 px-2 py-1 rounded-lg"
                style={{ color: '#00ff88', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)' }}>
                FREE
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>
            <span className="flex items-center gap-1"><Calendar size={9} /> {dateStr}</span>
            {(event.neighbourhood || event.address) && (
              <span className="flex items-center gap-1 truncate"><MapPin size={9} /> {event.neighbourhood ?? event.address}</span>
            )}
          </div>
          {event.host && (
            <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid rgba(var(--accent-rgb),0.06)' }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
                style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>
                {(event.host.displayName ?? event.host.username ?? '?')[0]?.toUpperCase()}
              </div>
              <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>
                by {event.host.displayName ?? event.host.username ?? 'Unknown'}
              </span>
              {(event._guestsCount ?? 0) > 0 && (
                <span className="ml-auto flex items-center gap-1 text-[9px]" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
                  <Ticket size={9} /> {event._guestsCount} going
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
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
              background: 'rgba(var(--accent-rgb),0.06)',
              border: '2px dashed rgba(var(--accent-rgb),0.3)',
            }}
          >
            <Plus size={18} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
          </div>
          <span className="text-[9px] font-bold tracking-wide" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>YOUR STORY</span>
        </div>

        {/* Friend stories — only show demo data in dev mode */}
        {(DEV_MODE ? DEMO_STORIES : []).map((s) => (
          <div key={s.name} className="flex flex-col items-center gap-1.5 shrink-0">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(var(--accent-rgb),0.08)',
                border: s.active
                  ? '2px solid var(--accent)'
                  : '2px solid rgba(74,96,128,0.3)',
                boxShadow: s.active ? '0 0 12px rgba(var(--accent-rgb),0.35)' : 'none',
              }}
            >
              <span className="text-lg font-black" style={{ color: s.active ? 'var(--accent)' : 'rgba(74,96,128,0.6)' }}>
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
        style={{ background: 'rgba(var(--accent-rgb),0.05)', border: '1px solid rgba(var(--accent-rgb),0.12)' }}
      >
        <Users size={28} style={{ color: 'rgba(var(--accent-rgb),0.3)' }} />
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
          background: 'rgba(var(--accent-rgb),0.08)',
          border: '1px solid rgba(var(--accent-rgb),0.25)',
          color: 'var(--accent)',
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
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [composing, setComposing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const { dbUser } = useAuth()
  const currentUserId = dbUser?.id ?? null
  const isLoggedIn = !!dbUser

  function handlePostDeleted(id: string) {
    setFeedItems((prev) => prev.filter((item) => item.id !== id))
  }

  useEffect(() => {
    async function loadFeed() {
      setLoading(true)
      const endpoint = tab === 'following' ? '/feed' : '/feed/discover'
      try {
        const [feedRes, eventsRes] = await Promise.allSettled([
          api.get<{ data: FeedItem[] }>(endpoint),
          tab === 'foryou' ? api.get<{ data: UpcomingEvent[] }>('/events?limit=20&published=true') : Promise.resolve(null),
        ])
        const items: FeedItem[] = feedRes.status === 'fulfilled' ? (feedRes.value?.data ?? []) : (DEV_MODE ? DEMO_FEED : [])
        setFeedItems(items.length > 0 ? items : DEV_MODE ? DEMO_FEED : [])
        if (eventsRes.status === 'fulfilled' && eventsRes.value) {
          setUpcomingEvents((eventsRes.value as { data: UpcomingEvent[] }).data ?? [])
        }
      } catch {
        setFeedItems(DEV_MODE ? DEMO_FEED : [])
      } finally {
        setLoading(false)
      }
    }
    loadFeed()
  }, [tab, reloadKey])

  return (
    <div className="min-h-screen pb-28" style={{ background: '#04040d' }}>
      {/* ── Top line ── */}
      <div className="absolute top-14 inset-x-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.2), transparent)' }} />

      {/* ── Header ── */}
      <div
        className="sticky top-14 z-30 px-4 pt-4 pb-0"
        style={{
          background: 'rgba(4,4,13,0.95)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(var(--accent-rgb),0.07)',
        }}
      >
        <div className="max-w-xl mx-auto">
          {/* Title row */}
          <div className="flex items-center gap-3 mb-4">
            <Rss size={16} style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 6px rgba(var(--accent-rgb),0.7))' }} />
            <h1
              className="text-sm font-black tracking-[0.25em]"
              style={{ color: 'var(--accent)', textShadow: '0 0 16px rgba(var(--accent-rgb),0.5)' }}
            >
              FEED
            </h1>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 border-b" style={{ borderColor: 'rgba(var(--accent-rgb),0.08)' }}>
            {([['foryou', 'FOR YOU'], ['following', 'FOLLOWING']] as [FeedTab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="relative px-5 py-2.5 text-[10px] font-black tracking-widest transition-all duration-200"
                style={{
                  color: tab === key ? 'var(--accent)' : 'rgba(74,96,128,0.6)',
                  textShadow: tab === key ? '0 0 10px rgba(var(--accent-rgb),0.6)' : 'none',
                }}
              >
                {label}
                {tab === key && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-px"
                    style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }}
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
        <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.15), transparent)' }} />
      </div>

      {/* ── Feed ── */}
      <div className="max-w-xl mx-auto px-4 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center py-20 gap-4">
            <div
              className="w-10 h-10 rounded-full border-2 animate-spin"
              style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }}
            />
            <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
              LOADING FEED...
            </p>
          </div>
        ) : (
          <>
            {/* Social activity items */}
            {feedItems.map((item, i) => (
              <FeedItemCard key={item.id ?? i} item={item} currentUserId={currentUserId} onDelete={handlePostDeleted} />
            ))}

            {/* Upcoming events — shown in For You tab, either as filler or after activity */}
            {tab === 'foryou' && upcomingEvents.length > 0 && (
              <>
                {feedItems.length > 0 && (
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 h-px" style={{ background: 'rgba(var(--accent-rgb),0.08)' }} />
                    <span className="text-[9px] font-black tracking-[0.2em]" style={{ color: 'rgba(var(--accent-rgb),0.3)' }}>UPCOMING EVENTS</span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(var(--accent-rgb),0.08)' }} />
                  </div>
                )}
                {upcomingEvents.map((event) => (
                  <UpcomingEventCard key={event.id} event={event} />
                ))}
              </>
            )}

            {/* Empty state — only if truly nothing */}
            {feedItems.length === 0 && (tab !== 'foryou' || upcomingEvents.length === 0) && (
              <EmptyState />
            )}
          </>
        )}
      </div>

      {/* ── Floating compose button ─────────────────────────────────────── */}
      {isLoggedIn && (
        <button
          onClick={() => setComposing(true)}
          className="fixed bottom-24 right-5 w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all active:scale-95 z-40"
          style={{
            background: 'linear-gradient(135deg, #ec4899, #f97316)',
            boxShadow: '0 4px 24px rgba(236,72,153,0.4)',
          }}
          aria-label="Create post"
        >
          <Camera size={22} style={{ color: '#fff' }} />
        </button>
      )}

      {/* ── Compose modal ───────────────────────────────────────────────── */}
      {composing && (
        <ComposePostModal
          onClose={() => setComposing(false)}
          onPosted={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  )
}
