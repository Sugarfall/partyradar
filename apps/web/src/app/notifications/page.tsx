'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Bell } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationType =
  | 'RSVP_CONFIRMED'
  | 'INVITE_RECEIVED'
  | 'EVENT_REMINDER'
  | 'CELEBRITY_NEARBY'
  | 'EVENT_UPDATED'
  | 'PARTY_BLAST'
  | 'FOLLOW'
  | 'NUDGE'
  | 'GO_OUT_REQUEST'
  | 'GO_OUT_ACCEPTED'
  | 'PROFILE_VIEW'

interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  read: boolean
  createdAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_EMOJI: Record<NotificationType, string> = {
  RSVP_CONFIRMED:  '🎟️',
  INVITE_RECEIVED: '✉️',
  EVENT_REMINDER:  '⏰',
  CELEBRITY_NEARBY:'⭐',
  EVENT_UPDATED:   '📢',
  PARTY_BLAST:     '🎉',
  FOLLOW:          '👤',
  NUDGE:           '👋',
  GO_OUT_REQUEST:  '🍻',
  GO_OUT_ACCEPTED: '✅',
  PROFILE_VIEW:    '👁️',
}

const TYPE_COLOR: Record<NotificationType, string> = {
  RSVP_CONFIRMED:   'rgba(var(--accent-rgb),0.12)',
  INVITE_RECEIVED:  'rgba(59,130,246,0.12)',
  EVENT_REMINDER:   'rgba(245,158,11,0.12)',
  CELEBRITY_NEARBY: 'rgba(255,214,0,0.12)',
  EVENT_UPDATED:    'rgba(168,85,247,0.12)',
  PARTY_BLAST:      'rgba(236,72,153,0.12)',
  FOLLOW:           'rgba(var(--accent-rgb),0.12)',
  NUDGE:            'rgba(6,182,212,0.12)',
  GO_OUT_REQUEST:   'rgba(245,158,11,0.12)',
  GO_OUT_ACCEPTED:  'rgba(var(--accent-rgb),0.12)',
  PROFILE_VIEW:     'rgba(168,85,247,0.12)',
}

const TYPE_BORDER: Record<NotificationType, string> = {
  RSVP_CONFIRMED:   'rgba(var(--accent-rgb),0.25)',
  INVITE_RECEIVED:  'rgba(59,130,246,0.25)',
  EVENT_REMINDER:   'rgba(245,158,11,0.25)',
  CELEBRITY_NEARBY: 'rgba(255,214,0,0.25)',
  EVENT_UPDATED:    'rgba(168,85,247,0.25)',
  PARTY_BLAST:      'rgba(236,72,153,0.25)',
  FOLLOW:           'rgba(var(--accent-rgb),0.25)',
  NUDGE:            'rgba(6,182,212,0.25)',
  GO_OUT_REQUEST:   'rgba(245,158,11,0.25)',
  GO_OUT_ACCEPTED:  'rgba(var(--accent-rgb),0.25)',
  PROFILE_VIEW:     'rgba(168,85,247,0.25)',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { dbUser } = useAuth()

  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading]             = useState(true)
  const [markingAll, setMarkingAll]       = useState(false)

  useEffect(() => {
    if (!dbUser) return
    async function load() {
      setLoading(true)
      try {
        const res = await api.get<{ data: AppNotification[] }>('/notifications?limit=50')
        if (res?.data) setNotifications(res.data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [dbUser])

  async function handleMarkAllRead() {
    setMarkingAll(true)
    try {
      await api.put('/notifications/read-all', {})
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    } finally {
      setMarkingAll(false)
    }
  }

  async function handleRead(id: string) {
    // optimistic
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    )
    try {
      await api.put(`/notifications/${id}/read`, {})
    } catch {
      // revert on failure
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: false } : n)
      )
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  // ── Auth gate ──────────────────────────────────────────────────────────────

  if (!dbUser) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ paddingTop: 56, paddingBottom: 88, background: '#04040d' }}
      >
        <div className="text-center space-y-4 px-8">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
            style={{ background: 'rgba(var(--accent-rgb),0.05)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}
          >
            <Bell size={28} style={{ color: 'rgba(var(--accent-rgb),0.3)' }} />
          </div>
          <p className="text-sm font-black tracking-widest" style={{ color: 'rgba(224,242,254,0.5)' }}>
            LOG IN TO VIEW NOTIFICATIONS
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-2.5 rounded-xl text-xs font-black"
            style={{
              background: 'rgba(var(--accent-rgb),0.1)',
              border: '1px solid rgba(var(--accent-rgb),0.3)',
              color: 'var(--accent)',
              letterSpacing: '0.1em',
            }}
          >
            LOG IN
          </a>
        </div>
      </div>
    )
  }

  // ── Main ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#04040d', minHeight: '100vh', paddingTop: 56, paddingBottom: 88 }}>

      {/* Header */}
      <div
        className="px-4 py-4 sticky top-14 z-10"
        style={{
          background: 'rgba(4,4,13,0.92)',
          borderBottom: '1px solid rgba(var(--accent-rgb),0.1)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Bell + badge */}
          <div className="relative shrink-0">
            <Bell
              size={16}
              style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 6px rgba(var(--accent-rgb),0.7))' }}
            />
            {unreadCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 rounded-full text-[8px] font-black flex items-center justify-center px-0.5"
                style={{ background: '#ff006e', color: '#fff' }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>

          <h1
            className="text-sm font-black tracking-widest flex-1"
            style={{ color: 'var(--accent)', textShadow: '0 0 16px rgba(var(--accent-rgb),0.4)', letterSpacing: '0.2em' }}
          >
            NOTIFICATIONS
          </h1>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
              style={{
                background: 'rgba(var(--accent-rgb),0.08)',
                border: '1px solid rgba(var(--accent-rgb),0.2)',
                color: 'var(--accent)',
              }}
            >
              {markingAll ? 'Marking…' : 'Mark All Read'}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }}
          />
          <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
            LOADING NOTIFICATIONS…
          </p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
            style={{ background: 'rgba(var(--accent-rgb),0.05)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
          >
            <Bell size={28} style={{ color: 'rgba(var(--accent-rgb),0.2)' }} />
          </div>
          <p className="text-sm font-black tracking-widest mb-2" style={{ color: 'rgba(224,242,254,0.4)' }}>
            ALL CLEAR
          </p>
          <p className="text-xs" style={{ color: 'rgba(74,96,128,0.6)' }}>
            You have no notifications yet. Stay active to start receiving updates.
          </p>
        </div>
      ) : (
        <div className="max-w-lg mx-auto px-4 py-4 space-y-2">
          {notifications.map(notif => (
            <button
              key={notif.id}
              onClick={() => !notif.read && handleRead(notif.id)}
              className="w-full text-left rounded-2xl overflow-hidden transition-all duration-150"
              style={{
                background: notif.read
                  ? 'rgba(24,24,27,0.7)'
                  : 'rgba(24,24,27,0.95)',
                border: notif.read
                  ? '1px solid rgba(var(--accent-rgb),0.06)'
                  : '1px solid rgba(var(--accent-rgb),0.14)',
                opacity: notif.read ? 0.75 : 1,
              }}
            >
              <div className="flex items-start gap-3 px-4 py-3.5">
                {/* Type icon */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                  style={{
                    background: TYPE_COLOR[notif.type] ?? 'rgba(var(--accent-rgb),0.08)',
                    border: `1px solid ${TYPE_BORDER[notif.type] ?? 'rgba(var(--accent-rgb),0.2)'}`,
                  }}
                >
                  {TYPE_EMOJI[notif.type] ?? '🔔'}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className="text-xs font-black leading-tight"
                      style={{ color: notif.read ? 'rgba(224,242,254,0.6)' : '#e0f2fe' }}
                    >
                      {notif.title}
                    </p>
                    <span
                      className="text-[9px] shrink-0"
                      style={{ color: 'rgba(224,242,254,0.25)' }}
                    >
                      {timeAgo(notif.createdAt)}
                    </span>
                  </div>
                  <p
                    className="text-[10px] mt-0.5 leading-snug"
                    style={{ color: notif.read ? 'rgba(224,242,254,0.3)' : 'rgba(224,242,254,0.55)' }}
                  >
                    {notif.body}
                  </p>
                </div>

                {/* Unread dot */}
                {!notif.read && (
                  <div
                    className="w-2 h-2 rounded-full shrink-0 mt-1"
                    style={{ background: 'var(--accent)', boxShadow: '0 0 6px rgba(var(--accent-rgb),0.8)' }}
                  />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
