'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MessageCircle, Calendar, ChevronRight, Zap } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { API_URL as API_BASE } from '@/lib/api'

interface EventChat {
  id: string
  name: string
  startsAt: string
  coverImageUrl?: string
  type: string
  _count?: { messages: number }
  host: { displayName: string; photoUrl?: string }
}

function timeUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff < 0) return 'Past'
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(h / 24)
  if (d > 0) return `in ${d}d`
  if (h > 0) return `in ${h}h`
  return 'Tonight'
}

const TYPE_COLORS: Record<string, string> = {
  HOME_PARTY: '#ff006e',
  CLUB_NIGHT: '#00e5ff',
  CONCERT: '#3d5afe',
}

export default function MessagesPage() {
  const { dbUser } = useAuth()
  const [chats, setChats] = useState<EventChat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        // Fetch events user has RSVPd to (confirmed) — these are their active chat rooms
        const token = typeof window !== 'undefined'
          ? localStorage.getItem('partyradar_mock_session') ?? ''
          : ''
        const res = await fetch(`${API_BASE}/events?rsvp=confirmed&limit=30`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (res.ok) {
          const json = await res.json()
          setChats(json.data ?? json ?? [])
        }
      } catch {
        // show empty state
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [dbUser])

  return (
    <div className="min-h-screen pb-28" style={{ background: '#04040d', paddingTop: 56 }}>
      {/* Header */}
      <div className="px-4 pt-6 pb-4 max-w-xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle size={16} style={{ color: '#00e5ff' }} />
          <h1 className="text-lg font-black tracking-widest" style={{ color: '#e0f2fe' }}>MESSAGES</h1>
        </div>
        <p className="text-xs" style={{ color: 'rgba(224,242,254,0.35)' }}>Group chats for events you're attending</p>
      </div>

      <div className="px-4 max-w-xl mx-auto space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'rgba(0,229,255,0.04)' }} />
          ))
        ) : chats.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.1)' }}>
              <MessageCircle size={24} style={{ color: 'rgba(0,229,255,0.3)' }} />
            </div>
            <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>NO CHATS YET</p>
            <p className="text-[11px] text-center" style={{ color: 'rgba(224,242,254,0.3)' }}>
              RSVP to events to join their group chat
            </p>
            <Link href="/discover"
              className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black"
              style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}>
              <Zap size={11} /> DISCOVER EVENTS
            </Link>
          </div>
        ) : (
          chats.map((event) => {
            const color = TYPE_COLORS[event.type] ?? '#00e5ff'
            return (
              <Link key={event.id} href={`/events/${event.id}`}
                className="flex items-center gap-3 p-3 rounded-2xl transition-all"
                style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(0,229,255,0.08)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,229,255,0.2)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,229,255,0.08)' }}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  {event.coverImageUrl ? (
                    <img src={event.coverImageUrl} alt="" className="w-12 h-12 rounded-xl object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                      <Calendar size={18} style={{ color }} />
                    </div>
                  )}
                  {/* Live dot for upcoming */}
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 flex items-center justify-center"
                    style={{ background: color, borderColor: '#04040d', boxShadow: `0 0 6px ${color}` }} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{event.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                      style={{ color, background: `${color}12`, border: `1px solid ${color}25` }}>
                      {event.type.replace('_', ' ')}
                    </span>
                    <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.35)' }}>
                      {timeUntil(event.startsAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0" style={{ color: 'rgba(0,229,255,0.3)' }}>
                  <MessageCircle size={13} />
                  <ChevronRight size={13} />
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
