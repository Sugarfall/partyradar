'use client'

/**
 * Shared media viewer for Phase 3 feed posts.
 *
 * Handles everything you see between the post header and the action bar:
 *   - Single image / single video → just renders the media.
 *   - Multi-media (carousel) → swipeable slides with dot indicators, arrow
 *     nav (desktop), keyboard arrows, and snap scrolling. Only the current
 *     slot plays video to avoid six simultaneous <video> elements eating CPU.
 *   - Autoplay video on viewport enter, muted, loops. Pauses when scrolled
 *     out of view. A `1 view` counter fires once per in-view play (not per
 *     loop iteration) so our view analytics match Instagram semantics.
 *   - Tag overlays: venue/user chips pinned with optional bounding boxes.
 *     If a tag has `bboxX/Y/W/H` we render a small avatar/chip at that
 *     fractional position; otherwise it goes in a stack at the bottom-left.
 *
 * Consumers pass the shape returned by the Phase 2 `postInclude` on the
 * server. Legacy posts with only `imageUrl` still render (we synthesize a
 * one-item carousel from that field).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Volume2, VolumeX, MapPin, Heart, Video as VideoIcon } from 'lucide-react'

import { isVideoUrl } from '@/lib/cloudinary'
import { api } from '@/lib/api'

// ─── Types (subset of server response, liberal enough to accept legacy) ───

export interface MediaItem {
  id?: string
  url: string
  type?: 'IMAGE' | 'VIDEO' | null
  sortOrder?: number
  width?: number | null
  height?: number | null
  durationSec?: number | null
  thumbnailUrl?: string | null
}

export interface TaggedUserLite {
  id: string
  username: string
  displayName: string
  photoUrl?: string | null
}

export interface TaggedVenueLite {
  id: string
  name: string
  type?: string | null
  photoUrl?: string | null
}

export interface PostTagLite {
  id?: string
  mediaId?: string | null
  taggedUser?: TaggedUserLite | null
  taggedVenue?: TaggedVenueLite | null
  bboxX?: number | null
  bboxY?: number | null
  bboxW?: number | null
  bboxH?: number | null
}

export interface PostMediaViewerProps {
  postId: string
  media?: MediaItem[] | null
  /** Legacy: single image/video URL. Used when `media` is empty. */
  imageUrl?: string | null
  tags?: PostTagLite[] | null
  /**
   * Called on double-tap anywhere on the media. The parent decides whether
   * to toggle the like and animate the heart flash.
   */
  onDoubleTap?: () => void
  /** Max render height for each slide. Defaults to 480px. */
  maxHeight?: number
  /** Show the floating heart flash when the user double-taps. */
  showHeartFlash?: boolean
}

// ─── View-count firing: once per mount per video element ──────────────────
// The old DiscoverFeedTab emitted one view per session via a ref. We
// preserve that but per-media so a carousel with two videos counts two
// views when both are actually watched.
function useFireViewOnce(postId: string) {
  const fired = useRef<Set<string>>(new Set())
  return useCallback((mediaKey: string) => {
    if (fired.current.has(mediaKey)) return
    fired.current.add(mediaKey)
    api.post(`/posts/${postId}/view`, {}).catch(() => { /* silent */ })
  }, [postId])
}

// ─── Autoplay controller via IntersectionObserver ─────────────────────────
// Attaches to every <video> rendered inside the viewer. Plays when ≥50% in
// view (and this slide is the active one), pauses otherwise. Respects the
// page's reduced-motion preference.
function useVideoAutoplay(
  containerRef: React.RefObject<HTMLDivElement | null>,
  activeIndex: number,
  onFirstPlay: (mediaKey: string) => void,
) {
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const videos = Array.from(root.querySelectorAll<HTMLVideoElement>('video[data-slide]'))

    if (videos.length === 0) return

    // Pause every video initially — the observer will resume the one in view.
    for (const v of videos) v.pause()

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const v = entry.target as HTMLVideoElement
        const slideIdx = Number(v.dataset['slide'])
        const isActive = slideIdx === activeIndex
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && isActive && !prefersReduced) {
          // play() can reject on some browsers if muted wasn't set yet; we've
          // pre-set muted on the element so this should resolve. Swallow any
          // stragglers.
          v.play().then(() => onFirstPlay(v.dataset['mediaKey'] ?? String(slideIdx))).catch(() => {})
        } else {
          v.pause()
        }
      }
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] })

    for (const v of videos) io.observe(v)
    return () => io.disconnect()
  }, [containerRef, activeIndex, onFirstPlay])
}

// ─── Component ────────────────────────────────────────────────────────────

export default function PostMediaViewer({
  postId,
  media,
  imageUrl,
  tags,
  onDoubleTap,
  maxHeight = 480,
  showHeartFlash = true,
}: PostMediaViewerProps) {
  // Normalize into a single canonical list — callers shouldn't have to care
  // whether the post came from the new schema or the old one.
  const slides: MediaItem[] = (media && media.length > 0)
    ? media
    : imageUrl
      ? [{ url: imageUrl, type: isVideoUrl(imageUrl) ? 'VIDEO' : 'IMAGE' }]
      : []

  const [index, setIndex] = useState(0)
  const [muted, setMuted] = useState(true)
  const [heartOn, setHeartOn] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef(0)
  const fireView = useFireViewOnce(postId)

  useVideoAutoplay(containerRef, index, fireView)

  // Keep the scroll position in sync when `index` changes from dots/arrows.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const slide = el.children[index] as HTMLElement | undefined
    if (slide) slide.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }, [index])

  // Track which slide is in the viewport on touch-driven scroll.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || slides.length <= 1) return
    let raf = 0
    function onScroll() {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!el) return
        const width = el.clientWidth
        const next = Math.round(el.scrollLeft / width)
        setIndex((prev) => (prev === next ? prev : next))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [slides.length])

  // Double-tap → heart flash + parent callback (usually "like the post").
  function handleTap() {
    const now = Date.now()
    if (now - lastTapRef.current < 350) {
      if (onDoubleTap) {
        onDoubleTap()
        if (showHeartFlash) {
          setHeartOn(true)
          setTimeout(() => setHeartOn(false), 800)
        }
      }
    }
    lastTapRef.current = now
  }

  if (slides.length === 0) return null

  // Tags for "this slide only" (mediaId match) + "post-level" (no mediaId).
  const slideTags = (tags ?? []).filter((t) => {
    const slideId = slides[index]?.id
    // If tag is pinned to a specific mediaId, only show it on that slide.
    // If it has no mediaId it's a post-level tag (render on every slide).
    if (!t.mediaId) return true
    return slideId && t.mediaId === slideId
  })

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ background: '#000' }}
      onClick={handleTap}
    >
      {/* ── Horizontal scroll-snap carousel ───────────────────────────── */}
      <div
        ref={scrollerRef}
        className="flex overflow-x-auto snap-x snap-mandatory"
        style={{
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          maxHeight,
        }}
      >
        {slides.map((m, i) => {
          const isVideo = m.type === 'VIDEO' || (m.type == null && isVideoUrl(m.url))
          const mediaKey = m.id ?? `${postId}-${i}`
          return (
            <div
              key={mediaKey}
              className="shrink-0 w-full snap-start flex items-center justify-center"
              style={{ minWidth: '100%', maxHeight, background: '#000' }}
            >
              {isVideo ? (
                <video
                  src={m.url}
                  poster={m.thumbnailUrl ?? undefined}
                  data-slide={i}
                  data-media-key={mediaKey}
                  muted={muted}
                  loop
                  playsInline
                  preload="metadata"
                  className="w-full block"
                  style={{ maxHeight, objectFit: 'contain' }}
                  controls={false}
                />
              ) : (
                <img
                  src={m.url}
                  alt=""
                  className="w-full block"
                  style={{ maxHeight, objectFit: 'contain' }}
                  draggable={false}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Carousel dots ─────────────────────────────────────────────── */}
      {slides.length > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5 pointer-events-none">
          {slides.map((_, i) => (
            <span
              key={i}
              className="rounded-full transition-all duration-200"
              style={{
                width: i === index ? 7 : 5,
                height: i === index ? 7 : 5,
                background: i === index ? '#fff' : 'rgba(255,255,255,0.45)',
                boxShadow: i === index ? '0 0 6px rgba(255,255,255,0.5)' : 'none',
              }}
            />
          ))}
        </div>
      )}

      {/* ── Slide counter badge ───────────────────────────────────────── */}
      {slides.length > 1 && (
        <div
          className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-black flex items-center gap-1 pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
        >
          {index + 1}/{slides.length}
        </div>
      )}

      {/* ── Arrows (desktop only — hidden on touch) ───────────────────── */}
      {slides.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.max(0, i - 1)) }}
            disabled={index === 0}
            className="hidden md:flex absolute top-1/2 -translate-y-1/2 left-2 w-8 h-8 items-center justify-center rounded-full transition-opacity disabled:opacity-0"
            style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
            aria-label="Previous"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.min(slides.length - 1, i + 1)) }}
            disabled={index === slides.length - 1}
            className="hidden md:flex absolute top-1/2 -translate-y-1/2 right-2 w-8 h-8 items-center justify-center rounded-full transition-opacity disabled:opacity-0"
            style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
            aria-label="Next"
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      {/* ── Video controls overlay (mute toggle) ──────────────────────── */}
      {slides.some((m) => m.type === 'VIDEO' || (m.type == null && isVideoUrl(m.url))) && (
        <button
          onClick={(e) => { e.stopPropagation(); setMuted((m) => !m) }}
          className="absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
        </button>
      )}

      {/* ── Video badge (top-left, always for video slides) ───────────── */}
      {(slides[index]?.type === 'VIDEO' || (slides[index]?.type == null && slides[index] && isVideoUrl(slides[index]!.url))) && (
        <div
          className="absolute top-2 left-2 rounded-full px-1.5 py-0.5 text-[9px] font-black flex items-center gap-1 pointer-events-none"
          style={{ background: 'rgba(99,102,241,0.85)', color: '#fff' }}
        >
          <VideoIcon size={9} /> VIDEO
        </div>
      )}

      {/* ── Tag overlays ──────────────────────────────────────────────── */}
      {slideTags.length > 0 && (
        <>
          {/* Bounding-box pinned tags — placed at fractional position */}
          {slideTags
            .filter((t) => t.bboxX != null && t.bboxY != null)
            .map((t, i) => {
              const name = t.taggedUser?.username ?? t.taggedVenue?.name ?? ''
              const href = t.taggedUser
                ? `/profile/${t.taggedUser.username}`
                : t.taggedVenue
                  ? `/venues/${t.taggedVenue.id}`
                  : '#'
              return (
                <Link
                  key={t.id ?? `bbox-${i}`}
                  href={href}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute rounded-full px-2 py-0.5 text-[10px] font-black whitespace-nowrap"
                  style={{
                    left: `${(t.bboxX ?? 0) * 100}%`,
                    top: `${(t.bboxY ?? 0) * 100}%`,
                    background: 'rgba(0,0,0,0.7)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.3)',
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  {t.taggedUser ? `@${name}` : `📍 ${name}`}
                </Link>
              )
            })}

          {/* Untagged position → stacked chips at bottom-left */}
          {slideTags.some((t) => t.bboxX == null) && (
            <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 max-w-[calc(100%-80px)]">
              {slideTags
                .filter((t) => t.bboxX == null)
                .slice(0, 4)
                .map((t, i) => {
                  const href = t.taggedUser
                    ? `/profile/${t.taggedUser.username}`
                    : t.taggedVenue
                      ? `/venues/${t.taggedVenue.id}`
                      : '#'
                  return (
                    <Link
                      key={t.id ?? `chip-${i}`}
                      href={href}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{
                        background: 'rgba(0,0,0,0.6)',
                        color: '#fff',
                        border: t.taggedVenue ? '1px solid rgba(0,200,255,0.4)' : '1px solid rgba(236,72,153,0.4)',
                      }}
                    >
                      {t.taggedUser ? (
                        <>
                          {t.taggedUser.photoUrl ? (
                            <img src={t.taggedUser.photoUrl} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                          ) : (
                            <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-black"
                              style={{ background: 'rgba(236,72,153,0.5)' }}>
                              {t.taggedUser.displayName[0]?.toUpperCase()}
                            </span>
                          )}
                          @{t.taggedUser.username}
                        </>
                      ) : t.taggedVenue ? (
                        <>
                          <MapPin size={9} style={{ color: 'rgba(0,200,255,0.9)' }} />
                          {t.taggedVenue.name}
                        </>
                      ) : null}
                    </Link>
                  )
                })}
              {slideTags.filter((t) => t.bboxX == null).length > 4 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.7)' }}
                >
                  +{slideTags.filter((t) => t.bboxX == null).length - 4}
                </span>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Double-tap heart flash ────────────────────────────────────── */}
      {heartOn && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Heart
            size={88}
            fill="#ec4899"
            style={{
              color: '#ec4899',
              filter: 'drop-shadow(0 0 20px rgba(236,72,153,0.9))',
              animation: 'pr-heart-pop 0.7s ease-out',
            }}
          />
        </div>
      )}

      <style jsx>{`
        @keyframes pr-heart-pop {
          0%   { transform: scale(0.3); opacity: 0; }
          35%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
