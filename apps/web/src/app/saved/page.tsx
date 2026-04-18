'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bookmark, Calendar, MapPin, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'

const TYPE_COLORS: Record<string, string> = {
  HOME_PARTY: '#ff006e',
  CLUB_NIGHT: '#a855f7',
  CONCERT: '#3b82f6',
  PUB_NIGHT: '#f59e0b',
}

const TYPE_LABELS: Record<string, string> = {
  HOME_PARTY: 'House Party',
  CLUB_NIGHT: 'Club Night',
  CONCERT: 'Concert',
  PUB_NIGHT: 'Pub Night',
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function SavedEventsPage() {
  const { dbUser, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !dbUser) router.push('/login')
  }, [loading, dbUser, router])

  const { data, isLoading } = useSWR(
    dbUser ? '/events/saved' : null,
    fetcher
  )

  const events = data?.data ?? []

  if (loading || !dbUser) return null

  return (
    <div className="min-h-screen pt-20 pb-32 px-4" style={{ background: '#04040d' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,214,0,0.1)', border: '1px solid rgba(255,214,0,0.2)' }}>
            <Bookmark size={16} style={{ color: '#ffd600' }} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: '#e0f2fe' }}>Saved Events</h1>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Events you&apos;ve bookmarked</p>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <div className="text-center py-20">
            <Bookmark size={40} className="mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-sm font-medium mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>No saved events yet</p>
            <p className="text-xs mb-6" style={{ color: 'rgba(255,255,255,0.2)' }}>Tap the bookmark icon on any event to save it</p>
            <Link href="/discover"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>
              Explore Events
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {events.map((event: any) => {
            const color = TYPE_COLORS[event.type] ?? 'var(--accent)'
            const isFree = event.price === 0
            return (
              <Link key={event.id} href={`/events/${event.id}`}
                className="block rounded-2xl overflow-hidden transition-all duration-200 hover:scale-[1.01]"
                style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.07)` }}>
                <div className="flex gap-0">
                  {/* Color bar */}
                  <div className="w-1 shrink-0" style={{ background: color }} />
                  {/* Content */}
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-bold tracking-widest mb-1 block"
                          style={{ color }}>
                          {TYPE_LABELS[event.type]}
                        </span>
                        <h3 className="text-sm font-bold leading-tight truncate" style={{ color: '#e0f2fe' }}>
                          {event.name}
                        </h3>
                      </div>
                      <span className="text-sm font-bold shrink-0"
                        style={{ color: isFree ? '#00ff88' : '#e0f2fe' }}>
                        {isFree ? 'FREE' : `£${event.price}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        <Calendar size={11} /> {formatDate(event.startsAt)}
                      </span>
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        <MapPin size={11} /> {event.neighbourhood ?? event.address}
                      </span>
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        <Users size={11} /> {event.guestCount ?? 0} going
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
