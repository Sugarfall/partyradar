'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, Loader2, Save } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useEvent, updateEvent } from '@/hooks/useEvents'
import { api } from '@/lib/api'
import { DEV_MODE } from '@/lib/firebase'

const PARTY_SIGNALS = [
  { emoji: '🍺', code: 'BAR',     label: 'Free Bar' },
  { emoji: '🎮', code: 'GAMING',  label: 'Gaming' },
  { emoji: '🎯', code: 'GAMES',   label: 'Games' },
  { emoji: '💃', code: 'FLOOR',   label: 'Dance Floor' },
  { emoji: '🎤', code: 'MIC',     label: 'Open Mic' },
  { emoji: '🍕', code: 'FOOD',    label: 'Food' },
  { emoji: '🔥', code: 'FIRE',    label: 'Firepit' },
  { emoji: '💨', code: 'SMOKE',   label: 'Smoking Area' },
  { emoji: '🎧', code: 'DJ',      label: 'DJ' },
  { emoji: '🎸', code: 'LIVE',    label: 'Live Music' },
  { emoji: '🛁', code: 'HOT',     label: 'Hot Tub' },
  { emoji: '🌿', code: 'GARDEN',  label: 'Garden' },
  { emoji: '🃏', code: 'CARDS',   label: 'Card Games' },
  { emoji: '🎱', code: 'POOL',    label: 'Pool Table' },
  { emoji: '📸', code: 'PHOTO',   label: 'Photo Booth' },
  { emoji: '🎁', code: 'GIFTS',   label: 'Occasion' },
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-black tracking-[0.15em] block mb-1.5"
        style={{ color: 'rgba(0,229,255,0.5)' }}>{label}</label>
      {children}
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
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    })
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

  async function handleSave() {
    setSaving(true)
    setError(null)
    const patch = {
      name: form.name,
      description: form.description,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      capacity: Number(form.capacity),
      price: Number(form.price),
      dressCode: form.dressCode || undefined,
      houseRules: form.houseRules || undefined,
      lineup: form.lineup || undefined,
      partySigns: event!.type === 'HOME_PARTY' ? form.partySigns : undefined,
    }
    try {
      if (DEV_MODE) {
        await updateEvent(event!.id, patch as any)
      } else {
        await api.put(`/events/${event!.id}`, patch)
        await mutate()
      }
      setSaved(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const isHomeparty = event.type === 'HOME_PARTY'
  const isClubOrConcert = event.type === 'CLUB_NIGHT' || event.type === 'CONCERT'

  return (
    <div className="min-h-screen pb-28 px-4 pt-20 max-w-lg mx-auto" style={{ background: '#04040d' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link href={`/events/${event.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold"
          style={{ color: 'rgba(0,229,255,0.5)' }}>
          <ArrowLeft size={13} /> BACK
        </Link>
        <div className="text-[10px] font-bold tracking-widest px-2 py-0.5 rounded"
          style={{ color: 'rgba(74,96,128,0.6)', border: '1px solid rgba(74,96,128,0.2)' }}>
          EDIT EVENT
        </div>
      </div>

      <h1 className="text-2xl font-black mb-1" style={{ color: '#e0f2fe' }}>{event.name}</h1>
      <p className="text-xs mb-6 font-bold tracking-wide" style={{ color: 'rgba(0,229,255,0.4)' }}>
        {event.type.replace('_', ' ')}
      </p>

      <div className="space-y-5">
        {/* Name */}
        <Field label="EVENT NAME">
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={inputStyle}
          />
        </Field>

        {/* Description */}
        <Field label="DESCRIPTION">
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
            style={inputStyle}
          />
        </Field>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="STARTS AT">
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => set('startsAt', e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-sm outline-none"
              style={{ ...inputStyle, colorScheme: 'dark' }}
            />
          </Field>
          <Field label="ENDS AT">
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => set('endsAt', e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-sm outline-none"
              style={{ ...inputStyle, colorScheme: 'dark' }}
            />
          </Field>
        </div>

        {/* Capacity + Price */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="CAPACITY">
            <input
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => set('capacity', Number(e.target.value))}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={inputStyle}
            />
          </Field>
          <Field label="TICKET PRICE (£)">
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.price}
              onChange={(e) => set('price', Number(e.target.value))}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={inputStyle}
            />
          </Field>
        </div>

        {/* Dress code */}
        <Field label="DRESS CODE">
          <input
            value={form.dressCode}
            onChange={(e) => set('dressCode', e.target.value)}
            placeholder="Smart casual, Black tie, etc."
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={inputStyle}
          />
        </Field>

        {/* House rules */}
        <Field label="HOUSE RULES">
          <textarea
            value={form.houseRules}
            onChange={(e) => set('houseRules', e.target.value)}
            rows={3}
            placeholder="No outside drinks, no +1s without approval..."
            className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
            style={inputStyle}
          />
        </Field>

        {/* Lineup — clubs & concerts */}
        {isClubOrConcert && (
          <Field label="LINEUP / RESIDENT DJs">
            <input
              value={form.lineup}
              onChange={(e) => set('lineup', e.target.value)}
              placeholder="DJ Shadow b2b Aphex Twin..."
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={inputStyle}
            />
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
                · PRIVATE
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PARTY_SIGNALS.map(({ emoji, code }) => {
                const active = form.partySigns.includes(code)
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleSign(code)}
                    className="aspect-square flex items-center justify-center text-2xl rounded-xl transition-all"
                    style={{
                      background: active ? 'rgba(255,0,110,0.12)' : 'rgba(0,229,255,0.03)',
                      border: active ? '1px solid rgba(255,0,110,0.4)' : '1px solid rgba(0,229,255,0.1)',
                      filter: active ? 'drop-shadow(0 0 6px rgba(255,0,110,0.4))' : 'none',
                    }}>
                    {emoji}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs font-bold px-3 py-2 rounded-lg"
            style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
            {error}
          </p>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-sm transition-all disabled:opacity-50"
          style={{
            background: saved
              ? 'linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,255,136,0.08))'
              : 'linear-gradient(135deg, rgba(0,229,255,0.15), rgba(0,229,255,0.08))',
            border: saved ? '1px solid rgba(0,255,136,0.4)' : '1px solid rgba(0,229,255,0.4)',
            color: saved ? '#00ff88' : '#00e5ff',
            letterSpacing: '0.12em',
            boxShadow: saved ? '0 0 24px rgba(0,255,136,0.1)' : '0 0 24px rgba(0,229,255,0.1)',
          }}>
          {saving
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
