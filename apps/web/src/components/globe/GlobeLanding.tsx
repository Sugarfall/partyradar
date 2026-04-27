'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Zap, Loader2, Eye, EyeOff, ChevronRight, Radio } from 'lucide-react'

// SSR-safe dynamic import for react-globe.gl
const Globe = dynamic(() => import('react-globe.gl'), { ssr: false, loading: () => null })

// ── Event hotspot data (major party cities worldwide) ────────────────────────
// IMPORTANT: Use real hex values — THREE.js cannot parse CSS variables like 'var(--accent)'
const ACCENT = '#00e5ff'
const GREEN  = '#00ff88'

const HOT_SPOTS = [
  { id: 1,  lat: 51.505, lng: -0.09,    label: 'London',       events: 47, color: ACCENT },
  { id: 2,  lat: 40.712, lng: -74.006,  label: 'New York',     events: 63, color: GREEN  },
  { id: 3,  lat: 35.689, lng: 139.692,  label: 'Tokyo',        events: 31, color: ACCENT },
  { id: 4,  lat: 48.856, lng: 2.352,    label: 'Paris',        events: 28, color: GREEN  },
  { id: 5,  lat: -33.868,lng: 151.209,  label: 'Sydney',       events: 22, color: ACCENT },
  { id: 6,  lat: 52.520, lng: 13.405,   label: 'Berlin',       events: 55, color: GREEN  },
  { id: 7,  lat: 25.204, lng: 55.270,   label: 'Dubai',        events: 19, color: ACCENT },
  { id: 8,  lat: 19.432, lng: -99.133,  label: 'Mexico City',  events: 24, color: GREEN  },
  { id: 9,  lat: -23.55, lng: -46.633,  label: 'São Paulo',    events: 38, color: ACCENT },
  { id: 10, lat: 1.352,  lng: 103.819,  label: 'Singapore',    events: 17, color: GREEN  },
  { id: 11, lat: 55.751, lng: 37.618,   label: 'Moscow',       events: 29, color: ACCENT },
  { id: 12, lat: 28.614, lng: 77.209,   label: 'Delhi',        events: 33, color: GREEN  },
  { id: 13, lat: 43.652, lng: -79.381,  label: 'Toronto',      events: 21, color: ACCENT },
  { id: 14, lat: 34.052, lng: -118.244, label: 'LA',           events: 58, color: GREEN  },
  { id: 15, lat: 41.385, lng: 2.173,    label: 'Barcelona',    events: 42, color: ACCENT },
  { id: 16, lat: 53.480, lng: -2.242,   label: 'Manchester',   events: 16, color: GREEN  },
  { id: 17, lat: 55.861, lng: -4.251,   label: 'Glasgow',      events: 14, color: ACCENT },
  { id: 18, lat: 37.566, lng: 126.978,  label: 'Seoul',        events: 26, color: GREEN  },
  { id: 19, lat: 52.370, lng: 4.895,    label: 'Amsterdam',    events: 34, color: ACCENT },
  { id: 20, lat: 37.774, lng: -122.419, label: 'San Francisco', events: 45, color: GREEN },
]

// No demo point — real nearest event is fetched from the API after geolocation

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
  const { dbUser, loading: authLoading, signIn, signUp, signInWithGoogle, signInWithApple } = useAuth()

  // Start directly on the signin card — no unauthenticated skip allowed
  const [phase, setPhase] = useState<Phase>('signin')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [globeReady, setGlobeReady] = useState(false)
  const [userLat, setUserLat] = useState(51.505)
  const [userLng, setUserLng] = useState(-0.09)
  const [nearestEvent, setNearestEvent] = useState<{
    id: string; name: string; neighbourhood?: string; city?: string; price?: number
  } | null>(null)

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
    if (!authLoading && dbUser && (phase === 'landing' || phase === 'signin')) {
      getLocationAndZoom()
    }
  }, [authLoading, dbUser])

  const fetchNearestEvent = useCallback(async (lat: number, lng: number) => {
    try {
      // radius=10 keeps it genuinely local; radius=50 could pull in far-away events
      const json = await api.get<{ data: Array<{ id: string; name: string; neighbourhood?: string; city?: string; price?: number }> }>(
        `/events?lat=${lat}&lng=${lng}&radius=10&limit=5`
      )
      // Pick the soonest event that has a name
      const events = json?.data ?? []
      const first = events.find((e) => !!e.name) ?? events[0]
      if (first) setNearestEvent(first)
    } catch { /* silent — just don't show the card */ }
  }, [])

  // Declared before getLocationAndZoom so TypeScript can see it in the dep array
  const zoomToCoords = useCallback((lat: number, lng: number) => {
    if (!globeRef.current) {
      setTimeout(() => zoomToCoords(lat, lng), 200)
      return
    }
    const ctrl = globeRef.current.controls()
    ctrl.autoRotate = false
    globeRef.current.pointOfView({ lat, lng, altitude: 0.25 }, 2200)
    setTimeout(() => setPhase('choice'), 2500)
  }, [])

  const getLocationAndZoom = useCallback(() => {
    setPhase('zooming')
    if (!navigator.geolocation) {
      fetchNearestEvent(55.861, -4.251)
      zoomToCoords(55.861, -4.251)
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLat(coords.latitude)
        setUserLng(coords.longitude)
        fetchNearestEvent(coords.latitude, coords.longitude)
        zoomToCoords(coords.latitude, coords.longitude)
      },
      () => {
        // Fallback to Glasgow — still try to fetch events there
        fetchNearestEvent(55.861, -4.251)
        zoomToCoords(55.861, -4.251)
      },
      {
        // enableHighAccuracy: false  → use network/cell location, resolves in ~1s vs 5–15s for GPS
        // maximumAge: 60000          → accept a cached fix from the last 60s (instant if browser has one)
        // timeout: 9000              → give the permission prompt + network lookup enough time before Glasgow fallback
        enableHighAccuracy: false,
        maximumAge: 60000,
        timeout: 9000,
      }
    )
  }, [fetchNearestEvent, zoomToCoords])

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

  async function handleGoogleSignIn() {
    setError('')
    setSubmitting(true)
    try {
      await signInWithGoogle()
      getLocationAndZoom()
    } catch (err: any) {
      const code = err?.code ?? ''
      if (code === 'auth/unauthorized-domain') {
        const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'this domain'
        setError(`Add "${currentDomain}" to Firebase Console → Authentication → Settings → Authorised Domains. Also ensure Google is enabled under Sign-in method.`)
      } else if (code === 'auth/operation-not-allowed') {
        setError('Google sign-in not enabled in Firebase Console — enable it under Authentication → Sign-in method')
      } else if (code === 'auth/popup-blocked') {
        setError('Popup was blocked — please allow popups for this site and try again')
      } else if (code === 'auth/popup-closed-by-user') {
        setError('') // user closed popup intentionally — no error shown
      } else {
        setError(err?.message?.replace('Firebase: ', '') ?? `Google sign-in failed (${code})`)
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
      getLocationAndZoom()
    } catch (err: any) {
      const code = err?.code ?? ''
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError('')
      } else if (code === 'auth/unauthorized-domain') {
        const domain = typeof window !== 'undefined' ? window.location.hostname : 'this domain'
        setError(`Add "${domain}" to Firebase Console → Authentication → Authorised Domains`)
      } else if (code === 'auth/operation-not-allowed') {
        setError('Apple sign-in is not enabled — check Firebase Console → Sign-in method')
      } else if (code === 'auth/account-exists-with-different-credential') {
        setError('An account already exists with this email — try Google or email/password sign-in')
      } else {
        setError(err?.message?.replace('Firebase: ', '').replace(/\s*\(auth\/[^)]+\)\.?/, '') ?? `Apple sign-in failed (${code || 'unknown'})`)
      }
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

    // Match the device's physical pixel density — fixes pixelation on retina/2x/3x phones
    pixelRatio: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1,
    // Smooth WebGL edges
    rendererConfig: { antialias: true, alpha: false },

    // High-res NASA Black Marble night-earth (3600×1800 — ~3× the resolution of the old unpkg image)
    globeImageUrl: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg',
    bumpImageUrl: 'https://unpkg.com/three-globe/example/img/earth-topology.png',

    // Starfield background
    backgroundImageUrl: 'https://unpkg.com/three-globe/example/img/night-sky.png',

    // Atmosphere glow — cyan tint (must be a real hex, THREE.js can't parse CSS vars)
    atmosphereColor: '#00e5ff',
    atmosphereAltitude: 0.18,
    showAtmosphere: true,

    // Glowing dots at hotspots
    pointsData: HOT_SPOTS,
    pointLat: 'lat',
    pointLng: 'lng',
    pointColor: 'color',
    pointAltitude: 0.015,
    pointRadius: (d: any) => Math.max(0.3, d.events / 60),
    pointsMerge: false,
    pointLabel: (d: any) => `<div style="color:var(--accent);font-size:11px;font-weight:700;letter-spacing:0.1em;padding:4px 8px;background:rgba(4,4,13,0.9);border:1px solid rgba(var(--accent-rgb),0.3);border-radius:4px;">${d.label} · ${d.events} events</div>`,

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
            <Zap size={28} fill="rgba(var(--accent-rgb),0.2)"
              style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 12px rgba(var(--accent-rgb),0.9))' }} />
          </div>
          <span
            className="font-black text-2xl tracking-[0.25em]"
            style={{ color: 'var(--accent)', textShadow: '0 0 30px rgba(var(--accent-rgb),0.8), 0 0 60px rgba(var(--accent-rgb),0.4)' }}
          >
            PARTYRADAR
          </span>
        </div>
      </div>

      {/* ── Thin neon top line ── */}
      <div className="absolute top-0 inset-x-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.6), transparent)' }} />

      {/* ═══════════════════════════════════════════════════════ */}
      {/* PHASE: LANDING — tagline + auth buttons                 */}
      {/* ═══════════════════════════════════════════════════════ */}
      {phase === 'landing' && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-16 px-6 pointer-events-none">
          {/* Tagline */}
          <div className="mb-8 text-center pointer-events-none">
            <p className="text-xs font-bold tracking-[0.3em] mb-2" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>
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
                background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.15), rgba(61,90,254,0.15))',
                border: '1px solid rgba(var(--accent-rgb),0.45)',
                color: 'var(--accent)',
                boxShadow: '0 0 20px rgba(var(--accent-rgb),0.25)',
                letterSpacing: '0.12em',
              }}
            >
              LOG IN
            </button>
            <button
              onClick={() => { setMode('register'); setPhase('signin') }}
              className="px-8 py-3 rounded-lg font-bold text-sm transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, rgba(0,255,136,0.12), rgba(var(--accent-rgb),0.12))',
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
      {/* PHASE: SIGN IN — clean auth card (entry point)         */}
      {/* ═══════════════════════════════════════════════════════ */}
      {phase === 'signin' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6"
          style={{ background: 'rgba(4,4,13,0.82)', backdropFilter: 'blur(6px)' }}>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <Zap size={26} fill="rgba(var(--accent-rgb),0.2)"
              style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 10px rgba(var(--accent-rgb),0.9))' }} />
            <span
              className="font-black text-xl tracking-[0.3em]"
              style={{ color: 'var(--accent)', textShadow: '0 0 24px rgba(var(--accent-rgb),0.7)' }}
            >
              PARTYRADAR
            </span>
          </div>

          {/* Card */}
          <div
            className="relative w-full max-w-sm"
            style={{
              background: 'rgba(8,12,24,0.95)',
              border: '1px solid rgba(var(--accent-rgb),0.18)',
              borderRadius: 16,
              boxShadow: '0 0 80px rgba(var(--accent-rgb),0.08)',
              padding: '32px 28px',
            }}
          >
            {/* Corner brackets */}
            <div className="absolute top-3 left-3 w-5 h-5" style={{ borderTop: '2px solid rgba(var(--accent-rgb),0.45)', borderLeft: '2px solid rgba(var(--accent-rgb),0.45)' }} />
            <div className="absolute top-3 right-3 w-5 h-5" style={{ borderTop: '2px solid rgba(var(--accent-rgb),0.45)', borderRight: '2px solid rgba(var(--accent-rgb),0.45)' }} />
            <div className="absolute bottom-3 left-3 w-5 h-5" style={{ borderBottom: '2px solid rgba(var(--accent-rgb),0.45)', borderLeft: '2px solid rgba(var(--accent-rgb),0.45)' }} />
            <div className="absolute bottom-3 right-3 w-5 h-5" style={{ borderBottom: '2px solid rgba(var(--accent-rgb),0.45)', borderRight: '2px solid rgba(var(--accent-rgb),0.45)' }} />

            {/* Header */}
            <p className="text-center text-xs font-black tracking-[0.25em] mb-6" style={{ color: 'rgba(var(--accent-rgb),0.6)' }}>
              {mode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT'}
            </p>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={submitting}
              className="w-full py-3 rounded-lg font-bold text-sm transition-all duration-200 flex items-center justify-center gap-3 mb-3"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: '#e0f2fe',
                letterSpacing: '0.1em',
                opacity: submitting ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!submitting) { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.border = '1px solid rgba(255,255,255,0.28)' } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.border = '1px solid rgba(255,255,255,0.14)' }}
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
              className="w-full py-3 rounded-lg font-bold text-sm transition-all duration-200 flex items-center justify-center gap-3 mb-5"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: '#e0f2fe',
                letterSpacing: '0.1em',
                opacity: submitting ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!submitting) { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.border = '1px solid rgba(255,255,255,0.28)' } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.border = '1px solid rgba(255,255,255,0.14)' }}
            >
              {/* Apple logo */}
              <svg width="15" height="18" viewBox="0 0 814 1000" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.4-155.5-127.4C46 413.8 8.2 341.9 8.2 272.5c0-110.8 68.9-169.4 135.8-169.4 89.8 0 144.7 59.6 215.2 59.6 71.1 0 115.5-61.2 218.7-61.2zM656.8 71c30.2-35.9 52.4-86.2 52.4-136.5 0-7-.7-14.1-2.1-20.5-49.5 1.9-110 34.3-145.7 75.1-27.8 31.4-53.8 81.7-53.8 132.5 0 7.8 1.4 15.6 2.1 18.1 3.2.5 8.4 1.4 13.6 1.4 44.4 0 100.2-30.7 133.5-70.1z"/>
              </svg>
              CONTINUE WITH APPLE
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px" style={{ background: 'rgba(var(--accent-rgb),0.1)' }} />
              <span className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.55)' }}>OR</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(var(--accent-rgb),0.1)' }} />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-[10px] font-black tracking-[0.2em] mb-1.5" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
                  EMAIL
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 focus:outline-none"
                  style={{
                    background: 'rgba(var(--accent-rgb),0.04)',
                    border: '1px solid rgba(var(--accent-rgb),0.18)',
                    color: '#e0f2fe',
                  }}
                  onFocus={(e) => { e.target.style.border = '1px solid rgba(var(--accent-rgb),0.5)'; e.target.style.boxShadow = '0 0 12px rgba(var(--accent-rgb),0.08)' }}
                  onBlur={(e) => { e.target.style.border = '1px solid rgba(var(--accent-rgb),0.18)'; e.target.style.boxShadow = 'none' }}
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-[10px] font-black tracking-[0.2em] mb-1.5" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
                  PASSWORD
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    required
                    minLength={6}
                    className="w-full px-3 py-3 pr-10 rounded-lg text-sm font-medium transition-all duration-200 focus:outline-none"
                    style={{
                      background: 'rgba(var(--accent-rgb),0.04)',
                      border: '1px solid rgba(var(--accent-rgb),0.18)',
                      color: '#e0f2fe',
                    }}
                    onFocus={(e) => { e.target.style.border = '1px solid rgba(var(--accent-rgb),0.5)'; e.target.style.boxShadow = '0 0 12px rgba(var(--accent-rgb),0.08)' }}
                    onBlur={(e) => { e.target.style.border = '1px solid rgba(var(--accent-rgb),0.18)'; e.target.style.boxShadow = 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'rgba(var(--accent-rgb),0.4)' }}
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
                className="w-full py-3 rounded-lg font-black text-sm transition-all duration-200 flex items-center justify-center gap-2"
                style={{
                  background: submitting ? 'rgba(var(--accent-rgb),0.08)' : 'linear-gradient(135deg, rgba(var(--accent-rgb),0.2), rgba(61,90,254,0.2))',
                  border: '1px solid rgba(var(--accent-rgb),0.55)',
                  color: 'var(--accent)',
                  boxShadow: submitting ? 'none' : '0 0 24px rgba(var(--accent-rgb),0.18)',
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

            {/* Toggle login / register */}
            <div className="mt-5 text-center">
              {mode === 'login' ? (
                <p className="text-xs" style={{ color: 'rgba(224,242,254,0.4)' }}>
                  Don't have an account?{' '}
                  <button
                    onClick={() => { setMode('register'); setError('') }}
                    className="font-black transition-colors"
                    style={{ color: 'var(--accent)' }}
                  >
                    SIGN UP
                  </button>
                </p>
              ) : (
                <p className="text-xs" style={{ color: 'rgba(224,242,254,0.4)' }}>
                  Already have an account?{' '}
                  <button
                    onClick={() => { setMode('login'); setError('') }}
                    className="font-black transition-colors"
                    style={{ color: 'var(--accent)' }}
                  >
                    LOG IN
                  </button>
                </p>
              )}
            </div>
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
                style={{ borderColor: 'transparent', borderTopColor: 'var(--accent)', boxShadow: '0 0 16px rgba(var(--accent-rgb),0.4)' }}
              />
              <div
                className="absolute inset-2 rounded-full border border-dashed"
                style={{ borderColor: 'rgba(var(--accent-rgb),0.2)', animation: 'spin 3s linear infinite reverse' }}
              />
              <Radio size={22} className="absolute inset-0 m-auto" style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 8px rgba(var(--accent-rgb),0.8))' }} />
            </div>
            <p className="text-xs font-bold tracking-[0.3em]" style={{ color: 'var(--accent)', textShadow: '0 0 12px rgba(var(--accent-rgb),0.6)' }}>
              LOCATING YOUR SIGNAL...
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* PHASE: CHOICE — Host or Join?                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      {phase === 'choice' && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-6"
          style={{ background: 'rgba(4,4,13,0.88)', backdropFilter: 'blur(12px)' }}
        >
          <div className="w-full max-w-md">
            {/* Top logo */}
            <div className="flex items-center justify-center gap-3 mb-8">
              <Zap size={22} fill="rgba(var(--accent-rgb),0.2)"
                style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 10px rgba(var(--accent-rgb),0.9))' }} />
              <span
                className="font-black text-lg tracking-[0.3em]"
                style={{ color: 'var(--accent)', textShadow: '0 0 24px rgba(var(--accent-rgb),0.7)' }}
              >
                PARTYRADAR
              </span>
            </div>

            {/* Greeting */}
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
              <h2
                className="text-3xl sm:text-4xl font-black tracking-widest"
                style={{
                  color: '#ffffff',
                  textShadow: '0 2px 20px rgba(0,0,0,0.8), 0 0 40px rgba(var(--accent-rgb),0.2)',
                  letterSpacing: '0.12em',
                }}
              >
                WHAT'S YOUR
                <br />
                <span style={{ color: 'var(--accent)', textShadow: '0 0 30px rgba(var(--accent-rgb),0.6), 0 0 60px rgba(var(--accent-rgb),0.2)' }}>
                  MISSION?
                </span>
              </h2>
              <div className="mt-4 h-px mx-auto w-40" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.6), transparent)' }} />
            </div>

            {/* Nearest real event — shown only when a live event was found */}
            {nearestEvent && (
              <button
                onClick={() => router.push(`/events/${nearestEvent.id}`)}
                className="w-full mb-6 rounded-2xl overflow-hidden text-left transition-all active:scale-[0.98]"
                style={{
                  border: '1px solid rgba(255,0,110,0.4)',
                  background: 'rgba(255,0,110,0.08)',
                  boxShadow: '0 0 20px rgba(255,0,110,0.1)',
                }}
              >
                <div className="h-0.5" style={{ background: 'linear-gradient(90deg, transparent, #ff006e, transparent)' }} />
                <div className="px-4 py-3.5 flex items-center gap-3">
                  <div className="text-2xl">🎉</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black tracking-[0.2em]" style={{ color: '#ff006e' }}>PARTY DETECTED NEAR YOU</p>
                    <p className="text-sm font-black mt-0.5 truncate" style={{ color: '#ffffff' }}>
                      {nearestEvent.name.toUpperCase()}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      {[
                        nearestEvent.neighbourhood ?? nearestEvent.city,
                        nearestEvent.price === 0 ? 'Free entry' : nearestEvent.price != null ? `£${nearestEvent.price}` : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="w-2 h-2 rounded-full animate-ping shrink-0" style={{ background: '#ff006e' }} />
                </div>
              </button>
            )}

            {/* Choice cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* HOST */}
              <button
                onClick={() => router.push('/events/create')}
                className="group relative flex flex-col items-center gap-4 p-6 rounded-2xl transition-all duration-300 active:scale-95"
                style={{
                  background: 'rgba(var(--accent-rgb),0.08)',
                  border: '1px solid rgba(var(--accent-rgb),0.35)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(var(--accent-rgb),0.1)',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget
                  el.style.background = 'rgba(var(--accent-rgb),0.15)'
                  el.style.border = '1px solid rgba(var(--accent-rgb),0.65)'
                  el.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5), 0 0 40px rgba(var(--accent-rgb),0.25), inset 0 1px 0 rgba(var(--accent-rgb),0.15)'
                  el.style.transform = 'translateY(-4px)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget
                  el.style.background = 'rgba(var(--accent-rgb),0.08)'
                  el.style.border = '1px solid rgba(var(--accent-rgb),0.35)'
                  el.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(var(--accent-rgb),0.1)'
                  el.style.transform = 'none'
                }}
              >
                {/* Corner brackets */}
                <div className="absolute top-2.5 left-2.5 w-4 h-4" style={{ borderTop: '2px solid rgba(var(--accent-rgb),0.5)', borderLeft: '2px solid rgba(var(--accent-rgb),0.5)' }} />
                <div className="absolute bottom-2.5 right-2.5 w-4 h-4" style={{ borderBottom: '2px solid rgba(var(--accent-rgb),0.5)', borderRight: '2px solid rgba(var(--accent-rgb),0.5)' }} />

                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}
                >
                  🎙️
                </div>
                <div className="text-center">
                  <p
                    className="font-black text-lg tracking-wider"
                    style={{ color: 'var(--accent)', textShadow: '0 0 16px rgba(var(--accent-rgb),0.8)' }}
                  >
                    HOSTING
                  </p>
                  <p className="text-xs mt-1 font-semibold tracking-widest" style={{ color: 'rgba(224,242,254,0.55)' }}>
                    CREATE AN EVENT
                  </p>
                </div>
              </button>

              {/* DISCOVER */}
              <button
                onClick={() => router.push('/discover')}
                className="group relative flex flex-col items-center gap-4 p-6 rounded-2xl transition-all duration-300 active:scale-95"
                style={{
                  background: 'rgba(0,255,136,0.08)',
                  border: '1px solid rgba(0,255,136,0.35)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(0,255,136,0.1)',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget
                  el.style.background = 'rgba(0,255,136,0.15)'
                  el.style.border = '1px solid rgba(0,255,136,0.65)'
                  el.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5), 0 0 40px rgba(0,255,136,0.25), inset 0 1px 0 rgba(0,255,136,0.15)'
                  el.style.transform = 'translateY(-4px)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget
                  el.style.background = 'rgba(0,255,136,0.08)'
                  el.style.border = '1px solid rgba(0,255,136,0.35)'
                  el.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(0,255,136,0.1)'
                  el.style.transform = 'none'
                }}
              >
                <div className="absolute top-2.5 left-2.5 w-4 h-4" style={{ borderTop: '2px solid rgba(0,255,136,0.5)', borderLeft: '2px solid rgba(0,255,136,0.5)' }} />
                <div className="absolute bottom-2.5 right-2.5 w-4 h-4" style={{ borderBottom: '2px solid rgba(0,255,136,0.5)', borderRight: '2px solid rgba(0,255,136,0.5)' }} />

                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.2)' }}
                >
                  🎉
                </div>
                <div className="text-center">
                  <p
                    className="font-black text-lg tracking-wider"
                    style={{ color: '#00ff88', textShadow: '0 0 16px rgba(0,255,136,0.8)' }}
                  >
                    DISCOVER
                  </p>
                  <p className="text-xs mt-1 font-semibold tracking-widest" style={{ color: 'rgba(224,242,254,0.55)' }}>
                    FIND A PARTY
                  </p>
                </div>
              </button>
            </div>

            {/* Bottom hint */}
            <p className="text-center mt-5 text-[10px] tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
              YOU CAN SWITCH MODES ANYTIME FROM YOUR PROFILE
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
