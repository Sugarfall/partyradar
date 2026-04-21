'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageCircle, Send, ArrowLeft, Search, LogIn, Zap, User, Bell, BellOff,
  Users, UserPlus, UserCheck, Hash, Lock, Crown, Eye, EyeOff, X,
  Camera, Mic, Radio, Play, Square, ShieldCheck, Timer, Flag,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { uploadImage } from '@/lib/cloudinary'
import { getOrCreateKeyPair, serializePublicKey, encryptMessage, decryptMessage } from '@/lib/e2e'
import { formatPrice } from '@/lib/currency'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OtherUser {
  id: string
  displayName: string
  photoUrl?: string | null
  username?: string
}

interface Conversation {
  id: string
  updatedAt: string
  other: OtherUser | null
  lastMessage: { text: string; senderId: string; createdAt: string } | null
  isRequest?: boolean
}

interface DmMessage {
  id: string
  senderId: string
  senderName: string
  senderPhoto?: string | null
  text: string
  isSnap?: boolean
  snapViewed?: boolean
  createdAt: string
}

interface GroupChat {
  id: string
  slug: string
  name: string
  description?: string | null
  type: 'GENRE' | 'VENUE' | 'FESTIVAL' | 'TRIP'
  emoji: string
  coverColor: string
  isPrivate?: boolean
  isPaid?: boolean
  priceMonthly?: number | null
  isOwner?: boolean
  isSubscribed?: boolean
  memberCount: number
  isJoined: boolean
  notificationsEnabled: boolean
  lastMessage: { text: string; senderName: string; createdAt: string } | null
}

interface GroupMessage {
  id: string
  senderId: string
  senderName: string
  senderPhoto?: string | null
  senderUsername?: string | null
  text: string | null
  imageUrl?: string | null
  createdAt: string
  isFollowing: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function Avatar({ user, size = 40 }: { user: { displayName: string; photoUrl?: string | null }; size?: number }) {
  return user.photoUrl ? (
    <img src={user.photoUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
      style={{ width: size, height: size, background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)' }}>
      {user.displayName[0]?.toUpperCase()}
    </div>
  )
}

// ─── Community: Host Group Dashboard ──────────────────────────────────────────

function HostGroupDashboard({
  groups, onOpen, onCreateGroup, dbUserId,
}: {
  groups: GroupChat[]
  onOpen: (g: GroupChat) => void
  onCreateGroup: (group: GroupChat) => void
  dbUserId: string | null
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newEmoji, setNewEmoji] = useState('💬')
  const [newColor, setNewColor] = useState('#a855f7')
  const [newPrivate, setNewPrivate] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [newPaid, setNewPaid] = useState(false)
  const [newPriceTier, setNewPriceTier] = useState('MICRO')
  const [creating, setCreating] = useState(false)

  const myGroups = groups.filter((g) => g.isOwner)
  // Bug 13 fix: memberCount includes the owner — subtract 1 per paid group
  const totalSubs = myGroups.reduce((sum, g) => sum + (g.isPaid ? Math.max(0, g.memberCount - 1) : 0), 0)
  const paidGroups = myGroups.filter((g) => g.isPaid)

  const COLORS = ['#a855f7', '#3b82f6', '#ec4899', '#10b981', '#f97316', '#ef4444', '#06b6d4', '#6366f1', '#eab308', '#f43f5e']
  const EMOJIS = ['💬', '🎵', '🎉', '🌙', '🔥', '💜', '🎶', '⚡', '🌈', '🫶', '🎪', '🤙']

  async function handleCreate() {
    if (!newName.trim() || creating) return
    if (newPrivate && !newPaid && newPassword.trim().length < 4) return
    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        name: newName.trim(), description: newDesc.trim() || undefined,
        emoji: newEmoji, coverColor: newColor,
      }
      if (newPaid) {
        body.isPaid = true
        body.priceTierId = newPriceTier
      } else if (newPrivate) {
        body.isPrivate = true
        body.password = newPassword.trim()
      }
      const j = await api.post<{ data: GroupChat }>('/groups', body)
      if (j?.data) {
        onCreateGroup(j.data)
        setShowCreate(false); setNewName(''); setNewDesc(''); setNewEmoji('💬'); setNewColor('#a855f7')
        setNewPrivate(false); setNewPassword(''); setNewPaid(false); setNewPriceTier('MICRO')
      }
    } catch {}
    finally { setCreating(false) }
  }

  return (
    <div className="pb-28 max-w-xl mx-auto">
      {/* Stats bar */}
      <div className="px-4 pb-4 grid grid-cols-3 gap-2">
        {[
          { label: 'MY GROUPS', value: myGroups.length, color: '#a855f7' },
          { label: 'PAID GROUPS', value: paidGroups.length, color: '#ffd600' },
          { label: 'SUBSCRIBERS', value: totalSubs, color: '#00ff88' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl py-3 text-center"
            style={{ background: `${s.color}08`, border: `1px solid ${s.color}25` }}>
            <p className="text-lg font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[8px] font-bold tracking-widest" style={{ color: `${s.color}60` }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Create group CTA */}
      {dbUserId && (
        <div className="px-4 mb-4">
          <button onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-xs font-black tracking-widest transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(var(--accent-rgb),0.08) 100%)',
              border: '1px solid rgba(168,85,247,0.35)',
              color: '#a855f7',
            }}>
            + CREATE NEW GROUP
          </button>
        </div>
      )}

      {/* My groups list */}
      {myGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 px-4">
          <Crown size={32} style={{ color: 'rgba(168,85,247,0.2)' }} />
          <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(168,85,247,0.4)' }}>NO GROUPS YET</p>
          <p className="text-[11px] text-center" style={{ color: 'rgba(224,242,254,0.3)', maxWidth: 260 }}>
            Create your first group to build a community. Set it as paid to earn revenue from subscribers.
          </p>
        </div>
      ) : (
        <div className="px-4 space-y-2">
          {myGroups.map((g) => (
            <button key={g.id} onClick={() => onOpen(g)}
              className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all"
              style={{
                background: g.isPaid
                  ? 'linear-gradient(135deg, rgba(255,214,0,0.04) 0%, rgba(168,85,247,0.04) 100%)'
                  : 'rgba(7,7,26,0.85)',
                border: `1px solid ${g.isPaid ? 'rgba(255,214,0,0.2)' : 'rgba(168,85,247,0.15)'}`,
              }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl"
                style={{ background: `${g.coverColor}18`, border: `1px solid ${g.coverColor}30` }}>
                {g.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black truncate" style={{ color: '#e0f2fe' }}>{g.name}</p>
                  {g.isPaid && (
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0"
                      style={{ background: 'rgba(255,214,0,0.15)', border: '1px solid rgba(255,214,0,0.3)', color: '#ffd600' }}>
                      <Crown size={7} /> {formatPrice(g.priceMonthly ?? 0)}/mo
                    </span>
                  )}
                  {g.isPrivate && !g.isPaid && (
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0"
                      style={{ background: 'rgba(255,0,110,0.12)', border: '1px solid rgba(255,0,110,0.3)', color: '#ff006e' }}>
                      <Lock size={7} /> PRIVATE
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[10px] flex items-center gap-1" style={{ color: 'rgba(224,242,254,0.4)' }}>
                    <Users size={9} /> {g.memberCount} members
                  </span>
                  {g.isPaid && (
                    <span className="text-[10px] flex items-center gap-1" style={{ color: 'rgba(0,255,136,0.5)' }}>
                      💰 earning
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[8px] font-black px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(168,85,247,0.12)', color: 'rgba(168,85,247,0.6)' }}>
                  OWNER
                </span>
                {g.lastMessage && (
                  <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.2)' }}>
                    {timeAgo(g.lastMessage.createdAt)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create group modal — same as attendee but default to paid */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-sm rounded-2xl p-5 space-y-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}
            style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(168,85,247,0.2)' }}>
            <p className="text-xs font-black tracking-widest" style={{ color: '#a855f7' }}>CREATE GROUP</p>

            <input type="text" placeholder="Group name" value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 40))}
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none"
              style={{ border: '1px solid rgba(168,85,247,0.2)', color: '#e0f2fe' }} />

            <input type="text" placeholder="Description (optional)" value={newDesc}
              onChange={(e) => setNewDesc(e.target.value.slice(0, 200))}
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none"
              style={{ border: '1px solid rgba(168,85,247,0.12)', color: '#e0f2fe' }} />

            {/* Emoji picker */}
            <div>
              <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: 'rgba(168,85,247,0.5)' }}>EMOJI</p>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map((e) => (
                  <button key={e} onClick={() => setNewEmoji(e)}
                    className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all"
                    style={{
                      background: newEmoji === e ? 'rgba(168,85,247,0.15)' : 'rgba(168,85,247,0.03)',
                      border: `1px solid ${newEmoji === e ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.08)'}`,
                    }}>{e}</button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div>
              <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: 'rgba(168,85,247,0.5)' }}>COLOR</p>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setNewColor(c)}
                    className="w-7 h-7 rounded-full transition-all"
                    style={{
                      background: c,
                      border: newColor === c ? '2px solid #e0f2fe' : '2px solid transparent',
                      boxShadow: newColor === c ? `0 0 8px ${c}` : 'none',
                    }} />
                ))}
              </div>
            </div>

            {/* Access type */}
            <div>
              <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: 'rgba(168,85,247,0.5)' }}>ACCESS</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'public', label: 'Public', icon: <Users size={14} />, active: !newPrivate && !newPaid },
                  { id: 'private', label: 'Private', icon: <Lock size={14} />, active: newPrivate && !newPaid },
                  { id: 'paid', label: 'Paid', icon: <Crown size={14} />, active: newPaid },
                ].map((opt) => (
                  <button key={opt.id} onClick={() => {
                    if (opt.id === 'public') { setNewPrivate(false); setNewPaid(false) }
                    else if (opt.id === 'private') { setNewPrivate(true); setNewPaid(false) }
                    else { setNewPaid(true); setNewPrivate(false) }
                  }}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all"
                    style={{
                      background: opt.active ? 'rgba(168,85,247,0.12)' : 'rgba(168,85,247,0.03)',
                      border: `1px solid ${opt.active ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.08)'}`,
                      color: opt.active ? '#a855f7' : 'rgba(224,242,254,0.35)',
                    }}>
                    {opt.icon}
                    <span className="text-[9px] font-bold tracking-wide">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Password field for private groups */}
            {newPrivate && !newPaid && (
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} placeholder="Group password (min 4 chars)"
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm bg-transparent outline-none"
                  style={{ border: '1px solid rgba(255,0,110,0.25)', color: '#e0f2fe' }} />
                <button onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(224,242,254,0.3)' }}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            )}

            {/* Price tier for paid groups */}
            {newPaid && (
              <div>
                <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: 'rgba(255,214,0,0.5)' }}>SUBSCRIPTION PRICE</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'MICRO', price: '£0.99', label: 'Micro' },
                    { id: 'STANDARD', price: '£2.99', label: 'Standard' },
                    { id: 'VIP', price: '£4.99', label: 'VIP' },
                    { id: 'ELITE', price: '£9.99', label: 'Elite' },
                  ].map((t) => {
                    const active = newPriceTier === t.id
                    return (
                      <button key={t.id} onClick={() => setNewPriceTier(t.id)}
                        className="py-2 rounded-xl text-center transition-all"
                        style={{
                          background: active ? 'rgba(255,214,0,0.12)' : 'rgba(168,85,247,0.03)',
                          border: `1px solid ${active ? 'rgba(255,214,0,0.4)' : 'rgba(168,85,247,0.08)'}`,
                        }}>
                        <p className="text-sm font-black" style={{ color: active ? '#ffd600' : 'rgba(224,242,254,0.5)' }}>{t.price}<span className="text-[9px] font-normal">/mo</span></p>
                        <p className="text-[9px]" style={{ color: active ? 'rgba(255,214,0,0.6)' : 'rgba(224,242,254,0.3)' }}>{t.label}</p>
                      </button>
                    )
                  })}
                </div>
                <p className="text-[8px] mt-1.5" style={{ color: 'rgba(255,214,0,0.35)' }}>
                  You earn 80% of subscription revenue. Platform takes 20%.
                </p>
              </div>
            )}

            {/* Preview */}
            <div className="p-3 rounded-xl" style={{ background: `${newColor}18`, border: `1px solid ${newColor}40` }}>
              <div className="flex items-center justify-between">
                <span className="text-2xl">{newEmoji}</span>
                <div className="flex gap-1">
                  {newPaid && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,214,0,0.15)', color: '#ffd600' }}>PAID</span>}
                  {newPrivate && !newPaid && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,0,110,0.12)', color: '#ff006e' }}>PRIVATE</span>}
                </div>
              </div>
              <p className="text-sm font-black mt-1" style={{ color: '#e0f2fe' }}>{newName || 'Group Name'}</p>
              {newDesc && <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.45)' }}>{newDesc}</p>}
            </div>

            <button onClick={handleCreate}
              disabled={!newName.trim() || creating || (newPrivate && !newPaid && newPassword.trim().length < 4)}
              className="w-full py-3 rounded-xl text-xs font-black tracking-widest transition-all disabled:opacity-40"
              style={{
                background: newPaid ? 'rgba(255,214,0,0.12)' : 'rgba(168,85,247,0.12)',
                border: `1px solid ${newPaid ? 'rgba(255,214,0,0.35)' : 'rgba(168,85,247,0.35)'}`,
                color: newPaid ? '#ffd600' : '#a855f7',
              }}>
              {creating ? 'CREATING...' : newPaid ? 'CREATE PAID GROUP' : 'CREATE GROUP'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Community: Group Browser (Attendee) ─────────────────────────────────────

function GroupBrowser({
  groups, onOpen, onCreateGroup, dbUserId,
}: {
  groups: GroupChat[]
  onOpen: (g: GroupChat) => void
  onCreateGroup: (group: GroupChat) => void
  dbUserId: string | null
}) {
  const [sub, setSub] = useState<'genres' | 'venues' | 'festivals' | 'trips'>('genres')
  const [groupSearch, setGroupSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newEmoji, setNewEmoji] = useState('💬')
  const [newColor, setNewColor] = useState('#6366f1')
  const [newPrivate, setNewPrivate] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [newPaid, setNewPaid] = useState(false)
  const [newPriceTier, setNewPriceTier] = useState('MICRO')
  const [newGroupType, setNewGroupType] = useState<'GENRE' | 'FESTIVAL' | 'TRIP'>('GENRE')
  const [creating, setCreating] = useState(false)

  const q = groupSearch.toLowerCase()
  const filteredGroups = q ? groups.filter((g) => g.name.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q)) : groups
  const genres = filteredGroups.filter((g) => g.type === 'GENRE')
  const venues = filteredGroups.filter((g) => g.type === 'VENUE')
  const festivals = filteredGroups.filter((g) => g.type === 'FESTIVAL')
  const trips = filteredGroups.filter((g) => g.type === 'TRIP')

  const GENRE_ORDER = ['genre-rave', 'genre-house', 'genre-rnb', 'genre-trippy', 'genre-dnb', 'genre-afrobeats', 'genre-rock', 'genre-electronic']
  const sortedGenres = [...genres].sort((a, b) => {
    const aIdx = GENRE_ORDER.indexOf(a.slug)
    const bIdx = GENRE_ORDER.indexOf(b.slug)
    // Known genres first, then user-created sorted by name
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx
    if (aIdx >= 0) return -1
    if (bIdx >= 0) return 1
    return a.name.localeCompare(b.name)
  })

  async function handleCreate() {
    if (!newName.trim() || creating) return
    if (newPrivate && !newPaid && newPassword.trim().length < 4) return
    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        name: newName.trim(), description: newDesc.trim() || undefined,
        emoji: newEmoji, coverColor: newColor,
        type: newGroupType,
      }
      if (newPaid) {
        body.isPaid = true
        body.priceTierId = newPriceTier
      } else if (newPrivate) {
        body.isPrivate = true
        body.password = newPassword.trim()
      }
      const j = await api.post<{ data: GroupChat }>('/groups', body)
      if (j?.data) {
        onCreateGroup(j.data)
        setShowCreate(false); setNewName(''); setNewDesc(''); setNewEmoji('💬'); setNewColor('#6366f1')
        setNewPrivate(false); setNewPassword(''); setNewPaid(false); setNewPriceTier('MICRO'); setNewGroupType('GENRE')
      }
    } catch {}
    finally { setCreating(false) }
  }

  const COLORS = ['#a855f7', '#3b82f6', '#ec4899', '#10b981', '#f97316', '#ef4444', '#06b6d4', '#6366f1', '#eab308', '#f43f5e']
  const EMOJIS = ['💬', '🎵', '🎉', '🌙', '🔥', '💜', '🎶', '⚡', '🌈', '🫶', '🎪', '🤙']

  return (
    <div className="pb-28">
      {/* Group search */}
      <div className="px-4 pb-3 relative">
        <Search size={12} className="absolute left-7 top-1/2 -translate-y-1/2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
        <input
          value={groupSearch}
          onChange={(e) => setGroupSearch(e.target.value)}
          placeholder="Search groups..."
          className="w-full pl-8 pr-3 py-2 rounded-xl text-xs font-medium focus:outline-none"
          style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.12)', color: '#e0f2fe' }}
        />
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 px-4 pb-3 overflow-x-auto no-scrollbar">
        {([
          { key: 'genres', label: '🎵 GENRES' },
          { key: 'venues', label: '🏙️ VENUES' },
          { key: 'festivals', label: '🎪 FESTIVALS' },
          { key: 'trips', label: '✈️ TRIPS' },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setSub(key)}
            className="shrink-0 py-2 px-3 rounded-xl text-[11px] font-black tracking-widest transition-all"
            style={{
              background: sub === key ? 'rgba(var(--accent-rgb),0.1)' : 'transparent',
              border: `1px solid ${sub === key ? 'rgba(var(--accent-rgb),0.3)' : 'rgba(var(--accent-rgb),0.07)'}`,
              color: sub === key ? 'var(--accent)' : 'rgba(74,96,128,0.5)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {sub === 'genres' && (
        <div className="px-4 grid grid-cols-2 gap-3">
          {sortedGenres.map((g) => (
            <button key={g.id} onClick={() => onOpen(g)}
              className="relative p-4 rounded-2xl text-left overflow-hidden transition-transform active:scale-95"
              style={{ background: `${g.coverColor}18`, border: `1px solid ${g.coverColor}40` }}>
              {/* Badges */}
              <div className="absolute top-2 right-2 flex gap-1">
                {g.isPaid && (
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5"
                    style={{ background: 'rgba(255,214,0,0.15)', border: '1px solid rgba(255,214,0,0.4)', color: '#ffd600' }}>
                    <Crown size={7} /> {formatPrice(g.priceMonthly ?? 0)}/mo
                  </span>
                )}
                {g.isPrivate && !g.isPaid && (
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5"
                    style={{ background: 'rgba(255,0,110,0.12)', border: '1px solid rgba(255,0,110,0.3)', color: '#ff006e' }}>
                    <Lock size={7} />
                  </span>
                )}
              </div>
              <div className="text-3xl mb-2">{g.emoji}</div>
              <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{g.name}</p>
              <p className="text-[10px] mt-0.5 leading-snug line-clamp-2" style={{ color: 'rgba(224,242,254,0.45)' }}>
                {g.description}
              </p>
              <div className="flex items-center gap-1 mt-2">
                <Users size={9} style={{ color: g.coverColor }} />
                <span className="text-[9px] font-bold" style={{ color: g.coverColor }}>{g.memberCount} members</span>
                {g.isJoined && (
                  <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded font-bold"
                    style={{ background: `${g.coverColor}20`, color: g.coverColor }}>
                    {g.isPaid ? 'SUBSCRIBED' : 'JOINED'}
                  </span>
                )}
              </div>
              {g.lastMessage && (
                <p className="text-[9px] mt-1.5 truncate" style={{ color: 'rgba(224,242,254,0.25)' }}>
                  {g.lastMessage.senderName}: {g.lastMessage.text.startsWith('[VOICE]') ? '🎤 Voice message' : g.lastMessage.text}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {(sub === 'venues' || sub === 'festivals' || sub === 'trips') && (() => {
        const list = sub === 'venues' ? venues : sub === 'festivals' ? festivals : trips
        const emptyMsg = sub === 'venues' ? 'No venue chats nearby yet'
          : sub === 'festivals' ? 'No festival groups yet — create one!'
          : 'No trip groups yet — plan your first trip!'
        return (
          <div className="px-4 space-y-2">
            {list.length === 0 ? (
              <div className="py-16 text-center text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>
                {emptyMsg}
              </div>
            ) : list.map((g) => (
              <button key={g.id} onClick={() => onOpen(g)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all"
                style={{ background: 'rgba(7,7,26,0.85)', border: '1px solid rgba(var(--accent-rgb),0.07)' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.2)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.07)')}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg"
                  style={{ background: `${g.coverColor}18`, border: `1px solid ${g.coverColor}30` }}>
                  {g.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{g.name}</p>
                    {g.isJoined && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0"
                        style={{ background: `${g.coverColor}20`, color: g.coverColor }}>JOINED</span>
                    )}
                  </div>
                  {g.lastMessage ? (
                    <p className="text-[11px] truncate" style={{ color: 'rgba(224,242,254,0.35)' }}>
                      {g.lastMessage.senderName}: {g.lastMessage.text.startsWith('[VOICE]') ? '🎤 Voice message' : g.lastMessage.text}
                    </p>
                  ) : (
                    <p className="text-[11px]" style={{ color: 'rgba(var(--accent-rgb),0.25)' }}>No messages yet — be first!</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.2)' }}>
                    {g.memberCount} <Users size={8} className="inline" />
                  </span>
                  {g.lastMessage && (
                    <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.2)' }}>
                      {timeAgo(g.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )
      })()}

      {/* Create group button */}
      {dbUserId && (
        <div className="px-4 mt-4">
          <button onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black tracking-widest transition-all"
            style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px dashed rgba(var(--accent-rgb),0.2)', color: 'rgba(var(--accent-rgb),0.5)' }}>
            + CREATE GROUP
          </button>
        </div>
      )}

      {/* Create group modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-sm rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}
            style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}>
            <p className="text-xs font-black tracking-widest" style={{ color: 'var(--accent)' }}>CREATE GROUP</p>

            {/* Group type */}
            <div>
              <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>TYPE</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'GENRE', label: '🎵 Music', color: '#a855f7' },
                  { id: 'FESTIVAL', label: '🎪 Festival', color: '#f97316' },
                  { id: 'TRIP', label: '✈️ Trip', color: '#10b981' },
                ] as const).map((t) => (
                  <button key={t.id} onClick={() => setNewGroupType(t.id)}
                    className="py-2 rounded-xl text-center text-[10px] font-black transition-all"
                    style={{
                      background: newGroupType === t.id ? `${t.color}18` : 'rgba(var(--accent-rgb),0.03)',
                      border: `1px solid ${newGroupType === t.id ? `${t.color}50` : 'rgba(var(--accent-rgb),0.08)'}`,
                      color: newGroupType === t.id ? t.color : 'rgba(224,242,254,0.4)',
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <input type="text" placeholder="Group name" value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 40))}
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none"
              style={{ border: '1px solid rgba(var(--accent-rgb),0.15)', color: '#e0f2fe' }} />

            <input type="text" placeholder="Description (optional)" value={newDesc}
              onChange={(e) => setNewDesc(e.target.value.slice(0, 200))}
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none"
              style={{ border: '1px solid rgba(var(--accent-rgb),0.1)', color: '#e0f2fe' }} />

            {/* Emoji picker */}
            <div>
              <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>EMOJI</p>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map((e) => (
                  <button key={e} onClick={() => setNewEmoji(e)}
                    className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all"
                    style={{
                      background: newEmoji === e ? 'rgba(var(--accent-rgb),0.15)' : 'rgba(var(--accent-rgb),0.03)',
                      border: `1px solid ${newEmoji === e ? 'rgba(var(--accent-rgb),0.4)' : 'rgba(var(--accent-rgb),0.08)'}`,
                    }}>{e}</button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div>
              <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>COLOR</p>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setNewColor(c)}
                    className="w-7 h-7 rounded-full transition-all"
                    style={{
                      background: c,
                      border: newColor === c ? '2px solid #e0f2fe' : '2px solid transparent',
                      boxShadow: newColor === c ? `0 0 8px ${c}` : 'none',
                    }} />
                ))}
              </div>
            </div>

            {/* Access type */}
            <div>
              <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>ACCESS</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'public', label: 'Public', icon: <Users size={14} />, active: !newPrivate && !newPaid },
                  { id: 'private', label: 'Private', icon: <Lock size={14} />, active: newPrivate && !newPaid },
                  { id: 'paid', label: 'Paid', icon: <Crown size={14} />, active: newPaid },
                ].map((opt) => (
                  <button key={opt.id} onClick={() => {
                    if (opt.id === 'public') { setNewPrivate(false); setNewPaid(false) }
                    else if (opt.id === 'private') { setNewPrivate(true); setNewPaid(false) }
                    else { setNewPaid(true); setNewPrivate(false) }
                  }}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all"
                    style={{
                      background: opt.active ? 'rgba(var(--accent-rgb),0.12)' : 'rgba(var(--accent-rgb),0.03)',
                      border: `1px solid ${opt.active ? 'rgba(var(--accent-rgb),0.4)' : 'rgba(var(--accent-rgb),0.08)'}`,
                      color: opt.active ? 'var(--accent)' : 'rgba(224,242,254,0.35)',
                    }}>
                    {opt.icon}
                    <span className="text-[9px] font-bold tracking-wide">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Password field for private groups */}
            {newPrivate && !newPaid && (
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} placeholder="Group password (min 4 chars)"
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm bg-transparent outline-none"
                  style={{ border: '1px solid rgba(255,0,110,0.25)', color: '#e0f2fe' }} />
                <button onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(224,242,254,0.3)' }}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            )}

            {/* Price tier for paid groups */}
            {newPaid && (
              <div>
                <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: 'rgba(255,214,0,0.5)' }}>SUBSCRIPTION PRICE</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'MICRO', price: '£0.99', label: 'Micro' },
                    { id: 'STANDARD', price: '£2.99', label: 'Standard' },
                    { id: 'VIP', price: '£4.99', label: 'VIP' },
                    { id: 'ELITE', price: '£9.99', label: 'Elite' },
                  ].map((t) => {
                    const active = newPriceTier === t.id
                    return (
                      <button key={t.id} onClick={() => setNewPriceTier(t.id)}
                        className="py-2 rounded-xl text-center transition-all"
                        style={{
                          background: active ? 'rgba(255,214,0,0.12)' : 'rgba(var(--accent-rgb),0.03)',
                          border: `1px solid ${active ? 'rgba(255,214,0,0.4)' : 'rgba(var(--accent-rgb),0.08)'}`,
                        }}>
                        <p className="text-sm font-black" style={{ color: active ? '#ffd600' : 'rgba(224,242,254,0.5)' }}>{t.price}<span className="text-[9px] font-normal">/mo</span></p>
                        <p className="text-[9px]" style={{ color: active ? 'rgba(255,214,0,0.6)' : 'rgba(224,242,254,0.3)' }}>{t.label}</p>
                      </button>
                    )
                  })}
                </div>
                <p className="text-[8px] mt-1.5" style={{ color: 'rgba(255,214,0,0.35)' }}>
                  You earn 80% of subscription revenue. Platform takes 20%.
                </p>
              </div>
            )}

            {/* Preview */}
            <div className="p-3 rounded-xl" style={{ background: `${newColor}18`, border: `1px solid ${newColor}40` }}>
              <div className="flex items-center justify-between">
                <span className="text-2xl">{newEmoji}</span>
                <div className="flex gap-1">
                  {newPaid && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,214,0,0.15)', color: '#ffd600' }}>PAID</span>}
                  {newPrivate && !newPaid && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,0,110,0.12)', color: '#ff006e' }}>PRIVATE</span>}
                </div>
              </div>
              <p className="text-sm font-black mt-1" style={{ color: '#e0f2fe' }}>{newName || 'Group Name'}</p>
              {newDesc && <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.45)' }}>{newDesc}</p>}
            </div>

            <button onClick={handleCreate}
              disabled={!newName.trim() || creating || (newPrivate && !newPaid && newPassword.trim().length < 4)}
              className="w-full py-3 rounded-xl text-xs font-black tracking-widest transition-all disabled:opacity-40"
              style={{
                background: newPaid ? 'rgba(255,214,0,0.12)' : 'rgba(var(--accent-rgb),0.12)',
                border: `1px solid ${newPaid ? 'rgba(255,214,0,0.35)' : 'rgba(var(--accent-rgb),0.35)'}`,
                color: newPaid ? '#ffd600' : 'var(--accent)',
              }}>
              {creating ? 'CREATING...' : newPaid ? 'CREATE PAID GROUP' : 'CREATE GROUP'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Community: Group Chat View ───────────────────────────────────────────────

function GroupChatView({
  groupId, onBack, dbUserId, token,
  onGroupUpdate,
}: {
  groupId: string
  onBack: () => void
  dbUserId: string | null
  token: string
  onGroupUpdate: (id: string, patch: Partial<GroupChat>) => void
}) {
  const [group, setGroup] = useState<GroupChat | null>(null)
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [userPopup, setUserPopup] = useState<GroupMessage | null>(null)
  const [reportedMsgId, setReportedMsgId] = useState<string | null>(null)
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set())
  const [locked, setLocked] = useState(false)
  const [showPwModal, setShowPwModal] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState('')
  const [showSubModal, setShowSubModal] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  // Pub crawl
  const [activeTab, setActiveTab] = useState<'chat' | 'crawl'>('chat')
  const [crawl, setCrawl] = useState<any>(null)
  const [crawlLoading, setCrawlLoading] = useState(false)
  const [showCreateCrawl, setShowCreateCrawl] = useState(false)
  const [crawlName, setCrawlName] = useState('')
  const [crawlStops, setCrawlStops] = useState([{ name: '', address: '' }, { name: '', address: '' }])
  const [crawlCreating, setCrawlCreating] = useState(false)
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [aiError, setAiError] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const j = await api.get<{ data: { group: GroupChat; locked: boolean; messages: GroupMessage[] } }>(`/groups/${groupId}/messages`)
      if (j.data) {
        setGroup(j.data.group)
        if (j.data.locked) {
          setLocked(true)
          setMessages([])
        } else {
          setLocked(false)
          setMessages(j.data.messages)
          const followed = new Set<string>(
            j.data.messages.filter((m: GroupMessage) => m.isFollowing).map((m: GroupMessage) => m.senderId),
          )
          setFollowingSet(followed)
        }
      }
    } catch {}
    if (!silent) setLoading(false)
  }, [groupId])

  useEffect(() => { load() }, [load])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Poll every 8s for new messages
  useEffect(() => {
    const t = setInterval(() => load(true), 8000)
    return () => clearInterval(t)
  }, [load])

  // Load pub crawl when switching to crawl tab
  const loadCrawl = useCallback(async () => {
    setCrawlLoading(true)
    try {
      const j = await api.get<{ data: unknown }>(`/groups/${groupId}/pub-crawl`)
      setCrawl(j.data)
    } catch {}
    finally { setCrawlLoading(false) }
  }, [groupId])

  useEffect(() => {
    if (activeTab === 'crawl') loadCrawl()
  }, [activeTab, loadCrawl])

  async function createCrawl() {
    if (!crawlName.trim() || crawlCreating) return
    const validStops = crawlStops.filter((s) => s.name.trim())
    if (validStops.length < 2) return
    setCrawlCreating(true)
    try {
      const j = await api.post<{ data: unknown }>(`/groups/${groupId}/pub-crawl`, { name: crawlName.trim(), stops: validStops })
      if (j.data) { setCrawl(j.data); setShowCreateCrawl(false); setCrawlName(''); setCrawlStops([{ name: '', address: '' }, { name: '', address: '' }]) }
    } catch {}
    finally { setCrawlCreating(false) }
  }

  async function suggestWithAI() {
    setAiSuggesting(true)
    setAiError('')
    try {
      // Try geolocation, fall back to Glasgow
      const loc = await new Promise<{ lat: number; lng: number }>((resolve) => {
        if (!navigator.geolocation) { resolve({ lat: 55.8642, lng: -4.2518 }); return }
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
          () => resolve({ lat: 55.8642, lng: -4.2518 }),
          { enableHighAccuracy: false, timeout: 6000 },
        )
      })
      const memberCount = group?.memberCount ?? 4
      const json = await api.post<{ data: { crawlTitle: string; route: Array<{ name: string; address: string }> } }>('/pub-crawl/generate', {
        lat: loc.lat,
        lng: loc.lng,
        groupSize: memberCount,
        startTime: '20:00',
        vibes: [],
        stops: Math.max(crawlStops.length, 4),
      })
      if (json?.data) {
        setCrawlName(json.data.crawlTitle)
        setCrawlStops(json.data.route.map((s) => ({ name: s.name, address: s.address ?? '' })))
      } else {
        setAiError('No suggestions returned — try again')
      }
    } catch (err: any) {
      setAiError(err?.message ?? 'AI suggestion failed')
    } finally {
      setAiSuggesting(false)
    }
  }

  async function checkIn(stopId: string) {
    try {
      await api.post(`/groups/${groupId}/pub-crawl/stops/${stopId}/checkin`, {})
      await loadCrawl()
    } catch {}
  }

  async function endCrawl() {
    await api.delete(`/groups/${groupId}/pub-crawl`).catch(() => {})
    setCrawl(null)
  }

  async function toggleJoin() {
    if (!group) return
    const joined = group.isJoined

    // If trying to join a paid group — show subscribe modal
    if (!joined && group.isPaid && !group.isSubscribed && !group.isOwner) {
      setShowSubModal(true)
      return
    }

    // If trying to join a private (non-paid) group — show password modal
    if (!joined && group.isPrivate && !group.isPaid && !group.isOwner) {
      setShowPwModal(true)
      return
    }

    try {
      await (joined ? api.delete(`/groups/${groupId}/leave`) : api.post(`/groups/${groupId}/join`, {}))
    } catch { return }
    {
      const patch = {
        isJoined: !joined,
        memberCount: group.memberCount + (joined ? -1 : 1),
        notificationsEnabled: joined ? false : true,
      }
      setGroup((g) => g ? { ...g, ...patch } : g)
      onGroupUpdate(groupId, patch)
      if (!joined && locked) load()
    }
  }

  async function joinWithPassword() {
    if (!pwInput.trim()) return
    setPwError('')
    try {
      await api.post(`/groups/${groupId}/join`, { password: pwInput.trim() })
      setShowPwModal(false); setPwInput('')
      const patch = { isJoined: true, memberCount: (group?.memberCount ?? 0) + 1, notificationsEnabled: true }
      setGroup((g) => g ? { ...g, ...patch } : g)
      onGroupUpdate(groupId, patch)
      load()
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Incorrect password')
    }
  }

  async function handleSubscribe() {
    setSubscribing(true)
    try {
      await api.post(`/groups/${groupId}/subscribe`, {})
      setShowSubModal(false)
      const patch = { isJoined: true, isSubscribed: true, memberCount: (group?.memberCount ?? 0) + 1, notificationsEnabled: true }
      setGroup((g) => g ? { ...g, ...patch } : g)
      onGroupUpdate(groupId, patch)
      load()
    } catch {}
    finally { setSubscribing(false) }
  }

  async function toggleNotifications() {
    if (!group) return
    const enabled = !group.notificationsEnabled
    await api.put(`/groups/${groupId}/notifications`, { enabled })
    setGroup((g) => g ? { ...g, notificationsEnabled: enabled } : g)
  }

  async function sendMessage() {
    if (!text.trim() || sending || !dbUserId) return
    setSending(true)
    const draft = text.trim()
    setText('')

    // Optimistic message — shown immediately while API call is in flight
    const optimisticId = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const optimisticMsg: GroupMessage = {
      id: optimisticId,
      senderId: dbUserId,
      senderName: '', // will be replaced by server response
      senderPhoto: null,
      senderUsername: null,
      text: draft,
      createdAt: new Date().toISOString(),
      isFollowing: false,
    }
    setMessages((prev) => [...prev, optimisticMsg])

    try {
      const j = await api.post<{ data: GroupMessage }>(`/groups/${groupId}/messages`, { text: draft })
      if (j.data) {
        // Replace optimistic message with the real server response
        setMessages((prev) => prev.map((m) => m.id === optimisticId ? j.data : m))
        // auto-join
        if (group && !group.isJoined) {
          const patch = { isJoined: true, memberCount: group.memberCount + 1, notificationsEnabled: true }
          setGroup((g) => g ? { ...g, ...patch } : g)
          onGroupUpdate(groupId, patch)
        }
      } else {
        // Server returned no data — rollback
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        setText(draft)
      }
    } catch {
      // API call failed — rollback the optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      setText(draft)
    }
    finally { setSending(false) }
  }

  async function sendPhoto(file: File) {
    if (!dbUserId || !groupId || photoUploading) return
    setPhotoUploading(true)
    try {
      const imageUrl = await uploadImage(file, 'events')
      const msgJson = await api.post<{ data: GroupMessage }>(`/groups/${groupId}/messages`, { imageUrl })
      if (msgJson.data) setMessages((prev) => [...prev, msgJson.data])
    } catch {}
    finally { setPhotoUploading(false) }
  }

  async function followUser(senderId: string) {
    if (!dbUserId || senderId === dbUserId) return
    const already = followingSet.has(senderId)
    try {
      await (already ? api.delete(`/follow/${senderId}`) : api.post(`/follow/${senderId}`, {}))
      setFollowingSet((s) => {
        const next = new Set(s)
        already ? next.delete(senderId) : next.add(senderId)
        return next
      })
      setMessages((prev) => prev.map((m) => m.senderId === senderId ? { ...m, isFollowing: !already } : m))
    } catch {}
    setUserPopup(null)
  }

  async function reportMessage(msgId: string) {
    try {
      await api.post('/reports', { contentType: 'group_message', contentId: msgId, reason: 'OTHER' })
      setReportedMsgId(msgId)
    } catch {}
    setUserPopup(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
    </div>
  )

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 3.5rem - 4rem)', background: '#04040d' }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
        style={{ background: 'rgba(4,4,13,0.95)', borderBottom: '1px solid rgba(var(--accent-rgb),0.1)', backdropFilter: 'blur(12px)' }}>
        <button onClick={onBack} className="p-1 rounded-lg" style={{ color: 'rgba(var(--accent-rgb),0.6)' }}>
          <ArrowLeft size={18} />
        </button>
        {group && (
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ background: `${group.coverColor}18`, border: `1px solid ${group.coverColor}30` }}>
            {group.emoji}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black truncate" style={{ color: '#e0f2fe' }}>{group?.name ?? '...'}</p>
          <p className="text-[10px]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
            {group?.memberCount ?? 0} members
          </p>
        </div>
        {group && dbUserId && (
          <div className="flex items-center gap-1.5">
            {group.isJoined && (
              <button onClick={toggleNotifications}
                className="p-2 rounded-xl transition-all"
                style={{
                  background: group.notificationsEnabled ? 'rgba(var(--accent-rgb),0.1)' : 'rgba(var(--accent-rgb),0.03)',
                  border: `1px solid ${group.notificationsEnabled ? 'rgba(var(--accent-rgb),0.3)' : 'rgba(var(--accent-rgb),0.1)'}`,
                  color: group.notificationsEnabled ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.3)',
                }}>
                {group.notificationsEnabled ? <Bell size={13} /> : <BellOff size={13} />}
              </button>
            )}
            <button onClick={toggleJoin}
              className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
              style={{
                background: group.isJoined
                  ? 'rgba(var(--accent-rgb),0.06)'
                  : group.isPaid ? 'rgba(255,214,0,0.12)' : `${group.coverColor}22`,
                border: `1px solid ${group.isJoined
                  ? 'rgba(var(--accent-rgb),0.2)'
                  : group.isPaid ? 'rgba(255,214,0,0.4)' : group.coverColor + '60'}`,
                color: group.isJoined
                  ? 'rgba(var(--accent-rgb),0.6)'
                  : group.isPaid ? '#ffd600' : group.coverColor,
              }}>
              {group.isJoined
                ? (group.isPaid ? 'SUBSCRIBED' : 'JOINED')
                : group.isPaid ? formatPrice(group.priceMonthly ?? 0) : group.isPrivate ? 'LOCKED' : 'JOIN'}
            </button>
          </div>
        )}
      </div>

      {/* Chat / Pub Crawl tab bar */}
      <div className="flex-shrink-0 flex gap-1 px-4 py-2"
        style={{ background: 'rgba(4,4,13,0.9)', borderBottom: '1px solid rgba(var(--accent-rgb),0.07)' }}>
        {([
          { key: 'chat', label: '💬 Chat' },
          { key: 'crawl', label: '🍺 Pub Crawl' },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className="flex-1 py-1.5 rounded-lg text-[10px] font-black tracking-wide transition-all"
            style={{
              background: activeTab === key ? 'rgba(var(--accent-rgb),0.1)' : 'transparent',
              border: `1px solid ${activeTab === key ? 'rgba(var(--accent-rgb),0.25)' : 'rgba(var(--accent-rgb),0.06)'}`,
              color: activeTab === key ? 'var(--accent)' : 'rgba(74,96,128,0.5)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Pub Crawl View */}
      {activeTab === 'crawl' && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {crawlLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(245,158,11,0.1)', borderTopColor: '#f59e0b' }} />
            </div>
          ) : !crawl ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <span className="text-4xl">🍺</span>
              <p className="text-sm font-black tracking-wide" style={{ color: 'rgba(245,158,11,0.8)' }}>NO ACTIVE PUB CRAWL</p>
              <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>Plan a pub crawl for the group — add stops, check in, and see the leaderboard.</p>
              {dbUserId && (
                <button onClick={() => setShowCreateCrawl(true)}
                  className="px-5 py-2.5 rounded-xl text-xs font-black tracking-widest"
                  style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b' }}>
                  + PLAN PUB CRAWL
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Crawl header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black" style={{ color: '#f59e0b' }}>{crawl.name}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(245,158,11,0.5)' }}>{crawl.stops?.length} stops</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={loadCrawl} className="p-1.5 rounded-lg" style={{ color: 'rgba(245,158,11,0.5)', border: '1px solid rgba(245,158,11,0.15)' }}>
                    <Radio size={12} />
                  </button>
                  {dbUserId && (
                    <button onClick={endCrawl} className="px-2.5 py-1 rounded-lg text-[9px] font-black"
                      style={{ color: 'rgba(255,0,110,0.6)', border: '1px solid rgba(255,0,110,0.15)' }}>
                      END
                    </button>
                  )}
                </div>
              </div>

              {/* Stops */}
              <div className="space-y-2">
                {crawl.stops?.map((stop: any, i: number) => (
                  <div key={stop.id} className="p-3 rounded-xl"
                    style={{ background: stop.checkedIn ? 'rgba(0,255,136,0.04)' : 'rgba(7,7,26,0.8)', border: `1px solid ${stop.checkedIn ? 'rgba(0,255,136,0.25)' : 'rgba(245,158,11,0.15)'}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-black"
                          style={{ background: stop.checkedIn ? 'rgba(0,255,136,0.15)' : 'rgba(245,158,11,0.1)', color: stop.checkedIn ? '#00ff88' : '#f59e0b' }}>
                          {stop.checkedIn ? '✓' : i + 1}
                        </div>
                        <div>
                          <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{stop.name}</p>
                          {stop.address && <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.35)' }}>{stop.address}</p>}
                        </div>
                      </div>
                      {dbUserId && !stop.checkedIn && (
                        <button onClick={() => checkIn(stop.id)}
                          className="px-2.5 py-1 rounded-lg text-[9px] font-black shrink-0"
                          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' }}>
                          CHECK IN
                        </button>
                      )}
                    </div>
                    {stop.checkInCount > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        <div className="flex -space-x-1">
                          {stop.checkers?.slice(0, 4).map((c: any) => (
                            c.photoUrl
                              ? <img key={c.id} src={c.photoUrl} className="w-5 h-5 rounded-full object-cover" style={{ border: '1px solid #04040d' }} />
                              : <div key={c.id} className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black" style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid #04040d' }}>{c.displayName[0]}</div>
                          ))}
                        </div>
                        <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.35)' }}>{stop.checkInCount} checked in</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Leaderboard */}
              {crawl.leaderboard?.length > 0 && (
                <div>
                  <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: 'rgba(245,158,11,0.5)' }}>🏆 LEADERBOARD</p>
                  <div className="space-y-1.5">
                    {crawl.leaderboard.slice(0, 5).map((entry: any, i: number) => (
                      <div key={entry.user.id} className="flex items-center gap-3 p-2.5 rounded-xl"
                        style={{ background: i === 0 ? 'rgba(255,214,0,0.06)' : 'rgba(7,7,26,0.6)', border: `1px solid ${i === 0 ? 'rgba(255,214,0,0.2)' : 'rgba(245,158,11,0.08)'}` }}>
                        <span className="text-sm" style={{ minWidth: 16 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                        {entry.user.photoUrl
                          ? <img src={entry.user.photoUrl} className="w-6 h-6 rounded-full object-cover" />
                          : <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>{entry.user.displayName[0]}</div>
                        }
                        <p className="flex-1 text-xs font-bold" style={{ color: '#e0f2fe' }}>{entry.user.displayName}</p>
                        <p className="text-xs font-black" style={{ color: '#f59e0b' }}>{entry.score} <span className="text-[9px] font-normal" style={{ color: 'rgba(245,158,11,0.5)' }}>stops</span></p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Create crawl modal */}
          {showCreateCrawl && (
            <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4"
              style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
              onClick={() => { setShowCreateCrawl(false); setAiError('') }}>
              <div className="w-full max-w-sm rounded-2xl p-5 space-y-4 max-h-[82vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}
                style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(245,158,11,0.25)' }}>

                {/* Header */}
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black" style={{ color: '#f59e0b' }}>🍺 PLAN PUB CRAWL</p>
                  <button onClick={() => { setShowCreateCrawl(false); setAiError('') }}
                    style={{ color: 'rgba(74,96,128,0.5)' }}>
                    <X size={15} />
                  </button>
                </div>

                {/* ✨ AI Suggest button */}
                <button
                  onClick={suggestWithAI}
                  disabled={aiSuggesting}
                  className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                  style={{
                    background: aiSuggesting ? 'rgba(168,85,247,0.06)' : 'linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(245,158,11,0.12) 100%)',
                    border: '1px solid rgba(168,85,247,0.4)',
                    color: '#a855f7',
                    letterSpacing: '0.08em',
                    boxShadow: aiSuggesting ? 'none' : '0 0 16px rgba(168,85,247,0.15)',
                  }}
                >
                  {aiSuggesting
                    ? <><span className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(168,85,247,0.3)', borderTopColor: '#a855f7' }} /> AI PICKING STOPS…</>
                    : <><span>✨</span> AI SUGGEST STOPS</>
                  }
                </button>
                {aiError && (
                  <p className="text-[10px]" style={{ color: 'rgba(255,0,110,0.7)' }}>{aiError}</p>
                )}

                {/* Divider */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px" style={{ background: 'rgba(245,158,11,0.1)' }} />
                  <span className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(245,158,11,0.35)' }}>OR ENTER MANUALLY</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(245,158,11,0.1)' }} />
                </div>

                {/* Crawl name */}
                <input type="text" placeholder="Crawl name (e.g. Friday Night Crawl)" value={crawlName}
                  onChange={(e) => setCrawlName(e.target.value.slice(0, 50))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none"
                  style={{ border: '1px solid rgba(245,158,11,0.2)', color: '#e0f2fe' }} />

                {/* Stops */}
                <div className="space-y-2">
                  <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(245,158,11,0.5)' }}>STOPS</p>
                  {crawlStops.map((stop, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
                        style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>{i + 1}</div>
                      <input type="text" placeholder="Pub name" value={stop.name}
                        onChange={(e) => { const next = [...crawlStops]; next[i] = { ...next[i], name: e.target.value }; setCrawlStops(next) }}
                        className="flex-1 px-2.5 py-2 rounded-lg text-xs bg-transparent outline-none"
                        style={{ border: '1px solid rgba(245,158,11,0.15)', color: '#e0f2fe' }} />
                      {crawlStops.length > 2 && (
                        <button onClick={() => setCrawlStops((prev) => prev.filter((_, idx) => idx !== i))}
                          className="p-1" style={{ color: 'rgba(255,0,110,0.5)' }}>
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {crawlStops.length < 12 && (
                    <button onClick={() => setCrawlStops((prev) => [...prev, { name: '', address: '' }])}
                      className="w-full py-2 rounded-lg text-[10px] font-black"
                      style={{ border: '1px dashed rgba(245,158,11,0.25)', color: 'rgba(245,158,11,0.5)' }}>
                      + ADD STOP
                    </button>
                  )}
                </div>

                {/* Start button */}
                <button onClick={createCrawl} disabled={crawlCreating || !crawlName.trim() || crawlStops.filter((s) => s.name.trim()).length < 2}
                  className="w-full py-3 rounded-xl text-xs font-black tracking-widest disabled:opacity-40"
                  style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b' }}>
                  {crawlCreating ? 'CREATING...' : 'START CRAWL 🍺'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      {activeTab === 'chat' && (
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {locked ? (
          <div className="flex flex-col items-center justify-center h-60 gap-3 text-center px-4">
            {group?.isPaid ? (
              <>
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,214,0,0.1)', border: '1px solid rgba(255,214,0,0.3)' }}>
                  <Crown size={28} style={{ color: '#ffd600' }} />
                </div>
                <p className="text-sm font-black tracking-wide" style={{ color: '#ffd600' }}>PAID GROUP</p>
                <p className="text-xs" style={{ color: 'rgba(224,242,254,0.4)', maxWidth: 260 }}>
                  Subscribe for {formatPrice(group.priceMonthly ?? 0)}/mo to access messages and join the community
                </p>
                <button onClick={() => setShowSubModal(true)}
                  className="mt-1 px-6 py-2.5 rounded-xl text-xs font-black tracking-widest"
                  style={{ background: 'rgba(255,214,0,0.15)', border: '1px solid rgba(255,214,0,0.4)', color: '#ffd600' }}>
                  SUBSCRIBE
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,0,110,0.1)', border: '1px solid rgba(255,0,110,0.3)' }}>
                  <Lock size={28} style={{ color: '#ff006e' }} />
                </div>
                <p className="text-sm font-black tracking-wide" style={{ color: '#ff006e' }}>PRIVATE GROUP</p>
                <p className="text-xs" style={{ color: 'rgba(224,242,254,0.4)', maxWidth: 260 }}>
                  Enter the password to join and view messages
                </p>
                <button onClick={() => setShowPwModal(true)}
                  className="mt-1 px-6 py-2.5 rounded-xl text-xs font-black tracking-widest"
                  style={{ background: 'rgba(255,0,110,0.1)', border: '1px solid rgba(255,0,110,0.35)', color: '#ff006e' }}>
                  ENTER PASSWORD
                </button>
              </>
            )}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <Hash size={28} style={{ color: 'rgba(var(--accent-rgb),0.15)' }} />
            <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>
              {group ? `Be the first to post in #${group.name.toLowerCase()}` : 'No messages yet'}
            </p>
          </div>
        ) : messages.map((m) => {
          const isMe = m.senderId === dbUserId
          return (
            <div key={m.id} className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
              {!isMe && (
                <button onClick={() => setUserPopup(m)} className="shrink-0 mt-1">
                  <Avatar user={{ displayName: m.senderName, photoUrl: m.senderPhoto }} size={30} />
                </button>
              )}
              <div className="max-w-[72%]">
                {!isMe && (
                  <p className="text-[10px] mb-0.5 ml-1 font-bold" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
                    {m.senderName}
                  </p>
                )}
                <div className={`rounded-2xl text-sm overflow-hidden ${m.text ? 'px-3 py-2' : ''}`}
                  style={isMe
                    ? { background: 'rgba(var(--accent-rgb),0.15)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: '#e0f2fe', borderBottomRightRadius: 4 }
                    : { background: 'rgba(7,7,26,0.9)', border: '1px solid rgba(var(--accent-rgb),0.08)', color: '#e0f2fe', borderBottomLeftRadius: 4 }}>
                  {m.imageUrl && (
                    <img src={m.imageUrl} alt="" className="max-w-[220px] rounded-xl object-cover cursor-pointer"
                      style={{ maxHeight: 200, display: 'block' }}
                      onClick={() => window.open(m.imageUrl!, '_blank')} />
                  )}
                  {m.text && <span>{m.text}</span>}
                </div>
                <p className={`text-[9px] mt-0.5 ${isMe ? 'text-right' : 'text-left'}`}
                  style={{ color: 'rgba(224,242,254,0.2)' }}>{timeAgo(m.createdAt)}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      )}

      {/* Input — only shown in chat tab */}
      {activeTab === 'chat' && dbUserId ? (
        <div className="flex-shrink-0 px-4 py-3 flex gap-2"
          style={{ background: 'rgba(4,4,13,0.95)', borderTop: '1px solid rgba(var(--accent-rgb),0.08)' }}>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) sendPhoto(f); e.target.value = '' }}
          />
          <button onClick={() => photoInputRef.current?.click()} disabled={photoUploading}
            className="p-2.5 rounded-xl transition-all"
            style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.1)', color: photoUploading ? 'rgba(var(--accent-rgb),0.3)' : 'rgba(var(--accent-rgb),0.5)' }}>
            {photoUploading ? <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'rgba(var(--accent-rgb),0.5)' }} /> : <Camera size={16} />}
          </button>
          <input type="text" placeholder={`Message #${group?.name.toLowerCase() ?? 'group'}...`}
            value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-transparent outline-none"
            style={{ border: '1px solid rgba(var(--accent-rgb),0.15)', color: '#e0f2fe' }} />
          <button onClick={sendMessage} disabled={!text.trim() || sending}
            className="p-2.5 rounded-xl transition-all"
            style={{
              background: text.trim() ? 'rgba(var(--accent-rgb),0.15)' : 'rgba(var(--accent-rgb),0.04)',
              border: `1px solid ${text.trim() ? 'rgba(var(--accent-rgb),0.4)' : 'rgba(var(--accent-rgb),0.1)'}`,
              color: text.trim() ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.2)',
            }}>
            <Send size={16} />
          </button>
        </div>
      ) : (
        <div className="flex-shrink-0 px-4 py-3 text-center"
          style={{ background: 'rgba(4,4,13,0.95)', borderTop: '1px solid rgba(var(--accent-rgb),0.08)' }}>
          <a href="/login" className="text-xs font-bold" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
            Log in to join the conversation
          </a>
        </div>
      )}

      {/* User popup */}
      {userPopup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setUserPopup(null)}>
          <div className="w-full max-w-sm rounded-2xl p-5" onClick={(e) => e.stopPropagation()}
            style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}>
            <div className="flex items-center gap-3 mb-4">
              <Avatar user={{ displayName: userPopup.senderName, photoUrl: userPopup.senderPhoto }} size={44} />
              <div>
                <p className="font-black text-sm" style={{ color: '#e0f2fe' }}>{userPopup.senderName}</p>
                {userPopup.senderUsername && (
                  <p className="text-[11px]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>@{userPopup.senderUsername}</p>
                )}
              </div>
            </div>
            {dbUserId && userPopup.senderId !== dbUserId && (
              <div className="space-y-2">
                <button onClick={() => followUser(userPopup.senderId)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all"
                  style={{
                    background: followingSet.has(userPopup.senderId) ? 'rgba(var(--accent-rgb),0.06)' : 'rgba(var(--accent-rgb),0.12)',
                    border: `1px solid ${followingSet.has(userPopup.senderId) ? 'rgba(var(--accent-rgb),0.2)' : 'rgba(var(--accent-rgb),0.35)'}`,
                    color: followingSet.has(userPopup.senderId) ? 'rgba(var(--accent-rgb),0.5)' : 'var(--accent)',
                  }}>
                  {followingSet.has(userPopup.senderId)
                    ? <><UserCheck size={13} /> FOLLOWING</>
                    : <><UserPlus size={13} /> FOLLOW</>
                  }
                </button>
                <button
                  onClick={() => reportMessage(userPopup.id)}
                  disabled={reportedMsgId === userPopup.id}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
                >
                  <Flag size={13} />
                  {reportedMsgId === userPopup.id ? 'REPORTED' : 'REPORT MESSAGE'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Password modal */}
      {showPwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={() => { setShowPwModal(false); setPwError('') }}>
          <div className="w-full max-w-xs rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}
            style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(255,0,110,0.25)' }}>
            <div className="flex items-center gap-2">
              <Lock size={16} style={{ color: '#ff006e' }} />
              <p className="text-sm font-black" style={{ color: '#ff006e' }}>ENTER PASSWORD</p>
            </div>
            <input type="password" placeholder="Group password" value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') joinWithPassword() }}
              className="w-full px-4 py-3 rounded-xl text-sm bg-transparent outline-none"
              style={{ border: '1px solid rgba(255,0,110,0.25)', color: '#e0f2fe' }} autoFocus />
            {pwError && <p className="text-[11px] font-bold" style={{ color: '#ff006e' }}>{pwError}</p>}
            <button onClick={joinWithPassword} disabled={pwInput.trim().length < 4}
              className="w-full py-3 rounded-xl text-xs font-black tracking-widest disabled:opacity-40"
              style={{ background: 'rgba(255,0,110,0.12)', border: '1px solid rgba(255,0,110,0.4)', color: '#ff006e' }}>
              JOIN GROUP
            </button>
          </div>
        </div>
      )}

      {/* Subscribe modal */}
      {showSubModal && group && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowSubModal(false)}>
          <div className="w-full max-w-xs rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}
            style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(255,214,0,0.25)' }}>
            <div className="flex items-center gap-2">
              <Crown size={16} style={{ color: '#ffd600' }} />
              <p className="text-sm font-black" style={{ color: '#ffd600' }}>SUBSCRIBE</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: `${group.coverColor}15`, border: `1px solid ${group.coverColor}30` }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{group.emoji}</span>
                <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{group.name}</p>
              </div>
              <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>
                {group.memberCount} members
              </p>
            </div>
            <div className="text-center py-2">
              <p className="text-2xl font-black" style={{ color: '#ffd600' }}>
                {formatPrice(group.priceMonthly ?? 0)}<span className="text-sm font-normal text-[rgba(255,214,0,0.5)]">/month</span>
              </p>
              <p className="text-[10px] mt-1" style={{ color: 'rgba(224,242,254,0.35)' }}>
                Cancel anytime. Full access to group chat and content.
              </p>
            </div>
            <button onClick={handleSubscribe} disabled={subscribing}
              className="w-full py-3 rounded-xl text-xs font-black tracking-widest disabled:opacity-50"
              style={{ background: 'rgba(255,214,0,0.15)', border: '1px solid rgba(255,214,0,0.4)', color: '#ffd600' }}>
              {subscribing ? 'SUBSCRIBING...' : 'SUBSCRIBE NOW'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── DM Section ───────────────────────────────────────────────────────────────

// ── Voice message player ───────────────────────────────────────────────────────

function VoiceMessagePlayer({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function toggle() {
    if (!audioRef.current) {
      audioRef.current = new Audio(url)
      audioRef.current.onended = () => setPlaying(false)
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play().catch(() => {})
      setPlaying(true)
    }
  }

  return (
    <button onClick={toggle}
      className="flex items-center gap-2 px-3 py-2 rounded-2xl"
      style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.2)', minWidth: 120 }}>
      {playing ? <Square size={12} style={{ color: 'var(--accent)' }} /> : <Play size={12} style={{ color: 'var(--accent)' }} />}
      <div className="flex items-end gap-0.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-full"
            style={{
              width: 3, background: 'var(--accent)',
              height: playing ? `${6 + Math.sin(i * 1.3) * 5}px` : '4px',
              opacity: 0.6 + i * 0.04,
              transition: 'height 0.2s',
            }} />
        ))}
      </div>
      <span className="text-[10px] font-bold" style={{ color: 'rgba(var(--accent-rgb),0.6)' }}>VOICE</span>
    </button>
  )
}

// ── Walkie talkie button ───────────────────────────────────────────────────────

function WalkieTalkieButton({ onSend }: { onSend: (voiceUrl: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setUploading(true)
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          // Get signed upload credentials
          const credJson = await api.post<{ data: { timestamp: number; signature: string; cloudName: string; apiKey: string; folder: string } }>('/uploads/audio', {})
          const { timestamp, signature, cloudName, apiKey, folder } = credJson.data

          const formData = new FormData()
          formData.append('file', blob, 'voice.webm')
          formData.append('timestamp', String(timestamp))
          formData.append('signature', signature)
          formData.append('api_key', apiKey)
          formData.append('folder', folder)
          formData.append('resource_type', 'video')

          const upRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
            method: 'POST', body: formData,
          })
          const upJson = await upRes.json()
          if (upJson.secure_url) onSend(`[VOICE]${upJson.secure_url}`)
        } catch {}
        finally { setUploading(false) }
      }
      recorder.start()
      setRecording(true)
    } catch {}
  }

  function stopRecording() {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  return (
    <button
      onPointerDown={startRecording}
      onPointerUp={stopRecording}
      onPointerLeave={stopRecording}
      disabled={uploading}
      className="p-2.5 rounded-xl transition-all select-none"
      style={{
        background: recording ? 'rgba(255,0,110,0.2)' : uploading ? 'rgba(255,214,0,0.12)' : 'rgba(var(--accent-rgb),0.06)',
        border: `1px solid ${recording ? 'rgba(255,0,110,0.5)' : uploading ? 'rgba(255,214,0,0.3)' : 'rgba(var(--accent-rgb),0.12)'}`,
        color: recording ? '#ff006e' : uploading ? '#ffd600' : 'rgba(var(--accent-rgb),0.5)',
      }}>
      {uploading ? <Radio size={16} className="animate-pulse" /> : <Mic size={16} />}
    </button>
  )
}

// ── Snap message bubble ────────────────────────────────────────────────────────

function SnapMessageBubble({
  message, isMe, convoId, onViewed,
}: {
  message: DmMessage
  isMe: boolean
  convoId: string
  onViewed: (msgId: string) => void
}) {
  const [viewing, setViewing] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(10)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function handleTap() {
    if (isMe || message.snapViewed || viewing) return
    // Mark as viewed on server
    try {
      await api.post(`/dm/${convoId}/messages/${message.id}/view-snap`, {})
    } catch {}
    setViewing(true)
    setSecondsLeft(10)
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!)
          setViewing(false)
          onViewed(message.id)
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const url = message.text.replace('[SNAP]', '')

  if (message.snapViewed && !viewing) {
    return (
      <div className="px-3 py-2 rounded-2xl flex items-center gap-2"
        style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(224,242,254,0.06)' }}>
        <Camera size={14} style={{ color: 'rgba(224,242,254,0.2)' }} />
        <span className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>Snap viewed</span>
      </div>
    )
  }

  if (viewing) {
    return (
      <div className="relative rounded-2xl overflow-hidden" style={{ maxWidth: 200 }}>
        <img src={url} alt="snap" className="w-full rounded-2xl" style={{ maxHeight: 280, objectFit: 'cover' }} />
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full"
          style={{ background: 'rgba(0,0,0,0.6)' }}>
          <Timer size={10} style={{ color: '#ff006e' }} />
          <span className="text-[10px] font-black" style={{ color: '#ff006e' }}>{secondsLeft}s</span>
        </div>
      </div>
    )
  }

  if (isMe) {
    return (
      <div className="px-3 py-2 rounded-2xl flex items-center gap-2"
        style={{ background: 'rgba(255,0,110,0.1)', border: '1px solid rgba(255,0,110,0.25)' }}>
        <Camera size={14} style={{ color: '#ff006e' }} />
        <span className="text-xs font-bold" style={{ color: '#ff006e' }}>📸 Snap sent</span>
      </div>
    )
  }

  return (
    <button onClick={handleTap}
      className="px-3 py-2.5 rounded-2xl flex items-center gap-2 transition-all active:scale-95"
      style={{ background: 'rgba(255,0,110,0.12)', border: '1px solid rgba(255,0,110,0.35)' }}>
      <Camera size={14} style={{ color: '#ff006e' }} />
      <div>
        <p className="text-xs font-black" style={{ color: '#ff006e' }}>📸 Tap to view</p>
        <p className="text-[9px]" style={{ color: 'rgba(255,0,110,0.5)' }}>1 time only · 10s</p>
      </div>
    </button>
  )
}

// ── Follow button in DM header ─────────────────────────────────────────────────

function FollowButtonDm({ targetId }: { targetId: string }) {
  const [following, setFollowing] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get<{ data: { isFollowing: boolean } }>(`/follow/${targetId}`)
      .then((j) => setFollowing(j?.data?.isFollowing ?? false))
      .catch(() => {})
  }, [targetId])

  async function toggle() {
    if (following === null || loading) return
    setLoading(true)
    try {
      if (following) {
        await api.delete(`/follow/${targetId}`)
      } else {
        await api.post(`/follow/${targetId}`, {})
      }
      setFollowing(!following)
    } catch {}
    finally { setLoading(false) }
  }

  if (following === null) return null

  return (
    <button onClick={toggle} disabled={loading}
      className="flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all"
      style={{
        background: following ? 'rgba(var(--accent-rgb),0.06)' : 'rgba(var(--accent-rgb),0.12)',
        border: `1px solid ${following ? 'rgba(var(--accent-rgb),0.15)' : 'rgba(var(--accent-rgb),0.3)'}`,
        color: following ? 'rgba(var(--accent-rgb),0.5)' : 'var(--accent)',
      }}>
      {following ? <UserCheck size={11} /> : <UserPlus size={11} />}
      <span className="text-[9px] font-black tracking-wide">{following ? 'FOLLOWING' : 'FOLLOW'}</span>
    </button>
  )
}

// ── DM Section ─────────────────────────────────────────────────────────────────

function DmSection({ dbUser }: {
  dbUser: { id: string; displayName?: string; photoUrl?: string | null } | null
}) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [requestConvos, setRequestConvos] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeConvo, setActiveConvo] = useState<string | null>(null)
  const [activeConvoIsRequest, setActiveConvoIsRequest] = useState(false)
  const [messages, setMessages] = useState<DmMessage[]>([])
  const [decrypted, setDecrypted] = useState<Record<string, string>>({})
  const [msgsLoading, setMsgsLoading] = useState(false)
  const [activeOther, setActiveOther] = useState<OtherUser | null>(null)
  const [otherPublicKey, setOtherPublicKey] = useState<string | null>(null)
  const [e2eReady, setE2eReady] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<OtherUser[]>([])
  const [searching, setSearching] = useState(false)
  const [dmSubTab, setDmSubTab] = useState<'inbox' | 'requests'>('inbox')
  const [acceptingRequest, setAcceptingRequest] = useState(false)
  const snapInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const initialLoadRef = useRef(false)

  // Init E2E keys on mount
  useEffect(() => {
    if (!dbUser) return
    getOrCreateKeyPair().then(({ publicKeyJWK }) => {
      const pubStr = serializePublicKey(publicKeyJWK)
      api.put('/dm/public-key', { publicKey: pubStr })
        .then(() => setE2eReady(true))
        .catch(() => setE2eReady(true))
    }).catch(() => {})
  }, [dbUser?.id])

  const fetchConversations = useCallback(async () => {
    if (!dbUser) { setLoading(false); return }
    try {
      const [inboxJson, reqJson] = await Promise.all([
        api.get<{ data: Conversation[] }>('/dm'),
        api.get<{ data: Conversation[] }>('/dm?requests=true'),
      ])
      setConversations(inboxJson?.data ?? [])
      setRequestConvos(reqJson?.data ?? [])
    } catch {}
    setLoading(false)
  }, [dbUser?.id])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  useEffect(() => {
    if (!activeConvo) return
    initialLoadRef.current = true
    setMsgsLoading(true)
    api.get<{ data: { messages: DmMessage[]; other: OtherUser | null; otherPublicKey: string | null; isRequest: boolean } }>(`/dm/${activeConvo}`)
      .then((j) => {
        setMessages(j?.data?.messages ?? [])
        setActiveOther(j?.data?.other ?? null)
        setOtherPublicKey(j?.data?.otherPublicKey ?? null)
        setActiveConvoIsRequest(j?.data?.isRequest ?? false)
      })
      .catch(() => {}).finally(() => setMsgsLoading(false))
  }, [activeConvo])

  // Decrypt messages whenever messages or otherPublicKey changes
  useEffect(() => {
    if (!otherPublicKey || messages.length === 0) return
    const encryptedMsgs = messages.filter((m) => m.text.startsWith('[E2E]'))
    if (encryptedMsgs.length === 0) return
    Promise.all(
      encryptedMsgs.map(async (m) => {
        const plain = await decryptMessage(m.text, otherPublicKey).catch(() => null)
        return [m.id, plain ?? m.text] as [string, string]
      })
    ).then((pairs) => {
      setDecrypted((prev) => {
        const next = { ...prev }
        pairs.forEach(([id, text]) => { next[id] = text })
        return next
      })
    })
  }, [messages, otherPublicKey])

  useEffect(() => {
    if (!bottomRef.current) return
    const behavior = initialLoadRef.current ? 'instant' : 'smooth'
    initialLoadRef.current = false
    bottomRef.current.scrollIntoView({ behavior } as ScrollIntoViewOptions)
  }, [messages])

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    const t = setTimeout(() => {
      setSearching(true)
      api.get<{ data: OtherUser[] }>(`/dm/users?q=${encodeURIComponent(search)}`)
        .then((j) => setSearchResults(j?.data ?? [])).catch(() => {}).finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  async function openOrCreateConvo(recipientId: string) {
    try {
      const j = await api.post<{ data: { id: string } }>('/dm', { recipientId })
      if (j?.data?.id) {
        setSearch(''); setSearchResults([])
        setActiveConvo(j.data.id)
        fetchConversations()
      }
    } catch {}
  }

  async function acceptRequest() {
    if (!activeConvo || acceptingRequest) return
    setAcceptingRequest(true)
    try {
      await api.post(`/dm/${activeConvo}/accept`, {})
      setActiveConvoIsRequest(false)
      fetchConversations()
    } catch {}
    finally { setAcceptingRequest(false) }
  }

  async function sendTextMessage() {
    if (!text.trim() || !activeConvo || sending || !dbUser) return
    setSending(true)
    const draft = text.trim(); setText('')

    // Encrypt if we have the other party's public key
    let textToSend = draft
    if (otherPublicKey) {
      try { textToSend = await encryptMessage(draft, otherPublicKey) } catch {}
    }

    const optimisticId = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const optimisticMsg: DmMessage = {
      id: optimisticId, senderId: dbUser.id, senderName: dbUser.displayName ?? '',
      senderPhoto: dbUser.photoUrl ?? null, text: draft, createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMsg])
    // Store plaintext for optimistic display
    setDecrypted((prev) => ({ ...prev, [optimisticId]: draft }))

    try {
      const j = await api.post<{ data: DmMessage }>(`/dm/${activeConvo}`, { text: textToSend })
      if (j?.data) {
        setMessages((prev) => prev.map((m) => m.id === optimisticId ? j.data : m))
        setDecrypted((prev) => { const n = { ...prev }; n[j.data.id] = draft; delete n[optimisticId]; return n })
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        setDecrypted((prev) => { const n = { ...prev }; delete n[optimisticId]; return n })
        setText(draft)
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      setDecrypted((prev) => { const n = { ...prev }; delete n[optimisticId]; return n })
      setText(draft)
    }
    finally { setSending(false) }
  }

  async function sendVoiceMessage(voiceUrl: string) {
    if (!activeConvo || !dbUser) return
    const optimisticId = `optimistic_${Date.now()}`
    const optimisticMsg: DmMessage = {
      id: optimisticId, senderId: dbUser.id, senderName: dbUser.displayName ?? '',
      senderPhoto: dbUser.photoUrl ?? null, text: voiceUrl, createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMsg])
    try {
      const j = await api.post<{ data: DmMessage }>(`/dm/${activeConvo}`, { text: voiceUrl })
      if (j?.data) setMessages((prev) => prev.map((m) => m.id === optimisticId ? j.data : m))
      else setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
    }
  }

  async function sendSnap(file: File) {
    if (!activeConvo || !dbUser) return
    try {
      const secureUrl = await uploadImage(file, 'events')
      const snapText = `[SNAP]${secureUrl}`
      const optimisticId = `optimistic_${Date.now()}`
      const optimisticMsg: DmMessage = {
        id: optimisticId, senderId: dbUser.id, senderName: dbUser.displayName ?? '',
        senderPhoto: dbUser.photoUrl ?? null, text: snapText, isSnap: true, snapViewed: false,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, optimisticMsg])
      const j = await api.post<{ data: DmMessage }>(`/dm/${activeConvo}`, { text: snapText, isSnap: true })
      if (j?.data) setMessages((prev) => prev.map((m) => m.id === optimisticId ? j.data : m))
      else setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
    } catch {}
  }

  function handleSnapViewed(msgId: string) {
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, snapViewed: true, text: '[SNAP_VIEWED]' } : m))
  }

  function displayText(m: DmMessage): string {
    if (decrypted[m.id]) return decrypted[m.id]
    if (m.text.startsWith('[E2E]')) return '🔒 ...'
    return m.text
  }

  if (activeConvo) {
    return (
      <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 64, background: '#04040d', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
          style={{ background: 'rgba(4,4,13,0.95)', borderBottom: '1px solid rgba(var(--accent-rgb),0.1)', backdropFilter: 'blur(12px)' }}>
          <button onClick={() => { setActiveConvo(null); setMessages([]); setDecrypted({}); setOtherPublicKey(null); setActiveConvoIsRequest(false) }}
            className="p-1 rounded-lg" style={{ color: 'rgba(var(--accent-rgb),0.6)' }}>
            <ArrowLeft size={18} />
          </button>
          {activeOther && (
            <a href={`/profile/${activeOther.username ?? activeOther.id}`}>
              <Avatar user={activeOther} size={32} />
            </a>
          )}
          <div className="flex-1 min-w-0">
            <a href={activeOther?.username ? `/profile/${activeOther.username}` : '#'} className="block">
              <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{activeOther?.displayName ?? '...'}</p>
              {activeOther?.username && <p className="text-[10px]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>@{activeOther.username}</p>}
            </a>
          </div>
          {/* E2E badge */}
          {e2eReady && otherPublicKey && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black tracking-wide"
              style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)', color: '#00ff88' }}>
              <ShieldCheck size={10} /> E2E
            </span>
          )}
          {/* Follow button */}
          {activeOther && dbUser && <FollowButtonDm targetId={activeOther.id} />}
        </div>

        {/* Message request banner */}
        {activeConvoIsRequest && activeOther && (
          <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3"
            style={{ background: 'rgba(255,214,0,0.06)', borderBottom: '1px solid rgba(255,214,0,0.2)' }}>
            <p className="text-xs font-bold flex-1 min-w-0 truncate" style={{ color: 'rgba(255,214,0,0.8)' }}>
              {activeOther.displayName} wants to send you a message
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={acceptRequest}
                disabled={acceptingRequest}
                className="px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all disabled:opacity-50"
                style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.35)', color: '#00ff88' }}>
                {acceptingRequest ? '...' : 'ACCEPT'}
              </button>
              <button
                onClick={() => { setActiveConvo(null); setMessages([]); setDecrypted({}); setOtherPublicKey(null); setActiveConvoIsRequest(false) }}
                className="px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all"
                style={{ background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.25)', color: 'rgba(255,0,110,0.7)' }}>
                DECLINE
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {msgsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <MessageCircle size={28} style={{ color: 'rgba(var(--accent-rgb),0.15)' }} />
              <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>Start the conversation</p>
            </div>
          ) : messages.map((m) => {
            const isMe = m.senderId === dbUser?.id
            const isVoice = m.text.startsWith('[VOICE]')
            const isSnap = m.isSnap || m.text.startsWith('[SNAP]') || m.text === '[SNAP_VIEWED]'
            return (
              <div key={m.id} className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && activeOther && <Avatar user={activeOther} size={28} />}
                <div className="max-w-[75%]">
                  {isVoice ? (
                    <VoiceMessagePlayer url={m.text.replace('[VOICE]', '')} />
                  ) : isSnap ? (
                    <SnapMessageBubble
                      message={m} isMe={isMe}
                      convoId={activeConvo} onViewed={handleSnapViewed}
                    />
                  ) : (
                    <div className="px-3 py-2 rounded-2xl text-sm break-words"
                      style={isMe
                        ? { background: 'rgba(var(--accent-rgb),0.15)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: '#e0f2fe', borderBottomRightRadius: 4 }
                        : { background: 'rgba(7,7,26,0.9)', border: '1px solid rgba(var(--accent-rgb),0.08)', color: '#e0f2fe', borderBottomLeftRadius: 4 }}>
                      {displayText(m)}
                    </div>
                  )}
                  <p className={`text-[9px] mt-0.5 ${isMe ? 'text-right' : 'text-left'}`}
                    style={{ color: 'rgba(224,242,254,0.2)' }}>{timeAgo(m.createdAt)}</p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="flex-shrink-0 px-4 py-3 flex gap-2 items-center"
          style={{ background: 'rgba(4,4,13,0.95)', borderTop: '1px solid rgba(var(--accent-rgb),0.08)' }}>
          {/* Snap camera button */}
          <button onClick={() => snapInputRef.current?.click()}
            className="p-2.5 rounded-xl"
            style={{ background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)', color: 'rgba(255,0,110,0.6)' }}>
            <Camera size={16} />
          </button>
          <input ref={snapInputRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { sendSnap(f); e.target.value = '' } }} />

          <input type="text" placeholder="Message..." value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage() } }}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-transparent outline-none"
            style={{ border: '1px solid rgba(var(--accent-rgb),0.15)', color: '#e0f2fe' }} />

          {/* Walkie talkie */}
          <WalkieTalkieButton onSend={sendVoiceMessage} />

          {/* Send */}
          <button onClick={sendTextMessage} disabled={!text.trim() || sending}
            className="p-2.5 rounded-xl transition-all"
            style={{
              background: text.trim() ? 'rgba(var(--accent-rgb),0.15)' : 'rgba(var(--accent-rgb),0.04)',
              border: `1px solid ${text.trim() ? 'rgba(var(--accent-rgb),0.4)' : 'rgba(var(--accent-rgb),0.1)'}`,
              color: text.trim() ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.2)',
            }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    )
  }

  if (!dbUser) {
    return (
      <div className="py-16 flex flex-col items-center gap-3">
        <MessageCircle size={28} style={{ color: 'rgba(var(--accent-rgb),0.15)' }} />
        <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>LOG IN TO MESSAGE PEOPLE</p>
        <a href="/login" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black"
          style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>
          <LogIn size={11} /> LOG IN
        </a>
      </div>
    )
  }

  const displayedConvos = dmSubTab === 'requests' ? requestConvos : conversations

  return (
    <div className="px-4 max-w-xl mx-auto pb-4">
      <div className="relative mb-3">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
        <input type="text" placeholder="Search users to message..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2.5 rounded-xl text-xs bg-transparent outline-none"
          style={{ border: '1px solid rgba(var(--accent-rgb),0.15)', color: '#e0f2fe' }} />
      </div>
      {search.trim() && (
        <div className="mb-3 rounded-xl overflow-hidden"
          style={{ border: '1px solid rgba(var(--accent-rgb),0.12)', background: 'rgba(7,7,26,0.95)' }}>
          {searching ? (
            <div className="py-4 flex justify-center">
              <div className="w-4 h-4 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-4 text-center text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>No users found</div>
          ) : searchResults.map((u) => (
            <button key={u.id} onClick={() => openOrCreateConvo(u.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
              style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.06)' }}>
              <Avatar user={u} size={36} />
              <div>
                <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{u.displayName}</p>
                {u.username && <p className="text-[10px]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>@{u.username}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Inbox / Requests sub-tabs */}
      <div className="flex gap-1 mb-3">
        <button onClick={() => setDmSubTab('inbox')}
          className="flex-1 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all"
          style={{
            background: dmSubTab === 'inbox' ? 'rgba(var(--accent-rgb),0.1)' : 'rgba(var(--accent-rgb),0.02)',
            border: `1px solid ${dmSubTab === 'inbox' ? 'rgba(var(--accent-rgb),0.3)' : 'rgba(var(--accent-rgb),0.07)'}`,
            color: dmSubTab === 'inbox' ? 'var(--accent)' : 'rgba(74,96,128,0.5)',
          }}>
          INBOX
        </button>
        <button onClick={() => setDmSubTab('requests')}
          className="flex-1 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all relative"
          style={{
            background: dmSubTab === 'requests' ? 'rgba(255,214,0,0.1)' : 'rgba(255,214,0,0.02)',
            border: `1px solid ${dmSubTab === 'requests' ? 'rgba(255,214,0,0.35)' : 'rgba(255,214,0,0.07)'}`,
            color: dmSubTab === 'requests' ? '#ffd600' : 'rgba(74,96,128,0.5)',
          }}>
          REQUESTS{requestConvos.length > 0 ? ` (${requestConvos.length})` : ''}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'rgba(var(--accent-rgb),0.04)' }} />
          ))}
        </div>
      ) : displayedConvos.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3">
          <User size={28} style={{ color: 'rgba(var(--accent-rgb),0.15)' }} />
          <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>
            {dmSubTab === 'requests' ? 'NO REQUESTS' : 'NO MESSAGES YET'}
          </p>
          {dmSubTab === 'inbox' && (
            <p className="text-[11px] text-center" style={{ color: 'rgba(224,242,254,0.3)' }}>
              Search for a user above to start a conversation
            </p>
          )}
        </div>
      ) : displayedConvos.map((c) => (
        <button key={c.id} onClick={() => setActiveConvo(c.id)}
          className="w-full flex items-center gap-3 p-3 rounded-2xl text-left mb-2 transition-all"
          style={{
            background: c.isRequest ? 'rgba(255,214,0,0.03)' : 'rgba(7,7,26,0.8)',
            border: `1px solid ${c.isRequest ? 'rgba(255,214,0,0.15)' : 'rgba(var(--accent-rgb),0.08)'}`,
          }}>
          {c.other ? <Avatar user={c.other} size={44} /> : (
            <div className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}>
              <User size={18} style={{ color: 'rgba(var(--accent-rgb),0.3)' }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{c.other?.displayName ?? 'Unknown User'}</p>
              {c.isRequest && (
                <span className="text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 tracking-widest"
                  style={{ background: 'rgba(255,214,0,0.1)', border: '1px solid rgba(255,214,0,0.3)', color: '#ffd600' }}>
                  REQUEST
                </span>
              )}
            </div>
            {c.lastMessage ? (
              <p className="text-[11px] truncate" style={{ color: 'rgba(224,242,254,0.4)' }}>
                {c.lastMessage.senderId === dbUser?.id ? 'You: ' : ''}
                {c.lastMessage.text.startsWith('[VOICE]') ? '🎤 Voice message' : c.lastMessage.text}
              </p>
            ) : (
              <p className="text-[11px]" style={{ color: 'rgba(var(--accent-rgb),0.3)' }}>No messages yet</p>
            )}
          </div>
          {c.lastMessage && (
            <span className="text-[9px] shrink-0" style={{ color: 'rgba(224,242,254,0.25)' }}>
              {timeAgo(c.lastMessage.createdAt)}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ─── People Search ─────────────────────────────────────────────────────────────

interface PersonResult {
  id: string
  username: string
  displayName: string
  photoUrl?: string | null
  bio?: string | null
  subscriptionTier: string
  isFollowing: boolean
}

function PeopleSearch({ dbUserId }: { dbUserId: string | null }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PersonResult[]>([])
  const [searching, setSearching] = useState(false)
  const [followStates, setFollowStates] = useState<Record<string, boolean>>({})
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    const t = setTimeout(() => {
      setSearching(true)
      api.get<{ data: PersonResult[] }>(`/users/search?q=${encodeURIComponent(q)}`)
        .then((j) => {
          const data = (j?.data ?? []) as PersonResult[]
          setResults(data)
          const fs: Record<string, boolean> = {}
          data.forEach((u) => { fs[u.id] = u.isFollowing })
          setFollowStates(fs)
        })
        .catch(() => {})
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  async function toggleFollow(userId: string) {
    if (!dbUserId || followLoading[userId]) return
    setFollowLoading((p) => ({ ...p, [userId]: true }))
    const isFollowing = followStates[userId]
    try {
      if (isFollowing) {
        await api.delete(`/follow/${userId}`)
      } else {
        await api.post(`/follow/${userId}`, {})
      }
      setFollowStates((p) => ({ ...p, [userId]: !isFollowing }))
    } catch {}
    finally { setFollowLoading((p) => ({ ...p, [userId]: false })) }
  }

  return (
    <div className="px-4 max-w-xl mx-auto pb-6">
      {/* Search input */}
      <div className="relative mb-4">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
        <input
          type="text"
          placeholder="Search by name or @username..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          className="w-full pl-8 pr-3 py-3 rounded-xl text-sm bg-transparent outline-none"
          style={{ border: '1px solid rgba(var(--accent-rgb),0.2)', color: '#e0f2fe' }}
        />
      </div>

      {/* Empty state */}
      {!q.trim() && (
        <div className="py-16 flex flex-col items-center gap-3">
          <Users size={28} style={{ color: 'rgba(var(--accent-rgb),0.15)' }} />
          <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>FIND PEOPLE TO FOLLOW</p>
          <p className="text-[11px] text-center" style={{ color: 'rgba(224,242,254,0.3)' }}>Search by name or username above</p>
        </div>
      )}

      {/* Loading */}
      {searching && (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
        </div>
      )}

      {/* No results */}
      {!searching && q.trim() && results.length === 0 && (
        <div className="py-12 flex flex-col items-center gap-2">
          <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>NO USERS FOUND</p>
          <p className="text-[11px]" style={{ color: 'rgba(224,242,254,0.25)' }}>Try a different name or username</p>
        </div>
      )}

      {/* Results */}
      {!searching && results.map((u) => {
        const following = followStates[u.id] ?? u.isFollowing
        const loading = followLoading[u.id] ?? false
        return (
          <div key={u.id} className="flex items-center gap-3 p-3 rounded-2xl mb-2"
            style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
            <a href={`/profile/${u.username}`} className="shrink-0">
              <Avatar user={u} size={44} />
            </a>
            <div className="flex-1 min-w-0">
              <a href={`/profile/${u.username}`} className="block">
                <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{u.displayName}</p>
                {u.username && <p className="text-[10px]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>@{u.username}</p>}
                {u.bio && <p className="text-[10px] mt-0.5 truncate" style={{ color: 'rgba(224,242,254,0.35)' }}>{u.bio}</p>}
              </a>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              {dbUserId && (
                <button
                  onClick={() => toggleFollow(u.id)}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                  style={{
                    background: following ? 'rgba(var(--accent-rgb),0.06)' : 'rgba(var(--accent-rgb),0.12)',
                    border: `1px solid ${following ? 'rgba(var(--accent-rgb),0.15)' : 'rgba(var(--accent-rgb),0.3)'}`,
                    color: following ? 'rgba(var(--accent-rgb),0.5)' : 'var(--accent)',
                  }}>
                  {following ? <UserCheck size={11} /> : <UserPlus size={11} />}
                  <span className="text-[9px] font-black tracking-wide">{loading ? '...' : following ? 'FOLLOWING' : 'FOLLOW'}</span>
                </button>
              )}
              <a href={`/profile/${u.username}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-center"
                style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.1)', color: 'rgba(var(--accent-rgb),0.5)' }}>
                <User size={11} />
                <span className="text-[9px] font-black tracking-wide">PROFILE</span>
              </a>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { dbUser, firebaseUser } = useAuth()
  const [tab, setTab] = useState<'dms' | 'people' | 'community'>('dms')
  const [groups, setGroups] = useState<GroupChat[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [token, setToken] = useState('')

  // Fetch a live Firebase ID token — used by GroupChatView
  useEffect(() => {
    if (!firebaseUser) return
    firebaseUser.getIdToken().then(setToken).catch(() => {})
  }, [firebaseUser])

  // Host/attendee mode (same pattern as Navbar)
  const [isHost, setIsHost] = useState(false)
  useEffect(() => {
    setIsHost(localStorage.getItem('partyradar_account_mode') === 'HOST')
    function onModeChange(e: Event) { setIsHost((e as CustomEvent).detail === 'HOST') }
    window.addEventListener('partyradar:mode-change', onModeChange)
    return () => window.removeEventListener('partyradar:mode-change', onModeChange)
  }, [])

  useEffect(() => {
    // Try to get user location for proximity-sorted venue groups
    function fetchGroups(lat?: number, lng?: number) {
      const params = lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : ''
      api.get<{ data: GroupChat[] }>(`/groups${params}`)
        .then((j) => setGroups(j?.data ?? []))
        .catch(() => {})
        .finally(() => setGroupsLoading(false))
    }
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => fetchGroups(coords.latitude, coords.longitude),
        () => fetchGroups(),
        { timeout: 3000 },
      )
    } else {
      fetchGroups()
    }
  }, [dbUser?.id])

  function handleGroupUpdate(id: string, patch: Partial<GroupChat>) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  }

  // If a group chat is open, render it full-screen (no tab bar)
  if (tab === 'community' && activeGroupId) {
    return (
      <div style={{ paddingTop: 56 }}>
        <GroupChatView
          groupId={activeGroupId}
          onBack={() => setActiveGroupId(null)}
          dbUserId={dbUser?.id ?? null}
          token={token}
          onGroupUpdate={handleGroupUpdate}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#04040d', paddingTop: 56 }}>
      {/* Main tabs */}
      <div className="flex gap-1 px-4 pt-5 pb-3 max-w-xl mx-auto">
        {(['dms', 'people', 'community'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 rounded-xl text-[11px] font-black tracking-widest transition-all"
            style={{
              background: tab === t ? 'rgba(var(--accent-rgb),0.12)' : 'rgba(var(--accent-rgb),0.03)',
              border: `1px solid ${tab === t ? 'rgba(var(--accent-rgb),0.35)' : 'rgba(var(--accent-rgb),0.08)'}`,
              color: tab === t ? 'var(--accent)' : 'rgba(74,96,128,0.5)',
            }}>
            {t === 'dms' ? '💬 DMs' : t === 'people' ? '👥 PEOPLE' : isHost ? '👑 GROUPS' : '🌐 COMMUNITY'}
          </button>
        ))}
      </div>

      {tab === 'dms' && (
        <DmSection dbUser={dbUser} />
      )}

      {tab === 'people' && (
        <PeopleSearch dbUserId={dbUser?.id ?? null} />
      )}

      {tab === 'community' && (
        <>
          {groupsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
            </div>
          ) : isHost ? (
            <HostGroupDashboard groups={groups} dbUserId={dbUser?.id ?? null}
              onOpen={(g) => setActiveGroupId(g.id)}
              onCreateGroup={(g) => { setGroups((prev) => [...prev, g]); setActiveGroupId(g.id) }} />
          ) : (
            <GroupBrowser groups={groups} dbUserId={dbUser?.id ?? null}
              onOpen={(g) => setActiveGroupId(g.id)}
              onCreateGroup={(g) => { setGroups((prev) => [...prev, g]); setActiveGroupId(g.id) }} />
          )}
        </>
      )}
    </div>
  )
}
