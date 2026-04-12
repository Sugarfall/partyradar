'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  BarChart3, Users, Ticket, Crown, Zap, Calendar, Clock,
  TrendingUp, Send, ChevronRight, Eye, Edit3, UserX,
  Bell, Radio, DollarSign, AlertCircle, CheckCircle, Loader2,
  ArrowLeft, MapPin, X,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { API_URL } from '@/lib/api'
import { PUSH_BLAST_TIERS } from '@partyradar/shared'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashStats {
  totalEvents: number
  upcomingEvents: number
  totalTicketsSold: number
  ticketRevenue: number
  platformFees: number
  groupRevenue: number
  totalGroups: number
  totalSubscribers: number
  referralBalance: number
}

interface DashEvent {
  id: string
  name: string
  type: string
  startsAt: string
  endsAt: string | null
  coverImageUrl: string | null
  price: number
  capacity: number
  ticketsRemaining: number
  isCancelled: boolean
  isFeatured: boolean
  guestCount: number
  ticketCount: number
  neighbourhood: string
}

interface DashGroup {
  id: string
  name: string
  emoji: string
  isPaid: boolean
  priceMonthly: number | null
  memberCount: number
  subscriberCount: number
  monthlyRevenue: number
}

interface DashAttendee {
  id: string
  user: { id: string; displayName: string; username: string; photoUrl: string | null }
  event: { id: string; name: string; startsAt: string }
  status: string
  invitedAt: string
}

interface DashBlast {
  id: string
  eventId: string
  tierId: string
  title: string
  body: string
  status: string
  scheduledFor: string
  sentAt: string | null
  recipientCount: number | null
  reach: string
  price: number
  createdAt: string
}

interface EventAttendees {
  guests: { id: string; user: { id: string; displayName: string; username: string; photoUrl: string | null; gender: string | null }; status: string; invitedAt: string }[]
  tickets: { id: string; user: { id: string; displayName: string; username: string; photoUrl: string | null }; pricePaid: number; scannedAt: string | null; createdAt: string }[]
  genderBreakdown: { male: number; female: number; nonBinary: number; unknown: number }
  totalGuests: number
  totalTickets: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function isFuture(dateStr: string) { return new Date(dateStr) > new Date() }

const TYPE_COLORS: Record<string, string> = {
  HOME_PARTY: '#ec4899', CLUB_NIGHT: '#a855f7', CONCERT: '#3b82f6',
}

const BLAST_STATUS_STYLE: Record<string, { bg: string; border: string; color: string; label: string }> = {
  QUEUED: { bg: 'rgba(255,214,0,0.08)', border: 'rgba(255,214,0,0.25)', color: '#ffd600', label: 'QUEUED' },
  SENDING: { bg: 'rgba(0,229,255,0.08)', border: 'rgba(0,229,255,0.25)', color: '#00e5ff', label: 'SENDING' },
  SENT: { bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.25)', color: '#00ff88', label: 'SENT' },
  FAILED: { bg: 'rgba(255,0,110,0.08)', border: 'rgba(255,0,110,0.25)', color: '#ff006e', label: 'FAILED' },
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, prefix }: {
  label: string; value: number | string; icon: typeof BarChart3; color: string; prefix?: string
}) {
  return (
    <div className="rounded-xl p-3.5"
      style={{ background: `${color}06`, border: `1px solid ${color}20` }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15` }}>
          <Icon size={13} style={{ color }} />
        </div>
        <span className="text-[8px] font-black tracking-widest" style={{ color: `${color}80` }}>{label}</span>
      </div>
      <p className="text-xl font-black" style={{ color }}>
        {prefix}{typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}

// ─── Event Attendees Modal ───────────────────────────────────────────────────

function AttendeesModal({ eventId, eventName, onClose }: {
  eventId: string; eventName: string; onClose: () => void
}) {
  const [data, setData] = useState<EventAttendees | null>(null)
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  const token = typeof window !== 'undefined' ? localStorage.getItem('partyradar_token') ?? '' : ''

  useEffect(() => {
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    fetch(`${API_URL}/dashboard/events/${eventId}/attendees`, { headers })
      .then((r) => r.json())
      .then((j) => setData(j.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [eventId])

  async function removeGuest(guestId: string) {
    setRemoving(guestId)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    await fetch(`${API_URL}/dashboard/guests/${guestId}`, { method: 'DELETE', headers })
    setData((d) => d ? {
      ...d,
      guests: d.guests.map((g) => g.id === guestId ? { ...g, status: 'REMOVED' } : g),
    } : d)
    setRemoving(null)
  }

  const total = (data?.totalGuests ?? 0) + (data?.totalTickets ?? 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div className="w-full max-w-lg max-h-[80vh] rounded-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(168,85,247,0.2)' }}>
        {/* Header */}
        <div className="p-4 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid rgba(168,85,247,0.1)' }}>
          <div>
            <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{eventName}</p>
            <p className="text-[10px]" style={{ color: 'rgba(168,85,247,0.5)' }}>
              {total} attendees
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'rgba(224,242,254,0.3)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Gender breakdown */}
        {data && (
          <div className="px-4 py-3 flex gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {[
              { label: 'Male', value: data.genderBreakdown.male, color: '#3b82f6' },
              { label: 'Female', value: data.genderBreakdown.female, color: '#ec4899' },
              { label: 'Non-binary', value: data.genderBreakdown.nonBinary, color: '#a855f7' },
            ].map((g) => (
              <div key={g.label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: g.color }} />
                <span className="text-[10px] font-bold" style={{ color: 'rgba(224,242,254,0.5)' }}>
                  {g.label}: {g.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Guest list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={20} className="animate-spin" style={{ color: 'rgba(168,85,247,0.4)' }} />
            </div>
          ) : (
            <>
              {data?.guests.map((g) => (
                <div key={g.id} className="flex items-center gap-3 p-2.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  {g.user.photoUrl ? (
                    <img src={g.user.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                      style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}>
                      {g.user.displayName[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: '#e0f2fe' }}>{g.user.displayName}</p>
                    <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.3)' }}>@{g.user.username}</p>
                  </div>
                  <span className="text-[8px] font-black px-2 py-0.5 rounded-full shrink-0"
                    style={{
                      background: g.status === 'CONFIRMED' ? 'rgba(0,255,136,0.1)' : g.status === 'REMOVED' ? 'rgba(255,0,110,0.1)' : 'rgba(255,214,0,0.1)',
                      color: g.status === 'CONFIRMED' ? '#00ff88' : g.status === 'REMOVED' ? '#ff006e' : '#ffd600',
                    }}>
                    {g.status}
                  </span>
                  {g.status !== 'REMOVED' && (
                    <button onClick={() => removeGuest(g.id)} disabled={removing === g.id}
                      className="p-1 rounded-lg transition-all"
                      style={{ color: 'rgba(255,0,110,0.4)' }}>
                      <UserX size={12} />
                    </button>
                  )}
                </div>
              ))}
              {data?.tickets && data.tickets.length > 0 && (
                <>
                  <p className="text-[9px] font-black tracking-widest pt-3 pb-1" style={{ color: 'rgba(255,214,0,0.4)' }}>
                    TICKET HOLDERS
                  </p>
                  {data.tickets.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-xl"
                      style={{ background: 'rgba(255,214,0,0.02)', border: '1px solid rgba(255,214,0,0.08)' }}>
                      {t.user.photoUrl ? (
                        <img src={t.user.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                          style={{ background: 'rgba(255,214,0,0.12)', color: '#ffd600' }}>
                          {t.user.displayName[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate" style={{ color: '#e0f2fe' }}>{t.user.displayName}</p>
                        <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.3)' }}>£{t.pricePaid.toFixed(2)} paid</p>
                      </div>
                      <span className="text-[8px] font-black px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          background: t.scannedAt ? 'rgba(0,255,136,0.1)' : 'rgba(0,229,255,0.1)',
                          color: t.scannedAt ? '#00ff88' : '#00e5ff',
                        }}>
                        {t.scannedAt ? 'SCANNED' : 'VALID'}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Push Blast Modal ────────────────────────────────────────────────────────

function BlastModal({ events, onClose }: {
  events: DashEvent[]
  onClose: () => void
}) {
  const [selectedEvent, setSelectedEvent] = useState('')
  const [selectedTier, setSelectedTier] = useState('LOCAL')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ checkoutUrl: string; queuePosition: number; estimatedSendTime: string } | null>(null)

  const token = typeof window !== 'undefined' ? localStorage.getItem('partyradar_token') ?? '' : ''
  const upcomingEvents = events.filter((e) => isFuture(e.startsAt) && !e.isCancelled)
  const tier = PUSH_BLAST_TIERS.find((t) => t.id === selectedTier)

  async function handleSend() {
    if (!selectedEvent || !title.trim() || !body.trim() || sending) return
    setSending(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const r = await fetch(`${API_URL}/dashboard/blast`, {
        method: 'POST', headers,
        body: JSON.stringify({ eventId: selectedEvent, tierId: selectedTier, title: title.trim(), body: body.trim() }),
      })
      const j = await r.json()
      if (j.data?.checkoutUrl) {
        setResult(j.data)
      }
    } catch {}
    finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div className="w-full max-w-md max-h-[85vh] rounded-2xl overflow-y-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(168,85,247,0.2)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(168,85,247,0.15)' }}>
              <Bell size={15} style={{ color: '#a855f7' }} />
            </div>
            <p className="text-sm font-black" style={{ color: '#a855f7' }}>PUSH BLAST</p>
          </div>
          <button onClick={onClose} style={{ color: 'rgba(224,242,254,0.3)' }}><X size={16} /></button>
        </div>

        {result ? (
          <div className="text-center py-4 space-y-3">
            <CheckCircle size={40} className="mx-auto" style={{ color: '#00ff88' }} />
            <p className="text-sm font-black" style={{ color: '#00ff88' }}>BLAST QUEUED</p>
            <p className="text-xs" style={{ color: 'rgba(224,242,254,0.4)' }}>
              Queue position: #{result.queuePosition}<br />
              Estimated send: {fmtDate(result.estimatedSendTime)}
            </p>
            <a href={result.checkoutUrl} target="_blank" rel="noopener"
              className="inline-block px-6 py-2.5 rounded-xl text-xs font-black tracking-widest"
              style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }}>
              COMPLETE PAYMENT
            </a>
          </div>
        ) : (
          <>
            {/* Select event */}
            <div>
              <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: 'rgba(168,85,247,0.5)' }}>SELECT EVENT</p>
              {upcomingEvents.length === 0 ? (
                <p className="text-xs py-3 text-center" style={{ color: 'rgba(224,242,254,0.3)' }}>No upcoming events</p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {upcomingEvents.map((e) => (
                    <button key={e.id} onClick={() => setSelectedEvent(e.id)}
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all"
                      style={{
                        background: selectedEvent === e.id ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${selectedEvent === e.id ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.04)'}`,
                      }}>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: TYPE_COLORS[e.type] ?? '#a855f7' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate" style={{ color: '#e0f2fe' }}>{e.name}</p>
                        <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>{fmtDate(e.startsAt)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Blast tier */}
            <div>
              <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: 'rgba(168,85,247,0.5)' }}>BLAST RADIUS</p>
              <div className="grid grid-cols-2 gap-2">
                {PUSH_BLAST_TIERS.map((t) => {
                  const active = selectedTier === t.id
                  return (
                    <button key={t.id} onClick={() => setSelectedTier(t.id)}
                      className="py-2.5 rounded-xl text-center transition-all"
                      style={{
                        background: active ? 'rgba(168,85,247,0.12)' : 'rgba(168,85,247,0.03)',
                        border: `1px solid ${active ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.08)'}`,
                      }}>
                      <p className="text-sm font-black" style={{ color: active ? '#a855f7' : 'rgba(224,242,254,0.5)' }}>
                        £{t.price.toFixed(2)}
                      </p>
                      <p className="text-[9px]" style={{ color: active ? 'rgba(168,85,247,0.7)' : 'rgba(224,242,254,0.3)' }}>
                        {t.label}
                      </p>
                      <p className="text-[8px]" style={{ color: active ? 'rgba(168,85,247,0.5)' : 'rgba(224,242,254,0.2)' }}>
                        {t.reach}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Notification content */}
            <div>
              <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: 'rgba(168,85,247,0.5)' }}>NOTIFICATION</p>
              <input type="text" placeholder="Notification title" value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 60))}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none mb-2"
                style={{ border: '1px solid rgba(168,85,247,0.15)', color: '#e0f2fe' }} />
              <textarea placeholder="What's happening at your event?" value={body}
                onChange={(e) => setBody(e.target.value.slice(0, 200))}
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none resize-none"
                style={{ border: '1px solid rgba(168,85,247,0.15)', color: '#e0f2fe' }} />
              <p className="text-[8px] mt-1 text-right" style={{ color: 'rgba(224,242,254,0.2)' }}>{body.length}/200</p>
            </div>

            {/* Queue info */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl"
              style={{ background: 'rgba(255,214,0,0.05)', border: '1px solid rgba(255,214,0,0.15)' }}>
              <Clock size={12} style={{ color: 'rgba(255,214,0,0.5)' }} />
              <p className="text-[10px]" style={{ color: 'rgba(255,214,0,0.5)' }}>
                Blasts are queued 3 min apart to avoid notification spam. Your blast will be scheduled after payment.
              </p>
            </div>

            <button onClick={handleSend}
              disabled={!selectedEvent || !title.trim() || !body.trim() || sending}
              className="w-full py-3 rounded-xl text-xs font-black tracking-widest transition-all disabled:opacity-40"
              style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.35)', color: '#a855f7' }}>
              {sending ? 'PROCESSING...' : `SEND BLAST — £${tier?.price.toFixed(2) ?? '0.00'}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Dashboard Page ─────────────────────────────────────────────────────

export default function DashboardPage() {
  const { dbUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashStats | null>(null)
  const [events, setEvents] = useState<DashEvent[]>([])
  const [groups, setGroups] = useState<DashGroup[]>([])
  const [attendees, setAttendees] = useState<DashAttendee[]>([])
  const [blasts, setBlasts] = useState<DashBlast[]>([])
  const [blastQueue, setBlastQueue] = useState(0)
  const [tab, setTab] = useState<'overview' | 'events' | 'attendees' | 'blasts'>('overview')
  const [attendeeModal, setAttendeeModal] = useState<{ id: string; name: string } | null>(null)
  const [blastModal, setBlastModal] = useState(false)

  const token = typeof window !== 'undefined' ? localStorage.getItem('partyradar_token') ?? '' : ''

  const load = useCallback(async () => {
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    try {
      const r = await fetch(`${API_URL}/dashboard`, { headers })
      const j = await r.json()
      if (j.data) {
        setStats(j.data.stats)
        setEvents(j.data.events)
        setGroups(j.data.groups)
        setAttendees(j.data.recentAttendees)
        setBlasts(j.data.blasts)
        setBlastQueue(j.data.blastQueue?.queuedAhead ?? 0)
      }
    } catch {}
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { load() }, [load])

  if (!dbUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#04040d', paddingTop: 56 }}>
        <BarChart3 size={40} style={{ color: 'rgba(168,85,247,0.2)' }} />
        <p className="text-sm font-bold" style={{ color: 'rgba(224,242,254,0.3)' }}>Log in to access your dashboard</p>
        <Link href="/login" className="px-5 py-2 rounded-xl text-xs font-black"
          style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7' }}>
          LOG IN
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#04040d', paddingTop: 56 }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(168,85,247,0.1)', borderTopColor: '#a855f7' }} />
      </div>
    )
  }

  const upcomingEvents = events.filter((e) => isFuture(e.startsAt) && !e.isCancelled)
  const pastEvents = events.filter((e) => !isFuture(e.startsAt))
  const netRevenue = (stats?.ticketRevenue ?? 0) - (stats?.platformFees ?? 0) + (stats?.groupRevenue ?? 0)

  const TABS = [
    { id: 'overview' as const, label: 'OVERVIEW', icon: BarChart3 },
    { id: 'events' as const, label: 'EVENTS', icon: Calendar },
    { id: 'attendees' as const, label: 'ATTENDEES', icon: Users },
    { id: 'blasts' as const, label: 'BLASTS', icon: Bell },
  ]

  return (
    <div className="min-h-screen pb-32" style={{ background: '#04040d', paddingTop: 56 }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-4 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-lg font-black tracking-wide" style={{ color: '#e0f2fe' }}>Host Dashboard</p>
            <p className="text-[11px]" style={{ color: 'rgba(168,85,247,0.5)' }}>
              {dbUser.displayName} — {events.length} events
            </p>
          </div>
          <button onClick={() => setBlastModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(0,229,255,0.08) 100%)',
              border: '1px solid rgba(168,85,247,0.35)',
              color: '#a855f7',
            }}>
            <Bell size={12} /> PUSH BLAST
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all whitespace-nowrap shrink-0"
                style={{
                  background: active ? 'rgba(168,85,247,0.12)' : 'transparent',
                  border: `1px solid ${active ? 'rgba(168,85,247,0.35)' : 'rgba(168,85,247,0.08)'}`,
                  color: active ? '#a855f7' : 'rgba(168,85,247,0.35)',
                }}>
                <t.icon size={11} /> {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-4 max-w-3xl mx-auto">
        {/* ── Overview tab ─────────────────────────────────────────────────── */}
        {tab === 'overview' && stats && (
          <div className="space-y-4">
            {/* Revenue banner */}
            <div className="rounded-2xl p-5 relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(0,229,255,0.04) 100%)',
                border: '1px solid rgba(168,85,247,0.2)',
              }}>
              <p className="text-[9px] font-black tracking-widest mb-1" style={{ color: 'rgba(168,85,247,0.5)' }}>TOTAL NET REVENUE</p>
              <p className="text-3xl font-black" style={{ color: '#a855f7' }}>
                £{netRevenue.toFixed(2)}
              </p>
              <div className="flex gap-4 mt-2">
                <span className="text-[10px]" style={{ color: 'rgba(0,255,136,0.5)' }}>
                  Tickets: £{(stats.ticketRevenue - stats.platformFees).toFixed(2)}
                </span>
                <span className="text-[10px]" style={{ color: 'rgba(255,214,0,0.5)' }}>
                  Groups: £{stats.groupRevenue.toFixed(2)}
                </span>
                <span className="text-[10px]" style={{ color: 'rgba(0,229,255,0.4)' }}>
                  Referrals: £{stats.referralBalance.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Stat grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard label="EVENTS" value={stats.totalEvents} icon={Calendar} color="#a855f7" />
              <StatCard label="UPCOMING" value={stats.upcomingEvents} icon={Clock} color="#00e5ff" />
              <StatCard label="TICKETS SOLD" value={stats.totalTicketsSold} icon={Ticket} color="#00ff88" />
              <StatCard label="SUBSCRIBERS" value={stats.totalSubscribers} icon={Crown} color="#ffd600" />
            </div>

            {/* Upcoming events quick list */}
            {upcomingEvents.length > 0 && (
              <div>
                <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: 'rgba(168,85,247,0.4)' }}>UPCOMING EVENTS</p>
                <div className="space-y-2">
                  {upcomingEvents.slice(0, 4).map((e) => (
                    <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="w-2.5 h-10 rounded-full shrink-0" style={{ background: TYPE_COLORS[e.type] ?? '#a855f7' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate" style={{ color: '#e0f2fe' }}>{e.name}</p>
                        <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.3)' }}>{fmtDate(e.startsAt)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'rgba(0,229,255,0.5)' }}>
                          <Users size={9} /> {e.guestCount}
                        </span>
                        <button onClick={() => setAttendeeModal({ id: e.id, name: e.name })}
                          className="p-1.5 rounded-lg" style={{ color: 'rgba(168,85,247,0.4)' }}>
                          <Eye size={12} />
                        </button>
                        <Link href={`/events/${e.id}/edit`}
                          className="p-1.5 rounded-lg" style={{ color: 'rgba(0,229,255,0.4)' }}>
                          <Edit3 size={12} />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Paid groups */}
            {groups.filter((g) => g.isPaid).length > 0 && (
              <div>
                <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: 'rgba(255,214,0,0.4)' }}>PAID GROUPS REVENUE</p>
                <div className="space-y-2">
                  {groups.filter((g) => g.isPaid).map((g) => (
                    <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ background: 'rgba(255,214,0,0.03)', border: '1px solid rgba(255,214,0,0.12)' }}>
                      <span className="text-xl">{g.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate" style={{ color: '#e0f2fe' }}>{g.name}</p>
                        <p className="text-[10px]" style={{ color: 'rgba(255,214,0,0.4)' }}>
                          {g.subscriberCount} subs × £{g.priceMonthly?.toFixed(2)}/mo
                        </p>
                      </div>
                      <p className="text-sm font-black shrink-0" style={{ color: '#00ff88' }}>
                        £{g.monthlyRevenue.toFixed(2)}<span className="text-[8px] font-normal">/mo</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Events tab ───────────────────────────────────────────────────── */}
        {tab === 'events' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black tracking-widest" style={{ color: 'rgba(168,85,247,0.4)' }}>
                ALL EVENTS ({events.length})
              </p>
              <Link href="/events/create"
                className="text-[10px] font-black px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7' }}>
                + CREATE
              </Link>
            </div>

            {events.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <Calendar size={32} style={{ color: 'rgba(168,85,247,0.15)' }} />
                <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>No events yet. Create your first one!</p>
              </div>
            ) : events.map((e) => (
              <div key={e.id} className="rounded-xl overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${e.isCancelled ? 'rgba(255,0,110,0.15)' : 'rgba(255,255,255,0.05)'}`,
                  opacity: e.isCancelled ? 0.6 : 1,
                }}>
                <div className="flex items-stretch">
                  {/* Color bar */}
                  <div className="w-1.5 shrink-0" style={{ background: TYPE_COLORS[e.type] ?? '#a855f7' }} />
                  <div className="flex-1 p-3.5 flex items-center gap-3">
                    {e.coverImageUrl && (
                      <img src={e.coverImageUrl} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{e.name}</p>
                        {e.isFeatured && (
                          <Zap size={10} style={{ color: '#ffd600' }} />
                        )}
                        {e.isCancelled && (
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(255,0,110,0.12)', color: '#ff006e' }}>CANCELLED</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.3)' }}>{fmtDate(e.startsAt)}</span>
                        <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.2)' }}>·</span>
                        <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'rgba(224,242,254,0.3)' }}>
                          <MapPin size={8} /> {e.neighbourhood}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px]" style={{ color: 'rgba(0,229,255,0.5)' }}>
                          {e.guestCount} guests
                        </span>
                        <span className="text-[10px]" style={{ color: 'rgba(0,255,136,0.5)' }}>
                          {e.ticketCount} tickets
                        </span>
                        {e.price > 0 && (
                          <span className="text-[10px]" style={{ color: 'rgba(255,214,0,0.5)' }}>
                            £{e.price.toFixed(2)}
                          </span>
                        )}
                        <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.2)' }}>
                          {e.ticketsRemaining}/{e.capacity} left
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => setAttendeeModal({ id: e.id, name: e.name })}
                        className="p-2 rounded-lg transition-all"
                        style={{ background: 'rgba(168,85,247,0.06)', color: 'rgba(168,85,247,0.5)' }}>
                        <Users size={13} />
                      </button>
                      <Link href={`/events/${e.id}/edit`}
                        className="p-2 rounded-lg transition-all"
                        style={{ background: 'rgba(0,229,255,0.06)', color: 'rgba(0,229,255,0.5)' }}>
                        <Edit3 size={13} />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Attendees tab ────────────────────────────────────────────────── */}
        {tab === 'attendees' && (
          <div className="space-y-3">
            <p className="text-[9px] font-black tracking-widest" style={{ color: 'rgba(168,85,247,0.4)' }}>
              RECENT ATTENDEES ({attendees.length})
            </p>
            {attendees.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <Users size={32} style={{ color: 'rgba(168,85,247,0.15)' }} />
                <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>No attendees yet</p>
              </div>
            ) : attendees.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                {a.user.photoUrl ? (
                  <img src={a.user.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                    style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}>
                    {a.user.displayName[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate" style={{ color: '#e0f2fe' }}>{a.user.displayName}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.3)' }}>
                    {a.event.name} · {timeAgo(a.invitedAt)}
                  </p>
                </div>
                <span className="text-[8px] font-black px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    background: a.status === 'CONFIRMED' ? 'rgba(0,255,136,0.1)' : a.status === 'REMOVED' ? 'rgba(255,0,110,0.1)' : 'rgba(255,214,0,0.1)',
                    color: a.status === 'CONFIRMED' ? '#00ff88' : a.status === 'REMOVED' ? '#ff006e' : '#ffd600',
                  }}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Blasts tab ───────────────────────────────────────────────────── */}
        {tab === 'blasts' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black tracking-widest" style={{ color: 'rgba(168,85,247,0.4)' }}>
                PUSH BLAST HISTORY
              </p>
              <button onClick={() => setBlastModal(true)}
                className="text-[10px] font-black px-3 py-1.5 rounded-lg flex items-center gap-1"
                style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7' }}>
                <Bell size={10} /> NEW BLAST
              </button>
            </div>

            {/* Queue status */}
            {blastQueue > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-xl"
                style={{ background: 'rgba(255,214,0,0.05)', border: '1px solid rgba(255,214,0,0.15)' }}>
                <AlertCircle size={14} style={{ color: 'rgba(255,214,0,0.5)' }} />
                <p className="text-[10px]" style={{ color: 'rgba(255,214,0,0.6)' }}>
                  {blastQueue} blast{blastQueue !== 1 ? 's' : ''} currently in queue
                </p>
              </div>
            )}

            {blasts.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <Bell size={32} style={{ color: 'rgba(168,85,247,0.15)' }} />
                <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>No blasts sent yet</p>
                <p className="text-[10px] text-center" style={{ color: 'rgba(224,242,254,0.2)', maxWidth: 260 }}>
                  Push blasts notify nearby users about your event. Blasts are queued to avoid spamming users.
                </p>
              </div>
            ) : blasts.map((b) => {
              const style = BLAST_STATUS_STYLE[b.status] ?? BLAST_STATUS_STYLE['QUEUED']!
              return (
                <div key={b.id} className="p-3.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>{b.title}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.35)' }}>{b.body}</p>
                    </div>
                    <span className="text-[8px] font-black px-2 py-0.5 rounded-full shrink-0 ml-2"
                      style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.color }}>
                      {style.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[9px] flex items-center gap-0.5" style={{ color: 'rgba(224,242,254,0.25)' }}>
                      <Radio size={8} /> {b.reach}
                    </span>
                    <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.25)' }}>
                      £{b.price.toFixed(2)}
                    </span>
                    {b.recipientCount != null && (
                      <span className="text-[9px]" style={{ color: 'rgba(0,255,136,0.4)' }}>
                        {b.recipientCount} reached
                      </span>
                    )}
                    <span className="text-[9px] ml-auto" style={{ color: 'rgba(224,242,254,0.2)' }}>
                      {timeAgo(b.createdAt)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {attendeeModal && (
        <AttendeesModal eventId={attendeeModal.id} eventName={attendeeModal.name}
          onClose={() => setAttendeeModal(null)} />
      )}
      {blastModal && (
        <BlastModal events={events} onClose={() => setBlastModal(false)} />
      )}
    </div>
  )
}
