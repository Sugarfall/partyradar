'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Check, Upload, MapPin, Navigation, Zap } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { createEvent } from '@/hooks/useEvents'
import { uploadImage } from '@/lib/cloudinary'
import type { CreateEventInput, EventType, AlcoholPolicy, AgeRestriction } from '@partyradar/shared'
import { VIBE_TAGS } from '@partyradar/shared'

// ── Types ─────────────────────────────────────────────────────────────────────
const EVENT_TYPES: { id: EventType; label: string; emoji: string; desc: string; sub: string; color: string; glow: string }[] = [
  { id: 'HOME_PARTY', label: 'House Party', emoji: '🏠', desc: 'Private house hosted by you — your space, your crowd', sub: 'Hidden address · RSVP gating · Party signals',    color: '#ff006e', glow: 'rgba(255,0,110,0.3)' },
  { id: 'CLUB_NIGHT', label: 'Club Night',  emoji: '🎵', desc: 'Licensed venue, ticketed entry, professional setup', sub: 'Ticket tiers · Lineup · Promoter profile',          color: '#00e5ff', glow: 'rgba(0,229,255,0.3)' },
  { id: 'CONCERT',   label: 'Concert',     emoji: '🎤', desc: 'Live performance or touring act',                  sub: 'General admission · Artist info · Stage times',     color: '#3d5afe', glow: 'rgba(61,90,254,0.3)' },
  { id: 'PUB_NIGHT', label: 'Pub Night',   emoji: '🍺', desc: 'Pub quiz, karaoke, live music or just a great night out', sub: 'Open access · Casual vibe · Real ale welcome', color: '#f59e0b', glow: 'rgba(245,158,11,0.3)' },
]

// ── Party signals (HOME_PARTY only) ──────────────────────────────────────────
const PARTY_SIGNALS: { emoji: string; code: string }[] = [
  { emoji: '🍾', code: 'BAR'     },
  { emoji: '🎮', code: 'GAMING'  },
  { emoji: '🎲', code: 'GAMES'   },
  { emoji: '🕺', code: 'FLOOR'   },
  { emoji: '🔥', code: 'FIRE'    },
  { emoji: '🎤', code: 'KARAOKE' },
  { emoji: '🍕', code: 'FOOD'    },
  { emoji: '🎭', code: 'COSTUME' },
  { emoji: '🌙', code: 'LATENIGHT'},
  { emoji: '♨️', code: 'HOTTUB'  },
  { emoji: '🎸', code: 'LIVE'    },
  { emoji: '🎯', code: 'PONG'    },
  { emoji: '🏊', code: 'POOL'    },
  { emoji: '🌿', code: 'CHILL'   },
  { emoji: '💋', code: 'FLIRTY'  },
  { emoji: '🍩', code: 'SNACKS'  },
]

// Labels differ by event type: venues sell alcohol, parties provide it free
const ALCOHOL_OPTIONS_PARTY = [
  { value: 'NONE',     label: 'No Alcohol',       sublabel: 'Dry event',             emoji: '🚫' },
  { value: 'PROVIDED', label: 'Free Drinks',       sublabel: 'Host provides alcohol', emoji: '🍾' },
  { value: 'BYOB',     label: 'BYOB',              sublabel: 'Bring your own',        emoji: '🥃' },
]
const ALCOHOL_OPTIONS_VENUE = [
  { value: 'NONE',     label: 'No Bar',            sublabel: 'Dry event',             emoji: '🚫' },
  { value: 'PROVIDED', label: 'Bar Available',     sublabel: 'Drinks sold at bar',    emoji: '🍺' },
  { value: 'BYOB',     label: 'BYOB',              sublabel: 'Bring your own',        emoji: '🥃' },
]

const AGE_OPTIONS = [
  { value: 'ALL_AGES', label: 'All Ages', emoji: '👶' },
  { value: 'AGE_18',   label: '18+',      emoji: '🔞' },
  { value: 'AGE_21',   label: '21+',      emoji: '🍸' },
]

const STEPS = [
  { id: 0, label: 'TYPE',     short: '01' },
  { id: 1, label: 'BASICS',   short: '02' },
  { id: 2, label: 'LOCATION', short: '03' },
  { id: 3, label: 'TICKETS',  short: '04' },
  { id: 4, label: 'VIBE',     short: '05' },
  { id: 5, label: 'REVIEW',   short: '06' },
]

const defaultForm: Partial<CreateEventInput> = {
  type: undefined,
  alcoholPolicy: 'NONE',
  ageRestriction: 'ALL_AGES',
  isInviteOnly: false,
  showNeighbourhoodOnly: false,
  whatToBring: [],
  vibeTags: [],
  price: 0,
  ticketQuantity: 0,
  capacity: 50,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function CyberInput({ label, error, className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  const [focused, setFocused] = useState(false)
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.55)' }}>{label}</label>}
      <input
        {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
        className="w-full px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-all duration-200"
        style={{
          background: 'rgba(0,229,255,0.04)',
          border: focused ? '1px solid rgba(0,229,255,0.5)' : '1px solid rgba(0,229,255,0.15)',
          color: '#e0f2fe',
          boxShadow: focused ? '0 0 12px rgba(0,229,255,0.1)' : 'none',
        }}
      />
      {error && <p className="text-[11px] font-medium" style={{ color: '#ff006e' }}>{error}</p>}
    </div>
  )
}

function CyberTextarea({ label, error, className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }) {
  const [focused, setFocused] = useState(false)
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.55)' }}>{label}</label>}
      <textarea
        {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
        className="w-full px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-all duration-200 resize-none"
        style={{
          background: 'rgba(0,229,255,0.04)',
          border: focused ? '1px solid rgba(0,229,255,0.5)' : '1px solid rgba(0,229,255,0.15)',
          color: '#e0f2fe',
          boxShadow: focused ? '0 0 12px rgba(0,229,255,0.1)' : 'none',
        }}
      />
      {error && <p className="text-[11px]" style={{ color: '#ff006e' }}>{error}</p>}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function CreateEventPage() {
  const router = useRouter()
  const { dbUser, loading: authLoading } = useAuth()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Partial<CreateEventInput>>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [published, setPublished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authLoading && !dbUser) router.push('/login')
  }, [authLoading, dbUser, router])

  if (authLoading || !dbUser) return null

  function update(patch: Partial<CreateEventInput>) {
    setForm((f) => ({ ...f, ...patch }))
  }

  function handleCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
  }

  function useMyLocation() {
    setLocating(true)
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) => {
        update({ lat: coords.latitude, lng: coords.longitude })
        setLocating(false)
      },
      () => setLocating(false),
      { timeout: 5000 }
    )
  }

  // Pure check — no side effects, safe to call during render
  function isStepValid() {
    if (step === 0) return !!form.type
    if (step === 1) {
      if (!(form.name?.trim() && form.startsAt && form.description?.trim())) return false
      if (form.description.trim().length < 10) return false
      if (new Date(form.startsAt) <= new Date()) return false
      if (form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) return false
      return true
    }
    if (step === 2) return !!(form.address?.trim() && form.neighbourhood?.trim() && form.lat && form.lng)
    if (step === 3) {
      if ((form.price ?? 0) > 0 && !(form.ticketQuantity && form.ticketQuantity > 0)) return false
      return true
    }
    return true
  }

  // Called on button click — sets error messages for user feedback
  function canAdvance(): boolean {
    if (step === 1) {
      if (!(form.name?.trim() && form.startsAt && form.description?.trim())) {
        setError('Please fill in all required fields')
        return false
      }
      if (form.description.trim().length < 10) {
        setError('Description must be at least 10 characters')
        return false
      }
      if (new Date(form.startsAt) <= new Date()) {
        setError('Start date must be in the future')
        return false
      }
      if (form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) {
        setError('End time must be after the start time')
        return false
      }
      setError(null)
      return true
    }
    if (step === 3) {
      if ((form.price ?? 0) > 0 && !(form.ticketQuantity && form.ticketQuantity > 0)) {
        setError('Paid events must have a ticket quantity greater than 0')
        return false
      }
      setError(null)
      return true
    }
    return isStepValid()
  }

  async function handlePublish() {
    setSubmitting(true)
    setError(null)
    try {
      let coverImageUrl = form.coverImageUrl
      if (coverFile) {
        try { coverImageUrl = await uploadImage(coverFile, 'events') } catch { /* skip upload in dev */ }
      }
      const event = await createEvent({ ...form, coverImageUrl, hostId: dbUser!.id } as any)
      setPublished(true)
      setTimeout(() => router.push(`/events/${event.id}`), 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create event')
    } finally {
      setSubmitting(false)
    }
  }

  const currentType = EVENT_TYPES.find((t) => t.id === form.type)
  const accentColor = currentType?.color ?? '#00e5ff'
  const accentGlow = currentType?.glow ?? 'rgba(0,229,255,0.3)'
  const progress = ((step) / (STEPS.length - 1)) * 100

  // ── Published success ────────────────────────────────────────────────────
  if (published) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <div className="w-20 h-20 rounded-full flex items-center justify-center animate-fade-up"
          style={{ border: '2px solid #00ff88', boxShadow: '0 0 40px rgba(0,255,136,0.4)' }}>
          <Check size={36} style={{ color: '#00ff88' }} />
        </div>
        <div className="text-center animate-fade-up">
          <p className="text-xs font-bold tracking-[0.3em] mb-2" style={{ color: 'rgba(0,255,136,0.6)' }}>EVENT PUBLISHED</p>
          <h2 className="text-2xl font-black" style={{ color: '#e0f2fe' }}>{form.name}</h2>
          <p className="text-sm mt-1" style={{ color: 'rgba(74,96,128,0.8)' }}>Redirecting to your event...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col pt-14" style={{ background: '#04040d' }}>
      {/* ── Top step bar ── */}
      <div
        className="sticky top-14 z-30 flex-shrink-0"
        style={{
          background: 'rgba(4,4,13,0.92)',
          borderBottom: '1px solid rgba(0,229,255,0.1)',
          backdropFilter: 'blur(16px)',
        }}
      >
        {/* Neon progress line */}
        <div className="h-px relative" style={{ background: 'rgba(0,229,255,0.08)' }}>
          <div
            className="absolute top-0 left-0 h-px transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${accentColor}, rgba(0,229,255,0.4))`,
              boxShadow: `0 0 8px ${accentColor}`,
            }}
          />
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 max-w-2xl mx-auto">
          {/* Back arrow */}
          <button
            onClick={() => step > 0 ? setStep((s) => s - 1) : router.push('/discover')}
            className="p-1.5 rounded transition-all duration-200"
            style={{ color: 'rgba(74,96,128,0.7)', border: '1px solid rgba(0,229,255,0.1)' }}
          >
            <ChevronLeft size={16} />
          </button>

          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((s) => (
              <div
                key={s.id}
                className="transition-all duration-300 rounded-full"
                style={{
                  width: s.id === step ? 20 : 6,
                  height: 6,
                  background: s.id < step
                    ? accentColor
                    : s.id === step
                    ? accentColor
                    : 'rgba(0,229,255,0.12)',
                  boxShadow: s.id === step ? `0 0 8px ${accentColor}` : 'none',
                }}
              />
            ))}
          </div>

          {/* Step label */}
          <span className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.5)' }}>
            {STEPS[step].short} / {STEPS[STEPS.length - 1].short}
          </span>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 py-6 pb-32">

        {/* Step label */}
        <p className="text-[10px] font-bold tracking-[0.25em] mb-1" style={{ color: `${accentColor}80` }}>
          STEP {STEPS[step].short}
        </p>
        <h1 className="text-xl font-black mb-6" style={{ color: '#e0f2fe', letterSpacing: '0.05em' }}>
          {step === 0 && 'WHAT KIND OF EVENT?'}
          {step === 1 && (form.type === 'CLUB_NIGHT' ? 'EVENT DETAILS' : form.type === 'CONCERT' ? 'SHOW DETAILS' : 'TELL US ABOUT IT')}
          {step === 2 && (form.type === 'CLUB_NIGHT' ? 'VENUE LOCATION' : 'WHERE IS IT?')}
          {step === 3 && (form.type === 'CLUB_NIGHT' ? 'CAPACITY & TICKETING' : form.type === 'CONCERT' ? 'ADMISSION & PRICE' : 'CAPACITY & PRICE')}
          {step === 4 && (form.type === 'CLUB_NIGHT' ? 'LINEUP & POLICIES' : form.type === 'HOME_PARTY' ? 'VIBE & PARTY SIGNALS' : 'SET THE VIBE')}
          {step === 5 && 'REVIEW & PUBLISH'}
        </h1>

        {/* ── Step 0: Event type ── */}
        {step === 0 && (
          <div className="grid grid-cols-1 gap-4">
            {EVENT_TYPES.map((type) => {
              const selected = form.type === type.id
              return (
                <button
                  key={type.id}
                  onClick={() => update({ type: type.id })}
                  className="relative flex items-center gap-5 p-5 rounded-2xl text-left transition-all duration-250"
                  style={{
                    background: selected ? `${type.color}12` : 'rgba(7,7,26,0.8)',
                    border: selected ? `1px solid ${type.color}60` : '1px solid rgba(0,229,255,0.1)',
                    boxShadow: selected ? `0 0 30px ${type.glow}` : 'none',
                    transform: selected ? 'scale(1.01)' : 'scale(1)',
                  }}
                >
                  {/* Corner brackets on selected */}
                  {selected && <>
                    <div className="absolute top-2 left-2 w-4 h-4" style={{ borderTop: `2px solid ${type.color}70`, borderLeft: `2px solid ${type.color}70` }} />
                    <div className="absolute bottom-2 right-2 w-4 h-4" style={{ borderBottom: `2px solid ${type.color}70`, borderRight: `2px solid ${type.color}70` }} />
                  </>}

                  <div
                    className="text-4xl flex-shrink-0 w-16 h-16 rounded-xl flex items-center justify-center"
                    style={{
                      background: selected ? `${type.color}18` : 'rgba(0,229,255,0.04)',
                      border: `1px solid ${selected ? type.color + '40' : 'rgba(0,229,255,0.1)'}`,
                    }}
                  >
                    {type.emoji}
                  </div>
                  <div className="flex-1">
                    <p className="font-black text-base tracking-wide" style={{ color: selected ? type.color : '#e0f2fe', textShadow: selected ? `0 0 12px ${type.glow}` : 'none' }}>
                      {type.label.toUpperCase()}
                    </p>
                    <p className="text-sm mt-0.5" style={{ color: 'rgba(74,96,128,0.8)' }}>{type.desc}</p>
                    <p className="text-[10px] mt-1 font-medium" style={{ color: selected ? `${type.color}60` : 'rgba(74,96,128,0.4)' }}>{type.sub}</p>
                  </div>
                  {selected && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: type.color, boxShadow: `0 0 10px ${type.glow}` }}>
                      <Check size={12} color="#04040d" strokeWidth={3} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Step 1: Basic info ── */}
        {step === 1 && (
          <div className="space-y-5">
            <CyberInput
              label={form.type === 'CLUB_NIGHT' ? 'NIGHT NAME / BRAND *' : form.type === 'CONCERT' ? 'SHOW TITLE *' : 'EVENT NAME *'}
              value={form.name ?? ''}
              onChange={(e) => update({ name: e.target.value })}
              placeholder={form.type === 'CLUB_NIGHT' ? 'e.g. FABRIC × Resident Advisor' : form.type === 'CONCERT' ? 'e.g. The 1975 — Live in Glasgow' : 'My Rooftop Rave'}
              maxLength={100}
            />
            {form.type === 'CLUB_NIGHT' && (
              <CyberInput
                label="VENUE NAME *"
                value={(form as any).venueName ?? ''}
                onChange={(e) => update({ venueName: e.target.value } as any)}
                placeholder="e.g. SWG3, Fabric, Printworks..."
              />
            )}
            <div className="grid grid-cols-2 gap-4">
              <CyberInput
                label="START DATE & TIME *"
                type="datetime-local"
                value={form.startsAt ? form.startsAt.slice(0, 16) : ''}
                onChange={(e) => update({ startsAt: new Date(e.target.value).toISOString() })}
              />
              <CyberInput
                label="END TIME (OPTIONAL)"
                type="datetime-local"
                value={form.endsAt ? form.endsAt.slice(0, 16) : ''}
                onChange={(e) => update({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
              />
            </div>
            <CyberTextarea
              label={form.type === 'CLUB_NIGHT' ? 'ABOUT THIS NIGHT *' : form.type === 'CONCERT' ? 'ABOUT THIS SHOW *' : 'DESCRIPTION *'}
              value={form.description ?? ''}
              onChange={(e) => update({ description: e.target.value })}
              rows={4}
              placeholder={
                form.type === 'CLUB_NIGHT'
                  ? 'Describe the music policy, resident DJs, and what sets this night apart...'
                  : form.type === 'CONCERT'
                  ? 'Who\'s performing, support acts, stage times, and what to expect...'
                  : 'Tell people what to expect — the vibe, the setting, the energy...'
              }
              maxLength={2000}
            />

            {/* Cover image */}
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] mb-2" style={{ color: 'rgba(0,229,255,0.55)' }}>COVER IMAGE</p>
              {coverPreview ? (
                <div className="relative rounded-xl overflow-hidden mb-3" style={{ height: 180 }}>
                  <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(4,4,13,0.6), transparent)' }} />
                  <button
                    onClick={() => { setCoverFile(null); setCoverPreview(null) }}
                    className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold"
                    style={{ background: 'rgba(255,0,110,0.2)', border: '1px solid rgba(255,0,110,0.4)', color: '#ff006e' }}
                  >
                    REMOVE
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full flex flex-col items-center gap-2 py-8 rounded-xl transition-all duration-200"
                  style={{
                    background: 'rgba(0,229,255,0.03)',
                    border: '1px dashed rgba(0,229,255,0.2)',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,229,255,0.4)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,229,255,0.2)' }}
                >
                  <Upload size={20} style={{ color: 'rgba(0,229,255,0.4)' }} />
                  <span className="text-xs font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.45)' }}>UPLOAD COVER IMAGE</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleCover} className="hidden" />
            </div>
          </div>
        )}

        {/* ── Step 2: Location ── */}
        {step === 2 && (
          <div className="space-y-4">
            <CyberInput
              label="FULL ADDRESS *"
              value={form.address ?? ''}
              onChange={(e) => update({ address: e.target.value })}
              placeholder="123 Main St, Glasgow, G1 2AB"
            />
            <CyberInput
              label="NEIGHBOURHOOD *"
              value={form.neighbourhood ?? ''}
              onChange={(e) => update({ neighbourhood: e.target.value })}
              placeholder="West End"
            />
            <div className="grid grid-cols-2 gap-4">
              <CyberInput
                label="LATITUDE *"
                type="number"
                step="any"
                value={form.lat ?? ''}
                onChange={(e) => update({ lat: Number(e.target.value) })}
                placeholder="55.8723"
              />
              <CyberInput
                label="LONGITUDE *"
                type="number"
                step="any"
                value={form.lng ?? ''}
                onChange={(e) => update({ lng: Number(e.target.value) })}
                placeholder="-4.2896"
              />
            </div>

            {/* Use my location button */}
            <button
              onClick={useMyLocation}
              disabled={locating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 w-full justify-center"
              style={{
                background: 'rgba(0,255,136,0.06)',
                border: '1px solid rgba(0,255,136,0.3)',
                color: '#00ff88',
                letterSpacing: '0.1em',
              }}
            >
              {locating
                ? <><div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" /> LOCATING...</>
                : <><Navigation size={13} /> USE MY LOCATION</>
              }
            </button>

            {/* Privacy mode */}
            <button
              onClick={() => update({ showNeighbourhoodOnly: !form.showNeighbourhoodOnly })}
              className="flex items-start gap-3 p-4 rounded-xl w-full text-left transition-all duration-200"
              style={{
                background: form.showNeighbourhoodOnly ? 'rgba(0,229,255,0.06)' : 'rgba(0,229,255,0.02)',
                border: form.showNeighbourhoodOnly ? '1px solid rgba(0,229,255,0.3)' : '1px solid rgba(0,229,255,0.1)',
              }}
            >
              <div
                className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  border: form.showNeighbourhoodOnly ? '1px solid rgba(0,229,255,0.6)' : '1px solid rgba(0,229,255,0.2)',
                  background: form.showNeighbourhoodOnly ? '#00e5ff' : 'transparent',
                }}
              >
                {form.showNeighbourhoodOnly && <Check size={12} color="#04040d" strokeWidth={3} />}
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>Privacy Mode</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(74,96,128,0.8)' }}>
                  Show only neighbourhood, not full address, on public listings
                </p>
              </div>
            </button>
          </div>
        )}

        {/* ── Step 3: Capacity & Tickets ── */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Capacity slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.55)' }}>CAPACITY</label>
                <span className="text-lg font-black" style={{ color: accentColor, textShadow: `0 0 12px ${accentGlow}` }}>
                  {form.capacity} guests
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={10000}
                step={form.capacity !== undefined && form.capacity < 100 ? 1 : form.capacity !== undefined && form.capacity < 500 ? 5 : 50}
                value={form.capacity ?? 50}
                onChange={(e) => update({ capacity: Number(e.target.value) })}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${accentColor} 0%, ${accentColor} ${((form.capacity ?? 50) / 10000) * 100}%, rgba(0,229,255,0.1) ${((form.capacity ?? 50) / 10000) * 100}%, rgba(0,229,255,0.1) 100%)`,
                }}
              />
              <div className="flex justify-between text-[10px] mt-1" style={{ color: 'rgba(74,96,128,0.5)' }}>
                <span>1</span><span>10,000</span>
              </div>
            </div>

            {/* Free vs Paid toggle */}
            <div>
              <label className="text-[10px] font-bold tracking-[0.2em] mb-3 block" style={{ color: 'rgba(0,229,255,0.55)' }}>ENTRY</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'FREE', value: 0, emoji: '🎁', color: '#00ff88', glow: 'rgba(0,255,136,0.3)' },
                  { label: 'PAID', value: -1, emoji: '🎟️', color: '#ffd600', glow: 'rgba(255,214,0,0.3)' },
                ].map((opt) => {
                  const isPaid = opt.value === -1
                  const isSelected = isPaid ? (form.price ?? 0) > 0 : form.price === 0
                  return (
                    <button
                      key={opt.label}
                      onClick={() => update({ price: isPaid ? 10 : 0 })}
                      className="flex flex-col items-center gap-2 py-5 rounded-xl transition-all duration-200"
                      style={{
                        background: isSelected ? `${opt.color}10` : 'rgba(0,229,255,0.03)',
                        border: isSelected ? `1px solid ${opt.color}50` : '1px solid rgba(0,229,255,0.1)',
                        boxShadow: isSelected ? `0 0 20px ${opt.glow}` : 'none',
                      }}
                    >
                      <span className="text-3xl">{opt.emoji}</span>
                      <span className="text-xs font-black tracking-widest" style={{ color: isSelected ? opt.color : 'rgba(74,96,128,0.7)' }}>{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Ticket price (if paid) */}
            {(form.price ?? 0) > 0 && (
              <div className="space-y-3 animate-fade-up">
                <CyberInput
                  label="TICKET PRICE (£) *"
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={form.price ?? ''}
                  onChange={(e) => update({ price: Number(e.target.value) })}
                />
                <CyberInput
                  label="TICKET QUANTITY"
                  type="number"
                  min={1}
                  value={form.ticketQuantity ?? ''}
                  onChange={(e) => update({ ticketQuantity: Number(e.target.value) })}
                />
                <div className="px-3 py-2.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.2)', color: 'rgba(255,214,0,0.7)' }}>
                  ⚡ Platform fee: 5% per ticket · Requires Pro or Premium subscription
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Vibe ── */}
        {step === 4 && (
          <div className="space-y-6">
            {/* Club night: lineup field */}
            {(form.type === 'CLUB_NIGHT' || form.type === 'CONCERT') && (
              <CyberInput
                label={form.type === 'CLUB_NIGHT' ? 'LINEUP / RESIDENT DJs' : 'ARTIST LINEUP'}
                value={(form as any).lineup ?? ''}
                onChange={(e) => update({ lineup: e.target.value } as any)}
                placeholder={form.type === 'CLUB_NIGHT' ? 'e.g. Carl Cox, Amelie Lens, Richie Hawtin' : 'e.g. The 1975 + Sports Team (support)'}
              />
            )}

            {/* Alcohol policy */}
            {(() => {
              const isVenue = form.type === 'CLUB_NIGHT' || form.type === 'CONCERT'
              const opts = isVenue ? ALCOHOL_OPTIONS_VENUE : ALCOHOL_OPTIONS_PARTY
              return (
                <div>
                  <label className="text-[10px] font-bold tracking-[0.2em] mb-3 block" style={{ color: 'rgba(0,229,255,0.55)' }}>
                    {isVenue ? 'BAR POLICY' : 'ALCOHOL POLICY'}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {opts.map((opt) => {
                      const selected = form.alcoholPolicy === opt.value
                      return (
                        <button
                          key={opt.value}
                          onClick={() => update({ alcoholPolicy: opt.value as AlcoholPolicy })}
                          className="flex flex-col items-center gap-2 py-4 rounded-xl transition-all duration-200"
                          style={{
                            background: selected ? 'rgba(0,229,255,0.08)' : 'rgba(0,229,255,0.02)',
                            border: selected ? '1px solid rgba(0,229,255,0.4)' : '1px solid rgba(0,229,255,0.1)',
                            boxShadow: selected ? '0 0 16px rgba(0,229,255,0.12)' : 'none',
                          }}
                        >
                          <span className="text-2xl">{opt.emoji}</span>
                          <span className="text-[9px] font-bold tracking-widest leading-tight text-center" style={{ color: selected ? '#00e5ff' : 'rgba(74,96,128,0.7)' }}>
                            {opt.label.toUpperCase()}
                          </span>
                          <span className="text-[8px] leading-tight text-center" style={{ color: selected ? 'rgba(0,229,255,0.5)' : 'rgba(74,96,128,0.4)' }}>
                            {opt.sublabel}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Contextual notices */}
                  {form.alcoholPolicy === 'PROVIDED' && (
                    <div className="mt-3 space-y-2">
                      {isVenue ? (
                        <div className="px-3 py-2.5 rounded-lg text-xs" style={{ background: 'rgba(255,166,0,0.06)', border: '1px solid rgba(255,166,0,0.2)', color: 'rgba(255,166,0,0.8)' }}>
                          🍺 <strong>Premises licence required</strong> — your venue must hold a valid premises licence to sell alcohol. Selling without one is a criminal offence.
                        </div>
                      ) : (
                        <div className="px-3 py-2.5 rounded-lg text-xs" style={{ background: 'rgba(255,166,0,0.06)', border: '1px solid rgba(255,166,0,0.2)', color: 'rgba(255,166,0,0.8)' }}>
                          🍾 <strong>Hosting at a venue?</strong> — confirm the venue permits your own bar service. Corkage or bar-hire fees typically range £150–£500.
                        </div>
                      )}
                      <div className="px-3 py-2.5 rounded-lg text-xs" style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.12)', color: 'rgba(0,229,255,0.6)' }}>
                        👁 This event is hidden from guests who haven't enabled alcohol events in their settings.
                      </div>
                    </div>
                  )}
                  {form.alcoholPolicy === 'BYOB' && (
                    <div className="mt-3 space-y-2">
                      <div className="px-3 py-2.5 rounded-lg text-xs" style={{ background: 'rgba(255,166,0,0.06)', border: '1px solid rgba(255,166,0,0.2)', color: 'rgba(255,166,0,0.8)' }}>
                        🥃 {isVenue
                          ? <><strong>BYOB at venues</strong> — most licensed venues prohibit outside alcohol or charge corkage (£5–£20 per bottle). Verify with the venue first.</>
                          : <><strong>BYOB</strong> — remind guests to bring enough for the night. Consider adding a list in "What to Bring".</>
                        }
                      </div>
                      <div className="px-3 py-2.5 rounded-lg text-xs" style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.12)', color: 'rgba(0,229,255,0.6)' }}>
                        👁 This event is hidden from guests who haven't enabled alcohol events in their settings.
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Age restriction */}
            <div>
              <label className="text-[10px] font-bold tracking-[0.2em] mb-3 block" style={{ color: 'rgba(0,229,255,0.55)' }}>AGE RESTRICTION</label>
              <div className="grid grid-cols-3 gap-2">
                {AGE_OPTIONS.map((opt) => {
                  const selected = form.ageRestriction === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => update({ ageRestriction: opt.value as AgeRestriction })}
                      className="flex flex-col items-center gap-1.5 py-4 rounded-xl transition-all duration-200"
                      style={{
                        background: selected ? 'rgba(0,229,255,0.08)' : 'rgba(0,229,255,0.02)',
                        border: selected ? '1px solid rgba(0,229,255,0.4)' : '1px solid rgba(0,229,255,0.1)',
                        boxShadow: selected ? '0 0 16px rgba(0,229,255,0.12)' : 'none',
                      }}
                    >
                      <span className="text-2xl">{opt.emoji}</span>
                      <span className="text-[10px] font-black" style={{ color: selected ? '#00e5ff' : 'rgba(74,96,128,0.7)' }}>{opt.label}</span>
                    </button>
                  )
                })}
              </div>
              {form.ageRestriction !== 'ALL_AGES' && (
                <div className="mt-3 px-3 py-2.5 rounded-lg text-xs" style={{ background: 'rgba(255,0,110,0.05)', border: '1px solid rgba(255,0,110,0.18)', color: 'rgba(255,0,110,0.7)' }}>
                  🔞 You are responsible for ID checks at the door. PartyRadar does not verify guest ages — only admit guests who meet the restriction.
                </div>
              )}
            </div>

            {/* Dress code */}
            <CyberInput
              label="DRESS CODE (OPTIONAL)"
              value={form.dressCode ?? ''}
              onChange={(e) => update({ dressCode: e.target.value || undefined })}
              placeholder="All black, smart casual, neon..."
            />

            {/* Vibe tags */}
            <div>
              <label className="text-[10px] font-bold tracking-[0.2em] mb-3 block" style={{ color: 'rgba(0,229,255,0.55)' }}>
                {form.type === 'CLUB_NIGHT' ? 'MUSIC & GENRE TAGS' : 'VIBE TAGS'}
              </label>
              <div className="flex flex-wrap gap-2">
                {VIBE_TAGS.map((tag) => {
                  const on = (form.vibeTags ?? []).includes(tag)
                  return (
                    <button
                      key={tag}
                      onClick={() => {
                        const curr = form.vibeTags ?? []
                        update({ vibeTags: on ? curr.filter((t) => t !== tag) : [...curr, tag] })
                      }}
                      className="px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200"
                      style={{
                        background: on ? `${accentColor}15` : 'rgba(0,229,255,0.03)',
                        border: on ? `1px solid ${accentColor}50` : '1px solid rgba(0,229,255,0.12)',
                        color: on ? accentColor : 'rgba(74,96,128,0.7)',
                        boxShadow: on ? `0 0 8px ${accentGlow}` : 'none',
                        letterSpacing: '0.08em',
                      }}
                    >
                      #{tag}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 🏠 Party Signals — HOME_PARTY only */}
            {form.type === 'HOME_PARTY' && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(255,0,110,0.6)' }}>PARTY SIGNALS</label>
                  <span className="text-[9px] px-2 py-0.5 rounded" style={{ color: 'rgba(255,0,110,0.5)', border: '1px solid rgba(255,0,110,0.2)', background: 'rgba(255,0,110,0.05)', letterSpacing: '0.1em' }}>PRIVATE</span>
                </div>
                <p className="text-[10px] mb-3" style={{ color: 'rgba(74,96,128,0.6)' }}>
                  Tap to signal what's happening. Only visible to confirmed guests.
                </p>
                <div className="grid grid-cols-8 gap-1.5">
                  {PARTY_SIGNALS.map((sig) => {
                    const on = ((form as any).partySigns ?? []).includes(sig.code)
                    return (
                      <button
                        key={sig.code}
                        onClick={() => {
                          const curr: string[] = (form as any).partySigns ?? []
                          update({ partySigns: on ? curr.filter((c: string) => c !== sig.code) : [...curr, sig.code] } as any)
                        }}
                        className="aspect-square flex items-center justify-center rounded-xl text-xl transition-all duration-200"
                        style={{
                          background: on ? 'rgba(255,0,110,0.12)' : 'rgba(255,0,110,0.03)',
                          border: on ? '1px solid rgba(255,0,110,0.45)' : '1px solid rgba(255,0,110,0.1)',
                          boxShadow: on ? '0 0 10px rgba(255,0,110,0.2)' : 'none',
                          filter: on ? 'none' : 'grayscale(60%) opacity(0.5)',
                          transform: on ? 'scale(1.08)' : 'scale(1)',
                        }}
                        title={sig.code}
                      >
                        {sig.emoji}
                      </button>
                    )
                  })}
                </div>
                {((form as any).partySigns ?? []).length > 0 && (
                  <p className="text-[10px] mt-2 font-bold" style={{ color: 'rgba(255,0,110,0.5)' }}>
                    {((form as any).partySigns ?? []).length} signal{((form as any).partySigns ?? []).length !== 1 ? 's' : ''} active
                  </p>
                )}
              </div>
            )}

            {/* Invite only */}
            <button
              onClick={() => update({ isInviteOnly: !form.isInviteOnly })}
              className="flex items-start gap-3 p-4 rounded-xl w-full text-left transition-all duration-200"
              style={{
                background: form.isInviteOnly ? 'rgba(255,0,110,0.06)' : 'rgba(0,229,255,0.02)',
                border: form.isInviteOnly ? '1px solid rgba(255,0,110,0.3)' : '1px solid rgba(0,229,255,0.1)',
              }}
            >
              <div
                className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  border: form.isInviteOnly ? '1px solid rgba(255,0,110,0.6)' : '1px solid rgba(0,229,255,0.2)',
                  background: form.isInviteOnly ? '#ff006e' : 'transparent',
                }}
              >
                {form.isInviteOnly && <Check size={12} color="#04040d" strokeWidth={3} />}
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: form.isInviteOnly ? '#ff006e' : '#e0f2fe' }}>🔒 Invite Only</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(74,96,128,0.8)' }}>
                  Hidden from public discovery — only people with your invite link can see it
                </p>
              </div>
            </button>
          </div>
        )}

        {/* ── Step 5: Review ── */}
        {step === 5 && (
          <div className="space-y-4">
            {/* Preview card */}
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${accentColor}30`, boxShadow: `0 0 30px ${accentGlow}` }}>
              {coverPreview && (
                <div className="relative h-40">
                  <img src={coverPreview} alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(0.6)' }} />
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent, rgba(4,4,13,0.9))' }} />
                </div>
              )}
              <div className="p-5" style={{ background: 'rgba(7,7,26,0.9)' }}>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ color: accentColor, border: `1px solid ${accentColor}50`, background: `${accentColor}10`, letterSpacing: '0.12em' }}>
                  {form.type?.replace('_', ' ')}
                </span>
                <h3 className="text-xl font-black mt-2" style={{ color: '#e0f2fe' }}>{form.name || '—'}</h3>
                <p className="text-sm mt-1 line-clamp-2" style={{ color: 'rgba(74,96,128,0.8)' }}>{form.description || '—'}</p>
              </div>
            </div>

            {/* Summary grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'PRICE', value: form.price === 0 ? 'FREE' : `£${form.price}` },
                { label: 'CAPACITY', value: `${form.capacity} guests` },
                { label: 'LOCATION', value: form.neighbourhood || '—' },
                { label: 'ACCESS', value: form.isInviteOnly ? 'Invite Only' : 'Public' },
                { label: 'ALCOHOL', value: form.alcoholPolicy?.replace('_', ' ') || '—' },
                { label: 'AGE', value: form.ageRestriction?.replace('_', ' ') || '—' },
              ].map((item) => (
                <div key={item.label} className="p-3 rounded-lg" style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.1)' }}>
                  <p className="text-[9px] font-bold tracking-[0.15em]" style={{ color: 'rgba(0,229,255,0.45)' }}>{item.label}</p>
                  <p className="text-sm font-bold mt-0.5" style={{ color: '#e0f2fe' }}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Vibe tags */}
            {(form.vibeTags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.vibeTags!.map((tag) => (
                  <span key={tag} className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ color: `${accentColor}80`, border: `1px solid ${accentColor}20`, background: `${accentColor}05`, letterSpacing: '0.08em' }}>
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Lineup preview (club/concert) */}
            {(form as any).lineup && (
              <div className="p-3 rounded-lg" style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.1)' }}>
                <p className="text-[9px] font-bold tracking-[0.15em] mb-1" style={{ color: 'rgba(0,229,255,0.45)' }}>LINEUP</p>
                <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{(form as any).lineup}</p>
              </div>
            )}

            {/* Party signals preview (home party) */}
            {form.type === 'HOME_PARTY' && ((form as any).partySigns ?? []).length > 0 && (
              <div className="p-3 rounded-lg" style={{ background: 'rgba(255,0,110,0.04)', border: '1px solid rgba(255,0,110,0.15)' }}>
                <p className="text-[9px] font-bold tracking-[0.15em] mb-2" style={{ color: 'rgba(255,0,110,0.5)' }}>PARTY SIGNALS · GUESTS ONLY</p>
                <div className="flex gap-2 flex-wrap">
                  {PARTY_SIGNALS.filter((s) => ((form as any).partySigns ?? []).includes(s.code)).map((s) => (
                    <span key={s.code} className="text-2xl">{s.emoji}</span>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="px-3 py-2.5 rounded-lg text-sm" style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
                {error}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Fixed bottom nav ── */}
      <div
        className="z-30 px-4 py-4"
        style={{
          position: 'fixed',
          bottom: 64,
          left: 0,
          right: 0,
          background: 'rgba(4,4,13,0.95)',
          borderTop: '1px solid rgba(0,229,255,0.1)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="max-w-2xl mx-auto flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs transition-all duration-200"
              style={{ border: '1px solid rgba(0,229,255,0.2)', color: 'rgba(0,229,255,0.6)', letterSpacing: '0.1em' }}
            >
              <ChevronLeft size={14} /> BACK
            </button>
          )}

          <button
            onClick={step < STEPS.length - 1 ? () => { if (canAdvance()) setStep((s) => s + 1) } : handlePublish}
            disabled={!isStepValid() || submitting}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all duration-250 disabled:opacity-30"
            style={{
              background: isStepValid() && !submitting ? `linear-gradient(135deg, ${accentColor}20, rgba(61,90,254,0.15))` : 'rgba(0,229,255,0.04)',
              border: `1px solid ${isStepValid() && !submitting ? accentColor + '60' : 'rgba(0,229,255,0.15)'}`,
              color: isStepValid() ? accentColor : 'rgba(0,229,255,0.3)',
              boxShadow: isStepValid() && !submitting ? `0 0 20px ${accentGlow}` : 'none',
              letterSpacing: '0.1em',
            }}
          >
            {submitting ? (
              <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> PUBLISHING...</>
            ) : step < STEPS.length - 1 ? (
              <>NEXT <ChevronRight size={14} /></>
            ) : (
              <><Zap size={14} /> PUBLISH EVENT</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
