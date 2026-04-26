'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Heart, MessageCircle, ChevronLeft, ChevronRight,
  Send, Loader2, MapPin, Calendar,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

// ── Types ────────────────────────────────────────────────────────────────────

interface PostUser {
  id: string
  username: string
  displayName: string
  photoUrl?: string | null
}

interface PostMedia {
  id: string
  url: string
  type: 'IMAGE' | 'VIDEO'
  sortOrder: number
}

interface PostEvent {
  id: string
  name: string
}

interface PostVenue {
  id: string
  name: string
}

interface Comment {
  id: string
  text: string
  createdAt: string
  user: PostUser
}

interface FullPost {
  id: string
  text?: string | null
  imageUrl?: string | null
  media: PostMedia[]
  user: PostUser
  event?: PostEvent | null
  venue?: PostVenue | null
  createdAt: string
  hasLiked: boolean
  _count: { likes: number; comments: number }
  // also on root
  likesCount?: number
  commentsCount?: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function getMedia(post: FullPost): { url: string; isVideo: boolean }[] {
  if (post.media?.length) {
    return post.media.map(m => ({ url: m.url, isVideo: m.type === 'VIDEO' }))
  }
  if (post.imageUrl) {
    return [{ url: post.imageUrl, isVideo: post.imageUrl.includes('/video/upload/') }]
  }
  return []
}

// ── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ user, size = 32 }: { user: PostUser; size?: number }) {
  return user.photoUrl ? (
    <img
      src={user.photoUrl}
      alt={user.displayName}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
    />
  ) : (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg,rgba(var(--accent-rgb),0.4),rgba(var(--accent-rgb),0.15))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.4),
        color: 'rgba(var(--accent-rgb),0.9)', fontWeight: 700,
      }}
    >
      {user.displayName?.charAt(0).toUpperCase() || '?'}
    </div>
  )
}

// ── Main Modal ───────────────────────────────────────────────────────────────

interface Props {
  postId: string
  onClose: () => void
}

export default function PostDetailModal({ postId, onClose }: Props) {
  const { dbUser } = useAuth()

  const [post, setPost] = useState<FullPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [liked, setLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [commentsCount, setCommentsCount] = useState(0)

  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsFetched, setCommentsFetched] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [sending, setSending] = useState(false)

  const [mediaIdx, setMediaIdx] = useState(0)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  const commentsEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Fetch post ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    api.get<{ data: FullPost }>(`/posts/${postId}`)
      .then(r => {
        if (!r?.data) return
        const p = r.data
        setPost(p)
        setLiked(p.hasLiked ?? false)
        setLikesCount(p._count?.likes ?? p.likesCount ?? 0)
        setCommentsCount(p._count?.comments ?? p.commentsCount ?? 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [postId])

  // ── Fetch comments (lazy — on first scroll into comments) ──────────────────
  const fetchComments = useCallback(() => {
    if (commentsFetched) return
    setCommentsLoading(true)
    api.get<{ data: Comment[] }>(`/posts/${postId}/comments?limit=50`)
      .then(r => { if (r?.data) setComments(r.data) })
      .catch(() => {})
      .finally(() => { setCommentsLoading(false); setCommentsFetched(true) })
  }, [postId, commentsFetched])

  useEffect(() => {
    if (post && !commentsFetched) fetchComments()
  }, [post, commentsFetched, fetchComments])

  // ── Like toggle ────────────────────────────────────────────────────────────
  const toggleLike = useCallback(async () => {
    if (!dbUser) return
    const wasLiked = liked
    setLiked(!wasLiked)
    setLikesCount(c => Math.max(0, c + (wasLiked ? -1 : 1)))
    try {
      const res = await api.post<{ data: { liked: boolean } }>(`/posts/${postId}/like`, {})
      if (res?.data != null) setLiked(res.data.liked)
    } catch {
      setLiked(wasLiked)
      setLikesCount(c => Math.max(0, c + (wasLiked ? 1 : -1)))
    }
  }, [dbUser, liked, postId])

  // ── Add comment ────────────────────────────────────────────────────────────
  const submitComment = useCallback(async () => {
    if (!commentText.trim() || !dbUser || sending) return
    setSending(true)
    const text = commentText.trim()
    setCommentText('')
    try {
      const res = await api.post<{ data: Comment }>(`/posts/${postId}/comments`, { text })
      if (res?.data) {
        setComments(prev => [...prev, res.data])
        setCommentsCount(c => c + 1)
        setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
      }
    } catch {
      setCommentText(text) // restore on failure
    } finally {
      setSending(false)
    }
  }, [commentText, dbUser, postId, sending])

  // ── Carousel swipe ─────────────────────────────────────────────────────────
  const media = post ? getMedia(post) : []

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0]?.clientX ?? null)
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX
    if (Math.abs(dx) > 40) {
      if (dx < 0) setMediaIdx(i => Math.min(i + 1, media.length - 1))
      else setMediaIdx(i => Math.max(i - 1, 0))
    }
    setTouchStartX(null)
  }

  // ── Close on Escape ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Render ─────────────────────────────────────────────────────────────────
  const currentMedia = media[mediaIdx]
  const caption = post?.text ?? null

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: '#04040d' }}
    >
      {/* ── Header bar ── */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{
          background: 'rgba(7,7,26,0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {post ? (
          <div className="flex items-center gap-2.5">
            <Avatar user={post.user} size={34} />
            <div>
              <p className="text-[13px] font-bold" style={{ color: 'rgba(224,242,254,0.95)' }}>
                {post.user.displayName}
              </p>
              <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.35)' }}>
                @{post.user.username} · {timeAgo(post.createdAt)}
              </p>
            </div>
          </div>
        ) : (
          <div />
        )}
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <X size={16} style={{ color: 'rgba(224,242,254,0.7)' }} />
        </button>
      </div>

      {/* ── Loading state ── */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin" style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
        </div>
      )}

      {/* ── Content ── */}
      {!loading && post && (
        <div className="flex-1 overflow-y-auto">

          {/* Media area */}
          {media.length > 0 && (
            <div
              className="relative w-full bg-black"
              style={{ maxHeight: '55vh', minHeight: '200px' }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {currentMedia && (
                currentMedia.isVideo ? (
                  <video
                    key={currentMedia.url}
                    src={currentMedia.url}
                    className="w-full object-contain"
                    style={{ maxHeight: '55vh' }}
                    controls
                    playsInline
                    autoPlay
                    muted
                  />
                ) : (
                  <img
                    key={currentMedia.url}
                    src={currentMedia.url}
                    alt=""
                    className="w-full object-contain"
                    style={{ maxHeight: '55vh' }}
                  />
                )
              )}

              {/* Carousel arrows */}
              {media.length > 1 && (
                <>
                  {mediaIdx > 0 && (
                    <button
                      onClick={() => setMediaIdx(i => i - 1)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.55)' }}
                    >
                      <ChevronLeft size={16} style={{ color: '#fff' }} />
                    </button>
                  )}
                  {mediaIdx < media.length - 1 && (
                    <button
                      onClick={() => setMediaIdx(i => i + 1)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.55)' }}
                    >
                      <ChevronRight size={16} style={{ color: '#fff' }} />
                    </button>
                  )}
                  {/* Dots */}
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                    {media.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setMediaIdx(i)}
                        style={{
                          width: i === mediaIdx ? 16 : 5, height: 5, borderRadius: 3,
                          background: i === mediaIdx ? 'rgba(var(--accent-rgb),0.9)' : 'rgba(255,255,255,0.4)',
                          transition: 'width 0.2s',
                          padding: 0,
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Actions row ── */}
          <div
            className="flex items-center gap-5 px-4 pt-3 pb-2"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            <button
              onClick={toggleLike}
              className="flex items-center gap-1.5"
              disabled={!dbUser}
              style={{ opacity: dbUser ? 1 : 0.4 }}
            >
              <Heart
                size={22}
                fill={liked ? '#ff006e' : 'none'}
                style={{ color: liked ? '#ff006e' : 'rgba(224,242,254,0.5)', transition: 'all 0.15s' }}
              />
              <span className="text-[13px] font-bold" style={{ color: 'rgba(224,242,254,0.7)' }}>
                {likesCount > 0 ? likesCount : ''}
              </span>
            </button>
            <button
              onClick={() => inputRef.current?.focus()}
              className="flex items-center gap-1.5"
            >
              <MessageCircle size={22} style={{ color: 'rgba(224,242,254,0.5)' }} />
              <span className="text-[13px] font-bold" style={{ color: 'rgba(224,242,254,0.7)' }}>
                {commentsCount > 0 ? commentsCount : ''}
              </span>
            </button>

            {/* Event / venue tag */}
            {post.event && (
              <div className="ml-auto flex items-center gap-1">
                <Calendar size={10} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
                <span className="text-[10px] font-bold tracking-wide" style={{ color: 'rgba(var(--accent-rgb),0.7)' }}>
                  {post.event.name}
                </span>
              </div>
            )}
            {!post.event && post.venue && (
              <div className="ml-auto flex items-center gap-1">
                <MapPin size={10} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
                <span className="text-[10px] font-bold tracking-wide" style={{ color: 'rgba(var(--accent-rgb),0.7)' }}>
                  {post.venue.name}
                </span>
              </div>
            )}
          </div>

          {/* ── Caption ── */}
          {caption && (
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(224,242,254,0.85)' }}>
                <span className="font-bold mr-1.5" style={{ color: 'rgba(224,242,254,0.95)' }}>
                  {post.user.displayName}
                </span>
                {caption}
              </p>
            </div>
          )}

          {/* ── Comments ── */}
          <div className="px-4 pb-4">
            {commentsLoading && (
              <div className="flex justify-center py-4">
                <Loader2 size={16} className="animate-spin" style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
              </div>
            )}
            {comments.length === 0 && !commentsLoading && commentsFetched && (
              <p className="text-center text-[11px] py-4" style={{ color: 'rgba(224,242,254,0.2)' }}>
                No comments yet
              </p>
            )}
            {comments.map(c => (
              <div key={c.id} className="flex gap-2.5 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <Avatar user={c.user} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-[12px] font-bold" style={{ color: 'rgba(224,242,254,0.9)' }}>
                      {c.user.displayName}
                    </span>
                    <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.25)' }}>
                      {timeAgo(c.createdAt)}
                    </span>
                  </div>
                  <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: 'rgba(224,242,254,0.75)' }}>
                    {c.text}
                  </p>
                </div>
              </div>
            ))}
            <div ref={commentsEndRef} />
          </div>
        </div>
      )}

      {/* ── Comment input (sticky bottom) ── */}
      {!loading && post && dbUser && (
        <div
          className="shrink-0 flex items-center gap-3 px-4 py-3"
          style={{
            background: 'rgba(7,7,26,0.98)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <Avatar user={{ id: dbUser.id, username: dbUser.username ?? '', displayName: dbUser.displayName ?? '', photoUrl: dbUser.photoUrl }} size={30} />
          <input
            ref={inputRef}
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
            placeholder="Add a comment…"
            className="flex-1 text-[13px] bg-transparent outline-none"
            style={{ color: 'rgba(224,242,254,0.85)' }}
          />
          <button
            onClick={submitComment}
            disabled={!commentText.trim() || sending}
            style={{
              opacity: commentText.trim() && !sending ? 1 : 0.3,
              transition: 'opacity 0.15s',
              color: 'rgba(var(--accent-rgb),0.9)',
            }}
          >
            {sending
              ? <Loader2 size={18} className="animate-spin" />
              : <Send size={18} />
            }
          </button>
        </div>
      )}
    </div>
  )
}
