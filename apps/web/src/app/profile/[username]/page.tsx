'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, UserPlus, UserCheck, MessageCircle,
  Calendar, MapPin, Users, ShieldCheck, Loader2,
  Bell, Sparkles, Eye, Crown, Star, ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { formatPrice } from '@/lib/currency'

const TYPE_COLORS: Record<string, string> = {
  HOME_PARTY: '#ff006e', CLUB_NIGHT: 'var(--accent)', CONCERT: '#3d5afe', PUB_NIGHT: '#f59e0b',
}
const TYPE_LABELS: Record<string, string> = {
  HOME_PARTY: 'HOUSE PARTY', CLUB_NIGHT: 'CLUB NIGHT', CONCERT: 'CONCERT', PUB_NIGHT: 'PUB NIGHT',
}
const INTEREST_COLORS = ['#ff006e', 'var(--accent)', '#a855f7', '#00ff88', '#ffd600', '#f97316']

interface ProfileEvent {
  id: string; name: string; type: string
  startsAt: string; neighbourhood: string
  coverImageUrl?: string | null; price: number
}

interface CheckIn {
  id: string
  event?: { id: string; name: string; type: string; startsAt: string } | null
  createdAt: string
}

interface PublicProfile {
  id: string; username: string; displayName: string
  photoUrl?: string | null; bio?: string | null
  interests: string[]; gender?: string | null
  createdAt: string; isAdmin: boolean
  accountMode: string; subscriptionTier: string
  followersCount: number; followingCount: number; eventsCount: number
  isFollowing: boolean; isMe: boolean
  mutualCount: number
  goOutStatus: string | null
  hasNudged: boolean
  profileViewCount: number
  events: ProfileEvent[]
  recentCheckIns: CheckIn[]
  profileBg?: string | null
  themeColor?: string | null
  themeName?: string | null
  socialScore?: number
  phoneVerified?: boolean
}

interface ProfileViewer {
  id: string; displayName: string; username: string; photoUrl?: string | null; viewedAt: string
}

function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`
  return `${Math.floor(s / 2592000)}mo ago`
}

function MiniAvatar({ user }: { user: { displayName: string; photoUrl?: string | null } }) {
  return user.photoUrl
    ? <img src={user.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover" style={{ border: '1.5px solid rgba(var(--accent-rgb),0.2)' }} />
    : <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black"
        style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)' }}>
        {user.displayName[0]?.toUpperCase()}
      </div>
}

// ── Who Viewed Modal ────────────────────────────────────────────────────────────
function ProfileViewersModal({ count, onClose }: {
  count: number; onClose: () => void
}) {
  const [data, setData] = useState<{ isPremium: boolean; viewers: ProfileViewer[] | null } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/users/me/profile-views')
      .then((j) => setData(j.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}
        style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(var(--accent-rgb),0.12)' }}>

        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.08)' }}>
          <div>
            <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>
              👀 {count} profile view{count !== 1 ? 's' : ''} this week
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>People who checked you out</p>
          </div>
          <button onClick={onClose} style={{ color: 'rgba(224,242,254,0.3)' }}>✕</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={22} className="animate-spin" style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
          </div>
        ) : !data?.isPremium ? (
          <div className="px-5 py-6 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: 'rgba(255,214,0,0.1)', border: '1px solid rgba(255,214,0,0.25)' }}>
              👑
            </div>
            <div>
              <p className="text-sm font-black" style={{ color: '#ffd600' }}>See who viewed your profile</p>
              <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'rgba(224,242,254,0.4)' }}>
                Upgrade to Premium to see exactly who's been checking you out — like Tinder Gold, but for the party scene.
              </p>
            </div>
            <div className="flex -space-x-2">
              {Array.from({ length: Math.min(count, 5) }).map((_, i) => (
                <div key={i} className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black"
                  style={{ background: `hsl(${i * 60}, 60%, 40%)`, border: '2px solid rgba(7,7,26,0.98)', filter: 'blur(4px)' }}>?</div>
              ))}
            </div>
            <Link href="/profile" className="w-full py-3 rounded-xl text-xs font-black tracking-widest text-center block"
              style={{ background: 'linear-gradient(135deg, rgba(255,214,0,0.15), rgba(168,85,247,0.15))', border: '1px solid rgba(255,214,0,0.35)', color: '#ffd600' }}
              onClick={onClose}>
              ✨ UPGRADE TO PREMIUM
            </Link>
            <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.2)' }}>from £2.99/month · cancel anytime</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {data.viewers?.length === 0 ? (
              <p className="text-center text-xs py-8" style={{ color: 'rgba(224,242,254,0.3)' }}>No views yet this week</p>
            ) : data.viewers?.map((v) => (
              <Link key={v.id} href={`/profile/${v.username}`}
                className="flex items-center gap-3 px-4 py-3 transition-all"
                style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.06)' }}
                onClick={onClose}>
                <MiniAvatar user={v} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{v.displayName}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>@{v.username}</p>
                </div>
                <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.25)' }}>{timeAgo(v.viewedAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Followers / Following Modal ─────────────────────────────────────────────────
function FollowListModal({ username, mode, onClose, myId }: {
  username: string; mode: 'followers' | 'following'
  onClose: () => void; myId: string | null
}) {
  interface FollowUser {
    id: string; displayName: string; username: string; photoUrl?: string | null; isFollowing: boolean
  }
  const [users, setUsers] = useState<FollowUser[]>([])
  const [loading, setLoading] = useState(true)
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.get(`/users/${username}/${mode}`)
      .then((j) => {
        const data: FollowUser[] = j.data ?? []
        setUsers(data)
        setFollowingSet(new Set(data.filter((u) => u.isFollowing).map((u) => u.id)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [username, mode])

  async function toggleFollow(userId: string) {
    if (!myId) return
    const isNowFollowing = followingSet.has(userId)
    setFollowingSet((s) => { const n = new Set(s); isNowFollowing ? n.delete(userId) : n.add(userId); return n })
    const method = isNowFollowing ? 'DELETE' : 'POST'
    if (method === 'DELETE') { await api.delete(`/follow/${userId}`).catch(() => {}) }
    else { await api.post(`/follow/${userId}`, {}).catch(() => {}) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}
        style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(var(--accent-rgb),0.12)', maxHeight: '70vh' }}>
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.08)' }}>
          <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{mode === 'followers' ? 'Followers' : 'Following'}</p>
          <button onClick={onClose} style={{ color: 'rgba(224,242,254,0.3)' }}>✕</button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 56px)' }}>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin" style={{ color: 'rgba(var(--accent-rgb),0.4)' }} /></div>
          ) : users.length === 0 ? (
            <p className="text-center text-xs py-8" style={{ color: 'rgba(224,242,254,0.3)' }}>Nobody here yet</p>
          ) : users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.05)' }}>
              <Link href={`/profile/${u.username}`} onClick={onClose}>
                <MiniAvatar user={u} />
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/profile/${u.username}`} onClick={onClose}>
                  <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{u.displayName}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>@{u.username}</p>
                </Link>
              </div>
              {myId && u.id !== myId && (
                <button onClick={() => toggleFollow(u.id)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black"
                  style={{
                    background: followingSet.has(u.id) ? 'rgba(var(--accent-rgb),0.06)' : 'rgba(var(--accent-rgb),0.12)',
                    border: `1px solid ${followingSet.has(u.id) ? 'rgba(var(--accent-rgb),0.15)' : 'rgba(var(--accent-rgb),0.3)'}`,
                    color: followingSet.has(u.id) ? 'rgba(var(--accent-rgb),0.5)' : 'var(--accent)',
                  }}>
                  {followingSet.has(u.id) ? <UserCheck size={10} /> : <UserPlus size={10} />}
                  {followingSet.has(u.id) ? 'FOLLOWING' : 'FOLLOW'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Go Out Request Modal ────────────────────────────────────────────────────────
function GoOutModal({ profile, onClose, onSent }: {
  profile: PublicProfile; onClose: () => void
  onSent: () => void
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    setSending(true)
    try {
      await api.post(`/users/${profile.id}/ask-out`, { message: message.trim() || undefined })
      onSent()
    } catch {}
    finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}
        style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(255,0,110,0.2)' }}>
        <div className="text-center">
          <p className="text-2xl mb-1">✨</p>
          <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>Ask {profile.displayName} out</p>
          <p className="text-[11px] mt-1" style={{ color: 'rgba(224,242,254,0.4)' }}>Send a one-time invitation to hang out</p>
        </div>
        <textarea
          placeholder={`Hey ${profile.displayName.split(' ')[0]}, want to grab a drink? 🍹`}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 200))}
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none resize-none"
          style={{ border: '1px solid rgba(255,0,110,0.2)', color: '#e0f2fe' }}
        />
        <p className="text-[9px] text-right -mt-2" style={{ color: 'rgba(224,242,254,0.2)' }}>{message.length}/200</p>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-xs font-black"
            style={{ background: 'rgba(224,242,254,0.04)', border: '1px solid rgba(224,242,254,0.08)', color: 'rgba(224,242,254,0.4)' }}>
            CANCEL
          </button>
          <button onClick={send} disabled={sending}
            className="flex-1 py-2.5 rounded-xl text-xs font-black transition-all disabled:opacity-50"
            style={{ background: 'rgba(255,0,110,0.15)', border: '1px solid rgba(255,0,110,0.4)', color: '#ff006e' }}>
            {sending ? 'SENDING...' : '✨ SEND'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Profile Page ───────────────────────────────────────────────────────────
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
  const [nudging, setNudging] = useState(false)
  const [nudgeDone, setNudgeDone] = useState(false)
  const [showGoOut, setShowGoOut] = useState(false)
  const [goOutStatus, setGoOutStatus] = useState<string | null>(null)
  const [showViewers, setShowViewers] = useState(false)
  const [showFollowList, setShowFollowList] = useState<'followers' | 'following' | null>(null)
  const [activeTab, setActiveTab] = useState<'events' | 'checkins'>('events')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const json = await api.get<{ data: PublicProfile }>(`/users/${encodeURIComponent(username)}`)
      const data = json?.data
      if (!data) { setNotFound(true); return }
      setProfile(data)
      setFollowing(data.isFollowing)
      setGoOutStatus(data.goOutStatus)
      setNudgeDone(data.hasNudged)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => { if (username) load() }, [load])

  async function toggleFollow() {
    if (!profile || followLoading || !dbUser) return
    setFollowLoading(true)
    try {
      if (following) {
        await api.delete(`/follow/${profile.id}`)
        setFollowing(false)
        setProfile((p) => p ? { ...p, followersCount: p.followersCount - 1 } : p)
      } else {
        await api.post(`/follow/${profile.id}`, {})
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
      await api.post('/dm', { recipientId: profile.id })
      router.push('/messages')
    } catch {
      router.push('/messages')
    } finally { setDmLoading(false) }
  }

  async function sendNudge() {
    if (!profile || nudging || nudgeDone || !dbUser) return
    setNudging(true)
    try {
      await api.post(`/users/${profile.id}/nudge`, {})
      setNudgeDone(true)
    } catch {}
    finally { setNudging(false) }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#04040d', paddingTop: 56 }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
      </div>
    )
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#04040d', paddingTop: 56 }}>
        <Users size={36} style={{ color: 'rgba(var(--accent-rgb),0.2)' }} />
        <p className="text-sm font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>USER NOT FOUND</p>
        <p className="text-xs" style={{ color: 'rgba(224,242,254,0.25)' }}>@{username} doesn't exist</p>
        <button onClick={() => router.back()} className="text-xs font-bold px-4 py-2 rounded-xl mt-2"
          style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>
          ← GO BACK
        </button>
      </div>
    )
  }

  const initials = profile.displayName.slice(0, 2).toUpperCase()
  const isPremium = profile.subscriptionTier === 'PREMIUM' || profile.subscriptionTier === 'VIP'
  const isHost = profile.accountMode === 'HOST'
  const accent = profile.themeColor ?? 'var(--accent)'

  return (
    <div className="min-h-screen" style={{ background: '#04040d', paddingTop: 56, paddingBottom: 96 }}>

      {/* ── Cover gradient ── */}
      <div className="relative" style={{ height: 130 }}>
        <div className="absolute inset-0"
          style={{
            background: profile.profileBg
              ? profile.profileBg
              : `linear-gradient(135deg,
                  ${profile.isAdmin ? 'rgba(255,214,0,0.3)' : isHost ? 'rgba(168,85,247,0.3)' : `${accent}30`} 0%,
                  rgba(4,4,13,0.6) 100%)`,
          }} />
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, transparent 40%, #04040d 100%)' }} />
        <button onClick={() => router.back()}
          className="absolute top-4 left-4 p-1.5 rounded-lg z-10"
          style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(224,242,254,0.7)', backdropFilter: 'blur(8px)' }}>
          <ArrowLeft size={16} />
        </button>
        {(profile.isAdmin || isPremium || isHost) && (
          <div className="absolute top-4 right-4 flex items-center gap-1 px-2.5 py-1 rounded-full z-10"
            style={{
              background: profile.isAdmin ? 'rgba(255,214,0,0.15)' : isHost ? 'rgba(168,85,247,0.15)' : 'rgba(var(--accent-rgb),0.1)',
              border: `1px solid ${profile.isAdmin ? 'rgba(255,214,0,0.4)' : isHost ? 'rgba(168,85,247,0.4)' : 'rgba(var(--accent-rgb),0.25)'}`,
              backdropFilter: 'blur(8px)',
            }}>
            {profile.isAdmin
              ? <><ShieldCheck size={10} style={{ color: '#ffd600' }} /><span className="text-[9px] font-black ml-1" style={{ color: '#ffd600' }}>OFFICIAL</span></>
              : isHost
              ? <><Crown size={10} style={{ color: '#a855f7' }} /><span className="text-[9px] font-black ml-1" style={{ color: '#a855f7' }}>HOST</span></>
              : <><Star size={10} style={{ color: 'var(--accent)' }} /><span className="text-[9px] font-black ml-1" style={{ color: 'var(--accent)' }}>PREMIUM</span></>
            }
          </div>
        )}
      </div>

      {/* ── Avatar ── */}
      <div className="px-4" style={{ marginTop: -48 }}>
        <div className="relative inline-block">
          {profile.photoUrl
            ? <img src={profile.photoUrl} alt={profile.displayName}
                className="w-24 h-24 rounded-2xl object-cover"
                style={{ border: '3px solid #04040d', boxShadow: '0 0 24px rgba(var(--accent-rgb),0.2)' }} />
            : <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-3xl font-black"
                style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '3px solid #04040d', color: 'var(--accent)', boxShadow: '0 0 24px rgba(var(--accent-rgb),0.1)' }}>
                {initials}
              </div>
          }
          <div className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full"
            style={{ background: '#00ff88', border: '2px solid #04040d', boxShadow: '0 0 6px rgba(0,255,136,0.6)' }} />
        </div>
      </div>

      <div className="px-4 mt-3 max-w-lg">

        {/* ── Name ── */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black" style={{ color: '#e0f2fe' }}>{profile.displayName}</h1>
            {profile.isAdmin && <ShieldCheck size={16} style={{ color: '#ffd600' }} />}
          </div>
          <p className="text-sm" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>@{profile.username}</p>
          {profile.bio && (
            <p className="text-sm mt-2 leading-relaxed" style={{ color: 'rgba(224,242,254,0.65)' }}>{profile.bio}</p>
          )}
          <p className="text-[9px] mt-2 font-bold" style={{ color: 'rgba(224,242,254,0.15)' }}>
            MEMBER SINCE {new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase()}
          </p>
        </div>

        {/* ── Stats row ── */}
        <div className="flex gap-2 mb-4">
          {[
            { label: 'FOLLOWERS', value: profile.followersCount, action: () => setShowFollowList('followers') },
            { label: 'FOLLOWING', value: profile.followingCount, action: () => setShowFollowList('following') },
            { label: 'EVENTS', value: profile.eventsCount, action: null },
            ...(profile.mutualCount > 0 ? [{ label: 'MUTUAL', value: profile.mutualCount, action: null }] : []),
          ].map((s) => (
            <button key={s.label} onClick={s.action ?? undefined}
              className="flex-1 text-center py-2.5 rounded-xl transition-all"
              style={{
                background: s.action ? 'rgba(var(--accent-rgb),0.06)' : 'rgba(var(--accent-rgb),0.03)',
                border: `1px solid ${s.action ? 'rgba(var(--accent-rgb),0.15)' : 'rgba(var(--accent-rgb),0.06)'}`,
              }}>
              <p className="text-base font-black" style={{ color: '#e0f2fe' }}>{s.value}</p>
              <p className="text-[8px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.35)' }}>{s.label}</p>
            </button>
          ))}
          {/* Social score */}
          <div className="flex-1 text-center py-2.5 rounded-xl"
            style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.06)' }}>
            <p className="text-base font-black" style={{ color: accent }}>{profile.socialScore ?? 0}</p>
            <p className="text-[8px] font-bold tracking-widest" style={{ color: 'rgba(224,242,254,0.4)' }}>SCORE</p>
          </div>
        </div>

        {/* ── Leave Feedback button ── */}
        {!profile.isMe && (
          <Link href={`/social-score/${profile.username}`}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black tracking-widest mb-4"
            style={{ background: `${accent}0d`, border: `1px solid ${accent}25`, color: accent }}>
            ⭐ LEAVE FEEDBACK
          </Link>
        )}

        {/* ── Profile views (own profile) ── */}
        {profile.isMe && profile.profileViewCount > 0 && (
          <button onClick={() => setShowViewers(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-4 transition-all"
            style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.12)' }}>
            <div className="flex -space-x-1.5">
              {Array.from({ length: Math.min(profile.profileViewCount, 3) }).map((_, i) => (
                <div key={i} className="w-7 h-7 rounded-full"
                  style={{ background: `hsl(${i * 80 + 180}, 50%, 35%)`, border: '2px solid #04040d', filter: 'blur(2px)' }} />
              ))}
            </div>
            <div className="flex-1 text-left">
              <p className="text-xs font-black" style={{ color: '#e0f2fe' }}>
                {profile.profileViewCount} {profile.profileViewCount === 1 ? 'person viewed' : 'people viewed'} your profile
              </p>
              <p className="text-[9px]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>this week · tap to see who 👑</p>
            </div>
            <ChevronRight size={14} style={{ color: 'rgba(var(--accent-rgb),0.3)' }} />
          </button>
        )}

        {/* ── Action buttons (other user) ── */}
        {!profile.isMe && (
          <div className="space-y-2 mb-4">
            <div className="flex gap-2">
              {dbUser ? (
                <button onClick={toggleFollow} disabled={followLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black tracking-widest transition-all disabled:opacity-60"
                  style={{
                    background: following ? `${accent}0f` : `${accent}24`,
                    border: `1px solid ${following ? `${accent}33` : `${accent}73`}`,
                    color: following ? `${accent}80` : accent,
                  }}>
                  {following ? <UserCheck size={14} /> : <UserPlus size={14} />}
                  {followLoading ? '...' : following ? 'FOLLOWING' : 'FOLLOW'}
                </button>
              ) : (
                <Link href="/login" className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black tracking-widest"
                  style={{ background: `${accent}24`, border: `1px solid ${accent}73`, color: accent }}>
                  <UserPlus size={14} /> FOLLOW
                </Link>
              )}
              {dbUser ? (
                <button onClick={openDm} disabled={dmLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black tracking-widest transition-all disabled:opacity-60"
                  style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'rgba(var(--accent-rgb),0.7)' }}>
                  <MessageCircle size={14} />
                  {dmLoading ? '...' : 'MESSAGE'}
                </button>
              ) : (
                <Link href="/login" className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black tracking-widest"
                  style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'rgba(var(--accent-rgb),0.7)' }}>
                  <MessageCircle size={14} /> MESSAGE
                </Link>
              )}
            </div>

            {dbUser && (
              <div className="flex gap-2">
                <button onClick={sendNudge} disabled={nudging || nudgeDone}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all"
                  style={{
                    background: nudgeDone ? 'rgba(0,255,136,0.06)' : 'rgba(var(--accent-rgb),0.04)',
                    border: `1px solid ${nudgeDone ? 'rgba(0,255,136,0.25)' : 'rgba(var(--accent-rgb),0.1)'}`,
                    color: nudgeDone ? '#00ff88' : 'rgba(var(--accent-rgb),0.45)',
                  }}>
                  <Bell size={13} />
                  {nudging ? '...' : nudgeDone ? 'NUDGED 👋' : 'NUDGE'}
                </button>

                <button
                  onClick={() => { if (!goOutStatus) setShowGoOut(true) }}
                  disabled={!!goOutStatus}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all"
                  style={{
                    background: goOutStatus === 'accepted' ? 'rgba(0,255,136,0.08)'
                      : goOutStatus === 'pending' ? 'rgba(255,214,0,0.06)'
                      : goOutStatus === 'declined' ? 'rgba(255,0,110,0.04)'
                      : 'rgba(255,0,110,0.08)',
                    border: `1px solid ${goOutStatus === 'accepted' ? 'rgba(0,255,136,0.3)'
                      : goOutStatus === 'pending' ? 'rgba(255,214,0,0.25)'
                      : goOutStatus === 'declined' ? 'rgba(255,0,110,0.1)'
                      : 'rgba(255,0,110,0.3)'}`,
                    color: goOutStatus === 'accepted' ? '#00ff88'
                      : goOutStatus === 'pending' ? '#ffd600'
                      : goOutStatus === 'declined' ? 'rgba(255,0,110,0.3)'
                      : '#ff006e',
                  }}>
                  <Sparkles size={13} />
                  {goOutStatus === 'accepted' ? '🎉 GOING OUT!'
                    : goOutStatus === 'pending' ? '⏳ PENDING'
                    : goOutStatus === 'declined' ? 'DECLINED'
                    : 'ASK OUT'}
                </button>
              </div>
            )}
          </div>
        )}

        {profile.isMe && (
          <Link href="/profile" className="flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black tracking-widest w-full mb-4"
            style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.25)', color: '#ffd600' }}>
            ✏️ EDIT MY PROFILE
          </Link>
        )}

        {/* ── Interests ── */}
        {profile.interests.length > 0 && (
          <div className="mb-4">
            <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: 'rgba(var(--accent-rgb),0.3)' }}>INTERESTS</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.interests.map((interest, i) => {
                const color = INTEREST_COLORS[i % INTEREST_COLORS.length]
                return (
                  <span key={interest} className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                    style={{ background: `${color}10`, border: `1px solid ${color}25`, color }}>
                    {interest}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-2 mb-3">
          {(['events', 'checkins'] as const).map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className="flex-1 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all"
              style={{
                background: activeTab === t ? 'rgba(var(--accent-rgb),0.1)' : 'rgba(var(--accent-rgb),0.02)',
                border: `1px solid ${activeTab === t ? 'rgba(var(--accent-rgb),0.3)' : 'rgba(var(--accent-rgb),0.06)'}`,
                color: activeTab === t ? 'var(--accent)' : 'rgba(74,96,128,0.5)',
              }}>
              {t === 'events' ? `🎉 EVENTS ${profile.eventsCount > 0 ? `(${profile.eventsCount})` : ''}` : '📍 CHECK-INS'}
            </button>
          ))}
        </div>

        {activeTab === 'events' && (
          profile.events.length === 0 ? (
            <div className="py-10 rounded-xl flex flex-col items-center gap-2"
              style={{ background: 'rgba(var(--accent-rgb),0.02)', border: '1px solid rgba(var(--accent-rgb),0.05)' }}>
              <Calendar size={24} style={{ color: 'rgba(var(--accent-rgb),0.12)' }} />
              <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.3)' }}>NO EVENTS YET</p>
            </div>
          ) : (
            <div className="space-y-2">
              {profile.events.map((ev) => {
                const color = TYPE_COLORS[ev.type] ?? 'var(--accent)'
                return (
                  <Link key={ev.id} href={`/events/${ev.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: 'rgba(7,7,26,0.8)', border: `1px solid ${color}12` }}>
                    {ev.coverImageUrl
                      ? <img src={ev.coverImageUrl} alt={ev.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                      : <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
                          <Calendar size={18} style={{ color }} />
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{ev.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ color, background: `${color}10`, border: `1px solid ${color}20` }}>
                          {TYPE_LABELS[ev.type] ?? ev.type}
                        </span>
                        <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.3)' }}>
                          <MapPin size={8} className="inline mr-0.5" />{ev.neighbourhood}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold" style={{ color: ev.price === 0 ? '#00ff88' : '#e0f2fe' }}>
                        {formatPrice(ev.price)}
                      </p>
                      <p className="text-[9px] mt-0.5" style={{ color: 'rgba(224,242,254,0.25)' }}>{timeAgo(ev.startsAt)}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )
        )}

        {activeTab === 'checkins' && (
          profile.recentCheckIns.length === 0 ? (
            <div className="py-10 rounded-xl flex flex-col items-center gap-2"
              style={{ background: 'rgba(var(--accent-rgb),0.02)', border: '1px solid rgba(var(--accent-rgb),0.05)' }}>
              <MapPin size={24} style={{ color: 'rgba(var(--accent-rgb),0.12)' }} />
              <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.3)' }}>NO CHECK-INS YET</p>
            </div>
          ) : (
            <div className="space-y-2">
              {profile.recentCheckIns.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.06)' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.12)' }}>
                    <MapPin size={14} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {c.event ? (
                      <Link href={`/events/${c.event.id}`}>
                        <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{c.event.name}</p>
                      </Link>
                    ) : (
                      <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>Checked in</p>
                    )}
                    <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>{timeAgo(c.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Modals ── */}
      {showViewers && (
        <ProfileViewersModal count={profile.profileViewCount} onClose={() => setShowViewers(false)} />
      )}
      {showFollowList && (
        <FollowListModal username={profile.username} mode={showFollowList}
          onClose={() => setShowFollowList(null)} myId={dbUser?.id ?? null} />
      )}
      {showGoOut && (
        <GoOutModal profile={profile}
          onClose={() => setShowGoOut(false)}
          onSent={() => { setShowGoOut(false); setGoOutStatus('pending') }} />
      )}
    </div>
  )
}
