'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Heart, Flag, Camera, MapPin, Calendar, Zap, Share2, BarChart2, MessageCircle, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { logError } from '@/lib/logError'
import { isVideoUrl } from '@/lib/cloudinary'
import ComposePostModal from './ComposePostModal'
import PostMediaViewer, { type MediaItem, type PostTagLite } from './PostMediaViewer'
import ShareSheet from './ShareSheet'
import PostDetailModal from './PostDetailModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeedUser {
  id: string
  username: string
  displayName: string
  photoUrl?: string | null
}

interface FeedEvent {
  id: string
  name: string
  startsAt: string
  neighbourhood?: string | null
  coverImageUrl?: string | null
}

interface FeedVenue {
  id: string
  name: string
  address?: string | null
  photoUrl?: string | null
}

// Server returns a FLAT shape per item — post fields live at the top level
// on POST items, checkin fields on CHECKIN items. No nested `post` wrapper.
interface FeedItem {
  type: 'POST' | 'CHECKIN' | 'RSVP'
  user: FeedUser
  event?: FeedEvent | null
  venue?: FeedVenue | null
  // Post fields (present on POST items)
  id?: string | null
  imageUrl?: string | null
  text?: string | null
  isStory?: boolean
  likesCount?: number
  commentsCount?: number
  viewCount?: number
  /** Phase 2: ordered carousel media (falls back to `imageUrl` when empty). */
  media?: MediaItem[] | null
  /** Phase 2: resolved tags with nested user/venue records. */
  tags?: PostTagLite[] | null
  /** Phase 4: share + repost counters. */
  sharesCount?: number
  repostsCount?: number
  // Checkin fields (present on CHECKIN items)
  crowdLevel?: string | null
  createdAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatViews(n: number): string {
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function timeAgo(dateStr: string) {
  const s = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

const CROWD: Record<string, { color: string; label: string; emoji: string }> = {
  QUIET:  { color: '#00ff88', label: 'QUIET',  emoji: '😌' },
  BUSY:   { color: '#ffd600', label: 'BUSY',   emoji: '🔥' },
  RAMMED: { color: '#ff006e', label: 'RAMMED', emoji: '🤯' },
}

function Avatar({ user, size = 36 }: { user: { displayName: string; photoUrl?: string | null }; size?: number }) {
  return user.photoUrl ? (
    <img
      src={user.photoUrl} alt=""
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-black text-xs"
      style={{ width: size, height: size, background: 'rgba(0,200,255,0.12)', border: '1px solid rgba(0,200,255,0.25)', color: 'var(--accent)' }}
    >
      {user.displayName[0]?.toUpperCase()}
    </div>
  )
}


// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({
  item, liked, onLike, reported, onReport, currentUserId,
  onOpenComments, onDelete, localCommentBump = 0,
}: {
  item: FeedItem
  liked: boolean
  onLike: () => void
  reported: boolean
  onReport: () => void
  /** Used to decide whether to show the owner-only Insights link. */
  currentUserId?: string | null
  /** Open the shared PostDetailModal (comments thread) for this post. */
  onOpenComments: () => void
  /** Owner-only: delete this post (called after the API succeeds). */
  onDelete: () => void
  /** Optimistic in-session comment count bump from the modal. */
  localCommentBump?: number
}) {
  // Flat-shape alias — the server keeps post fields at the top level of
  // the feed item, so `post.X` reads the same field as `item.X`.
  const post = item as FeedItem & { id: string; likesCount: number }
  const isOwner = !!(currentUserId && item.user.id === currentUserId)
  const [sharing, setSharing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Optimistic share counter: bumped in-place when the user acts, snapping
  // back to the server value on the next feed refresh.
  const [localShares, setLocalShares] = useState(post.sharesCount ?? 0)

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    try {
      await api.delete(`/posts/${post.id}`)
      onDelete()
    } catch (err) {
      logError('discover-feed:delete-post', err)
      setDeleting(false)
    }
  }
  // Determine whether this post has any video for the view-count Instagram
  // footer. We check `media` first (preferred) and fall back to `imageUrl`.
  const hasVideo = (post.media ?? []).some((m) => m.type === 'VIDEO')
    || (!post.media?.length && post.imageUrl ? isVideoUrl(post.imageUrl) : false)

  return (
    <div className="overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <Link href={`/profile/${item.user.username}`}>
          <Avatar user={item.user} size={36} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/profile/${item.user.username}`}>
              <span className="text-sm font-bold text-white">{item.user.displayName}</span>
            </Link>
            {post.isStory && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(236,72,153,0.15)', color: '#ec4899', border: '1px solid rgba(236,72,153,0.3)' }}>
                STORY
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-white/30">{timeAgo(item.createdAt)}</span>
            {(item.event || item.venue) && (
              <>
                <span className="text-white/20 text-[10px]">·</span>
                <Link
                  href={item.event ? `/events/${item.event.id}` : `/venues/${item.venue!.id}`}
                  className="flex items-center gap-1 text-[10px] font-semibold truncate max-w-[160px]"
                  style={{ color: 'rgba(0,200,255,0.7)' }}
                >
                  {item.event ? <Calendar size={9} /> : <MapPin size={9} />}
                  {item.event?.name ?? item.venue?.name}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Media — carousel + autoplay video + tag overlays. Double-tap to like. */}
      {(post.imageUrl || (post.media && post.media.length > 0)) && (
        <PostMediaViewer
          postId={post.id}
          media={post.media}
          imageUrl={post.imageUrl}
          tags={post.tags}
          onDoubleTap={() => { if (!liked) onLike() }}
          maxHeight={480}
        />
      )}

      {/* View count — videos only, Instagram-style */}
      {hasVideo && (post.viewCount ?? 0) > 0 && (
        <p className="px-4 pt-2 pb-0 text-xs font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {formatViews(post.viewCount ?? 0)} views
        </p>
      )}

      {/* Caption */}
      {post.text && (
        <p className="px-4 py-3 text-sm leading-relaxed" style={{ color: 'rgba(224,242,254,0.85)' }}>
          {post.text}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <button
          onClick={onLike}
          className="flex items-center gap-1.5 transition-all duration-200 active:scale-110"
          style={{ color: liked ? '#ec4899' : 'rgba(255,255,255,0.25)' }}
        >
          <Heart size={16} fill={liked ? '#ec4899' : 'none'} style={{ filter: liked ? 'drop-shadow(0 0 5px rgba(236,72,153,0.7))' : 'none' }} />
          {(post.likesCount + (liked ? 1 : 0)) > 0 && (
            <span className="text-xs font-bold">{post.likesCount + (liked ? 1 : 0)}</span>
          )}
        </button>

        {/* Comment — opens the shared PostDetailModal (comments thread) */}
        <button
          onClick={onOpenComments}
          className="flex items-center gap-1.5 transition-all duration-200 active:scale-110"
          style={{ color: 'rgba(255,255,255,0.35)' }}
          title="Comment"
        >
          <MessageCircle size={16} />
          {((post.commentsCount ?? 0) + localCommentBump) > 0 && (
            <span className="text-xs font-bold">{(post.commentsCount ?? 0) + localCommentBump}</span>
          )}
        </button>

        {/* Share — opens the share sheet (native share / copy link / repost) */}
        <button
          onClick={() => setSharing(true)}
          className="flex items-center gap-1.5 transition-all duration-200 active:scale-110"
          style={{ color: 'rgba(255,255,255,0.35)' }}
          title="Share"
        >
          <Share2 size={16} />
          {localShares > 0 && (
            <span className="text-xs font-bold">{localShares}</span>
          )}
        </button>

        <div className="ml-auto flex items-center gap-3">
          {isOwner && (
            <Link
              href={`/feed/${post.id}/insights`}
              title="View insights"
              className="transition-colors"
              style={{ color: 'rgba(var(--accent-rgb),0.65)' }}
            >
              <BarChart2 size={13} />
            </Link>
          )}
          {isOwner && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Delete post"
              style={{ color: deleting ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.55)' }}
            >
              <Trash2 size={13} />
            </button>
          )}
          {!isOwner && (
            <button
              onClick={onReport}
              disabled={reported}
              style={{ color: reported ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.15)' }}
              title="Report post"
            >
              <Flag size={13} />
            </button>
          )}
        </div>
      </div>

      {sharing && (
        <ShareSheet
          post={{
            id: post.id,
            text: post.text,
            imageUrl: post.imageUrl,
            user: item.user,
            media: (post.media ?? []).map((m) => ({
              id: m.id ?? `${post.id}-${m.sortOrder ?? 0}`,
              url: m.url,
              type: (m.type ?? 'IMAGE') as 'IMAGE' | 'VIDEO',
            })),
          }}
          onShared={() => setLocalShares((c) => c + 1)}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  )
}

// ─── Check-in Card ────────────────────────────────────────────────────────────

function CheckinCard({ item }: { item: FeedItem }) {
  const crowd = item.crowdLevel ? CROWD[item.crowdLevel] : null

  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <Link href={`/profile/${item.user.username}`}>
        <Avatar user={item.user} size={32} />
      </Link>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white/80">
          <span className="text-white font-bold">{item.user.displayName}</span>
          {' '}checked in
        </p>
        {(item.event || item.venue) && (
          <Link
            href={item.event ? `/events/${item.event.id}` : `/venues/${item.venue!.id}`}
            className="text-[10px] font-semibold truncate block mt-0.5"
            style={{ color: 'rgba(0,200,255,0.6)' }}
          >
            📍 {item.event?.name ?? item.venue?.name}
          </Link>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {crowd && (
          <span className="text-[9px] font-black px-2 py-1 rounded-full"
            style={{ background: `${crowd.color}15`, color: crowd.color, border: `1px solid ${crowd.color}30` }}>
            {crowd.emoji} {crowd.label}
          </span>
        )}
        <span className="text-[9px] text-white/25">{timeAgo(item.createdAt)}</span>
      </div>
    </div>
  )
}


// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  dbUser: { id: string; username: string; displayName: string; photoUrl?: string | null } | null
  isLoggedIn: boolean
}

export default function DiscoverFeedTab({ dbUser, isLoggedIn }: Props) {
  const currentUserId = dbUser?.id ?? null
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [feedError, setFeedError] = useState(false)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set())
  const [composing, setComposing] = useState(false)
  // id of the post currently open in the comments/detail modal
  const [openModalPostId, setOpenModalPostId] = useState<string | null>(null)
  // optimistic comment-count bumps keyed by postId (modal reports new comments)
  const [commentBumps, setCommentBumps] = useState<Record<string, number>>({})
  const loadedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setFeedError(false) }
    try {
      const feedRes = await api.get<{ data: FeedItem[] }>('/feed/discover')
      setItems(feedRes.data ?? [])
      setFeedError(false)
    } catch (err) {
      // Log the error so it appears in Vercel/browser console instead of
      // disappearing silently, and expose an error state so the UI can show
      // a retry button rather than an infinite loading spinner.
      logError('feed:discover', err)
      if (!silent) setFeedError(true)
    }
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    load()
  }, [load])

  // Silently refresh whenever the user navigates back to this tab
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && loadedRef.current) {
        load(true)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  async function handleLike(postId: string) {
    if (!isLoggedIn) return
    const already = likedIds.has(postId)
    setLikedIds(prev => {
      const next = new Set(prev)
      already ? next.delete(postId) : next.add(postId)
      return next
    })
    try {
      await api.post(`/posts/${postId}/like`, {})
    } catch {
      // revert
      setLikedIds(prev => {
        const next = new Set(prev)
        already ? next.add(postId) : next.delete(postId)
        return next
      })
    }
  }

  async function handleReport(postId: string) {
    if (!isLoggedIn || reportedIds.has(postId)) return
    setReportedIds(prev => new Set(prev).add(postId))
    try {
      await api.post('/reports', { contentType: 'post', contentId: postId, reason: 'OTHER' })
    } catch {}
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <div className="h-2 w-16 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
              </div>
            </div>
            {i === 0 && <div className="h-48 w-full rounded-xl animate-pulse mb-3" style={{ background: 'rgba(255,255,255,0.04)' }} />}
            <div className="h-2.5 w-3/4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
          </div>
        ))}
      </div>
    )
  }

  // Error state — show retry rather than an infinite spinner
  if (feedError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-16">
        <p className="text-sm text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Couldn't load the feed right now.
        </p>
        <button
          onClick={() => load()}
          className="px-5 py-2.5 rounded-xl text-sm font-bold"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          Try again
        </button>
      </div>
    )
  }

  // Only show real posts — API now returns POST type only but guard here too
  const allItems = items.filter(i => i.type === 'POST' && !!i.id)

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-20">

        {/* ── Feed Stats bar ───────────────────────────────────────────────── */}
        {allItems.length > 0 && (
          <div
            className="flex items-center gap-4 px-4 py-2"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.15)' }}
          >
            <span className="text-[10px] font-bold text-white/30">RECENT</span>
            <span className="text-[10px] font-semibold text-white/20 ml-auto">
              {allItems.length} post{allItems.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* ── Feed Items ──────────────────────────────────────────────────── */}
        {allItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-5">
            <div className="text-5xl">🎉</div>
            <div>
              <p className="font-black text-white text-base mb-1">Nothing posted yet</p>
              <p className="text-sm text-white/35 leading-relaxed">
                Share photos and videos from events and venues. Be the first to post.
              </p>
            </div>
            {isLoggedIn && (
              <button
                onClick={() => setComposing(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-black tracking-wider transition-all"
                style={{ background: 'linear-gradient(135deg, rgba(236,72,153,0.2), rgba(249,115,22,0.2))', border: '1px solid rgba(236,72,153,0.35)', color: '#ec4899' }}
              >
                <Camera size={16} /> SHARE YOUR NIGHT
              </button>
            )}
            {!isLoggedIn && (
              <Link
                href="/login"
                className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-black tracking-wider"
                style={{ background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.3)', color: 'var(--accent)' }}
              >
                Sign in to post
              </Link>
            )}
          </div>
        ) : (
          allItems.map((item, idx) => (
            <PostCard
              key={`${item.id}-${idx}`}
              item={item}
              liked={likedIds.has(item.id!)}
              onLike={() => handleLike(item.id!)}
              reported={reportedIds.has(item.id!)}
              onReport={() => handleReport(item.id!)}
              currentUserId={currentUserId}
              onOpenComments={() => setOpenModalPostId(item.id!)}
              onDelete={() => setItems((prev) => prev.filter((p) => p.id !== item.id))}
              localCommentBump={commentBumps[item.id!] ?? 0}
            />
          ))
        )}

        {/* ── Live activity footer ─────────────────────────────────────────── */}
        {allItems.length > 0 && (
          <div className="flex items-center justify-center gap-2 py-6">
            <Zap size={11} style={{ color: 'rgba(0,200,255,0.2)' }} />
            <span className="text-[10px] text-white/20 font-semibold">Live activity</span>
          </div>
        )}
      </div>

      {/* ── Floating compose button ─────────────────────────────────────── */}
      {isLoggedIn && (
        <button
          onClick={() => setComposing(true)}
          className="absolute bottom-5 right-5 w-12 h-12 rounded-2xl flex items-center justify-center shadow-2xl transition-all active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #ec4899, #f97316)',
            boxShadow: '0 4px 24px rgba(236,72,153,0.4)',
          }}
        >
          <Camera size={20} style={{ color: '#fff' }} />
        </button>
      )}

      {/* ── Compose modal ───────────────────────────────────────────────── */}
      {composing && (
        <ComposePostModal
          onClose={() => setComposing(false)}
          onPosted={() => {
            // Scroll to top immediately so the new post is visible when the reload completes
            scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
            loadedRef.current = false
            load(true)
          }}
        />
      )}

      {/* ── Post detail / comments modal ────────────────────────────────── */}
      {openModalPostId && (() => {
        const post = items.find((p) => p.id === openModalPostId)
        if (!post) return null
        const postId = post.id!
        const alreadyLiked = likedIds.has(postId)
        const baseLikes = post.likesCount ?? 0
        return (
          <PostDetailModal
            post={{
              id: postId,
              text: post.text,
              imageUrl: post.imageUrl,
              media: post.media,
              tags: post.tags,
              likesCount: baseLikes + (alreadyLiked ? 1 : 0),
              sharesCount: post.sharesCount,
              hasLiked: alreadyLiked,
              createdAt: post.createdAt,
              user: post.user,
              event: post.event ? { name: post.event.name } : null,
            }}
            currentUserId={currentUserId}
            onClose={() => setOpenModalPostId(null)}
            onLikeToggle={(nowLiked) => {
              setLikedIds((prev) => {
                const next = new Set(prev)
                if (nowLiked) next.add(postId); else next.delete(postId)
                return next
              })
            }}
            onCommentAdded={() => {
              setCommentBumps((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }))
            }}
            onDelete={() => {
              setItems((prev) => prev.filter((p) => p.id !== postId))
              setOpenModalPostId(null)
            }}
          />
        )
      })()}
    </div>
  )
}
