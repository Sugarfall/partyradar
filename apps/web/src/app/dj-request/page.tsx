'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Music, Zap } from 'lucide-react'

const CREDIT_COST = 50

function DjRequestInner() {
  const { dbUser } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const eventId = searchParams.get('eventId')
  const venueId = searchParams.get('venueId')
  const [song, setSong] = useState('')
  const [artist, setArtist] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [points, setPoints] = useState<number | null>(null)

  useEffect(() => {
    if (!dbUser) return
    api.get<{ data: { rewardPoints: number } }>('/wallet')
      .then(j => setPoints(j?.data?.rewardPoints ?? null))
      .catch(() => {})
  }, [dbUser])

  async function submit() {
    if (!song.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/dj-requests', {
        song: song.trim(),
        artist: artist.trim() || undefined,
        message: message.trim() || undefined,
        eventId: eventId || undefined,
        venueId: venueId || undefined,
      })
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally { setSubmitting(false) }
  }

  const isFreeUser = dbUser && (dbUser.subscriptionTier === 'FREE' || !dbUser.subscriptionTier)

  if (!dbUser) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#07071a' }}>
      <div className="text-center space-y-3">
        <Music size={36} style={{ color: 'rgba(var(--accent-rgb),0.2)', margin: '0 auto' }} />
        <p className="text-sm font-black" style={{ color: 'rgba(224,242,254,0.5)' }}>Log in to request a song</p>
        <a href="/login" className="inline-block px-6 py-2.5 rounded-xl text-xs font-black"
          style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)' }}>LOG IN</a>
      </div>
    </div>
  )

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#07071a' }}>
      <div className="text-center space-y-4 px-6">
        <div className="text-4xl">🎵</div>
        <p className="text-xl font-black" style={{ color: 'var(--accent)' }}>Request Sent!</p>
        <p className="text-sm" style={{ color: 'rgba(224,242,254,0.5)' }}>Your request has been sent to the DJ. They&apos;ll review it shortly.</p>
        <button onClick={() => router.back()} className="px-6 py-2.5 rounded-xl text-xs font-black"
          style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>GO BACK</button>
      </div>
    </div>
  )

  const hasEnough = points === null || points >= CREDIT_COST

  if (isFreeUser) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#07071a' }}>
      <div className="text-center space-y-4 px-6 max-w-sm">
        <Music size={36} style={{ color: 'rgba(var(--accent-rgb),0.3)', margin: '0 auto' }} />
        <p className="text-xl font-black" style={{ color: '#e0f2fe' }}>Upgrade Required</p>
        <p className="text-sm" style={{ color: 'rgba(224,242,254,0.5)' }}>
          DJ Song Requests are available from the <span className="font-black" style={{ color: 'var(--accent)' }}>BASIC</span> tier and above.
        </p>
        <a href="/pricing" className="inline-block px-6 py-2.5 rounded-xl text-xs font-black"
          style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.4)', color: 'var(--accent)' }}>
          VIEW PLANS
        </a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen pb-24" style={{ background: '#07071a' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-4"
        style={{ background: 'rgba(7,7,26,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(var(--accent-rgb),0.08)' }}>
        <h1 className="text-xl font-black" style={{ color: '#e0f2fe' }}>Request a Song</h1>
        <p className="text-xs mt-1" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>Costs {CREDIT_COST} reward points</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {points !== null && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl"
            style={{ background: hasEnough ? 'rgba(var(--accent-rgb),0.04)' : 'rgba(255,0,110,0.04)', border: `1px solid ${hasEnough ? 'rgba(var(--accent-rgb),0.12)' : 'rgba(255,0,110,0.2)'}` }}>
            <Zap size={14} style={{ color: hasEnough ? 'var(--accent)' : '#ff006e' }} />
            <p className="text-xs font-bold" style={{ color: hasEnough ? 'var(--accent)' : '#ff006e' }}>
              {hasEnough ? `You have ${points} points — enough for this request` : `Not enough points (need ${CREDIT_COST}, have ${points})`}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <input value={song} onChange={e => setSong(e.target.value)} placeholder="Song name *"
            className="w-full px-4 py-3 rounded-xl text-sm bg-transparent outline-none"
            style={{ border: '1px solid rgba(var(--accent-rgb),0.15)', color: '#e0f2fe' }} />
          <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="Artist (optional)"
            className="w-full px-4 py-3 rounded-xl text-sm bg-transparent outline-none"
            style={{ border: '1px solid rgba(var(--accent-rgb),0.1)', color: '#e0f2fe' }} />
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Message to the DJ (optional)" rows={3}
            className="w-full px-4 py-3 rounded-xl text-sm bg-transparent outline-none resize-none"
            style={{ border: '1px solid rgba(var(--accent-rgb),0.1)', color: '#e0f2fe' }} />
        </div>

        {error && <p className="text-xs font-bold" style={{ color: '#ff006e' }}>{error}</p>}

        <button onClick={submit} disabled={!song.trim() || submitting || !hasEnough}
          className="w-full py-3.5 rounded-xl text-sm font-black tracking-widest disabled:opacity-40"
          style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.35)', color: 'var(--accent)' }}>
          {submitting ? 'SENDING…' : `REQUEST SONG · ${CREDIT_COST} PTS`}
        </button>
      </div>
    </div>
  )
}

export default function DjRequestPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#07071a' }} />}>
      <DjRequestInner />
    </Suspense>
  )
}
