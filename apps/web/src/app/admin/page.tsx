'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import Link from 'next/link'
import {
  Shield, ShieldAlert, ShieldCheck, Users, Calendar, MessageSquare,
  Flag, Search, Ban, ChevronDown, Trash2, BarChart3, Crown,
  AlertTriangle, CheckCircle, X, Star, Eye, Bot, FileWarning,
  Activity, Database, Wifi, WifiOff, RefreshCw, Zap, MapPin
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string
  email: string
  username: string
  displayName: string
  photoUrl?: string | null
  subscriptionTier: string
  appRole: string
  isAdmin: boolean
  isBanned: boolean
  createdAt: string
  gender?: string | null
  _count: { hostedEvents: number; tickets: number; groupMemberships: number }
}

interface AdminEvent {
  id: string
  name: string
  type: string
  startsAt: string
  isPublished: boolean
  isFeatured: boolean
  isCancelled: boolean
  host: { id: string; username: string; displayName: string }
  _count: { guests: number; tickets: number }
}

interface AdminGroup {
  id: string
  slug: string
  name: string
  type: string
  emoji: string
  coverColor: string
  isPrivate: boolean
  isPaid: boolean
  memberCount: number
  createdAt: string
  creator?: { id: string; username: string; displayName: string; appRole: string } | null
  _count: { memberships: number; messages: number }
}

interface AdminReport {
  id: string
  fromUser: { id: string; username: string; displayName: string; photoUrl?: string | null }
  toUser: { id: string; username: string; displayName: string; photoUrl?: string | null }
  category: string
  score: number
  comment?: string | null
  reportCount: number
  isHidden: boolean
  createdAt: string
}

interface Stats {
  userCount: number
  eventCount: number
  groupCount: number
  bannedCount: number
  reportCount: number
  modCount: number
  adminCount: number
}

interface ModerationLog {
  id: string
  contentType: string
  contentRef?: string | null
  content?: string | null
  contentUrl?: string | null
  flagType: string
  confidence: number
  action: string
  autoAction: boolean
  reviewedAt?: string | null
  reviewedBy?: string | null
  createdAt: string
  user: { id: string; username: string; displayName: string; photoUrl?: string | null; contentStrikes: number; isBanned: boolean }
}

interface EventDiagnostics {
  counts: { total: number; live: number; upcoming: number }
  bySource: Record<string, number>
  byType: Record<string, number>
  recentSynced: Array<{ id: string; name: string; type: string; externalSource: string | null; createdAt: string; startsAt: string; neighbourhood: string }>
  apiKeys: { ticketmaster: boolean; skiddle: boolean; eventbrite: boolean; serpapi: boolean; perplexity: boolean }
}

interface ContentReport {
  id: string
  contentType: string
  contentId: string
  reason: string
  details?: string | null
  status: string
  reviewedAt?: string | null
  createdAt: string
  reporter: { id: string; username: string; displayName: string; photoUrl?: string | null }
}

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role, isAdmin }: { role: string; isAdmin: boolean }) {
  const effective = isAdmin || role === 'ADMIN' ? 'ADMIN' : role
  const cfg: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    ADMIN: { label: 'Admin', color: '#ff006e', icon: <Crown size={10} /> },
    MODERATOR: { label: 'Mod', color: '#00c8ff', icon: <ShieldCheck size={10} /> },
    USER: { label: 'User', color: '#555', icon: null },
  }
  const c = cfg[effective] ?? cfg['USER']!
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ background: `${c.color}20`, color: c.color, border: `1px solid ${c.color}40` }}
    >
      {c.icon} {c.label}
    </span>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40 uppercase tracking-widest font-semibold">{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}15`, color }}>
          {icon}
        </div>
      </div>
      <div className="text-3xl font-black" style={{ color }}>{value.toLocaleString()}</div>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'stats' | 'users' | 'events' | 'groups' | 'reports' | 'moderation' | 'pipeline'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'stats', label: 'Overview', icon: <BarChart3 size={14} /> },
  { id: 'users', label: 'Users', icon: <Users size={14} /> },
  { id: 'events', label: 'Events', icon: <Calendar size={14} /> },
  { id: 'groups', label: 'Groups', icon: <MessageSquare size={14} /> },
  { id: 'reports', label: 'Reports', icon: <Flag size={14} /> },
  { id: 'moderation', label: 'Mod Queue', icon: <ShieldAlert size={14} /> },
  { id: 'pipeline', label: 'Pipeline', icon: <Activity size={14} /> },
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const { dbUser, loading } = useAuth()
  const [tab, setTab] = useState<Tab>('stats')
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [reports, setReports] = useState<AdminReport[]>([])
  const [modLogs, setModLogs] = useState<ModerationLog[]>([])
  const [contentReports, setContentReports] = useState<ContentReport[]>([])
  const [modSubTab, setModSubTab] = useState<'auto' | 'user'>('auto')
  const [diagnostics, setDiagnostics] = useState<EventDiagnostics | null>(null)
  const [syncCity, setSyncCity] = useState('')
  const [syncLat, setSyncLat] = useState('')
  const [syncLng, setSyncLng] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ imported: number; skipped: number; sources: string[] } | null>(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [roleMenuOpen, setRoleMenuOpen] = useState<string | null>(null)

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const isStaff = dbUser?.appRole === 'ADMIN' || dbUser?.appRole === 'MODERATOR' || dbUser?.isAdmin
  const isAdmin = dbUser?.appRole === 'ADMIN' || dbUser?.isAdmin

  // Load data per tab
  useEffect(() => {
    if (!isStaff) return
    if (tab === 'stats') {
      api.get<{ data: Stats }>('/admin/stats').then((r) => setStats(r.data)).catch(() => {})
    } else if (tab === 'users') {
      api.get<{ data: AdminUser[] }>('/admin/users').then((r) => setUsers(r.data)).catch(() => {})
    } else if (tab === 'events') {
      api.get<{ data: AdminEvent[] }>('/admin/events').then((r) => setEvents(r.data)).catch(() => {})
    } else if (tab === 'groups') {
      api.get<{ data: AdminGroup[] }>('/admin/groups').then((r) => setGroups(r.data)).catch(() => {})
    } else if (tab === 'reports') {
      api.get<{ data: AdminReport[] }>('/admin/reports').then((r) => setReports(r.data)).catch(() => {})
    } else if (tab === 'moderation') {
      api.get<{ data: ModerationLog[] }>('/admin/moderation-logs').then((r) => setModLogs(r.data)).catch(() => {})
      api.get<{ data: ContentReport[] }>('/admin/content-reports').then((r) => setContentReports(r.data)).catch(() => {})
    } else if (tab === 'pipeline') {
      api.get<{ data: EventDiagnostics }>('/events/diagnostics').then((r) => setDiagnostics(r.data)).catch(() => {})
    }
  }, [tab, isStaff])

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleBanToggle = async (userId: string, currentlyBanned: boolean) => {
    setBusy(true)
    try {
      await api.put(`/admin/users/${userId}/ban`, {})
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isBanned: !currentlyBanned } : u))
      showToast(currentlyBanned ? 'User unbanned' : 'User banned')
    } catch (e: any) {
      showToast(e?.message ?? 'Failed', false)
    } finally { setBusy(false) }
  }

  const handleSetRole = async (userId: string, role: string) => {
    if (!isAdmin) { showToast('Admin access required', false); return }
    setBusy(true)
    setRoleMenuOpen(null)
    try {
      await api.put(`/admin/users/${userId}/app-role`, { role })
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, appRole: role } : u))
      showToast(`Role updated to ${role}`)
    } catch (e: any) {
      showToast(e?.message ?? 'Failed', false)
    } finally { setBusy(false) }
  }

  const handleFeatureEvent = async (eventId: string) => {
    try {
      await api.put(`/admin/events/${eventId}/feature`, {})
      setEvents((prev) => prev.map((e) => e.id === eventId ? { ...e, isFeatured: !e.isFeatured } : e))
      showToast('Feature status updated')
    } catch { showToast('Failed', false) }
  }

  const handleCancelEvent = async (eventId: string) => {
    if (!confirm('Cancel this event?')) return
    try {
      await api.delete(`/admin/events/${eventId}`)
      setEvents((prev) => prev.map((e) => e.id === eventId ? { ...e, isCancelled: true, isPublished: false } : e))
      showToast('Event cancelled')
    } catch { showToast('Failed', false) }
  }

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (!isAdmin) { showToast('Admin access required', false); return }
    if (!confirm(`Permanently delete "${groupName}" and all its messages? This cannot be undone.`)) return
    try {
      await api.delete(`/admin/groups/${groupId}`)
      setGroups((prev) => prev.filter((g) => g.id !== groupId))
      showToast(`Group "${groupName}" deleted`)
    } catch { showToast('Failed', false) }
  }

  const handleHideFeedback = async (reportId: string) => {
    try {
      await api.put(`/admin/feedback/${reportId}/hide`, {})
      setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, isHidden: true } : r))
      showToast('Feedback hidden')
    } catch { showToast('Failed', false) }
  }

  const handleReviewLog = async (logId: string, outcome: 'APPROVED' | 'REMOVED') => {
    try {
      await api.put(`/admin/moderation-logs/${logId}/review`, { outcome })
      setModLogs((prev) => prev.map((l) => l.id === logId ? { ...l, reviewedAt: new Date().toISOString(), action: outcome } : l))
      showToast(outcome === 'APPROVED' ? 'Marked as approved (false positive)' : 'Content confirmed removed')
    } catch { showToast('Failed', false) }
  }

  const handleReviewContentReport = async (reportId: string, status: 'ACTIONED' | 'DISMISSED') => {
    try {
      await api.put(`/admin/content-reports/${reportId}/review`, { status })
      setContentReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status } : r))
      showToast(status === 'ACTIONED' ? 'Report actioned' : 'Report dismissed')
    } catch { showToast('Failed', false) }
  }

  const handleManualSync = async () => {
    if (!syncCity.trim() || !syncLat.trim() || !syncLng.trim()) {
      showToast('City, lat and lng required', false); return
    }
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await api.post<{ data: { imported: number; skipped: number; sources: string[] } }>(
        '/events/ai-sync', { city: syncCity.trim(), lat: parseFloat(syncLat), lng: parseFloat(syncLng), force: true }
      )
      setSyncResult(r.data)
      showToast(`Sync done — ${r.data.imported} imported`)
      // Refresh diagnostics
      api.get<{ data: EventDiagnostics }>('/events/diagnostics').then((d) => setDiagnostics(d.data)).catch(() => {})
    } catch (e: any) {
      showToast(e?.message ?? 'Sync failed', false)
    } finally {
      setSyncing(false)
    }
  }

  const handleClearStrikes = async (userId: string, username: string) => {
    if (!isAdmin) { showToast('Admin access required', false); return }
    if (!confirm(`Clear all content strikes for @${username}?`)) return
    try {
      await api.put(`/admin/users/${userId}/clear-strikes`, {})
      setModLogs((prev) => prev.map((l) => l.user.id === userId ? { ...l, user: { ...l.user, contentStrikes: 0 } } : l))
      showToast(`Strikes cleared for @${username}`)
    } catch { showToast('Failed', false) }
  }

  // ─── Loading / access guard ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00c8ff', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!isStaff) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-2" style={{ background: '#ff006e20', border: '1px solid #ff006e40' }}>
          <ShieldAlert size={28} style={{ color: '#ff006e' }} />
        </div>
        <h1 className="text-xl font-bold text-white">Access Denied</h1>
        <p className="text-white/50 text-sm max-w-xs">You need Admin or Moderator access to view this panel.</p>
        <Link href="/" className="text-sm font-semibold mt-2" style={{ color: '#00c8ff' }}>← Back to app</Link>
      </div>
    )
  }

  // Filtered users
  const filteredUsers = search.trim()
    ? users.filter((u) =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.displayName.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      )
    : users

  return (
    <div className="min-h-screen pb-24" style={{ background: '#07071a' }}>
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 pt-4 pb-3" style={{ background: 'rgba(7,7,26,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: isAdmin ? '#ff006e20' : '#00c8ff20' }}>
              {isAdmin ? <Crown size={18} style={{ color: '#ff006e' }} /> : <Shield size={18} style={{ color: '#00c8ff' }} />}
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-none">
                {isAdmin ? 'Admin Panel' : 'Moderator Panel'}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: isAdmin ? '#ff006e' : '#00c8ff' }}>
                {isAdmin ? 'Full platform control' : 'Content & user moderation'}
              </p>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all"
                style={tab === t.id
                  ? { background: '#00c8ff20', color: '#00c8ff', border: '1px solid #00c8ff40' }
                  : { background: 'transparent', color: 'rgba(255,255,255,0.4)', border: '1px solid transparent' }
                }
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold shadow-2xl"
          style={{ background: toast.ok ? '#00c8ff20' : '#ff006e20', color: toast.ok ? '#00c8ff' : '#ff006e', border: `1px solid ${toast.ok ? '#00c8ff40' : '#ff006e40'}` }}
        >
          {toast.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 pt-5">

        {/* ── Stats tab ── */}
        {tab === 'stats' && stats && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Active Users" value={stats.userCount} icon={<Users size={16} />} color="#00c8ff" />
              <StatCard label="Live Events" value={stats.eventCount} icon={<Calendar size={16} />} color="#a855f7" />
              <StatCard label="Groups" value={stats.groupCount} icon={<MessageSquare size={16} />} color="#f59e0b" />
              <StatCard label="Banned" value={stats.bannedCount} icon={<Ban size={16} />} color="#ff006e" />
              <StatCard label="Reports" value={stats.reportCount} icon={<Flag size={16} />} color="#ef4444" />
              <StatCard label="Moderators" value={stats.modCount} icon={<ShieldCheck size={16} />} color="#10b981" />
            </div>
            {isAdmin && (
              <div className="rounded-2xl p-4" style={{ background: 'rgba(255,0,110,0.04)', border: '1px solid rgba(255,0,110,0.12)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Crown size={14} style={{ color: '#ff006e' }} />
                  <span className="text-xs font-bold" style={{ color: '#ff006e' }}>ADMIN QUICK ACTIONS</span>
                </div>
                <p className="text-xs text-white/40 mb-3">Platform-level controls</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setTab('users')} className="px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ background: '#ff006e15', color: '#ff006e', border: '1px solid #ff006e30' }}>
                    Manage Roles
                  </button>
                  <button onClick={() => setTab('groups')} className="px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ background: '#a855f715', color: '#a855f7', border: '1px solid #a855f730' }}>
                    Manage Groups
                  </button>
                  <button onClick={() => setTab('reports')} className="px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ background: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}>
                    Review Reports
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Users tab ── */}
        {tab === 'users' && (
          <div className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by username, name or email..."
                className="w-full pl-9 pr-4 py-3 rounded-2xl text-sm outline-none text-white placeholder-white/30"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            </div>
            <div className="space-y-2">
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className="rounded-2xl p-4"
                  style={{
                    background: u.isBanned ? 'rgba(255,0,110,0.04)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${u.isBanned ? 'rgba(255,0,110,0.15)' : 'rgba(255,255,255,0.07)'}`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      {u.photoUrl
                        ? <img src={u.photoUrl} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-white/30 text-xs font-bold">{u.displayName[0]}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm truncate">{u.displayName}</span>
                        <RoleBadge role={u.appRole} isAdmin={u.isAdmin} />
                        {u.isBanned && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: '#ff006e20', color: '#ff006e', border: '1px solid #ff006e40' }}>
                            BANNED
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-white/40 truncate">@{u.username} · {u.email}</div>
                      <div className="flex gap-3 mt-1 text-xs text-white/30">
                        <span>{u.subscriptionTier}</span>
                        <span>·</span>
                        <span>{u._count.hostedEvents} events</span>
                        <span>·</span>
                        <span>{u._count.groupMemberships} groups</span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Role picker — admin only */}
                      {isAdmin && (
                        <div className="relative">
                          <button
                            onClick={() => setRoleMenuOpen(roleMenuOpen === u.id ? null : u.id)}
                            disabled={busy}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-semibold transition-all"
                            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
                            title="Change role"
                          >
                            <Shield size={12} /> <ChevronDown size={10} />
                          </button>
                          {roleMenuOpen === u.id && (
                            <div
                              className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden shadow-2xl"
                              style={{ background: '#12122a', border: '1px solid rgba(255,255,255,0.1)', minWidth: '130px' }}
                            >
                              {['USER', 'MODERATOR', 'ADMIN'].map((role) => (
                                <button
                                  key={role}
                                  onClick={() => handleSetRole(u.id, role)}
                                  className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-white/5 transition-colors"
                                  style={{ color: role === 'ADMIN' ? '#ff006e' : role === 'MODERATOR' ? '#00c8ff' : 'rgba(255,255,255,0.6)' }}
                                >
                                  {role === 'ADMIN' ? '👑 Admin' : role === 'MODERATOR' ? '🛡️ Moderator' : '👤 User'}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Ban button */}
                      <button
                        onClick={() => handleBanToggle(u.id, u.isBanned)}
                        disabled={busy}
                        className="p-2 rounded-xl transition-all"
                        style={u.isBanned
                          ? { background: '#00c8ff15', color: '#00c8ff', border: '1px solid #00c8ff30' }
                          : { background: '#ff006e15', color: '#ff006e', border: '1px solid #ff006e30' }
                        }
                        title={u.isBanned ? 'Unban user' : 'Ban user'}
                      >
                        {u.isBanned ? <CheckCircle size={14} /> : <Ban size={14} />}
                      </button>
                      <Link
                        href={`/profile/${u.username}`}
                        className="p-2 rounded-xl transition-all"
                        style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
                        title="View profile"
                      >
                        <Eye size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <div className="text-center py-12 text-white/30 text-sm">
                  {search ? 'No users match your search' : 'Loading users…'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Events tab ── */}
        {tab === 'events' && (
          <div className="space-y-2">
            {events.map((e) => (
              <div
                key={e.id}
                className="rounded-2xl p-4"
                style={{
                  background: e.isCancelled ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${e.isCancelled ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.07)'}`,
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white text-sm truncate">{e.name}</span>
                      {e.isFeatured && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: '#f59e0b20', color: '#f59e0b', border: '1px solid #f59e0b40' }}>
                          ⭐ Featured
                        </span>
                      )}
                      {e.isCancelled && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440' }}>
                          Cancelled
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">
                      by @{e.host.username} · {e.type.replace(/_/g, ' ')} · {new Date(e.startsAt).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-white/30 mt-0.5">{e._count.guests} RSVPs · {e._count.tickets} tickets</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleFeatureEvent(e.id)}
                      className="p-2 rounded-xl transition-all"
                      style={e.isFeatured
                        ? { background: '#f59e0b20', color: '#f59e0b', border: '1px solid #f59e0b40' }
                        : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }
                      }
                      title="Toggle featured"
                    >
                      <Star size={14} />
                    </button>
                    {!e.isCancelled && (
                      <button
                        onClick={() => handleCancelEvent(e.id)}
                        className="p-2 rounded-xl"
                        style={{ background: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}
                        title="Cancel event"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <div className="text-center py-12 text-white/30 text-sm">Loading events…</div>
            )}
          </div>
        )}

        {/* ── Groups tab ── */}
        {tab === 'groups' && (
          <div className="space-y-2">
            {groups.map((g) => (
              <div
                key={g.id}
                className="rounded-2xl p-4"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: `${g.coverColor}20` }}
                  >
                    {g.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white text-sm">{g.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                        {g.type}
                      </span>
                      {g.isPrivate && <span className="text-xs text-white/30">🔒 Private</span>}
                      {g.isPaid && <span className="text-xs text-white/30">💳 Paid</span>}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">
                      {g.memberCount} members · {g._count.messages} messages
                      {g.creator && ` · by @${g.creator.username}`}
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteGroup(g.id, g.name)}
                      className="p-2 rounded-xl flex-shrink-0"
                      style={{ background: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}
                      title="Force delete group"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {groups.length === 0 && (
              <div className="text-center py-12 text-white/30 text-sm">Loading groups…</div>
            )}
          </div>
        )}

        {/* ── Moderation Queue tab ── */}
        {tab === 'moderation' && (
          <div className="space-y-4">
            {/* Sub-tab switcher */}
            <div className="flex gap-2">
              {(['auto', 'user'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setModSubTab(st)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={modSubTab === st
                    ? { background: '#a855f720', color: '#a855f7', border: '1px solid #a855f740' }
                    : { background: 'transparent', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }
                  }
                >
                  {st === 'auto' ? <><Bot size={12} /> Auto-blocked ({modLogs.length})</> : <><FileWarning size={12} /> User Reports ({contentReports.filter((r) => r.status === 'PENDING').length})</>}
                </button>
              ))}
            </div>

            {/* Auto-moderation logs */}
            {modSubTab === 'auto' && (
              <div className="space-y-2">
                {modLogs.length === 0 && (
                  <div className="text-center py-12 text-white/30 text-sm">No auto-moderation logs yet</div>
                )}
                {modLogs.map((log) => {
                  const isReviewed = !!log.reviewedAt
                  const flagColors: Record<string, string> = {
                    SEXUAL: '#f59e0b', ILLEGAL: '#ef4444', VIOLENCE: '#ff006e',
                    HATE: '#f97316', SPAM: '#8b5cf6', KEYWORD: '#06b6d4',
                  }
                  const flagColor = flagColors[log.flagType] ?? '#fff'
                  return (
                    <div
                      key={log.id}
                      className="rounded-2xl p-4"
                      style={{
                        background: isReviewed ? 'rgba(255,255,255,0.02)' : 'rgba(239,68,68,0.04)',
                        border: `1px solid ${isReviewed ? 'rgba(255,255,255,0.06)' : 'rgba(239,68,68,0.15)'}`,
                        opacity: isReviewed ? 0.6 : 1,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        {/* User avatar */}
                        <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          {log.user.photoUrl
                            ? <img src={log.user.photoUrl} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-white/30 text-xs font-bold">{log.user.displayName[0]}</div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* Header row */}
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-semibold text-white">@{log.user.username}</span>
                            {log.user.isBanned && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: '#ff006e20', color: '#ff006e' }}>BANNED</span>
                            )}
                            <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: `${flagColor}20`, color: flagColor, border: `1px solid ${flagColor}40` }}>
                              {log.flagType}
                            </span>
                            <span className="text-xs text-white/30">{log.contentType}</span>
                            <span className="text-xs text-white/20">{Math.round(log.confidence * 100)}% confidence</span>
                          </div>
                          {/* Content preview */}
                          {log.content && (
                            <p className="text-xs text-white/50 italic line-clamp-2 mb-1">"{log.content}"</p>
                          )}
                          {log.contentUrl && (
                            <p className="text-xs text-white/40 truncate mb-1">🖼 {log.contentUrl}</p>
                          )}
                          {/* Strike count + date */}
                          <div className="flex items-center gap-3 text-xs text-white/30">
                            <span>⚡ {log.user.contentStrikes} strike{log.user.contentStrikes !== 1 ? 's' : ''}</span>
                            <span>·</span>
                            <span>{new Date(log.createdAt).toLocaleDateString()}</span>
                            {isReviewed && <span className="text-white/20">· Reviewed: {log.action}</span>}
                          </div>
                        </div>
                        {/* Actions */}
                        {!isReviewed && (
                          <div className="flex flex-col gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => handleReviewLog(log.id, 'APPROVED')}
                              className="px-2 py-1 rounded-lg text-xs font-semibold"
                              style={{ background: '#10b98115', color: '#10b981', border: '1px solid #10b98130' }}
                              title="False positive — approve content"
                            >
                              <CheckCircle size={12} />
                            </button>
                            <button
                              onClick={() => handleReviewLog(log.id, 'REMOVED')}
                              className="px-2 py-1 rounded-lg text-xs font-semibold"
                              style={{ background: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}
                              title="Confirm removal"
                            >
                              <X size={12} />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleClearStrikes(log.user.id, log.user.username)}
                                className="px-2 py-1 rounded-lg text-xs font-semibold"
                                style={{ background: '#a855f715', color: '#a855f7', border: '1px solid #a855f730' }}
                                title="Clear strikes"
                              >
                                <ShieldCheck size={12} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* User-submitted content reports */}
            {modSubTab === 'user' && (
              <div className="space-y-2">
                {contentReports.length === 0 && (
                  <div className="text-center py-12 text-white/30 text-sm">No user reports yet</div>
                )}
                {contentReports.map((report) => {
                  const isPending = report.status === 'PENDING'
                  const reasonColors: Record<string, string> = {
                    NUDITY: '#f59e0b', ILLEGAL: '#ef4444', SPAM: '#8b5cf6',
                    HATE: '#f97316', VIOLENCE: '#ff006e', OTHER: '#6b7280',
                  }
                  const reasonColor = reasonColors[report.reason] ?? '#fff'
                  return (
                    <div
                      key={report.id}
                      className="rounded-2xl p-4"
                      style={{
                        background: isPending ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isPending ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)'}`,
                        opacity: isPending ? 1 : 0.55,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          {report.reporter.photoUrl
                            ? <img src={report.reporter.photoUrl} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-white/30 text-xs font-bold">{report.reporter.displayName[0]}</div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-semibold text-white">@{report.reporter.username}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: `${reasonColor}20`, color: reasonColor, border: `1px solid ${reasonColor}40` }}>
                              {report.reason}
                            </span>
                            <span className="text-xs text-white/30">{report.contentType}</span>
                            {!isPending && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>
                                {report.status}
                              </span>
                            )}
                          </div>
                          {report.details && (
                            <p className="text-xs text-white/50 italic line-clamp-2 mb-1">"{report.details}"</p>
                          )}
                          <div className="text-xs text-white/30">
                            Content ID: <span className="font-mono text-white/20">{report.contentId.slice(0, 12)}…</span>
                            <span className="mx-2">·</span>
                            {new Date(report.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        {isPending && (
                          <div className="flex flex-col gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => handleReviewContentReport(report.id, 'ACTIONED')}
                              className="px-2 py-1 rounded-lg text-xs font-semibold"
                              style={{ background: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}
                              title="Action this report"
                            >
                              <X size={12} />
                            </button>
                            <button
                              onClick={() => handleReviewContentReport(report.id, 'DISMISSED')}
                              className="px-2 py-1 rounded-lg text-xs font-semibold"
                              style={{ background: '#10b98115', color: '#10b981', border: '1px solid #10b98130' }}
                              title="Dismiss (no action needed)"
                            >
                              <CheckCircle size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Pipeline tab ── */}
        {tab === 'pipeline' && (
          <div className="space-y-4">
            {!diagnostics ? (
              <div className="text-center py-12 text-white/30 text-sm">Loading pipeline diagnostics…</div>
            ) : (
              <>
                {/* ── Verification 1: DB Event Counts ── */}
                <div className="rounded-2xl p-4" style={{ background: 'rgba(0,200,255,0.04)', border: '1px solid rgba(0,200,255,0.12)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Database size={14} style={{ color: '#00c8ff' }} />
                    <span className="text-xs font-black tracking-widest" style={{ color: '#00c8ff' }}>VERIFICATION 1 — DATABASE EVENTS</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: 'Total in DB', value: diagnostics.counts.total, color: '#00c8ff' },
                      { label: 'Live / Active', value: diagnostics.counts.live, color: '#10b981' },
                      { label: 'Upcoming', value: diagnostics.counts.upcoming, color: '#a855f7' },
                    ].map((c) => (
                      <div key={c.label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div className="text-2xl font-black" style={{ color: c.color }}>{c.value.toLocaleString()}</div>
                        <div className="text-[10px] text-white/40 mt-0.5 font-semibold uppercase tracking-wider">{c.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* By source */}
                  <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold mb-2">Live events by source</p>
                  <div className="space-y-1.5">
                    {(['eventbrite', 'serpapi', 'perplexity', 'ticketmaster', 'skiddle', 'manual'] as const).map((src) => {
                      const count = diagnostics.bySource[src] ?? 0
                      const total = diagnostics.counts.live || 1
                      const pct = Math.round((count / total) * 100)
                      const colors: Record<string, string> = { eventbrite: '#f97316', serpapi: '#3b82f6', perplexity: '#8b5cf6', ticketmaster: '#06b6d4', skiddle: '#10b981', manual: '#f59e0b' }
                      const color = colors[src] ?? '#fff'
                      return (
                        <div key={src} className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold w-20 text-right capitalize" style={{ color: 'rgba(255,255,255,0.5)' }}>{src}</span>
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                          </div>
                          <span className="text-[10px] font-bold w-8" style={{ color }}>{count}</span>
                        </div>
                      )
                    })}
                  </div>
                  {/* By type */}
                  {Object.keys(diagnostics.byType).length > 0 && (
                    <>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold mt-3 mb-2">Live events by type</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(diagnostics.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                          <span key={type} className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            {type.replace('_', ' ')} <span style={{ color: '#a855f7' }}>{count}</span>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* ── Verification 2: API Source Status ── */}
                <div className="rounded-2xl p-4" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.12)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Wifi size={14} style={{ color: '#a855f7' }} />
                    <span className="text-xs font-black tracking-widest" style={{ color: '#a855f7' }}>VERIFICATION 2 — DATA SOURCE CONNECTIVITY</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {([
                      { key: 'eventbrite', label: 'Eventbrite', desc: 'Music & Nightlife categories', color: '#f97316' },
                      { key: 'serpapi', label: 'SerpAPI (Google Events)', desc: 'Real-time Google nightlife search', color: '#3b82f6' },
                      { key: 'perplexity', label: 'Perplexity AI', desc: 'AI-powered event discovery (sonar-pro)', color: '#8b5cf6' },
                      { key: 'ticketmaster', label: 'Ticketmaster', desc: 'Large venue concerts & shows', color: '#06b6d4' },
                      { key: 'skiddle', label: 'Skiddle', desc: 'UK nightlife events API', color: '#10b981' },
                    ] as { key: keyof EventDiagnostics['apiKeys']; label: string; desc: string; color: string }[]).map(({ key, label, desc, color }) => {
                      const active = diagnostics.apiKeys[key]
                      const count = diagnostics.bySource[key] ?? 0
                      return (
                        <div key={key} className="flex items-center gap-3 rounded-xl p-3" style={{ background: active ? `${color}08` : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? `${color}25` : 'rgba(255,255,255,0.05)'}` }}>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: active ? `${color}20` : 'rgba(255,255,255,0.04)' }}>
                            {active ? <Wifi size={13} style={{ color }} /> : <WifiOff size={13} style={{ color: 'rgba(255,255,255,0.2)' }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold" style={{ color: active ? '#fff' : 'rgba(255,255,255,0.3)' }}>{label}</span>
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: active ? `${color}20` : 'rgba(255,255,255,0.04)', color: active ? color : 'rgba(255,255,255,0.2)' }}>
                                {active ? '● ACTIVE' : '○ NO KEY'}
                              </span>
                              {active && count > 0 && (
                                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{count} events live</span>
                              )}
                            </div>
                            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{desc}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* ── Recent synced events ── */}
                {diagnostics.recentSynced.length > 0 && (
                  <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold mb-2">Last 5 synced events</p>
                    <div className="space-y-2">
                      {diagnostics.recentSynced.map((ev) => (
                        <div key={ev.id} className="flex items-center gap-2 text-xs">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded capitalize" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
                            {ev.externalSource ?? 'manual'}
                          </span>
                          <span className="text-white/70 font-medium truncate flex-1">{ev.name}</span>
                          <span className="text-white/30 flex-shrink-0 flex items-center gap-1">
                            <MapPin size={9} />{ev.neighbourhood}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Manual sync trigger ── */}
                <div className="rounded-2xl p-4" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.12)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap size={14} style={{ color: '#10b981' }} />
                    <span className="text-xs font-black tracking-widest" style={{ color: '#10b981' }}>MANUAL SYNC TRIGGER</span>
                  </div>
                  <p className="text-xs text-white/40 mb-3">Force-sync all active sources for a city (bypasses 30-min throttle)</p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <input
                      value={syncCity} onChange={(e) => setSyncCity(e.target.value)}
                      placeholder="City (e.g. Glasgow)"
                      className="col-span-3 px-3 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                    <input
                      value={syncLat} onChange={(e) => setSyncLat(e.target.value)}
                      placeholder="Latitude"
                      className="px-3 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                    <input
                      value={syncLng} onChange={(e) => setSyncLng(e.target.value)}
                      placeholder="Longitude"
                      className="px-3 py-2 rounded-xl text-sm text-white placeholder-white/20 outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                    <button
                      onClick={handleManualSync}
                      disabled={syncing}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                      style={{ background: '#10b98120', color: '#10b981', border: '1px solid #10b98140' }}
                    >
                      {syncing ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
                      {syncing ? 'Syncing…' : 'Run Sync'}
                    </button>
                  </div>
                  {/* Quick-fill Glasgow */}
                  <button
                    onClick={() => { setSyncCity('Glasgow'); setSyncLat('55.8642'); setSyncLng('-4.2518') }}
                    className="text-[10px] font-semibold px-2 py-1 rounded-lg mr-2"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}
                  >
                    📍 Glasgow
                  </button>
                  <button
                    onClick={() => { setSyncCity('London'); setSyncLat('51.5074'); setSyncLng('-0.1278') }}
                    className="text-[10px] font-semibold px-2 py-1 rounded-lg mr-2"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}
                  >
                    📍 London
                  </button>
                  <button
                    onClick={() => { setSyncCity('Manchester'); setSyncLat('53.4808'); setSyncLng('-2.2426') }}
                    className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}
                  >
                    📍 Manchester
                  </button>
                  {syncResult && (
                    <div className="mt-3 rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      <CheckCircle size={14} style={{ color: '#10b981' }} />
                      <div className="text-xs">
                        <span className="text-white font-semibold">{syncResult.imported} imported</span>
                        <span className="text-white/40"> · {syncResult.skipped} skipped</span>
                        <span className="text-white/30"> · sources: {syncResult.sources.join(', ') || 'none'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Reports tab ── */}
        {tab === 'reports' && (
          <div className="space-y-2">
            {reports.length === 0 && (
              <div className="text-center py-12 text-white/30 text-sm">No reports yet — all clear ✅</div>
            )}
            {reports.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl p-4"
                style={{
                  background: r.isHidden ? 'rgba(255,255,255,0.02)' : 'rgba(239,68,68,0.04)',
                  border: `1px solid ${r.isHidden ? 'rgba(255,255,255,0.05)' : 'rgba(239,68,68,0.15)'}`,
                  opacity: r.isHidden ? 0.5 : 1,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440' }}>
                        {r.reportCount} report{r.reportCount !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-white/40 capitalize">{r.category}</span>
                      {r.isHidden && <span className="text-xs text-white/30">Hidden</span>}
                    </div>
                    <div className="text-xs text-white/60 mb-1">
                      <span className="text-white font-semibold">@{r.fromUser.username}</span>
                      <span className="text-white/30"> → </span>
                      <span className="text-white font-semibold">@{r.toUser.username}</span>
                    </div>
                    {r.comment && (
                      <p className="text-xs text-white/40 italic line-clamp-2">"{r.comment}"</p>
                    )}
                  </div>
                  {!r.isHidden && (
                    <button
                      onClick={() => handleHideFeedback(r.id)}
                      className="p-2 rounded-xl flex-shrink-0"
                      style={{ background: '#10b98115', color: '#10b981', border: '1px solid #10b98130' }}
                      title="Hide this report"
                    >
                      <CheckCircle size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Close role menu on outside click */}
      {roleMenuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setRoleMenuOpen(null)} />
      )}
    </div>
  )
}
