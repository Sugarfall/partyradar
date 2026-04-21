'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/contexts/LanguageContext'
import { LANGUAGE_META } from '@/lib/i18n'
import type { Language } from '@/lib/i18n'
import { api } from '@/lib/api'
import { loginHref } from '@/lib/authRedirect'
import {
  Shield, Bell, Eye, User, ChevronRight,
  AlertTriangle, Zap, ToggleLeft, ToggleRight, Globe,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotifPrefs {
  emailRsvp: boolean
  emailEventReminder: boolean
  emailFollow: boolean
  emailMarketing: boolean
  pushRsvp: boolean
  pushEventReminder: boolean
  pushCelebrityNearby: boolean
  pushFollow: boolean
  pushNudge: boolean
  pushGoOut: boolean
  pushPartyBlast: boolean
}

interface PrivacyPrefs {
  showInNearby: boolean
  showProfileViews: boolean
  allowGoOutFromStrangers: boolean
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-2 pt-1">
      {icon}
      <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(224,242,254,0.45)', letterSpacing: '0.15em' }}>
        {label}
      </p>
    </div>
  )
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(24,24,27,0.95)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
    >
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(var(--accent-rgb),0.05)', marginLeft: 16, marginRight: 16 }} />
}

interface ToggleRowProps {
  label: string
  sublabel?: string
  value: boolean
  onChange: (v: boolean) => void
  saving?: boolean
  accent?: string
}

function ToggleRow({ label, sublabel, value, onChange, saving, accent = 'var(--accent)' }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>{label}</p>
        {sublabel && (
          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.35)' }}>{sublabel}</p>
        )}
      </div>
      <button
        onClick={() => !saving && onChange(!value)}
        className="shrink-0 transition-opacity"
        style={{ opacity: saving ? 0.5 : 1 }}
        aria-label={value ? 'Disable' : 'Enable'}
      >
        {value ? (
          <ToggleRight size={26} style={{ color: accent }} />
        ) : (
          <ToggleLeft size={26} style={{ color: 'rgba(224,242,254,0.2)' }} />
        )}
      </button>
    </div>
  )
}

function InfoRow({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>{label}</p>
        {sublabel && (
          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.35)' }}>{sublabel}</p>
        )}
      </div>
      <span
        className="text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0"
        style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const { dbUser, loading, refreshUser } = useAuth()
  const { lang, setLang, t } = useLanguage()

  // ── Notification prefs ─────────────────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    emailRsvp: true,
    emailEventReminder: true,
    emailFollow: false,
    emailMarketing: false,
    pushRsvp: true,
    pushEventReminder: true,
    pushCelebrityNearby: true,
    pushFollow: true,
    pushNudge: true,
    pushGoOut: true,
    pushPartyBlast: true,
  })

  // ── Privacy prefs ──────────────────────────────────────────────────────────
  const [privacyPrefs, setPrivacyPrefs] = useState<PrivacyPrefs>({
    showInNearby: true,
    showProfileViews: true,
    allowGoOutFromStrangers: true,
  })

  const [savingNotif, setSavingNotif]     = useState(false)
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [notifSaved, setNotifSaved]       = useState(false)

  // Seed from dbUser if they have saved prefs
  useEffect(() => {
    if (!dbUser) return
    if ((dbUser as any).notifPrefs) {
      setNotifPrefs(prev => ({ ...prev, ...(dbUser as any).notifPrefs }))
    }
    if ((dbUser as any).showInNearby !== undefined) {
      setPrivacyPrefs(prev => ({
        ...prev,
        showInNearby: (dbUser as any).showInNearby ?? true,
        showProfileViews: (dbUser as any).showProfileViews ?? true,
        allowGoOutFromStrangers: (dbUser as any).allowGoOutFromStrangers ?? true,
      }))
    }
  }, [dbUser])

  async function saveNotifPrefs(updated: NotifPrefs) {
    setSavingNotif(true)
    try {
      await api.put('/auth/profile', { notifPrefs: updated })
      await refreshUser()
      setNotifSaved(true)
      setTimeout(() => setNotifSaved(false), 2000)
    } catch { /* silent */ } finally {
      setSavingNotif(false)
    }
  }

  async function savePrivacyPref(key: keyof PrivacyPrefs, value: boolean) {
    setSavingPrivacy(true)
    const updated = { ...privacyPrefs, [key]: value }
    setPrivacyPrefs(updated)
    try {
      await api.put('/auth/profile', { [key]: value })
      await refreshUser()
    } catch {
      // Bug 7 fix: use functional update to avoid stale closure reverting a concurrent change
      setPrivacyPrefs(prev => ({ ...prev, [key]: !value }))
    } finally {
      setSavingPrivacy(false)
    }
  }

  function updateNotif(key: keyof NotifPrefs, value: boolean) {
    const updated = { ...notifPrefs, [key]: value }
    setNotifPrefs(updated)
    // debounce-less: save immediately
    saveNotifPrefs(updated)
  }

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (loading) return null
  if (!dbUser) {
    if (typeof window !== 'undefined') router.push(loginHref('/settings'))
    return null
  }

  const accountMode  = (dbUser as any).accountType ?? (dbUser as any).role ?? 'ATTENDEE'
  const subTier      = (dbUser as any).subscriptionTier ?? (dbUser as any).tier ?? 'FREE'

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="max-w-lg mx-auto"
      style={{ background: '#04040d', minHeight: '100vh', paddingTop: 56, paddingBottom: 88 }}
    >
      {/* Header */}
      <div
        className="px-4 py-4 sticky top-14 z-10"
        style={{
          background: 'rgba(4,4,13,0.92)',
          borderBottom: '1px solid rgba(var(--accent-rgb),0.1)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <h1
          className="text-sm font-black tracking-widest"
          style={{ color: 'var(--accent)', textShadow: '0 0 16px rgba(var(--accent-rgb),0.4)', letterSpacing: '0.2em' }}
        >
          SETTINGS
        </h1>
      </div>

      <div className="px-4 py-5 space-y-6">

        {/* ── Age Verification (existing) ──────────────────────────────── */}
        <div>
          <SectionHeader icon={<Shield size={12} style={{ color: 'rgba(224,242,254,0.35)' }} />} label="VERIFICATION" />
          <SettingsCard>
            <div className="flex items-start gap-3 px-4 py-3.5">
              <Shield size={18} style={{ color: dbUser.ageVerified ? 'var(--accent)' : 'rgba(224,242,254,0.3)' }} className="shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>Age Verification</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.4)' }}>
                  {dbUser.ageVerified
                    ? '✅ Your age has been verified.'
                    : 'Go to your profile to verify your age.'}
                </p>
              </div>
            </div>
          </SettingsCard>
        </div>

        {/* ── Account info ─────────────────────────────────────────────── */}
        <div>
          <SectionHeader icon={<User size={12} style={{ color: 'rgba(224,242,254,0.35)' }} />} label="ACCOUNT" />
          <SettingsCard>
            <InfoRow
              label="Account Mode"
              value={accountMode}
              sublabel="Contact support to change account type"
            />
            <Divider />
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>Subscription</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.35)' }}>
                  Your current plan tier
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.25)', color: '#ffd600' }}
                >
                  {subTier}
                </span>
                {subTier === 'FREE' && (
                  <a
                    href="/pricing"
                    className="text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1"
                    style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)' }}
                  >
                    UPGRADE <ChevronRight size={10} />
                  </a>
                )}
              </div>
            </div>
          </SettingsCard>
        </div>

        {/* ── Notification preferences ─────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between px-4 pb-2 pt-1">
            <div className="flex items-center gap-2">
              <Bell size={12} style={{ color: 'rgba(224,242,254,0.35)' }} />
              <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(224,242,254,0.45)', letterSpacing: '0.15em' }}>
                NOTIFICATIONS
              </p>
            </div>
            {savingNotif && (
              <p className="text-[9px] font-bold" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>Saving…</p>
            )}
            {notifSaved && !savingNotif && (
              <p className="text-[9px] font-bold" style={{ color: 'var(--accent)' }}>Saved ✓</p>
            )}
          </div>

          <SettingsCard>
            <p className="text-[9px] font-bold px-4 pt-3 pb-1 tracking-widest" style={{ color: 'rgba(59,130,246,0.6)' }}>
              EMAIL
            </p>
            <ToggleRow
              label="RSVP Confirmations"
              sublabel="When your RSVP is confirmed"
              value={notifPrefs.emailRsvp}
              onChange={v => updateNotif('emailRsvp', v)}
              saving={savingNotif}
            />
            <Divider />
            <ToggleRow
              label="Event Reminders"
              sublabel="Before events you've RSVPed to"
              value={notifPrefs.emailEventReminder}
              onChange={v => updateNotif('emailEventReminder', v)}
              saving={savingNotif}
            />
            <Divider />
            <ToggleRow
              label="New Followers"
              sublabel="When someone follows you"
              value={notifPrefs.emailFollow}
              onChange={v => updateNotif('emailFollow', v)}
              saving={savingNotif}
            />
            <Divider />
            <ToggleRow
              label="Marketing & Offers"
              sublabel="Promotions and platform updates"
              value={notifPrefs.emailMarketing}
              onChange={v => updateNotif('emailMarketing', v)}
              saving={savingNotif}
            />

            <p className="text-[9px] font-bold px-4 pt-4 pb-1 tracking-widest" style={{ color: 'rgba(168,85,247,0.6)', borderTop: '1px solid rgba(var(--accent-rgb),0.05)' }}>
              PUSH
            </p>
            <ToggleRow
              label="RSVP Confirmations"
              value={notifPrefs.pushRsvp}
              onChange={v => updateNotif('pushRsvp', v)}
              saving={savingNotif}
              accent="#a855f7"
            />
            <Divider />
            <ToggleRow
              label="Event Reminders"
              value={notifPrefs.pushEventReminder}
              onChange={v => updateNotif('pushEventReminder', v)}
              saving={savingNotif}
              accent="#a855f7"
            />
            <Divider />
            <ToggleRow
              label="Celebrity Nearby"
              sublabel="When a celebrity is spotted near you"
              value={notifPrefs.pushCelebrityNearby}
              onChange={v => updateNotif('pushCelebrityNearby', v)}
              saving={savingNotif}
              accent="#ffd600"
            />
            <Divider />
            <ToggleRow
              label="New Followers"
              value={notifPrefs.pushFollow}
              onChange={v => updateNotif('pushFollow', v)}
              saving={savingNotif}
              accent="#a855f7"
            />
            <Divider />
            <ToggleRow
              label="Nudges"
              sublabel="When friends nudge you to go out"
              value={notifPrefs.pushNudge}
              onChange={v => updateNotif('pushNudge', v)}
              saving={savingNotif}
            />
            <Divider />
            <ToggleRow
              label="Go Out Requests"
              sublabel="When someone invites you out"
              value={notifPrefs.pushGoOut}
              onChange={v => updateNotif('pushGoOut', v)}
              saving={savingNotif}
            />
            <Divider />
            <ToggleRow
              label="Party Blasts"
              sublabel="Nearby event announcements"
              value={notifPrefs.pushPartyBlast}
              onChange={v => updateNotif('pushPartyBlast', v)}
              saving={savingNotif}
            />
          </SettingsCard>
        </div>

        {/* ── Privacy ──────────────────────────────────────────────────── */}
        <div>
          <SectionHeader icon={<Eye size={12} style={{ color: 'rgba(224,242,254,0.35)' }} />} label="PRIVACY" />
          <SettingsCard>
            <ToggleRow
              label="Show Me in Nearby People"
              sublabel="Let others discover you on the radar"
              value={privacyPrefs.showInNearby}
              onChange={v => savePrivacyPref('showInNearby', v)}
              saving={savingPrivacy}
            />
            <Divider />
            <ToggleRow
              label="Show Profile View Count"
              sublabel="Display how many people viewed your profile"
              value={privacyPrefs.showProfileViews}
              onChange={v => savePrivacyPref('showProfileViews', v)}
              saving={savingPrivacy}
            />
            <Divider />
            <ToggleRow
              label="Allow Go-Out Requests"
              sublabel="Accept requests from people you don't follow"
              value={privacyPrefs.allowGoOutFromStrangers}
              onChange={v => savePrivacyPref('allowGoOutFromStrangers', v)}
              saving={savingPrivacy}
            />
          </SettingsCard>
        </div>

        {/* ── Language ─────────────────────────────────────────────────── */}
        <div>
          <SectionHeader icon={<Globe size={12} style={{ color: 'rgba(224,242,254,0.35)' }} />} label="LANGUAGE" />
          <SettingsCard>
            {(Object.entries(LANGUAGE_META) as [Language, typeof LANGUAGE_META[Language]][]).map(([code, meta], i) => (
              <div key={code}>
                {i > 0 && <Divider />}
                <button
                  onClick={() => setLang(code)}
                  className="w-full flex items-center justify-between px-4 py-3.5"
                >
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: 18 }}>{meta.flag}</span>
                    <div className="text-left">
                      <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>{meta.nativeName}</p>
                      {meta.nativeName !== meta.name && (
                        <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.35)' }}>{meta.name}</p>
                      )}
                    </div>
                  </div>
                  {lang === code && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: 'var(--accent)' }}>
                      <span className="text-[10px] font-black" style={{ color: '#04040d' }}>✓</span>
                    </div>
                  )}
                </button>
              </div>
            ))}
          </SettingsCard>
        </div>

        {/* ── Danger zone ──────────────────────────────────────────────── */}
        <div>
          <SectionHeader icon={<AlertTriangle size={12} style={{ color: 'rgba(255,0,110,0.5)' }} />} label="DANGER ZONE" />
          <SettingsCard>
            <div className="px-4 py-4">
              <p className="text-[10px] mb-3" style={{ color: 'rgba(224,242,254,0.35)' }}>
                Deleting your account is permanent and cannot be undone. All your data, events, and wallet balance will be removed.
              </p>
              <div className="relative group">
                <button
                  disabled
                  className="w-full py-3 rounded-xl text-xs font-black tracking-widest opacity-40 cursor-not-allowed"
                  style={{
                    background: 'rgba(255,0,110,0.08)',
                    border: '1px solid rgba(255,0,110,0.25)',
                    color: '#ff006e',
                  }}
                >
                  DELETE ACCOUNT
                </button>
                {/* Tooltip */}
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg text-[10px] font-bold opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10"
                  style={{
                    background: 'rgba(24,24,27,0.98)',
                    border: '1px solid rgba(255,0,110,0.3)',
                    color: 'rgba(224,242,254,0.6)',
                  }}
                >
                  Contact support to delete your account
                </div>
              </div>
              <p className="text-[9px] text-center mt-2" style={{ color: 'rgba(224,242,254,0.2)' }}>
                Email support@partyradar.app to request account deletion
              </p>
            </div>
          </SettingsCard>
        </div>

      </div>
    </div>
  )
}
