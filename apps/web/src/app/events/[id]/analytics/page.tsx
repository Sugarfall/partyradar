'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Users, Ticket, Star, TrendingUp, CheckSquare,
  Eye, MousePointerClick, BarChart2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useEvent } from '@/hooks/useEvents'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color = 'var(--accent)', icon: Icon,
}: {
  label: string; value: string | number; sub?: string; color?: string; icon: any
}) {
  return (
    <div className="p-4 rounded-2xl"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} style={{ color }} />
        <span className="text-[10px] font-bold tracking-widest uppercase"
          style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
      </div>
      <p className="text-2xl font-black" style={{ color: '#e0f2fe' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</p>}
    </div>
  )
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
        <span style={{ color: '#e0f2fe' }}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}80` }} />
      </div>
    </div>
  )
}

function StarRating({ value }: { value: number | null }) {
  if (!value) return <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
  return (
    <span className="flex items-center gap-1">
      <Star size={13} fill="#ffd600" style={{ color: '#ffd600' }} />
      <span className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{value.toFixed(1)}</span>
      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>/5</span>
    </span>
  )
}

// ── Simple sparkline from daily data ─────────────────────────────────────────
function DaySparkline({
  byDay, color, label,
}: {
  byDay: Record<string, number>; color: string; label: string
}) {
  const entries = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-14)
  if (!entries.length) return null
  const max = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <div>
      <p className="text-[9px] font-bold tracking-[0.15em] mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
        {label} · LAST {entries.length} DAYS
      </p>
      <div className="flex items-end gap-1 h-12">
        {entries.map(([day, val]) => (
          <div key={day} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div
              className="w-full rounded-sm transition-all duration-500"
              style={{
                height: `${Math.max(4, (val / max) * 48)}px`,
                background: color,
                opacity: 0.7,
                boxShadow: `0 0 4px ${color}60`,
              }}
            />
            {/* tooltip on hover */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
              <div className="px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap"
                style={{ background: '#04040d', border: `1px solid ${color}40`, color }}>
                {val}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
          {entries[0]?.[0]?.slice(5)}
        </span>
        <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
          {entries[entries.length - 1]?.[0]?.slice(5)}
        </span>
      </div>
    </div>
  )
}

// ── Funnel bar ────────────────────────────────────────────────────────────────
function FunnelRow({
  icon: Icon, label, value, sub, pct, color,
}: {
  icon: any; label: string; value: number; sub?: string; pct: number; color: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${color}12`, border: `1px solid ${color}25` }}>
        <Icon size={12} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold" style={{ color: '#e0f2fe' }}>{label}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black tabular-nums" style={{ color }}>{value.toLocaleString()}</span>
            {sub && <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</span>}
          </div>
        </div>
        <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-1.5 rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}60` }} />
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EventAnalyticsPage() {
  const params    = useParams()
  const router    = useRouter()
  const { dbUser, loading: authLoading } = useAuth()
  const { event, isLoading: eventLoading } = useEvent(params['id'] as string)

  const isHost = !!dbUser && event?.hostId === dbUser.id

  const { data, isLoading } = useSWR(
    isHost ? `/events/${params['id']}/analytics` : null,
    fetcher,
  )
  const analytics = data?.data

  useEffect(() => {
    if (!authLoading && !dbUser) router.push('/login')
  }, [authLoading, dbUser, router])

  useEffect(() => {
    if (!eventLoading && event && dbUser && event.hostId !== dbUser.id) {
      router.push(`/events/${params['id']}`)
    }
  }, [eventLoading, event, dbUser, router, params])

  if (authLoading || eventLoading || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  const rsvp        = analytics?.rsvpCounts ?? {}
  const totalRsvp   = analytics?.totalGuests ?? 0
  const confirmed   = analytics?.confirmedGuests ?? 0
  const waitlisted  = analytics?.waitlisted ?? 0
  const capacityPct = analytics?.capacityPct ?? 0
  const reach       = analytics?.reach

  // Reach funnel
  const totalImpressions  = reach?.impressions.total  ?? 0
  const uniqueImpressions = reach?.impressions.unique ?? 0
  const totalViews        = reach?.views.total        ?? 0
  const uniqueViews       = reach?.views.unique       ?? 0
  const ctr               = reach?.ctr                ?? 0
  const funnelMax         = Math.max(totalImpressions, 1)

  return (
    <div className="min-h-screen pt-20 pb-32 px-4" style={{ background: '#04040d' }}>
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/events/${params['id']}`}
            className="p-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <ArrowLeft size={16} style={{ color: 'rgba(255,255,255,0.5)' }} />
          </Link>
          <div>
            <h1 className="text-base font-bold" style={{ color: '#e0f2fe' }}>Analytics</h1>
            <p className="text-xs truncate max-w-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{event.name}</p>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
          </div>
        )}

        {analytics && (
          <div className="space-y-4">

            {/* ── Reach / Discovery section ─────────────────────────────── */}
            {(totalImpressions > 0 || totalViews > 0) && (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>

                {/* Section label */}
                <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                  <BarChart2 size={13} style={{ color: 'rgba(var(--accent-rgb),0.6)' }} />
                  <span className="text-[10px] font-bold tracking-widest uppercase"
                    style={{ color: 'rgba(255,255,255,0.35)' }}>Reach &amp; Discovery</span>
                </div>

                {/* Top stat row */}
                <div className="grid grid-cols-3 divide-x px-4 pb-4"
                  style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <div className="pr-4">
                    <p className="text-[9px] font-bold tracking-widest mb-1"
                      style={{ color: 'rgba(255,255,255,0.3)' }}>IMPRESSIONS</p>
                    <p className="text-xl font-black" style={{ color: '#e0f2fe' }}>
                      {totalImpressions.toLocaleString()}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {uniqueImpressions} unique
                    </p>
                  </div>
                  <div className="px-4">
                    <p className="text-[9px] font-bold tracking-widest mb-1"
                      style={{ color: 'rgba(255,255,255,0.3)' }}>PAGE VIEWS</p>
                    <p className="text-xl font-black" style={{ color: 'var(--accent)' }}>
                      {totalViews.toLocaleString()}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {uniqueViews} unique
                    </p>
                  </div>
                  <div className="pl-4">
                    <p className="text-[9px] font-bold tracking-widest mb-1"
                      style={{ color: 'rgba(255,255,255,0.3)' }}>CLICK-THROUGH</p>
                    <p className="text-xl font-black"
                      style={{ color: ctr >= 30 ? '#00ff88' : ctr >= 15 ? '#ffd600' : '#ff6b6b' }}>
                      {ctr}%
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      of views / impressions
                    </p>
                  </div>
                </div>

                {/* Funnel */}
                <div className="px-4 pb-4 space-y-3"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
                  <p className="text-[9px] font-bold tracking-widest uppercase mb-3"
                    style={{ color: 'rgba(255,255,255,0.25)' }}>Discovery funnel</p>
                  <FunnelRow
                    icon={Eye}
                    label="Saw on Discover"
                    value={totalImpressions}
                    sub={`${uniqueImpressions} unique`}
                    pct={100}
                    color="#6366f1"
                  />
                  <FunnelRow
                    icon={MousePointerClick}
                    label="Clicked / Opened Event"
                    value={totalViews}
                    sub={`${uniqueViews} unique`}
                    pct={funnelMax > 0 ? Math.round((totalViews / funnelMax) * 100) : 0}
                    color="var(--accent)"
                  />
                  <FunnelRow
                    icon={Users}
                    label="RSVPd / Got Ticket"
                    value={confirmed}
                    sub={`${event.capacity} capacity`}
                    pct={funnelMax > 0 ? Math.round((confirmed / funnelMax) * 100) : 0}
                    color="#00ff88"
                  />
                </div>

                {/* Sparklines */}
                {(Object.keys(reach?.impressions.byDay ?? {}).length > 1 ||
                  Object.keys(reach?.views.byDay ?? {}).length > 1) && (
                  <div className="grid grid-cols-2 gap-4 px-4 pb-4"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
                    <DaySparkline
                      byDay={reach?.impressions.byDay ?? {}}
                      color="#6366f1"
                      label="IMPRESSIONS"
                    />
                    <DaySparkline
                      byDay={reach?.views.byDay ?? {}}
                      color="var(--accent)"
                      label="PAGE VIEWS"
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Core stat cards ───────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={Users} label="Total RSVPs" value={totalRsvp}
                sub={`${confirmed} confirmed${waitlisted > 0 ? ` · ${waitlisted} waitlisted` : ''}`}
                color="var(--accent)" />
              <StatCard icon={TrendingUp} label="Capacity" value={`${capacityPct}%`}
                sub={`${confirmed} / ${event.capacity} spots filled`}
                color={capacityPct > 80 ? '#ff006e' : capacityPct > 50 ? '#ffd600' : '#00ff88'} />
              <StatCard icon={Ticket} label="Ticket Revenue"
                value={analytics.tickets.count > 0 ? `£${analytics.tickets.revenue.toFixed(2)}` : '—'}
                sub={analytics.tickets.count > 0
                  ? `${analytics.tickets.count} sold · ${analytics.tickets.scanned} scanned`
                  : 'Free event'}
                color="#ffd600" />
              <StatCard icon={CheckSquare} label="Check-ins"
                value={analytics.checkIns} sub="on the night" color="#00ff88" />
            </div>

            {/* ── RSVP breakdown ────────────────────────────────────────── */}
            {totalRsvp > 0 && (
              <div className="p-4 rounded-2xl space-y-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[10px] font-bold tracking-widest uppercase"
                  style={{ color: 'rgba(255,255,255,0.35)' }}>RSVP Breakdown</p>
                <MiniBar label="Confirmed"  value={rsvp['CONFIRMED']  ?? 0} max={totalRsvp} color="#00ff88" />
                <MiniBar label="Pending"    value={rsvp['PENDING']    ?? 0} max={totalRsvp} color="#ffd600" />
                {(rsvp['WAITLISTED'] ?? 0) > 0 && (
                  <MiniBar label="Waitlisted" value={rsvp['WAITLISTED'] ?? 0} max={totalRsvp} color="var(--accent)" />
                )}
                <MiniBar label="Cancelled"  value={rsvp['CANCELLED']  ?? 0} max={totalRsvp} color="#ff006e" />
              </div>
            )}

            {/* ── Reviews ───────────────────────────────────────────────── */}
            {analytics.reviews.count > 0 && (
              <div className="p-4 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[10px] font-bold tracking-widest uppercase mb-4"
                  style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Reviews · {analytics.reviews.count} total
                </p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Overall</span>
                    <StarRating value={analytics.reviews.avgRating} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Vibe</span>
                    <StarRating value={analytics.reviews.avgVibe} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Music</span>
                    <StarRating value={analytics.reviews.avgMusic} />
                  </div>
                </div>
              </div>
            )}

            {/* No data yet */}
            {totalRsvp === 0 && analytics.tickets.count === 0 && totalImpressions === 0 && (
              <div className="text-center py-12">
                <TrendingUp size={36} className="mx-auto mb-3"
                  style={{ color: 'rgba(255,255,255,0.1)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No data yet</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  Analytics will appear once your event gets activity
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
