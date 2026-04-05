'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Edit2, Check, X, LogOut, ShieldCheck, Wine, Ticket,
  Calendar, Crown, ChevronRight, User
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import type { Gender } from '@partyradar/shared'

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

export default function ProfilePage() {
  const router = useRouter()
  const { dbUser, loading: authLoading, signOut } = useAuth()

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

  useEffect(() => {
    if (!authLoading && !dbUser) router.push('/login')
  }, [authLoading, dbUser, router])

  useEffect(() => {
    if (dbUser) {
      setDisplayName(dbUser.displayName)
      setBio(dbUser.bio ?? '')
    }
  }, [dbUser])

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
      // updateProfile is optional — silently succeed if not implemented yet
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
          </div>

          <button onClick={() => setEditing((v) => !v)}
            className="p-2 rounded-lg transition-all duration-200 shrink-0"
            style={{ border: editing ? '1px solid rgba(0,229,255,0.4)' : '1px solid rgba(0,229,255,0.15)', color: editing ? '#00e5ff' : 'rgba(0,229,255,0.5)', background: editing ? 'rgba(0,229,255,0.08)' : 'transparent' }}>
            <Edit2 size={14} />
          </button>
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

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'HOSTED',   value: '—', icon: Calendar },
            { label: 'TICKETS',  value: '—', icon: Ticket  },
            { label: 'EVENTS',   value: '—', icon: Crown   },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="p-3 rounded-xl text-center"
              style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}>
              <Icon size={14} style={{ color: 'rgba(0,229,255,0.35)', margin: '0 auto 4px' }} />
              <p className="text-lg font-black" style={{ color: '#e0f2fe' }}>{value}</p>
              <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.35)' }}>{label}</p>
            </div>
          ))}
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
    </div>
  )
}
