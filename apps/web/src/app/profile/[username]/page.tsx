'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, UserPlus, UserCheck, MessageCircle,
  Calendar, MapPin, Users, Star, ShieldCheck, Loader2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { API_URL } from '@/lib/api'
import { auth } from '@/lib/firebase'

async function getToken() {
  try { return (await auth.currentUser?.getIdToken()) ?? '' } catch { return '' }
}

const TYPE_COLORS: Record<string, string> = {
  HOME_PARTY: '#ff006e', CLUB_NIGHT: '#00e5ff', CONCERT: '#3d5afe', PUB_NIGHT: '#f59e0b',
}
const TYPE_LABELS: Record<string, string> = {
  HOME_PARTY: 'HOUSE PARTY', CLUB_NIGHT: 'CLUB NIGHT', CONCERT: 'CONCERT', PUB_NIGHT: 'PUB NIGHT',
}

interface ProfileEvent {
  id: string
  name: string
  type: string
  startsAt: string
  neighbourhood: string
  coverImageUrl?: string | null
  price: number
}

interface PublicProfile {
  id: string
  username: string
  displayName: string
  photoUrl?: string | null
  bio?: string | null
  createdAt: string
  isAdmin: boolean
  followersCount: number
  followingCount: number
  isFollowing: boolean
  isMe: boolean
  events: ProfileEvent[]
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`
  return `${Math.floor(s / 2592000)}mo ago`
}

export default function PublicProfilePage() {
  const { username } = useParams() as { username: string }
  const router = useRouter()
  const { dbUser } = useAuth()

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [following, setFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [dmLoading, setDmLoading] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const tok = await getToken()
        const headers: Record<string, string> = {}
        if (tok) headers['Authorization'] = `Bearer ${tok}`
        const res = await fetch(`${API_URL}/users/${encodeURIComponent(username)}`, { headers })
        if (res.status === 404) { setNotFound(true); return }
        const json = await res.json()
        const data: PublicProfile = json.data
        setProfile(data)
        setFollowing(data.isFollowing)
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    if (username) load()
  }, [username])

  async function toggleFollow() {
    if (!profile || followLoading || !dbUser) return
    setFollowLoading(true)
    try {
      const tok = await getToken()
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }
      if (following) {
        await fetch(`${API_URL}/follow/${profile.id}`, { method: 'DELETE', headers })
        setFollowing(false)
        setProfile((p) => p ? { ...p, followersCount: p.followersCount - 1 } : p)
      } else {
        await fetch(`${API_URL}/follow/${profile.id}`, { method: 'POST', headers })
        setFollowing(true)
        setProfile((p) => p ? { ...p, followersCount: p.followersCount + 1 } : p)
      }
    } catch {}
    finally { setFollowLoading(false) }
  }

  async function openDm() {
    if (!profile || dmLoading || !dbUser) return
    setDmLoading(true)
    try {
      const tok = await getToken()
      await fetch(`${API_URL}/dm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ recipientId: profile.id }),
      })
      router.push('/messages')
    } catch {
      router.push('/messages')
    } finally {
      setDmLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#04040d', paddingTop: 56 }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'rgba(0,229,255,0.4)' }} />
      </div>
    )
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#04040d', paddingTop: 56 }}>
        <Users size={36} style={{ color: 'rgba(0,229,255,0.2)' }} />
        <p className="text-sm font-black tracking-widest" style={{ color: 'rgba(0,229,255,0.4)' }}>USER NOT FOUND</p>
        <p className="text-xs" style={{ color: 'rgba(224,242,254,0.25)' }}>@{username} doesn't exist or has been removed</p>
        <button onClick={() => router.back()} className="text-xs font-bold px-4 py-2 rounded-xl mt-2"
          style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}>
          ← GO BACK
        </button>
      </div>
    )
  }

  const initials = profile.displayName.slice(0, 2).toUpperCase()

  return (
    <div className="min-h-screen" style={{ background: '#04040d', paddingTop: 56, paddingBottom: 88 }}>

      {/* ── Header bar ── */}
      <div className="flex items-center gap-3 px-4 py-3"
        style={{ background: 'rgba(4,4,13,0.9)', borderBottom: '1px solid rgba(0,229,255,0.08)', backdropFilter: 'blur(12px)' }}>
        <button onClick={() => router.back()} className="p-1.5 rounded-lg"
          style={{ color: 'rgba(0,229,255,0.6)', border: '1px solid rgba(0,229,255,0.15)', background: 'rgba(0,229,255,0.04)' }}>
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black truncate" style={{ color: '#e0f2fe' }}>{profile.displayName}</p>
          <p className="text-[10px]" style={{ color: 'rgba(0,229,255,0.4)' }}>@{profile.username}</p>
        </div>
        {profile.isAdmin && (
          <span className="flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded"
            style={{ color: '#ffd600', background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.25)' }}>
            <ShieldCheck size={10} /> OFFICIAL
          </span>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* ── Avatar + stats ── */}
        <div className="flex items-start gap-4">
          <div className="shrink-0">
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt={profile.displayName}
                className="w-20 h-20 rounded-2xl object-cover"
                style={{ border: '2px solid rgba(0,229,255,0.25)', boxShadow: '0 0 20px rgba(0,229,255,0.1)' }} />
            ) : (
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black"
                style={{ background: 'rgba(0,229,255,0.08)', border: '2px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}>
                {initials}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black leading-tight" style={{ color: '#e0f2fe' }}>{profile.displayName}</h1>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(0,229,255,0.5)' }}>@{profile.username}</p>

            {/* Follower stats */}
            <div className="flex gap-4 mt-3">
              <div className="text-center">
                <p className="text-base font-black" style={{ color: '#e0f2fe' }}>{profile.followersCount}</p>
                <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(224,242,254,0.35)' }}>FOLLOWERS</p>
              </div>
              <div className="text-center">
                <p className="text-base font-black" style={{ color: '#e0f2fe' }}>{profile.followingCount}</p>
                <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(224,242,254,0.35)' }}>FOLLOWING</p>
              </div>
              <div className="text-center">
                <p className="text-base font-black" style={{ color: '#e0f2fe' }}>{profile.events.length}</p>
                <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(224,242,254,0.35)' }}>EVENTS</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bio ── */}
        {profile.bio && (
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(224,242,254,0.65)' }}>{profile.bio}</p>
        )}

        {/* ── Member since ── */}
        <p className="text-[10px] font-bold" style={{ color: 'rgba(224,242,254,0.2)' }}>
          MEMBER SINCE {new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase()}
        </p>

        {/* ── Action buttons ── */}
        {!profile.isMe && (
          <div className="flex gap-2">
            {dbUser ? (
              <button
                onClick={toggleFollow}
                disabled={followLoading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all disabled:opacity-60"
                style={{
                  background: following ? 'rgba(0,229,255,0.06)' : 'rgba(0,229,255,0.12)',
                  border: `1px solid ${following ? 'rgba(0,229,255,0.2)' : 'rgba(0,229,255,0.4)'}`,
                  color: following ? 'rgba(0,229,255,0.5)' : '#00e5ff',
                }}
              >
                {following ? <UserCheck size={14} /> : <UserPlus size={14} />}
                {followLoading ? '...' : following ? 'FOLLOWING' : 'FOLLOW'}
              </button>
            ) : (
              <Link href="/login" className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black tracking-widest"
                style={{ background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.4)', color: '#00e5ff' }}>
                <UserPlus size={14} /> FOLLOW
              </Link>
            )}

            {dbUser ? (
              <button
                onClick={openDm}
                disabled={dmLoading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all disabled:opacity-60"
                style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)', color: 'rgba(0,229,255,0.7)' }}
              >
                <MessageCircle size={14} />
                {dmLoading ? '...' : 'MESSAGE'}
              </button>
            ) : (
              <Link href="/login" className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black tracking-widest"
                style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)', color: 'rgba(0,229,255,0.7)' }}>
                <MessageCircle size={14} /> MESSAGE
              </Link>
            )}
          </div>
        )}

        {profile.isMe && (
          <Link href="/profile" className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black tracking-widest w-full"
            style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.25)', color: '#ffd600' }}>
            ✏️ EDIT MY PROFILE
          </Link>
        )}

        {/* ── Events ── */}
        <div>
          <p className="text-[10px] font-black tracking-widest mb-3" style={{ color: 'rgba(0,229,255,0.4)' }}>
            EVENTS {profile.events.length > 0 ? `— ${profile.events.length}` : ''}
          </p>

          {profile.events.length === 0 ? (
            <div className="py-10 rounded-xl flex flex-col items-center gap-2"
              style={{ background: 'rgba(0,229,255,0.02)', border: '1px solid rgba(0,229,255,0.06)' }}>
              <Calendar size={24} style={{ color: 'rgba(0,229,255,0.15)' }} />
              <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.4)' }}>NO EVENTS YET</p>
            </div>
          ) : (
            <div className="space-y-2">
              {profile.events.map((ev) => {
                const color = TYPE_COLORS[ev.type] ?? '#00e5ff'
                return (
                  <Link key={ev.id} href={`/events/${ev.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl transition-all"
                    style={{ background: 'rgba(7,7,26,0.8)', border: `1px solid ${color}15` }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = `${color}35` }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = `${color}15` }}
                  >
                    {ev.coverImageUrl ? (
                      <img src={ev.coverImageUrl} alt={ev.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
                        <Calendar size={18} style={{ color }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{ev.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ color, background: `${color}12`, border: `1px solid ${color}25` }}>
                          {TYPE_LABELS[ev.type] ?? ev.type}
                        </span>
                        <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.35)' }}>
                          <MapPin size={8} className="inline mr-0.5" />{ev.neighbourhood}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold" style={{ color: ev.price === 0 ? '#00ff88' : '#e0f2fe' }}>
                        {ev.price === 0 ? 'FREE' : `£${ev.price.toFixed(2)}`}
                      </p>
                      <p className="text-[9px] mt-0.5" style={{ color: 'rgba(224,242,254,0.3)' }}>
                        {timeAgo(ev.startsAt)}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
