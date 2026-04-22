'use client'

/**
 * Instagram-style full-screen story viewer.
 *
 * Takes one or more "groups" — a group is all active stories from a single
 * user. Auto-advances through stories inside a group (image = 5s, video =
 * video duration) and between groups. Supports tap-left/right to scrub,
 * long-press to pause, swipe-up to reply (as a comment on the story post),
 * and X to close.
 *
 * Viewed state is persisted in localStorage via `storyViewed`. When every
 * story in a group has been viewed, the ring outside the avatar on the feed
 * StoriesBar turns gray.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Heart, Send, Trash2 } from 'lucide-react'
import Link from 'next/link'

import { api } from '@/lib/api'
import { silent } from '@/lib/logError'
import { isVideoUrl } from '@/lib/cloudinary'
import { markStoriesViewed } from '@/lib/storyViewed'
import type { MediaItem } from './PostMediaViewer'

// ─── Types ────────────────────────────────────────────────────────────────

export interface StoryPost {
  id: string
  text?: string | null
  imageUrl?: string | null
  media?: MediaItem[] | null
  createdAt: string
  likesCount?: number
  hasLiked?: boolean
  user: {
    id?: string
    username?: string
    displayName: string
    photoUrl?: string | null
  }
}

export interface StoryGroup {
  user: StoryPost['user']
  stories: StoryPost[]
}

interface Props {
  groups: StoryGroup[]
  /** Index into `groups` to open first. */
  startGroupIndex: number
  /** Optional: story index within the starting group. Defaults to first
   *  unviewed story, or 0 if all viewed. */
  startStoryIndex?: number
  currentUserId?: string | null
  onClose: () => void
  /** Called when a story is deleted so the parent can refresh the bar. */
  onStoryDeleted?: (storyId: string) => void
}

// ─── Timing ───────────────────────────────────────────────────────────────

const IMAGE_DURATION_MS = 5_000
const PROGRESS_TICK_MS = 50 // how often we update the progress bar

// ─── Helpers ──────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const s = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + 'm'
  if (s < 86400) return Math.floor(s / 3600) + 'h'
  return Math.floor(s / 86400) + 'd'
}

function resolveStoryMedia(story: StoryPost): { url: string; type: 'IMAGE' | 'VIDEO' } | null {
  const first = story.media?.[0]
  if (first) return { url: first.url, type: (first.type ?? 'IMAGE') as 'IMAGE' | 'VIDEO' }
  if (story.imageUrl) {
    return { url: story.imageUrl, type: isVideoUrl(story.imageUrl) ? 'VIDEO' : 'IMAGE' }
  }
  return null
}

// ─── Component ────────────────────────────────────────────────────────────

export default function StoryViewer({
  groups,
  startGroupIndex,
  startStoryIndex,
  currentUserId,
  onClose,
  onStoryDeleted,
}: Props) {
  const [groupIdx, setGroupIdx] = useState(startGroupIndex)
  const [storyIdx, setStoryIdx] = useState(startStoryIndex ?? 0)
  const [progress, setProgress] = useState(0) // 0..1 within current story
  const [paused, setPaused] = useState(false)
  const [liked, setLiked] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [replySent, setReplySent] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTsRef = useRef<number>(Date.now())
  const elapsedBeforePauseRef = useRef<number>(0)

  const group = groups[groupIdx]
  const story = group?.stories[storyIdx]
  const media = story ? resolveStoryMedia(story) : null

  // ── Lock body scroll ─────────────────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // ── Advance logic ───────────────────────────────────────────────────────
  const advance = useCallback(() => {
    setGroupIdx((curG) => {
      setStoryIdx((curS) => {
        const g = groups[curG]
        if (!g) return 0
        if (curS + 1 < g.stories.length) {
          return curS + 1
        }
        return 0
      })
      // If we're already on the last story of the current group, move to next
      // group — or close if there are no more.
      const g = groups[curG]
      if (!g) return curG
      const isLastStory = storyIdx + 1 >= g.stories.length
      if (isLastStory) {
        if (curG + 1 < groups.length) return curG + 1
        // No more groups — defer close to a tick later so state updates
        // don't stomp on the close.
        setTimeout(onClose, 0)
        return curG
      }
      return curG
    })
  }, [groups, storyIdx, onClose])

  const goBack = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx((s) => s - 1)
    } else if (groupIdx > 0) {
      const prevGroup = groups[groupIdx - 1]
      if (prevGroup) {
        setGroupIdx(groupIdx - 1)
        setStoryIdx(prevGroup.stories.length - 1)
      }
    }
    // else: at the very first story — do nothing (don't close on back-tap).
  }, [groupIdx, storyIdx, groups])

  // ── Reset per-story state when the active story changes ────────────────
  useEffect(() => {
    setProgress(0)
    setLiked(story?.hasLiked ?? false)
    setReplyText('')
    setReplySent(false)
    setPaused(false)
    elapsedBeforePauseRef.current = 0
    startTsRef.current = Date.now()

    // Mark viewed immediately so the ring turns gray next time the bar renders.
    if (story?.id) markStoriesViewed([story.id])
  }, [groupIdx, storyIdx, story?.id, story?.hasLiked])

  // ── Progress timer (image stories only — videos use their own timeupdate) ─
  useEffect(() => {
    if (!story) return
    if (!media || media.type !== 'IMAGE') return

    if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    startTsRef.current = Date.now()

    progressTimerRef.current = setInterval(() => {
      if (paused) {
        // Freeze start timestamp so the progress bar holds still.
        startTsRef.current = Date.now() - elapsedBeforePauseRef.current
        return
      }
      const elapsed = Date.now() - startTsRef.current
      elapsedBeforePauseRef.current = elapsed
      const next = Math.min(1, elapsed / IMAGE_DURATION_MS)
      setProgress(next)
      if (next >= 1) {
        if (progressTimerRef.current) clearInterval(progressTimerRef.current)
        advance()
      }
    }, PROGRESS_TICK_MS)

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
  }, [storyIdx, groupIdx, paused, advance, media, story])

  // ── Video lifecycle — pause/play + own progress tracker ─────────────────
  useEffect(() => {
    if (!media || media.type !== 'VIDEO') return
    const el = videoRef.current
    if (!el) return
    if (paused) el.pause()
    else el.play().catch(() => { /* autoplay may be blocked; user can tap */ })
  }, [paused, media, storyIdx, groupIdx])

  // ── Keyboard nav ────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') advance()
      else if (e.key === 'ArrowLeft') goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, goBack, onClose])

  // ── Touch/swipe between groups ──────────────────────────────────────────
  const touchStartXRef = useRef<number | null>(null)
  const touchStartTimeRef = useRef<number>(0)

  function onTouchStart(e: React.TouchEvent) {
    touchStartXRef.current = e.touches[0]?.clientX ?? null
    touchStartTimeRef.current = Date.now()
    setPaused(true)
  }

  function onTouchEnd(e: React.TouchEvent) {
    setPaused(false)
    const startX = touchStartXRef.current
    touchStartXRef.current = null
    if (startX == null) return
    const endX = e.changedTouches[0]?.clientX
    if (endX == null) return
    const dx = endX - startX
    const dt = Date.now() - touchStartTimeRef.current
    // Horizontal fling → jump to neighbouring group. Short tap → tap zones.
    if (Math.abs(dx) > 60 && dt < 400) {
      if (dx < 0) {
        // swipe left = next group
        if (groupIdx + 1 < groups.length) {
          setGroupIdx(groupIdx + 1)
          setStoryIdx(0)
        } else {
          onClose()
        }
      } else {
        // swipe right = prev group
        if (groupIdx > 0) {
          const prev = groups[groupIdx - 1]
          if (prev) {
            setGroupIdx(groupIdx - 1)
            setStoryIdx(0)
          }
        }
      }
    }
  }

  // ── Tap zones ───────────────────────────────────────────────────────────
  function onTapZone(side: 'left' | 'right') {
    if (side === 'left') goBack()
    else advance()
  }

  // ── Actions ─────────────────────────────────────────────────────────────
  async function handleLike() {
    if (!story) return
    const was = liked
    setLiked(!was)
    try {
      await api.post(`/posts/${story.id}/like`, {})
    } catch {
      setLiked(was) // revert
    }
  }

  async function handleReply() {
    if (!story || !replyText.trim() || sendingReply) return
    setSendingReply(true)
    try {
      await api.post(`/posts/${story.id}/comments`, { text: replyText.trim() })
      setReplyText('')
      setReplySent(true)
      setTimeout(() => setReplySent(false), 1500)
    } catch {
      // swallow
    } finally {
      setSendingReply(false)
    }
  }

  async function handleDelete() {
    if (!story || deleting) return
    if (!confirm('Delete this story?')) return
    setDeleting(true)
    try {
      await api.delete(`/posts/${story.id}`)
      onStoryDeleted?.(story.id)
      // Move past the deleted story
      advance()
    } catch {
      setDeleting(false)
    }
  }

  if (!story || !group) return null

  const isOwner = !!(currentUserId && story.user.id === currentUserId)

  // Progress bar fill: completed stories = 1, current = `progress`, upcoming = 0.
  const bars = group.stories.map((_, i) => {
    if (i < storyIdx) return 1
    if (i === storyIdx) return progress
    return 0
  })

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: '#000' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Media ──────────────────────────────────────────────────────── */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#000' }}>
        {media?.type === 'VIDEO' ? (
          <video
            key={`${groupIdx}-${storyIdx}`}
            ref={videoRef}
            src={media.url}
            className="max-h-full max-w-full object-contain"
            autoPlay
            playsInline
            onTimeUpdate={(e) => {
              const v = e.currentTarget
              if (v.duration && Number.isFinite(v.duration)) {
                setProgress(Math.min(1, v.currentTime / v.duration))
              }
            }}
            onEnded={advance}
          />
        ) : media?.type === 'IMAGE' ? (
          <img
            src={media.url}
            alt=""
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        ) : (
          // Text-only story fallback — rare, but valid if someone posts a
          // caption without media.
          <div className="flex items-center justify-center px-8 text-center">
            <p className="text-white text-2xl font-black leading-snug" style={{ maxWidth: 600 }}>
              {story.text}
            </p>
          </div>
        )}
      </div>

      {/* Dim overlay for readability of controls */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      {/* ── Tap zones (under the controls) ──────────────────────────────── */}
      <button
        aria-label="Previous"
        onClick={() => onTapZone('left')}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onMouseLeave={() => setPaused(false)}
        className="absolute top-0 bottom-0 left-0 w-1/3"
        style={{ background: 'transparent' }}
      />
      <button
        aria-label="Next"
        onClick={() => onTapZone('right')}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onMouseLeave={() => setPaused(false)}
        className="absolute top-0 bottom-0 right-0 w-1/3"
        style={{ background: 'transparent' }}
      />

      {/* ── Header: progress bars + author + close ─────────────────────── */}
      <div className="absolute top-0 inset-x-0 px-3 pt-3 pb-2 pointer-events-none">
        {/* Progress bars */}
        <div className="flex items-center gap-1 mb-3 pointer-events-none">
          {bars.map((v, i) => (
            <div
              key={i}
              className="flex-1 h-0.5 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.25)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round(v * 100)}%`,
                  background: '#fff',
                  transition: i === storyIdx ? 'width 50ms linear' : 'none',
                }}
              />
            </div>
          ))}
        </div>

        {/* Author row */}
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <Link
            href={story.user.username ? `/profile/${story.user.username}` : '#'}
            onClick={(e) => { if (!story.user.username) e.preventDefault() }}
            className="flex items-center gap-2.5"
          >
            {story.user.photoUrl ? (
              <img
                src={story.user.photoUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover"
                style={{ border: '1.5px solid rgba(255,255,255,0.6)' }}
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.6)' }}
              >
                {story.user.displayName[0]?.toUpperCase()}
              </div>
            )}
            <div className="leading-tight">
              <p className="text-sm font-black text-white">{story.user.displayName}</p>
              <p className="text-[10px] text-white/60">{timeAgo(story.createdAt)}</p>
            </div>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            {isOwner && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                aria-label="Delete story"
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.35)', color: 'rgba(255,255,255,0.9)' }}
              >
                <Trash2 size={15} />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close stories"
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.35)', color: '#fff' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Caption (if any) ────────────────────────────────────────────── */}
      {story.text && media && (
        <div
          className="absolute left-0 right-0 pointer-events-none flex justify-center px-6"
          style={{ bottom: 90 }}
        >
          <p
            className="text-white text-sm leading-snug text-center"
            style={{
              maxWidth: 520,
              background: 'rgba(0,0,0,0.35)',
              padding: '8px 14px',
              borderRadius: 12,
              backdropFilter: 'blur(6px)',
            }}
          >
            {story.text}
          </p>
        </div>
      )}

      {/* ── Footer: reply input + like ──────────────────────────────────── */}
      <div className="absolute left-0 right-0 bottom-0 px-3 pb-5 pt-3 pointer-events-auto flex items-center gap-2">
        {!isOwner ? (
          <>
            <div
              className="flex-1 flex items-center gap-2 rounded-full px-4 py-2.5"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.25)',
                backdropFilter: 'blur(6px)',
              }}
            >
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleReply() }}
                placeholder={replySent ? 'Sent ✓' : `Reply to ${story.user.displayName.split(' ')[0]}…`}
                className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/50"
                disabled={sendingReply}
              />
              {replyText.trim().length > 0 && (
                <button
                  onClick={handleReply}
                  disabled={sendingReply}
                  aria-label="Send reply"
                  className="shrink-0"
                  style={{ color: '#fff' }}
                >
                  {sendingReply
                    ? <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                    : <Send size={16} />
                  }
                </button>
              )}
            </div>
            <button
              onClick={handleLike}
              aria-label={liked ? 'Unlike story' : 'Like story'}
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.25)',
                color: liked ? '#ec4899' : '#fff',
                backdropFilter: 'blur(6px)',
              }}
            >
              <Heart size={18} fill={liked ? '#ec4899' : 'none'} />
            </button>
          </>
        ) : (
          <p className="flex-1 text-center text-xs text-white/60 font-semibold">
            This is your story · Stories disappear after 24h
          </p>
        )}
      </div>
    </div>
  )
}
