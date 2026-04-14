'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, QrCode, Edit3, Users, Zap, BarChart2, Calendar,
  ChevronRight, Megaphone, Clock, CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import type { Event } from '@partyradar/shared'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  live:       { label: 'LIVE',       color: '#00ff88', icon: CheckCircle2  },
  upcoming:   { label: 'UPCOMING',   color: '#00e5ff', icon: Clock         },
  cancelled:  { label: 'CANCELLED',  color: '#ff006e', icon: XCircle       },
  draft:      { label: 'DRAFT',      color: 'rgba(74,96,128,0.7)', icon: AlertCircle },
}

function getStatus(event: Event) {
  if (event.isCancelled) return 'cancelled'
  if (!event.isPublished) return 'draft'
  const now = Date.now()
  const start = new Date(event.startsAt).getTime()
  const end = event.endsAt ? new Date(event.endsAt).getTime() : start + 6 * 3600000
  if (now >= start && now <= end) return 'live'
  return 'upcoming'
}

function formatShortDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

const TYPE_COLOR: Record<string, string> = {
  HOME_PARTY: '#ff006e',
  CLUB_NIGHT: '#00e5ff',
  CONCERT: '#3d5afe',
}

export default function HostDashboard() {
  const { dbUser } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [myEvents, setMyEvents] = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)

  useEffect(() => {
    if (!dbUser) return
    setEventsLoading(true)
    api.get<{ data: Event[] }>('/events/mine')
      .then((res) => setMyEvents(res.data ?? []))
      .catch(() => setMyEvents([]))
      .finally(() => setEventsLoading(false))
  }, [dbUser?.id])

  const now = Date.now()
  const upcoming = myEvents.filter((e) => !e.isCancelled && new Date(e.startsAt).getTime() > now - 3600000)
  const past = myEvents.filter((e) => e.isCancelled || new Date(e.startsAt).getTime() <= now - 3600000)
  const displayed = tab === 'upcoming' ? upcoming : past

  if (!dbUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#04040d' }}>
        <p className="text-sm font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.5)' }}>SIGN IN TO HOST</p>
        <Link href="/login" className="btn-primary text-xs px-6 py-2.5" style={{ letterSpacing: '0.1em' }}>SIGN IN</Link>
      </div>
    )
  }

  const liveEvent = myEvents.find((e) => getStatus(e) === 'live')

  return (
    <div className="min-h-screen pb-32" style={{ background: '#04040d' }}>
      {/* Header */}
      <div className="pt-20 pb-6 px-4" style={{ borderBottom: '1px solid rgba(0,229,255,0.07)' }}>
        <div className="max-w-2xl mx-auto">
          <p className="text-[9px] font-bold tracking-[0.25em] mb-1" style={{ color: 'rgba(0,229,255,0.4)' }}>HOST DASHBOARD</p>
          <h1 className="text-2xl font-black mb-1" style={{ color: '#e0f2fe' }}>
            {dbUser.displayName || dbUser.username}
          </h1>
          <p className="text-xs" style={{ color: 'rgba(74,96,128,0.7)' }}>@{dbUser.username}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* Live event banner */}
        {liveEvent && (
          <Link href={`/events/${liveEvent.id}`}
            className="block p-4 rounded-2xl relative overflow-hidden transition-all duration-200"
            style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.3)', boxShadow: '0 0 24px rgba(0,255,136,0.08)' }}>
            <div className="absolute top-0 inset-x-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, #00ff88, transparent)' }} />
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#00ff88', boxShadow: '0 0 8px rgba(0,255,136,0.8)' }} />
                  <span className="text-[9px] font-black tracking-[0.2em]" style={{ color: '#00ff88' }}>LIVE NOW</span>
                </div>
                <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{liveEvent.name}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'rgba(0,255,136,0.6)' }}>
                  {liveEvent.guestCount ?? 0} checked in · {liveEvent.capacity - (liveEvent.guestCount ?? 0)} spots left
                </p>
              </div>
              <Link href={`/events/${liveEvent.id}/scan`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black transition-all"
                style={{ background: '#00ff88', color: '#04040d', letterSpacing: '0.08em' }}>
                <QrCode size={12} /> SCAN
              </Link>
            </div>
          </Link>
        )}

        {/* Quick actions */}
        <div>
          <p className="text-[9px] font-bold tracking-[0.2em] mb-3" style={{ color: 'rgba(0,229,255,0.4)' }}>QUICK ACTIONS</p>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/events/create"
              className="flex items-center gap-3 p-4 rounded-xl transition-all duration-200"
              style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.2)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.2)' }}>
                <Plus size={16} style={{ color: '#00e5ff' }} />
              </div>
              <div>
                <p className="text-xs font-black" style={{ color: '#e0f2fe' }}>NEW EVENT</p>
                <p className="text-[9px]" style={{ color: 'rgba(74,96,128,0.6)' }}>Create & publish</p>
              </div>
            </Link>

            <Link href="/subscriptions"
              className="flex items-center gap-3 p-4 rounded-xl transition-all duration-200"
              style={{ background: 'rgba(61,90,254,0.05)', border: '1px solid rgba(61,90,254,0.2)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(61,90,254,0.1)', border: '1px solid rgba(61,90,254,0.2)' }}>
                <Zap size={16} style={{ color: '#3d5afe' }} />
              </div>
              <div>
                <p className="text-xs font-black" style={{ color: '#e0f2fe' }}>UPGRADE</p>
                <p className="text-[9px]" style={{ color: 'rgba(74,96,128,0.6)' }}>Unlock more tools</p>
              </div>
            </Link>

            <Link href="/tickets"
              className="flex items-center gap-3 p-4 rounded-xl transition-all duration-200"
              style={{ background: 'rgba(255,214,0,0.04)', border: '1px solid rgba(255,214,0,0.15)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.2)' }}>
                <BarChart2 size={16} style={{ color: '#ffd600' }} />
              </div>
              <div>
                <p className="text-xs font-black" style={{ color: '#e0f2fe' }}>ANALYTICS</p>
                <p className="text-[9px]" style={{ color: 'rgba(74,96,128,0.6)' }}>Sales & attendance</p>
              </div>
            </Link>

            <Link href="/subscriptions"
              className="flex items-center gap-3 p-4 rounded-xl transition-all duration-200"
              style={{ background: 'rgba(255,0,110,0.04)', border: '1px solid rgba(255,0,110,0.15)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
                <Megaphone size={16} style={{ color: '#ff006e' }} />
              </div>
              <div>
                <p className="text-xs font-black" style={{ color: '#e0f2fe' }}>BLAST</p>
                <p className="text-[9px]" style={{ color: 'rgba(74,96,128,0.6)' }}>Push notifications</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'EVENTS',   value: myEvents.length },
            { label: 'CAPACITY', value: myEvents.reduce((s, e) => s + (e.guestCount ?? 0), 0) },
            { label: 'LIVE NOW', value: myEvents.filter((e) => getStatus(e) === 'live').length },
          ].map(({ label, value }) => (
            <div key={label} className="p-3 rounded-xl text-center"
              style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}>
              <p className="text-xl font-black" style={{ color: '#e0f2fe' }}>{value}</p>
              <p className="text-[8px] font-bold tracking-[0.18em] mt-0.5" style={{ color: 'rgba(0,229,255,0.4)' }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Events list */}
        <div>
          {/* Tabs */}
          <div className="flex gap-1 mb-4">
            {(['upcoming', 'past'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className="px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all"
                style={{
                  background: tab === t ? 'rgba(0,229,255,0.1)' : 'transparent',
                  border: `1px solid ${tab === t ? 'rgba(0,229,255,0.3)' : 'rgba(0,229,255,0.08)'}`,
                  color: tab === t ? '#00e5ff' : 'rgba(74,96,128,0.6)',
                }}>
                {t.toUpperCase()} ({t === 'upcoming' ? upcoming.length : past.length})
              </button>
            ))}
          </div>

          {eventsLoading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
            </div>
          ) : displayed.length === 0 ? (
            <div className="py-12 text-center">
              <Calendar size={32} className="mx-auto mb-3" style={{ color: 'rgba(74,96,128,0.25)' }} />
              <p className="text-[11px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.4)' }}>
                {tab === 'upcoming' ? 'NO UPCOMING EVENTS' : 'NO PAST EVENTS'}
              </p>
              {tab === 'upcoming' && (
                <Link href="/events/create"
                  className="inline-flex items-center gap-1.5 mt-4 px-5 py-2.5 rounded-xl text-xs font-black"
                  style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', color: '#00e5ff', letterSpacing: '0.1em' }}>
                  <Plus size={12} /> CREATE YOUR FIRST EVENT
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {displayed.map((event) => {
                const status = getStatus(event)
                const sc = STATUS_CONFIG[status]!
                const tc = TYPE_COLOR[event.type] ?? '#00e5ff'
                const StatusIcon = sc.icon
                return (
                  <div key={event.id} className="rounded-2xl overflow-hidden"
                    style={{ background: 'rgba(0,229,255,0.02)', border: '1px solid rgba(0,229,255,0.1)' }}>
                    {/* Top strip */}
                    <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${tc}, transparent)` }} />

                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="flex items-center gap-1 text-[9px] font-black tracking-wide"
                              style={{ color: sc.color }}>
                              <StatusIcon size={10} />
                              {sc.label}
                            </span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded"
                              style={{ color: tc, background: `${tc}12`, border: `1px solid ${tc}25` }}>
                              {event.type.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-sm font-black leading-tight truncate" style={{ color: '#e0f2fe' }}>{event.name}</p>
                          <p className="text-[10px] mt-1" style={{ color: 'rgba(74,96,128,0.6)' }}>
                            {formatShortDate(event.startsAt)} · {event.neighbourhood}
                          </p>
                        </div>

                        <Link href={`/events/${event.id}`}
                          className="p-2 rounded-lg shrink-0 transition-all"
                          style={{ border: '1px solid rgba(0,229,255,0.15)', color: 'rgba(0,229,255,0.5)' }}>
                          <ChevronRight size={14} />
                        </Link>
                      </div>

                      {/* Attendance bar */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1">
                            <Users size={9} style={{ color: 'rgba(0,229,255,0.4)' }} />
                            <span className="text-[9px] font-bold" style={{ color: 'rgba(0,229,255,0.4)' }}>GUESTS</span>
                          </div>
                          <span className="text-[10px] font-black" style={{ color: '#e0f2fe' }}>
                            {event.guestCount ?? 0} / {event.capacity}
                          </span>
                        </div>
                        <div className="h-1 rounded-full" style={{ background: 'rgba(0,229,255,0.07)' }}>
                          <div className="h-1 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, Math.round(((event.guestCount ?? 0) / event.capacity) * 100))}%`,
                              background: tc,
                              boxShadow: `0 0 6px ${tc}60`,
                            }} />
                        </div>
                      </div>

                      {/* Host action buttons */}
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <Link href={`/events/${event.id}/scan`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black transition-all"
                          style={{ border: '1px solid rgba(0,229,255,0.25)', color: '#00e5ff', letterSpacing: '0.08em' }}>
                          <QrCode size={10} /> SCAN
                        </Link>
                        <Link href={`/events/${event.id}/edit`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black transition-all"
                          style={{ border: '1px solid rgba(0,229,255,0.12)', color: 'rgba(0,229,255,0.55)', letterSpacing: '0.08em' }}>
                          <Edit3 size={10} /> EDIT
                        </Link>
                        <Link href={`/events/${event.id}?tab=guests`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black transition-all"
                          style={{ border: '1px solid rgba(0,229,255,0.12)', color: 'rgba(0,229,255,0.55)', letterSpacing: '0.08em' }}>
                          <Users size={10} /> GUESTS
                        </Link>
                        <Link href={`/events/${event.id}?blast=1`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black transition-all"
                          style={{ border: '1px solid rgba(255,0,110,0.2)', color: 'rgba(255,0,110,0.7)', letterSpacing: '0.08em' }}>
                          <Megaphone size={10} /> BLAST
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
