'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/contexts/LanguageContext'
import { sendEmailVerification } from '@/lib/firebase'
import { api } from '@/lib/api'
import { Zap, Check, ChevronRight, Eye, EyeOff, Mail } from 'lucide-react'
import type { Gender } from '@partyradar/shared'
import { LANGUAGE_META } from '@/lib/i18n'
import type { Language } from '@/lib/i18n'

const GENDER_OPTIONS: { id: Gender; labelKey: string; emoji: string; color: string; glow: string }[] = [
  { id: 'MALE',              labelKey: 'register.gender.man',        emoji: '♂',  color: '#3d5afe', glow: 'rgba(61,90,254,0.35)'  },
  { id: 'FEMALE',            labelKey: 'register.gender.woman',      emoji: '♀',  color: '#ff006e', glow: 'rgba(255,0,110,0.35)' },
  { id: 'NON_BINARY',        labelKey: 'register.gender.non_binary', emoji: '⚧',  color: 'var(--accent)', glow: 'rgba(var(--accent-rgb),0.35)' },
  { id: 'PREFER_NOT_TO_SAY', labelKey: 'register.gender.prefer_not', emoji: '🔒', color: 'rgba(74,96,128,0.9)', glow: 'rgba(74,96,128,0.2)' },
]

function saveGenderLocally(gender: Gender) {
  try { localStorage.setItem('partyradar_gender', gender) } catch {}
}

export default function RegisterPage() {
  const router = useRouter()
  const { signUp, signInWithGoogle, signInWithApple, firebaseUser } = useAuth()
  const { lang, setLang, t } = useLanguage()

  const [phase, setPhase] = useState<'language' | 'credentials' | 'verify' | 'gender'>('language')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [gender, setGender] = useState<Gender | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [appleLoading, setAppleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [checkingVerify, setCheckingVerify] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  /* ── Phase 1: credentials ── */
  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
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

  /* ── Phase 2: verify email ── */
  async function handleVerifyCheck() {
    if (!firebaseUser) return
    setCheckingVerify(true)
    setVerifyError(null)
    try {
      await firebaseUser.reload()
      if (firebaseUser.emailVerified) {
        setPhase('gender')
      } else {
        setVerifyError('Email not verified yet — click the link in your inbox then try again')
      }
    } catch {
      setVerifyError('Could not check verification — please try again')
    } finally {
      setCheckingVerify(false)
    }
  }

  async function handleResend() {
    if (!firebaseUser || resendCooldown > 0) return
    try {
      await sendEmailVerification(firebaseUser)
      setResendCooldown(60)
      const interval = setInterval(() => {
        setResendCooldown(v => {
          if (v <= 1) { clearInterval(interval); return 0 }
          return v - 1
        })
      }, 1000)
      setVerifyError(null)
    } catch {
      setVerifyError('Could not resend — please try again shortly')
    }
  }

  function parseAuthError(err: any): string {
    const code = err?.code ?? ''
    if (code === 'auth/unauthorized-domain') {
      const domain = typeof window !== 'undefined' ? window.location.hostname : 'this domain'
      return `Add "${domain}" to Firebase Console → Authentication → Authorised Domains`
    }
    if (code === 'auth/operation-not-allowed') return 'Google sign-in is not enabled — check Firebase Console → Sign-in method'
    if (code === 'auth/popup-blocked') return 'Popup was blocked — allow popups for this site and try again'
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return ''
    if (code === 'auth/account-exists-with-different-credential') return 'An account already exists with this email — try signing in with email/password'
    if (code === 'auth/email-already-in-use') return 'This email is already registered — sign in instead'
    return err?.message?.replace('Firebase: ', '').replace(/\s*\(auth\/[^)]+\)\.?/, '') ?? `Sign-up failed (${code || 'unknown'})`
  }

  async function handleGoogleSignUp() {
    setGoogleLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
      setPhase('gender') // Google accounts are always verified
    } catch (err: any) {
      const msg = parseAuthError(err)
      if (msg) setError(msg)
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleAppleSignUp() {
    setAppleLoading(true)
    setError(null)
    try {
      await signInWithApple()
      setPhase('gender')
    } catch (err: any) {
      const msg = parseAuthError(err)
      if (msg) setError(msg)
    } finally {
      setAppleLoading(false)
    }
  }

  /* ── Phase 2: gender → finish ── */
  async function handleFinish() {
    if (gender) {
      saveGenderLocally(gender)
      try {
        await api.put('/auth/profile', { gender })
      } catch {
        // Don't block navigation if API call fails
      }
    }
    router.push('/discover')
  }

  /* ═══ PHASE: LANGUAGE SELECTION ═════════════════════════════════════════ */
  if (phase === 'language') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8" style={{ background: '#04040d' }}>
        <div className="flex items-center gap-2 mb-10">
          <Zap size={20} fill="rgba(var(--accent-rgb),0.2)"
            style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 8px rgba(var(--accent-rgb),0.8))' }} />
          <span className="font-black text-sm tracking-[0.2em]"
            style={{ color: 'var(--accent)', textShadow: '0 0 16px rgba(var(--accent-rgb),0.6)' }}>
            PARTYRADAR
          </span>
        </div>

        <div className="w-full max-w-sm animate-fade-up text-center">
          <p className="text-[10px] font-bold tracking-[0.3em] mb-2" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
            LANGUAGE / JĘZYK
          </p>
          <h1 className="text-2xl font-black mb-2" style={{ color: '#e0f2fe', letterSpacing: '0.04em' }}>
            {t('register.lang.title')}
          </h1>
          <p className="text-sm mb-8" style={{ color: 'rgba(74,96,128,0.7)' }}>
            {t('register.lang.subtitle')}
          </p>

          <div className="flex flex-col gap-3 mb-8">
            {(Object.entries(LANGUAGE_META) as [Language, typeof LANGUAGE_META[Language]][]).map(([code, meta]) => {
              const selected = lang === code
              return (
                <button
                  key={code}
                  onClick={() => setLang(code)}
                  className="flex items-center gap-4 px-5 py-4 rounded-2xl transition-all"
                  style={{
                    background: selected ? 'rgba(var(--accent-rgb),0.1)' : 'rgba(7,7,26,0.8)',
                    border: selected ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(var(--accent-rgb),0.12)',
                    boxShadow: selected ? '0 0 20px rgba(var(--accent-rgb),0.12)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 28 }}>{meta.flag}</span>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-black" style={{ color: selected ? '#e0f2fe' : 'rgba(224,242,254,0.6)' }}>
                      {meta.nativeName}
                    </p>
                    {meta.nativeName !== meta.name && (
                      <p className="text-[10px]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>{meta.name}</p>
                    )}
                  </div>
                  {selected && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: 'var(--accent)' }}>
                      <Check size={11} color="#04040d" strokeWidth={3} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <button
            onClick={() => setPhase('credentials')}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-sm transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.15), rgba(61,90,254,0.12))',
              border: '1px solid rgba(var(--accent-rgb),0.45)',
              color: 'var(--accent)',
              boxShadow: '0 0 18px rgba(var(--accent-rgb),0.18)',
              letterSpacing: '0.1em',
            }}
          >
            {t('register.continue')} <ChevronRight size={14} />
          </button>
        </div>
      </div>
    )
  }

  /* ═══ PHASE: VERIFY EMAIL ════════════════════════════════════════════════ */
  if (phase === 'verify') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
        style={{ background: '#04040d' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <Zap size={20} fill="rgba(var(--accent-rgb),0.2)"
            style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 8px rgba(var(--accent-rgb),0.8))' }} />
          <span className="font-black text-sm tracking-[0.2em]"
            style={{ color: 'var(--accent)', textShadow: '0 0 16px rgba(var(--accent-rgb),0.6)' }}>
            PARTYRADAR
          </span>
        </div>

        <div className="w-full max-w-sm animate-fade-up text-center space-y-5">
          {/* Icon */}
          <div className="flex items-center justify-center mx-auto w-16 h-16 rounded-2xl"
            style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
            <Mail size={28} style={{ color: 'var(--accent)' }} />
          </div>

          {/* Header */}
          <div>
            <p className="text-[10px] font-bold tracking-[0.3em] mb-2" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
              ALMOST THERE
            </p>
            <h1 className="text-2xl font-black" style={{ color: '#e0f2fe', letterSpacing: '0.04em' }}>
              CHECK YOUR INBOX
            </h1>
            <p className="text-sm mt-3" style={{ color: 'rgba(224,242,254,0.5)', lineHeight: 1.6 }}>
              We sent a verification link to{' '}
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{email}</span>.
              <br />Click the link, then come back here.
            </p>
          </div>

          {verifyError && (
            <p className="text-xs px-4 py-2.5 rounded-xl font-bold"
              style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
              {verifyError}
            </p>
          )}

          {/* Verified button */}
          <button
            onClick={handleVerifyCheck}
            disabled={checkingVerify}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black tracking-widest disabled:opacity-50"
            style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.35)', color: 'var(--accent)' }}
          >
            {checkingVerify
              ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> CHECKING...</>
              : <><Check size={14} /> I&apos;VE VERIFIED MY EMAIL</>
            }
          </button>

          {/* Resend */}
          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-xs font-bold"
            style={{ color: resendCooldown > 0 ? 'rgba(var(--accent-rgb),0.25)' : 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.1em' }}
          >
            {resendCooldown > 0 ? `RESEND IN ${resendCooldown}s` : 'RESEND VERIFICATION EMAIL'}
          </button>
        </div>
      </div>
    )
  }

  /* ═══ PHASE: GENDER SELECTION ═══════════════════════════════════════════ */
  if (phase === 'gender') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
        style={{ background: '#04040d' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <Zap size={20} fill="rgba(var(--accent-rgb),0.2)"
            style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 8px rgba(var(--accent-rgb),0.8))' }} />
          <span className="font-black text-sm tracking-[0.2em]"
            style={{ color: 'var(--accent)', textShadow: '0 0 16px rgba(var(--accent-rgb),0.6)' }}>
            PARTYRADAR
          </span>
        </div>

        <div className="w-full max-w-sm animate-fade-up">
          {/* Header */}
          <div className="text-center mb-8">
            <p className="text-[10px] font-bold tracking-[0.3em] mb-2" style={{ color: 'rgba(0,255,136,0.6)' }}>
              {t('register.account_created')}
            </p>
            <h1 className="text-2xl font-black" style={{ color: '#e0f2fe', letterSpacing: '0.04em' }}>
              {t('register.gender.title')}
            </h1>
            <p className="text-sm mt-2" style={{ color: 'rgba(74,96,128,0.8)' }}>
              {t('register.gender.subtitle')}
            </p>
          </div>

          {/* Gender tiles */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {GENDER_OPTIONS.map((opt) => {
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
                  {/* Corner brackets on selected */}
                  {selected && <>
                    <div className="absolute top-2 left-2 w-3 h-3" style={{ borderTop: `1.5px solid ${opt.color}70`, borderLeft: `1.5px solid ${opt.color}70` }} />
                    <div className="absolute bottom-2 right-2 w-3 h-3" style={{ borderBottom: `1.5px solid ${opt.color}70`, borderRight: `1.5px solid ${opt.color}70` }} />
                  </>}

                  <span
                    className="text-3xl font-black"
                    style={{
                      color: selected ? opt.color : 'rgba(74,96,128,0.6)',
                      textShadow: selected ? `0 0 16px ${opt.glow}` : 'none',
                      fontFamily: 'system-ui',
                    }}
                  >
                    {opt.emoji}
                  </span>
                  <span
                    className="text-[10px] font-black tracking-widest text-center leading-tight px-1"
                    style={{ color: selected ? opt.color : 'rgba(74,96,128,0.6)' }}
                  >
                    {t(opt.labelKey)}
                  </span>

                  {selected && (
                    <div
                      className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: opt.color, boxShadow: `0 0 8px ${opt.glow}` }}
                    >
                      <Check size={10} color="#04040d" strokeWidth={3} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Info note */}
          <p className="text-center text-[10px] mb-6" style={{ color: 'rgba(74,96,128,0.6)' }}>
            This is used to show gender ratios on event pages. You can update this anytime in settings.
          </p>

          {/* Continue */}
          <button
            onClick={handleFinish}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-sm transition-all duration-200"
            style={{
              background: gender
                ? 'linear-gradient(135deg, rgba(var(--accent-rgb),0.15), rgba(61,90,254,0.12))'
                : 'rgba(var(--accent-rgb),0.04)',
              border: `1px solid ${gender ? 'rgba(var(--accent-rgb),0.5)' : 'rgba(var(--accent-rgb),0.12)'}`,
              color: gender ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.3)',
              boxShadow: gender ? '0 0 20px rgba(var(--accent-rgb),0.2)' : 'none',
              letterSpacing: '0.12em',
            }}
          >
            {gender ? <><ChevronRight size={14} /> {t('register.enter_radar')}</> : t('register.select_continue')}
          </button>

          {/* Skip */}
          <button
            onClick={() => router.push('/discover')}
            className="mt-3 w-full text-center text-[10px] font-bold"
            style={{ color: 'rgba(74,96,128,0.4)', letterSpacing: '0.12em' }}
          >
            {t('register.skip')}
          </button>
        </div>
      </div>
    )
  }

  /* ═══ PHASE: CREDENTIALS ══════════════════════════════════════════════════ */
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
      style={{ background: '#04040d' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <Zap size={20} fill="rgba(var(--accent-rgb),0.2)"
          style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 8px rgba(var(--accent-rgb),0.8))' }} />
        <span className="font-black text-sm tracking-[0.2em]"
          style={{ color: 'var(--accent)', textShadow: '0 0 16px rgba(var(--accent-rgb),0.6)' }}>
          PARTYRADAR
        </span>
      </div>

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
          <p className="text-[10px] font-bold tracking-[0.25em] mb-1" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>CREATE ACCOUNT</p>
          <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.3), transparent)' }} />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogleSignUp}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg font-bold text-xs mb-4 transition-all duration-200"
          style={{
            background: 'rgba(var(--accent-rgb),0.04)',
            border: '1px solid rgba(var(--accent-rgb),0.15)',
            color: 'rgba(224,242,254,0.7)',
            letterSpacing: '0.08em',
          }}
        >
          {googleLoading ? (
            <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
          ) : (
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
        <button
          onClick={handleAppleSignUp}
          disabled={appleLoading}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg font-bold text-xs mb-4 transition-all duration-200"
          style={{
            background: 'rgba(var(--accent-rgb),0.04)',
            border: '1px solid rgba(var(--accent-rgb),0.15)',
            color: 'rgba(224,242,254,0.7)',
            letterSpacing: '0.08em',
          }}
        >
          {appleLoading ? (
            <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
          ) : (
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
          {/* Email */}
          <div>
            <label className="block text-[10px] font-bold tracking-[0.2em] mb-1.5" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-all duration-200"
              style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.18)', color: '#e0f2fe' }}
              onFocus={(e) => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.5)'; e.target.style.boxShadow = '0 0 12px rgba(var(--accent-rgb),0.1)' }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.18)'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-[10px] font-bold tracking-[0.2em] mb-1.5" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>PASSWORD</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm font-medium focus:outline-none transition-all duration-200"
                style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.18)', color: '#e0f2fe' }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.5)'; e.target.style.boxShadow = '0 0 12px rgba(var(--accent-rgb),0.1)' }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(var(--accent-rgb),0.18)'; e.target.style.boxShadow = 'none' }}
              />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
                {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all duration-200 mt-1"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.15), rgba(61,90,254,0.12))',
              border: '1px solid rgba(var(--accent-rgb),0.45)',
              color: 'var(--accent)',
              boxShadow: '0 0 18px rgba(var(--accent-rgb),0.18)',
              letterSpacing: '0.1em',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading
              ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> CREATING...</>
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
