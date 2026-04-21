'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, Upload, Navigation, Loader2, Save } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useEvent, updateEvent } from '@/hooks/useEvents'
import { uploadImage } from '@/lib/cloudinary'
import { loginHref } from '@/lib/authRedirect'
import { VIBE_TAGS } from '@partyradar/shared'
import type { AlcoholPolicy, AgeRestriction, EventType } from '@partyradar/shared'

// ── Types ─────────────────────────────────────────────────────────────────────
const EVENT_TYPES: { id: EventType; label: string; emoji: string; color: string }[] = [
  { id: 'HOME_PARTY',  label: 'Home Party',  emoji: '🏠', color: '#ff006e'     },
  { id: 'CLUB_NIGHT',  label: 'Club Night',  emoji: '🎵', color: 'var(--accent)' },
  { id: 'CONCERT',     label: 'Concert',     emoji: '🎤', color: '#3d5afe'     },
  { id: 'PUB_NIGHT',   label: 'Pub Night',   emoji: '🍺', color: '#f59e0b'     },
  { id: 'BEACH_PARTY', label: 'Beach Party', emoji: '🏖️', color: '#06b6d4'     },
  { id: 'YACHT_PARTY', label: 'Yacht Party', emoji: '⛵', color: '#0ea5e9'     },
]

const ALCOHOL_OPTIONS = [
  { value: 'NONE',     label: 'No Alcohol', emoji: '🚫' },
  { value: 'PROVIDED', label: 'Provided',   emoji: '🍾' },
  { value: 'BYOB',     label: 'BYOB',       emoji: '🥃' },
]

const AGE_OPTIONS = [
  { value: 'ALL_AGES', label: 'All Ages', emoji: '👶' },
  { value: 'AGE_18',   label: '18+',      emoji: '🔞' },
  { value: 'AGE_21',   label: '21+',      emoji: '🍸' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function CyberInput({ label, error, className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  const [focused, setFocused] = useState(false)
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>{label}</label>}
      <input
        {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
        className="w-full px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-all duration-200"
        style={{
          background: 'rgba(var(--accent-rgb),0.04)',
          border: focused ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(var(--accent-rgb),0.15)',
          color: '#e0f2fe',
          boxShadow: focused ? '0 0 12px rgba(var(--accent-rgb),0.1)' : 'none',
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
      {label && <label className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>{label}</label>}
      <textarea
        {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
        className="w-full px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none transition-all duration-200 resize-none"
        style={{
          background: 'rgba(var(--accent-rgb),0.04)',
          border: focused ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(var(--accent-rgb),0.15)',
          color: '#e0f2fe',
          boxShadow: focused ? '0 0 12px rgba(var(--accent-rgb),0.1)' : 'none',
        }}
      />
      {error && <p className="text-[11px]" style={{ color: '#ff006e' }}>{error}</p>}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function EditEventPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = String(params['id'])
  const { dbUser, loading: authLoading } = useAuth()
  const { event, isLoading: eventLoading } = useEvent(eventId)

  const [form, setForm] = useState<Record<string, unknown>>({})
  const [initialised, setInitialised] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !dbUser) router.push(loginHref(`/events/${params['id']}/edit`))
  }, [authLoading, dbUser, router])

  // Pre-fill form when event loads
  useEffect(() => {
    if (event && !initialised) {
      setForm({
        name: event.name ?? '',
        type: event.type,
        description: event.description ?? '',
        startsAt: event.startsAt ? new Date(event.startsAt).toISOString().slice(0, 16) : '',
        endsAt: event.endsAt ? new Date(event.endsAt).toISOString().slice(0, 16) : '',
        address: event.address ?? '',
        neighbourhood: event.neighbourhood ?? '',
        lat: event.lat,
        lng: event.lng,
        capacity: event.capacity ?? 50,
        price: event.price ?? 0,
        ticketQuantity: event.ticketQuantity ?? 0,
        alcoholPolicy: event.alcoholPolicy ?? 'NONE',
        ageRestriction: event.ageRestriction ?? 'ALL_AGES',
        dressCode: (event as any).dressCode ?? '',
        houseRules: (event as any).houseRules ?? '',
        vibeTags: event.vibeTags ?? [],
        isInviteOnly: event.isInviteOnly ?? false,
        djRequestsEnabled: event.djRequestsEnabled ?? false,
        showNeighbourhoodOnly: event.showNeighbourhoodOnly ?? false,
        venueName: (event as any).venueName ?? '',
        lineup: (event as any).lineup ?? '',
        whatToBring: event.whatToBring ?? [],
        coverImageUrl: event.coverImageUrl ?? '',
      })
      if (event.coverImageUrl) setCoverPreview(event.coverImageUrl)
      setInitialised(true)
    }
  }, [event, initialised])

  // Access control: only host can edit
  useEffect(() => {
    if (!eventLoading && event && dbUser && event.hostId !== dbUser.id) {
      router.push(`/events/${eventId}`)
    }
  }, [eventLoading, event, dbUser, router, eventId])

  if (authLoading || eventLoading || !initialised) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
        <p className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>LOADING...</p>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm font-bold" style={{ color: '#ff006e' }}>Event not found</p>
        <Link href="/discover" className="text-xs" style={{ color: 'var(--accent)' }}>← Back to Discover</Link>
      </div>
    )
  }

  function update(patch: Record<string, unknown>) {
    setForm(f => ({ ...f, ...patch }))
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

  function toggleVibeTag(tag: string) {
    const tags = (form.vibeTags as string[]) ?? []
    update({ vibeTags: tags.includes(tag) ? tags.filter((t: string) => t !== tag) : [...tags, tag] })
  }

  async function handleSave() {
    setSubmitting(true)
    setError(null)
    try {
      let coverImageUrl = form.coverImageUrl as string | undefined
      if (coverFile) {
        try { coverImageUrl = await uploadImage(coverFile, 'events') } catch { /* skip upload */ }
      }

      const payload: Record<string, unknown> = {
        ...form,
        coverImageUrl,
        startsAt: form.startsAt ? new Date(form.startsAt as string).toISOString() : undefined,
        endsAt: form.endsAt ? new Date(form.endsAt as string).toISOString() : undefined,
        capacity: Number(form.capacity),
        price: Number(form.price),
        ticketQuantity: Number(form.ticketQuantity),
        lat: Number(form.lat),
        lng: Number(form.lng),
      }

      await updateEvent(eventId, payload as any)
      setSaved(true)
      setTimeout(() => router.push(`/events/${eventId}`), 1200)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSubmitting(false)
    }
  }

  const currentTypeConfig = EVENT_TYPES.find(t => t.id === form.type)
  const accentColor = currentTypeConfig?.color ?? 'var(--accent)'
  const vibeTags = (form.vibeTags as string[]) ?? []

  if (saved) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <div className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{ border: '2px solid #00ff88', boxShadow: '0 0 40px rgba(0,255,136,0.4)' }}>
          <Check size={36} style={{ color: '#00ff88' }} />
        </div>
        <div className="text-center">
          <p className="text-xs font-bold tracking-[0.3em] mb-2" style={{ color: 'rgba(0,255,136,0.6)' }}>CHANGES SAVED</p>
          <h2 className="text-2xl font-black" style={{ color: '#e0f2fe' }}>{form.name as string}</h2>
          <p className="text-sm mt-1" style={{ color: 'rgba(74,96,128,0.8)' }}>Redirecting to event...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col pt-14 pb-32" style={{ background: '#04040d' }}>
      {/* Header */}
      <div className="sticky top-14 z-30 flex items-center gap-3 px-4 py-3"
        style={{ background: 'rgba(4,4,13,0.92)', borderBottom: '1px solid rgba(var(--accent-rgb),0.1)', backdropFilter: 'blur(16px)' }}>
        <Link href={`/events/${eventId}`}
          className="p-2 rounded-lg"
          style={{ border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'rgba(var(--accent-rgb),0.6)' }}>
          <ArrowLeft size={14} />
        </Link>
        <div className="flex-1">
          <p className="text-[9px] font-bold tracking-[0.25em]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>EDITING EVENT</p>
          <p className="text-sm font-black truncate" style={{ color: '#e0f2fe' }}>{event.name}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={submitting}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black tracking-widest disabled:opacity-40 transition-all"
          style={{ background: `${accentColor}15`, border: `1px solid ${accentColor}50`, color: accentColor }}>
          {submitting
            ? <><Loader2 size={12} className="animate-spin" /> SAVING...</>
            : <><Save size={12} /> SAVE</>
          }
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-4 px-4 py-3 rounded-xl text-sm font-medium"
          style={{ background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.25)', color: '#ff006e' }}>
          {error}
        </div>
      )}

      {/* Content */}
      <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-8">

        {/* Event Type */}
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] mb-3" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>EVENT TYPE</p>
          <div className="grid grid-cols-3 gap-2">
            {EVENT_TYPES.map(type => (
              <button
                key={type.id}
                onClick={() => update({ type: type.id })}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all"
                style={{
                  background: form.type === type.id ? `${type.color}12` : 'rgba(7,7,26,0.8)',
                  border: form.type === type.id ? `1px solid ${type.color}60` : '1px solid rgba(var(--accent-rgb),0.1)',
                }}>
                <span className="text-xl">{type.emoji}</span>
                <span className="text-[9px] font-black tracking-wide"
                  style={{ color: form.type === type.id ? type.color : 'rgba(224,242,254,0.6)' }}>
                  {type.label.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Basic Info */}
        <div className="space-y-4">
          <p className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>BASICS</p>
          <CyberInput
            label="EVENT NAME *"
            value={(form.name as string) ?? ''}
            onChange={e => update({ name: e.target.value })}
            maxLength={100}
          />
          {(form.type === 'CLUB_NIGHT' || form.type === 'CONCERT' || form.type === 'PUB_NIGHT') && (
            <CyberInput
              label="VENUE NAME"
              value={(form.venueName as string) ?? ''}
              onChange={e => update({ venueName: e.target.value })}
              placeholder="e.g. SWG3, Fabric..."
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <CyberInput
              label="START DATE & TIME *"
              type="datetime-local"
              value={(form.startsAt as string) ?? ''}
              onChange={e => update({ startsAt: e.target.value })}
            />
            <CyberInput
              label="END TIME (OPTIONAL)"
              type="datetime-local"
              value={(form.endsAt as string) ?? ''}
              onChange={e => update({ endsAt: e.target.value || undefined })}
            />
          </div>
          <CyberTextarea
            label="DESCRIPTION *"
            value={(form.description as string) ?? ''}
            onChange={e => update({ description: e.target.value })}
            rows={4}
            maxLength={2000}
          />
          {(form.type === 'CLUB_NIGHT' || form.type === 'CONCERT') && (
            <CyberTextarea
              label="LINEUP"
              value={(form.lineup as string) ?? ''}
              onChange={e => update({ lineup: e.target.value })}
              rows={3}
              placeholder="e.g. Bicep (DJ Set) · Charlotte de Witte"
              maxLength={500}
            />
          )}
        </div>

        {/* Cover Image */}
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] mb-2" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>COVER IMAGE</p>
          {coverPreview ? (
            <div className="relative rounded-xl overflow-hidden mb-2" style={{ height: 180 }}>
              <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
              <button
                onClick={() => { setCoverPreview(null); setCoverFile(null); update({ coverImageUrl: undefined }) }}
                className="absolute top-2 right-2 px-3 py-1 rounded-lg text-xs font-bold"
                style={{ background: 'rgba(4,4,13,0.85)', border: '1px solid rgba(255,0,110,0.35)', color: '#ff006e' }}>
                Remove
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center gap-2 py-8 rounded-xl border-dashed transition-all"
              style={{ border: '1px dashed rgba(var(--accent-rgb),0.2)', color: 'rgba(var(--accent-rgb),0.4)' }}>
              <Upload size={20} />
              <span className="text-xs font-bold">Upload cover image</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleCover} className="hidden" />
        </div>

        {/* Location */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>LOCATION</p>
          <CyberInput
            label="FULL ADDRESS *"
            value={(form.address as string) ?? ''}
            onChange={e => update({ address: e.target.value })}
            placeholder="22 Jamaica St, Glasgow G1 4QD"
          />
          <CyberInput
            label="NEIGHBOURHOOD / AREA *"
            value={(form.neighbourhood as string) ?? ''}
            onChange={e => update({ neighbourhood: e.target.value })}
            placeholder="City Centre, Glasgow"
          />
          <div className="grid grid-cols-2 gap-3">
            <CyberInput label="LATITUDE" type="number" step="0.0001"
              value={(form.lat as number) ?? ''}
              onChange={e => update({ lat: parseFloat(e.target.value) })} />
            <CyberInput label="LONGITUDE" type="number" step="0.0001"
              value={(form.lng as number) ?? ''}
              onChange={e => update({ lng: parseFloat(e.target.value) })} />
          </div>
          <button
            onClick={useMyLocation}
            disabled={locating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold disabled:opacity-50 transition-all"
            style={{ border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'rgba(var(--accent-rgb),0.7)' }}>
            {locating
              ? <><Loader2 size={12} className="animate-spin" /> Locating...</>
              : <><Navigation size={12} /> Use My Location</>
            }
          </button>
          <div className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
            style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
            onClick={() => update({ showNeighbourhoodOnly: !form.showNeighbourhoodOnly })}>
            <div className="w-5 h-5 rounded flex items-center justify-center shrink-0"
              style={{ background: form.showNeighbourhoodOnly ? 'var(--accent)' : 'transparent', border: `2px solid ${form.showNeighbourhoodOnly ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.3)'}` }}>
              {!!form.showNeighbourhoodOnly && <Check size={11} color="#04040d" strokeWidth={3} />}
            </div>
            <div>
              <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>Hide exact address from public</p>
              <p className="text-[10px]" style={{ color: 'rgba(74,96,128,0.6)' }}>Only show neighbourhood to non-guests</p>
            </div>
          </div>
        </div>

        {/* Capacity & Pricing */}
        <div className="space-y-4">
          <p className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>CAPACITY & PRICING</p>
          <div className="grid grid-cols-3 gap-3">
            <CyberInput label="CAPACITY" type="number" min={1} max={10000}
              value={(form.capacity as number) ?? 50}
              onChange={e => update({ capacity: parseInt(e.target.value) || 50 })} />
            <CyberInput label="PRICE (£)" type="number" min={0} step={0.01}
              value={(form.price as number) ?? 0}
              onChange={e => update({ price: parseFloat(e.target.value) || 0 })} />
            <CyberInput label="TICKET QTY" type="number" min={0}
              value={(form.ticketQuantity as number) ?? 0}
              onChange={e => update({ ticketQuantity: parseInt(e.target.value) || 0 })} />
          </div>
        </div>

        {/* Policies */}
        <div className="space-y-4">
          <p className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>POLICIES</p>

          <div>
            <p className="text-[10px] font-bold tracking-[0.18em] mb-2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>ALCOHOL</p>
            <div className="grid grid-cols-3 gap-2">
              {ALCOHOL_OPTIONS.map(opt => (
                <button key={opt.value}
                  onClick={() => update({ alcoholPolicy: opt.value as AlcoholPolicy })}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl transition-all"
                  style={{
                    background: form.alcoholPolicy === opt.value ? 'rgba(var(--accent-rgb),0.1)' : 'rgba(7,7,26,0.8)',
                    border: form.alcoholPolicy === opt.value ? '1px solid rgba(var(--accent-rgb),0.4)' : '1px solid rgba(var(--accent-rgb),0.1)',
                  }}>
                  <span className="text-lg">{opt.emoji}</span>
                  <span className="text-[9px] font-black"
                    style={{ color: form.alcoholPolicy === opt.value ? 'var(--accent)' : 'rgba(224,242,254,0.5)' }}>
                    {opt.label.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold tracking-[0.18em] mb-2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>AGE RESTRICTION</p>
            <div className="grid grid-cols-3 gap-2">
              {AGE_OPTIONS.map(opt => (
                <button key={opt.value}
                  onClick={() => update({ ageRestriction: opt.value as AgeRestriction })}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl transition-all"
                  style={{
                    background: form.ageRestriction === opt.value ? 'rgba(var(--accent-rgb),0.1)' : 'rgba(7,7,26,0.8)',
                    border: form.ageRestriction === opt.value ? '1px solid rgba(var(--accent-rgb),0.4)' : '1px solid rgba(var(--accent-rgb),0.1)',
                  }}>
                  <span className="text-lg">{opt.emoji}</span>
                  <span className="text-[9px] font-black"
                    style={{ color: form.ageRestriction === opt.value ? 'var(--accent)' : 'rgba(224,242,254,0.5)' }}>
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <CyberInput
            label="DRESS CODE (OPTIONAL)"
            value={(form.dressCode as string) ?? ''}
            onChange={e => update({ dressCode: e.target.value })}
            placeholder="e.g. Smart casual, All black..."
          />
          <CyberTextarea
            label="HOUSE RULES (OPTIONAL)"
            value={(form.houseRules as string) ?? ''}
            onChange={e => update({ houseRules: e.target.value })}
            rows={3}
            maxLength={1000}
          />
        </div>

        {/* Vibe Tags */}
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] mb-3" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>VIBE TAGS</p>
          <div className="flex flex-wrap gap-2">
            {VIBE_TAGS.map(tag => {
              const active = vibeTags.includes(tag)
              return (
                <button key={tag}
                  onClick={() => toggleVibeTag(tag)}
                  className="text-[10px] font-bold px-3 py-1.5 rounded-full transition-all"
                  style={{
                    background: active ? 'rgba(var(--accent-rgb),0.15)' : 'rgba(var(--accent-rgb),0.04)',
                    border: active ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(var(--accent-rgb),0.12)',
                    color: active ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.4)',
                  }}>
                  #{tag}
                </button>
              )
            })}
          </div>
        </div>

        {/* Privacy */}
        <div className="flex items-center gap-3 p-4 rounded-xl cursor-pointer"
          style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
          onClick={() => update({ isInviteOnly: !form.isInviteOnly })}>
          <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all"
            style={{ background: form.isInviteOnly ? 'var(--accent)' : 'transparent', border: `2px solid ${form.isInviteOnly ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.3)'}` }}>
            {!!form.isInviteOnly && <Check size={11} color="#04040d" strokeWidth={3} />}
          </div>
          <div>
            <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>Invite Only</p>
            <p className="text-[10px]" style={{ color: 'rgba(74,96,128,0.6)' }}>Guests need an invite link to RSVP</p>
          </div>
        </div>

        {/* DJ Requests */}
        <div className="flex items-center gap-3 p-4 rounded-xl cursor-pointer"
          style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
          onClick={() => update({ djRequestsEnabled: !(form as any).djRequestsEnabled })}>
          <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all"
            style={{ background: (form as any).djRequestsEnabled ? 'var(--accent)' : 'transparent', border: `2px solid ${(form as any).djRequestsEnabled ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.3)'}` }}>
            {(form as any).djRequestsEnabled && <Check size={11} color="#04040d" strokeWidth={3} />}
          </div>
          <div>
            <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>🎵 DJ Song Requests</p>
            <p className="text-[10px]" style={{ color: 'rgba(74,96,128,0.6)' }}>Guests can request songs — free with Basic+ plan, or £1 per request for others</p>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-sm tracking-widest disabled:opacity-40 transition-all"
          style={{
            background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}10)`,
            border: `1px solid ${accentColor}50`,
            color: accentColor,
            boxShadow: `0 0 20px ${accentColor}20`,
          }}>
          {submitting
            ? <><Loader2 size={14} className="animate-spin" /> SAVING CHANGES...</>
            : <><Save size={14} /> SAVE CHANGES</>
          }
        </button>
      </div>
    </div>
  )
}
