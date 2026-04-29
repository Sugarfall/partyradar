'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Eye, EyeOff, Mail } from 'lucide-react'

/** Only allow relative same-origin redirects (defence against open-redirect). */
function safeNext(raw: string | null): string {
  if (!raw) return '/discover'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/discover'
  return raw
}

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = safeNext(searchParams?.get('next') ?? null)
  const { signIn, signInWithGoogle, signInWithApple, resendVerificationEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [appleLoading, setAppleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { return () => { if (resendIntervalRef.current) clearInterval(resendIntervalRef.current) } }, [])
  const [focused, setFocused] = useState<'email' | 'pass' | null>(null)

  async function handleResendVerification() {
    if (resendCooldown > 0) return
    try {
      // Uses the unverifiedUserRef stored in AuthProvider — safe even though
      // signIn() calls signOut() before throwing, which nulls auth.currentUser.
      await resendVerificationEmail()
      setResendCooldown(60)
      if (resendIntervalRef.current) clearInterval(resendIntervalRef.current)
      resendIntervalRef.current = setInterval(() => {
        setResendCooldown(v => { if (v <= 1) { clearInterval(resendIntervalRef.current!); resendIntervalRef.current = null; return 0 }; return v - 1 })
      }, 1000)
    } catch { /* ignore — non-fatal */ }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setUnverifiedEmail(null)
    try {
      await signIn(email, password)
      router.push(nextPath)
    } catch (err: any) {
      const code = err?.code ?? ''
      if (code === 'auth/email-not-verified') {
        setUnverifiedEmail(email)
        setError('EMAIL NOT VERIFIED — CHECK YOUR INBOX AND CLICK THE LINK WE JUST RESENT')
      } else if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-email') {
        setError('INVALID CREDENTIALS — CHECK EMAIL & PASSWORD')
      } else if (code === 'auth/too-many-requests') {
        setError('TOO MANY ATTEMPTS — WAIT A MOMENT AND TRY AGAIN')
      } else if (code === 'auth/network-request-failed') {
        setError('NETWORK ERROR — CHECK YOUR CONNECTION')
      } else if (err?.message?.includes('Request failed') || err?.message?.includes('fetch')) {
        setError('SERVER UNREACHABLE — TRY AGAIN IN A MOMENT')
      } else {
        setError('INVALID CREDENTIALS — CHECK EMAIL & PASSWORD')
      }
    } finally {
      setLoading(false)
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
    return err?.message?.replace('Firebase: ', '').replace(/\s*\(auth\/[^)]+\)\.?/, '') ?? `Sign-in failed (${code || 'unknown'})`
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
      router.push(nextPath)
    } catch (err: any) {
      const msg = parseAuthError(err)
      if (msg) setError(msg)
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleAppleLogin() {
    setAppleLoading(true)
    setError(null)
    try {
      await signInWithApple()
      router.push(nextPath)
    } catch (err: any) {
      const msg = parseAuthError(err)
      if (msg) setError(msg)
    } finally {
      setAppleLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#04040d' }}
    >
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(var(--accent-rgb),0.04) 0%, transparent 70%)' }} />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Corner brackets */}
        <div className="absolute -top-3 -left-3 w-6 h-6"
          style={{ borderTop: '2px solid rgba(var(--accent-rgb),0.4)', borderLeft: '2px solid rgba(var(--accent-rgb),0.4)' }} />
        <div className="absolute -bottom-3 -right-3 w-6 h-6"
          style={{ borderBottom: '2px solid rgba(var(--accent-rgb),0.4)', borderRight: '2px solid rgba(var(--accent-rgb),0.4)' }} />

        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-[10px] font-bold tracking-[0.35em] mb-3" style={{ color: 'rgba(var(--accent-rgb),0.45)' }}>
            PARTYRADAR // ACCESS TERMINAL
          </p>
          <h1
            className="text-3xl font-black tracking-wide"
            style={{ color: 'var(--accent)', textShadow: '0 0 30px rgba(var(--accent-rgb),0.5), 0 0 60px rgba(var(--accent-rgb),0.2)' }}
          >
            SIGN IN
          </h1>
          <div className="mt-2 h-px mx-auto w-24"
            style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />
        </div>

        {/* Card */}
        <div
          className="p-6 rounded-2xl space-y-4"
          style={{
            background: 'rgba(7,7,26,0.9)',
            border: '1px solid rgba(var(--accent-rgb),0.12)',
            boxShadow: '0 0 40px rgba(0,0,0,0.4), inset 0 0 40px rgba(var(--accent-rgb),0.02)',
          }}
        >
          {/* Google OAuth */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-bold text-sm transition-all duration-200 disabled:opacity-50"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(224,242,254,0.8)',
              letterSpacing: '0.08em',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.22)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)' }}
          >
            {googleLoading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M15.68 8.18c0-.57-.05-1.12-.14-1.64H8v3.1h4.31a3.68 3.68 0 01-1.6 2.42v2h2.58c1.51-1.39 2.39-3.45 2.39-5.88z" fill="#4285F4"/>
                <path d="M8 16c2.16 0 3.97-.72 5.3-1.94l-2.58-2a4.77 4.77 0 01-7.12-2.5H.64v2.06A8 8 0 008 16z" fill="#34A853"/>
                <path d="M3.6 9.56A4.8 4.8 0 013.36 8c0-.54.1-1.07.24-1.56V4.38H.64A8 8 0 000 8c0 1.3.31 2.52.64 3.62l2.96-2.06z" fill="#FBBC05"/>
                <path d="M8 3.18c1.22 0 2.31.42 3.17 1.24l2.37-2.37A8 8 0 00.64 4.38l2.96 2.06A4.77 4.77 0 018 3.18z" fill="#EA4335"/>
              </svg>
            )}
            CONTINUE WITH GOOGLE
          </button>

          {/* Apple OAuth */}
          <button
            onClick={handleAppleLogin}
            disabled={appleLoading}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-bold text-sm transition-all duration-200 disabled:opacity-50"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(224,242,254,0.8)',
              letterSpacing: '0.08em',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.22)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)' }}
          >
            {appleLoading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516.024.034 1.52.087 2.475-1.258.955-1.345.762-2.391.728-2.43zm3.314 11.467c-.034-.058-2.088-1.222-2.048-3.513.04-2.291 1.774-3.11 1.808-3.15.034-.04-1.004-1.443-2.648-1.443-1.152 0-1.698.693-2.538.693-.84 0-1.548-.664-2.538-.664C4.792 3.398 3 5.064 3 7.882c0 1.717.632 3.53 1.412 4.7.658.985 1.372 1.862 2.316 1.862.892 0 1.28-.585 2.392-.585 1.112 0 1.41.572 2.37.56.97-.012 1.63-.873 2.286-1.856.464-.695.794-1.36.96-1.72.028-.06.062-.13.062-.13s-.05-.028-.062-.038z"/>
              </svg>
            )}
            CONTINUE WITH APPLE
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: 'rgba(var(--accent-rgb),0.08)' }} />
            <span className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(var(--accent-rgb),0.3)' }}>OR</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(var(--accent-rgb),0.08)' }} />
          </div>

          {/* Email / Password form */}
          <form onSubmit={handleEmailLogin} className="space-y-3">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-all duration-200"
                style={{
                  background: 'rgba(var(--accent-rgb),0.04)',
                  border: focused === 'email' ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(var(--accent-rgb),0.15)',
                  color: '#e0f2fe',
                  boxShadow: focused === 'email' ? '0 0 12px rgba(var(--accent-rgb),0.1)' : 'none',
                }}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>
                PASSWORD
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocused('pass')}
                  onBlur={() => setFocused(null)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm font-medium focus:outline-none transition-all duration-200"
                  style={{
                    background: 'rgba(var(--accent-rgb),0.04)',
                    border: focused === 'pass' ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(var(--accent-rgb),0.15)',
                    color: '#e0f2fe',
                    boxShadow: focused === 'pass' ? '0 0 12px rgba(var(--accent-rgb),0.1)' : 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  tabIndex={-1}
                >
                  {showPass
                    ? <EyeOff size={14} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
                    : <Eye size={14} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
                  }
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="px-3 py-2.5 rounded-lg space-y-2"
                style={{ background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}
              >
                <p className="text-[11px] font-bold flex items-start gap-1.5"
                  style={{ color: '#ff006e', letterSpacing: '0.05em' }}>
                  ⚠ {error}
                </p>
                {unverifiedEmail && (
                  <div className="flex items-center gap-2">
                    <Mail size={11} style={{ color: 'rgba(255,0,110,0.6)', flexShrink: 0 }} />
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resendCooldown > 0}
                      className="text-[10px] font-black tracking-widest transition-colors disabled:opacity-40"
                      style={{ color: resendCooldown > 0 ? 'rgba(255,0,110,0.4)' : '#ff006e' }}
                    >
                      {resendCooldown > 0 ? `RESEND IN ${resendCooldown}s` : 'RESEND VERIFICATION EMAIL'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all duration-200 disabled:opacity-50 mt-1"
              style={{
                background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.18), rgba(var(--accent-rgb),0.08))',
                border: '1px solid rgba(var(--accent-rgb),0.5)',
                color: 'var(--accent)',
                boxShadow: '0 0 24px rgba(var(--accent-rgb),0.15)',
                letterSpacing: '0.12em',
              }}
            >
              {loading
                ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> AUTHENTICATING...</>
                : '⚡ ACCESS GRANTED'
              }
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-5 space-y-2">
          <p className="text-xs" style={{ color: 'rgba(74,96,128,0.7)' }}>
            NO ACCOUNT?{' '}
            <Link href="/register"
              className="font-bold transition-all duration-200"
              style={{ color: '#00ff88', textShadow: '0 0 10px rgba(0,255,136,0.4)' }}
            >
              JOIN THE RADAR →
            </Link>
          </p>
          <Link href="/forgot-password"
            className="block text-[11px] transition-all duration-200"
            style={{ color: 'rgba(74,96,128,0.5)' }}
          >
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}
