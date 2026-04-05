'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Zap, Loader2, Eye, EyeOff, ChevronRight, Radio } from 'lucide-react'

// SSR-safe dynamic import for react-globe.gl
const Globe = dynamic(() => import('react-globe.gl'), { ssr: false, loading: () => null })

// ── Event hotspot data (major party cities worldwide) ────────────────────────
const HOT_SPOTS = [
  { id: 1,  lat: 51.505, lng: -0.09,    label: 'London',      events: 47, color: '#00e5ff' },
  { id: 2,  lat: 40.712, lng: -74.006,  label: 'New York',    events: 63, color: '#00ff88' },
  { id: 3,  lat: 35.689, lng: 139.692,  label: 'Tokyo',       events: 31, color: '#00e5ff' },
  { id: 4,  lat: 48.856, lng: 2.352,    label: 'Paris',       events: 28, color: '#00ff88' },
  { id: 5,  lat: -33.868,lng: 151.209,  label: 'Sydney',      events: 22, color: '#00e5ff' },
  { id: 6,  lat: 52.520, lng: 13.405,   label: 'Berlin',      events: 55, color: '#00ff88' },
  { id: 7,  lat: 25.204, lng: 55.270,   label: 'Dubai',       events: 19, color: '#00e5ff' },
  { id: 8,  lat: 19.432, lng: -99.133,  label: 'Mexico City', events: 24, color: '#00ff88' },
  { id: 9,  lat: -23.55, lng: -46.633,  label: 'São Paulo',   events: 38, color: '#00e5ff' },
  { id: 10, lat: 1.352,  lng: 103.819,  label: 'Singapore',   events: 17, color: '#00ff88' },
  { id: 11, lat: 55.751, lng: 37.618,   label: 'Moscow',      events: 29, color: '#00e5ff' },
  { id: 12, lat: 28.614, lng: 77.209,   label: 'Delhi',       events: 33, color: '#00ff88' },
  { id: 13, lat: 43.652, lng: -79.381,  label: 'Toronto',     events: 21, color: '#00e5ff' },
  { id: 14, lat: 34.052, lng: -118.244, label: 'LA',          events: 58, color: '#00ff88' },
  { id: 15, lat: 41.385, lng: 2.173,    label: 'Barcelona',   events: 42, color: '#00e5ff' },
  { id: 16, lat: 53.480, lng: -2.242,   label: 'Manchester',  events: 16, color: '#00ff88' },
  { id: 17, lat: 55.861, lng: -4.251,   label: 'Glasgow',     events: 14, color: '#00e5ff' },
  { id: 18, lat: 37.566, lng: 126.978,  label: 'Seoul',       events: 26, color: '#00ff88' },
  { id: 19, lat: 52.370, lng: 4.895,    label: 'Amsterdam',   events: 34, color: '#00e5ff' },
  { id: 20, lat: 37.774, lng: -122.419, label: 'San Francisco',events: 45, color: '#00ff88' },
]

const DEMO_PARTY_POINT = [
  { id: 'party', lat: 51.5201, lng: -0.1020, label: 'WAREHOUSE RAVE — LONDON', events: 1, color: '#ff006e' }
]

// Arcs between cities for visual flair
const ARCS = [
  { startLat: 51.5, startLng: -0.09, endLat: 40.712, endLng: -74.006 },
  { startLat: 51.5, startLng: -0.09, endLat: 48.856, endLng: 2.352 },
  { startLat: 34.052, startLng: -118.244, endLat: 37.774, endLng: -122.419 },
  { startLat: 35.689, startLng: 139.692, endLat: 37.566, endLng: 126.978 },
  { startLat: 35.689, startLng: 139.692, endLat: 1.352, endLng: 103.819 },
  { startLat: 52.520, startLng: 13.405, endLat: 41.385, endLng: 2.173 },
  { startLat: 52.520, startLng: 13.405, endLat: 52.370, endLng: 4.895 },
]

type Phase = 'landing' | 'signin' | 'zooming' | 'choice'

// ── Globe Landing ─────────────────────────────────────────────────────────────
export default function GlobeLanding() {
  const globeRef = useRef<any>(null)
  const router = useRouter()
  const { dbUser, loading: authLoading, signIn, signUp } = useAuth()

  const [phase, setPhase] = useState<Phase>('landing')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [globeReady, setGlobeReady] = useState(false)
  const [userLat, setUserLat] = useState(51.505)
  const [userLng, setUserLng] = useState(-0.09)

  // Expose phase setter for dev preview
  useEffect(() => { (window as any).__setGlobePhase = setPhase }, [])

  // Once globe is rendered, start auto-rotate
  useEffect(() => {
    if (!globeRef.current || !globeReady) return
    const ctrl = globeRef.current.controls()
    ctrl.autoRotate = true
    ctrl.autoRotateSpeed = 0.35
    ctrl.enableZoom = false
    // Start slightly tilted
    globeRef.current.pointOfView({ lat: 20, lng: 0, altitude: 2.2 }, 0)
  }, [globeReady])

  // If already signed in, skip straight to zoom
  useEffect(() => {
    if (!authLoading && dbUser && phase === 'landing') {
      getLocationAndZoom()
    }
  }, [authLoading, dbUser])

  const getLocationAndZoom = useCallback(() => {
    setPhase('zooming')
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) => {
        setUserLat(coords.latitude)
        setUserLng(coords.longitude)
        zoomToCoords(coords.latitude, coords.longitude)
      },
      () => {
        // Fallback: zoom to nearest hotspot (Glasgow / London)
        zoomToCoords(55.861, -4.251)
      },
      { timeout: 4000 }
    )
  }, [])

  const zoomToCoords = useCallback((lat: number, lng: number) => {
    if (!globeRef.current) {
      setTimeout(() => zoomToCoords(lat, lng), 200)
      return
    }
    const ctrl = globeRef.current.controls()
    ctrl.autoRotate = false
    // Zoom in over 2.2 seconds
    globeRef.current.pointOfView({ lat, lng, altitude: 0.25 }, 2200)
    setTimeout(() => setPhase('choice'), 2500)
  }, [])

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
      getLocationAndZoom()
    } catch (err: any) {
      setError(err?.message?.replace('Firebase: ', '').replace(/\(.*\)\.?/, '') ?? 'Authentication failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Globe config ─────────────────────────────────────────────────────────
  const globeProps = {
    ref: globeRef,
    onGlobeReady: () => setGlobeReady(true),
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,

    // Dark night earth showing city lights
    globeImageUrl: 'https://unpkg.com/three-globe/example/img/earth-night.jpg',
    bumpImageUrl: 'https://unpkg.com/three-globe/example/img/earth-topology.png',

    // Starfield background
    backgroundImageUrl: 'https://unpkg.com/three-globe/example/img/night-sky.png',

    // Atmosphere glow — cyan tint
    atmosphereColor: '#00e5ff',
    atmosphereAltitude: 0.18,
    showAtmosphere: true,

    // Glowing dots at hotspots
    pointsData: [...HOT_SPOTS, ...DEMO_PARTY_POINT],
    pointLat: 'lat',
    pointLng: 'lng',
    pointColor: 'color',
    pointAltitude: 0.015,
    pointRadius: (d: any) => Math.max(0.3, d.events / 60),
    pointsMerge: false,
    pointLabel: (d: any) => `<div style="color:#00e5ff;font-size:11px;font-weight:700;letter-spacing:0.1em;padding:4px 8px;background:rgba(4,4,13,0.9);border:1px solid rgba(0,229,255,0.3);border-radius:4px;">${d.label} · ${d.events} events</div>`,

    // Radar rings pulsing outward
    ringsData: HOT_SPOTS,
    ringLat: 'lat',
    ringLng: 'lng',
    ringColor: (d: any) => (t: number) =>
      `rgba(${d.color === '#00ff88' ? '0,255,136' : '0,229,255'},${Math.max(0, 1 - t)})`,
    ringMaxRadius: 4,
    ringPropagationSpeed: 1.5,
    ringRepeatPeriod: (d: any) => 1200 + (d.id * 130) % 800,

    // Arcs (event connections)
    arcsData: ARCS,
    arcStartLat: 'startLat',
    arcStartLng: 'startLng',
    arcEndLat: 'endLat',
    arcEndLng: 'endLng',
    arcColor: () => ['rgba(0,229,255,0)', 'rgba(0,229,255,0.6)', 'rgba(0,229,255,0)'],
    arcAltitude: 0.3,
    arcStroke: 0.4,
    arcDashLength: 0.4,
    arcDashGap: 0.2,
    arcDashAnimateTime: 3000,
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ background: '#04040d' }}
    >
      {/* ── Globe ── */}
      <div className="absolute inset-0">
        <Globe {...globeProps} />
      </div>

      {/* ── Vignette edges ── */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(4,4,13,0.85) 100%)' }} />

      {/* ── Top logo ── */}
      <div className="absolute top-0 inset-x-0 flex justify-center pt-8 pointer-events-none">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Zap size={28} fill="rgba(0,229,255,0.2)"
              style={{ color: '#00e5ff', filter: 'drop-shadow(0 0 12px rgba(0,229,255,0.9))' }} />
          </div>
          <span
            className="font-black text-2xl tracking-[0.25em]"
            style={{ color: '#00e5ff', textShadow: '0 0 30px rgba(0,229,255,0.8), 0 0 60px rgba(0,229,255,0.4)' }}
          >
            PARTYRADAR
          </span>
        </div>
      </div>

      {/* ── Thin neon top line ── */}
      <div className="absolute top-0 inset-x-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.6), transparent)' }} />

      {/* ═══════════════════════════════════════════════════════ */}
      {/* PHASE: LANDING — tagline + auth buttons                 */}
      {/* ═══════════════════════════════════════════════════════ */}
      {phase === 'landing' && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-16 px-6 pointer-events-none">
          {/* Tagline */}
          <div className="mb-8 text-center pointer-events-none">
            <p className="text-xs font-bold tracking-[0.3em] mb-2" style={{ color: 'rgba(0,229,255,0.55)' }}>
              WORLDWIDE PARTY INTELLIGENCE
            </p>
            <p className="text-base font-medium" style={{ color: 'rgba(224,242,254,0.45)', maxWidth: 340 }}>
              Discover what's happening near you
            </p>
          </div>

          {/* CTA buttons */}
          <div className="flex gap-3 pointer-events-auto">
            <button
              onClick={() => { setMode('login'); setPhase('signin') }}
              className="px-8 py-3 rounded-lg font-bold text-sm transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, rgba(0,229,255,0.15), rgba(61,90,254,0.15))',
                border: '1px solid rgba(0,229,255,0.45)',
                color: '#00e5ff',
                boxShadow: '0 0 20px rgba(0,229,255,0.25)',
                letterSpacing: '0.12em',
              }}
            >
              LOG IN
            </button>
            <button
              onClick={() => { setMode('register'); setPhase('signin') }}
              className="px-8 py-3 rounded-lg font-bold text-sm transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, rgba(0,255,136,0.12), rgba(0,229,255,0.12))',
                border: '1px solid rgba(0,255,136,0.45)',
                color: '#00ff88',
                boxShadow: '0 0 20px rgba(0,255,136,0.2)',
                letterSpacing: '0.12em',
              }}
            >
              JOIN FREE →
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* PHASE: SIGN IN — floating auth form                     */}
      {/* ═══════════════════════════════════════════════════════ */}
      {phase === 'signin' && (
        <div className="absolute inset-0 flex items-center justify-center px-4">
          <div
            className="w-full max-w-sm animate-fade-up"
            style={{
              background: 'rgba(4,4,13,0.88)',
              border: '1px solid rgba(0,229,255,0.2)',
              borderRadius: 16,
              boxShadow: '0 0 60px rgba(0,229,255,0.12), 0 0 120px rgba(0,0,0,0.8)',
              backdropFilter: 'blur(24px)',
              padding: '32px 28px',
            }}
          >
            {/* Corner brackets */}
            <div className="absolute top-3 left-3 w-4 h-4" style={{ borderTop: '2px solid rgba(0,229,255,0.5)', borderLeft: '2px solid rgba(0,229,255,0.5)', borderRadius: '2px 0 0 0' }} />
            <div className="absolute top-3 right-3 w-4 h-4" style={{ borderTop: '2px solid rgba(0,229,255,0.5)', borderRight: '2px solid rgba(0,229,255,0.5)', borderRadius: '0 2px 0 0' }} />
            <div className="absolute bottom-3 left-3 w-4 h-4" style={{ borderBottom: '2px solid rgba(0,229,255,0.5)', borderLeft: '2px solid rgba(0,229,255,0.5)', borderRadius: '0 0 0 2px' }} />
            <div className="absolute bottom-3 right-3 w-4 h-4" style={{ borderBottom: '2px solid rgba(0,229,255,0.5)', borderRight: '2px solid rgba(0,229,255,0.5)', borderRadius: '0 0 2px 0' }} />

            {/* Header */}
            <div className="text-center mb-6">
              <p className="text-xs font-bold tracking-[0.2em] mb-1" style={{ color: 'rgba(0,229,255,0.5)' }}>
                {mode === 'login' ? 'AUTHENTICATE' : 'CREATE ACCOUNT'}
              </p>
              <div className="h-px mt-2" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.3), transparent)' }} />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-[10px] font-bold tracking-[0.2em] mb-1.5" style={{ color: 'rgba(0,229,255,0.5)' }}>
                  EMAIL
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="agent@partyradar.io"
                  required
                  className="w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 focus:outline-none"
                  style={{
                    background: 'rgba(0,229,255,0.04)',
                    border: '1px solid rgba(0,229,255,0.2)',
                    color: '#e0f2fe',
                    letterSpacing: '0.02em',
                  }}
                  onFocus={(e) => { e.target.style.border = '1px solid rgba(0,229,255,0.5)'; e.target.style.boxShadow = '0 0 12px rgba(0,229,255,0.1)' }}
                  onBlur={(e) => { e.target.style.border = '1px solid rgba(0,229,255,0.2)'; e.target.style.boxShadow = 'none' }}
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-[10px] font-bold tracking-[0.2em] mb-1.5" style={{ color: 'rgba(0,229,255,0.5)' }}>
                  PASSWORD
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm font-medium transition-all duration-200 focus:outline-none"
                    style={{
                      background: 'rgba(0,229,255,0.04)',
                      border: '1px solid rgba(0,229,255,0.2)',
                      color: '#e0f2fe',
                    }}
                    onFocus={(e) => { e.target.style.border = '1px solid rgba(0,229,255,0.5)'; e.target.style.boxShadow = '0 0 12px rgba(0,229,255,0.1)' }}
                    onBlur={(e) => { e.target.style.border = '1px solid rgba(0,229,255,0.2)'; e.target.style.boxShadow = 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                    style={{ color: 'rgba(0,229,255,0.4)' }}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <p className="text-xs font-medium px-3 py-2 rounded" style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
                  {error}
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-lg font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2"
                style={{
                  background: submitting
                    ? 'rgba(0,229,255,0.06)'
                    : 'linear-gradient(135deg, rgba(0,229,255,0.18), rgba(61,90,254,0.18))',
                  border: '1px solid rgba(0,229,255,0.5)',
                  color: '#00e5ff',
                  boxShadow: submitting ? 'none' : '0 0 20px rgba(0,229,255,0.2)',
                  letterSpacing: '0.12em',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting
                  ? <><Loader2 size={14} className="animate-spin" /> AUTHENTICATING...</>
                  : <>{mode === 'login' ? 'ACCESS SYSTEM' : 'ACTIVATE ACCOUNT'} <ChevronRight size={14} /></>
                }
              </button>
            </form>

            {/* Toggle mode */}
            <div className="mt-4 text-center">
              <button
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
                className="text-xs font-bold transition-all duration-200"
                style={{ color: 'rgba(0,229,255,0.45)', letterSpacing: '0.1em' }}
              >
                {mode === 'login' ? "NO ACCOUNT? → CREATE ONE" : "HAVE AN ACCOUNT? → LOG IN"}
              </button>
            </div>

            {/* Back */}
            <button
              onClick={() => setPhase('landing')}
              className="mt-3 w-full text-center text-xs font-bold transition-all"
              style={{ color: 'rgba(74,96,128,0.6)', letterSpacing: '0.1em' }}
            >
              ← BACK
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* PHASE: ZOOMING — scanning animation                     */}
      {/* ═══════════════════════════════════════════════════════ */}
      {phase === 'zooming' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-4">
            {/* Radar spinner */}
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
            <p className="text-xs font-bold tracking-[0.3em]" style={{ color: '#00e5ff', textShadow: '0 0 12px rgba(0,229,255,0.6)' }}>
              LOCATING YOUR SIGNAL...
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* PHASE: CHOICE — Host or Join?                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      {phase === 'choice' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-md animate-fade-up">
            {/* Greeting */}
            <div className="text-center mb-8">
              <p className="text-[10px] font-bold tracking-[0.3em] mb-2" style={{ color: 'rgba(0,255,136,0.6)' }}>
                SIGNAL LOCKED · {dbUser?.displayName?.toUpperCase() ?? 'AGENT'}
              </p>
              <h2
                className="text-2xl font-black tracking-widest"
                style={{ color: '#e0f2fe', textShadow: '0 0 20px rgba(224,242,254,0.3)' }}
              >
                WHAT'S YOUR MISSION?
              </h2>
              <div className="mt-3 h-px mx-auto w-32" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.5), transparent)' }} />
            </div>

            {/* Live party alert */}
            <div className="mb-5 rounded-2xl overflow-hidden"
              style={{ border: '1px solid rgba(255,0,110,0.35)', background: 'rgba(255,0,110,0.05)', animation: 'pulse 2s infinite' }}>
              <div className="h-0.5" style={{ background: 'linear-gradient(90deg, transparent, #ff006e, transparent)' }} />
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="text-2xl animate-bounce">🎉</div>
                <div className="flex-1">
                  <p className="text-[10px] font-black tracking-widest" style={{ color: '#ff006e' }}>PARTY DETECTED NEAR YOU</p>
                  <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>WAREHOUSE RAVE — LONDON</p>
                  <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.5)' }}>Farringdon · 187 tickets left · £15</p>
                </div>
                <div className="w-2 h-2 rounded-full animate-ping" style={{ background: '#ff006e' }} />
              </div>
            </div>

            {/* Choice cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* HOST */}
              <button
                onClick={() => router.push('/events/create')}
                className="group relative flex flex-col items-center gap-4 p-6 rounded-2xl transition-all duration-300"
                style={{
                  background: 'rgba(0,229,255,0.05)',
                  border: '1px solid rgba(0,229,255,0.25)',
                  boxShadow: '0 0 30px rgba(0,229,255,0.06)',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget
                  el.style.background = 'rgba(0,229,255,0.12)'
                  el.style.border = '1px solid rgba(0,229,255,0.55)'
                  el.style.boxShadow = '0 0 40px rgba(0,229,255,0.2)'
                  el.style.transform = 'translateY(-3px)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget
                  el.style.background = 'rgba(0,229,255,0.05)'
                  el.style.border = '1px solid rgba(0,229,255,0.25)'
                  el.style.boxShadow = '0 0 30px rgba(0,229,255,0.06)'
                  el.style.transform = 'none'
                }}
              >
                {/* Corner brackets */}
                <div className="absolute top-2 left-2 w-3 h-3" style={{ borderTop: '1.5px solid rgba(0,229,255,0.4)', borderLeft: '1.5px solid rgba(0,229,255,0.4)' }} />
                <div className="absolute bottom-2 right-2 w-3 h-3" style={{ borderBottom: '1.5px solid rgba(0,229,255,0.4)', borderRight: '1.5px solid rgba(0,229,255,0.4)' }} />

                <div className="text-5xl">🎙️</div>
                <div className="text-center">
                  <p className="font-black text-base tracking-wider" style={{ color: '#00e5ff', textShadow: '0 0 12px rgba(0,229,255,0.6)' }}>
                    HOSTING
                  </p>
                  <p className="text-[10px] mt-1 font-medium tracking-wider" style={{ color: 'rgba(74,96,128,0.8)' }}>
                    CREATE AN EVENT
                  </p>
                </div>
              </button>

              {/* JOIN */}
              <button
                onClick={() => router.push('/discover')}
                className="group relative flex flex-col items-center gap-4 p-6 rounded-2xl transition-all duration-300"
                style={{
                  background: 'rgba(0,255,136,0.05)',
                  border: '1px solid rgba(0,255,136,0.25)',
                  boxShadow: '0 0 30px rgba(0,255,136,0.06)',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget
                  el.style.background = 'rgba(0,255,136,0.12)'
                  el.style.border = '1px solid rgba(0,255,136,0.55)'
                  el.style.boxShadow = '0 0 40px rgba(0,255,136,0.2)'
                  el.style.transform = 'translateY(-3px)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget
                  el.style.background = 'rgba(0,255,136,0.05)'
                  el.style.border = '1px solid rgba(0,255,136,0.25)'
                  el.style.boxShadow = '0 0 30px rgba(0,255,136,0.06)'
                  el.style.transform = 'none'
                }}
              >
                <div className="absolute top-2 left-2 w-3 h-3" style={{ borderTop: '1.5px solid rgba(0,255,136,0.4)', borderLeft: '1.5px solid rgba(0,255,136,0.4)' }} />
                <div className="absolute bottom-2 right-2 w-3 h-3" style={{ borderBottom: '1.5px solid rgba(0,255,136,0.4)', borderRight: '1.5px solid rgba(0,255,136,0.4)' }} />

                <div className="text-5xl">🎉</div>
                <div className="text-center">
                  <p className="font-black text-base tracking-wider" style={{ color: '#00ff88', textShadow: '0 0 12px rgba(0,255,136,0.6)' }}>
                    JOINING
                  </p>
                  <p className="text-[10px] mt-1 font-medium tracking-wider" style={{ color: 'rgba(74,96,128,0.8)' }}>
                    FIND A PARTY
                  </p>
                </div>
              </button>
            </div>

            {/* Skip / explore */}
            <button
              onClick={() => router.push('/discover')}
              className="mt-6 w-full text-center text-xs font-bold transition-all"
              style={{ color: 'rgba(74,96,128,0.55)', letterSpacing: '0.12em' }}
            >
              EXPLORE WITHOUT COMMITTING →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
