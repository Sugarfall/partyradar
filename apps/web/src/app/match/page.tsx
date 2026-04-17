'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { API_URL } from '@/lib/api'
import { Heart, X, MessageCircle, Zap, MapPin, RefreshCw, Star } from 'lucide-react'
import Link from 'next/link'

interface MatchProfile {
  id: string
  displayName: string
  username: string
  photoUrl: string | null
  bio: string | null
  interests: string[]
  gender: string | null
  distance: number | null
}

function SwipeCard({
  profile,
  onLike,
  onPass,
  isTop,
}: {
  profile: MatchProfile
  onLike: () => void
  onPass: () => void
  isTop: boolean
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const currentX = useRef(0)
  const isDragging = useRef(false)
  const [dragOffset, setDragOffset] = useState(0)
  const [dragDir, setDragDir] = useState<'left' | 'right' | null>(null)

  function onPointerDown(e: React.PointerEvent) {
    if (!isTop) return
    isDragging.current = true
    startX.current = e.clientX
    cardRef.current?.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!isDragging.current || !isTop) return
    const dx = e.clientX - startX.current
    currentX.current = dx
    setDragOffset(dx)
    setDragDir(dx > 20 ? 'right' : dx < -20 ? 'left' : null)
  }

  function onPointerUp() {
    if (!isDragging.current) return
    isDragging.current = false
    const dx = currentX.current
    if (dx > 80) {
      onLike()
    } else if (dx < -80) {
      onPass()
    } else {
      setDragOffset(0)
      setDragDir(null)
    }
  }

  const rotation = dragOffset * 0.08
  const opacity = Math.max(0, 1 - Math.abs(dragOffset) / 300)

  return (
    <div
      ref={cardRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'absolute',
        inset: 0,
        transform: isTop ? `translateX(${dragOffset}px) rotate(${rotation}deg)` : 'scale(0.96) translateY(8px)',
        transition: isDragging.current ? 'none' : 'transform 0.3s ease',
        cursor: isTop ? 'grab' : 'default',
        touchAction: 'none',
        userSelect: 'none',
        zIndex: isTop ? 2 : 1,
      }}
    >
      <div
        className="w-full h-full rounded-3xl overflow-hidden relative"
        style={{
          background: '#0a0a1a',
          border: '1px solid rgba(0,229,255,0.12)',
          boxShadow: isTop ? '0 20px 60px rgba(0,0,0,0.6)' : '0 10px 30px rgba(0,0,0,0.4)',
        }}
      >
        {/* Photo */}
        {profile.photoUrl ? (
          <img
            src={profile.photoUrl}
            alt={profile.displayName}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(0,229,255,0.06), rgba(255,0,110,0.06))' }}>
            <div className="text-7xl opacity-20">👤</div>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(4,4,13,0.95) 0%, rgba(4,4,13,0.3) 50%, transparent 100%)' }} />

        {/* Like / Pass overlays */}
        {dragDir === 'right' && (
          <div className="absolute top-8 left-8 px-4 py-2 rounded-xl border-2 rotate-[-12deg]"
            style={{ border: '3px solid #00ff88', color: '#00ff88' }}>
            <span className="text-2xl font-black tracking-wider">LIKE 💚</span>
          </div>
        )}
        {dragDir === 'left' && (
          <div className="absolute top-8 right-8 px-4 py-2 rounded-xl rotate-[12deg]"
            style={{ border: '3px solid #ff006e', color: '#ff006e' }}>
            <span className="text-2xl font-black tracking-wider">PASS ✕</span>
          </div>
        )}

        {/* Info */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
          <div className="flex items-end justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-black truncate" style={{ color: '#e0f2fe' }}>
                {profile.displayName}
              </h2>
              {profile.username && (
                <p className="text-xs font-bold" style={{ color: 'rgba(0,229,255,0.5)' }}>@{profile.username}</p>
              )}
              {profile.distance !== null && (
                <div className="flex items-center gap-1 mt-1">
                  <MapPin size={11} style={{ color: 'rgba(0,229,255,0.5)' }} />
                  <span className="text-[11px]" style={{ color: 'rgba(0,229,255,0.5)' }}>
                    {profile.distance < 1 ? '< 1 km away' : `${profile.distance} km away`}
                  </span>
                </div>
              )}
              {profile.bio && (
                <p className="text-sm mt-2 line-clamp-2" style={{ color: 'rgba(224,242,254,0.7)' }}>
                  {profile.bio}
                </p>
              )}
              {profile.interests.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {profile.interests.slice(0, 4).map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-lg text-[10px] font-bold"
                      style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MatchModal({ profile, onClose, conversationId }: {
  profile: MatchProfile
  onClose: () => void
  conversationId: string | null
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(4,4,13,0.92)', backdropFilter: 'blur(16px)' }}>
      <div className="w-full max-w-sm text-center space-y-5 animate-bounce-once">
        {/* Glow rings */}
        <div className="relative mx-auto w-32 h-32">
          <div className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{ background: 'radial-gradient(circle, #ff006e, transparent)' }} />
          <div className="absolute inset-2 rounded-full animate-pulse opacity-30"
            style={{ background: 'radial-gradient(circle, #ff006e, transparent)' }} />
          {profile.photoUrl ? (
            <img src={profile.photoUrl} alt="" className="absolute inset-4 rounded-full object-cover w-24 h-24"
              style={{ border: '3px solid #ff006e', boxShadow: '0 0 30px rgba(255,0,110,0.5)' }} />
          ) : (
            <div className="absolute inset-4 rounded-full flex items-center justify-center w-24 h-24"
              style={{ background: 'rgba(255,0,110,0.15)', border: '3px solid #ff006e' }}>
              <span className="text-4xl">💘</span>
            </div>
          )}
        </div>

        <div>
          <p className="text-[11px] font-black tracking-[0.3em] mb-1" style={{ color: 'rgba(255,0,110,0.7)' }}>
            IT&apos;S A MATCH
          </p>
          <h2 className="text-3xl font-black" style={{ color: '#ff006e', textShadow: '0 0 30px rgba(255,0,110,0.5)' }}>
            💘
          </h2>
          <p className="text-lg font-black mt-2" style={{ color: '#e0f2fe' }}>
            You and {profile.displayName} liked each other!
          </p>
        </div>

        <div className="flex gap-3">
          {conversationId && (
            <Link href="/messages" className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black tracking-widest"
              style={{ background: 'rgba(255,0,110,0.15)', border: '1px solid rgba(255,0,110,0.4)', color: '#ff006e' }}>
              <MessageCircle size={15} /> MESSAGE
            </Link>
          )}
          <button onClick={onClose} className="flex-1 py-3.5 rounded-xl text-sm font-black tracking-widest"
            style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}>
            KEEP SWIPING
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MatchPage() {
  const { dbUser, firebaseUser } = useAuth()
  const [deck, setDeck] = useState<MatchProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [swiping, setSwiping] = useState(false)
  const [matchedProfile, setMatchedProfile] = useState<MatchProfile | null>(null)
  const [matchConvoId, setMatchConvoId] = useState<string | null>(null)
  const [outOfCards, setOutOfCards] = useState(false)
  const [tab, setTab] = useState<'swipe' | 'matches'>('swipe')
  const [matches, setMatches] = useState<MatchProfile[]>([])
  const [matchesLoading, setMatchesLoading] = useState(false)

  async function getToken() {
    if (!firebaseUser) return ''
    try { return await firebaseUser.getIdToken() } catch { return '' }
  }

  async function loadDeck() {
    setLoading(true)
    setOutOfCards(false)
    const tok = await getToken()
    try {
      const r = await fetch(`${API_URL}/match/deck`, {
        headers: { Authorization: `Bearer ${tok}` },
      })
      const j = await r.json()
      setDeck(j.data ?? [])
      if ((j.data ?? []).length === 0) setOutOfCards(true)
    } catch {}
    setLoading(false)
  }

  async function loadMatches() {
    setMatchesLoading(true)
    const tok = await getToken()
    try {
      const r = await fetch(`${API_URL}/match/matches`, {
        headers: { Authorization: `Bearer ${tok}` },
      })
      const j = await r.json()
      setMatches(j.data ?? [])
    } catch {}
    setMatchesLoading(false)
  }

  useEffect(() => {
    if (dbUser && firebaseUser) { loadDeck(); loadMatches() }
  }, [dbUser?.id, firebaseUser])

  async function swipe(profile: MatchProfile, liked: boolean) {
    if (swiping) return
    setSwiping(true)
    setDeck((prev) => prev.filter((p) => p.id !== profile.id))
    if (deck.length <= 1) setOutOfCards(true)

    const tok = await getToken()
    try {
      const r = await fetch(`${API_URL}/match/swipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ toUserId: profile.id, liked }),
      })
      const j = await r.json()
      if (j.data?.match && liked) {
        setMatchedProfile(profile)
        setMatchConvoId(j.data?.conversationId ?? null)
        loadMatches()
      }
    } catch {}
    setSwiping(false)
  }

  if (!dbUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#04040d', paddingTop: 56 }}>
        <div className="text-center space-y-4 px-6">
          <div className="text-5xl">💘</div>
          <p className="text-xl font-black" style={{ color: '#ff006e' }}>Find Your Match</p>
          <p className="text-sm" style={{ color: 'rgba(224,242,254,0.4)' }}>Log in to start matching with people nearby</p>
          <a href="/login" className="inline-block px-6 py-3 rounded-xl text-sm font-black"
            style={{ background: 'rgba(255,0,110,0.12)', border: '1px solid rgba(255,0,110,0.35)', color: '#ff006e' }}>
            LOG IN
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#04040d', paddingTop: 56, paddingBottom: 80 }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-black" style={{ color: '#e0f2fe' }}>Match</h1>
            <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(255,0,110,0.5)' }}>
              PEOPLE NEARBY
            </p>
          </div>
          <Zap size={20} style={{ color: '#ff006e', filter: 'drop-shadow(0 0 8px rgba(255,0,110,0.6))' }} />
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(['swipe', 'matches'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2.5 rounded-xl text-[11px] font-black tracking-widest transition-all"
              style={{
                background: tab === t ? 'rgba(255,0,110,0.12)' : 'rgba(255,0,110,0.03)',
                border: `1px solid ${tab === t ? 'rgba(255,0,110,0.4)' : 'rgba(255,0,110,0.08)'}`,
                color: tab === t ? '#ff006e' : 'rgba(255,0,110,0.3)',
              }}>
              {t === 'swipe' ? '💘 SWIPE' : `❤️ MATCHES${matches.length > 0 ? ` (${matches.length})` : ''}`}
            </button>
          ))}
        </div>
      </div>

      {/* Swipe tab */}
      {tab === 'swipe' && (
        <div className="max-w-lg mx-auto px-4">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="w-10 h-10 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(255,0,110,0.1)', borderTopColor: '#ff006e' }} />
            </div>
          ) : outOfCards || deck.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
              <div className="text-6xl">🎉</div>
              <p className="text-lg font-black" style={{ color: '#e0f2fe' }}>You&apos;ve seen everyone nearby!</p>
              <p className="text-sm" style={{ color: 'rgba(224,242,254,0.4)' }}>Check back later for new people</p>
              <button onClick={loadDeck}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black"
                style={{ background: 'rgba(255,0,110,0.1)', border: '1px solid rgba(255,0,110,0.3)', color: '#ff006e' }}>
                <RefreshCw size={14} /> REFRESH
              </button>
            </div>
          ) : (
            <>
              {/* Card stack */}
              <div className="relative mx-auto" style={{ height: 480, maxWidth: 360 }}>
                {deck.slice(0, 2).map((profile, i) => (
                  <SwipeCard
                    key={profile.id}
                    profile={profile}
                    isTop={i === 0}
                    onLike={() => swipe(profile, true)}
                    onPass={() => swipe(profile, false)}
                  />
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-center gap-6 mt-6">
                <button
                  onClick={() => deck[0] && swipe(deck[0], false)}
                  disabled={swiping || deck.length === 0}
                  className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: 'rgba(255,0,110,0.08)', border: '2px solid rgba(255,0,110,0.3)', boxShadow: '0 0 20px rgba(255,0,110,0.1)' }}>
                  <X size={24} style={{ color: '#ff006e' }} />
                </button>

                <button
                  onClick={() => deck[0] && swipe(deck[0], true)}
                  disabled={swiping || deck.length === 0}
                  className="w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: 'rgba(255,0,110,0.15)', border: '2px solid rgba(255,0,110,0.5)', boxShadow: '0 0 30px rgba(255,0,110,0.25)' }}>
                  <Heart size={30} fill="rgba(255,0,110,0.4)" style={{ color: '#ff006e' }} />
                </button>

                <button
                  onClick={() => deck[0] && swipe(deck[0], true)}
                  disabled={swiping || deck.length === 0}
                  className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: 'rgba(255,214,0,0.08)', border: '2px solid rgba(255,214,0,0.3)', boxShadow: '0 0 20px rgba(255,214,0,0.1)' }}>
                  <Star size={22} style={{ color: '#ffd600' }} />
                </button>
              </div>

              <p className="text-center text-[10px] mt-3 font-bold tracking-widest" style={{ color: 'rgba(224,242,254,0.2)' }}>
                SWIPE OR TAP BUTTONS · {deck.length} LEFT
              </p>
            </>
          )}
        </div>
      )}

      {/* Matches tab */}
      {tab === 'matches' && (
        <div className="max-w-lg mx-auto px-4">
          {matchesLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(255,0,110,0.1)', borderTopColor: '#ff006e' }} />
            </div>
          ) : matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
              <div className="text-5xl">💔</div>
              <p className="text-lg font-black" style={{ color: '#e0f2fe' }}>No matches yet</p>
              <p className="text-sm" style={{ color: 'rgba(224,242,254,0.4)' }}>Start swiping to find your match!</p>
              <button onClick={() => setTab('swipe')}
                className="px-5 py-2.5 rounded-xl text-sm font-black"
                style={{ background: 'rgba(255,0,110,0.1)', border: '1px solid rgba(255,0,110,0.3)', color: '#ff006e' }}>
                START SWIPING
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 pt-2">
              {matches.map((m) => (
                <Link key={m.id} href={`/profile/${m.username ?? m.id}`}
                  className="relative rounded-2xl overflow-hidden aspect-[3/4]"
                  style={{ background: '#0a0a1a', border: '1px solid rgba(255,0,110,0.2)' }}>
                  {m.photoUrl ? (
                    <img src={m.photoUrl} alt={m.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"
                      style={{ background: 'rgba(255,0,110,0.06)' }}>
                      <span className="text-4xl opacity-30">👤</span>
                    </div>
                  )}
                  <div className="absolute inset-0"
                    style={{ background: 'linear-gradient(to top, rgba(4,4,13,0.9) 0%, transparent 60%)' }} />
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-sm font-black truncate" style={{ color: '#e0f2fe' }}>{m.displayName}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Heart size={9} fill="#ff006e" style={{ color: '#ff006e' }} />
                      <span className="text-[9px] font-bold" style={{ color: 'rgba(255,0,110,0.7)' }}>MATCHED</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Match modal */}
      {matchedProfile && (
        <MatchModal
          profile={matchedProfile}
          conversationId={matchConvoId}
          onClose={() => { setMatchedProfile(null); setMatchConvoId(null) }}
        />
      )}
    </div>
  )
}
