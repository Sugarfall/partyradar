'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Zap, Compass, Radio, User, Plus, Bell, Calendar, Ticket, Star, Zap as ZapIcon, X, Trophy } from 'lucide-react'
import useSWR from 'swr'
import { fetcher, api } from '@/lib/api'
import type { Notification } from '@partyradar/shared'

const navLinks = [
  { href: '/discover',    label: 'Discover', icon: Compass, short: 'DISC' },
  { href: '/radar',       label: 'Radar',    icon: Radio,   short: 'RADR' },
  { href: '/leaderboard', label: 'Ranks',    icon: Trophy,  short: 'RANK' },
  { href: '/host',        label: 'Host',     icon: Plus,    short: 'HOST', authOnly: true },
]

const NOTIF_ICONS: Record<string, React.ReactNode> = {
  RSVP_CONFIRMED:    <Ticket size={13} style={{ color: '#00ff88' }} />,
  INVITE_RECEIVED:   <ZapIcon size={13} style={{ color: '#00e5ff' }} />,
  EVENT_REMINDER:    <Calendar size={13} style={{ color: '#ffd600' }} />,
  CELEBRITY_NEARBY:  <Star size={13} style={{ color: '#ffd600' }} />,
  EVENT_UPDATED:     <ZapIcon size={13} style={{ color: '#3d5afe' }} />,
}

function timeAgo(date: string) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { data, mutate } = useSWR<{ data: Notification[]; unreadCount: number }>(
    '/notifications?limit=15',
    fetcher
  )
  const notifications = data?.data ?? []

  async function markRead(id: string) {
    try {
      await api.put(`/notifications/${id}/read`, {})
      mutate()
    } catch {}
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.read)
    await Promise.allSettled(unread.map((n) => api.put(`/notifications/${n.id}/read`, {})))
    mutate()
  }

  return (
    <div
      className="absolute top-full right-0 mt-2 w-80 rounded-2xl overflow-hidden z-50"
      style={{
        background: 'rgba(7,7,26,0.98)',
        border: '1px solid rgba(0,229,255,0.15)',
        boxShadow: '0 0 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,229,255,0.05)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
        <div className="flex items-center gap-2">
          <Bell size={13} style={{ color: '#00e5ff' }} />
          <span className="text-xs font-black tracking-widest" style={{ color: '#00e5ff' }}>NOTIFICATIONS</span>
        </div>
        <div className="flex items-center gap-2">
          {notifications.some((n) => !n.read) && (
            <button onClick={markAllRead}
              className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded"
              style={{ color: 'rgba(0,229,255,0.5)', border: '1px solid rgba(0,229,255,0.15)' }}>
              MARK ALL READ
            </button>
          )}
          <button onClick={onClose} style={{ color: 'rgba(74,96,128,0.6)' }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="py-10 text-center">
            <Bell size={24} className="mx-auto mb-2" style={{ color: 'rgba(74,96,128,0.3)' }} />
            <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.4)' }}>
              NO NOTIFICATIONS
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => markRead(n.id)}
              className="w-full text-left px-4 py-3 flex items-start gap-3 transition-all"
              style={{
                background: n.read ? 'transparent' : 'rgba(0,229,255,0.03)',
                borderBottom: '1px solid rgba(0,229,255,0.05)',
              }}
            >
              {/* Icon */}
              <div className="mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.1)' }}>
                {NOTIF_ICONS[n.type] ?? <Bell size={13} style={{ color: '#00e5ff' }} />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold leading-tight"
                  style={{ color: n.read ? 'rgba(224,242,254,0.5)' : '#e0f2fe' }}>
                  {n.title}
                </p>
                <p className="text-[10px] mt-0.5 leading-relaxed"
                  style={{ color: 'rgba(224,242,254,0.35)' }}>
                  {n.body}
                </p>
                <p className="text-[9px] mt-1 font-bold tracking-wide"
                  style={{ color: 'rgba(74,96,128,0.5)' }}>
                  {timeAgo(n.createdAt)}
                </p>
              </div>

              {/* Unread dot */}
              {!n.read && (
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                  style={{ background: '#00e5ff', boxShadow: '0 0 6px rgba(0,229,255,0.8)' }} />
              )}
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid rgba(0,229,255,0.08)' }}>
        <Link href="/profile"
          onClick={onClose}
          className="block text-center py-2.5 text-[10px] font-black tracking-widest transition-all"
          style={{ color: 'rgba(0,229,255,0.4)' }}>
          VIEW ALL IN PROFILE →
        </Link>
      </div>
    </div>
  )
}

export default function Navbar() {
  const pathname = usePathname()
  if (pathname === '/') return null
  return <NavbarInner />
}

function NavbarInner() {
  const pathname = usePathname()
  const { dbUser } = useAuth()
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  const { data: notifData } = useSWR(
    dbUser ? '/notifications?limit=1' : null,
    fetcher,
    { refreshInterval: 30000 }
  )
  const unreadCount = notifData?.unreadCount ?? 0

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    if (notifOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  return (
    <>
      {/* Top bar */}
      <nav
        className="fixed top-0 inset-x-0 z-50 h-14"
        style={{
          background: 'rgba(4,4,13,0.88)',
          backdropFilter: 'blur(18px)',
          borderBottom: '1px solid rgba(0,229,255,0.1)',
          boxShadow: '0 1px 0 rgba(0,229,255,0.05), 0 4px 30px rgba(0,0,0,0.7)',
        }}
      >
        <div
          className="absolute top-0 inset-x-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(0,229,255,0.55) 50%, transparent 100%)' }}
        />

        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between gap-4">
          <Link href="/discover" className="flex items-center gap-2 shrink-0 group">
            <Zap size={18} fill="rgba(0,229,255,0.2)" style={{ color: '#00e5ff', filter: 'drop-shadow(0 0 6px rgba(0,229,255,0.7))' }} />
            <span className="font-bold text-sm" style={{ color: '#00e5ff', textShadow: '0 0 16px rgba(0,229,255,0.65)', letterSpacing: '0.18em' }}>
              PARTYRADAR
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.filter(({ authOnly }) => !authOnly || dbUser).map(({ href, short, icon: Icon }) => {
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className="relative flex items-center gap-2 px-4 py-1.5 rounded text-xs font-bold transition-all duration-200"
                  style={{
                    letterSpacing: '0.13em',
                    color: active ? '#00e5ff' : 'rgba(74,96,128,0.85)',
                    background: active ? 'rgba(0,229,255,0.07)' : 'transparent',
                    border: active ? '1px solid rgba(0,229,255,0.22)' : '1px solid transparent',
                    textShadow: active ? '0 0 10px rgba(0,229,255,0.65)' : 'none',
                  }}
                >
                  <Icon size={12} />
                  {short}
                  {active && (
                    <span className="absolute bottom-0 left-4 right-4 h-px"
                      style={{ background: 'linear-gradient(90deg, transparent, #00e5ff, transparent)' }} />
                  )}
                </Link>
              )
            })}
          </div>

          <div className="flex items-center gap-2">
            {dbUser ? (
              <>
                <Link href="/host" className="hidden sm:flex btn-primary text-xs px-3 py-1.5" style={{ letterSpacing: '0.1em' }}>
                  <Plus size={12} />HOST
                </Link>

                {/* Notifications bell */}
                <div ref={notifRef} className="relative">
                  <button
                    onClick={() => setNotifOpen((o) => !o)}
                    className="relative p-1.5 rounded transition-all duration-200"
                    style={{ border: `1px solid ${notifOpen ? 'rgba(0,229,255,0.3)' : 'rgba(0,229,255,0.15)'}`, background: notifOpen ? 'rgba(0,229,255,0.08)' : 'transparent' }}>
                    <Bell size={15} style={{ color: '#00e5ff' }} />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 text-[9px] rounded-full flex items-center justify-center font-bold"
                        style={{ background: '#00ff88', color: '#04040d', boxShadow: '0 0 8px rgba(0,255,136,0.6)' }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
                </div>

                <Link href="/profile" className="relative p-1.5 rounded transition-all duration-200" style={{ border: '1px solid rgba(0,229,255,0.15)' }}>
                  {dbUser.photoUrl
                    ? <img src={dbUser.photoUrl} alt="Profile" className="w-7 h-7 rounded object-cover" style={{ boxShadow: '0 0 8px rgba(0,229,255,0.3)' }} />
                    : <User size={16} style={{ color: '#00e5ff' }} />}
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className="btn-secondary text-xs px-3 py-1.5" style={{ letterSpacing: '0.1em' }}>LOG IN</Link>
                <Link href="/register" className="btn-primary text-xs px-3 py-1.5" style={{ letterSpacing: '0.1em' }}>JOIN</Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-50 h-16"
        style={{ background: 'rgba(4,4,13,0.96)', borderTop: '1px solid rgba(0,229,255,0.1)', backdropFilter: 'blur(18px)' }}
      >
        <div className="absolute top-0 inset-x-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(0,229,255,0.45) 50%, transparent 100%)' }} />

        <div className="flex h-full">
          {/* Discover + Radar — always visible */}
          {navLinks.filter(({ authOnly }) => !authOnly).map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className="relative flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200"
                style={{ color: active ? '#00e5ff' : 'rgba(74,96,128,0.7)', textShadow: active ? '0 0 10px rgba(0,229,255,0.7)' : 'none' }}>
                {active && <div className="absolute top-0 w-8 h-0.5 rounded-b" style={{ background: '#00e5ff', boxShadow: '0 0 8px rgba(0,229,255,0.8)' }} />}
                <Icon size={17} strokeWidth={active ? 2.5 : 1.5} />
                <span className="text-[9px] font-bold tracking-widest">{label.toUpperCase()}</span>
              </Link>
            )
          })}

          {/* Auth-gated links */}
          {dbUser ? (
            <>
              {/* HOST */}
              {(() => {
                const active = pathname.startsWith('/host') || pathname.startsWith('/events/create')
                return (
                  <Link href="/host"
                    className="relative flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200"
                    style={{ color: active ? '#00e5ff' : 'rgba(74,96,128,0.7)', textShadow: active ? '0 0 10px rgba(0,229,255,0.7)' : 'none' }}>
                    {active && <div className="absolute top-0 w-8 h-0.5 rounded-b" style={{ background: '#00e5ff', boxShadow: '0 0 8px rgba(0,229,255,0.8)' }} />}
                    <Plus size={17} strokeWidth={active ? 2.5 : 1.5} />
                    <span className="text-[9px] font-bold tracking-widest">HOST</span>
                  </Link>
                )
              })()}

              {/* PROFILE */}
              {(() => {
                const active = pathname.startsWith('/profile')
                return (
                  <Link href="/profile"
                    className="relative flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200"
                    style={{ color: active ? '#00e5ff' : 'rgba(74,96,128,0.7)', textShadow: active ? '0 0 10px rgba(0,229,255,0.7)' : 'none' }}>
                    {active && <div className="absolute top-0 w-8 h-0.5 rounded-b" style={{ background: '#00e5ff', boxShadow: '0 0 8px rgba(0,229,255,0.8)' }} />}
                    {unreadCount > 0 && (
                      <span className="absolute top-2 right-1/4 w-3.5 h-3.5 text-[8px] rounded-full flex items-center justify-center font-bold"
                        style={{ background: '#00ff88', color: '#04040d' }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                    )}
                    <User size={17} strokeWidth={active ? 2.5 : 1.5} />
                    <span className="text-[9px] font-bold tracking-widest">PROFILE</span>
                  </Link>
                )
              })()}
            </>
          ) : (
            <Link href="/login"
              className="relative flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200"
              style={{ color: 'rgba(74,96,128,0.7)' }}>
              <User size={17} strokeWidth={1.5} />
              <span className="text-[9px] font-bold tracking-widest">SIGN IN</span>
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
