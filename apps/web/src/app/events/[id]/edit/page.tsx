'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, Loader2, Save, Upload, Eye, Palette, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useEvent } from '@/hooks/useEvents'
import { uploadImage } from '@/lib/cloudinary'
import { api } from '@/lib/api'
import { VIBE_TAGS } from '@partyradar/shared'

const PARTY_SIGNALS = [
  { emoji: '🍾', code: 'BAR',      label: 'Free Bar' },
  { emoji: '🎮', code: 'GAMING',   label: 'Gaming' },
  { emoji: '🎲', code: 'GAMES',    label: 'Games' },
  { emoji: '🕺', code: 'FLOOR',    label: 'Dance Floor' },
  { emoji: '🔥', code: 'FIRE',     label: 'Firepit' },
  { emoji: '🎤', code: 'KARAOKE',  label: 'Karaoke' },
  { emoji: '🍕', code: 'FOOD',     label: 'Food' },
  { emoji: '🎭', code: 'COSTUME',  label: 'Costume' },
  { emoji: '🌙', code: 'LATENIGHT', label: 'Late Night' },
  { emoji: '♨️', code: 'HOTTUB',   label: 'Hot Tub' },
  { emoji: '🎸', code: 'LIVE',     label: 'Live Music' },
  { emoji: '🎯', code: 'PONG',     label: 'Pong' },
  { emoji: '🏊', code: 'POOL',     label: 'Pool' },
  { emoji: '🌿', code: 'CHILL',    label: 'Chill' },
  { emoji: '💋', code: 'FLIRTY',   label: 'Flirty' },
  { emoji: '🍩', code: 'SNACKS',   label: 'Snacks' },
]

const ACCENT_COLORS = [
  { hex: '#00e5ff', label: 'Cyan' },
  { hex: '#ff006e', label: 'Pink' },
  { hex: '#3d5afe', label: 'Indigo' },
  { hex: '#00ff88', label: 'Green' },
  { hex: '#ffd600', label: 'Gold' },
  { hex: '#a855f7', label: 'Purple' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#06b6d4', label: 'Teal' },
  { hex: '#ec4899', label: 'Magenta' },
]

const ALCOHOL_OPTIONS = [
  { value: 'NONE',     label: 'No Alcohol', emoji: '🚫' },
  { value: 'PROVIDED', label: 'Bar / Free Drinks', emoji: '🍾' },
  { value: 'BYOB',     label: 'BYOB', emoji: '🥃' },
]

const AGE_OPTIONS = [
  { value: 'ALL_AGES', label: 'All Ages', emoji: '👶' },
  { value: 'AGE_18',   label: '18+', emoji: '🔞' },
  { value: 'AGE_21',   label: '21+', emoji: '🍸' },
]

const TYPE_COLORS: Record<string, string> = {
  HOME_PARTY: '#ff006e',
  CLUB_NIGHT: '#00e5ff',
  CONCERT:    '#3d5afe',
  PUB_NIGHT:  '#f59e0b',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-black tracking-[0.15em] block mb-1.5"
        style={{ color: 'rgba(0,229,255,0.5)' }}>{label}</label>
      {children}
    </div>
  )
}

function SectionHeader({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-3 mb-2">
      {icon}
      <span className="text-[10px] font-black tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.35)' }}>
        {title}
      </span>
      <div className="flex-1 h-px" style={{ background: 'rgba(0,229,255,0.08)' }} />
    </div>
  )
}

const inputStyle = {
  background: 'rgba(0,229,255,0.04)',
  border: '1px solid rgba(0,229,255,0.18)',
  color: '#e0f2fe',
} as const

export default function EditEventPage() {
  const params = useParams()
  const router = useRouter()
  const { dbUser } = useAuth()
  const { event, isLoading, mutate } = useEvent(params['id'] as string)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    name: '',
    description: '',
    startsAt: '',
    endsAt: '',
    capacity: 0,
    price: 0,
    dressCode: '',
    houseRules: '',
    lineup: '',
    partySigns: [] as string[],
    vibeTags: [] as string[],
    alcoholPolicy: 'NONE',
    ageRestriction: 'ALL_AGES',
    isInviteOnly: false,
    coverImageUrl: '',
    accentColor: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Populate form once event loads
  useEffect(() => {
    if (!event) return
    setForm({
      name: event.name,
      description: event.description,
      startsAt: event.startsAt ? new Date(event.startsAt).toISOString().slice(0, 16) : '',
      endsAt: event.endsAt ? new Date(event.endsAt).toISOString().slice(0, 16) : '',
      capacity: event.capacity,
      price: event.price,
      dressCode: event.dressCode ?? '',
      houseRules: event.houseRules ?? '',
      lineup: event.lineup ?? '',
      partySigns: event.partySigns ?? [],
      vibeTags: event.vibeTags ?? [],
      alcoholPolicy: event.alcoholPolicy ?? 'NONE',
      ageRestriction: event.ageRestriction ?? 'ALL_AGES',
      isInviteOnly: event.isInviteOnly ?? false,
      coverImageUrl: event.coverImageUrl ?? '',
      accentColor: event.accentColor ?? '',
    })
    if (event.coverImageUrl) setCoverPreview(event.coverImageUrl)
  }, [event])

  // Auth guard
  if (!isLoading && (!dbUser || (event && event.hostId !== dbUser.id))) {
    router.push('/discover')
    return null
  }

  if (isLoading || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#04040d' }}>
        <div className="w-10 h-10 border-2 rounded-full animate-spin"
          style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
      </div>
    )
  }

  const accent = form.accentColor || TYPE_COLORS[event.type] || '#00e5ff'

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  function toggleSign(code: string) {
    setForm((f) => ({
      ...f,
      partySigns: f.partySigns.includes(code)
        ? f.partySigns.filter((s) => s !== code)
        : [...f.partySigns, code],
    }))
    setSaved(false)
  }

  function toggleVibe(tag: string) {
    setForm((f) => ({
      ...f,
      vibeTags: f.vibeTags.includes(tag)
        ? f.vibeTags.filter((t) => t !== tag)
        : f.vibeTags.length < 8 ? [...f.vibeTags, tag] : f.vibeTags,
    }))
    setSaved(false)
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
    setSaved(false)
  }

  function removeCover() {
    setCoverFile(null)
    setCoverPreview(null)
    set('coverImageUrl', '')
  }

  async function handleSave() {
    if (!event) return
    setSaving(true)
    setError(null)

    let coverImageUrl = form.coverImageUrl
    if (coverFile) {
      try {
        setUploading(true)
        coverImageUrl = await uploadImage(coverFile, 'events')
      } catch {
        // skip upload failure in dev
      } finally {
        setUploading(false)
      }
    }

    const patch: Record<string, unknown> = {
      name: form.name,
      description: form.description,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      capacity: Number(form.capacity),
      price: Number(form.price),
      dressCode: form.dressCode || undefined,
      houseRules: form.houseRules || undefined,
      vibeTags: form.vibeTags,
      alcoholPolicy: form.alcoholPolicy,
      ageRestriction: form.ageRestriction,
      isInviteOnly: form.isInviteOnly,
      coverImageUrl: coverImageUrl || undefined,
      accentColor: form.accentColor || null,
    }

    if (event.type === 'CLUB_NIGHT' || event.type === 'CONCERT' || event.type === 'PUB_NIGHT') {
      patch.lineup = form.lineup || undefined
    }
    if (event.type === 'HOME_PARTY') {
      patch.partySigns = form.partySigns
    }

    try {
      await api.put(`/events/${event.id}`, patch)
      await mutate()
      setSaved(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const isHomeparty = event.type === 'HOME_PARTY'
  const isClubOrConcert = event.type === 'CLUB_NIGHT' || event.type === 'CONCERT' || event.type === 'PUB_NIGHT'

  return (
    <div className="min-h-screen pb-28 px-4 pt-20 max-w-lg mx-auto" style={{ background: '#04040d' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Link href={`/events/${event.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold"
          style={{ color: `${accent}88` }}>
          <ArrowLeft size={13} /> BACK
        </Link>
        <div className="text-[10px] font-bold tracking-widest px-2 py-0.5 rounded"
          style={{ color: accent, border: `1px solid ${accent}40`, background: `${accent}08` }}>
          EDIT EVENT
        </div>
      </div>

      {/* Cover image preview */}
      <div className="relative rounded-2xl overflow-hidden mb-4" style={{ height: 160 }}>
        {coverPreview ? (
          <>
            <img src={coverPreview} alt="" className="w-full h-full object-cover"
              style={{ filter: 'brightness(0.6) saturate(1.2)' }} />
            <div className="absolute inset-0"
              style={{ background: `linear-gradient(to bottom, transparent, ${accent}15 60%, #04040d 100%)` }} />
            <button onClick={removeCover}
              className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)' }}>
              <X size={12} style={{ color: '#fff' }} />
            </button>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2"
            style={{ background: `radial-gradient(ellipse at 30% 40%, ${accent}15 0%, #07071a 70%)`,
                     border: `1px solid ${accent}20`, borderRadius: 16 }}>
            <Upload size={24} style={{ color: `${accent}60` }} />
            <span className="text-[10px] font-bold tracking-widest" style={{ color: `${accent}50` }}>NO COVER IMAGE</span>
          </div>
        )}
        <button onClick={() => fileRef.current?.click()}
          className="absolute bottom-2 left-2 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-[10px] font-bold tracking-wide"
          style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${accent}40`, color: accent }}>
          <Upload size={11} /> {coverPreview ? 'CHANGE COVER' : 'UPLOAD COVER'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
      </div>

      <h1 className="text-xl font-black mb-0.5" style={{ color: '#e0f2fe' }}>{event.name}</h1>
      <p className="text-[10px] mb-5 font-bold tracking-wide" style={{ color: `${accent}70` }}>
        {event.type.replace('_', ' ')}
      </p>

      <div className="space-y-4">
        {/* ─── Basics ─────────────────────────────────────────── */}
        <SectionHeader title="BASICS" />

        <Field label="EVENT NAME">
          <input value={form.name} onChange={(e) => set('name', e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={inputStyle} />
        </Field>

        <Field label="DESCRIPTION">
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
            rows={3} className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none" style={inputStyle} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="STARTS AT">
            <input type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-sm outline-none" style={{ ...inputStyle, colorScheme: 'dark' }} />
          </Field>
          <Field label="ENDS AT">
            <input type="datetime-local" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-sm outline-none" style={{ ...inputStyle, colorScheme: 'dark' }} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="CAPACITY">
            <input type="number" min={1} value={form.capacity} onChange={(e) => set('capacity', Number(e.target.value))}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={inputStyle} />
          </Field>
          <Field label="TICKET PRICE (£)">
            <input type="number" min={0} step={0.01} value={form.price} onChange={(e) => set('price', Number(e.target.value))}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={inputStyle} />
          </Field>
        </div>

        {/* ─── Look & Feel ────────────────────────────────────── */}
        <SectionHeader title="LOOK & FEEL" icon={<Palette size={11} style={{ color: 'rgba(0,229,255,0.35)' }} />} />

        <Field label="ACCENT COLOR">
          <div className="flex gap-2 flex-wrap">
            {ACCENT_COLORS.map((c) => {
              const selected = form.accentColor === c.hex
              return (
                <button key={c.hex} type="button"
                  onClick={() => set('accentColor', selected ? '' : c.hex)}
                  className="w-9 h-9 rounded-xl transition-all flex items-center justify-center"
                  style={{
                    background: `${c.hex}20`,
                    border: selected ? `2px solid ${c.hex}` : `1px solid ${c.hex}30`,
                    boxShadow: selected ? `0 0 12px ${c.hex}40` : 'none',
                  }}
                  title={c.label}>
                  <div className="w-4 h-4 rounded-full" style={{ background: c.hex }} />
                </button>
              )
            })}
          </div>
          <p className="text-[9px] mt-1.5" style={{ color: 'rgba(74,96,128,0.5)' }}>
            Customizes your event page glow and accents. Leave blank for default.
          </p>
        </Field>

        {/* ─── Vibe ───────────────────────────────────────────── */}
        <SectionHeader title="VIBE & POLICIES" />

        <Field label={`VIBE TAGS (${form.vibeTags.length}/8)`}>
          <div className="flex gap-1.5 flex-wrap">
            {VIBE_TAGS.map((tag) => {
              const active = form.vibeTags.includes(tag)
              return (
                <button key={tag} type="button" onClick={() => toggleVibe(tag)}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full transition-all"
                  style={{
                    background: active ? `${accent}18` : 'rgba(0,229,255,0.03)',
                    border: active ? `1px solid ${accent}50` : '1px solid rgba(0,229,255,0.1)',
                    color: active ? accent : 'rgba(224,242,254,0.4)',
                  }}>
                  #{tag}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="ALCOHOL POLICY">
          <div className="grid grid-cols-3 gap-2">
            {ALCOHOL_OPTIONS.map((opt) => {
              const active = form.alcoholPolicy === opt.value
              return (
                <button key={opt.value} type="button"
                  onClick={() => set('alcoholPolicy', opt.value)}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl transition-all text-center"
                  style={{
                    background: active ? `${accent}12` : 'rgba(0,229,255,0.03)',
                    border: active ? `1px solid ${accent}50` : '1px solid rgba(0,229,255,0.1)',
                  }}>
                  <span className="text-lg">{opt.emoji}</span>
                  <span className="text-[9px] font-bold" style={{ color: active ? accent : 'rgba(224,242,254,0.4)' }}>
                    {opt.label}
                  </span>
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="AGE RESTRICTION">
          <div className="grid grid-cols-3 gap-2">
            {AGE_OPTIONS.map((opt) => {
              const active = form.ageRestriction === opt.value
              return (
                <button key={opt.value} type="button"
                  onClick={() => set('ageRestriction', opt.value)}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl transition-all text-center"
                  style={{
                    background: active ? `${accent}12` : 'rgba(0,229,255,0.03)',
                    border: active ? `1px solid ${accent}50` : '1px solid rgba(0,229,255,0.1)',
                  }}>
                  <span className="text-lg">{opt.emoji}</span>
                  <span className="text-[9px] font-bold" style={{ color: active ? accent : 'rgba(224,242,254,0.4)' }}>
                    {opt.label}
                  </span>
                </button>
              )
            })}
          </div>
        </Field>

        {/* Invite Only toggle */}
        <div className="flex items-center justify-between py-3 px-4 rounded-xl"
          style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.1)' }}>
          <div>
            <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>Invite Only</p>
            <p className="text-[9px]" style={{ color: 'rgba(74,96,128,0.6)' }}>Only people with the link can RSVP</p>
          </div>
          <button type="button" onClick={() => set('isInviteOnly', !form.isInviteOnly)}
            className="w-11 h-6 rounded-full transition-all relative"
            style={{
              background: form.isInviteOnly ? `${accent}30` : 'rgba(74,96,128,0.2)',
              border: form.isInviteOnly ? `1px solid ${accent}60` : '1px solid rgba(74,96,128,0.3)',
            }}>
            <div className="w-4 h-4 rounded-full absolute top-0.5 transition-all"
              style={{
                background: form.isInviteOnly ? accent : 'rgba(74,96,128,0.5)',
                left: form.isInviteOnly ? 24 : 4,
                boxShadow: form.isInviteOnly ? `0 0 8px ${accent}60` : 'none',
              }} />
          </button>
        </div>

        {/* Dress code */}
        <Field label="DRESS CODE">
          <input value={form.dressCode} onChange={(e) => set('dressCode', e.target.value)}
            placeholder="Smart casual, Black tie, All black..."
            className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={inputStyle} />
        </Field>

        {/* House rules */}
        <Field label="HOUSE RULES">
          <textarea value={form.houseRules} onChange={(e) => set('houseRules', e.target.value)}
            rows={3} placeholder="No outside drinks, no +1s without approval..."
            className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none" style={inputStyle} />
        </Field>

        {/* Lineup — clubs & concerts */}
        {isClubOrConcert && (
          <Field label="LINEUP / RESIDENT DJs">
            <input value={form.lineup} onChange={(e) => set('lineup', e.target.value)}
              placeholder="DJ Shadow b2b Aphex Twin..."
              className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={inputStyle} />
          </Field>
        )}

        {/* Party Signals — home parties */}
        {isHomeparty && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black tracking-[0.15em]" style={{ color: 'rgba(0,229,255,0.5)' }}>
                PARTY SIGNALS
              </span>
              <span className="text-[9px] font-bold" style={{ color: 'rgba(255,0,110,0.5)' }}>
                {form.partySigns.length} selected
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PARTY_SIGNALS.map(({ emoji, code, label }) => {
                const active = form.partySigns.includes(code)
                return (
                  <button key={code} type="button" onClick={() => toggleSign(code)}
                    className="flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all"
                    style={{
                      background: active ? 'rgba(255,0,110,0.12)' : 'rgba(0,229,255,0.03)',
                      border: active ? '1px solid rgba(255,0,110,0.4)' : '1px solid rgba(0,229,255,0.1)',
                      filter: active ? 'drop-shadow(0 0 6px rgba(255,0,110,0.4))' : 'none',
                    }}>
                    <span className="text-xl">{emoji}</span>
                    <span className="text-[8px] font-bold" style={{ color: active ? '#ff006e' : 'rgba(224,242,254,0.3)' }}>
                      {label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── Live Preview ───────────────────────────────────── */}
        <SectionHeader title="PREVIEW" icon={<Eye size={11} style={{ color: 'rgba(0,229,255,0.35)' }} />} />

        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${accent}20` }}>
          <div className="relative" style={{ height: 80 }}>
            {coverPreview ? (
              <img src={coverPreview} alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(0.5)' }} />
            ) : (
              <div className="w-full h-full" style={{ background: `radial-gradient(ellipse at 30% 40%, ${accent}22 0%, #07071a 70%)` }} />
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent, #04040d)' }} />
            <div className="absolute bottom-2 left-3">
              <span className="text-[8px] font-bold px-2 py-0.5 rounded" style={{ color: accent, border: `1px solid ${accent}40`, background: `${accent}12` }}>
                {event.type.replace('_', ' ')}
              </span>
            </div>
          </div>
          <div className="px-3 py-2" style={{ background: '#07071a' }}>
            <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{form.name || event.name}</p>
            <div className="flex items-center gap-2 mt-1">
              {form.vibeTags.slice(0, 3).map((t) => (
                <span key={t} className="text-[8px]" style={{ color: `${accent}60` }}>#{t}</span>
              ))}
              {form.price > 0 && (
                <span className="text-[9px] font-bold ml-auto" style={{ color: '#e0f2fe' }}>£{form.price.toFixed(2)}</span>
              )}
              {form.price === 0 && (
                <span className="text-[9px] font-bold ml-auto" style={{ color: '#00ff88' }}>FREE</span>
              )}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs font-bold px-3 py-2 rounded-lg"
            style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
            {error}
          </p>
        )}

        {/* Save button */}
        <button onClick={handleSave} disabled={saving || uploading}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-sm transition-all disabled:opacity-50"
          style={{
            background: saved
              ? 'linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,255,136,0.08))'
              : `linear-gradient(135deg, ${accent}20, ${accent}10)`,
            border: saved ? '1px solid rgba(0,255,136,0.4)' : `1px solid ${accent}50`,
            color: saved ? '#00ff88' : accent,
            letterSpacing: '0.12em',
            boxShadow: saved ? '0 0 24px rgba(0,255,136,0.1)' : `0 0 24px ${accent}15`,
          }}>
          {uploading
            ? <><Loader2 size={15} className="animate-spin" /> UPLOADING...</>
            : saving
            ? <><Loader2 size={15} className="animate-spin" /> SAVING...</>
            : saved
            ? <><Check size={15} /> SAVED</>
            : <><Save size={15} /> SAVE CHANGES</>
          }
        </button>

        {/* View event */}
        <Link href={`/events/${event.id}`}
          className="w-full flex items-center justify-center py-3 rounded-xl text-xs font-bold transition-all"
          style={{ border: '1px solid rgba(74,96,128,0.2)', color: 'rgba(74,96,128,0.6)', letterSpacing: '0.1em' }}>
          ← VIEW EVENT PAGE
        </Link>
      </div>
    </div>
  )
}
