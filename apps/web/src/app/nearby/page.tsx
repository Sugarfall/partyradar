'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import Link from 'next/link'
import { MapPin, Users, RefreshCw, Heart, X, MessageCircle, Star } from 'lucide-react'

// ─── Shared types ─────────────────────────────────────────────────────────────

interface NearbyUser {
  id: string
  displayName: string
  username: string
  photoUrl?: string | null
  bio?: string | null
  gender?: string | null
  distanceM: number
  lastSeenAt?: string
  isFollowing: boolean
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function distanceLabel(m: number) {
  if (m < 100) return 'Here'
  if (m < 1000) return `${m}m`
  return `${(m / 1000).toFixed(1)}km`
}

// ─── Swipe card ───────────────────────────────────────────────────────────────

function SwipeCard({ profile, onLike, onPass, isTop }: {
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
    if (dx > 80) { onLike() }
    else if (dx < -80) { onPass() }
    else { setDragOffset(0); setDragDir(null) }
  }

  const rotation = dragOffset * 0.08

  return (
    <div
      ref={cardRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'absolute', inset: 0,
        transform: isTop
          ? `translateX(${dragOffset}px) rotate(${rotation}deg)`
          : 'scale(0.96) translateY(8px)',
        transition: isDragging.current ? 'none' : 'transform 0.3s ease',
        cursor: isTop ? 'grab' : 'default',
        touchAction: 'none', userSelect: 'none',
        zIndex: isTop ? 2 : 1,
      }}
    >
      <div className="w-full h-full rounded-3xl overflow-hidden relative"
        style={{
          background: '#0a0a1a',
          border: '1px solid rgba(var(--accent-rgb),0.12)',
          boxShadow: isTop ? '0 20px 60px rgba(0,0,0,0.6)' : '0 10px 30px rgba(0,0,0,0.4)',
        }}>
        {profile.photoUrl
          ? <img src={profile.photoUrl} alt={profile.displayName} className="w-full h-full object-cover" draggable={false} />
          : <div className="w-full h-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.06), rgba(255,0,110,0.06))' }}>
              <div className="text-7xl opacity-20">👤</div>
            </div>
        }

        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(4,4,13,0.95) 0%, rgba(4,4,13,0.3) 50%, transparent 100%)' }} />

        {dragDir === 'right' && (
          <div className="absolute top-8 left-8 px-4 py-2 rounded-xl rotate-[-12deg]"
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

        <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
          <h2 className="text-2xl font-black truncate" style={{ color: '#e0f2fe' }}>{profile.displayName}</h2>
          {profile.username && (
            <p className="text-xs font-bold" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>@{profile.username}</p>
          )}
          {profile.distance !== null && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin size={11} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
              <span className="text-[11px]" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
                {profile.distance < 1 ? '< 1 km away' : `${profile.distance} km away`}
              </span>
            </div>
          )}
          {profile.bio && (
            <p className="text-sm mt-2 line-clamp-2" style={{ color: 'rgba(224,242,254,0.7)' }}>{profile.bio}</p>
          )}
          {profile.interests.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {profile.interests.slice(0, 4).map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded-lg text-[10px] font-bold"
                  style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Match modal ──────────────────────────────────────────────────────────────

function MatchModal({ profile, conversationId, onClose }: {
  profile: MatchProfile
  conversationId: string | null
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(4,4,13,0.92)', backdropFilter: 'blur(16px)' }}>
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="relative mx-auto w-32 h-32">
          <div className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{ background: 'radial-gradient(circle, #ff006e, transparent)' }} />
          <div className="absolute inset-2 rounded-full animate-pulse opacity-30"
            style={{ background: 'radial-gradient(circle, #ff006e, transparent)' }} />
          {profile.photoUrl
            ? <img src={profile.photoUrl} alt="" className="absolute inset-4 rounded-full object-cover w-24 h-24"
                style={{ border: '3px solid #ff006e', boxShadow: '0 0 30px rgba(255,0,110,0.5)' }} />
            : <div className="absolute inset-4 rounded-full flex items-center justify-center w-24 h-24"
                style={{ background: 'rgba(255,0,110,0.15)', border: '3px solid #ff006e' }}>
                <span className="text-4xl">💘</span>
              </div>
          }
        </div>
        <div>
          <p className="text-[11px] font-black tracking-[0.3em] mb-1" style={{ color: 'rgba(255,0,110,0.7)' }}>IT&apos;S A MATCH</p>
          <div className="text-3xl">💘</div>
          <p className="text-lg font-black mt-2" style={{ color: '#e0f2fe' }}>
            You and {profile.displayName} liked each other!
          </p>
        </div>
        <div className="flex gap-3">
          {conversationId && (
            <Link href="/messages"
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black tracking-widest"
              style={{ background: 'rgba(255,0,110,0.15)', border: '1px solid rgba(255,0,110,0.4)', color: '#ff006e' }}>
              <MessageCircle size={15} /> MESSAGE
            </Link>
          )}
          <button onClick={onClose}
            className="flex-1 py-3.5 rounded-xl text-sm font-black tracking-widest"
            style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>
            KEEP SWIPING
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NearbyPage() {
  const { dbUser } = useAuth()
  const [tab, setTab] = useState<'nearby' | 'match'>('nearby')

  // ── Nearby state ──────────────────────────────────────────────────────────
  const [people, setPeople] = useState<NearbyUser[]>([])
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [locationDenied, setLocationDenied] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [following, setFollowing] = useState<Set<string>>(new Set())

  function updateLocation(lat: number, lng: number) {
    api.put('/nearby/location', { lat, lng }).catch(() => {})
  }

  const fetchPeople = useCallback(async (lat: number, lng: number) => {
    setNearbyLoading(true)
    try {
      const res = await api.get<{ data: NearbyUser[] }>(`/nearby/people?lat=${lat}&lng=${lng}`)
      if (Array.isArray(res?.data)) setPeople(res.data)
    } catch {}
    finally { setNearbyLoading(false) }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) { setLocationDenied(true); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setCoords({ lat, lng })
        updateLocation(lat, lng)
        fetchPeople(lat, lng)
      },
      () => setLocationDenied(true),
      { timeout: 8000 },
    )
  }, [])

  async function toggleFollow(userId: string, currentlyFollowing: boolean) {
    // Bug 1 fix: optimistically flip isFollowing directly in the people array
    // (the old delta-Set approach was a no-op when unfollowing already-followed people)
    setPeople(prev => prev.map(p => p.id === userId ? { ...p, isFollowing: !currentlyFollowing } : p))
    if (currentlyFollowing) {
      api.delete(`/follow/${userId}`).catch(() => {
        // Revert on error
        setPeople(prev => prev.map(p => p.id === userId ? { ...p, isFollowing: true } : p))
      })
    } else {
      api.post(`/follow/${userId}`, {}).catch(() => {
        setPeople(prev => prev.map(p => p.id === userId ? { ...p, isFollowing: false } : p))
      })
    }
  }

  // ── Match state ───────────────────────────────────────────────────────────
  const [deck, setDeck] = useState<MatchProfile[]>([])
  const [deckLoading, setDeckLoading] = useState(false)
  const [swiping, setSwiping] = useState(false)
  const [outOfCards, setOutOfCards] = useState(false)
  const [matchedProfile, setMatchedProfile] = useState<MatchProfile | null>(null)
  const [matchConvoId, setMatchConvoId] = useState<string | null>(null)
  const [matchTab, setMatchTab] = useState<'swipe' | 'matches'>('swipe')
  const [matches, setMatches] = useState<MatchProfile[]>([])
  const [matchesLoading, setMatchesLoading] = useState(false)
  const deckLoadedRef = useRef(false)

  async function loadDeck() {
    setDeckLoading(true)
    setOutOfCards(false)
    try {
      const j = await api.get<{ data: MatchProfile[] }>('/match/deck')
      setDeck(j?.data ?? [])
      if ((j?.data ?? []).length === 0) setOutOfCards(true)
    } catch {}
    setDeckLoading(false)
  }

  async function loadMatches() {
    setMatchesLoading(true)
    try {
      const j = await api.get<{ data: MatchProfile[] }>('/match/matches')
      setMatches(j?.data ?? [])
    } catch {}
    setMatchesLoading(false)
  }

  // Lazy-load match deck only when the tab is first opened
  useEffect(() => {
    if (tab === 'match' && dbUser && !deckLoadedRef.current) {
      deckLoadedRef.current = true
      loadDeck()
      loadMatches()
    }
  }, [tab, dbUser?.id])

  async function swipe(profile: MatchProfile, liked: boolean, superLike = false) {
    if (swiping) return
    setSwiping(true)
    // Bug 3 fix: check remaining count inside the updater so we don't read stale deck.length
    setDeck(prev => {
      const next = prev.filter(p => p.id !== profile.id)
      if (next.length === 0) setOutOfCards(true)
      return next
    })
    try {
      const j = await api.post<{ data: { match: boolean; conversationId?: string } }>('/match/swipe', { toUserId: profile.id, liked, superLike })
      if (j?.data?.match && liked) {
        setMatchedProfile(profile)
        setMatchConvoId(j.data?.conversationId ?? null)
        loadMatches()
      }
    } catch {}
    setSwiping(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pb-24" style={{ background: '#07071a', paddingTop: 56 }}>
      {/* Header + tab switcher */}
      <div className="sticky top-14 z-10 px-4 pt-4 pb-3"
        style={{ background: 'rgba(7,7,26,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(var(--accent-rgb),0.08)' }}>
        <div className="max-w-lg mx-auto">
          <div className="flex gap-2">
            <button onClick={() => setTab('nearby')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black tracking-widest transition-all"
              style={{
                background: tab === 'nearby' ? 'rgba(var(--accent-rgb),0.1)' : 'rgba(var(--accent-rgb),0.03)',
                border: `1px solid ${tab === 'nearby' ? 'rgba(var(--accent-rgb),0.35)' : 'rgba(var(--accent-rgb),0.08)'}`,
                color: tab === 'nearby' ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.3)',
              }}>
              <MapPin size={12} /> NEARBY
            </button>
            <button onClick={() => setTab('match')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black tracking-widest transition-all"
              style={{
                background: tab === 'match' ? 'rgba(255,0,110,0.1)' : 'rgba(255,0,110,0.03)',
                border: `1px solid ${tab === 'match' ? 'rgba(255,0,110,0.35)' : 'rgba(255,0,110,0.08)'}`,
                color: tab === 'match' ? '#ff006e' : 'rgba(255,0,110,0.3)',
              }}>
              <Heart size={12} fill={tab === 'match' ? 'rgba(255,0,110,0.3)' : 'none'} /> MATCH
            </button>
          </div>
        </div>
      </div>

      {/* ── NEARBY tab ────────────────────────────────────────────────────── */}
      {tab === 'nearby' && (
        <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
              {coords ? 'People within 2km · live' : locationDenied ? 'Location access denied' : 'Getting your location…'}
            </p>
            <button onClick={() => coords && fetchPeople(coords.lat, coords.lng)} disabled={nearbyLoading || !coords}
              className="p-2 rounded-xl" style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.12)', color: nearbyLoading ? 'rgba(var(--accent-rgb),0.2)' : 'var(--accent)' }}>
              <RefreshCw size={14} className={nearbyLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {locationDenied && (
            <div className="py-16 text-center space-y-3">
              <MapPin size={36} style={{ color: 'rgba(var(--accent-rgb),0.2)', margin: '0 auto' }} />
              <p className="text-sm font-black" style={{ color: 'rgba(224,242,254,0.5)' }}>Location needed</p>
              <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>Enable location access to see who&apos;s nearby</p>
            </div>
          )}
          {!locationDenied && nearbyLoading && people.length === 0 && (
            <div className="py-16 flex justify-center">
              <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
            </div>
          )}
          {!locationDenied && !nearbyLoading && people.length === 0 && coords && (
            <div className="py-16 text-center space-y-3">
              <Users size={36} style={{ color: 'rgba(var(--accent-rgb),0.15)', margin: '0 auto' }} />
              <p className="text-sm font-black" style={{ color: 'rgba(224,242,254,0.4)' }}>No one nearby yet</p>
              <p className="text-xs" style={{ color: 'rgba(224,242,254,0.25)' }}>Check back when more people are out</p>
            </div>
          )}
          {!dbUser && people.length > 0 && (
            <div className="px-4 py-3 rounded-xl text-center text-xs"
              style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.1)', color: 'rgba(224,242,254,0.4)' }}>
              <Link href="/login" className="font-black" style={{ color: 'var(--accent)' }}>Log in</Link> to follow people
            </div>
          )}
          {people.map((person) => {
            const isFollowing = person.isFollowing
            return (
              <div key={person.id} className="p-4 rounded-2xl flex items-center gap-3"
                style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
                <Link href={`/profile/${person.username}`} className="shrink-0">
                  {person.photoUrl
                    ? <img src={person.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
                    : <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg"
                        style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.25)', color: 'var(--accent)' }}>
                        {person.displayName[0]?.toUpperCase()}
                      </div>
                  }
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${person.username}`}>
                    <p className="font-black text-sm truncate" style={{ color: '#e0f2fe' }}>{person.displayName}</p>
                    <p className="text-[11px] truncate" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>@{person.username}</p>
                  </Link>
                  {person.bio && <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(224,242,254,0.35)' }}>{person.bio}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="flex items-center gap-1 text-[10px] font-bold" style={{ color: 'rgba(0,255,136,0.7)' }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00ff88' }} />
                    {distanceLabel(person.distanceM)}
                  </div>
                  {dbUser && (
                    <button onClick={() => toggleFollow(person.id, isFollowing)}
                      className="px-3 py-1 rounded-lg text-[10px] font-black"
                      style={isFollowing
                        ? { background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'rgba(var(--accent-rgb),0.4)' }
                        : { background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.35)', color: 'var(--accent)' }}>
                      {isFollowing ? 'FOLLOWING' : '+ FOLLOW'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── MATCH tab ─────────────────────────────────────────────────────── */}
      {tab === 'match' && (
        <div>
          {!dbUser ? (
            <div className="flex flex-col items-center justify-center h-96 gap-4 text-center px-6">
              <div className="text-5xl">💘</div>
              <p className="text-xl font-black" style={{ color: '#ff006e' }}>Find Your Match</p>
              <p className="text-sm" style={{ color: 'rgba(224,242,254,0.4)' }}>Log in to start matching with people nearby</p>
              <Link href="/login" className="px-6 py-3 rounded-xl text-sm font-black"
                style={{ background: 'rgba(255,0,110,0.12)', border: '1px solid rgba(255,0,110,0.35)', color: '#ff006e' }}>
                LOG IN
              </Link>
            </div>
          ) : (
            <div className="max-w-lg mx-auto px-4 pt-3">
              {/* Match sub-tabs */}
              <div className="flex gap-2 mb-4">
                {(['swipe', 'matches'] as const).map(t => (
                  <button key={t} onClick={() => setMatchTab(t)}
                    className="flex-1 py-2.5 rounded-xl text-[11px] font-black tracking-widest transition-all"
                    style={{
                      background: matchTab === t ? 'rgba(255,0,110,0.12)' : 'rgba(255,0,110,0.03)',
                      border: `1px solid ${matchTab === t ? 'rgba(255,0,110,0.4)' : 'rgba(255,0,110,0.08)'}`,
                      color: matchTab === t ? '#ff006e' : 'rgba(255,0,110,0.3)',
                    }}>
                    {t === 'swipe' ? '💘 SWIPE' : `❤️ MATCHES${matches.length > 0 ? ` (${matches.length})` : ''}`}
                  </button>
                ))}
              </div>

              {/* Swipe sub-tab */}
              {matchTab === 'swipe' && (
                <>
                  {deckLoading ? (
                    <div className="flex items-center justify-center h-96">
                      <div className="w-10 h-10 rounded-full border-2 animate-spin"
                        style={{ borderColor: 'rgba(255,0,110,0.1)', borderTopColor: '#ff006e' }} />
                    </div>
                  ) : outOfCards || deck.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
                      <div className="text-6xl">🎉</div>
                      <p className="text-lg font-black" style={{ color: '#e0f2fe' }}>You&apos;ve seen everyone nearby!</p>
                      <p className="text-sm" style={{ color: 'rgba(224,242,254,0.4)' }}>Check back later for new people</p>
                      <button onClick={() => { deckLoadedRef.current = false; loadDeck() }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black"
                        style={{ background: 'rgba(255,0,110,0.1)', border: '1px solid rgba(255,0,110,0.3)', color: '#ff006e' }}>
                        <RefreshCw size={14} /> REFRESH
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative mx-auto" style={{ height: 460, maxWidth: 360 }}>
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
                      <div className="flex items-center justify-center gap-6 mt-6">
                        <button onClick={() => deck[0] && swipe(deck[0], false)}
                          disabled={swiping || deck.length === 0}
                          className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                          style={{ background: 'rgba(255,0,110,0.08)', border: '2px solid rgba(255,0,110,0.3)', boxShadow: '0 0 20px rgba(255,0,110,0.1)' }}>
                          <X size={24} style={{ color: '#ff006e' }} />
                        </button>
                        <button onClick={() => deck[0] && swipe(deck[0], true)}
                          disabled={swiping || deck.length === 0}
                          className="w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                          style={{ background: 'rgba(255,0,110,0.15)', border: '2px solid rgba(255,0,110,0.5)', boxShadow: '0 0 30px rgba(255,0,110,0.25)' }}>
                          <Heart size={30} fill="rgba(255,0,110,0.4)" style={{ color: '#ff006e' }} />
                        </button>
                        <button onClick={() => deck[0] && swipe(deck[0], true, true)}
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
                </>
              )}

              {/* Matches sub-tab */}
              {matchTab === 'matches' && (
                <>
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
                      <button onClick={() => setMatchTab('swipe')}
                        className="px-5 py-2.5 rounded-xl text-sm font-black"
                        style={{ background: 'rgba(255,0,110,0.1)', border: '1px solid rgba(255,0,110,0.3)', color: '#ff006e' }}>
                        START SWIPING
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {matches.map(m => (
                        <Link key={m.id} href={`/profile/${m.username ?? m.id}`}
                          className="relative rounded-2xl overflow-hidden aspect-[3/4]"
                          style={{ background: '#0a0a1a', border: '1px solid rgba(255,0,110,0.2)' }}>
                          {m.photoUrl
                            ? <img src={m.photoUrl} alt={m.displayName} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"
                                style={{ background: 'rgba(255,0,110,0.06)' }}>
                                <span className="text-4xl opacity-30">👤</span>
                              </div>
                          }
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
                </>
              )}
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
