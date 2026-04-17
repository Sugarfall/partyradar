'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { API_URL } from '@/lib/api'
import Link from 'next/link'
import { MapPin, Users, RefreshCw } from 'lucide-react'

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

function distanceLabel(m: number) {
  if (m < 100) return 'Here'
  if (m < 1000) return `${m}m`
  return `${(m / 1000).toFixed(1)}km`
}

export default function NearbyPage() {
  const { dbUser, firebaseUser } = useAuth()
  const [people, setPeople] = useState<NearbyUser[]>([])
  const [loading, setLoading] = useState(false)
  const [locationDenied, setLocationDenied] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [following, setFollowing] = useState<Set<string>>(new Set())

  async function updateLocation(lat: number, lng: number) {
    if (!firebaseUser) return
    const token = await firebaseUser.getIdToken().catch(() => null)
    if (!token) return
    fetch(`${API_URL}/nearby/location`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lat, lng }),
    }).catch(() => {})
  }

  const fetchPeople = useCallback(async (lat: number, lng: number) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/nearby/people?lat=${lat}&lng=${lng}`)
      const json = await res.json()
      if (Array.isArray(json.data)) setPeople(json.data)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) { setLocationDenied(true); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setCoords({ lat, lng })
        updateLocation(lat, lng)
        fetchPeople(lat, lng)
      },
      () => setLocationDenied(true),
      { timeout: 8000 }
    )
  }, [])

  async function toggleFollow(userId: string, currentlyFollowing: boolean) {
    if (!firebaseUser) return
    const token = await firebaseUser.getIdToken().catch(() => null)
    if (!token) return
    setFollowing(prev => {
      const next = new Set(prev)
      currentlyFollowing ? next.delete(userId) : next.add(userId)
      return next
    })
    fetch(`${API_URL}/follow/${userId}`, {
      method: currentlyFollowing ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: '#07071a' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-4"
        style={{ background: 'rgba(7,7,26,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black tracking-tight" style={{ color: '#e0f2fe' }}>Nearby</h1>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(0,229,255,0.4)' }}>
              {coords ? 'People within 2km · live' : locationDenied ? 'Location access denied' : 'Getting your location…'}
            </p>
          </div>
          <button onClick={() => coords && fetchPeople(coords.lat, coords.lng)} disabled={loading || !coords}
            className="p-2.5 rounded-xl" style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.12)', color: loading ? 'rgba(0,229,255,0.2)' : '#00e5ff' }}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
        {locationDenied && (
          <div className="py-16 text-center space-y-3">
            <MapPin size={36} style={{ color: 'rgba(0,229,255,0.2)', margin: '0 auto' }} />
            <p className="text-sm font-black" style={{ color: 'rgba(224,242,254,0.5)' }}>Location needed</p>
            <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>Enable location access to see who&apos;s nearby</p>
          </div>
        )}
        {!locationDenied && loading && people.length === 0 && (
          <div className="py-16 flex justify-center">
            <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
          </div>
        )}
        {!locationDenied && !loading && people.length === 0 && coords && (
          <div className="py-16 text-center space-y-3">
            <Users size={36} style={{ color: 'rgba(0,229,255,0.15)', margin: '0 auto' }} />
            <p className="text-sm font-black" style={{ color: 'rgba(224,242,254,0.4)' }}>No one nearby yet</p>
            <p className="text-xs" style={{ color: 'rgba(224,242,254,0.25)' }}>Check back when more people are out</p>
          </div>
        )}
        {!dbUser && people.length > 0 && (
          <div className="px-4 py-3 rounded-xl text-center text-xs mb-2"
            style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.1)', color: 'rgba(224,242,254,0.4)' }}>
            <Link href="/login" className="font-black" style={{ color: '#00e5ff' }}>Log in</Link> to follow people
          </div>
        )}
        {people.map((person) => {
          const isFollowing = following.has(person.id) ? !person.isFollowing : person.isFollowing
          return (
            <div key={person.id} className="p-4 rounded-2xl flex items-center gap-3"
              style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(0,229,255,0.08)' }}>
              <Link href={`/profile/${person.username}`} className="shrink-0">
                {person.photoUrl
                  ? <img src={person.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
                  : <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg"
                      style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.25)', color: '#00e5ff' }}>
                      {person.displayName[0]?.toUpperCase()}
                    </div>
                }
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/profile/${person.username}`}>
                  <p className="font-black text-sm truncate" style={{ color: '#e0f2fe' }}>{person.displayName}</p>
                  <p className="text-[11px] truncate" style={{ color: 'rgba(0,229,255,0.4)' }}>@{person.username}</p>
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
                      ? { background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', color: 'rgba(0,229,255,0.4)' }
                      : { background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.35)', color: '#00e5ff' }}>
                    {isFollowing ? 'FOLLOWING' : '+ FOLLOW'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
