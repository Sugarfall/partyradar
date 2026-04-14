'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { signIn, signInWithGoogle, signInWithApple } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [appleLoading, setAppleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState<'email' | 'pass' | null>(null)

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await signIn(email, password)
      router.push('/discover')
    } catch {
      setError('INVALID CREDENTIALS — CHECK EMAIL & PASSWORD')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
      router.push('/discover')
    } catch {
      setError('GOOGLE AUTH FAILED — TRY AGAIN')
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleAppleLogin() {
    setAppleLoading(true)
    setError(null)
    try {
      await signInWithApple()
      router.push('/discover')
    } catch {
      setError('APPLE AUTH FAILED — TRY AGAIN')
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
          style={{ background: 'radial-gradient(circle, rgba(0,229,255,0.04) 0%, transparent 70%)' }} />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Corner brackets */}
        <div className="absolute -top-3 -left-3 w-6 h-6"
          style={{ borderTop: '2px solid rgba(0,229,255,0.4)', borderLeft: '2px solid rgba(0,229,255,0.4)' }} />
        <div className="absolute -bottom-3 -right-3 w-6 h-6"
          style={{ borderBottom: '2px solid rgba(0,229,255,0.4)', borderRight: '2px solid rgba(0,229,255,0.4)' }} />

        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-[10px] font-bold tracking-[0.35em] mb-3" style={{ color: 'rgba(0,229,255,0.45)' }}>
            PARTYRADAR // ACCESS TERMINAL
          </p>
          <h1
            className="text-3xl font-black tracking-wide"
            style={{ color: '#00e5ff', textShadow: '0 0 30px rgba(0,229,255,0.5), 0 0 60px rgba(0,229,255,0.2)' }}
          >
            SIGN IN
          </h1>
          <div className="mt-2 h-px mx-auto w-24"
            style={{ background: 'linear-gradient(90deg, transparent, #00e5ff, transparent)' }} />
        </div>

        {/* Card */}
        <div
          className="p-6 rounded-2xl space-y-4"
          style={{
            background: 'rgba(7,7,26,0.9)',
            border: '1px solid rgba(0,229,255,0.12)',
            boxShadow: '0 0 40px rgba(0,0,0,0.4), inset 0 0 40px rgba(0,229,255,0.02)',
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
            <div className="flex-1 h-px" style={{ background: 'rgba(0,229,255,0.08)' }} />
            <span className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.3)' }}>OR</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(0,229,255,0.08)' }} />
          </div>

          {/* Email / Password form */}
          <form onSubmit={handleEmailLogin} className="space-y-3">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.55)' }}>
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
                  background: 'rgba(0,229,255,0.04)',
                  border: focused === 'email' ? '1px solid rgba(0,229,255,0.5)' : '1px solid rgba(0,229,255,0.15)',
                  color: '#e0f2fe',
                  boxShadow: focused === 'email' ? '0 0 12px rgba(0,229,255,0.1)' : 'none',
                }}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.55)' }}>
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
                    background: 'rgba(0,229,255,0.04)',
                    border: focused === 'pass' ? '1px solid rgba(0,229,255,0.5)' : '1px solid rgba(0,229,255,0.15)',
                    color: '#e0f2fe',
                    boxShadow: focused === 'pass' ? '0 0 12px rgba(0,229,255,0.1)' : 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  tabIndex={-1}
                >
                  {showPass
                    ? <EyeOff size={14} style={{ color: 'rgba(0,229,255,0.4)' }} />
                    : <Eye size={14} style={{ color: 'rgba(0,229,255,0.4)' }} />
                  }
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p
                className="text-[11px] font-bold px-3 py-2 rounded-lg"
                style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)', letterSpacing: '0.05em' }}
              >
                ⚠ {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all duration-200 disabled:opacity-50 mt-1"
              style={{
                background: 'linear-gradient(135deg, rgba(0,229,255,0.18), rgba(0,229,255,0.08))',
                border: '1px solid rgba(0,229,255,0.5)',
                color: '#00e5ff',
                boxShadow: '0 0 24px rgba(0,229,255,0.15)',
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
