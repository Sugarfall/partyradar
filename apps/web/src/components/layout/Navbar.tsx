'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Zap, Compass, User, Plus, Bell, Calendar, Ticket, Star, X, Building2, MessageCircle, Gift, BarChart3, TrendingUp, UserPlus, Eye, Sparkles, Users, Heart, Wallet, ChevronRight, Menu, Shield } from 'lucide-react'
import useSWR from 'swr'
import { fetcher, api } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useCurrency } from '@/contexts/CurrencyContext'
import type { Notification } from '@partyradar/shared'

// ── Desktop nav links ─────────────────────────────────────────────────────────
const NAV = [
  { href: '/discover', label: 'Discover', icon: Compass },
  { href: '/nearby',   label: 'Nearby',   icon: Users   },
]

// ── Mobile bottom tabs ───────────────────────────────────────────────────────
const MOBILE_NAV = [
  { href: '/discover', label: 'Discover',  icon: Compass },
  { href: '/nearby',   label: 'Nearby',    icon: Users   },
]

const NOTIF_ICONS: Record<string, React.ReactNode> = {
  RSVP_CONFIRMED:   <Ticket        size={13} style={{ color: '#00ff88' }} />,
  INVITE_RECEIVED:  <Zap           size={13} style={{ color: 'var(--accent)' }} />,
  EVENT_REMINDER:   <Calendar      size={13} style={{ color: '#ffd600' }} />,
  CELEBRITY_NEARBY: <Star          size={13} style={{ color: '#ffd600' }} />,
  EVENT_UPDATED:    <Zap           size={13} style={{ color: '#3d5afe' }} />,
  FOLLOW:           <UserPlus      size={13} style={{ color: 'var(--accent)' }} />,
  PROFILE_VIEW:     <Eye           size={13} style={{ color: '#a855f7' }} />,
  NUDGE:            <Bell          size={13} style={{ color: '#00ff88' }} />,
  GO_OUT_REQUEST:   <Sparkles      size={13} style={{ color: '#ff006e' }} />,
  GO_OUT_ACCEPTED:  <Sparkles      size={13} style={{ color: '#00ff88' }} />,
  MESSAGE:          <MessageCircle size={13} style={{ color: 'var(--accent)' }} />,
}

function notifLink(n: Notification): string | null {
  const data = n.data as Record<string, string> | null
  switch (n.type) {
    case 'POST_COMMENT':
    case 'COMMENT_MENTION':
      return data?.['postId'] ? `/feed?post=${data['postId']}` : '/feed'
    case 'RSVP_CONFIRMED':
    case 'INVITE_RECEIVED':
    case 'EVENT_REMINDER':
    case 'EVENT_UPDATED':
    case 'PARTY_BLAST':
      return data?.['eventId'] ? `/events/${data['eventId']}` : null
    case 'FOLLOW':
    case 'NUDGE':
    case 'GO_OUT_REQUEST':
    case 'GO_OUT_ACCEPTED':
    case 'INTEREST_MATCH':
      return data?.['fromUsername'] ? `/profile/${data['fromUsername']}` : null
    case 'PROFILE_VIEW':
      return '/profile'
    case 'GROUP_INVITE_RECEIVED':
      return data?.['groupId'] ? `/groups/${data['groupId']}` : '/groups'
    case 'MESSAGE':
      return data?.['conversationId'] ? `/dm/${data['conversationId']}` : '/dm'
    case 'CELEBRITY_NEARBY':
      return '/discover'
    default:
      return null
  }
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
            <button onClick={markAll} className="text-[10px]" style={{ color: 'var(--accent)' }}>
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
              {NOTIF_ICONS[n.type] ?? <Bell size={13} style={{ color: 'var(--accent)' }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium leading-tight"
                style={{ color: n.read ? 'rgba(224,242,254,0.4)' : '#e0f2fe' }}>{n.title}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.3)' }}>{n.body}</p>
              <p className="text-[9px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>{timeAgo(n.createdAt)}</p>
            </div>
            {!n.read && (
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                style={{ background: 'var(--accent)' }} />
            )}
          </button>
        ))}
      </div>
      <Link href="/notifications" onClick={onClose}
        className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-all hover:bg-white/5"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(var(--accent-rgb),0.6)' }}>
        View all notifications <ChevronRight size={12} />
      </Link>
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
  const { t } = useLanguage()
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const { symbol: currencySymbol } = useCurrency()
  const [myVenues, setMyVenues] = useState<{ id: string; name: string; isClaimed: boolean }[]>([])

  // Load wallet balance for bottom tab display
  useEffect(() => {
    if (!dbUser) return
    api.get<{ data: { balance: number } }>('/wallet')
      .then(r => setWalletBalance(r?.data?.balance ?? null))
      .catch(() => {})
  }, [dbUser?.id])

  // Load claimed venues for host menu
  useEffect(() => {
    if (!dbUser) return
    api.get<{ data: { id: string; name: string; isClaimed: boolean }[] }>('/venues/mine')
      .then(r => setMyVenues(r?.data ?? []))
      .catch(() => {})
  }, [dbUser?.id])

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
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const { data: notifData } = useSWR(
    dbUser ? '/notifications?limit=1' : null,
    fetcher,
    { refreshInterval: 30000 }
  )
  const unreadCount = notifData?.unreadCount ?? 0

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    if (notifOpen || menuOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen, menuOpen])

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
            <Zap size={16} style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 5px rgba(var(--accent-rgb),0.6))' }} />
            <span className="text-sm font-bold tracking-widest" style={{ color: 'var(--accent)' }}>
              PARTYRADAR
            </span>
          </Link>

          {/* Mode toggle pill — always visible, no login needed */}
          <button
            onClick={toggleMode}
            className="flex items-center gap-1 rounded-lg px-2 py-1 transition-all duration-200 shrink-0"
            style={{
              background: isHost
                ? 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(var(--accent-rgb),0.08) 100%)'
                : 'rgba(var(--accent-rgb),0.06)',
              border: isHost ? '1px solid rgba(168,85,247,0.35)' : '1px solid rgba(var(--accent-rgb),0.15)',
            }}
          >
            <span
              className="text-[9px] font-black tracking-widest transition-all"
              style={{ color: isHost ? 'rgba(168,85,247,0.5)' : 'var(--accent)', opacity: isHost ? 1 : 0.5 }}
            >
              {isHost ? 'HOST' : 'ATTENDEE'}
            </span>
            {/* Sliding dot */}
            <div className="relative w-7 h-4 rounded-full flex items-center transition-all"
              style={{ background: isHost ? 'rgba(168,85,247,0.2)' : 'rgba(var(--accent-rgb),0.08)', border: isHost ? '1px solid rgba(168,85,247,0.3)' : '1px solid rgba(var(--accent-rgb),0.12)' }}>
              <div className="absolute w-3 h-3 rounded-full transition-all duration-200"
                style={{
                  background: isHost ? '#a855f7' : 'var(--accent)',
                  left: isHost ? '13px' : '1px',
                  boxShadow: `0 0 6px ${isHost ? 'rgba(168,85,247,0.6)' : 'rgba(var(--accent-rgb),0.5)'}`,
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

          {/* Right actions — Bell always visible, everything else in Menu */}
          <div className="flex items-center gap-1">
            {dbUser ? (
              <>
                {/* Messages shortcut — desktop only (bottom tab bar covers mobile) */}
                <Link href="/messages"
                  aria-label="Messages"
                  className="hidden md:flex p-2 rounded-lg transition-all duration-150 relative"
                  style={{
                    color: pathname.startsWith('/messages') ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
                    background: pathname.startsWith('/messages') ? 'rgba(var(--accent-rgb),0.08)' : 'transparent',
                  }}
                >
                  <MessageCircle size={16} />
                </Link>

                {/* Bell — always visible */}
                <div ref={notifRef} className="relative">
                  <button onClick={() => { setNotifOpen((o) => !o); setMenuOpen(false) }}
                    aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
                    aria-expanded={notifOpen}
                    className="relative p-2 rounded-lg transition-all duration-150"
                    style={{
                      color: notifOpen ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
                      background: notifOpen ? 'rgba(var(--accent-rgb),0.08)' : 'transparent',
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

                {/* Avatar — desktop only (bottom tab bar covers mobile) */}
                <Link href="/profile"
                  className="hidden md:flex w-8 h-8 rounded-full overflow-hidden items-center justify-center transition-all mx-1"
                  style={{ border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  {dbUser.photoUrl
                    ? <img src={dbUser.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                    : <User size={15} style={{ color: 'rgba(255,255,255,0.5)' }} />}
                </Link>

                {/* Hamburger Menu */}
                <div ref={menuRef} className="relative">
                  <button
                    onClick={() => { setMenuOpen((o) => !o); setNotifOpen(false) }}
                    aria-label="Open menu"
                    aria-expanded={menuOpen}
                    className="p-2 rounded-lg transition-all duration-150"
                    style={{
                      color: menuOpen ? 'var(--accent)' : 'rgba(255,255,255,0.5)',
                      background: menuOpen ? 'rgba(var(--accent-rgb),0.08)' : 'transparent',
                      border: menuOpen ? '1px solid rgba(var(--accent-rgb),0.2)' : '1px solid transparent',
                    }}
                  >
                    <Menu size={16} />
                  </button>
                  {menuOpen && (
                    <div
                      className="absolute top-full right-0 mt-2 w-52 rounded-2xl overflow-hidden z-50"
                      style={{
                        background: 'rgba(7,7,26,0.98)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
                        backdropFilter: 'blur(20px)',
                      }}
                    >
                      {/* Admin / Mod panel link — staff only */}
                      {(dbUser?.appRole === 'ADMIN' || dbUser?.appRole === 'MODERATOR' || dbUser?.isAdmin) && (
                        <Link href="/admin" onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 text-sm transition-all hover:bg-white/5"
                          style={{ color: pathname.startsWith('/admin') ? '#ff006e' : 'rgba(255,0,110,0.8)', borderBottom: '1px solid rgba(255,0,110,0.12)', background: 'rgba(255,0,110,0.04)' }}>
                          <Shield size={15} /> {dbUser?.appRole === 'ADMIN' || dbUser?.isAdmin ? 'Admin Panel' : 'Mod Panel'}
                        </Link>
                      )}
                      {isHost && (
                        <>
                          <Link href="/dashboard" onClick={() => setMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-3 text-sm transition-all hover:bg-white/5"
                            style={{ color: pathname.startsWith('/dashboard') ? '#a855f7' : 'rgba(224,242,254,0.7)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <BarChart3 size={15} /> Dashboard
                          </Link>
                          <Link href="/events/create" onClick={() => setMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-3 text-sm transition-all hover:bg-white/5"
                            style={{ color: '#a855f7', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <Plus size={15} /> Create Event
                          </Link>
                          {myVenues.filter(v => v.isClaimed).slice(0, 5).length > 0 && (
                            <>
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '2px 0' }} />
                              {myVenues.filter(v => v.isClaimed).slice(0, 5).map(venue => (
                                <Link key={venue.id} href={`/venues/${venue.id}/manage`} onClick={() => setMenuOpen(false)}
                                  className="flex items-center gap-3 px-4 py-3 text-sm transition-all hover:bg-white/5"
                                  style={{ color: 'rgba(168,85,247,0.7)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                  <Building2 size={15} /> {venue.name}
                                </Link>
                              ))}
                            </>
                          )}
                        </>
                      )}
                      <Link href="/pricing" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm transition-all hover:bg-white/5"
                        style={{ color: pathname.startsWith('/pricing') ? '#00e5ff' : 'rgba(224,242,254,0.7)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <Sparkles size={15} /> Upgrade Plan
                      </Link>
                      <Link href="/referrals" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm transition-all hover:bg-white/5"
                        style={{ color: (pathname.startsWith('/referrals') || pathname.startsWith('/earn')) ? '#00ff88' : 'rgba(224,242,254,0.7)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <TrendingUp size={15} /> Earn & Referrals
                      </Link>
                      <Link href="/wallet" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm transition-all hover:bg-white/5"
                        style={{ color: pathname.startsWith('/wallet') ? '#00ff88' : 'rgba(224,242,254,0.7)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <Wallet size={15} /> Wallet
                      </Link>
                      <Link href="/leaderboard" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm transition-all hover:bg-white/5"
                        style={{ color: pathname.startsWith('/leaderboard') ? '#ffd600' : 'rgba(224,242,254,0.7)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <Star size={15} /> Leaderboard
                      </Link>
                      <Link href="/tickets" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm transition-all hover:bg-white/5"
                        style={{ color: pathname.startsWith('/tickets') ? 'var(--accent)' : 'rgba(224,242,254,0.7)' }}>
                        <Ticket size={15} /> My Tickets
                      </Link>
                    </div>
                  )}
                </div>
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
                  style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.25)', color: 'var(--accent)' }}>
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
            const translatedLabel = t(`nav.${label.toLowerCase()}`) || label
            return (
              <Link key={href} href={href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-all px-0.5"
                style={{ color: active ? 'var(--accent)' : 'rgba(255,255,255,0.35)' }}>
                <Icon
                  size={16}
                  strokeWidth={active ? 2 : 1.5}
                  style={active ? { filter: 'drop-shadow(0 0 6px rgba(var(--accent-rgb),0.6))' } : undefined}
                />
                <span className="text-[8px] font-medium tracking-tight leading-none">{translatedLabel}</span>
              </Link>
            )
          })}

          {/* Centre slot */}
          <div className="flex-1 relative">
            {isHost ? (
              /* HOST: FAB centred on the top edge of the tab bar */
              <Link
                href={dbUser ? '/events/create' : '/login'}
                className="absolute rounded-full flex items-center justify-center transition-all active:scale-95"
                style={{
                  width: 56, height: 56,
                  top: 0, left: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'rgba(4,4,13,0.92)',
                  border: '2px solid rgba(168,85,247,0.75)',
                  boxShadow: '0 0 0 5px rgba(4,4,13,0.95), 0 0 22px rgba(168,85,247,0.4)',
                  backdropFilter: 'blur(14px)',
                  zIndex: 10,
                }}
              >
                <Plus size={22} style={{ color: '#a855f7' }} strokeWidth={2} />
              </Link>
            ) : (
              /* ATTENDEE: my tickets */
              <Link href={dbUser ? '/tickets' : '/login'}
                className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 transition-all"
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
            style={{ color: pathname.startsWith('/messages') ? 'var(--accent)' : 'rgba(255,255,255,0.35)' }}>
            <MessageCircle size={16} strokeWidth={pathname.startsWith('/messages') ? 2 : 1.5} />
            <span className="text-[8px] font-medium tracking-tight leading-none">Chats</span>
          </Link>

          {/* Wallet */}
          <Link href={dbUser ? '/wallet' : '/login'}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-all px-0.5"
            style={{ color: pathname.startsWith('/wallet') ? '#00ff88' : 'rgba(255,255,255,0.35)' }}>
            <Wallet size={16} strokeWidth={pathname.startsWith('/wallet') ? 2 : 1.5}
              style={pathname.startsWith('/wallet') ? { filter: 'drop-shadow(0 0 6px rgba(0,255,136,0.6))' } : undefined} />
            <span className="text-[8px] font-medium tracking-tight leading-none">
              {dbUser && walletBalance !== null ? `${currencySymbol}${walletBalance.toFixed(2)}` : 'Wallet'}
            </span>
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
