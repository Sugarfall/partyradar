'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  Calendar, Heart, MessageCircle, Send, X, Trash2, Share2, BarChart2,
} from 'lucide-react'

import { api } from '@/lib/api'
import { silent } from '@/lib/logError'
import PostMediaViewer, { type MediaItem, type PostTagLite } from './PostMediaViewer'
import ShareSheet from './ShareSheet'
import MentionAutocomplete from './MentionAutocomplete'

// ─── Types ────────────────────────────────────────────────────────────────
// Flexible post shape accepted by the modal. Both the main feed page and
// the DiscoverFeedTab map their local items onto this shape.
export interface PostDetailPost {
  id: string
  text?: string | null
  imageUrl?: string | null
  media?: MediaItem[] | null
  tags?: PostTagLite[] | null
  likesCount?: number
  sharesCount?: number
  hasLiked?: boolean
  createdAt: string
  user: {
    id?: string
    username?: string
    displayName: string
    photoUrl?: string | null
  }
  event?: { name: string } | null
}

interface PostCommentUser {
  id: string
  username: string
  displayName: string
  photoUrl?: string | null
}
interface PostCommentData {
  id: string
  text: string
  createdAt: string
  user: PostCommentUser
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function timeAgo(dateStr: string) {
  const s = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}

function renderMentions(text: string): React.ReactNode {
  const parts = text.split(/(@[\w.]+)/g)
  return parts.map((part, i) =>
    /^@\w/.test(part)
      ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 700 }}>{part}</span>
      : <span key={i}>{part}</span>
  )
}

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

// ─── Post Detail Modal (Instagram-style) ──────────────────────────────────
export default function PostDetailModal({
  post,
  onClose,
  onLikeToggle,
  onCommentAdded,
  onDelete,
  currentUserId,
}: {
  post: PostDetailPost
  onClose: () => void
  onLikeToggle?: (liked: boolean, newCount: number) => void
  onCommentAdded?: () => void
  onDelete?: () => void
  currentUserId?: string | null
}) {
  const [comments, setComments] = useState<PostCommentData[]>([])
  const [loadingComments, setLoadingComments] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [caretPos, setCaretPos] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [liked, setLiked] = useState(post.hasLiked ?? false)
  const [likesCount, setLikesCount] = useState(post.likesCount ?? 0)
  const [deleting, setDeleting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [localShares, setLocalShares] = useState(post.sharesCount ?? 0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  const isOwner = !!(currentUserId && post.user.id && currentUserId === post.user.id)

  async function handleDelete() {
    if (!isOwner || deleting) return
    setDeleting(true)
    try {
      await api.delete(`/posts/${post.id}`)
      onDelete?.()
      onClose()
    } catch {
      setDeleting(false)
    }
  }

  useEffect(() => {
    api.get<{ data: PostCommentData[] }>(`/posts/${post.id}/comments?limit=50`)
      .then((res) => setComments(res?.data ?? []))
      .catch(silent('feed:load-comments'))
      .finally(() => setLoadingComments(false))
  }, [post.id])

  // Lock body scroll while modal open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  async function handleLike() {
    try {
      const res = await api.post<{ data: { liked: boolean } }>(`/posts/${post.id}/like`, {})
      const nowLiked = res?.data?.liked ?? !liked
      const newCount = nowLiked ? likesCount + 1 : Math.max(0, likesCount - 1)
      setLiked(nowLiked)
      setLikesCount(newCount)
      onLikeToggle?.(nowLiked, newCount)
    } catch {
      // optimistic fallback
      const nowLiked = !liked
      const newCount = nowLiked ? likesCount + 1 : Math.max(0, likesCount - 1)
      setLiked(nowLiked)
      setLikesCount(newCount)
      onLikeToggle?.(nowLiked, newCount)
    }
  }

  async function handleSubmit() {
    const text = commentText.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      const res = await api.post<{ data: PostCommentData }>(`/posts/${post.id}/comments`, { text })
      if (res?.data) {
        setComments((prev) => [...prev, res.data])
        setCommentText('')
        onCommentAdded?.()
        setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
      }
    } catch {
      // swallow — moderation or auth error
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)' }}
      onClick={handleBackdropClick}
    >
      <div
        className="w-full sm:max-w-lg flex flex-col sm:rounded-2xl overflow-hidden"
        style={{
          background: '#080812',
          border: '1px solid rgba(var(--accent-rgb),0.14)',
          height: '92vh',
          maxHeight: 780,
          boxShadow: '0 0 60px rgba(var(--accent-rgb),0.08)',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-3 px-3 py-2.5 shrink-0"
          style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.08)' }}
        >
          <Avatar user={post.user} size={34} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black leading-tight" style={{ color: '#e0f2fe' }}>
              {post.user.displayName}
            </p>
            {post.event && (
              <p className="text-[10px] flex items-center gap-1 mt-0.5" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
                <Calendar size={9} /> {post.event.name}
              </p>
            )}
          </div>
          <span className="text-[10px] font-bold" style={{ color: 'rgba(74,96,128,0.5)' }}>
            {timeAgo(post.createdAt)}
          </span>
          {isOwner && (
            <Link
              href={`/feed/${post.id}/insights`}
              title="View insights"
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150"
              style={{ color: 'var(--accent)', background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}
            >
              <BarChart2 size={13} />
            </Link>
          )}
          {isOwner && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Delete post"
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150"
              style={{ color: deleting ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.6)', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              {deleting ? <div className="w-3 h-3 rounded-full border animate-spin" style={{ borderColor: 'rgba(239,68,68,0.2)', borderTopColor: 'rgba(239,68,68,0.6)' }} /> : <Trash2 size={13} />}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150"
            style={{ color: 'rgba(74,96,128,0.6)', background: 'rgba(var(--accent-rgb),0.05)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Post media (carousel + tag overlays + double-tap like) ── */}
        {(post.imageUrl || (post.media && post.media.length > 0)) && (
          <div className="shrink-0" style={{ maxHeight: '40vh', overflow: 'hidden' }}>
            <PostMediaViewer
              postId={post.id}
              media={post.media}
              imageUrl={post.imageUrl}
              tags={post.tags}
              onDoubleTap={handleLike}
              maxHeight={360}
            />
          </div>
        )}

        {/* ── Post text ───────────────────────────────────────────── */}
        {post.text && (
          <p
            className="px-4 py-3 text-sm leading-relaxed shrink-0"
            style={{ color: 'rgba(224,242,254,0.85)', borderBottom: '1px solid rgba(var(--accent-rgb),0.06)' }}
          >
            {renderMentions(post.text)}
          </p>
        )}

        {/* ── Like / comment counts ────────────────────────────────── */}
        <div
          className="flex items-center gap-4 px-4 py-2.5 shrink-0"
          style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.06)' }}
        >
          <button
            onClick={handleLike}
            className="flex items-center gap-1.5 transition-all duration-200"
            style={{ color: liked ? '#ec4899' : 'rgba(74,96,128,0.6)' }}
          >
            <Heart
              size={18}
              fill={liked ? '#ec4899' : 'none'}
              style={{ filter: liked ? 'drop-shadow(0 0 6px rgba(236,72,153,0.7))' : 'none', transition: 'filter 0.2s' }}
            />
            <span className="text-xs font-bold">{likesCount > 0 ? likesCount : ''}</span>
          </button>
          <div className="flex items-center gap-1.5" style={{ color: 'rgba(74,96,128,0.5)' }}>
            <MessageCircle size={16} />
            <span className="text-xs font-bold">{comments.length > 0 ? comments.length : ''}</span>
          </div>
          <button
            onClick={() => setSharing(true)}
            className="flex items-center gap-1.5 transition-all duration-200 active:scale-110 ml-auto"
            style={{ color: 'rgba(74,96,128,0.6)' }}
            title="Share"
          >
            <Share2 size={16} />
            {localShares > 0 && (
              <span className="text-xs font-bold">{localShares}</span>
            )}
          </button>
        </div>

        {/* ── Comments list ───────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
          style={{ overscrollBehavior: 'contain' }}
        >
          {loadingComments ? (
            <div className="flex justify-center py-8">
              <div
                className="w-5 h-5 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }}
              />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-xs py-8 font-bold tracking-widest"
              style={{ color: 'rgba(74,96,128,0.45)' }}>
              NO COMMENTS YET
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-2.5">
                <Avatar
                  user={{ displayName: c.user.displayName, photoUrl: c.user.photoUrl }}
                  size={28}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[11px] font-black" style={{ color: 'var(--accent)' }}>
                      {c.user.displayName}
                    </span>
                    <span className="text-[9px]" style={{ color: 'rgba(74,96,128,0.45)' }}>
                      {timeAgo(c.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed mt-0.5" style={{ color: 'rgba(224,242,254,0.75)' }}>
                    {renderMentions(c.text)}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={commentsEndRef} />
        </div>

        {/* ── Comment input ───────────────────────────────────────── */}
        <div
          className="px-3 py-3 shrink-0 flex gap-2.5 items-end relative"
          style={{ borderTop: '1px solid rgba(var(--accent-rgb),0.08)', background: 'rgba(4,4,13,0.85)' }}
        >
          <MentionAutocomplete
            value={commentText}
            caretPos={caretPos}
            anchorRef={textareaRef}
            onChange={(next) => {
              setCommentText(next)
            }}
            onPicked={(nextCaret) => {
              setCaretPos(nextCaret)
              requestAnimationFrame(() => {
                textareaRef.current?.focus()
                textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
              })
            }}
          />
          <textarea
            ref={textareaRef}
            value={commentText}
            onChange={(e) => {
              setCommentText(e.target.value)
              setCaretPos(e.target.selectionStart ?? e.target.value.length)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'
            }}
            onKeyUp={(e) => setCaretPos((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
            onClick={(e) => setCaretPos((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment… @mention someone"
            rows={1}
            className="flex-1 resize-none text-sm rounded-xl px-3 py-2.5 outline-none"
            style={{
              background: 'rgba(var(--accent-rgb),0.05)',
              border: '1px solid rgba(var(--accent-rgb),0.15)',
              color: '#e0f2fe',
              lineHeight: '1.4',
              minHeight: 40,
              maxHeight: 80,
              caretColor: 'var(--accent)',
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!commentText.trim() || submitting}
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200"
            style={{
              background: commentText.trim() ? 'rgba(var(--accent-rgb),0.15)' : 'rgba(var(--accent-rgb),0.04)',
              border: '1px solid rgba(var(--accent-rgb),0.2)',
              color: commentText.trim() ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.25)',
            }}
          >
            {submitting
              ? <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
              : <Send size={15} />
            }
          </button>
        </div>
      </div>

      {/* Share sheet (native / copy / repost) — stacks above modal */}
      {sharing && (
        <ShareSheet
          post={{
            id: post.id,
            text: post.text ?? null,
            imageUrl: post.imageUrl ?? null,
            user: {
              displayName: post.user.displayName,
              username: post.user.username ?? (post.user.displayName || 'user'),
              photoUrl: post.user.photoUrl ?? null,
            },
            media: (post.media ?? []).map((m, idx) => ({
              id: m.id ?? `${post.id}-${idx}`,
              url: m.url,
              type: (m.type ?? 'IMAGE') as 'IMAGE' | 'VIDEO',
            })),
          }}
          onClose={() => setSharing(false)}
          onShared={() => setLocalShares((c) => c + 1)}
        />
      )}
    </div>
  )
}
