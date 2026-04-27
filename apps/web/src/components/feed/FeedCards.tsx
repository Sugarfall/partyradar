'use client'

/**
 * Shared feed-card components.
 *
 * Used by both /feed/page.tsx (the full feed page) and DiscoverFeedTab
 * so that the Discover > Feed tab renders with exactly the same design.
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  Heart, MessageCircle, Trash2, Flag, BarChart2, Share2, Repeat2,
  Calendar, MapPin, Zap,
} from 'lucide-react'

import { api } from '@/lib/api'
import { logError } from '@/lib/logError'
import PostMediaViewer, { type MediaItem, type PostTagLite } from './PostMediaViewer'
import ShareSheet from './ShareSheet'
import PostDetailModal from './PostDetailModal'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeedUser {
  id?: string
  username?: string
  displayName: string
  photoUrl?: string | null
}
export interface FeedEvent { id?: string; name: string; type?: string }
export interface FeedVenue { id?: string; name: string }

export interface OriginalPost {
  id: string
  text?: string | null
  imageUrl?: string | null
  media?: MediaItem[] | null
  user: FeedUser
  event?: FeedEvent | null
  createdAt: string
}

export interface FeedItem {
  id?: string
  type: 'RSVP' | 'CHECKIN' | 'POST'
  user: FeedUser
  event?: FeedEvent | null
  venue?: FeedVenue | null
  crowdLevel?: string
  text?: string | null
  imageUrl?: string | null
  media?: MediaItem[] | null
  tags?: PostTagLite[] | null
  likesCount?: number
  commentsCount?: number
  repostsCount?: number
  sharesCount?: number
  hasLiked?: boolean
  originalPost?: OriginalPost | null
  createdAt: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const TYPE_COLORS: Record<string, string> = {
  HOME_PARTY: '#ff006e',
  CLUB_NIGHT: 'var(--accent)',
  CONCERT: '#3d5afe',
  PUB_NIGHT: '#f59e0b',
}
export const TYPE_LABELS: Record<string, string> = {
  HOME_PARTY: 'HOUSE PARTY',
  CLUB_NIGHT: 'CLUB NIGHT',
  CONCERT: 'CONCERT',
  PUB_NIGHT: 'PUB NIGHT',
}
export const CROWD_CONFIG: Record<string, { color: string; label: string }> = {
  QUIET:  { color: '#00ff88', label: 'QUIET'  },
  BUSY:   { color: '#ffd600', label: 'BUSY'   },
  RAMMED: { color: '#ff006e', label: 'RAMMED' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function timeAgo(dateStr: string) {
  const s = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}

export function renderMentions(text: string): React.ReactNode {
  const parts = text.split(/(@[\w.]+)/g)
  return parts.map((part, i) =>
    /^@\w/.test(part)
      ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 700 }}>{part}</span>
      : <span key={i}>{part}</span>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({
  user,
  size = 36,
  hasStory = false,
  onStoryClick,
}: {
  user: { id?: string; displayName: string; photoUrl?: string | null }
  size?: number
  hasStory?: boolean
  onStoryClick?: (e: React.MouseEvent) => void
}) {
  const initials = user.displayName?.[0]?.toUpperCase() ?? '?'

  // Core avatar element (no ring)
  const avatarEl = user.photoUrl ? (
    <img
      src={user.photoUrl}
      alt=""
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="rounded-full flex items-center justify-center font-black"
      style={{
        width: size, height: size,
        background: 'rgba(var(--accent-rgb),0.08)',
        color: 'var(--accent)',
        fontSize: size * 0.38,
      }}
    >
      {initials}
    </div>
  )

  if (!hasStory) {
    return (
      <div
        className="rounded-full shrink-0 overflow-hidden"
        style={{ width: size, height: size, border: '1px solid rgba(var(--accent-rgb),0.25)', boxShadow: '0 0 8px rgba(var(--accent-rgb),0.12)' }}
      >
        {avatarEl}
      </div>
    )
  }

  // Story ring: gradient outer → dark gap → avatar
  const ringContent = (
    <div
      className="rounded-full flex items-center justify-center"
      style={{ width: size + 2, height: size + 2, background: '#04040d', overflow: 'hidden' }}
    >
      {avatarEl}
    </div>
  )

  if (onStoryClick) {
    return (
      <button
        onClick={onStoryClick}
        className="rounded-full shrink-0 flex items-center justify-center p-0"
        style={{ width: size + 6, height: size + 6, background: 'linear-gradient(135deg, #ec4899, #f97316, #facc15)', cursor: 'pointer' }}
        aria-label="View story"
      >
        {ringContent}
      </button>
    )
  }
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center"
      style={{ width: size + 6, height: size + 6, background: 'linear-gradient(135deg, #ec4899, #f97316, #facc15)' }}
    >
      {ringContent}
    </div>
  )
}

// ─── Quoted post embed (shown inside a quote-repost) ─────────────────────────

export function QuotedPost({ post }: { post: OriginalPost }) {
  const thumb = post.media?.[0]?.url ?? post.imageUrl
  return (
    <div
      className="mx-3 mb-3 rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(var(--accent-rgb),0.18)', background: 'rgba(var(--accent-rgb),0.04)' }}
    >
      {thumb && (
        <div className="w-full overflow-hidden" style={{ maxHeight: 180 }}>
          {post.media?.[0]?.type === 'VIDEO' ? (
            <video src={thumb} className="w-full object-cover" style={{ maxHeight: 180 }} muted playsInline />
          ) : (
            <img src={thumb} alt="" className="w-full object-cover" style={{ maxHeight: 180 }} />
          )}
        </div>
      )}
      <div className="flex items-start gap-2 p-3">
        <Avatar user={post.user} size={24} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-black" style={{ color: '#e0f2fe' }}>{post.user.displayName}</span>
            {post.user.username && (
              <span className="text-[10px]" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>@{post.user.username}</span>
            )}
            <span className="text-[10px] ml-auto shrink-0" style={{ color: 'rgba(74,96,128,0.45)' }}>
              {timeAgo(post.createdAt)}
            </span>
          </div>
          {post.text && (
            <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'rgba(224,242,254,0.65)' }}>
              {post.text}
            </p>
          )}
          {post.event && (
            <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
              <Calendar size={9} /> {post.event.name}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── RSVP Card ────────────────────────────────────────────────────────────────

export function RSVPCard({ item, storyUserIds, onOpenUserStory }: {
  item: FeedItem
  storyUserIds?: Set<string>
  onOpenUserStory?: (userId: string) => void
}) {
  const typeColor = item.event?.type ? (TYPE_COLORS[item.event.type] ?? 'var(--accent)') : 'var(--accent)'
  const typeLabel = item.event?.type ? (TYPE_LABELS[item.event.type] ?? item.event.type) : ''
  const hasStory = !!(item.user.id && storyUserIds?.has(item.user.id))
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(24,24,27,0.95)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
    >
      <div className="flex items-center gap-3 p-3">
        <Avatar
          user={item.user}
          hasStory={hasStory}
          onStoryClick={hasStory && item.user.id && onOpenUserStory
            ? (e) => { e.stopPropagation(); onOpenUserStory(item.user.id!) }
            : undefined}
        />
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

// ─── Check-In Card ────────────────────────────────────────────────────────────

export function CheckInCard({ item, storyUserIds, onOpenUserStory }: {
  item: FeedItem
  storyUserIds?: Set<string>
  onOpenUserStory?: (userId: string) => void
}) {
  const crowd = item.crowdLevel ? (CROWD_CONFIG[item.crowdLevel] ?? { color: 'var(--accent)', label: item.crowdLevel }) : null
  const hasStory = !!(item.user.id && storyUserIds?.has(item.user.id))
  return (
    <div
      className="rounded-2xl p-3"
      style={{ background: 'rgba(24,24,27,0.95)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
    >
      <div className="flex items-center gap-3">
        <Avatar
          user={item.user}
          hasStory={hasStory}
          onStoryClick={hasStory && item.user.id && onOpenUserStory
            ? (e) => { e.stopPropagation(); onOpenUserStory(item.user.id!) }
            : undefined}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black leading-tight" style={{ color: '#e0f2fe' }}>
            <span style={{ color: 'var(--accent)' }}>{item.user.displayName}</span>
            <span style={{ color: 'rgba(224,242,254,0.55)', fontWeight: 600 }}> checked in at </span>
            {item.venue?.id ? (
              <Link href={`/venues/${item.venue.id}`} style={{ color: '#e0f2fe' }} className="hover:underline">
                {item.venue.name}
              </Link>
            ) : item.event?.id ? (
              <Link href={`/events/${item.event.id}`} style={{ color: '#e0f2fe' }} className="hover:underline">
                {item.event.name}
              </Link>
            ) : (
              <span style={{ color: '#e0f2fe' }}>{item.venue?.name ?? item.event?.name ?? '??'}</span>
            )}
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

// ─── Post Card ────────────────────────────────────────────────────────────────

export function PostCard({ item, currentUserId, onDelete, storyUserIds, onOpenUserStory }: {
  item: FeedItem
  currentUserId?: string | null
  onDelete?: (id: string) => void
  storyUserIds?: Set<string>
  onOpenUserStory?: (userId: string) => void
}) {
  const [liked, setLiked]               = useState(item.hasLiked ?? false)
  const [likes, setLikes]               = useState(item.likesCount ?? 0)
  const [commentsCount, setCommentsCount] = useState(item.commentsCount ?? 0)
  const [localReposts, setLocalReposts] = useState(item.repostsCount ?? 0)
  const [reported, setReported]         = useState(false)
  const [showModal, setShowModal]       = useState(false)
  const [sharing, setSharing]           = useState(false)
  const [localShares, setLocalShares]   = useState(item.sharesCount ?? 0)

  const isOwner   = !!(currentUserId && item.user.id && currentUserId === item.user.id)
  const isRepost  = !!item.originalPost
  const displayPost = item.originalPost

  async function handleLike(e: React.MouseEvent) {
    e.stopPropagation()
    if (!item.id) {
      const nowLiked = !liked; setLiked(nowLiked); setLikes((c) => nowLiked ? c + 1 : Math.max(0, c - 1)); return
    }
    try {
      const res = await api.post<{ data: { liked: boolean } }>(`/posts/${item.id}/like`, {})
      const nowLiked = res?.data?.liked ?? !liked
      setLiked(nowLiked); setLikes((c) => nowLiked ? c + 1 : Math.max(0, c - 1))
    } catch {
      const nowLiked = !liked; setLiked(nowLiked); setLikes((c) => nowLiked ? c + 1 : Math.max(0, c - 1))
    }
  }

  async function handleQuickRepost(e: React.MouseEvent) {
    e.stopPropagation()
    if (!item.id) return
    try {
      await api.post('/posts', { originalPostId: item.id })
      setLocalReposts((c) => c + 1)
    } catch {/* silent */}
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
        style={{ background: 'rgba(24,24,27,0.95)', border: '1px solid rgba(var(--accent-rgb),0.1)', cursor: item.id ? 'pointer' : 'default' }}
        onClick={openModal}
      >
        {/* ── Repost attribution banner ── */}
        {isRepost && (
          <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
            <Repeat2 size={12} style={{ color: 'rgba(var(--accent-rgb),0.45)' }} />
            <span className="text-[10px] font-bold" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>
              {item.user.displayName} reposted
            </span>
          </div>
        )}

        {/* ── Post header ── */}
        <div className="flex items-center gap-3 p-3 pb-2">
          {(() => {
            const avatarUser = isRepost && displayPost ? displayPost.user : item.user
            const hasStory = !!(avatarUser.id && storyUserIds?.has(avatarUser.id))
            return (
              <Avatar
                user={avatarUser}
                hasStory={hasStory}
                onStoryClick={hasStory && avatarUser.id && onOpenUserStory
                  ? (e) => { e.stopPropagation(); onOpenUserStory(avatarUser.id!) }
                  : undefined}
              />
            )
          })()}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>
              {isRepost && displayPost ? displayPost.user.displayName : item.user.displayName}
            </p>
            {(isRepost && displayPost ? displayPost.event : item.event) && (
              <p className="text-[10px] flex items-center gap-1 mt-0.5" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
                <Calendar size={9} /> {(isRepost && displayPost ? displayPost.event : item.event)!.name}
              </p>
            )}
          </div>
          <span className="text-[10px] font-bold shrink-0" style={{ color: 'rgba(74,96,128,0.55)' }}>
            {timeAgo(item.createdAt)}
          </span>
        </div>

        {/* ── Reposter's optional quote caption ── */}
        {isRepost && item.text && (
          <p className="px-4 pb-2 text-sm leading-relaxed" style={{ color: 'rgba(224,242,254,0.85)' }}>
            {renderMentions(item.text)}
          </p>
        )}

        {/* ── Media ── */}
        {(() => {
          const src = isRepost && displayPost ? displayPost : item
          const hasMedia = src.id && (src.imageUrl || (src.media && src.media.length > 0))
          if (!hasMedia) return null
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <PostMediaViewer
                postId={src.id!}
                media={'media' in src ? src.media ?? undefined : undefined}
                imageUrl={src.imageUrl ?? undefined}
                tags={!isRepost ? item.tags ?? undefined : undefined}
                onDoubleTap={() => {
                  if (!item.id) return
                  void (async () => {
                    try {
                      const res = await api.post<{ data: { liked: boolean } }>(`/posts/${item.id}/like`, {})
                      const nowLiked = res?.data?.liked ?? !liked
                      setLiked(nowLiked); setLikes((c) => nowLiked ? c + 1 : Math.max(0, c - 1))
                    } catch {/* */}
                  })()
                }}
                maxHeight={320}
              />
            </div>
          )
        })()}

        {/* ── Original post text (non-repost) ── */}
        {!isRepost && item.text && (
          <p className="px-4 py-3 text-sm leading-relaxed" style={{ color: 'rgba(224,242,254,0.8)' }}>
            {renderMentions(item.text)}
          </p>
        )}

        {/* ── Plain repost with no caption: show original text ── */}
        {isRepost && !item.text && displayPost?.text && (
          <p className="px-4 py-2 pb-3 text-sm leading-relaxed" style={{ color: 'rgba(224,242,254,0.8)' }}>
            {renderMentions(displayPost.text)}
          </p>
        )}

        {/* ── Quote repost: embedded original card ── */}
        {isRepost && item.text && displayPost && (
          <QuotedPost post={displayPost} />
        )}

        {/* ── Action bar ── */}
        <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: '1px solid rgba(var(--accent-rgb),0.06)' }}>
          {/* Like */}
          <button onClick={handleLike} className="flex items-center gap-1.5 transition-all duration-200"
            style={{ color: liked ? '#ec4899' : 'rgba(74,96,128,0.6)' }}>
            <Heart size={15} fill={liked ? '#ec4899' : 'none'} style={{ filter: liked ? 'drop-shadow(0 0 4px rgba(236,72,153,0.6))' : 'none' }} />
            <span className="text-xs font-bold">{likes > 0 ? likes : ''}</span>
          </button>

          {/* Comment */}
          <button onClick={openModal} className="flex items-center gap-1.5 transition-all duration-200"
            style={{ color: 'rgba(74,96,128,0.6)' }}>
            <MessageCircle size={15} />
            <span className="text-xs font-bold">{commentsCount > 0 ? commentsCount : ''}</span>
          </button>

          {/* Quick repost */}
          {item.id && !isOwner && (
            <button onClick={handleQuickRepost} className="flex items-center gap-1.5 transition-all duration-200 active:scale-110"
              title="Repost" style={{ color: 'rgba(74,96,128,0.6)' }}>
              <Repeat2 size={15} />
              <span className="text-xs font-bold">{localReposts > 0 ? localReposts : ''}</span>
            </button>
          )}

          {/* Share / Quote */}
          {item.id && (
            <button onClick={(e) => { e.stopPropagation(); setSharing(true) }}
              className="flex items-center gap-1.5 transition-all duration-200 active:scale-110"
              title="Share or Quote" style={{ color: 'rgba(74,96,128,0.6)' }}>
              <Share2 size={15} />
              {localShares > 0 && <span className="text-xs font-bold">{localShares}</span>}
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {isOwner && item.id && (
              <Link href={`/feed/${item.id}/insights`} onClick={(e) => e.stopPropagation()}
                title="View insights" style={{ color: 'rgba(var(--accent-rgb),0.6)' }}>
                <BarChart2 size={13} />
              </Link>
            )}
            {isOwner && item.id && (
              <button onClick={async (e) => {
                  e.stopPropagation()
                  try { await api.delete(`/posts/${item.id}`); onDelete?.(item.id!) }
                  catch (err) { logError('feed:delete-post', err) }
                }}
                title="Delete post" style={{ color: 'rgba(239,68,68,0.5)' }}>
                <Trash2 size={13} />
              </button>
            )}
            {!isOwner && item.id && (
              <button onClick={handleReport} disabled={reported}
                title={reported ? 'Reported' : 'Report post'}
                style={{ color: reported ? 'rgba(239,68,68,0.4)' : 'rgba(74,96,128,0.4)' }}>
                <Flag size={13} />
              </button>
            )}
            <Zap size={11} style={{ color: 'rgba(var(--accent-rgb),0.15)' }} />
          </div>
        </div>
      </div>

      {/* Post detail modal */}
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

      {/* Share / Quote sheet */}
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

// ─── Feed Item Router ─────────────────────────────────────────────────────────

export function FeedItemCard({ item, currentUserId, onDelete, storyUserIds, onOpenUserStory }: {
  item: FeedItem
  currentUserId?: string | null
  onDelete?: (id: string) => void
  storyUserIds?: Set<string>
  onOpenUserStory?: (userId: string) => void
}) {
  if (item.type === 'RSVP')    return <RSVPCard    item={item} storyUserIds={storyUserIds} onOpenUserStory={onOpenUserStory} />
  if (item.type === 'CHECKIN') return <CheckInCard  item={item} storyUserIds={storyUserIds} onOpenUserStory={onOpenUserStory} />
  if (item.type === 'POST')    return <PostCard     item={item} currentUserId={currentUserId} onDelete={onDelete} storyUserIds={storyUserIds} onOpenUserStory={onOpenUserStory} />
  return null
}
