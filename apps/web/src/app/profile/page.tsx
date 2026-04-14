'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Edit2, Check, X, LogOut, ShieldCheck, Wine, Ticket,
  Calendar, Crown, ChevronRight, User, Users, Star, MapPin, Zap, MessageSquare, Bookmark,
  ToggleLeft, Building2, Plus
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import type { Gender } from '@partyradar/shared'

import { api, API_URL as API_BASE } from '@/lib/api'
import { DEV_MODE } from '@/lib/firebase'

const TIER_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  FREE:    { label: 'FREE',    color: '#4b5563', icon: '⚡' },
  BASIC:   { label: 'BASIC',   color: '#3b82f6', icon: '🔵' },
  PRO:     { label: 'PRO',     color: '#00e5ff', icon: '💎' },
  PREMIUM: { label: 'PREMIUM', color: '#ffd600', icon: '👑' },
}

const GENDER_LABELS: Record<Gender, string> = {
  MALE:             '♂ Man',
  FEMALE:           '♀ Woman',
  NON_BINARY:       '⚧ Non-binary',
  PREFER_NOT_TO_SAY:'— Prefer not to say',
}

function timeAgo(dateStr: string) {
  const s = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}

// Demo activity items shown when API returns nothing
const DEMO_ACTIVITY = [
  { type: 'CHECKIN', venue: 'SWG3', crowdLevel: 'BUSY',   createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { type: 'RSVP',    event: 'Sub Club — Techno Night',     createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
  { type: 'POST',    text: 'Amazing night 🔥',             createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
]

const DEMO_REVIEWS = [
  { event: 'Sub Club — Techno Night', rating: 5, text: 'Absolutely incredible. Sound system was mind-blowing.', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
  { event: 'Òran Mór Live',           rating: 4, text: 'Great venue, loved the atmosphere.',                   createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() },
]

type ProfileTab = 'activity' | 'reviews'

const CROWD_COLORS: Record<string, string> = { QUIET: '#00ff88', BUSY: '#ffd600', RAMMED: '#ff006e' }

function ToggleRow({ icon, label, value, border }: { icon: React.ReactNode; label: string; value: boolean; border?: boolean }) {
  return (
    <div
      className="px-4 py-3 flex items-center justify-between"
      style={{ background: 'rgba(7,7,26,0.5)', borderTop: border ? '1px solid rgba(0,229,255,0.06)' : 'none' }}
    >
      <div className="flex items-center gap-2.5">
        <span style={{ color: 'rgba(0,229,255,0.35)' }}>{icon}</span>
        <span className="text-sm" style={{ color: 'rgba(224,242,254,0.7)' }}>{label}</span>
      </div>
      <div
        className="w-10 h-5 rounded-full relative transition-all duration-300"
        style={{
          background: value ? 'rgba(0,255,136,0.2)' : 'rgba(0,229,255,0.08)',
          border: value ? '1px solid rgba(0,255,136,0.4)' : '1px solid rgba(0,229,255,0.15)',
          boxShadow: value ? '0 0 8px rgba(0,255,136,0.2)' : 'none',
        }}
      >
        <div
          className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-300"
          style={{
            background: value ? '#00ff88' : 'rgba(0,229,255,0.3)',
            left: value ? 'calc(100% - 18px)' : '2px',
            boxShadow: value ? '0 0 6px rgba(0,255,136,0.5)' : 'none',
          }}
        />
      </div>
    </div>
  )
}

// ── Clickable toggle with onChange ──────────────────────────────────────────
function ClickableToggle({ icon, label, value, onChange, border }: {
  icon: React.ReactNode; label: string; value: boolean; onChange: () => void; border?: boolean
}) {
  return (
    <button
      onClick={onChange}
      className="w-full px-4 py-3 flex items-center justify-between transition-all duration-200"
      style={{ background: 'rgba(7,7,26,0.5)', borderTop: border ? '1px solid rgba(0,229,255,0.06)' : 'none' }}
    >
      <div className="flex items-center gap-2.5">
        <span style={{ color: value ? 'rgba(0,255,136,0.6)' : 'rgba(0,229,255,0.35)' }}>{icon}</span>
        <span className="text-sm" style={{ color: value ? 'rgba(224,242,254,0.85)' : 'rgba(224,242,254,0.7)' }}>{label}</span>
        {value && (
          <span
            className="text-[9px] font-black px-2 py-0.5 rounded"
            style={{ color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)', background: 'rgba(0,255,136,0.08)', letterSpacing: '0.1em' }}
          >
            ON
          </span>
        )}
      </div>
      <div
        className="w-10 h-5 rounded-full relative transition-all duration-300"
        style={{
          background: value ? 'rgba(0,255,136,0.2)' : 'rgba(0,229,255,0.08)',
          border: value ? '1px solid rgba(0,255,136,0.4)' : '1px solid rgba(0,229,255,0.15)',
          boxShadow: value ? '0 0 8px rgba(0,255,136,0.2)' : 'none',
        }}
      >
        <div
          className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-300"
          style={{
            background: value ? '#00ff88' : 'rgba(0,229,255,0.3)',
            left: value ? 'calc(100% - 18px)' : '2px',
            boxShadow: value ? '0 0 6px rgba(0,255,136,0.5)' : 'none',
          }}
        />
      </div>
    </button>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const { dbUser, loading: authLoading, logout: signOut } = useAuth()

  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)

  const [localGender] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('partyradar_gender') : null
  )

  // Social counts — fetched from API, demo fallback
  const [followersCount, setFollowersCount] = useState(128)
  const [followingCount, setFollowingCount] = useState(47)

  // "Going Out Tonight?" toggle — persisted in localStorage
  const [goingOut, setGoingOut] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('partyradar_going_out') === 'true'
  })

  // Profile tabs
  const [profileTab, setProfileTab] = useState<ProfileTab>('activity')

  // Account mode — stored in localStorage, no login required
  const [accountMode, setAccountMode] = useState<'ATTENDEE' | 'HOST'>('ATTENDEE')
  const [showBecomeHost, setShowBecomeHost] = useState(false)
  const [modeSwitching, setModeSwitching] = useState(false)

  // Read persisted mode on mount
  useEffect(() => {
    const stored = localStorage.getItem('partyradar_account_mode')
    if (stored === 'HOST' || stored === 'ATTENDEE') setAccountMode(stored)
  }, [])

  // Activity / Reviews — only seed with demo data in dev mode
  const [activity, setActivity] = useState(DEV_MODE ? DEMO_ACTIVITY : [])
  const [reviews, setReviews] = useState(DEV_MODE ? DEMO_REVIEWS : [])

  // Don't hard-redirect — show guest profile with mode toggle accessible

  useEffect(() => {
    if (dbUser) {
      setDisplayName(dbUser.displayName)
      setBio(dbUser.bio ?? '')
    }
  }, [dbUser])

  // Fetch real follower/following counts from API
  useEffect(() => {
    if (!dbUser) return
    async function loadFollowCounts() {
      try {
        const res = await api.get<{ data: { isFollowing: boolean; followersCount: number; followingCount: number } }>(`/follow/${dbUser!.id}`)
        setFollowersCount(res.data.followersCount)
        setFollowingCount(res.data.followingCount)
      } catch {
        // Keep demo fallback values
      }
    }
    loadFollowCounts()
  }, [dbUser])

  // Load activity from API (GET /api/feed)
  useEffect(() => {
    if (!dbUser || DEV_MODE) return
    async function loadActivity() {
      try {
        const res = await api.get<{ data: typeof DEMO_ACTIVITY }>('/feed')
        const items = res?.data ?? []
        setActivity(items)
      } catch {
        // Keep empty array in production — no fake data
      }
    }
    async function loadReviews() {
      try {
        const res = await api.get<{ data: typeof DEMO_REVIEWS }>('/reviews')
        const items = res?.data ?? []
        setReviews(items)
      } catch {
        // Keep empty array in production — no fake data
      }
    }
    loadActivity()
    loadReviews()
  }, [dbUser])

  function toggleGoingOut() {
    const next = !goingOut
    setGoingOut(next)
    localStorage.setItem('partyradar_going_out', String(next))
  }

  if (authLoading || !dbUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
      </div>
    )
  }

  const tier = TIER_CONFIG[dbUser.subscriptionTier] ?? TIER_CONFIG.FREE
  const initials = dbUser.displayName?.[0]?.toUpperCase() ?? '?'

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      await api.put('/auth/profile', { displayName, bio })
      setSavedOk(true)
      setTimeout(() => { setSavedOk(false); setEditing(false) }, 1200)
    } catch {
      setSaveError('Failed to save — try again')
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    router.push('/')
  }

  function applyMode(next: 'ATTENDEE' | 'HOST') {
    setAccountMode(next)
    localStorage.setItem('partyradar_account_mode', next)
    // Notify Navbar and any other listeners in the same tab
    window.dispatchEvent(new CustomEvent('partyradar:mode-change', { detail: next }))
    // Best-effort API sync — doesn't block the UI
    import('@/lib/firebase').then(({ auth }) =>
      auth.currentUser?.getIdToken().then((token) =>
        fetch(`${API_BASE}/auth/mode`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ accountMode: next }),
        }).catch(() => {})
      )
    )
  }

  function switchMode(next: 'ATTENDEE' | 'HOST') {
    if (next === accountMode) return
    if (next === 'HOST') { setShowBecomeHost(true); return }
    applyMode(next)
  }

  function confirmBecomeHost() {
    setShowBecomeHost(false)
    applyMode('HOST')
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: '#04040d' }}>
      {/* ── Header ── */}
      <div
        className="relative px-4 pt-6 pb-8"
        style={{ background: 'linear-gradient(180deg, rgba(0,229,255,0.04) 0%, transparent 100%)' }}
      >
        <div className="absolute top-0 inset-x-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.3), transparent)' }} />

        <div className="max-w-xl mx-auto flex items-center gap-5">
          {/* Avatar */}
          {dbUser.photoUrl ? (
            <img src={dbUser.photoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover"
              style={{ border: '1px solid rgba(0,229,255,0.3)', boxShadow: '0 0 20px rgba(0,229,255,0.15)', flexShrink: 0 }} />
          ) : (
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black shrink-0"
              style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', color: '#00e5ff', boxShadow: '0 0 20px rgba(0,229,255,0.1)' }}>
              {initials}
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-xl font-black" style={{ color: '#e0f2fe' }}>{dbUser.displayName}</h1>
              <span className="text-[9px] font-black px-2 py-0.5 rounded shrink-0"
                style={{ color: tier.color, border: `1px solid ${tier.color}50`, background: `${tier.color}12`, letterSpacing: '0.12em' }}>
                {tier.icon} {tier.label}
              </span>
            </div>
            <p className="text-xs mb-1" style={{ color: 'rgba(0,229,255,0.5)' }}>@{dbUser.username}</p>
            {dbUser.bio && (
              <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'rgba(224,242,254,0.5)' }}>{dbUser.bio}</p>
            )}
            {/* Going Out badge */}
            {goingOut && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00ff88', boxShadow: '0 0 6px rgba(0,255,136,0.8)' }} />
                <span className="text-[9px] font-black tracking-widest" style={{ color: '#00ff88' }}>OUT TONIGHT</span>
              </div>
            )}
          </div>

          <button onClick={() => setEditing((v) => !v)}
            className="p-2 rounded-lg transition-all duration-200 shrink-0"
            style={{ border: editing ? '1px solid rgba(0,229,255,0.4)' : '1px solid rgba(0,229,255,0.15)', color: editing ? '#00e5ff' : 'rgba(0,229,255,0.5)', background: editing ? 'rgba(0,229,255,0.08)' : 'transparent' }}>
            <Edit2 size={14} />
          </button>
        </div>
      </div>

      {/* ── Mode Switcher ── */}
      <div className="px-4 max-w-xl mx-auto mb-3 mt-1">
        <div className="flex p-1 rounded-2xl gap-1"
          style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.1)' }}>
          {(['ATTENDEE', 'HOST'] as const).map((mode) => {
            const active = accountMode === mode
            return (
              <button
                key={mode}
                onClick={() => switchMode(mode)}
                disabled={modeSwitching}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all duration-200"
                style={{
                  background: active
                    ? mode === 'HOST'
                      ? 'linear-gradient(135deg, rgba(168,85,247,0.2) 0%, rgba(0,229,255,0.15) 100%)'
                      : 'rgba(0,229,255,0.12)'
                    : 'transparent',
                  border: active
                    ? mode === 'HOST'
                      ? '1px solid rgba(168,85,247,0.4)'
                      : '1px solid rgba(0,229,255,0.3)'
                    : '1px solid transparent',
                  color: active
                    ? mode === 'HOST' ? '#a855f7' : '#00e5ff'
                    : 'rgba(255,255,255,0.25)',
                  boxShadow: active ? `0 0 12px ${mode === 'HOST' ? 'rgba(168,85,247,0.15)' : 'rgba(0,229,255,0.1)'}` : 'none',
                }}
              >
                {mode === 'ATTENDEE' ? <Ticket size={12} /> : <Building2 size={12} />}
                {mode}
                {modeSwitching && active && (
                  <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-4 max-w-xl mx-auto space-y-3">
        {/* Edit panel */}
        {editing && (
          <div className="p-4 rounded-2xl space-y-4 animate-fade-up"
            style={{ background: 'rgba(7,7,26,0.9)', border: '1px solid rgba(0,229,255,0.15)' }}>
            <p className="text-[9px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.4)' }}>EDIT PROFILE</p>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold tracking-[0.15em]" style={{ color: 'rgba(0,229,255,0.55)' }}>DISPLAY NAME</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                onFocus={() => setFocused('name')} onBlur={() => setFocused(null)}
                maxLength={50}
                className="w-full px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-all duration-200"
                style={{ background: 'rgba(0,229,255,0.04)', border: focused === 'name' ? '1px solid rgba(0,229,255,0.5)' : '1px solid rgba(0,229,255,0.15)', color: '#e0f2fe' }} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold tracking-[0.15em]" style={{ color: 'rgba(0,229,255,0.55)' }}>BIO</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)}
                onFocus={() => setFocused('bio')} onBlur={() => setFocused(null)}
                rows={3} maxLength={200} placeholder="Tell the radar who you are..."
                className="w-full px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-all duration-200 resize-none"
                style={{ background: 'rgba(0,229,255,0.04)', border: focused === 'bio' ? '1px solid rgba(0,229,255,0.5)' : '1px solid rgba(0,229,255,0.15)', color: '#e0f2fe' }} />
            </div>

            {saveError && (
              <p className="text-[11px] font-bold px-3 py-2 rounded" style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>⚠ {saveError}</p>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setEditing(false); setDisplayName(dbUser.displayName); setBio(dbUser.bio ?? '') }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold"
                style={{ border: '1px solid rgba(0,229,255,0.15)', color: 'rgba(0,229,255,0.5)' }}>
                <X size={12} /> CANCEL
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black transition-all disabled:opacity-50"
                style={{ background: savedOk ? 'rgba(0,255,136,0.12)' : 'rgba(0,229,255,0.1)', border: savedOk ? '1px solid rgba(0,255,136,0.4)' : '1px solid rgba(0,229,255,0.4)', color: savedOk ? '#00ff88' : '#00e5ff', letterSpacing: '0.1em' }}>
                {saving ? <><div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" /> SAVING...</>
                 : savedOk ? <><Check size={12} /> SAVED</>
                 : <><Check size={12} /> SAVE CHANGES</>}
              </button>
            </div>
          </div>
        )}

        {/* Stats row — now 5 cols: Hosted, Tickets, Events, Followers, Following */}
        <div className="grid grid-cols-5 gap-2">
          {(accountMode === 'HOST' ? [
            { label: 'EVENTS',    value: '—', icon: Calendar },
            { label: 'GUESTS',    value: '—', icon: Users    },
            { label: 'REVENUE',   value: '—', icon: Crown    },
            { label: 'FOLLOWERS', value: String(followersCount), icon: Users },
            { label: 'FOLLOWING', value: String(followingCount), icon: Users },
          ] : [
            { label: 'HOSTED',    value: '—',              icon: Calendar },
            { label: 'TICKETS',   value: '—',              icon: Ticket   },
            { label: 'EVENTS',    value: '—',              icon: Crown    },
            { label: 'FOLLOWERS', value: String(followersCount), icon: Users },
            { label: 'FOLLOWING', value: String(followingCount), icon: Users },
          ]).map(({ label, value, icon: Icon }) => (
            <div key={label} className="p-2 rounded-xl text-center"
              style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}>
              <Icon size={12} style={{ color: 'rgba(0,229,255,0.35)', margin: '0 auto 3px' }} />
              <p className="text-base font-black" style={{ color: '#e0f2fe' }}>{value}</p>
              <p className="text-[8px] font-bold tracking-widest leading-tight" style={{ color: 'rgba(0,229,255,0.35)' }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Going Out Tonight toggle */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(0,229,255,0.1)' }}>
          <div className="px-4 py-2.5" style={{ background: 'rgba(0,229,255,0.04)', borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
            <p className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.5)' }}>STATUS</p>
          </div>
          <ClickableToggle
            icon={<Zap size={13} />}
            label="Going Out Tonight?"
            value={goingOut}
            onChange={toggleGoingOut}
          />
        </div>

        {/* ── Activity / Reviews Tabs ── */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(0,229,255,0.1)' }}>
          {/* Tab headers */}
          <div className="flex" style={{ borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
            {([['activity', 'ACTIVITY'] as [ProfileTab, string], ['reviews', 'REVIEWS'] as [ProfileTab, string]]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setProfileTab(key)}
                className="flex-1 py-2.5 text-[10px] font-black tracking-widest relative transition-all duration-200"
                style={{
                  background: profileTab === key ? 'rgba(0,229,255,0.05)' : 'rgba(0,229,255,0.02)',
                  color: profileTab === key ? '#00e5ff' : 'rgba(74,96,128,0.6)',
                  textShadow: profileTab === key ? '0 0 10px rgba(0,229,255,0.5)' : 'none',
                }}
              >
                {label}
                {profileTab === key && (
                  <span className="absolute bottom-0 left-4 right-4 h-px"
                    style={{ background: 'linear-gradient(90deg, transparent, #00e5ff, transparent)' }} />
                )}
              </button>
            ))}
          </div>

          {/* Activity tab */}
          {profileTab === 'activity' && (
            <div className="divide-y" style={{ borderColor: 'rgba(0,229,255,0.06)' }}>
              {activity.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.4)' }}>NO ACTIVITY YET</p>
                </div>
              ) : activity.map((item, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3" style={{ background: 'rgba(7,7,26,0.4)' }}>
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.1)' }}
                  >
                    {item.type === 'CHECKIN' && <MapPin size={12} style={{ color: '#00e5ff' }} />}
                    {item.type === 'RSVP'    && <Calendar size={12} style={{ color: '#a855f7' }} />}
                    {item.type === 'POST'    && <MessageSquare size={12} style={{ color: '#ec4899' }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold leading-tight" style={{ color: 'rgba(224,242,254,0.75)' }}>
                      {item.type === 'CHECKIN' && (
                        <>Checked in at <span style={{ color: '#00e5ff' }}>{(item as any).venue}</span>
                          {(item as any).crowdLevel && (
                            <span className="ml-2 text-[9px] font-black px-1.5 py-0.5 rounded"
                              style={{ color: CROWD_COLORS[(item as any).crowdLevel] ?? '#00e5ff', border: `1px solid ${CROWD_COLORS[(item as any).crowdLevel] ?? '#00e5ff'}40`, background: `${CROWD_COLORS[(item as any).crowdLevel] ?? '#00e5ff'}10` }}>
                              {(item as any).crowdLevel}
                            </span>
                          )}
                        </>
                      )}
                      {item.type === 'RSVP' && <>RSVP&apos;d to <span style={{ color: '#a855f7' }}>{(item as any).event}</span></>}
                      {item.type === 'POST' && <span style={{ color: 'rgba(224,242,254,0.7)' }}>{(item as any).text}</span>}
                    </p>
                    <p className="text-[9px] font-bold mt-0.5" style={{ color: 'rgba(74,96,128,0.5)' }}>{timeAgo(item.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reviews tab */}
          {profileTab === 'reviews' && (
            <div className="divide-y" style={{ borderColor: 'rgba(0,229,255,0.06)' }}>
              {reviews.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.4)' }}>NO REVIEWS YET</p>
                </div>
              ) : reviews.map((r, i) => (
                <div key={i} className="px-4 py-3" style={{ background: 'rgba(7,7,26,0.4)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-black truncate flex-1" style={{ color: '#e0f2fe' }}>{(r as any).event}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {Array.from({ length: 5 }).map((_, si) => (
                        <Star key={si} size={10} fill={si < (r as any).rating ? '#ffd600' : 'none'}
                          style={{ color: si < (r as any).rating ? '#ffd600' : 'rgba(74,96,128,0.3)' }} />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(224,242,254,0.6)' }}>{(r as any).text}</p>
                  <p className="text-[9px] font-bold mt-1" style={{ color: 'rgba(74,96,128,0.45)' }}>{timeAgo((r as any).createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Identity section */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(0,229,255,0.1)' }}>
          <div className="px-4 py-2.5" style={{ background: 'rgba(0,229,255,0.04)', borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
            <p className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.5)' }}>IDENTITY</p>
          </div>
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(7,7,26,0.5)' }}>
            <div className="flex items-center gap-2.5">
              <User size={13} style={{ color: 'rgba(0,229,255,0.35)' }} />
              <span className="text-sm truncate" style={{ color: 'rgba(224,242,254,0.7)' }}>{dbUser.email}</span>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0" style={{ color: 'rgba(0,229,255,0.45)', border: '1px solid rgba(0,229,255,0.15)', background: 'rgba(0,229,255,0.05)' }}>VERIFIED</span>
          </div>
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(7,7,26,0.5)', borderTop: '1px solid rgba(0,229,255,0.06)' }}>
            <div className="flex items-center gap-2.5">
              <span className="text-sm" style={{ color: 'rgba(0,229,255,0.35)' }}>⚧</span>
              <span className="text-sm" style={{ color: 'rgba(224,242,254,0.7)' }}>
                {localGender ? GENDER_LABELS[localGender as Gender] ?? localGender : 'Not set'}
              </span>
            </div>
          </div>
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(7,7,26,0.5)', borderTop: '1px solid rgba(0,229,255,0.06)' }}>
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={13} style={{ color: dbUser.ageVerified ? '#00ff88' : 'rgba(0,229,255,0.35)' }} />
              <span className="text-sm" style={{ color: 'rgba(224,242,254,0.7)' }}>Age Verified</span>
            </div>
            {dbUser.ageVerified
              ? <span className="text-[10px] font-bold" style={{ color: '#00ff88' }}>✓ VERIFIED</span>
              : <button className="text-[10px] font-bold px-2.5 py-1 rounded-lg" style={{ color: '#ffd600', border: '1px solid rgba(255,214,0,0.3)', background: 'rgba(255,214,0,0.06)' }}>VERIFY →</button>
            }
          </div>
        </div>

        {/* Preferences */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(0,229,255,0.1)' }}>
          <div className="px-4 py-2.5" style={{ background: 'rgba(0,229,255,0.04)', borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
            <p className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.5)' }}>PREFERENCES</p>
          </div>
          <ToggleRow icon={<Wine size={13} />} label="Show alcohol events" value={dbUser.showAlcoholEvents} />
          <ToggleRow icon={<Wine size={13} />} label="Alcohol-friendly profile" value={dbUser.alcoholFriendly} border />
        </div>

        {/* Subscription */}
        <div className="p-4 rounded-2xl flex items-center gap-4"
          style={{ background: `${tier.color}08`, border: `1px solid ${tier.color}25` }}>
          <div className="text-3xl">{tier.icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black tracking-widest" style={{ color: tier.color }}>{tier.label} PLAN</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(224,242,254,0.5)' }}>
              {dbUser.subscriptionTier === 'FREE' ? 'Upgrade for more events & radar access' : 'Your plan is active'}
            </p>
          </div>
          <Link href="/subscriptions"
            className="flex items-center gap-1 text-xs font-black px-3 py-2 rounded-lg shrink-0"
            style={{ color: tier.color, border: `1px solid ${tier.color}40`, background: `${tier.color}10`, letterSpacing: '0.08em' }}>
            {dbUser.subscriptionTier === 'FREE' ? 'UPGRADE' : 'MANAGE'} <ChevronRight size={11} />
          </Link>
        </div>

        {/* Quick links */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(0,229,255,0.1)' }}>
          {accountMode === 'HOST' ? (
            <>
              <Link href="/events/create"
                className="flex items-center gap-3 px-4 py-4 transition-all duration-200"
                style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(0,229,255,0.06) 100%)', borderBottom: '1px solid rgba(0,229,255,0.08)', color: '#a855f7' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }}>
                  <Plus size={14} style={{ color: '#a855f7' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black tracking-wide" style={{ color: '#a855f7' }}>Create New Event</p>
                  <p className="text-[10px]" style={{ color: 'rgba(168,85,247,0.5)' }}>Host your next night out</p>
                </div>
                <ChevronRight size={13} style={{ color: 'rgba(168,85,247,0.4)' }} />
              </Link>
              {[
                { label: 'My Events', href: '/host', icon: Calendar },
                { label: 'Analytics', href: '/events/analytics', icon: Star },
                { label: 'Subscriptions', href: '/subscriptions', icon: Crown },
              ].map(({ label, href, icon: Icon }, i) => (
                <Link key={href} href={href}
                  className="flex items-center gap-3 px-4 py-3.5 transition-all duration-200"
                  style={{ background: 'rgba(7,7,26,0.5)', borderTop: i > 0 ? '1px solid rgba(0,229,255,0.06)' : 'none', color: 'rgba(224,242,254,0.7)' }}>
                  <Icon size={13} style={{ color: 'rgba(0,229,255,0.4)' }} />
                  <span className="text-sm flex-1">{label}</span>
                  <ChevronRight size={13} style={{ color: 'rgba(0,229,255,0.3)' }} />
                </Link>
              ))}
            </>
          ) : (
            <>
              <Link href="/saved" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm mx-3 mt-3"
                style={{ background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.15)', color: 'rgba(255,214,0,0.8)' }}>
                <Bookmark size={14} fill="currentColor" /> Saved Events
              </Link>
              {[
                { label: 'My Tickets', href: '/tickets', icon: Ticket },
                { label: 'Subscriptions', href: '/subscriptions', icon: Crown },
              ].map(({ label, href, icon: Icon }, i) => (
                <Link key={href} href={href}
                  className="flex items-center gap-3 px-4 py-3.5 transition-all duration-200"
                  style={{ background: 'rgba(7,7,26,0.5)', borderTop: i > 0 ? '1px solid rgba(0,229,255,0.06)' : 'none', color: 'rgba(224,242,254,0.7)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,229,255,0.04)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(7,7,26,0.5)' }}>
                  <Icon size={13} style={{ color: 'rgba(0,229,255,0.4)' }} />
                  <span className="text-sm flex-1">{label}</span>
                  <ChevronRight size={13} style={{ color: 'rgba(0,229,255,0.3)' }} />
                </Link>
              ))}
            </>
          )}
        </div>

        {/* Sign out */}
        <button onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all duration-200"
          style={{ border: '1px solid rgba(255,0,110,0.2)', color: 'rgba(255,0,110,0.6)', letterSpacing: '0.1em' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,0,110,0.4)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,0,110,0.05)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,0,110,0.2)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
          <LogOut size={14} /> SIGN OUT
        </button>
      </div>

      {/* ── Become a Host modal ── */}
      {showBecomeHost && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(4,4,13,0.85)', backdropFilter: 'blur(12px)' }}
          onClick={() => setShowBecomeHost(false)}>
          <div
            className="w-full max-w-sm rounded-3xl p-6 space-y-5"
            style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(168,85,247,0.3)', boxShadow: '0 0 60px rgba(168,85,247,0.15)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-3"
                style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.2) 0%, rgba(0,229,255,0.15) 100%)', border: '1px solid rgba(168,85,247,0.4)' }}>
                <Building2 size={24} style={{ color: '#a855f7' }} />
              </div>
              <h2 className="text-xl font-black" style={{ color: '#e0f2fe' }}>Become a Host</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(224,242,254,0.55)' }}>
                Switch to host mode to create events, manage guests, and track your analytics.
              </p>
            </div>

            <div className="space-y-2">
              {['Create and publish events', 'Manage RSVPs & guest list', 'Track revenue & analytics', 'Send blasts to attendees'].map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)' }}>
                    <Check size={9} style={{ color: '#00ff88' }} />
                  </div>
                  <span className="text-xs" style={{ color: 'rgba(224,242,254,0.65)' }}>{item}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowBecomeHost(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold"
                style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
                Not yet
              </button>
              <button onClick={confirmBecomeHost}
                className="flex-1 py-2.5 rounded-xl text-xs font-black transition-all"
                style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.3) 0%, rgba(0,229,255,0.2) 100%)', border: '1px solid rgba(168,85,247,0.5)', color: '#a855f7', letterSpacing: '0.08em' }}>
                START HOSTING →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
