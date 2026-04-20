'use client'

/**
 * FlatLanding — sign-in screen used when WebGL / react-globe.gl fails or as
 * a safe fallback rendered by GlobeErrorBoundary in page.tsx.
 *
 * No THREE.js / WebGL dependency. Uses the same auth UX as GlobeLanding.
 * useAuth() is safe here: it returns AUTH_FALLBACK when the context is missing.
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Zap, Loader2, Eye, EyeOff, ChevronRight, Radio } from 'lucide-react'

type Phase = 'signin' | 'zooming' | 'choice'

export default function FlatLanding() {
  const router = useRouter()
  const { dbUser, loading: authLoading, signIn, signUp, signInWithGoogle, signInWithApple } = useAuth()

  const [phase, setPhase] = useState<Phase>('signin')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Already signed-in → skip straight to choice
  useEffect(() => {
    if (!authLoading && dbUser && phase === 'signin') {
      setPhase('zooming')
      setTimeout(() => setPhase('choice'), 1200)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, dbUser])

  const goToApp = useCallback((dest: 'attendee' | 'host') => {
    router.push(dest === 'host' ? '/events/create' : '/discover')
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
      }
      setPhase('zooming')
      setTimeout(() => setPhase('choice'), 1200)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed'
      setError(msg.replace('Firebase: ', '').replace(/\(.*\)\.?/, '').trim())
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGoogleSignIn() {
    setError('')
    setSubmitting(true)
    try {
      await signInWithGoogle()
      setPhase('zooming')
      setTimeout(() => setPhase('choice'), 1200)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? ''
      if (code === 'auth/unauthorized-domain') {
        setError(`Add "${typeof window !== 'undefined' ? window.location.hostname : 'this domain'}" to Firebase Console → Authentication → Authorised Domains`)
      } else if (code === 'auth/popup-closed-by-user') {
        setError('')
      } else {
        const msg = err instanceof Error ? err.message : 'Google sign-in failed'
        setError(msg.replace('Firebase: ', ''))
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAppleSignIn() {
    setError('')
    setSubmitting(true)
    try {
      await signInWithApple()
      setPhase('zooming')
      setTimeout(() => setPhase('choice'), 1200)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? ''
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError('')
      } else {
        const msg = err instanceof Error ? err.message : 'Apple sign-in failed'
        setError(msg.replace('Firebase: ', '').replace(/\s*\(auth\/[^)]+\)\.?/, '').trim())
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(135deg, #04040d 0%, #060b1a 50%, #04040d 100%)' }}
    >
      {/* Subtle grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-5"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,229,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Top neon accent line */}
      <div
        className="absolute top-0 inset-x-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.6), transparent)' }}
      />

      {/* ── SIGN IN ── */}
      {phase === 'signin' && (
        <div className="relative w-full max-w-sm">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <Zap
              size={26}
              fill="rgba(0,229,255,0.2)"
              style={{ color: '#00e5ff', filter: 'drop-shadow(0 0 10px rgba(0,229,255,0.9))' }}
            />
            <span
              className="font-black text-xl tracking-[0.3em]"
              style={{ color: '#00e5ff', textShadow: '0 0 24px rgba(0,229,255,0.7)' }}
            >
              PARTYRADAR
            </span>
          </div>

          {/* Card */}
          <div
            className="relative w-full"
            style={{
              background: 'rgba(8,12,24,0.95)',
              border: '1px solid rgba(0,229,255,0.18)',
              borderRadius: 16,
              boxShadow: '0 0 80px rgba(0,229,255,0.08)',
              padding: '32px 28px',
            }}
          >
            {/* Corner brackets */}
            <div className="absolute top-3 left-3 w-5 h-5" style={{ borderTop: '2px solid rgba(0,229,255,0.45)', borderLeft: '2px solid rgba(0,229,255,0.45)' }} />
            <div className="absolute top-3 right-3 w-5 h-5" style={{ borderTop: '2px solid rgba(0,229,255,0.45)', borderRight: '2px solid rgba(0,229,255,0.45)' }} />
            <div className="absolute bottom-3 left-3 w-5 h-5" style={{ borderBottom: '2px solid rgba(0,229,255,0.45)', borderLeft: '2px solid rgba(0,229,255,0.45)' }} />
            <div className="absolute bottom-3 right-3 w-5 h-5" style={{ borderBottom: '2px solid rgba(0,229,255,0.45)', borderRight: '2px solid rgba(0,229,255,0.45)' }} />

            <p className="text-center text-xs font-black tracking-[0.25em] mb-6" style={{ color: 'rgba(0,229,255,0.6)' }}>
              {mode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT'}
            </p>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={submitting}
              className="w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-3 mb-3 transition-all"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: '#e0f2fe',
                letterSpacing: '0.1em',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              CONTINUE WITH GOOGLE
            </button>

            {/* Apple */}
            <button
              type="button"
              onClick={handleAppleSignIn}
              disabled={submitting}
              className="w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-3 mb-5 transition-all"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: '#e0f2fe',
                letterSpacing: '0.1em',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              <svg width="15" height="18" viewBox="0 0 814 1000" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.4-155.5-127.4C46 413.8 8.2 341.9 8.2 272.5c0-110.8 68.9-169.4 135.8-169.4 89.8 0 144.7 59.6 215.2 59.6 71.1 0 115.5-61.2 218.7-61.2zM656.8 71c30.2-35.9 52.4-86.2 52.4-136.5 0-7-.7-14.1-2.1-20.5-49.5 1.9-110 34.3-145.7 75.1-27.8 31.4-53.8 81.7-53.8 132.5 0 7.8 1.4 15.6 2.1 18.1 3.2.5 8.4 1.4 13.6 1.4 44.4 0 100.2-30.7 133.5-70.1z"/>
              </svg>
              CONTINUE WITH APPLE
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px" style={{ background: 'rgba(0,229,255,0.1)' }} />
              <span className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.55)' }}>OR</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(0,229,255,0.1)' }} />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black tracking-[0.2em] mb-1.5" style={{ color: 'rgba(0,229,255,0.5)' }}>EMAIL</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-3 py-3 rounded-lg text-sm font-medium focus:outline-none"
                  style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.18)', color: '#e0f2fe' }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black tracking-[0.2em] mb-1.5" style={{ color: 'rgba(0,229,255,0.5)' }}>PASSWORD</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    required
                    minLength={6}
                    className="w-full px-3 py-3 pr-10 rounded-lg text-sm font-medium focus:outline-none"
                    style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.18)', color: '#e0f2fe' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'rgba(0,229,255,0.4)' }}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs px-3 py-2 rounded" style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-lg font-black text-sm flex items-center justify-center gap-2 transition-all"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,229,255,0.2), rgba(61,90,254,0.2))',
                  border: '1px solid rgba(0,229,255,0.55)',
                  color: '#00e5ff',
                  boxShadow: '0 0 24px rgba(0,229,255,0.18)',
                  letterSpacing: '0.14em',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting
                  ? <><Loader2 size={14} className="animate-spin" /> {mode === 'login' ? 'SIGNING IN...' : 'CREATING...'}</>
                  : <>CONTINUE <ChevronRight size={14} /></>
                }
              </button>
            </form>

            <div className="mt-5 text-center">
              {mode === 'login' ? (
                <p className="text-xs" style={{ color: 'rgba(224,242,254,0.4)' }}>
                  Don&apos;t have an account?{' '}
                  <button onClick={() => { setMode('register'); setError('') }} className="font-black" style={{ color: '#00e5ff' }}>
                    SIGN UP
                  </button>
                </p>
              ) : (
                <p className="text-xs" style={{ color: 'rgba(224,242,254,0.4)' }}>
                  Already have an account?{' '}
                  <button onClick={() => { setMode('login'); setError('') }} className="font-black" style={{ color: '#00e5ff' }}>
                    LOG IN
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ZOOMING ── */}
      {phase === 'zooming' && (
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-20 h-20">
            <div
              className="absolute inset-0 rounded-full border-2 animate-spin"
              style={{ borderColor: 'transparent', borderTopColor: '#00e5ff', boxShadow: '0 0 16px rgba(0,229,255,0.4)' }}
            />
            <div
              className="absolute inset-2 rounded-full border border-dashed"
              style={{ borderColor: 'rgba(0,229,255,0.2)', animation: 'spin 3s linear infinite reverse' }}
            />
            <Radio size={22} className="absolute inset-0 m-auto" style={{ color: '#00e5ff', filter: 'drop-shadow(0 0 8px rgba(0,229,255,0.8))' }} />
          </div>
          <p className="text-xs font-bold tracking-[0.3em]" style={{ color: '#00e5ff' }}>LOCATING YOUR SIGNAL...</p>
        </div>
      )}

      {/* ── CHOICE ── */}
      {phase === 'choice' && (
        <div className="relative w-full max-w-md">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Zap size={22} fill="rgba(0,229,255,0.2)" style={{ color: '#00e5ff', filter: 'drop-shadow(0 0 10px rgba(0,229,255,0.9))' }} />
            <span className="font-black text-lg tracking-[0.3em]" style={{ color: '#00e5ff' }}>PARTYRADAR</span>
          </div>

          <div className="text-center mb-7">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4"
              style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)' }}
            >
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00ff88' }} />
              <p className="text-[10px] font-black tracking-[0.25em]" style={{ color: '#00ff88' }}>
                SIGNAL LOCKED · {dbUser?.displayName?.toUpperCase() ?? 'AGENT'}
              </p>
            </div>
            <h2 className="text-3xl font-black tracking-widest" style={{ color: '#fff', letterSpacing: '0.12em' }}>
              WHAT&apos;S YOUR<br />
              <span style={{ color: '#00e5ff' }}>MISSION?</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => goToApp('host')}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl transition-all active:scale-95"
              style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.25)' }}
            >
              <span className="text-3xl">🎙️</span>
              <div className="text-center">
                <p className="font-black text-sm tracking-widest" style={{ color: '#00e5ff' }}>HOST</p>
                <p className="text-[10px] mt-1" style={{ color: 'rgba(224,242,254,0.45)' }}>Create an event</p>
              </div>
            </button>
            <button
              onClick={() => goToApp('attendee')}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl transition-all active:scale-95"
              style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.25)' }}
            >
              <span className="text-3xl">🎉</span>
              <div className="text-center">
                <p className="font-black text-sm tracking-widest" style={{ color: '#00ff88' }}>DISCOVER</p>
                <p className="text-[10px] mt-1" style={{ color: 'rgba(224,242,254,0.45)' }}>Find events near you</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
