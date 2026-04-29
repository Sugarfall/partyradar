'use client'

import { useState, useEffect } from 'react'
import { Heart, MapPin, Calendar, Zap } from 'lucide-react'

import { api } from '@/lib/api'
import PostMediaViewer, { type MediaItem, type PostTagLite } from '@/components/feed/PostMediaViewer'

function timeAgo(dateStr: string) {
  const s = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}

export interface PostData {
  id: string
  user: { displayName: string; photoUrl?: string | null }
  text?: string | null
  imageUrl?: string | null
  /** Phase 2/3: ordered carousel media. */
  media?: MediaItem[] | null
  /** Phase 2/3: resolved tags with user/venue records. */
  tags?: PostTagLite[] | null
  likesCount?: number
  event?: { name: string; id?: string } | null
  venue?: { name: string; id?: string } | null
  createdAt: string
  isStory?: boolean
}

interface PostCardProps {
  post: PostData
}

export default function PostCard({ post }: PostCardProps) {
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(post.likesCount ?? 0)
  const [liking, setLiking] = useState(false)

  // Record view once per mount — server deduplicates to 1 per 6h per user
  useEffect(() => {
    api.post(`/posts/${post.id}/view`, {}).catch(() => {})
  }, [post.id])

  const initials = post.user.displayName?.[0]?.toUpperCase() ?? '?'

  async function handleLike() {
    if (liking) return
    const prev = liked
    setLiked(!prev)
    setLikes((c) => c + (prev ? -1 : 1))
    setLiking(true)
    try {
      if (prev) {
        await api.delete(`/posts/${post.id}/like`)
      } else {
        await api.post(`/posts/${post.id}/like`)
      }
    } catch {
      // Revert
      setLiked(prev)
      setLikes((c) => c + (prev ? 1 : -1))
    } finally {
      setLiking(false)
    }
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(24,24,27,0.95)',
        border: '1px solid rgba(var(--accent-rgb),0.1)',
        boxShadow: '0 2px 20px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3">
        {/* Avatar */}
        {post.user.photoUrl ? (
          <img
            src={post.user.photoUrl}
            alt=""
            className="w-9 h-9 rounded-full object-cover shrink-0"
            style={{ border: '1px solid rgba(var(--accent-rgb),0.25)', boxShadow: '0 0 8px rgba(var(--accent-rgb),0.12)' }}
          />
        ) : (
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0"
            style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}
          >
            {initials}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{post.user.displayName}</p>
          {(post.event || post.venue) && (
            <p className="text-[10px] flex items-center gap-1 mt-0.5" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
              {post.event ? <Calendar size={9} /> : <MapPin size={9} />}
              {post.event?.name ?? post.venue?.name}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {post.isStory && (
            <span
              className="text-[9px] font-black px-2 py-0.5 rounded"
              style={{ color: '#ffd600', border: '1px solid rgba(255,214,0,0.35)', background: 'rgba(255,214,0,0.08)', letterSpacing: '0.12em' }}
            >
              STORY
            </span>
          )}
          <span className="text-[10px] font-bold" style={{ color: 'rgba(74,96,128,0.55)' }}>
            {timeAgo(post.createdAt)}
          </span>
        </div>
      </div>

      {/* Media (carousel, autoplay video, tag overlays) */}
      {(post.imageUrl || (post.media && post.media.length > 0)) && (
        <PostMediaViewer
          postId={post.id}
          media={post.media}
          imageUrl={post.imageUrl}
          tags={post.tags}
          onDoubleTap={() => { if (!liked && !liking) handleLike() }}
          maxHeight={300}
        />
      )}

      {/* Text */}
      {post.text && (
        <p className="px-4 py-3 text-sm leading-relaxed" style={{ color: 'rgba(224,242,254,0.8)' }}>
          {post.text}
        </p>
      )}

      {/* Footer */}
      <div
        className="flex items-center gap-3 px-4 py-2.5"
        style={{ borderTop: '1px solid rgba(var(--accent-rgb),0.06)' }}
      >
        <button
          onClick={handleLike}
          disabled={liking}
          className="flex items-center gap-1.5 transition-all duration-200 disabled:opacity-60"
          style={{ color: liked ? '#ec4899' : 'rgba(74,96,128,0.6)' }}
        >
          <Heart
            size={15}
            fill={liked ? '#ec4899' : 'none'}
            style={{ filter: liked ? 'drop-shadow(0 0 4px rgba(236,72,153,0.6))' : 'none' }}
          />
          <span className="text-xs font-bold">{likes > 0 ? likes : ''}</span>
        </button>

        {/* Zap accent */}
        <div className="ml-auto">
          <Zap size={11} style={{ color: 'rgba(var(--accent-rgb),0.15)' }} />
        </div>
      </div>
    </div>
  )
}
