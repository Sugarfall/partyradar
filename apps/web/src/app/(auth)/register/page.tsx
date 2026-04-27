'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/contexts/LanguageContext'
import { sendEmailVerification } from '@/lib/firebase'
import { api } from '@/lib/api'
import { getStoredReferral, clearStoredReferral, captureReferral } from '@/lib/referral'
import {
  Zap, Check, ChevronRight, Eye, EyeOff, Mail, Gift, X,
  ShieldCheck, User, Calendar, ChevronDown,
} from 'lucide-react'
import type { Gender } from '@partyradar/shared'

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'credentials' | 'verify' | 'age' | 'gender' | 'profile' | 'interests'

const INTEREST_OPTIONS = [
  { id: 'house_music',    label: 'House Music',     emoji: '🎛️' },
  { id: 'techno',         label: 'Techno',          emoji: '🔊' },
  { id: 'hip_hop',        label: 'Hip-Hop',         emoji: '🎤' },
  { id: 'rnb',            label: 'R&B',             emoji: '🎵' },
  { id: 'live_music',     label: 'Live Music',      emoji: '🎸' },
  { id: 'nightlife',      label: 'Nightlife',       emoji: '🌃' },
  { id: 'dancing',        label: 'Dancing',         emoji: '💃' },
  { id: 'cocktails',      label: 'Cocktails',       emoji: '🍹' },
  { id: 'craft_beer',     label: 'Craft Beer',      emoji: '🍺' },
  { id: 'rooftop',        label: 'Rooftops',        emoji: '🌆' },
  { id: 'lgbtplus',       label: 'LGBT+',           emoji: '🏳️‍🌈' },
  { id: 'sports',         label: 'Sports',          emoji: '⚽' },
  { id: 'festivals',      label: 'Festivals',       emoji: '🎪' },
  { id: 'networking',     label: 'Networking',      emoji: '🤝' },
  { id: 'yacht_party',    label: 'Yacht Parties',   emoji: '⛵' },
  { id: 'beach_party',    label: 'Beach Parties',   emoji: '🏖️' },
  { id: 'home_party',     label: 'House Parties',   emoji: '🏠' },
  { id: 'pub_crawl',      label: 'Pub Crawls',      emoji: '🍻' },
]

const GENDER_OPTIONS: { id: Gender; label: string; emoji: string; color: string; glow: string }[] = [
  { id: 'MALE',              label: 'Man',              emoji: '♂',  color: '#3d5afe', glow: 'rgba(61,90,254,0.35)'  },
  { id: 'FEMALE',            label: 'Woman',            emoji: '♀',  color: '#ff006e', glow: 'rgba(255,0,110,0.35)' },
  { id: 'NON_BINARY',        label: 'Non-binary',       emoji: '⚧',  color: 'var(--accent)', glow: 'rgba(var(--accent-rgb),0.35)' },
  { id: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say', emoji: '🔒', color: 'rgba(74,96,128,0.9)', glow: 'rgba(74,96,128,0.2)' },
]

// 18 years ago today (max DOB for 18+ verification)
function maxDob() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 18)
  return d.toISOString().split('T')[0]!
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function applyStoredReferral() {
  const code = getStoredReferral()
  if (!code) return
  try {
    await api.post('/referrals/apply', { code })
  } catch {
    // non-fatal: already applied, invalid, self-referral etc.
  } finally {
    clearStoredReferral()
  }
}

function Logo() {
  return (
    <div className="flex items-center gap-2 mb-8">
      <Zap size={20} fill="rgba(var(--accent-rgb),0.2)"
        style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 8px rgba(var(--accent-rgb),0.8))' }} />
      <span className="font-black text-sm tracking-[0.2em]"
        style={{ color: 'var(--accent)', textShadow: '0 0 16px rgba(var(--accent-rgb),0.6)' }}>
        PARTYRADAR
      </span>
    </div>
  )
}

function StepDots({ phase }: { phase: Phase }) {
  const steps: Phase[] = ['credentials', 'verify', 'age', 'gender', 'profile', 'interests']
  const current = steps.indexOf(phase)
  return (
    <div className="flex items-center gap-1.5 mb-8">
      {steps.map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === current ? 20 : 6,
            height: 6,
            background: i <= current
              ? 'var(--accent)'
              : 'rgba(var(--accent-rgb),0.15)',
            boxShadow: i === current ? '0 0 8px rgba(var(--accent-rgb),0.6)' : 'none',
          }}
        />
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter()
  const { signUp, signInWithGoogle, signInWithApple, firebaseUser } = useAuth()
  const { t } = useLanguage()

  const [phase, setPhase]           = useState<Phase>('credentials')

  // Credentials phase
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [showPw, setShowPw]         = useState(false)
  const [loading, setLoading]       = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [appleLoading, setAppleLoading]   = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // Referral code
  const [refCode, setRefCode]       = useState<string | null>(null)
  const [showRefInput, setShowRefInput] = useState(false)
  const [manualRef, setManualRef]   = useState('')
  const [refBannerDismissed, setRefBannerDismissed] = useState(false)

  // Verify phase
  const [verifyError, setVerifyError]     = useState<string | null>(null)
  const [checkingVerify, setCheckingVerify] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  // Age phase
  const [dob, setDob]               = useState('')
  const [ageLoading, setAgeLoading] = useState(false)
  const [ageError, setAgeError]     = useState<string | null>(null)

  // Gender phase
  const [gender, setGender]         = useState<Gender | null>(null)
  const [genderSaving, setGenderSaving] = useState(false)

  // Profile phase
  const [displayName, setDisplayName]   = useState('')
  const [bio, setBio]                   = useState('')
  const [photoUrl, setPhotoUrl]         = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Interests phase
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [interestsSaving, setInterestsSaving] = useState(false)

  /* ── On mount: capture ?ref= and read stored code ── */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const urlRef = new URLSearchParams(window.location.search).get('ref')
    if (urlRef) captureReferral(urlRef)
    const stored = getStoredReferral()
    setRefCode(stored)
    if (stored) setManualRef(stored)
  }, [])

  // ── Credentials phase ────────────────────────────────────────────────────

  function handleManualRefChange(val: string) {
    setManualRef(val)
    const cleaned = val.trim()
    if (cleaned) {
      captureReferral(cleaned) // save to localStorage
      setRefCode(cleaned.toUpperCase())
    } else {
      clearStoredReferral()
      setRefCode(null)
    }
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must include at least one letter and one number'); return
    }
    setLoading(true)
    setError(null)
    try {
      await signUp(email, password)
      setPhase('verify')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.replace('Firebase: ', '').replace(/\(.*\)\.?/, '') : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  function parseAuthError(err: unknown): string {
    const e = err as { code?: string; message?: string }
    const code = e?.code ?? ''
    if (code === 'auth/unauthorized-domain') {
      const domain = typeof window !== 'undefined' ? window.location.hostname : 'this domain'
      return `Add "${domain}" to Firebase Console → Authentication → Authorised Domains`
    }
    if (code === 'auth/operation-not-allowed') return 'Google sign-in is not enabled'
    if (code === 'auth/popup-blocked') return 'Popup was blocked — allow popups for this site'
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return ''
    if (code === 'auth/account-exists-with-different-credential') return 'An account already exists with this email'
    if (code === 'auth/email-already-in-use') return 'This email is already registered — sign in instead'
    return e?.message?.replace('Firebase: ', '').replace(/\s*\(auth\/[^)]+\)\.?/, '') ?? `Sign-up failed (${code || 'unknown'})`
  }

  async function handleGoogleSignUp() {
    setGoogleLoading(true); setError(null)
    try {
      await signInWithGoogle()
      await applyStoredReferral()
      setPhase('age')
    } catch (err) {
      const msg = parseAuthError(err)
      if (msg) setError(msg)
    } finally { setGoogleLoading(false) }
  }

  async function handleAppleSignUp() {
    setAppleLoading(true); setError(null)
    try {
      await signInWithApple()
      await applyStoredReferral()
      setPhase('age')
    } catch (err) {
      const msg = parseAuthError(err)
      if (msg) setError(msg)
    } finally { setAppleLoading(false) }
  }

  // ── Verify email phase ───────────────────────────────────────────────────

  async function handleVerifyCheck() {
    if (!firebaseUser) return
    setCheckingVerify(true); setVerifyError(null)
    try {
      await firebaseUser.reload()
      if (firebaseUser.emailVerified) {
        await applyStoredReferral()
        setPhase('age')
      } else {
        setVerifyError("Email not verified yet — click the link in your inbox then try again")
      }
    } catch {
      setVerifyError('Could not check verification — please try again')
    } finally { setCheckingVerify(false) }
  }

  async function handleResend() {
    if (!firebaseUser || resendCooldown > 0) return
    try {
      await sendEmailVerification(firebaseUser)
      setResendCooldown(60)
      const interval = setInterval(() => {
        setResendCooldown(v => { if (v <= 1) { clearInterval(interval); return 0 }; return v - 1 })
      }, 1000)
      setVerifyError(null)
    } catch { setVerifyError('Could not resend — please try again shortly') }
  }

  // ── Age verify phase ─────────────────────────────────────────────────────

  async function handleAgeVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!dob) { setAgeError('Please enter your date of birth'); return }
    setAgeLoading(true); setAgeError(null)
    try {
      await api.post('/auth/age-verify', { dateOfBirth: dob })
      setPhase('gender')
    } catch (err: unknown) {
      setAgeError((err as { message?: string })?.message ?? 'Verification failed — please try again')
    } finally { setAgeLoading(false) }
  }

  // ── Gender phase ─────────────────────────────────────────────────────────

  async function handleGenderNext() {
    if (!gender) return
    setGenderSaving(true)
    try {
      await api.put('/auth/profile', { gender })
    } catch { /* non-fatal */ } finally { setGenderSaving(false) }
    setPhase('profile')
  }

  // ── Profile setup phase ──────────────────────────────────────────────────

  async function handleProfileFinish(e: React.FormEvent) {
    e.preventDefault()
    if (!displayName.trim()) { setProfileError('Please enter your display name'); return }
    setProfileSaving(true); setProfileError(null)
    try {
      await api.put('/auth/profile', {
        displayName: displayName.trim(),
        bio: bio.trim() || undefined,
        photoUrl: photoUrl.trim() || undefined,
      })
      setPhase('interests')
    } catch (err: unknown) {
      setProfileError((err as { message?: string })?.message ?? 'Could not save profile — please try again')
    } finally { setProfileSaving(false) }
  }

  // ── Interests phase ──────────────────────────────────────────────────────

  function toggleInterest(id: string) {
    setSelectedInterests(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id],
    )
  }

  async function handleInterestsFinish() {
    setInterestsSaving(true)
    try {
      if (selectedInterests.length > 0) {
        await api.put('/auth/profile', { interests: selectedInterests })
      }
    } catch { /* non-fatal */ } finally { setInterestsSaving(false) }
    router.push('/discover')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE: INTERESTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (phase === 'interests') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8" style={{ background: '#04040d' }}>
        <Logo />
        <StepDots phase="interests" />
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <span className="text-3xl">🎉</span>
            </div>
            <p className="text-[10px] font-bold tracking-[0.3em] mb-2" style={{ color: 'rgba(168,85,247,0.6)' }}>
              STEP 6 OF 6 · ALMOST THERE
            </p>
            <h1 className="text-2xl font-black" style={{ color: '#e0f2fe' }}>WHAT ARE YOU INTO?</h1>
            <p className="text-sm mt-2" style={{ color: 'rgba(224,242,254,0.45)', lineHeight: 1.6 }}>
              Pick your vibes — we&apos;ll surface events that match your interests.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {INTEREST_OPTIONS.map(opt => {
              const active = selectedInterests.includes(opt.id)
              return (
                <button
                  key={opt.id}
                  onClick={() => toggleInterest(opt.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold transition-all"
                  style={{
                    background: active ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)',
                    border: active ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(74,96,128,0.2)',
                    color: active ? '#a855f7' : 'rgba(224,242,254,0.45)',
                    boxShadow: active ? '0 0 12px rgba(168,85,247,0.15)' : 'none',
                    transform: active ? 'scale(1.04)' : 'scale(1)',
                  }}
                >
                  <span>{opt.emoji}</span>
                  {opt.label}
                </button>
              )
            })}
          </div>

          {selectedInterests.length > 0 && (
            <p className="text-center text-[10px] mb-4" style={{ color: 'rgba(168,85,247,0.5)' }}>
              {selectedInterests.length} selected — events matching your vibe will be highlighted
            </p>
          )}

          <button
            onClick={handleInterestsFinish}
            disabled={interestsSaving}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-sm transition-all duration-200"
            style={{
              background: selectedInterests.length > 0
                ? 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(var(--accent-rgb),0.1))'
                : 'rgba(var(--accent-rgb),0.06)',
              border: `1px solid ${selectedInterests.length > 0 ? 'rgba(168,85,247,0.5)' : 'rgba(var(--accent-rgb),0.15)'}`,
              color: selectedInterests.length > 0 ? '#a855f7' : 'rgba(var(--accent-rgb),0.4)',
              boxShadow: selectedInterests.length > 0 ? '0 0 20px rgba(168,85,247,0.2)' : 'none',
              letterSpacing: '0.12em',
            }}
          >
            {interestsSaving
              ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> SAVING…</>
              : selectedInterests.length > 0
                ? <><Zap size={14} /> ENTER PARTYRADAR</>
                : 'SKIP & ENTER PARTYRADAR'
            }
          </button>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE: VERIFY EMAIL
  // ═══════════════════════════════════════════════════════════════════════════

  if (phase === 'verify') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8" style={{ background: '#04040d' }}>
        <Logo />
        <StepDots phase="verify" />
        <div className="w-full max-w-sm text-center space-y-5">
          <div className="flex items-center justify-center mx-auto w-16 h-16 rounded-2xl"
            style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
            <Mail size={28} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.3em] mb-2" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
              STEP 2 OF 5
            </p>
            <h1 className="text-2xl font-black" style={{ color: '#e0f2fe' }}>CHECK YOUR INBOX</h1>
            <p className="text-sm mt-3" style={{ color: 'rgba(224,242,254,0.5)', lineHeight: 1.6 }}>
              We sent a verification link to{' '}
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{email}</span>.
              <br />Click the link, then tap below.
            </p>
          </div>

          {verifyError && (
            <p className="text-xs px-4 py-2.5 rounded-xl font-bold"
              style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
              {verifyError}
            </p>
          )}

          <button onClick={handleVerifyCheck} disabled={checkingVerify}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black tracking-widest disabled:opacity-50"
            style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.35)', color: 'var(--accent)' }}>
            {checkingVerify
              ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> CHECKING…</>
              : <><Check size={14} /> I'VE VERIFIED MY EMAIL</>
            }
          </button>

          <button onClick={handleResend} disabled={resendCooldown > 0}
            className="text-xs font-bold"
            style={{ color: resendCooldown > 0 ? 'rgba(var(--accent-rgb),0.25)' : 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.1em' }}>
            {resendCooldown > 0 ? `RESEND IN ${resendCooldown}s` : 'RESEND VERIFICATION EMAIL'}
          </button>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE: AGE VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  if (phase === 'age') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8" style={{ background: '#04040d' }}>
        <Logo />
        <StepDots phase="age" />
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
              style={{ background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
              <ShieldCheck size={28} style={{ color: '#ff006e' }} />
            </div>
            <p className="text-[10px] font-bold tracking-[0.3em] mb-2" style={{ color: 'rgba(255,0,110,0.5)' }}>
              STEP 3 OF 5
            </p>
            <h1 className="text-2xl font-black" style={{ color: '#e0f2fe' }}>AGE VERIFICATION</h1>
            <p className="text-sm mt-2" style={{ color: 'rgba(224,242,254,0.45)', lineHeight: 1.6 }}>
              PartyRadar is for adults only.<br />You must be 18 or older to continue.
            </p>
          </div>

          <form onSubmit={handleAgeVerify} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold tracking-[0.2em] mb-1.5"
                style={{ color: 'rgba(224,242,254,0.4)' }}>
                DATE OF BIRTH
              </label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(var(--accent-rgb),0.4)', pointerEvents: 'none' }} />
                <input
                  type="date"
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                  max={maxDob()}
                  required
                  className="w-full pl-9 pr-3 py-3 rounded-xl text-sm font-medium focus:outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: dob ? '#e0f2fe' : 'rgba(224,242,254,0.3)' }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.5)'; e.target.style.boxShadow = '0 0 12px rgba(var(--accent-rgb),0.1)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.2)'; e.target.style.boxShadow = 'none' }}
                />
              </div>
              <p className="text-[9px] mt-1.5" style={{ color: 'rgba(224,242,254,0.25)' }}>
                🔒 Your date of birth is stored securely and never shown publicly
              </p>
            </div>

            {ageError && (
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
                style={{ background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
                <X size={13} style={{ color: '#ff006e', marginTop: 1, flexShrink: 0 }} />
                <p className="text-xs font-bold" style={{ color: '#ff006e' }}>{ageError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={ageLoading || !dob}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black tracking-widest transition-all duration-200"
              style={{
                background: dob && !ageLoading
                  ? 'linear-gradient(135deg, rgba(255,0,110,0.18), rgba(255,0,110,0.08))'
                  : 'rgba(255,0,110,0.04)',
                border: `1px solid ${dob ? 'rgba(255,0,110,0.5)' : 'rgba(255,0,110,0.12)'}`,
                color: dob ? '#ff006e' : 'rgba(255,0,110,0.25)',
                boxShadow: dob ? '0 0 20px rgba(255,0,110,0.15)' : 'none',
              }}
            >
              {ageLoading
                ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> VERIFYING…</>
                : <><ShieldCheck size={14} /> CONFIRM MY AGE</>
              }
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE: GENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (phase === 'gender') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8" style={{ background: '#04040d' }}>
        <Logo />
        <StepDots phase="gender" />
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <p className="text-[10px] font-bold tracking-[0.3em] mb-2" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
              STEP 4 OF 5
            </p>
            <h1 className="text-2xl font-black" style={{ color: '#e0f2fe' }}>
              {t('register.gender.title')}
            </h1>
            <p className="text-sm mt-2" style={{ color: 'rgba(74,96,128,0.8)' }}>
              Used for event gender ratios and the match deck — always private
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {GENDER_OPTIONS.map(opt => {
              const selected = gender === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => setGender(opt.id)}
                  className="relative flex flex-col items-center gap-3 py-6 rounded-2xl transition-all duration-200"
                  style={{
                    background: selected ? `${opt.color}12` : 'rgba(7,7,26,0.8)',
                    border: selected ? `1px solid ${opt.color}55` : '1px solid rgba(var(--accent-rgb),0.1)',
                    boxShadow: selected ? `0 0 28px ${opt.glow}` : 'none',
                    transform: selected ? 'scale(1.03)' : 'scale(1)',
                  }}
                >
                  {selected && <>
                    <div className="absolute top-2 left-2 w-3 h-3" style={{ borderTop: `1.5px solid ${opt.color}70`, borderLeft: `1.5px solid ${opt.color}70` }} />
                    <div className="absolute bottom-2 right-2 w-3 h-3" style={{ borderBottom: `1.5px solid ${opt.color}70`, borderRight: `1.5px solid ${opt.color}70` }} />
                  </>}
                  <span className="text-3xl font-black" style={{ color: selected ? opt.color : 'rgba(74,96,128,0.6)', textShadow: selected ? `0 0 16px ${opt.glow}` : 'none', fontFamily: 'system-ui' }}>
                    {opt.emoji}
                  </span>
                  <span className="text-[10px] font-black tracking-widest text-center leading-tight px-1"
                    style={{ color: selected ? opt.color : 'rgba(74,96,128,0.6)' }}>
                    {opt.label}
                  </span>
                  {selected && (
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: opt.color, boxShadow: `0 0 8px ${opt.glow}` }}>
                      <Check size={10} color="#04040d" strokeWidth={3} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <p className="text-center text-[10px] mb-6" style={{ color: 'rgba(74,96,128,0.6)' }}>
            You can update this anytime in Settings.
          </p>

          <button
            onClick={handleGenderNext}
            disabled={!gender || genderSaving}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-sm transition-all duration-200"
            style={{
              background: gender ? 'linear-gradient(135deg, rgba(var(--accent-rgb),0.15), rgba(61,90,254,0.12))' : 'rgba(var(--accent-rgb),0.04)',
              border: `1px solid ${gender ? 'rgba(var(--accent-rgb),0.5)' : 'rgba(var(--accent-rgb),0.12)'}`,
              color: gender ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.3)',
              boxShadow: gender ? '0 0 20px rgba(var(--accent-rgb),0.2)' : 'none',
              letterSpacing: '0.12em',
            }}
          >
            {genderSaving
              ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> SAVING…</>
              : gender ? <><ChevronRight size={14} /> NEXT</> : 'SELECT TO CONTINUE'
            }
          </button>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE: PROFILE SETUP
  // ═══════════════════════════════════════════════════════════════════════════

  if (phase === 'profile') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8" style={{ background: '#04040d' }}>
        <Logo />
        <StepDots phase="profile" />
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
              style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
              <User size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-[10px] font-bold tracking-[0.3em] mb-2" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
              STEP 5 OF 6
            </p>
            <h1 className="text-2xl font-black" style={{ color: '#e0f2fe' }}>SET UP YOUR PROFILE</h1>
            <p className="text-sm mt-2" style={{ color: 'rgba(224,242,254,0.45)' }}>
              Tell people who you are. You can always edit this later.
            </p>
          </div>

          <form onSubmit={handleProfileFinish} className="space-y-3">
            {/* Display name — required */}
            <div>
              <label className="block text-[10px] font-bold tracking-[0.2em] mb-1.5"
                style={{ color: 'rgba(224,242,254,0.4)' }}>
                DISPLAY NAME <span style={{ color: '#ff006e' }}>*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value.slice(0, 60))}
                placeholder="How you appear to others"
                maxLength={60}
                className="w-full px-3 py-2.5 rounded-xl text-sm font-medium focus:outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: '#e0f2fe' }}
                onFocus={e => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.5)'; e.target.style.boxShadow = '0 0 12px rgba(var(--accent-rgb),0.1)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.2)'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Bio — optional */}
            <div>
              <label className="block text-[10px] font-bold tracking-[0.2em] mb-1.5"
                style={{ color: 'rgba(224,242,254,0.4)' }}>
                BIO <span style={{ color: 'rgba(224,242,254,0.2)', fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value.slice(0, 300))}
                placeholder="What kind of nights are you into?"
                rows={3}
                maxLength={300}
                className="w-full px-3 py-2.5 rounded-xl text-sm font-medium focus:outline-none transition-all resize-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: '#e0f2fe' }}
                onFocus={e => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.4)'; e.target.style.boxShadow = '0 0 12px rgba(var(--accent-rgb),0.08)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.15)'; e.target.style.boxShadow = 'none' }}
              />
              <p className="text-right text-[9px] mt-0.5" style={{ color: 'rgba(224,242,254,0.2)' }}>
                {bio.length}/300
              </p>
            </div>

            {/* Photo URL — optional */}
            <div>
              <label className="block text-[10px] font-bold tracking-[0.2em] mb-1.5"
                style={{ color: 'rgba(224,242,254,0.4)' }}>
                PROFILE PHOTO URL <span style={{ color: 'rgba(224,242,254,0.2)', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="url"
                value={photoUrl}
                onChange={e => setPhotoUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2.5 rounded-xl text-sm font-medium focus:outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: '#e0f2fe' }}
                onFocus={e => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.4)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.15)' }}
              />
              <p className="text-[9px] mt-1" style={{ color: 'rgba(224,242,254,0.2)' }}>
                Tip: upload to Imgur or Cloudinary first, then paste the link here
              </p>
            </div>

            {profileError && (
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
                style={{ background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
                <X size={13} style={{ color: '#ff006e', marginTop: 1, flexShrink: 0 }} />
                <p className="text-xs font-bold" style={{ color: '#ff006e' }}>{profileError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={profileSaving || !displayName.trim()}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-sm transition-all duration-200 mt-2"
              style={{
                background: displayName.trim()
                  ? 'linear-gradient(135deg, rgba(var(--accent-rgb),0.2), rgba(0,255,136,0.1))'
                  : 'rgba(var(--accent-rgb),0.04)',
                border: `1px solid ${displayName.trim() ? 'rgba(var(--accent-rgb),0.5)' : 'rgba(var(--accent-rgb),0.12)'}`,
                color: displayName.trim() ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.3)',
                boxShadow: displayName.trim() ? '0 0 20px rgba(var(--accent-rgb),0.2)' : 'none',
                letterSpacing: '0.12em',
              }}
            >
              {profileSaving
                ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> SAVING…</>
                : <><ChevronRight size={14} /> NEXT — PICK YOUR INTERESTS</>
              }
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE: CREDENTIALS (default)
  // ═══════════════════════════════════════════════════════════════════════════

  const activeRef = refCode && !refBannerDismissed

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8" style={{ background: '#04040d' }}>
      <Logo />
      <StepDots phase="credentials" />

      <div
        className="w-full max-w-sm relative"
        style={{
          background: 'rgba(4,4,13,0.85)',
          border: '1px solid rgba(var(--accent-rgb),0.15)',
          borderRadius: 20,
          padding: '32px 28px',
          boxShadow: '0 0 60px rgba(var(--accent-rgb),0.08)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Corner brackets */}
        <div className="absolute top-3 left-3 w-4 h-4" style={{ borderTop: '2px solid rgba(var(--accent-rgb),0.4)', borderLeft: '2px solid rgba(var(--accent-rgb),0.4)' }} />
        <div className="absolute top-3 right-3 w-4 h-4" style={{ borderTop: '2px solid rgba(var(--accent-rgb),0.4)', borderRight: '2px solid rgba(var(--accent-rgb),0.4)' }} />
        <div className="absolute bottom-3 left-3 w-4 h-4" style={{ borderBottom: '2px solid rgba(var(--accent-rgb),0.4)', borderLeft: '2px solid rgba(var(--accent-rgb),0.4)' }} />
        <div className="absolute bottom-3 right-3 w-4 h-4" style={{ borderBottom: '2px solid rgba(var(--accent-rgb),0.4)', borderRight: '2px solid rgba(var(--accent-rgb),0.4)' }} />

        <div className="text-center mb-6">
          <p className="text-[10px] font-bold tracking-[0.25em] mb-1" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
            STEP 1 OF 5 · CREATE ACCOUNT
          </p>
          <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.3), transparent)' }} />
        </div>

        {/* Referral banner (link-based or manually entered) */}
        {activeRef && (
          <div
            className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl mb-4"
            style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)' }}
          >
            <Gift size={14} style={{ color: '#00ff88', marginTop: 2, flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold" style={{ color: '#00ff88' }}>Referral code active</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.5)' }}>
                Code <span className="font-mono font-bold" style={{ color: '#e0f2fe' }}>{refCode}</span> will link when you register.
              </p>
            </div>
            <button type="button"
              onClick={() => { setRefBannerDismissed(true); setRefCode(null); setManualRef(''); clearStoredReferral() }}
              className="p-0.5 rounded" style={{ color: 'rgba(0,255,136,0.5)' }}>
              <X size={12} />
            </button>
          </div>
        )}

        {/* Google */}
        <button onClick={handleGoogleSignUp} disabled={googleLoading}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg font-bold text-xs mb-3 transition-all duration-200"
          style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'rgba(224,242,254,0.7)', letterSpacing: '0.08em' }}>
          {googleLoading ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" /> : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M15.68 8.18c0-.57-.05-1.12-.14-1.64H8v3.1h4.31a3.68 3.68 0 01-1.6 2.42v2h2.58c1.51-1.39 2.39-3.45 2.39-5.88z" fill="#4285F4"/>
              <path d="M8 16c2.16 0 3.97-.72 5.3-1.94l-2.58-2a4.77 4.77 0 01-7.12-2.5H.64v2.06A8 8 0 008 16z" fill="#34A853"/>
              <path d="M3.6 9.56A4.8 4.8 0 013.36 8c0-.54.1-1.07.24-1.56V4.38H.64A8 8 0 000 8c0 1.3.31 2.52.64 3.62l2.96-2.06z" fill="#FBBC05"/>
              <path d="M8 3.18c1.22 0 2.31.42 3.17 1.24l2.37-2.37A8 8 0 00.64 4.38l2.96 2.06A4.77 4.77 0 018 3.18z" fill="#EA4335"/>
            </svg>
          )}
          CONTINUE WITH GOOGLE
        </button>

        {/* Apple */}
        <button onClick={handleAppleSignUp} disabled={appleLoading}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg font-bold text-xs mb-4 transition-all duration-200"
          style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'rgba(224,242,254,0.7)', letterSpacing: '0.08em' }}>
          {appleLoading ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" /> : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516.024.034 1.52.087 2.475-1.258.955-1.345.762-2.391.728-2.43zm3.314 11.467c-.034-.058-2.088-1.222-2.048-3.513.04-2.291 1.774-3.11 1.808-3.15.034-.04-1.004-1.443-2.648-1.443-1.152 0-1.698.693-2.538.693-.84 0-1.548-.664-2.538-.664C4.792 3.398 3 5.064 3 7.882c0 1.717.632 3.53 1.412 4.7.658.985 1.372 1.862 2.316 1.862.892 0 1.28-.585 2.392-.585 1.112 0 1.41.572 2.37.56.97-.012 1.63-.873 2.286-1.856.464-.695.794-1.36.96-1.72.028-.06.062-.13.062-.13s-.05-.028-.062-.038z"/>
            </svg>
          )}
          CONTINUE WITH APPLE
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px" style={{ background: 'rgba(var(--accent-rgb),0.1)' }} />
          <span className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.6)' }}>OR</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(var(--accent-rgb),0.1)' }} />
        </div>

        <form onSubmit={handleCredentials} className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold tracking-[0.2em] mb-1.5" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
              required autoComplete="email"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-all duration-200"
              style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.18)', color: '#e0f2fe' }}
              onFocus={e => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.5)'; e.target.style.boxShadow = '0 0 12px rgba(var(--accent-rgb),0.1)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.18)'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold tracking-[0.2em] mb-1.5" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>PASSWORD</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 chars (letters + numbers)" required minLength={6} autoComplete="new-password"
                className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm font-medium focus:outline-none transition-all duration-200"
                style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.18)', color: '#e0f2fe' }}
                onFocus={e => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.5)'; e.target.style.boxShadow = '0 0 12px rgba(var(--accent-rgb),0.1)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.18)'; e.target.style.boxShadow = 'none' }}
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
                {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          {/* Referral code — collapsible */}
          <div>
            <button
              type="button"
              onClick={() => setShowRefInput(v => !v)}
              className="flex items-center gap-1.5 text-[10px] font-bold transition-colors"
              style={{ color: showRefInput || activeRef ? 'rgba(0,255,136,0.7)' : 'rgba(var(--accent-rgb),0.35)', letterSpacing: '0.1em' }}
            >
              <Gift size={11} />
              HAVE A REFERRAL CODE?
              <ChevronDown size={11} style={{ transform: showRefInput ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {showRefInput && (
              <div className="mt-2">
                <input
                  type="text"
                  value={manualRef}
                  onChange={e => handleManualRefChange(e.target.value)}
                  placeholder="e.g. RADIO1 or TRIPPYBOY"
                  maxLength={20}
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono font-bold focus:outline-none transition-all uppercase"
                  style={{
                    background: manualRef ? 'rgba(0,255,136,0.05)' : 'rgba(var(--accent-rgb),0.03)',
                    border: manualRef ? '1px solid rgba(0,255,136,0.3)' : '1px solid rgba(var(--accent-rgb),0.15)',
                    color: manualRef ? '#00ff88' : 'rgba(224,242,254,0.5)',
                    letterSpacing: '0.1em',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(0,255,136,0.4)'; e.target.style.boxShadow = '0 0 10px rgba(0,255,136,0.08)' }}
                  onBlur={e => {
                    e.target.style.borderColor = manualRef ? 'rgba(0,255,136,0.3)' : 'rgba(var(--accent-rgb),0.15)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                <p className="text-[9px] mt-1" style={{ color: 'rgba(224,242,254,0.2)' }}>
                  Code will be applied automatically when you register
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all duration-200 mt-1"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.15), rgba(61,90,254,0.12))',
              border: '1px solid rgba(var(--accent-rgb),0.45)',
              color: 'var(--accent)',
              boxShadow: '0 0 18px rgba(var(--accent-rgb),0.18)',
              letterSpacing: '0.1em',
              opacity: loading ? 0.7 : 1,
            }}>
            {loading
              ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> CREATING…</>
              : <>CONTINUE <ChevronRight size={14} /></>
            }
          </button>
        </form>

        <p className="text-center text-[11px] mt-5" style={{ color: 'rgba(74,96,128,0.6)' }}>
          Already have an account?{' '}
          <Link href="/login" className="font-bold" style={{ color: 'rgba(var(--accent-rgb),0.6)' }}>LOG IN</Link>
        </p>
      </div>
    </div>
  )
}
