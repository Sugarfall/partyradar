'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Save, Building2, Phone, Globe, Tag, MapPin,
  Image as ImageIcon, Loader2, CheckCircle2, AlertTriangle,
  Calendar, Ticket, Users, Edit3, X, Plus, UtensilsCrossed, ToggleLeft, ToggleRight, Clock,
  ShoppingBag, RefreshCw,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { uploadImage } from '@/lib/cloudinary'
import { formatPrice } from '@/lib/currency'
import { loginHref } from '@/lib/authRedirect'

// ─── Types ────────────────────────────────────────────────────────────────────

type VenueType = 'BAR' | 'NIGHTCLUB' | 'CONCERT_HALL' | 'ROOFTOP_BAR' | 'PUB' | 'LOUNGE'

interface VenueEvent {
  id: string
  name: string
  startsAt: string
  price: number
  type: string
  coverImageUrl?: string
  host: { id: string; displayName: string }
}

interface Venue {
  id: string
  name: string
  address: string
  city: string
  lat: number
  lng: number
  type: VenueType
  description?: string
  phone?: string
  website?: string
  photoUrl?: string
  rating?: number
  vibeTags: string[]
  isClaimed: boolean
  claimedById?: string
  events: VenueEvent[]
}

const TYPE_OPTIONS: { value: VenueType; label: string }[] = [
  { value: 'BAR',          label: 'Bar' },
  { value: 'NIGHTCLUB',    label: 'Nightclub' },
  { value: 'CONCERT_HALL', label: 'Concert Hall' },
  { value: 'ROOFTOP_BAR',  label: 'Rooftop Bar' },
  { value: 'PUB',          label: 'Pub' },
  { value: 'LOUNGE',       label: 'Lounge' },
]

const TYPE_COLORS: Record<VenueType, string> = {
  BAR: '#f59e0b', NIGHTCLUB: '#a855f7', CONCERT_HALL: '#3b82f6',
  ROOFTOP_BAR: '#06b6d4', PUB: '#22c55e', LOUNGE: '#ec4899',
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  })
}

// ─── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black tracking-widest block" style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.2em' }}>
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.3)' }}>{hint}</p>}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(7,7,26,0.8)',
  border: '1px solid rgba(var(--accent-rgb),0.15)',
  borderRadius: 10,
  color: '#e0f2fe',
  fontSize: 13,
  padding: '10px 12px',
  outline: 'none',
}

// ─── Vibe tag editor ───────────────────────────────────────────────────────────

function VibeTagEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')

  function add() {
    const t = input.trim().toLowerCase().replace(/[^a-z0-9 &]/g, '')
    if (!t || tags.includes(t) || tags.length >= 10) return
    onChange([...tags, t])
    setInput('')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'rgba(var(--accent-rgb),0.8)' }}>
            {t}
            <button onClick={() => onChange(tags.filter((x) => x !== t))} className="ml-0.5 opacity-60 hover:opacity-100">
              <X size={10} />
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs" style={{ color: 'rgba(224,242,254,0.2)' }}>No tags yet</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="e.g. techno, rooftop, cocktails…"
          maxLength={30}
          style={{ ...inputStyle, flex: 1, fontSize: 12 }}
        />
        <button onClick={add} disabled={!input.trim() || tags.length >= 10}
          className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-30 transition-all"
          style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.25)', color: 'var(--accent)' }}>
          <Plus size={12} /> ADD
        </button>
      </div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function VenueManagePage() {
  const params = useParams()
  const router = useRouter()
  const { dbUser, loading: authLoading } = useAuth()
  const id = params['id'] as string

  const [venue, setVenue] = useState<Venue | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [pendingApproval, setPendingApproval] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [type, setType] = useState<VenueType>('BAR')
  const [description, setDescription] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [vibeTags, setVibeTags] = useState<string[]>([])

  // Save state
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Photo upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Menu / partnership state
  type MenuItem = { id: string; name: string; description?: string; price: number; category: string; isAvailable: boolean }
  type Partnership = { id: string; isActive: boolean; drinkMenuItems: MenuItem[] }
  const [partnership, setPartnership] = useState<Partnership | null | 'loading'>('loading')
  const [menuShowForm, setMenuShowForm] = useState(false)
  const [menuName, setMenuName] = useState('')
  const [menuDescription, setMenuDescription] = useState('')
  const [menuPrice, setMenuPrice] = useState('')
  const [menuCategory, setMenuCategory] = useState('drink')
  const [menuSaving, setMenuSaving] = useState(false)

  // Orders state
  type OrderLine = { name: string; price: number; qty: number; lineTotal: number }
  type VenueOrder = { id: string; total: number; description: string; tableNumber: string | null; items: OrderLine[]; createdAt: string; user: { id: string; username: string; displayName: string; photoUrl?: string | null } }
  const [orders, setOrders] = useState<VenueOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersLoaded, setOrdersLoaded] = useState(false)

  function loadOrders() {
    setOrdersLoading(true)
    api.get<{ data: VenueOrder[] }>(`/partnerships/venue/${id}/orders`)
      .then(r => { setOrders(r?.data ?? []); setOrdersLoaded(true) })
      .catch(() => setOrdersLoaded(true))
      .finally(() => setOrdersLoading(false))
  }

  // Fetch venue
  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.get<{ data: Venue }>(`/venues/${id}`)
      .then((res) => {
        const v = res.data
        setVenue(v)
        // Populate form
        setName(v.name)
        setType(v.type)
        setDescription(v.description ?? '')
        setPhone(v.phone ?? '')
        setWebsite(v.website ?? '')
        setPhotoUrl(v.photoUrl ?? '')
        setVibeTags(v.vibeTags ?? [])
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [id])

  // Fetch partnership / menu
  useEffect(() => {
    if (!venue) return
    api.get<{ data: Partnership }>(`/partnerships/venue/${id}`)
      .then(r => setPartnership(r?.data ?? null))
      .catch(() => setPartnership(null))
  }, [id, venue])

  // Auth + ownership gate (after both auth and venue have loaded)
  useEffect(() => {
    if (authLoading || loading || !venue) return
    if (!dbUser) { router.push(loginHref(`/venues/${id}/manage`)); return }
    const isOwner = dbUser.id === venue.claimedById && venue.isClaimed === true
    const isAdmin = (dbUser as any).appRole === 'ADMIN' || (dbUser as any).isAdmin
    if (!isOwner && !isAdmin) {
      if (dbUser.id === venue.claimedById && !venue.isClaimed) {
        setPendingApproval(true)
      } else {
        setForbidden(true)
      }
    }
  }, [authLoading, loading, venue, dbUser, id, router])

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true)
    try {
      const url = await uploadImage(file)
      setPhotoUrl(url)
    } catch {
      setSaveError('Photo upload failed — try again')
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const res = await api.put<{ data: Venue }>(`/venues/${id}`, {
        name: name.trim(),
        type,
        description: description.trim() || undefined,
        phone: phone.trim() || undefined,
        website: website.trim() || undefined,
        photoUrl: photoUrl.trim() || undefined,
        vibeTags,
      })
      setVenue((v) => v ? { ...v, ...res.data } : v)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setSaveError(err?.message ?? 'Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  // ── Loading / error states ────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#04040d' }}>
        <Loader2 className="animate-spin" size={24} style={{ color: 'var(--accent)' }} />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#04040d' }}>
        <Building2 size={32} style={{ color: 'rgba(var(--accent-rgb),0.3)' }} />
        <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.6)' }}>VENUE NOT FOUND</p>
        <Link href="/venues" className="text-xs font-bold" style={{ color: 'var(--accent)' }}>← Back to Venues</Link>
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: '#04040d' }}>
        <AlertTriangle size={32} style={{ color: 'rgba(255,0,110,0.5)' }} />
        <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(224,242,254,0.5)' }}>ACCESS DENIED</p>
        <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>Only the venue owner can manage this listing.</p>
        <Link href={`/venues/${id}`} className="text-xs font-bold" style={{ color: 'var(--accent)' }}>← Back to Venue</Link>
      </div>
    )
  }

  if (pendingApproval) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: '#04040d' }}>
        <Clock size={32} style={{ color: '#f59e0b' }} />
        <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(224,242,254,0.5)' }}>CLAIM PENDING</p>
        <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>Your claim is pending review — you&apos;ll be able to manage this venue once approved.</p>
        <Link href={`/venues/${id}`} className="text-xs font-bold" style={{ color: 'var(--accent)' }}>← Back to Venue</Link>
      </div>
    )
  }

  const color = TYPE_COLORS[type] ?? 'var(--accent)'

  return (
    <div className="min-h-screen pb-24" style={{ background: '#04040d', paddingTop: 56 }}>

      {/* ── Header ── */}
      <div className="sticky top-14 z-20 px-4 py-3 flex items-center justify-between gap-3"
        style={{ background: 'rgba(4,4,13,0.95)', borderBottom: '1px solid rgba(var(--accent-rgb),0.1)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/venues/${id}`}
            className="p-1.5 rounded-lg shrink-0"
            style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.12)' }}>
            <ArrowLeft size={14} style={{ color: 'rgba(var(--accent-rgb),0.7)' }} />
          </Link>
          <div className="min-w-0">
            <p className="text-[10px] font-black tracking-widest truncate" style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.2em' }}>MANAGE VENUE</p>
            <p className="text-sm font-black truncate" style={{ color: '#e0f2fe' }}>{name || venue?.name}</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black shrink-0 transition-all disabled:opacity-50"
          style={{
            background: saved ? 'rgba(0,255,136,0.12)' : `${color}18`,
            border: `1px solid ${saved ? 'rgba(0,255,136,0.4)' : `${color}50`}`,
            color: saved ? '#00ff88' : color,
            letterSpacing: '0.1em',
          }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <><CheckCircle2 size={14} /> SAVED</> : <><Save size={14} /> SAVE</>}
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-8">

        {saveError && (
          <div className="flex items-start gap-2 p-3 rounded-xl"
            style={{ background: 'rgba(255,0,110,0.06)', border: '1px solid rgba(255,0,110,0.2)' }}>
            <AlertTriangle size={14} style={{ color: '#ff006e' }} className="shrink-0 mt-0.5" />
            <p className="text-xs" style={{ color: 'rgba(254,202,202,0.9)' }}>{saveError}</p>
          </div>
        )}

        {/* ── Cover Photo ── */}
        <div className="space-y-3">
          <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.2em' }}>COVER PHOTO</p>
          <div
            className="relative w-full rounded-2xl overflow-hidden cursor-pointer group"
            style={{ height: 180, background: photoUrl ? 'transparent' : `${color}08`, border: `1px solid ${color}25` }}
            onClick={() => photoInputRef.current?.click()}
          >
            {photoUrl ? (
              <img src={photoUrl} alt="" className="w-full h-full object-cover" style={{ filter: 'brightness(0.8)' }} />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <ImageIcon size={28} style={{ color: `${color}60` }} />
                <p className="text-[10px] font-bold tracking-widest" style={{ color: `${color}50`, letterSpacing: '0.15em' }}>TAP TO UPLOAD</p>
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(0,0,0,0.4)' }}>
              {uploadingPhoto
                ? <Loader2 size={24} className="animate-spin" style={{ color: '#fff' }} />
                : <p className="text-xs font-bold text-white tracking-widest">CHANGE PHOTO</p>}
            </div>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f) }} />
          {photoUrl && (
            <button onClick={() => setPhotoUrl('')} className="text-[10px] font-bold" style={{ color: 'rgba(255,0,110,0.5)' }}>
              Remove photo
            </button>
          )}
        </div>

        {/* ── Basic info ── */}
        <div className="space-y-4">
          <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.2em' }}>BASIC INFO</p>

          <Field label="VENUE NAME">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
              placeholder="Venue name" style={inputStyle} />
          </Field>

          <Field label="TYPE">
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => setType(opt.value)}
                  className="py-2 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: type === opt.value ? `${TYPE_COLORS[opt.value]}18` : 'rgba(7,7,26,0.8)',
                    border: `1px solid ${type === opt.value ? `${TYPE_COLORS[opt.value]}50` : 'rgba(var(--accent-rgb),0.1)'}`,
                    color: type === opt.value ? TYPE_COLORS[opt.value] : 'rgba(224,242,254,0.4)',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="DESCRIPTION" hint="Tell people what makes your venue special. Max 2000 characters.">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={4} maxLength={2000} placeholder="Describe the vibe, music style, signature cocktails, capacity…"
              style={{ ...inputStyle, resize: 'vertical', minHeight: 100, lineHeight: 1.6 }} />
            <p className="text-[10px] text-right" style={{ color: 'rgba(224,242,254,0.2)' }}>{description.length}/2000</p>
          </Field>
        </div>

        {/* ── Contact ── */}
        <div className="space-y-4">
          <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.2em' }}>CONTACT</p>

          <Field label="PHONE">
            <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}>
              <Phone size={13} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30}
                placeholder="+44 141 000 0000" type="tel"
                style={{ flex: 1, background: 'transparent', color: '#e0f2fe', fontSize: 13, outline: 'none' }} />
            </div>
          </Field>

          <Field label="WEBSITE">
            <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}>
              <Globe size={13} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
              <input value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={200}
                placeholder="https://yourvenue.com" type="url"
                style={{ flex: 1, background: 'transparent', color: '#e0f2fe', fontSize: 13, outline: 'none' }} />
            </div>
          </Field>
        </div>

        {/* ── Vibe tags ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.2em' }}>VIBE TAGS</p>
            <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.25)' }}>{vibeTags.length}/10</p>
          </div>
          <VibeTagEditor tags={vibeTags} onChange={setVibeTags} />
        </div>

        {/* ── Location (read-only) ── */}
        <div className="space-y-3">
          <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.2em' }}>LOCATION</p>
          <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(7,7,26,0.6)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
            <MapPin size={14} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} className="shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{venue?.address}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(224,242,254,0.4)' }}>{venue?.city}</p>
              <p className="text-[10px] mt-1" style={{ color: 'rgba(var(--accent-rgb),0.3)' }}>
                To update the address, contact <a href="mailto:Hello@PartyRadar.org" style={{ color: 'var(--accent)' }}>Hello@PartyRadar.org</a>
              </p>
            </div>
          </div>
        </div>

        {/* ── Upcoming events ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.2em' }}>UPCOMING EVENTS</p>
            <Link href={`/events/create?venueId=${id}`}
              className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all"
              style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)', letterSpacing: '0.08em' }}>
              <Plus size={10} /> CREATE EVENT
            </Link>
          </div>
          {venue?.events?.length ? (
            <div className="space-y-2">
              {venue.events.map((ev) => (
                <Link href={`/events/${ev.id}`} key={ev.id}
                  className="flex items-center gap-3 p-3 rounded-xl transition-all"
                  style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.2)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.08)')}>
                  {ev.coverImageUrl ? (
                    <img src={ev.coverImageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center"
                      style={{ background: 'rgba(var(--accent-rgb),0.08)' }}>
                      <Calendar size={14} style={{ color: 'rgba(var(--accent-rgb),0.5)' }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{ev.name}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.4)' }}>{formatDate(ev.startsAt)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold" style={{ color: ev.price === 0 ? '#00ff88' : '#e0f2fe' }}>
                      {formatPrice(ev.price)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center rounded-xl" style={{ background: 'rgba(7,7,26,0.6)', border: '1px solid rgba(var(--accent-rgb),0.06)' }}>
              <Calendar size={20} style={{ color: 'rgba(var(--accent-rgb),0.2)', margin: '0 auto 8px' }} />
              <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>No upcoming events</p>
              <Link href={`/events/create?venueId=${id}`} className="inline-block mt-3 text-[10px] font-bold"
                style={{ color: 'var(--accent)' }}>Create your first event →</Link>
            </div>
          )}
        </div>

        {/* ── Menu management ── */}
        <div className="space-y-3">
          {partnership === 'loading' ? null : partnership === null ? (
            <>
              <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.2em' }}>MENU</p>
              <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: 'rgba(7,7,26,0.6)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
                <UtensilsCrossed size={14} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} className="shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(224,242,254,0.4)' }}>
                  Menu management requires a PartyRadar partnership. Contact{' '}
                  <a href="mailto:Hello@PartyRadar.org" style={{ color: 'var(--accent)' }}>Hello@PartyRadar.org</a>
                  {' '}to enable in-app ordering for your venue.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.2em' }}>
                  MENU{partnership.drinkMenuItems.length > 0 ? ` · ${partnership.drinkMenuItems.length} ITEMS` : ''}
                </p>
                <button
                  onClick={() => setMenuShowForm(v => !v)}
                  className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all"
                  style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)', letterSpacing: '0.08em' }}>
                  <Plus size={10} /> ADD ITEM
                </button>
              </div>

              {menuShowForm && (
                <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}>
                  <input value={menuName} onChange={e => setMenuName(e.target.value)}
                    placeholder="Item name" maxLength={80} style={inputStyle} />
                  <input value={menuDescription} onChange={e => setMenuDescription(e.target.value)}
                    placeholder="Description (optional)" maxLength={200} style={inputStyle} />
                  <div className="flex gap-2">
                    <input value={menuPrice} onChange={e => setMenuPrice(e.target.value)}
                      placeholder="Price" type="number" min="0" step="0.01"
                      style={{ ...inputStyle, flex: 1 }} />
                    <select value={menuCategory} onChange={e => setMenuCategory(e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}>
                      <option value="drink">Drink</option>
                      <option value="food">Food</option>
                      <option value="combo">Combo</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setMenuShowForm(false); setMenuName(''); setMenuDescription(''); setMenuPrice(''); setMenuCategory('drink') }}
                      className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(224,242,254,0.4)' }}>
                      Cancel
                    </button>
                    <button
                      disabled={menuSaving || !menuName.trim() || !menuPrice}
                      onClick={async () => {
                        setMenuSaving(true)
                        try {
                          const res = await api.post<{ data: MenuItem }>(`/partnerships/venue/${id}/menu`, {
                            name: menuName.trim(),
                            description: menuDescription.trim() || undefined,
                            price: parseFloat(menuPrice),
                            category: menuCategory,
                          })
                          setPartnership(prev => typeof prev === 'object' && prev !== null ? { ...prev, drinkMenuItems: [...prev.drinkMenuItems, res.data] } : prev)
                          setMenuShowForm(false)
                          setMenuName(''); setMenuDescription(''); setMenuPrice(''); setMenuCategory('drink')
                        } catch { /* ignore */ } finally { setMenuSaving(false) }
                      }}
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-black transition-all disabled:opacity-40"
                      style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)', letterSpacing: '0.08em' }}>
                      {menuSaving ? <Loader2 size={12} className="animate-spin" /> : <><Plus size={12} /> SAVE</>}
                    </button>
                  </div>
                </div>
              )}

              {partnership.drinkMenuItems.length > 0 ? (
                <div className="space-y-2">
                  {partnership.drinkMenuItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold truncate" style={{ color: item.isAvailable ? '#e0f2fe' : 'rgba(224,242,254,0.35)' }}>{item.name}</p>
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                            style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'rgba(var(--accent-rgb),0.6)' }}>
                            {item.category}
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-[10px] mt-0.5 truncate" style={{ color: 'rgba(224,242,254,0.3)' }}>{item.description}</p>
                        )}
                        <p className="text-xs font-bold mt-0.5" style={{ color: 'rgba(var(--accent-rgb),0.7)' }}>{formatPrice(item.price)}</p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const res = await api.put<{ data: MenuItem }>(`/partnerships/venue/${id}/menu/${item.id}`, { isAvailable: !item.isAvailable })
                            setPartnership(prev => typeof prev === 'object' && prev !== null ? { ...prev, drinkMenuItems: prev.drinkMenuItems.map(i => i.id === item.id ? res.data : i) } : prev)
                          } catch { /* ignore */ }
                        }}
                        className="shrink-0 transition-all"
                        title={item.isAvailable ? 'Mark unavailable' : 'Mark available'}>
                        {item.isAvailable
                          ? <ToggleRight size={20} style={{ color: '#00ff88' }} />
                          : <ToggleLeft size={20} style={{ color: 'rgba(255,255,255,0.2)' }} />}
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await api.delete(`/partnerships/venue/${id}/menu/${item.id}`)
                            setPartnership(prev => typeof prev === 'object' && prev !== null ? { ...prev, drinkMenuItems: prev.drinkMenuItems.filter(i => i.id !== item.id) } : prev)
                          } catch { /* ignore */ }
                        }}
                        className="shrink-0 transition-all hover:opacity-80"
                        title="Delete item">
                        <X size={14} style={{ color: 'rgba(255,0,110,0.5)' }} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center rounded-xl" style={{ background: 'rgba(7,7,26,0.6)', border: '1px solid rgba(var(--accent-rgb),0.06)' }}>
                  <UtensilsCrossed size={20} style={{ color: 'rgba(var(--accent-rgb),0.2)', margin: '0 auto 8px' }} />
                  <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>No menu items yet</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Orders panel ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.2em' }}>
              ORDERS {ordersLoaded && orders.length > 0 ? `· ${orders.length}` : ''}
            </p>
            <button
              onClick={loadOrders}
              disabled={ordersLoading}
              className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
              style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)', letterSpacing: '0.08em' }}>
              <RefreshCw size={10} className={ordersLoading ? 'animate-spin' : ''} />
              {ordersLoaded ? 'REFRESH' : 'LOAD ORDERS'}
            </button>
          </div>

          {ordersLoading && (
            <div className="py-6 flex items-center justify-center">
              <Loader2 size={18} className="animate-spin" style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
            </div>
          )}

          {ordersLoaded && !ordersLoading && orders.length === 0 && (
            <div className="py-6 text-center rounded-xl" style={{ background: 'rgba(7,7,26,0.6)', border: '1px solid rgba(var(--accent-rgb),0.06)' }}>
              <ShoppingBag size={20} style={{ color: 'rgba(var(--accent-rgb),0.2)', margin: '0 auto 8px' }} />
              <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>No orders yet</p>
            </div>
          )}

          {ordersLoaded && orders.length > 0 && (
            <div className="space-y-2">
              {orders.map((order) => {
                const t = new Date(order.createdAt)
                const timeStr = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                const dateStr = t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                return (
                  <div key={order.id} className="p-3 rounded-xl space-y-2"
                    style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
                    {/* Header row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {order.tableNumber && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-lg"
                            style={{ background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}>
                            🪑 Table {order.tableNumber}
                          </span>
                        )}
                        <span className="text-xs font-semibold" style={{ color: '#e0f2fe' }}>@{order.user.username}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black" style={{ color: 'var(--accent)' }}>£{order.total.toFixed(2)}</p>
                        <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>{timeStr} · {dateStr}</p>
                      </div>
                    </div>
                    {/* Items */}
                    <div className="space-y-0.5 pl-1">
                      {order.items.map((item, i) => (
                        <p key={i} className="text-[11px]" style={{ color: 'rgba(224,242,254,0.5)' }}>
                          {item.qty}× {item.name}
                          <span className="ml-1.5" style={{ color: 'rgba(224,242,254,0.3)' }}>£{item.lineTotal.toFixed(2)}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Danger zone ── */}
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,0,110,0.03)', border: '1px solid rgba(255,0,110,0.1)' }}>
          <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(255,0,110,0.5)', letterSpacing: '0.2em' }}>VENUE LISTING</p>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(224,242,254,0.4)' }}>
            Need to transfer ownership, report an issue, or remove this venue from PartyRadar?
          </p>
          <a href={`mailto:Hello@PartyRadar.org?subject=Venue Management: ${encodeURIComponent(venue?.name ?? '')}`}
            className="inline-block text-[10px] font-bold"
            style={{ color: 'rgba(255,0,110,0.6)' }}>
            Contact support →
          </a>
        </div>

        {/* Bottom save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm transition-all disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, ${color}18, rgba(61,90,254,0.1))`,
            border: `1px solid ${color}40`,
            color,
            letterSpacing: '0.1em',
          }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <><CheckCircle2 size={16} /> CHANGES SAVED</> : <><Save size={16} /> SAVE CHANGES</>}
        </button>

      </div>
    </div>
  )
}
