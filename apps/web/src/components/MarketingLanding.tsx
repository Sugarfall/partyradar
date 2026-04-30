'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Zap, CheckCircle2, XCircle, Loader2, AtSign, Mail, MapPin, ChevronRight } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.partyradar.org/api'

type UsernameState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
type SubmitState   = 'idle' | 'loading' | 'success' | 'error' | 'duplicate'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function MarketingLanding() {
  const [username, setUsername]           = useState('')
  const [email, setEmail]                 = useState('')
  const [city, setCity]                   = useState('')
  const [usernameState, setUsernameState] = useState<UsernameState>('idle')
  const [submitState, setSubmitState]     = useState<SubmitState>('idle')
  const [result, setResult]               = useState<{ username?: string | null; position?: number } | null>(null)
  const debouncedUsername                 = useDebounce(username, 500)
  const emailRef                          = useRef<HTMLInputElement>(null)

  // ── Real-time username availability ────────────────────────────────────────
  useEffect(() => {
    const raw = debouncedUsername.trim().toLowerCase()
    if (!raw) { setUsernameState('idle'); return }

    if (!/^[a-z0-9_]{3,20}$/.test(raw)) {
      setUsernameState('invalid')
      return
    }

    setUsernameState('checking')
    const ctrl = new AbortController()

    fetch(`${API}/waitlist/check-username?username=${encodeURIComponent(raw)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((json) => {
        if (json?.data?.available) setUsernameState('available')
        else setUsernameState(json?.data?.reason === 'invalid' ? 'invalid' : 'taken')
      })
      .catch((err) => {
        // Only reset if not an intentional abort (new keystroke)
        if (err?.name !== 'AbortError') setUsernameState('idle')
      })

    return () => ctrl.abort()
  }, [debouncedUsername])

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitState === 'loading') return

    const normEmail    = email.trim().toLowerCase()
    const normUsername = username.trim().toLowerCase() || undefined

    if (!normEmail) return
    if (normUsername && usernameState !== 'available') return

    setSubmitState('loading')
    try {
      const res  = await fetch(`${API}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normEmail, username: normUsername, city: city.trim(), source: 'landing' }),
      })
      const json = await res.json()

      if (json?.data?.alreadyJoined) {
        setSubmitState('duplicate')
        setResult({ username: json.data.username })
      } else if (res.ok || res.status === 201) {
        setSubmitState('success')
        setResult({ username: json.data?.username, position: json.data?.position })
      } else if (json?.error?.code === 'USERNAME_TAKEN') {
        setUsernameState('taken')
        setSubmitState('idle')
      } else {
        setSubmitState('error')
      }
    } catch {
      setSubmitState('error')
    }
  }, [email, username, usernameState, submitState])

  // ── Username input hint ────────────────────────────────────────────────────
  const usernameHint = () => {
    if (!username) return null
    switch (usernameState) {
      case 'checking':  return { icon: <Loader2 size={13} className="animate-spin" />, text: 'Checking…',      color: 'rgba(224,242,254,0.35)' }
      case 'available': return { icon: <CheckCircle2 size={13} />,                    text: 'Available!',      color: '#00ff88' }
      case 'taken':     return { icon: <XCircle size={13} />,                          text: 'Already taken',   color: '#ff006e' }
      case 'invalid':   return { icon: <XCircle size={13} />,                          text: '3–20 chars: letters, numbers, underscores only', color: '#ff006e' }
      default:          return null
    }
  }

  const canSubmit = submitState !== 'loading'
    && email.trim().length > 0
    && city.trim().length > 0
    && (username === '' || usernameState === 'available')

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitState === 'success' || submitState === 'duplicate') {
    const isDupe = submitState === 'duplicate'
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-6 overflow-hidden" style={{ background: '#04040d' }}>
        {/* Radar pulse */}
        <RadarBackground />

        <div className="relative z-10 flex flex-col items-center text-center gap-6 max-w-sm w-full">
          {/* Icon */}
          <div className="relative">
            <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: isDupe ? 'rgba(var(--accent-rgb),0.1)' : 'rgba(0,255,136,0.1)', border: `2px solid ${isDupe ? 'rgba(var(--accent-rgb),0.5)' : 'rgba(0,255,136,0.5)'}`, boxShadow: `0 0 40px ${isDupe ? 'rgba(var(--accent-rgb),0.2)' : 'rgba(0,255,136,0.2)'}` }}>
              <Zap size={32} fill={isDupe ? 'rgba(var(--accent-rgb),0.2)' : 'rgba(0,255,136,0.2)'} style={{ color: isDupe ? 'var(--accent)' : '#00ff88', filter: `drop-shadow(0 0 10px ${isDupe ? 'rgba(var(--accent-rgb),0.8)' : 'rgba(0,255,136,0.8)'})` }} />
            </div>
          </div>

          {/* Message */}
          <div>
            <p className="text-xs font-black tracking-[0.35em] mb-2" style={{ color: isDupe ? 'rgba(var(--accent-rgb),0.6)' : 'rgba(0,255,136,0.6)' }}>
              {isDupe ? 'ALREADY REGISTERED' : 'SIGNAL LOCKED'}
            </p>
            <h1 className="font-black text-3xl sm:text-4xl mb-3" style={{ color: '#fff' }}>
              {isDupe ? "You're already in." : "You're on the radar."}
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(224,242,254,0.45)' }}>
              {isDupe
                ? "We've already got your spot saved. We'll hit you up when we launch."
                : "We'll notify you the moment PartyRadar drops in your city. Don't sleep on it."}
            </p>
          </div>

          {/* Reserved username */}
          {result?.username && (
            <div className="flex items-center gap-2 px-5 py-3 rounded-xl" style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}>
              <AtSign size={14} style={{ color: 'var(--accent)' }} />
              <span className="font-black text-sm tracking-wider" style={{ color: 'var(--accent)' }}>
                @{result.username}
              </span>
              <span className="text-xs ml-1" style={{ color: 'rgba(224,242,254,0.35)' }}>reserved ✓</span>
            </div>
          )}

          {/* Queue position */}
          {result?.position && !isDupe && (
            <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>
              You're <span style={{ color: 'var(--accent)', fontWeight: 900 }}>#{result.position}</span> on the list
            </p>
          )}

          {/* Share nudge */}
          <p className="text-xs" style={{ color: 'rgba(224,242,254,0.22)' }}>
            Tell your crew → <span style={{ color: 'var(--accent)' }}>partyradar.org</span>
          </p>
        </div>

        {/* Host link */}
        <Link href="/login" className="absolute bottom-6 right-6 text-[10px] font-bold tracking-widest flex items-center gap-1 opacity-30 hover:opacity-60 transition-opacity" style={{ color: 'var(--accent)' }}>
          HOST LOGIN <ChevronRight size={10} />
        </Link>
      </div>
    )
  }

  // ── Main waitlist page ─────────────────────────────────────────────────────
  const hint = usernameHint()

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: '#04040d' }}>
      {/* Animated radar background */}
      <RadarBackground />

      {/* Top neon line */}
      <div className="absolute top-0 inset-x-0 h-px pointer-events-none z-10" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.7), transparent)' }} />

      {/* Host link — top right */}
      <Link href="/login" className="absolute top-5 right-6 z-20 text-[10px] font-black tracking-widest flex items-center gap-1 opacity-30 hover:opacity-70 transition-opacity" style={{ color: 'var(--accent)' }}>
        HOST <ChevronRight size={10} />
      </Link>

      {/* ── Content ── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-10">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <Zap size={24} fill="rgba(var(--accent-rgb),0.2)" style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 12px rgba(var(--accent-rgb),0.9))' }} />
          <span className="font-black text-xl tracking-[0.35em]" style={{ color: 'var(--accent)', textShadow: '0 0 30px rgba(var(--accent-rgb),0.6)' }}>
            PARTYRADAR
          </span>
        </div>

        {/* Badge */}
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full mb-7" style={{ background: 'rgba(0,255,136,0.07)', border: '1px solid rgba(0,255,136,0.2)' }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#00ff88' }} />
          <span className="text-[10px] font-black tracking-[0.3em]" style={{ color: '#00ff88' }}>
            COMING SOON · JOIN THE WAITLIST
          </span>
        </div>

        {/* Headline */}
        <h1 className="font-black text-center leading-none mb-3" style={{ fontSize: 'clamp(2.6rem, 10vw, 5.5rem)', color: '#fff', letterSpacing: '-0.02em' }}>
          FIND THE<br />
          <span style={{ color: 'var(--accent)', textShadow: '0 0 60px rgba(var(--accent-rgb),0.4)' }}>PARTY.</span>
        </h1>
        <p className="text-center text-sm sm:text-base mb-10 max-w-sm leading-relaxed" style={{ color: 'rgba(224,242,254,0.42)' }}>
          Discover events near you, buy tickets, join your crew. Launching soon — pre-register to claim your username.
        </p>

        {/* ── Form card ── */}
        <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-3">

          {/* Username field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black tracking-[0.25em]" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>
              CLAIM YOUR USERNAME
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 flex items-center" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
                <AtSign size={15} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                placeholder="yourname"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full pl-8 pr-10 py-3.5 rounded-xl text-sm font-medium focus:outline-none transition-all"
                style={{
                  background: 'rgba(var(--accent-rgb),0.05)',
                  border: `1px solid ${
                    usernameState === 'available' ? 'rgba(0,255,136,0.5)'
                    : usernameState === 'taken' || usernameState === 'invalid' ? 'rgba(255,0,110,0.4)'
                    : 'rgba(var(--accent-rgb),0.2)'
                  }`,
                  color: '#e0f2fe',
                  boxShadow: usernameState === 'available' ? '0 0 16px rgba(0,255,136,0.08)' : 'none',
                }}
              />
              {/* State indicator */}
              <div className="absolute right-3">
                {usernameState === 'checking'  && <Loader2 size={14} className="animate-spin" style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />}
                {usernameState === 'available' && <CheckCircle2 size={14} style={{ color: '#00ff88' }} />}
                {(usernameState === 'taken' || usernameState === 'invalid') && <XCircle size={14} style={{ color: '#ff006e' }} />}
              </div>
            </div>
            {hint && (
              <div className="flex items-center gap-1.5 px-1">
                <span style={{ color: hint.color }}>{hint.icon}</span>
                <span className="text-[10px] font-medium" style={{ color: hint.color }}>{hint.text}</span>
              </div>
            )}
            {!username && (
              <p className="text-[10px] px-1" style={{ color: 'rgba(224,242,254,0.22)' }}>
                Optional — but first come, first served. Claim it before someone else does.
              </p>
            )}
          </div>

          {/* Email field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black tracking-[0.25em]" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>
              YOUR EMAIL
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 flex items-center" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
                <Mail size={15} />
              </div>
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full pl-8 py-3.5 rounded-xl text-sm font-medium focus:outline-none transition-all"
                style={{
                  background: 'rgba(var(--accent-rgb),0.05)',
                  border: '1px solid rgba(var(--accent-rgb),0.2)',
                  color: '#e0f2fe',
                }}
              />
            </div>
          </div>

          {/* City field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black tracking-[0.25em]" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>
              YOUR CITY
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3 flex items-center" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
                <MapPin size={15} />
              </div>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Glasgow, London, Manchester…"
                autoComplete="address-level2"
                required
                className="w-full pl-8 py-3.5 rounded-xl text-sm font-medium focus:outline-none transition-all"
                style={{
                  background: 'rgba(var(--accent-rgb),0.05)',
                  border: '1px solid rgba(var(--accent-rgb),0.2)',
                  color: '#e0f2fe',
                }}
              />
            </div>
            <p className="text-[10px] px-1" style={{ color: 'rgba(224,242,254,0.22)' }}>
              Helps us launch in your city first.
            </p>
          </div>

          {/* Error */}
          {submitState === 'error' && (
            <p className="text-[11px] text-center px-3 py-2 rounded-lg" style={{ color: '#ff006e', background: 'rgba(255,0,110,0.07)', border: '1px solid rgba(255,0,110,0.2)' }}>
              Something went wrong — check your connection and try again.
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-4 rounded-xl font-black text-sm tracking-[0.2em] flex items-center justify-center gap-2 transition-all mt-1"
            style={{
              background: canSubmit
                ? 'linear-gradient(135deg, rgba(var(--accent-rgb),0.95), rgba(61,90,254,0.9))'
                : 'rgba(var(--accent-rgb),0.15)',
              border: `1px solid ${canSubmit ? 'rgba(var(--accent-rgb),0.6)' : 'rgba(var(--accent-rgb),0.15)'}`,
              color: canSubmit ? '#fff' : 'rgba(var(--accent-rgb),0.4)',
              boxShadow: canSubmit ? '0 0 32px rgba(var(--accent-rgb),0.25)' : 'none',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {submitState === 'loading'
              ? <><Loader2 size={14} className="animate-spin" /> LOCKING IN...</>
              : <>⚡ PRE-REGISTER NOW</>
            }
          </button>

          <p className="text-[10px] text-center" style={{ color: 'rgba(224,242,254,0.18)' }}>
            No spam. Just your launch invite. Unsubscribe anytime.
          </p>
        </form>
      </div>

      {/* Bottom host link */}
      <div className="relative z-10 flex items-center justify-center pb-5">
        <Link href="/login" className="text-[10px] font-bold tracking-widest flex items-center gap-1 opacity-25 hover:opacity-50 transition-opacity" style={{ color: 'rgba(224,242,254,0.7)' }}>
          I'm a host — dashboard login <ChevronRight size={10} />
        </Link>
      </div>
    </div>
  )
}

// ── Radar animated background ─────────────────────────────────────────────────
function RadarBackground() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
      {/* Grid */}
      <div className="absolute inset-0 opacity-[0.032]" style={{ backgroundImage: 'linear-gradient(rgba(var(--accent-rgb),1) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--accent-rgb),1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* Pulse rings */}
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="absolute rounded-full border"
          style={{
            width:  `${i * 18}vmax`,
            height: `${i * 18}vmax`,
            borderColor: `rgba(var(--accent-rgb),${0.07 - i * 0.01})`,
            animation: `pulse-ring ${3 + i * 0.6}s ease-in-out infinite`,
            animationDelay: `${i * 0.4}s`,
          }}
        />
      ))}

      {/* Sweep line */}
      <div
        className="absolute"
        style={{
          width:  '50vmax',
          height: '50vmax',
          background: 'conic-gradient(from 0deg, transparent 340deg, rgba(var(--accent-rgb),0.12) 355deg, rgba(var(--accent-rgb),0.06) 360deg)',
          animation: 'radar-sweep 4s linear infinite',
          borderRadius: '50%',
        }}
      />

      {/* Center dot */}
      <div className="absolute w-2 h-2 rounded-full" style={{ background: 'rgba(var(--accent-rgb),0.7)', boxShadow: '0 0 12px rgba(var(--accent-rgb),0.9)' }} />

      <style>{`
        @keyframes pulse-ring {
          0%, 100% { transform: scale(1);    opacity: 1; }
          50%       { transform: scale(1.04); opacity: 0.6; }
        }
        @keyframes radar-sweep {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
