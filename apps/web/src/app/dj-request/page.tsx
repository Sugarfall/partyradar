'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { API_URL } from '@/lib/api'
import { Music, Zap } from 'lucide-react'

const CREDIT_COST = 50

function DjRequestInner() {
  const { dbUser, firebaseUser } = useAuth()
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
    if (!dbUser || !firebaseUser) return
    firebaseUser.getIdToken().then(token =>
      fetch(`${API_URL}/wallet/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(j => setPoints(j.data?.rewardPoints ?? null))
    ).catch(() => {})
  }, [dbUser, firebaseUser])

  async function submit() {
    if (!song.trim() || !firebaseUser) return
    setSubmitting(true)
    setError(null)
    try {
      const token = await firebaseUser.getIdToken()
      const res = await fetch(`${API_URL}/dj-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ song: song.trim(), artist: artist.trim() || undefined, message: message.trim() || undefined, eventId: eventId || undefined, venueId: venueId || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message || 'Failed to submit request')
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally { setSubmitting(false) }
  }

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
