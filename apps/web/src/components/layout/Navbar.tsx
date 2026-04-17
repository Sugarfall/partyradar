'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Zap, Compass, Radio, User, Plus, Bell, Calendar, Ticket, Star, X, Building2, MessageCircle, Gift, BarChart3, TrendingUp, UserPlus, Eye, Sparkles, Users, Heart } from 'lucide-react'
import useSWR from 'swr'
import { fetcher, api } from '@/lib/api'
import type { Notification } from '@partyradar/shared'

// ── Desktop nav links ────────────────────────────────────────────────────────
const NAV = [
  { href: '/discover', label: 'Discover', icon: Compass },
  { href: '/radar',    label: 'Radar',    icon: Radio   },
  { href: '/nearby',   label: 'Nearby',   icon: Users   },
]

// ── Mobile bottom tabs ───────────────────────────────────────────────────────
const MOBILE_NAV = [
  { href: '/discover', label: 'Discover', icon: Compass },
  { href: '/radar',    label: 'Radar',    icon: Radio   },
  { href: '/nearby',   label: 'Nearby',   icon: Users   },
  { href: '/match',    label: 'Match',    icon: Heart   },
]

const NOTIF_ICONS: Record<string, React.ReactNode> = {
  RSVP_CONFIRMED:   <Ticket   size={13} style={{ color: '#00ff88' }} />,
  INVITE_RECEIVED:  <Zap      size={13} style={{ color: '#00e5ff' }} />,
  EVENT_REMINDER:   <Calendar size={13} style={{ color: '#ffd600' }} />,
  CELEBRITY_NEARBY: <Star     size={13} style={{ color: '#ffd600' }} />,
  EVENT_UPDATED:    <Zap      size={13} style={{ color: '#3d5afe' }} />,
  FOLLOW:           <UserPlus size={13} style={{ color: '#00e5ff' }} />,
  PROFILE_VIEW:     <Eye      size={13} style={{ color: '#a855f7' }} />,
  NUDGE:            <Bell     size={13} style={{ color: '#00ff88' }} />,
  GO_OUT_REQUEST:   <Sparkles size={13} style={{ color: '#ff006e' }} />,
  GO_OUT_ACCEPTED:  <Sparkles size={13} style={{ color: '#00ff88' }} />,
  MESSAGE:          <MessageCircle size={13} style={{ color: '#00e5ff' }} />,
}

function notifLink(n: Notification): string | null {
  const data = n.data as Record<string, string> | null
  if (!data) return null
  const social = ['FOLLOW', 'NUDGE', 'GO_OUT_REQUEST', 'GO_OUT_ACCEPTED']
  if (social.includes(n.type) && data['fromUsername']) return `/profile/${data['fromUsername']}`
  // PROFILE_VIEW → own profile page to see viewers
  if (n.type === 'PROFILE_VIEW') return '/profile'
  return null
}

function timeAgo(date: string) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Notifications panel ──────────────────────────────────────────────────────
function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { data, mutate } = useSWR<{ data: Notification[]; unreadCount: number }>(
    '/notifications?limit=20', fetcher
  )
  const notifications = data?.data ?? []
  const router = useRouter()

  async function markAll() {
    await Promise.allSettled(
      notifications.filter((n) => !n.read).map((n) => api.put(`/notifications/${n.id}/read`, {}))
    )
    mutate()
  }

  async function handleClick(n: Notification) {
    await api.put(`/notifications/${n.id}/read`, {}).catch(() => {})
    mutate()
    const link = notifLink(n)
    if (link) { onClose(); router.push(link) }
  }

  return (
    <div
      className="absolute top-full right-0 mt-2 w-72 rounded-2xl overflow-hidden z-50"
      style={{
        background: 'rgba(7,7,26,0.98)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-xs font-semibold" style={{ color: '#e0f2fe' }}>Notifications</span>
        <div className="flex items-center gap-3">
          {notifications.some((n) => !n.read) && (
            <button onClick={markAll} className="text-[10px]" style={{ color: 'rgba(0,229,255,0.6)' }}>
              Mark all read
            </button>
          )}
          <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.3)' }}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="py-10 text-center">
            <Bell size={22} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.15)' }} />
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>All caught up</p>
          </div>
        ) : notifications.map((n) => (
          <button key={n.id}
            onClick={() => handleClick(n)}
            className="w-full text-left px-4 py-3 flex items-start gap-3 transition-all hover:bg-white/5"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
          >
            <div className="mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              {NOTIF_ICONS[n.type] ?? <Bell size={13} style={{ color: '#00e5ff' }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium leading-tight"
                style={{ color: n.read ? 'rgba(224,242,254,0.4)' : '#e0f2fe' }}>{n.title}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.3)' }}>{n.body}</p>
              <p className="text-[9px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>{timeAgo(n.createdAt)}</p>
            </div>
            {!n.read && (
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                style={{ background: '#00e5ff' }} />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────
export default function Navbar() {
  const pathname = usePathname()
  if (pathname === '/') return null
  return <NavbarInner />
}

function NavbarInner() {
  const pathname = usePathname()
  const { dbUser } = useAuth()

  // Mode is localStorage-first so it works without login and reacts instantly
  const [isHost, setIsHost] = useState(false)
  useEffect(() => {
    setIsHost(localStorage.getItem('partyradar_account_mode') === 'HOST')
    function onModeChange(e: Event) {
      setIsHost((e as CustomEvent).detail === 'HOST')
    }
    window.addEventListener('partyradar:mode-change', onModeChange)
    return () => window.removeEventListener('partyradar:mode-change', onModeChange)
  }, [])

  function toggleMode() {
    const next = isHost ? 'ATTENDEE' : 'HOST'
    setIsHost(next === 'HOST')
    localStorage.setItem('partyradar_account_mode', next)
    window.dispatchEvent(new CustomEvent('partyradar:mode-change', { detail: next }))
  }
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  const { data: notifData } = useSWR(
    dbUser ? '/notifications?limit=1' : null,
    fetcher,
    { refreshInterval: 30000 }
  )
  const unreadCount = notifData?.unreadCount ?? 0

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    if (notifOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <nav
        className="fixed top-0 inset-x-0 z-50 h-14"
        style={{
          background: 'rgba(4,4,13,0.85)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="max-w-5xl mx-auto px-4 h-full flex items-center justify-between">
          {/* Logo */}
          <Link href="/discover" className="flex items-center gap-2 shrink-0">
            <Zap size={16} fill="rgba(0,229,255,0.15)"
              style={{ color: '#00e5ff', filter: 'drop-shadow(0 0 5px rgba(0,229,255,0.6))' }} />
            <span className="text-sm font-bold tracking-widest" style={{ color: '#00e5ff' }}>
              PARTYRADAR
            </span>
          </Link>

          {/* Mode toggle pill — always visible, no login needed */}
          <button
            onClick={toggleMode}
            className="flex items-center gap-1 rounded-lg px-2 py-1 transition-all duration-200 shrink-0"
            style={{
              background: isHost
                ? 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(0,229,255,0.08) 100%)'
                : 'rgba(0,229,255,0.06)',
              border: isHost ? '1px solid rgba(168,85,247,0.35)' : '1px solid rgba(0,229,255,0.15)',
            }}
          >
            <span
              className="text-[9px] font-black tracking-widest transition-all"
              style={{ color: isHost ? 'rgba(168,85,247,0.5)' : 'rgba(0,229,255,0.4)' }}
            >
              {isHost ? 'HOST' : 'ATTENDEE'}
            </span>
            {/* Sliding dot */}
            <div className="relative w-7 h-4 rounded-full flex items-center transition-all"
              style={{ background: isHost ? 'rgba(168,85,247,0.2)' : 'rgba(0,229,255,0.08)', border: isHost ? '1px solid rgba(168,85,247,0.3)' : '1px solid rgba(0,229,255,0.12)' }}>
              <div className="absolute w-3 h-3 rounded-full transition-all duration-200"
                style={{
                  background: isHost ? '#a855f7' : '#00e5ff',
                  left: isHost ? '13px' : '1px',
                  boxShadow: `0 0 6px ${isHost ? 'rgba(168,85,247,0.6)' : 'rgba(0,229,255,0.5)'}`,
                }} />
            </div>
          </button>

          {/* Centre nav — desktop */}
          <div className="hidden md:flex items-center gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href)
              return (
                <Link key={href} href={href}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm transition-all duration-150"
                  style={{
                    color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                    background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <Icon size={14} />
                  {label}
                </Link>
              )
            })}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {dbUser ? (
              <>
                {/* Host buttons — only in HOST mode */}
                {isHost && (
                  <>
                    <Link href="/dashboard"
                      className="p-2 rounded-lg transition-all duration-150"
                      style={{
                        color: pathname.startsWith('/dashboard') ? '#a855f7' : 'rgba(255,255,255,0.4)',
                        background: pathname.startsWith('/dashboard') ? 'rgba(168,85,247,0.08)' : 'transparent',
                      }}
                    >
                      <BarChart3 size={16} />
                    </Link>
                    <Link href="/events/create"
                      className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150"
                      style={{
                        background: 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(0,229,255,0.1) 100%)',
                        border: '1px solid rgba(168,85,247,0.35)',
                        color: '#a855f7',
                      }}
                    >
                      <Plus size={14} />
                      Create
                    </Link>
                  </>
                )}

                {/* Earn */}
                <Link href="/earn"
                  className="p-2 rounded-lg transition-all duration-150"
                  style={{
                    color: pathname.startsWith('/earn') ? '#00e5ff' : 'rgba(255,255,255,0.4)',
                    background: pathname.startsWith('/earn') ? 'rgba(0,229,255,0.08)' : 'transparent',
                  }}
                >
                  <TrendingUp size={16} />
                </Link>

                {/* Referrals */}
                <Link href="/referrals"
                  className="p-2 rounded-lg transition-all duration-150"
                  style={{
                    color: pathname.startsWith('/referrals') ? '#00ff88' : 'rgba(255,255,255,0.4)',
                    background: pathname.startsWith('/referrals') ? 'rgba(0,255,136,0.08)' : 'transparent',
                  }}
                >
                  <Gift size={16} />
                </Link>

                {/* Messages */}
                <Link href="/messages"
                  className="p-2 rounded-lg transition-all duration-150 relative"
                  style={{
                    color: pathname.startsWith('/messages') ? '#00e5ff' : 'rgba(255,255,255,0.4)',
                    background: pathname.startsWith('/messages') ? 'rgba(0,229,255,0.08)' : 'transparent',
                  }}
                >
                  <MessageCircle size={16} />
                </Link>

                {/* Bell */}
                <div ref={notifRef} className="relative">
                  <button onClick={() => setNotifOpen((o) => !o)}
                    className="relative p-2 rounded-lg transition-all duration-150"
                    style={{
                      color: notifOpen ? '#00e5ff' : 'rgba(255,255,255,0.4)',
                      background: notifOpen ? 'rgba(0,229,255,0.08)' : 'transparent',
                    }}
                  >
                    <Bell size={16} />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full"
                        style={{ background: '#00ff88' }} />
                    )}
                  </button>
                  {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
                </div>

                {/* Avatar */}
                <Link href="/profile"
                  className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center transition-all"
                  style={{ border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  {dbUser.photoUrl
                    ? <img src={dbUser.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                    : <User size={15} style={{ color: 'rgba(255,255,255,0.5)' }} />}
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login"
                  className="text-sm px-3 py-1.5 rounded-lg transition-all"
                  style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Log in
                </Link>
                <Link href="/register"
                  className="text-sm px-3 py-1.5 rounded-lg font-semibold transition-all"
                  style={{ background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.25)', color: '#00e5ff' }}>
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ────────────────────────────────────────── */}
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-50"
        style={{
          background: 'rgba(4,4,13,0.95)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-stretch h-16">
          {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            const isMatch = href === '/match'
            return (
              <Link key={href} href={href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-all px-0.5"
                style={{ color: active ? (isMatch ? '#ff006e' : '#fff') : 'rgba(255,255,255,0.35)' }}>
                <Icon
                  size={16}
                  strokeWidth={active ? 2 : 1.5}
                  fill={isMatch && active ? 'rgba(255,0,110,0.3)' : 'none'}
                  style={isMatch && active ? { filter: 'drop-shadow(0 0 6px rgba(255,0,110,0.6))' } : undefined}
                />
                <span className="text-[8px] font-medium tracking-tight leading-none">{label}</span>
              </Link>
            )
          })}

          {/* Centre pill — adapts to mode */}
          <div className="flex-1 flex items-center justify-center">
            {isHost ? (
              /* HOST: create event */
              <Link href={dbUser ? '/events/create' : '/login'}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, rgba(168,85,247,0.3) 0%, rgba(0,229,255,0.2) 100%)',
                  border: '1px solid rgba(168,85,247,0.5)',
                  boxShadow: '0 0 20px rgba(168,85,247,0.2)',
                }}
              >
                <Plus size={20} style={{ color: '#a855f7' }} />
              </Link>
            ) : (
              /* ATTENDEE: my tickets */
              <Link href={dbUser ? '/tickets' : '/login'}
                className="flex flex-col items-center justify-center gap-0.5 transition-all"
                style={{ color: pathname.startsWith('/tickets') ? '#fff' : 'rgba(255,255,255,0.35)' }}
              >
                <Ticket size={16} strokeWidth={pathname.startsWith('/tickets') ? 2 : 1.5} />
                <span className="text-[8px] font-medium tracking-tight leading-none">Tickets</span>
              </Link>
            )}
          </div>

          {/* Messages */}
          <Link href="/messages"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-all px-0.5"
            style={{ color: pathname.startsWith('/messages') ? '#00e5ff' : 'rgba(255,255,255,0.35)' }}>
            <MessageCircle size={16} strokeWidth={pathname.startsWith('/messages') ? 2 : 1.5} />
            <span className="text-[8px] font-medium tracking-tight leading-none">Chats</span>
          </Link>

          {/* Profile */}
          <Link href={dbUser ? '/profile' : '/login'}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-all px-0.5"
            style={{ color: pathname.startsWith('/profile') ? '#fff' : 'rgba(255,255,255,0.35)' }}>
            <div className="relative">
              {dbUser?.photoUrl
                ? <img src={dbUser.photoUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
                : <User size={16} strokeWidth={pathname.startsWith('/profile') ? 2 : 1.5} />}
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
                  style={{ background: '#00ff88' }} />
              )}
            </div>
            <span className="text-[8px] font-medium tracking-tight leading-none">
              {dbUser ? 'Profile' : 'Sign in'}
            </span>
          </Link>
        </div>
      </div>
    </>
  )
}
