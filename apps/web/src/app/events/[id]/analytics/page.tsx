'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users, Ticket, Star, TrendingUp, CheckSquare } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useEvent } from '@/hooks/useEvents'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'

function StatCard({ label, value, sub, color = '#00e5ff', icon: Icon }: {
  label: string; value: string | number; sub?: string; color?: string; icon: any
}) {
  return (
    <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} style={{ color }} />
        <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
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

export default function EventAnalyticsPage() {
  const params = useParams()
  const router = useRouter()
  const { dbUser, loading: authLoading } = useAuth()
  const { event, isLoading: eventLoading } = useEvent(params['id'] as string)

  const isHost = !!dbUser && event?.hostId === dbUser.id

  const { data, isLoading } = useSWR(
    isHost ? `/events/${params['id']}/analytics` : null,
    fetcher
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
          style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
      </div>
    )
  }

  const rsvp = analytics?.rsvpCounts ?? {}
  const totalRsvp = analytics?.totalGuests ?? 0
  const confirmed = analytics?.confirmedGuests ?? 0
  const waitlisted = analytics?.waitlisted ?? 0
  const capacityPct = analytics?.capacityPct ?? 0

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
              style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
          </div>
        )}

        {analytics && (
          <div className="space-y-4">
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={Users} label="Total RSVPs" value={totalRsvp}
                sub={`${confirmed} confirmed${waitlisted > 0 ? ` · ${waitlisted} waitlisted` : ''}`} color="#00e5ff" />
              <StatCard icon={TrendingUp} label="Capacity" value={`${capacityPct}%`}
                sub={`${confirmed} / ${event.capacity} spots filled`}
                color={capacityPct > 80 ? '#ff006e' : capacityPct > 50 ? '#ffd600' : '#00ff88'} />
              <StatCard icon={Ticket} label="Ticket Revenue"
                value={analytics.tickets.count > 0 ? `£${analytics.tickets.revenue.toFixed(2)}` : '—'}
                sub={analytics.tickets.count > 0 ? `${analytics.tickets.count} sold · ${analytics.tickets.scanned} scanned` : 'Free event'} color="#ffd600" />
              <StatCard icon={CheckSquare} label="Check-ins" value={analytics.checkIns}
                sub="on the night" color="#00ff88" />
            </div>

            {/* RSVP breakdown */}
            {totalRsvp > 0 && (
              <div className="p-4 rounded-2xl space-y-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>RSVP Breakdown</p>
                <MiniBar label="Confirmed" value={rsvp['CONFIRMED'] ?? 0} max={totalRsvp} color="#00ff88" />
                <MiniBar label="Pending" value={rsvp['PENDING'] ?? 0} max={totalRsvp} color="#ffd600" />
                {(rsvp['WAITLISTED'] ?? 0) > 0 && <MiniBar label="Waitlisted" value={rsvp['WAITLISTED'] ?? 0} max={totalRsvp} color="#00e5ff" />}
                <MiniBar label="Cancelled" value={rsvp['CANCELLED'] ?? 0} max={totalRsvp} color="#ff006e" />
              </div>
            )}

            {/* Reviews */}
            {analytics.reviews.count > 0 && (
              <div className="p-4 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-[10px] font-bold tracking-widest uppercase mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
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
            {totalRsvp === 0 && analytics.tickets.count === 0 && (
              <div className="text-center py-12">
                <TrendingUp size={36} className="mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No data yet</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Analytics will appear once guests start RSVPing</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
