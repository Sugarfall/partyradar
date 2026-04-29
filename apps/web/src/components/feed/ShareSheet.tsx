'use client'

/**
 * Share sheet for Phase 4.
 *
 * Three channels:
 *   1. Native share — uses the Web Share API if the browser/OS supports it.
 *      On iOS/Android this opens the system share sheet (Messages, WhatsApp,
 *      etc). On unsupported browsers the option hides itself so we don't
 *      show a button that does nothing.
 *   2. Copy link — puts the canonical post URL on the clipboard and shows a
 *      brief "copied" confirmation.
 *   3. Repost — opens the Phase 2 ComposePostModal in repost mode, wired to
 *      this post as the `originalPost`. The server creates the repost via
 *      POST /api/posts with originalPostId — that path already bumps
 *      originalPost.repostsCount in its transaction.
 *
 * Every successful channel fires POST /api/posts/:id/share with its method
 * so we get per-channel analytics for the insights view in Phase 5.
 *
 * UX: bottom sheet on mobile (slides up from the bottom, with a drag
 * handle); centered dialog on desktop. Clicking the backdrop closes it.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Share2, Copy, Repeat2, X, Check } from 'lucide-react'

import { api } from '@/lib/api'
import ComposePostModal, { type RepostableSource } from './ComposePostModal'

// ─── Types ────────────────────────────────────────────────────────────────

export interface SharablePost extends RepostableSource {
  // Inherits id, text, imageUrl, user, media from RepostableSource.
  // Accept the UI surface's own user shape where username is the only
  // guaranteed field — we use it to build the shareable URL.
  user: {
    displayName: string
    username: string
    photoUrl?: string | null
  }
}

export interface ShareSheetProps {
  post: SharablePost
  onClose: () => void
  /** Fires after a successful share of any method, with that method name. */
  onShared?: (method: 'native' | 'copy' | 'repost') => void
}

type ShareMethod = 'native' | 'copy' | 'repost'

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildPostUrl(postId: string): string {
  if (typeof window === 'undefined') return `/feed/${postId}`
  return `${window.location.origin}/feed/${postId}`
}

/** navigator.share is guarded behind HTTPS + browser support. Compute once
 *  per mount so we can hide the native option when it wouldn't work. */
function useCanNativeShare(): boolean {
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    setSupported(
      typeof navigator !== 'undefined'
        && typeof (navigator as { share?: unknown }).share === 'function',
    )
  }, [])
  return supported
}

// ─── Component ────────────────────────────────────────────────────────────

export default function ShareSheet({ post, onClose, onShared }: ShareSheetProps) {
  const canNativeShare = useCanNativeShare()
  const [copied, setCopied] = useState(false)
  const [reposting, setReposting] = useState(false)
  const [quickReposted, setQuickReposted] = useState(false)
  const [quickReposting, setQuickReposting] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const postUrl = useMemo(() => buildPostUrl(post.id), [post.id])

  // Lock body scroll while sheet is open; clear timers on unmount.
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  /** Record analytics in the background. We don't want a 500 on the share
   *  endpoint to ruin an otherwise-successful copy-to-clipboard. */
  function recordShare(method: ShareMethod) {
    api.post(`/posts/${post.id}/share`, { method }).catch(() => { /* silent */ })
    onShared?.(method)
  }

  async function handleNativeShare() {
    const shareData: ShareData = {
      title: `${post.user.displayName} on PartyRadar`,
      text: post.text?.slice(0, 200) ?? 'Check out this post on PartyRadar',
      url: postUrl,
    }
    try {
      await navigator.share(shareData)
      recordShare('native')
      onClose()
    } catch (err) {
      // User cancelled the sheet — not an error.
      const name = (err as Error)?.name
      if (name !== 'AbortError') {
        // Fall back to copy if share genuinely failed.
        await handleCopy()
      }
    }
  }

  async function handleCopy() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(postUrl)
      } else {
        // Ancient-browser fallback: a hidden textarea + execCommand.
        const ta = document.createElement('textarea')
        ta.value = postUrl
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      recordShare('copy')
      closeTimerRef.current = setTimeout(() => {
        setCopied(false)
        onClose()
      }, 900)
    } catch {
      // Leave the sheet open so the user can try again.
    }
  }

  /** Quick repost — no caption, immediate API call, stays in sheet briefly. */
  async function handleQuickRepost() {
    if (quickReposted || quickReposting) return
    setQuickReposting(true)
    try {
      await api.post('/posts', { originalPostId: post.id })
      recordShare('repost')
      setQuickReposted(true)
      closeTimerRef.current = setTimeout(() => onClose(), 900)
    } catch {
      // silent — could be "can't repost your own" etc.
    } finally {
      setQuickReposting(false)
    }
  }

  /** Quote repost — opens ComposePostModal so the user can add a caption. */
  function handleQuote() {
    recordShare('repost')
    setReposting(true)
  }

  // When the compose modal closes, close the whole sheet.
  function handleRepostClosed() {
    setReposting(false)
    onClose()
  }

  // ─── Render ────────────────────────────────────────────────────────────

  // Repost mode hands off to the compose modal — the sheet itself is hidden
  // while it's open so we don't stack two overlays.
  if (reposting) {
    return (
      <ComposePostModal
        repostOf={post}
        onClose={handleRepostClosed}
        onPosted={handleRepostClosed}
      />
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: '#0d0d24',
          border: '1px solid rgba(236,72,153,0.2)',
          borderBottom: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Share post"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* Title */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="font-black text-white text-base">Share</h2>
          <button onClick={onClose} aria-label="Close">
            <X size={18} style={{ color: 'rgba(255,255,255,0.4)' }} />
          </button>
        </div>

        {/* Options */}
        <div className="px-3 pb-3 space-y-1">
          {canNativeShare && (
            <ShareOption
              icon={<Share2 size={18} />}
              label="Share to…"
              sublabel="Messages, WhatsApp, etc."
              onClick={handleNativeShare}
            />
          )}
          <ShareOption
            icon={copied ? <Check size={18} /> : <Copy size={18} />}
            label={copied ? 'Copied!' : 'Copy link'}
            sublabel={copied ? undefined : postUrl}
            onClick={handleCopy}
            accent={copied ? '#00ff88' : undefined}
          />
          <ShareOption
            icon={quickReposted ? <Check size={18} /> : <Repeat2 size={18} />}
            label={quickReposted ? 'Reposted!' : quickReposting ? 'Reposting…' : 'Repost'}
            sublabel={quickReposted ? undefined : 'Share instantly with your followers'}
            onClick={handleQuickRepost}
            accent={quickReposted ? '#00ff88' : '#ec4899'}
          />
          <ShareOption
            icon={<Repeat2 size={18} />}
            label="Quote Repost"
            sublabel="Add your own comment to this post"
            onClick={handleQuote}
            accent="#a855f7"
          />
        </div>

        {/* Quoted preview */}
        <div
          className="mx-4 mb-4 rounded-xl p-3 flex gap-3"
          style={{
            background: 'rgba(236,72,153,0.06)',
            border: '1px solid rgba(236,72,153,0.15)',
          }}
        >
          {(post.media?.[0]?.url || post.imageUrl) && (
            <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0" style={{ background: '#000' }}>
              <img
                src={(post.media?.[0]?.url ?? post.imageUrl) || ''}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black truncate" style={{ color: 'rgba(236,72,153,0.9)' }}>
              @{post.user.username}
            </p>
            {post.text && (
              <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'rgba(224,242,254,0.65)' }}>
                {post.text}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Option row ──────────────────────────────────────────────────────────

function ShareOption({
  icon, label, sublabel, onClick, accent,
}: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  onClick: () => void
  accent?: string
}) {
  const color = accent ?? '#e0f2fe'
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors text-left"
      style={{
        background: 'transparent',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: accent ? `${accent}18` : 'rgba(255,255,255,0.06)',
          border: accent ? `1px solid ${accent}40` : '1px solid rgba(255,255,255,0.1)',
          color,
        }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black" style={{ color }}>{label}</p>
        {sublabel && (
          <p className="text-[10px] truncate mt-0.5" style={{ color: 'rgba(224,242,254,0.35)' }}>
            {sublabel}
          </p>
        )}
      </div>
    </button>
  )
}
