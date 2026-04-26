'use client'

/**
 * Feed tab shown inside /discover.
 * Uses the exact same FeedItemCard components as /feed so the design is
 * pixel-identical — just without the full-page chrome (stories, compose FAB).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Rss } from 'lucide-react'

import { api } from '@/lib/api'
import { logError } from '@/lib/logError'
import { FeedItemCard, type FeedItem } from './FeedCards'

interface Props {
  dbUser: { id: string; username: string; displayName: string; photoUrl?: string | null } | null
  isLoggedIn: boolean
}

export default function DiscoverFeedTab({ dbUser, isLoggedIn }: Props) {
  const currentUserId = dbUser?.id ?? null
  const [items, setItems]       = useState<FeedItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(false)
  const loadedRef               = useRef(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(false) }
    try {
      const res = await api.get<{ data: FeedItem[] }>('/feed/discover')
      setItems(res?.data ?? [])
    } catch (err) {
      logError('discover-feed-tab', err)
      if (!silent) setError(true)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    load()
  }, [load])

  // Silently refresh when the user returns to this tab
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && loadedRef.current) load(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  function handleDelete(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
        <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
          LOADING FEED…
        </p>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 px-8">
        <p className="text-sm text-center" style={{ color: 'rgba(224,242,254,0.35)' }}>
          Couldn't load the feed right now.
        </p>
        <button onClick={() => load()} className="px-5 py-2.5 rounded-xl text-sm font-bold"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          Try again
        </button>
      </div>
    )
  }

  // ── Empty ────────────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(var(--accent-rgb),0.05)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
          <Rss size={24} style={{ color: 'rgba(var(--accent-rgb),0.25)' }} />
        </div>
        <p className="text-sm font-black tracking-widest" style={{ color: 'rgba(224,242,254,0.35)' }}>
          NOTHING YET
        </p>
        {!isLoggedIn && (
          <Link href="/login" className="text-xs font-bold px-4 py-2 rounded-xl"
            style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>
            LOG IN TO SEE YOUR FEED
          </Link>
        )}
      </div>
    )
  }

  // ── Feed ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto pb-28 px-4 pt-3 space-y-3" style={{ scrollbarWidth: 'none' }}>
      {items.map((item, i) => (
        <FeedItemCard
          key={item.id ?? i}
          item={item}
          currentUserId={currentUserId}
          onDelete={handleDelete}
        />
      ))}

      {/* CTA to open the full feed page */}
      <Link href="/feed"
        className="flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black tracking-widest mt-1 mb-6 transition-all"
        style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.1)', color: 'rgba(var(--accent-rgb),0.45)' }}>
        <Rss size={11} /> OPEN FULL FEED
      </Link>
    </div>
  )
}
