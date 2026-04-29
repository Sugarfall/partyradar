'use client'

/**
 * Shared compose modal for the Phase 2 feed.
 *
 * Does four things the old in-file ComposeModal couldn't:
 *   1. Multi-file picker (up to 10 images/videos) with reorder-by-drag.
 *   2. Parallel Cloudinary uploads with per-item progress dots.
 *   3. @user + @venue autocomplete that resolves to real DB IDs and stores
 *      them as PostTag rows on the server.
 *   4. Repost mode — pass `originalPost` and the modal renders the quoted
 *      card inline and posts an empty shell that the server links up.
 *
 * This component is deliberately presentation-light: styling matches the
 * pink-gradient aesthetic used by DiscoverFeedTab's old compose sheet so
 * dropping it into either surface feels consistent.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, ImagePlus, MapPin, Video, GripVertical, AtSign, Tag as TagIcon, Clock,
} from 'lucide-react'
import { api } from '@/lib/api'
import { uploadImage, uploadVideo } from '@/lib/cloudinary'

// ─── Types matching the POST /api/posts schema ────────────────────────────

interface MediaPayload {
  url: string
  type: 'IMAGE' | 'VIDEO'
  width?: number
  height?: number
  durationSec?: number
  thumbnailUrl?: string
}

interface PostTagPayload {
  taggedUserId?: string
  taggedVenueId?: string
  mediaIndex?: number
}

interface VenueSuggestion {
  id: string
  name: string
  type: string
  address?: string | null
}

interface UserSuggestion {
  id: string
  username: string
  displayName: string
  photoUrl?: string | null
}

type SuggestionMode = 'user' | 'venue'

// ─── Per-file upload state ────────────────────────────────────────────────

interface PendingMedia {
  /** stable client-side key for React reconciliation */
  key: string
  file: File
  previewUrl: string
  type: 'IMAGE' | 'VIDEO'
  // Populated after upload completes.
  uploaded?: MediaPayload
  uploading: boolean
  error?: string
}

// ─── Repost-quoted shape ──────────────────────────────────────────────────

export interface RepostableSource {
  id: string
  text?: string | null
  imageUrl?: string | null
  user: { displayName: string; username: string; photoUrl?: string | null }
  media?: Array<{ id: string; url: string; type: 'IMAGE' | 'VIDEO' }>
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const VENUE_EMOJI: Record<string, string> = {
  NIGHTCLUB: '🎧', BAR: '🍸', PUB: '🍺',
  LOUNGE: '🛋️', ROOFTOP_BAR: '🌆', CONCERT_HALL: '🎵',
}

const MAX_ITEMS = 10

function makeKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Probe an uploaded image/video to capture its natural dimensions so we can
 *  send width/height to the server — helps the client reserve correct aspect
 *  ratios before the media paints. Fails open: we still ship the post. */
async function probeMediaDimensions(file: File, type: 'IMAGE' | 'VIDEO'): Promise<{
  width?: number
  height?: number
  durationSec?: number
}> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    if (type === 'IMAGE') {
      const img = new Image()
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
        URL.revokeObjectURL(url)
      }
      img.onerror = () => { resolve({}); URL.revokeObjectURL(url) }
      img.src = url
    } else {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => {
        resolve({
          width: v.videoWidth || undefined,
          height: v.videoHeight || undefined,
          durationSec: Number.isFinite(v.duration) ? Math.round(v.duration) : undefined,
        })
        URL.revokeObjectURL(url)
      }
      v.onerror = () => { resolve({}); URL.revokeObjectURL(url) }
      v.src = url
    }
  })
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface ComposePostModalProps {
  onClose: () => void
  onPosted: () => void
  /** If set, the modal opens in "repost" mode quoting this post. */
  repostOf?: RepostableSource
  /** If true, the modal opens with the Story toggle pre-selected. */
  storyMode?: boolean
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function ComposePostModal({ onClose, onPosted, repostOf, storyMode = false }: ComposePostModalProps) {
  const [text, setText] = useState('')
  const [items, setItems] = useState<PendingMedia[]>([])
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  // Stories auto-expire after 24h. Reposts can't be stories (server-enforced),
  // so we force this off when repostOf is set.
  const [isStory, setIsStory] = useState<boolean>(!!storyMode && !repostOf)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Caret-tracked @mention autocomplete ────────────────────────────────
  // We parse the textarea for an in-progress "@foo" token at the caret and
  // surface a dropdown whose items, on click, get stored as post-level tags
  // AND leave the @handle in the caption so readers can read the mention.
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionMode, setMentionMode] = useState<SuggestionMode>('user')
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const [userSuggestions, setUserSuggestions] = useState<UserSuggestion[]>([])
  const [venueSuggestions, setVenueSuggestions] = useState<VenueSuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  // Tags resolved by the autocomplete — sent to the server alongside media.
  const [tags, setTags] = useState<PostTagPayload[]>([])
  const [taggedUsers, setTaggedUsers] = useState<UserSuggestion[]>([])
  const [taggedVenue, setTaggedVenue] = useState<VenueSuggestion | null>(null)

  // ── Lock body scroll while modal is open (restore previous value) ──────
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // ── Revoke all object URLs on unmount to avoid memory leaks ─────────────
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => {
    return () => { itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)) }
  }, []) // empty deps: runs cleanup only on unmount, using ref for latest items

  // ── Mention query debounced fetch ──────────────────────────────────────
  useEffect(() => {
    const q = mentionQuery?.trim()
    if (!q) {
      setUserSuggestions([])
      setVenueSuggestions([])
      return
    }
    setLoadingSuggestions(true)
    const t = setTimeout(async () => {
      try {
        if (mentionMode === 'user') {
          const res = await api.get<{ data: UserSuggestion[] }>(`/users/search?q=${encodeURIComponent(q)}`)
          setUserSuggestions(res.data ?? [])
        } else {
          const res = await api.get<{ data: VenueSuggestion[] }>(`/venues?q=${encodeURIComponent(q)}&limit=8`)
          setVenueSuggestions(res.data ?? [])
        }
      } catch {
        // swallow — dropdown just stays empty
      } finally {
        setLoadingSuggestions(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [mentionQuery, mentionMode])

  // ── File picker ────────────────────────────────────────────────────────
  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length === 0) return
    const room = MAX_ITEMS - items.length
    if (room <= 0) {
      setError(`You can attach up to ${MAX_ITEMS} items`)
      return
    }
    const slice = picked.slice(0, room)
    if (picked.length > room) setError(`Only the first ${room} file(s) added — max ${MAX_ITEMS} per post`)

    const now: PendingMedia[] = slice.map((file) => ({
      key: makeKey(),
      file,
      previewUrl: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE',
      uploading: true,
    }))

    setItems((prev) => [...prev, ...now])
    // Reset the input so re-picking the same file fires change again.
    if (fileRef.current) fileRef.current.value = ''

    // Kick off uploads in parallel — each resolves independently so fast
    // items render their "ready" state before slow ones finish.
    now.forEach((item) => {
      void (async () => {
        try {
          const dims = await probeMediaDimensions(item.file, item.type)
          const url = item.type === 'VIDEO'
            ? await uploadVideo(item.file, 'sightings')
            : await uploadImage(item.file, 'sightings')
          setItems((prev) => prev.map((p) => p.key === item.key ? {
            ...p,
            uploading: false,
            uploaded: {
              url,
              type: item.type,
              ...dims,
            },
          } : p))
        } catch (err) {
          setItems((prev) => prev.map((p) => p.key === item.key ? {
            ...p,
            uploading: false,
            error: (err as Error).message ?? 'Upload failed',
          } : p))
        }
      })()
    })
  }

  function removeItem(key: string) {
    setItems((prev) => {
      const gone = prev.find((p) => p.key === key)
      if (gone) URL.revokeObjectURL(gone.previewUrl)
      return prev.filter((p) => p.key !== key)
    })
    // Any tag pinned to that media slot no longer has a target — drop it.
    setTags((prev) => prev.filter((t) => {
      if (t.mediaIndex == null) return true
      const idx = items.findIndex((p) => p.key === key)
      return idx === -1 ? true : t.mediaIndex !== idx
    }))
  }

  // ── Drag-to-reorder thumbnails ─────────────────────────────────────────
  const [dragKey, setDragKey] = useState<string | null>(null)
  function onDragStart(key: string) { setDragKey(key) }
  function onDragOver(e: React.DragEvent) { e.preventDefault() }
  function onDropOn(targetKey: string) {
    if (!dragKey || dragKey === targetKey) return
    setItems((prev) => {
      const from = prev.findIndex((p) => p.key === dragKey)
      const to = prev.findIndex((p) => p.key === targetKey)
      if (from === -1 || to === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved!)
      return next
    })
    setDragKey(null)
  }

  // ── Textarea mention parser ────────────────────────────────────────────
  function onTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value
    setText(v)
    const caret = e.target.selectionStart ?? v.length
    // Walk backwards from caret to find a @ or # token start.
    const before = v.slice(0, caret)
    const match = before.match(/(^|\s)([@#])([\w.]*)$/)
    if (match) {
      const sign = match[2] as '@' | '#'
      const query = match[3] ?? ''
      setMentionMode(sign === '#' ? 'venue' : 'user')
      setMentionQuery(query)
      setMentionStart(before.length - (query.length + 1)) // position of @ or #
    } else {
      setMentionQuery(null)
      setMentionStart(null)
    }
  }

  function insertMentionToken(handle: string) {
    if (mentionStart == null || !textareaRef.current) return
    const ta = textareaRef.current
    const tokenLen = (mentionQuery ?? '').length + 1 // include the sign
    const before = text.slice(0, mentionStart)
    const after = text.slice(mentionStart + tokenLen)
    const sign = mentionMode === 'user' ? '@' : '#'
    const next = `${before}${sign}${handle} ${after}`
    setText(next)
    setMentionQuery(null)
    setMentionStart(null)
    requestAnimationFrame(() => {
      const cursor = (before + sign + handle + ' ').length
      ta.focus()
      ta.setSelectionRange(cursor, cursor)
    })
  }

  function chooseUser(u: UserSuggestion) {
    if (!taggedUsers.some((x) => x.id === u.id)) {
      setTaggedUsers((p) => [...p, u])
      setTags((p) => [...p, { taggedUserId: u.id }])
    }
    insertMentionToken(u.username)
  }

  function chooseVenue(v: VenueSuggestion) {
    // Only one venue tag per post — replace if someone already picked one.
    setTaggedVenue(v)
    setTags((p) => {
      const cleared = p.filter((t) => !t.taggedVenueId)
      return [...cleared, { taggedVenueId: v.id }]
    })
    insertMentionToken(v.name.replace(/\s+/g, '_'))
  }

  function removeTaggedUser(id: string) {
    setTaggedUsers((p) => p.filter((u) => u.id !== id))
    setTags((p) => p.filter((t) => t.taggedUserId !== id))
  }

  function removeTaggedVenue() {
    setTaggedVenue(null)
    setTags((p) => p.filter((t) => !t.taggedVenueId))
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  const anyUploading = items.some((i) => i.uploading)
  const anyError = items.find((i) => i.error)

  const canSubmit = !posting && !anyUploading && !anyError && (
    repostOf !== undefined
      || text.trim().length > 0
      || items.some((i) => i.uploaded)
  )

  async function submit() {
    if (!canSubmit) return
    setPosting(true)
    setError('')
    try {
      const media: MediaPayload[] = items
        .filter((i): i is PendingMedia & { uploaded: MediaPayload } => !!i.uploaded)
        .map((i) => i.uploaded)

      await api.post('/posts', {
        text: text.trim() || undefined,
        media: media.length > 0 ? media : undefined,
        // Reposts can't be stories (server enforces this — guard client-side too).
        isStory: repostOf ? false : isStory,
        tags: tags.length > 0 ? tags : undefined,
        originalPostId: repostOf?.id,
      })
      onPosted()
      onClose()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to post')
      setPosting(false)
    }
  }

  const showingSuggestions = mentionQuery !== null && (
    (mentionMode === 'user' && userSuggestions.length > 0)
    || (mentionMode === 'venue' && venueSuggestions.length > 0)
    || loadingSuggestions
  )

  const submitLabel = repostOf
    ? (posting ? 'REPOSTING…' : 'REPOST')
    : isStory
      ? (posting ? 'POSTING…' : anyUploading ? 'UPLOADING…' : 'POST STORY')
      : (posting ? 'POSTING…' : anyUploading ? 'UPLOADING…' : 'POST')

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: '#0d0d24',
          border: '1px solid rgba(236,72,153,0.2)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* Title */}
        <div className="flex items-center justify-between px-5 pb-3 shrink-0">
          <h2 className="font-black text-white text-base">
            {repostOf ? 'Repost' : isStory ? 'Add to Story' : 'Share Your Night'}
          </h2>
          <button onClick={onClose} aria-label="Close">
            <X size={18} style={{ color: 'rgba(255,255,255,0.4)' }} />
          </button>
        </div>

        {/* Post / Story segmented toggle — hidden in repost mode since the
            server rejects story-reposts anyway. */}
        {!repostOf && (
          <div className="px-5 pb-3 shrink-0">
            <div
              className="flex rounded-full p-1"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <button
                onClick={() => setIsStory(false)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black tracking-widest transition-all"
                style={{
                  background: !isStory ? 'linear-gradient(135deg, #ec4899, #f97316)' : 'transparent',
                  color: !isStory ? '#fff' : 'rgba(255,255,255,0.5)',
                  boxShadow: !isStory ? '0 0 12px rgba(236,72,153,0.3)' : 'none',
                }}
              >
                POST
              </button>
              <button
                onClick={() => setIsStory(true)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black tracking-widest transition-all"
                style={{
                  background: isStory ? 'linear-gradient(135deg, #ec4899, #f97316)' : 'transparent',
                  color: isStory ? '#fff' : 'rgba(255,255,255,0.5)',
                  boxShadow: isStory ? '0 0 12px rgba(236,72,153,0.3)' : 'none',
                }}
              >
                <Clock size={10} /> STORY · 24H
              </button>
            </div>
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>

          {/* Media grid — reorderable thumbnails */}
          {items.length > 0 && (
            <div className="px-5 pb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ImagePlus size={10} style={{ color: 'rgba(236,72,153,0.6)' }} />
                <span className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(236,72,153,0.5)' }}>
                  {items.length}/{MAX_ITEMS} {items.length === 1 ? 'ITEM' : 'ITEMS'} · DRAG TO REORDER
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {items.map((it) => (
                  <div
                    key={it.key}
                    draggable
                    onDragStart={() => onDragStart(it.key)}
                    onDragOver={onDragOver}
                    onDrop={() => onDropOn(it.key)}
                    className="relative aspect-square rounded-xl overflow-hidden cursor-move"
                    style={{
                      background: '#000',
                      border: it.error
                        ? '1px solid rgba(239,68,68,0.6)'
                        : it.uploading
                          ? '1px solid rgba(255,255,255,0.08)'
                          : '1px solid rgba(0,255,136,0.4)',
                      opacity: dragKey === it.key ? 0.5 : 1,
                    }}
                  >
                    {it.type === 'VIDEO' ? (
                      <video src={it.previewUrl} className="w-full h-full object-cover" muted />
                    ) : (
                      <img src={it.previewUrl} alt="" className="w-full h-full object-cover" />
                    )}

                    {/* Video badge */}
                    {it.type === 'VIDEO' && (
                      <div className="absolute top-1 left-1 px-1 py-0.5 rounded flex items-center gap-0.5"
                        style={{ background: 'rgba(0,0,0,0.6)' }}>
                        <Video size={8} style={{ color: '#fff' }} />
                      </div>
                    )}

                    {/* Drag handle */}
                    <div className="absolute bottom-1 left-1 opacity-60">
                      <GripVertical size={10} style={{ color: '#fff' }} />
                    </div>

                    {/* Upload status overlay */}
                    {it.uploading && (
                      <div className="absolute inset-0 flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.55)' }}>
                        <div className="w-6 h-6 rounded-full border-2 animate-spin"
                          style={{ borderColor: 'rgba(255,255,255,0.15)', borderTopColor: '#ec4899' }} />
                      </div>
                    )}
                    {it.error && (
                      <div className="absolute inset-0 flex items-center justify-center px-1 text-center"
                        style={{ background: 'rgba(239,68,68,0.75)' }}>
                        <span className="text-[8px] font-black text-white leading-tight">FAILED</span>
                      </div>
                    )}

                    {/* Remove */}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeItem(it.key) }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.7)' }}
                      aria-label="Remove"
                    >
                      <X size={10} style={{ color: '#fff' }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Repost quoted card */}
          {repostOf && (
            <div className="px-5 pb-3">
              <div className="rounded-2xl p-3 flex gap-3"
                style={{ background: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.2)' }}>
                {(repostOf.media?.[0]?.url || repostOf.imageUrl) && (
                  <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0" style={{ background: '#000' }}>
                    <img
                      src={(repostOf.media?.[0]?.url ?? repostOf.imageUrl) || ''}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black" style={{ color: 'rgba(236,72,153,0.9)' }}>
                    @{repostOf.user.username}
                  </p>
                  {repostOf.text && (
                    <p className="text-xs mt-1 line-clamp-3" style={{ color: 'rgba(224,242,254,0.75)' }}>
                      {repostOf.text}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Text + mention dropdown */}
          <div className="px-5 mb-3 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={onTextChange}
              placeholder={repostOf
                ? 'Add a caption to your repost…'
                : 'What\'s happening tonight? Use @ to tag people, # for venues…'
              }
              maxLength={2000}
              rows={3}
              className="w-full bg-transparent text-white text-sm leading-relaxed resize-none outline-none placeholder-white/20"
              style={{ minHeight: 72 }}
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px]" style={{ color: text.length > 1800 ? '#ef4444' : 'rgba(255,255,255,0.2)' }}>
                {2000 - text.length}
              </span>
            </div>

            {/* Suggestions */}
            {showingSuggestions && (
              <div
                className="absolute left-5 right-5 top-full -mt-8 rounded-xl overflow-hidden z-10"
                style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(236,72,153,0.2)', maxHeight: 180, overflowY: 'auto' }}
              >
                {loadingSuggestions && (
                  <div className="flex justify-center py-2">
                    <div className="w-3 h-3 rounded-full border-2 animate-spin"
                      style={{ borderColor: 'rgba(236,72,153,0.1)', borderTopColor: '#ec4899' }} />
                  </div>
                )}
                {mentionMode === 'user' && userSuggestions.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => chooseUser(u)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px]"
                    style={{ color: '#e0f2fe', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    {u.photoUrl ? (
                      <img src={u.photoUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[9px] font-black"
                        style={{ background: 'rgba(236,72,153,0.15)', color: '#ec4899' }}>
                        {u.displayName[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="font-bold truncate">{u.displayName}</span>
                    <span className="text-[9px] shrink-0" style={{ color: 'rgba(224,242,254,0.4)' }}>@{u.username}</span>
                  </button>
                ))}
                {mentionMode === 'venue' && venueSuggestions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => chooseVenue(v)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px]"
                    style={{ color: '#e0f2fe', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <span className="shrink-0">{VENUE_EMOJI[v.type] ?? '📍'}</span>
                    <span className="flex-1 truncate">{v.name}</span>
                    {v.address && (
                      <span className="text-[9px] shrink-0 truncate max-w-[100px]" style={{ color: 'rgba(224,242,254,0.3)' }}>
                        {v.address}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tagged chips */}
          {(taggedUsers.length > 0 || taggedVenue) && (
            <div className="px-5 pb-3 space-y-2">
              {taggedVenue && (
                <div className="flex items-center gap-1.5">
                  <MapPin size={10} style={{ color: 'rgba(0,200,255,0.5)' }} />
                  <span className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(0,200,255,0.4)' }}>AT</span>
                  <button
                    onClick={removeTaggedVenue}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
                    style={{ background: 'rgba(0,200,255,0.15)', color: 'var(--accent)', border: '1px solid rgba(0,200,255,0.4)' }}
                  >
                    <span>{VENUE_EMOJI[taggedVenue.type] ?? '📍'}</span>
                    {taggedVenue.name}
                    <X size={9} />
                  </button>
                </div>
              )}
              {taggedUsers.length > 0 && (
                <div className="flex items-start gap-1.5 flex-wrap">
                  <TagIcon size={10} style={{ color: 'rgba(236,72,153,0.5)', marginTop: 4 }} />
                  <span className="text-[9px] font-bold tracking-widest mt-1" style={{ color: 'rgba(236,72,153,0.4)' }}>WITH</span>
                  {taggedUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => removeTaggedUser(u.id)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: 'rgba(236,72,153,0.12)', color: '#ec4899', border: '1px solid rgba(236,72,153,0.3)' }}
                    >
                      @{u.username}
                      <X size={9} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {(error || anyError) && (
            <p className="px-5 pb-3 text-xs font-semibold" style={{ color: '#ef4444' }}>
              {error || anyError?.error || 'One or more uploads failed'}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-3 px-5 py-3 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Media picker */}
          {!repostOf && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={items.length >= MAX_ITEMS}
                className="p-2.5 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-30"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                title={items.length >= MAX_ITEMS ? `${MAX_ITEMS} max` : 'Add photo or video'}
              >
                <ImagePlus size={16} style={{ color: 'rgba(255,255,255,0.5)' }} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={onPickFiles}
              />
            </>
          )}

          {/* @-mention shortcut */}
          {!repostOf && (
            <button
              onClick={() => {
                const ta = textareaRef.current
                if (!ta) return
                const pos = ta.selectionStart ?? text.length
                const before = text.slice(0, pos)
                const after = text.slice(pos)
                const needsSpace = before.length > 0 && !before.endsWith(' ')
                const next = `${before}${needsSpace ? ' ' : ''}@${after}`
                setText(next)
                requestAnimationFrame(() => {
                  ta.focus()
                  const cursor = next.length - after.length
                  ta.setSelectionRange(cursor, cursor)
                })
              }}
              className="p-2.5 rounded-xl transition-all flex items-center gap-1.5"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              title="Tag someone"
            >
              <AtSign size={16} style={{ color: 'rgba(255,255,255,0.5)' }} />
            </button>
          )}

          {/* Post button */}
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="ml-auto px-5 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, #ec4899, #f97316)',
              color: '#fff',
              boxShadow: '0 0 16px rgba(236,72,153,0.3)',
            }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
