'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Heart, Flag, Camera, X, ImagePlus, MapPin, Calendar, Zap, Clock, Video } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { uploadImage, uploadVideo, isVideoUrl } from '@/lib/cloudinary'

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

interface FeedPost {
  id: string
  imageUrl?: string | null
  text?: string | null
  isStory: boolean
  likesCount: number
  viewCount?: number
}

interface FeedCheckin {
  id: string
  crowdLevel?: string | null
}

interface FeedItem {
  type: 'POST' | 'CHECKIN' | 'RSVP'
  user: FeedUser
  event?: FeedEvent | null
  venue?: FeedVenue | null
  post?: FeedPost | null
  checkin?: FeedCheckin | null
  createdAt: string
}

interface Story {
  id: string
  userId: string
  imageUrl?: string | null
  text?: string | null
  expiresAt: string
  createdAt: string
  user: FeedUser
  event?: FeedEvent | null
  venue?: FeedVenue | null
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

// ─── Story Ring ───────────────────────────────────────────────────────────────

function StoryRing({ story, onClick }: { story: Story; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 shrink-0">
      <div
        className="rounded-full p-0.5"
        style={{ background: 'linear-gradient(135deg, #ec4899, #f97316, #fbbf24)' }}
      >
        <div className="rounded-full p-0.5" style={{ background: '#07071a' }}>
          <Avatar user={story.user} size={44} />
        </div>
      </div>
      <span className="text-[9px] font-bold text-white/50 max-w-[48px] truncate text-center">
        {story.user.displayName.split(' ')[0]}
      </span>
    </button>
  )
}

// ─── Story Viewer ─────────────────────────────────────────────────────────────

function StoryViewer({ story, onClose }: { story: Story; onClose: () => void }) {
  const [progress, setProgress] = useState(0)
  const isVideo = story.imageUrl ? isVideoUrl(story.imageUrl) : false

  useEffect(() => {
    if (isVideo) return // videos auto-advance via onEnded
    const start = Date.now()
    const duration = 5000
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1)
      setProgress(p)
      if (p < 1) requestAnimationFrame(tick)
      else onClose()
    }
    const raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [onClose, isVideo])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: '#000' }}
      onClick={onClose}
    >
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 z-10 px-3 pt-3">
        <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.2)' }}>
          <div className="h-full rounded-full" style={{ background: '#fff', width: `${progress * 100}%`, transition: 'none' }} />
        </div>
      </div>

      {/* Header */}
      <div className="absolute top-6 left-0 right-0 z-10 flex items-center gap-2 px-4 pt-2">
        <Avatar user={story.user} size={32} />
        <div>
          <p className="text-xs font-bold text-white">{story.user.displayName}</p>
          <p className="text-[10px] text-white/50">{timeAgo(story.createdAt)}</p>
        </div>
        <button onClick={onClose} className="ml-auto">
          <X size={20} style={{ color: 'rgba(255,255,255,0.7)' }} />
        </button>
      </div>

      {/* Content */}
      {story.imageUrl && isVideo ? (
        <video
          src={story.imageUrl}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
          muted={false}
          onEnded={onClose}
          onClick={e => e.stopPropagation()}
        />
      ) : story.imageUrl ? (
        <img src={story.imageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="flex-1 flex items-center justify-center px-8">
          <p className="text-white text-xl font-bold text-center leading-relaxed">{story.text}</p>
        </div>
      )}
      {story.text && story.imageUrl && (
        <div className="absolute bottom-16 left-0 right-0 px-6">
          <p className="text-white text-lg font-bold text-center leading-relaxed"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>
            {story.text}
          </p>
        </div>
      )}

      {/* Event/Venue tag */}
      {(story.event || story.venue) && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <MapPin size={10} style={{ color: 'rgba(255,255,255,0.6)' }} />
            <span className="text-[11px] font-semibold text-white/80">
              {story.event?.name ?? story.venue?.name}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({
  item, liked, onLike, reported, onReport,
}: {
  item: FeedItem
  liked: boolean
  onLike: () => void
  reported: boolean
  onReport: () => void
}) {
  const post = item.post!
  const [imgLoaded, setImgLoaded] = useState(false)
  const [showHeart, setShowHeart] = useState(false)
  const [localViews, setLocalViews] = useState(post.viewCount ?? 0)
  const lastTapRef = useRef(0)
  const viewedRef = useRef(false)
  const isVideo = post.imageUrl ? isVideoUrl(post.imageUrl) : false

  function handleVideoPlay() {
    if (viewedRef.current) return
    viewedRef.current = true
    setLocalViews(v => v + 1)
    api.post(`/posts/${post.id}/view`, {}).catch(() => {})
  }

  function handleMediaTap() {
    const now = Date.now()
    if (now - lastTapRef.current < 350) {
      // double tap → like
      if (!liked) onLike()
      setShowHeart(true)
      setTimeout(() => setShowHeart(false), 800)
    }
    lastTapRef.current = now
  }

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
            {isVideo && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}>
                <Video size={8} />VIDEO
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

      {/* Media — image or video, double-tap to like */}
      {post.imageUrl && (
        <div className="relative cursor-pointer" onClick={handleMediaTap}
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          {isVideo ? (
            <video
              src={post.imageUrl}
              controls
              playsInline
              className="w-full block"
              style={{ maxHeight: 480, background: '#000' }}
              onPlay={handleVideoPlay}
            />
          ) : (
            <img
              src={post.imageUrl} alt=""
              className="w-full object-cover block transition-opacity duration-300"
              style={{ maxHeight: 480, opacity: imgLoaded ? 1 : 0 }}
              onLoad={() => setImgLoaded(true)}
            />
          )}

          {/* Double-tap heart flash */}
          {showHeart && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Heart
                size={80}
                fill="#ec4899"
                style={{
                  color: '#ec4899',
                  filter: 'drop-shadow(0 0 20px rgba(236,72,153,0.9))',
                  transform: 'scale(1.1)',
                  transition: 'opacity 0.3s',
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* View count — videos only, Instagram-style */}
      {isVideo && localViews > 0 && (
        <p className="px-4 pt-2 pb-0 text-xs font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {formatViews(localViews)} views
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
        <div className="ml-auto">
          <button
            onClick={onReport}
            disabled={reported}
            style={{ color: reported ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.15)' }}
            title="Report post"
          >
            <Flag size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Check-in Card ────────────────────────────────────────────────────────────

function CheckinCard({ item }: { item: FeedItem }) {
  const checkin = item.checkin
  const crowd = checkin?.crowdLevel ? CROWD[checkin.crowdLevel] : null

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

// ─── Compose Modal ────────────────────────────────────────────────────────────

function ComposeModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const [text, setText] = useState('')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isStory, setIsStory] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function pickMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const isVid = file.type.startsWith('video/')
    setMediaFile(file)
    setMediaType(isVid ? 'video' : 'image')
    setPreview(URL.createObjectURL(file))
  }

  function clearMedia() {
    setMediaFile(null)
    setMediaType(null)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function submit() {
    if (!text.trim() && !mediaFile) { setError('Add a photo, video or write something'); return }
    setUploading(true)
    setError('')
    try {
      let imageUrl: string | undefined
      if (mediaFile) {
        imageUrl = mediaType === 'video'
          ? await uploadVideo(mediaFile, 'sightings')
          : await uploadImage(mediaFile, 'sightings')
      }
      await api.post('/posts', { text: text.trim() || undefined, imageUrl, isStory })
      onPosted()
      onClose()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to post')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl overflow-hidden"
        style={{ background: '#0d0d24', border: '1px solid rgba(236,72,153,0.2)', borderBottom: 'none' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* Title */}
        <div className="flex items-center justify-between px-5 pb-4">
          <h2 className="font-black text-white text-base">Share Your Night</h2>
          <button onClick={onClose}><X size={18} style={{ color: 'rgba(255,255,255,0.4)' }} /></button>
        </div>

        {/* Media preview */}
        {preview && (
          <div className="relative mx-5 mb-4 rounded-2xl overflow-hidden bg-black" style={{ maxHeight: 260 }}>
            {mediaType === 'video' ? (
              <video src={preview} controls playsInline className="w-full block" style={{ maxHeight: 260 }} />
            ) : (
              <img src={preview} alt="" className="w-full object-cover" style={{ maxHeight: 260 }} />
            )}
            <button
              onClick={clearMedia}
              className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.6)' }}
            >
              <X size={13} style={{ color: '#fff' }} />
            </button>
          </div>
        )}

        {/* Text input */}
        <div className="px-5 mb-4">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="What's happening tonight? 🎉"
            maxLength={280}
            rows={3}
            className="w-full bg-transparent text-white text-sm leading-relaxed resize-none outline-none placeholder-white/20"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px]" style={{ color: text.length > 250 ? '#ef4444' : 'rgba(255,255,255,0.2)' }}>
              {280 - text.length}
            </span>
          </div>
        </div>

        {/* Error */}
        {error && <p className="px-5 pb-3 text-xs font-semibold" style={{ color: '#ef4444' }}>{error}</p>}

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 pb-6 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Media picker */}
          <button
            onClick={() => fileRef.current?.click()}
            className="p-2.5 rounded-xl transition-all flex items-center gap-1.5"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <ImagePlus size={16} style={{ color: 'rgba(255,255,255,0.5)' }} />
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={pickMedia} />

          {/* Story toggle */}
          <button
            onClick={() => setIsStory(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={isStory
              ? { background: 'rgba(236,72,153,0.15)', color: '#ec4899', border: '1px solid rgba(236,72,153,0.35)' }
              : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.08)' }
            }
          >
            <Clock size={12} />
            25H STORY
          </button>

          {/* Post button */}
          <button
            onClick={submit}
            disabled={uploading || (!text.trim() && !mediaFile)}
            className="ml-auto px-5 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #ec4899, #f97316)', color: '#fff', boxShadow: '0 0 16px rgba(236,72,153,0.3)' }}
          >
            {uploading ? (mediaType === 'video' ? 'UPLOADING…' : '…') : 'POST'}
          </button>
        </div>
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
  const [items, setItems] = useState<FeedItem[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set())
  const [viewingStory, setViewingStory] = useState<Story | null>(null)
  const [composing, setComposing] = useState(false)
  const loadedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [feedRes, storiesRes] = await Promise.all([
        api.get<{ data: FeedItem[] }>('/feed/discover'),
        isLoggedIn ? api.get<{ data: Story[] }>('/posts/stories').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ])
      setItems(feedRes.data ?? [])
      setStories((storiesRes as { data: Story[] }).data ?? [])
    } catch {}
    if (!silent) setLoading(false)
  }, [isLoggedIn])

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
        <div className="flex gap-4 px-4 py-4 overflow-x-auto no-scrollbar" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
              <div className="w-14 h-14 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="w-10 h-2 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          ))}
        </div>
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

  // Only show real posts — API now returns POST type only but guard here too
  const allItems = items.filter(i => i.type === 'POST' && i.post)

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-20">

        {/* ── Stories Row ─────────────────────────────────────────────────── */}
        {(stories.length > 0 || isLoggedIn) && (
          <div
            className="flex items-center gap-4 px-4 py-4 overflow-x-auto no-scrollbar"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }}
          >
            {/* Your story / add story */}
            {isLoggedIn && dbUser && (
              <button
                onClick={() => setComposing(true)}
                className="flex flex-col items-center gap-1.5 shrink-0"
              >
                <div className="relative">
                  <div className="rounded-full p-0.5" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                    <Avatar user={dbUser} size={44} />
                  </div>
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #ec4899, #f97316)', border: '2px solid #07071a' }}
                  >
                    <span className="text-white font-black" style={{ fontSize: 11, lineHeight: 1 }}>+</span>
                  </div>
                </div>
                <span className="text-[9px] font-bold text-white/40">Your story</span>
              </button>
            )}

            {stories.map(story => (
              <StoryRing key={story.id} story={story} onClick={() => setViewingStory(story)} />
            ))}

            {stories.length === 0 && isLoggedIn && (
              <p className="text-[10px] text-white/20 italic ml-2">No stories yet — be the first 🎉</p>
            )}
          </div>
        )}

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
              key={`${item.post!.id}-${idx}`}
              item={item}
              liked={likedIds.has(item.post!.id)}
              onLike={() => handleLike(item.post!.id)}
              reported={reportedIds.has(item.post!.id)}
              onReport={() => handleReport(item.post!.id)}
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

      {/* ── Story viewer ────────────────────────────────────────────────── */}
      {viewingStory && (
        <StoryViewer story={viewingStory} onClose={() => setViewingStory(null)} />
      )}

      {/* ── Compose modal ───────────────────────────────────────────────── */}
      {composing && (
        <ComposeModal
          onClose={() => setComposing(false)}
          onPosted={() => {
            // Scroll to top immediately so the new post is visible when the reload completes
            scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
            loadedRef.current = false
            load(true)
          }}
        />
      )}
    </div>
  )
}
