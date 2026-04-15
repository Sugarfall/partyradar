'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageCircle, Send, ArrowLeft, Search, LogIn, Zap, User, Bell, BellOff,
  Users, UserPlus, UserCheck, Hash, Lock, Crown, Eye, EyeOff,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { API_URL } from '@/lib/api'
import { auth } from '@/lib/firebase'

/** Get a fresh Firebase ID token for API calls */
async function getToken(): Promise<string> {
  try { return (await auth.currentUser?.getIdToken()) ?? '' } catch { return '' }
}

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
}

interface DmMessage {
  id: string
  senderId: string
  senderName: string
  senderPhoto?: string | null
  text: string
  createdAt: string
}

interface GroupChat {
  id: string
  slug: string
  name: string
  description?: string | null
  type: 'GENRE' | 'VENUE'
  emoji: string
  coverColor: string
  isPrivate?: boolean
  isPaid?: boolean
  hasPassword?: boolean
  pendingRequest?: boolean
  joinRequestCount?: number
  priceMonthly?: number | null
  isOwner?: boolean
  isSubscribed?: boolean
  memberCount: number
  isJoined: boolean
  notificationsEnabled: boolean
  lastMessage: { text: string; senderName: string; createdAt: string } | null
}

interface GroupMember {
  id: string
  displayName: string
  username?: string | null
  photoUrl?: string | null
  isOwner: boolean
  isMe: boolean
  isFollowing: boolean
}

interface GroupMessage {
  id: string
  senderId: string
  senderName: string
  senderPhoto?: string | null
  senderUsername?: string | null
  text: string
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
      style={{ width: size, height: size, background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.3)', color: '#00e5ff' }}>
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
  const [newCustomPrice, setNewCustomPrice] = useState('')
  const [creating, setCreating] = useState(false)

  const myGroups = groups.filter((g) => g.isOwner)
  const totalSubs = myGroups.reduce((sum, g) => sum + (g.isPaid ? g.memberCount : 0), 0)
  const paidGroups = myGroups.filter((g) => g.isPaid)

  const COLORS = ['#a855f7', '#3b82f6', '#ec4899', '#10b981', '#f97316', '#ef4444', '#06b6d4', '#6366f1', '#eab308', '#f43f5e']
  const EMOJIS = ['💬', '🎵', '🎉', '🌙', '🔥', '💜', '🎶', '⚡', '🌈', '🫶', '🎪', '🤙']

  async function handleCreate() {
    if (!newName.trim() || creating) return
    setCreating(true)
    try {
      const tok = await getToken()
      const hdrs: Record<string, string> = { 'Content-Type': 'application/json' }
      if (tok) hdrs['Authorization'] = `Bearer ${tok}`
      const body: Record<string, unknown> = {
        name: newName.trim(), description: newDesc.trim() || undefined,
        emoji: newEmoji, coverColor: newColor,
      }
      if (newPaid) {
        body.isPaid = true
        body.priceTierId = newPriceTier
        if (newPriceTier === 'CUSTOM' && newCustomPrice) body.customPrice = parseFloat(newCustomPrice)
      } else if (newPrivate) {
        body.isPrivate = true
        if (newPassword.trim()) body.password = newPassword.trim()
      }
      const r = await fetch(`${API_URL}/groups`, { method: 'POST', headers: hdrs, body: JSON.stringify(body) })
      const j = await r.json()
      if (j.data) {
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
              background: 'linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(0,229,255,0.08) 100%)',
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
                      <Crown size={7} /> £{g.priceMonthly?.toFixed(2)}/mo
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

            {/* Password / access for private groups */}
            {newPrivate && !newPaid && (
              <div className="space-y-2">
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} placeholder="Join code (optional — leave blank for request-to-join)"
                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm bg-transparent outline-none"
                    style={{ border: '1px solid rgba(255,0,110,0.2)', color: '#e0f2fe' }} />
                  <button onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'rgba(224,242,254,0.3)' }}>
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>
                  {newPassword ? '🔑 Password access — members enter this code to join' : '✋ Request-to-join — you approve each member'}
                </p>
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
                {/* Custom price option */}
                <button
                  onClick={() => setNewPriceTier('CUSTOM')}
                  className="w-full mt-2 py-2 rounded-xl text-center transition-all"
                  style={{
                    background: newPriceTier === 'CUSTOM' ? 'rgba(255,214,0,0.12)' : 'rgba(168,85,247,0.03)',
                    border: `1px solid ${newPriceTier === 'CUSTOM' ? 'rgba(255,214,0,0.4)' : 'rgba(168,85,247,0.08)'}`,
                  }}>
                  <p className="text-sm font-black" style={{ color: newPriceTier === 'CUSTOM' ? '#ffd600' : 'rgba(224,242,254,0.5)' }}>✏ Custom<span className="text-[9px] font-normal"> amount</span></p>
                  <p className="text-[9px]" style={{ color: newPriceTier === 'CUSTOM' ? 'rgba(255,214,0,0.6)' : 'rgba(224,242,254,0.3)' }}>Set your own monthly price</p>
                </button>
                {newPriceTier === 'CUSTOM' && (
                  <div className="mt-2 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: 'rgba(255,214,0,0.6)' }}>£</span>
                    <input
                      type="number" min={0.5} max={99.99} step={0.5}
                      placeholder="e.g. 3.50"
                      value={newCustomPrice}
                      onChange={(e) => setNewCustomPrice(e.target.value)}
                      className="w-full pl-7 pr-10 py-2.5 rounded-xl text-sm bg-transparent outline-none"
                      style={{ border: '1px solid rgba(255,214,0,0.35)', color: '#ffd600' }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold" style={{ color: 'rgba(255,214,0,0.4)' }}>/mo</span>
                  </div>
                )}
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
              disabled={!newName.trim() || creating}
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
  const [sub, setSub] = useState<'public' | 'venues' | 'private' | 'paid'>('public')
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
  const [newCustomPrice, setNewCustomPrice] = useState('')
  const [creating, setCreating] = useState(false)

  // 4 categories
  const publicGroups = groups.filter((g) => g.type === 'GENRE' && !g.isPrivate && !g.isPaid)
  const venueGroups = groups.filter((g) => g.type === 'VENUE')
  const privateGroups = groups.filter((g) => g.isPrivate && !g.isPaid)
  const paidGroups = groups.filter((g) => g.isPaid)

  const GENRE_ORDER = ['genre-rave', 'genre-house', 'genre-rnb', 'genre-trippy', 'genre-dnb', 'genre-afrobeats', 'genre-rock', 'genre-electronic']
  const sortedPublic = [...publicGroups].sort((a, b) => {
    const aIdx = GENRE_ORDER.indexOf(a.slug); const bIdx = GENRE_ORDER.indexOf(b.slug)
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx
    if (aIdx >= 0) return -1; if (bIdx >= 0) return 1
    return a.name.localeCompare(b.name)
  })

  async function handleCreate() {
    if (!newName.trim() || creating) return
    setCreating(true)
    try {
      const tok = await getToken()
      const hdrs: Record<string, string> = { 'Content-Type': 'application/json' }
      if (tok) hdrs['Authorization'] = `Bearer ${tok}`
      const body: Record<string, unknown> = {
        name: newName.trim(), description: newDesc.trim() || undefined,
        emoji: newEmoji, coverColor: newColor,
      }
      if (newPaid) {
        body.isPaid = true; body.priceTierId = newPriceTier
        if (newPriceTier === 'CUSTOM' && newCustomPrice) body.customPrice = parseFloat(newCustomPrice)
      } else if (newPrivate) {
        body.isPrivate = true
        if (newPassword.trim()) body.password = newPassword.trim()
      }
      const r = await fetch(`${API_URL}/groups`, { method: 'POST', headers: hdrs, body: JSON.stringify(body) })
      const j = await r.json()
      if (j.data) {
        onCreateGroup(j.data)
        setShowCreate(false); setNewName(''); setNewDesc(''); setNewEmoji('💬'); setNewColor('#6366f1')
        setNewPrivate(false); setNewPassword(''); setNewPaid(false); setNewPriceTier('MICRO')
        setSub(newPaid ? 'paid' : newPrivate ? 'private' : 'public')
      }
    } catch {}
    finally { setCreating(false) }
  }

  const COLORS = ['#a855f7', '#3b82f6', '#ec4899', '#10b981', '#f97316', '#ef4444', '#06b6d4', '#6366f1', '#eab308', '#f43f5e']
  const EMOJIS = ['💬', '🎵', '🎉', '🌙', '🔥', '💜', '🎶', '⚡', '🌈', '🫶', '🎪', '🤙']

  const TABS = [
    { id: 'public' as const, label: '🌐 PUBLIC', count: publicGroups.length, color: '#00e5ff' },
    { id: 'venues' as const, label: '🏙️ VENUES', count: venueGroups.length, color: '#00ff88' },
    { id: 'private' as const, label: '🔒 PRIVATE', count: privateGroups.length, color: '#ff006e' },
    { id: 'paid' as const, label: '👑 PAID', count: paidGroups.length, color: '#ffd600' },
  ]

  function GroupRow({ g }: { g: GroupChat }) {
    return (
      <button key={g.id} onClick={() => onOpen(g)}
        className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all active:scale-[0.98]"
        style={{ background: 'rgba(7,7,26,0.85)', border: '1px solid rgba(0,229,255,0.07)' }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${g.coverColor}40`; e.currentTarget.style.background = `${g.coverColor}06` }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,229,255,0.07)'; e.currentTarget.style.background = 'rgba(7,7,26,0.85)' }}>
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl"
          style={{ background: `${g.coverColor}18`, border: `1px solid ${g.coverColor}30` }}>
          {g.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black" style={{ color: '#ffffff' }}>{g.name}</p>
            {g.isJoined && (
              <span className="text-[8px] font-black px-1.5 py-0.5 rounded"
                style={{ background: `${g.coverColor}20`, border: `1px solid ${g.coverColor}40`, color: g.coverColor }}>
                {g.isPaid ? 'SUBSCRIBED' : 'JOINED'}
              </span>
            )}
            {g.pendingRequest && (
              <span className="text-[8px] font-black px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(255,214,0,0.12)', border: '1px solid rgba(255,214,0,0.3)', color: '#ffd600' }}>
                PENDING
              </span>
            )}
          </div>
          {g.description ? (
            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'rgba(224,242,254,0.4)' }}>{g.description}</p>
          ) : g.lastMessage ? (
            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'rgba(224,242,254,0.35)' }}>
              {g.lastMessage.senderName}: {g.lastMessage.text}
            </p>
          ) : (
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(0,229,255,0.25)' }}>No messages yet</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] flex items-center gap-1" style={{ color: `${g.coverColor}80` }}>
              <Users size={8} /> {g.memberCount}
            </span>
            {g.lastMessage && (
              <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.2)' }}>{timeAgo(g.lastMessage.createdAt)}</span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <div className="w-2 h-2 rounded-full" style={{ background: g.coverColor, boxShadow: `0 0 6px ${g.coverColor}` }} />
        </div>
      </button>
    )
  }

  return (
    <div className="pb-28">
      {/* 4-tab category nav */}
      <div className="px-4 pb-3 overflow-x-auto">
        <div className="flex gap-1.5 min-w-max">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setSub(t.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all whitespace-nowrap"
              style={{
                background: sub === t.id ? `${t.color}15` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${sub === t.id ? t.color + '50' : 'rgba(255,255,255,0.06)'}`,
                color: sub === t.id ? t.color : 'rgba(255,255,255,0.3)',
                boxShadow: sub === t.id ? `0 0 12px ${t.color}20` : 'none',
              }}>
              {t.label}
              {t.count > 0 && (
                <span className="text-[9px] px-1 rounded-full font-bold"
                  style={{ background: sub === t.id ? `${t.color}25` : 'rgba(255,255,255,0.06)', color: sub === t.id ? t.color : 'rgba(255,255,255,0.3)' }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Public chat groups */}
      {sub === 'public' && (
        <div className="px-4 space-y-2">
          {sortedPublic.length === 0 ? (
            <div className="py-16 text-center text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>No public groups yet</div>
          ) : sortedPublic.map((g) => <GroupRow key={g.id} g={g} />)}
        </div>
      )}

      {/* Venue chat groups */}
      {sub === 'venues' && (
        <div className="px-4 space-y-2">
          {venueGroups.length === 0 ? (
            <div className="py-16 text-center text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>
              Venue chats loading — run seed-activity to populate
            </div>
          ) : venueGroups.map((g) => <GroupRow key={g.id} g={g} />)}
        </div>
      )}

      {/* Private groups */}
      {sub === 'private' && (
        <div className="px-4 space-y-2">
          {privateGroups.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <Lock size={28} style={{ color: 'rgba(255,0,110,0.2)' }} />
              <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(255,0,110,0.4)' }}>NO PRIVATE GROUPS YET</p>
              <p className="text-[11px] text-center" style={{ color: 'rgba(224,242,254,0.3)', maxWidth: 260 }}>
                Create a private group with a password or request-to-join access
              </p>
            </div>
          ) : privateGroups.map((g) => <GroupRow key={g.id} g={g} />)}
        </div>
      )}

      {/* Paid groups */}
      {sub === 'paid' && (
        <div className="px-4 space-y-2">
          {paidGroups.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <Crown size={28} style={{ color: 'rgba(255,214,0,0.2)' }} />
              <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(255,214,0,0.4)' }}>NO PAID GROUPS YET</p>
              <p className="text-[11px] text-center" style={{ color: 'rgba(224,242,254,0.3)', maxWidth: 260 }}>
                Subscribe to exclusive communities for premium content
              </p>
            </div>
          ) : paidGroups.map((g) => (
            <button key={g.id} onClick={() => onOpen(g)}
              className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all active:scale-[0.98]"
              style={{
                background: g.isJoined ? 'linear-gradient(135deg, rgba(255,214,0,0.06),rgba(168,85,247,0.04))' : 'rgba(7,7,26,0.85)',
                border: `1px solid ${g.isJoined ? 'rgba(255,214,0,0.25)' : 'rgba(255,214,0,0.12)'}`,
              }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl"
                style={{ background: `${g.coverColor}18`, border: `1px solid ${g.coverColor}30` }}>
                {g.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black" style={{ color: '#ffffff' }}>{g.name}</p>
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5"
                    style={{ background: 'rgba(255,214,0,0.15)', border: '1px solid rgba(255,214,0,0.3)', color: '#ffd600' }}>
                    <Crown size={7} /> £{g.priceMonthly?.toFixed(2)}/mo
                  </span>
                </div>
                {g.description && <p className="text-[11px] mt-0.5 truncate" style={{ color: 'rgba(224,242,254,0.4)' }}>{g.description}</p>}
                <span className="text-[9px] flex items-center gap-1 mt-1" style={{ color: 'rgba(255,214,0,0.5)' }}>
                  <Users size={8} /> {g.memberCount} subscribers
                </span>
              </div>
              <div className="shrink-0">
                {g.isJoined ? (
                  <span className="text-[9px] font-black px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(255,214,0,0.12)', color: '#ffd600' }}>ACTIVE</span>
                ) : (
                  <span className="text-[9px] font-black px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.2)', color: '#ffd600' }}>JOIN</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create group button */}
      {dbUserId && (
        <div className="px-4 mt-4">
          <button onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black tracking-widest transition-all"
            style={{ background: 'rgba(0,229,255,0.04)', border: '1px dashed rgba(0,229,255,0.2)', color: 'rgba(0,229,255,0.5)' }}>
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
            style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(0,229,255,0.15)' }}>
            <p className="text-xs font-black tracking-widest" style={{ color: '#00e5ff' }}>CREATE GROUP</p>

            <input type="text" placeholder="Group name" value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 40))}
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none"
              style={{ border: '1px solid rgba(0,229,255,0.15)', color: '#e0f2fe' }} />

            <input type="text" placeholder="Description (optional)" value={newDesc}
              onChange={(e) => setNewDesc(e.target.value.slice(0, 200))}
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none"
              style={{ border: '1px solid rgba(0,229,255,0.1)', color: '#e0f2fe' }} />

            {/* Emoji picker */}
            <div>
              <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: 'rgba(0,229,255,0.4)' }}>EMOJI</p>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map((e) => (
                  <button key={e} onClick={() => setNewEmoji(e)}
                    className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all"
                    style={{
                      background: newEmoji === e ? 'rgba(0,229,255,0.15)' : 'rgba(0,229,255,0.03)',
                      border: `1px solid ${newEmoji === e ? 'rgba(0,229,255,0.4)' : 'rgba(0,229,255,0.08)'}`,
                    }}>{e}</button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div>
              <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: 'rgba(0,229,255,0.4)' }}>COLOR</p>
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
              <p className="text-[9px] font-bold tracking-widest mb-2" style={{ color: 'rgba(0,229,255,0.4)' }}>ACCESS</p>
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
                      background: opt.active ? 'rgba(0,229,255,0.12)' : 'rgba(0,229,255,0.03)',
                      border: `1px solid ${opt.active ? 'rgba(0,229,255,0.4)' : 'rgba(0,229,255,0.08)'}`,
                      color: opt.active ? '#00e5ff' : 'rgba(224,242,254,0.35)',
                    }}>
                    {opt.icon}
                    <span className="text-[9px] font-bold tracking-wide">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Password / access for private groups */}
            {newPrivate && !newPaid && (
              <div className="space-y-2">
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} placeholder="Join code (optional — leave blank for request-to-join)"
                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm bg-transparent outline-none"
                    style={{ border: '1px solid rgba(255,0,110,0.2)', color: '#e0f2fe' }} />
                  <button onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'rgba(224,242,254,0.3)' }}>
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>
                  {newPassword ? '🔑 Password access — members enter this code to join' : '✋ Request-to-join — you approve each member'}
                </p>
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
                          background: active ? 'rgba(255,214,0,0.12)' : 'rgba(0,229,255,0.03)',
                          border: `1px solid ${active ? 'rgba(255,214,0,0.4)' : 'rgba(0,229,255,0.08)'}`,
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
              disabled={!newName.trim() || creating}
              className="w-full py-3 rounded-xl text-xs font-black tracking-widest transition-all disabled:opacity-40"
              style={{
                background: newPaid ? 'rgba(255,214,0,0.12)' : 'rgba(0,229,255,0.12)',
                border: `1px solid ${newPaid ? 'rgba(255,214,0,0.35)' : 'rgba(0,229,255,0.35)'}`,
                color: newPaid ? '#ffd600' : '#00e5ff',
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
  groupId, onBack, dbUserId,
  onGroupUpdate,
}: {
  groupId: string
  onBack: () => void
  dbUserId: string | null
  onGroupUpdate: (id: string, patch: Partial<GroupChat>) => void
}) {
  const [group, setGroup] = useState<GroupChat | null>(null)
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [userPopup, setUserPopup] = useState<GroupMessage | null>(null)
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set())
  const [locked, setLocked] = useState(false)
  const [showPwModal, setShowPwModal] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState('')
  const [showSubModal, setShowSubModal] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [requesting, setRequesting] = useState(false)
  // Member list
  const [showMembers, setShowMembers] = useState(false)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  // Join requests (owner only)
  const [showRequests, setShowRequests] = useState(false)
  const [joinRequests, setJoinRequests] = useState<GroupMember[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  async function buildHeaders(): Promise<Record<string, string>> {
    const tok = await getToken()
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (tok) h['Authorization'] = `Bearer ${tok}`
    return h
  }

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const h = await buildHeaders()
      const r = await fetch(`${API_URL}/groups/${groupId}/messages`, { headers: h })
      const j = await r.json()
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

  async function toggleJoin() {
    if (!group) return
    const joined = group.isJoined

    // If trying to join a paid group — show subscribe modal
    if (!joined && group.isPaid && !group.isSubscribed && !group.isOwner) {
      setShowSubModal(true)
      return
    }

    // If trying to join a private (non-paid) group
    if (!joined && group.isPrivate && !group.isPaid && !group.isOwner) {
      if (group.hasPassword) {
        setShowPwModal(true)
      } else {
        // Request-to-join flow
        await sendJoinRequest()
      }
      return
    }

    const h = await buildHeaders()
    const r = await fetch(`${API_URL}/groups/${groupId}/${joined ? 'leave' : 'join'}`, {
      method: joined ? 'DELETE' : 'POST', headers: h,
    })
    if (r.ok) {
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

  async function sendJoinRequest() {
    if (requesting) return
    // Cancel if already pending
    if (group?.pendingRequest) {
      const h = await buildHeaders()
      await fetch(`${API_URL}/groups/${groupId}/join-request`, { method: 'DELETE', headers: h })
      setGroup((g) => g ? { ...g, pendingRequest: false } : g)
      return
    }
    setRequesting(true)
    try {
      const h = await buildHeaders()
      const r = await fetch(`${API_URL}/groups/${groupId}/join-request`, { method: 'POST', headers: h })
      if (r.ok) setGroup((g) => g ? { ...g, pendingRequest: true } : g)
    } catch {} finally { setRequesting(false) }
  }

  async function joinWithPassword() {
    if (!pwInput.trim()) return
    setPwError('')
    const h = await buildHeaders()
    const r = await fetch(`${API_URL}/groups/${groupId}/join`, {
      method: 'POST', headers: h, body: JSON.stringify({ password: pwInput.trim() }),
    })
    if (r.ok) {
      setShowPwModal(false); setPwInput('')
      const patch = { isJoined: true, memberCount: (group?.memberCount ?? 0) + 1, notificationsEnabled: true }
      setGroup((g) => g ? { ...g, ...patch } : g)
      onGroupUpdate(groupId, patch)
      load()
    } else {
      const j = await r.json().catch(() => ({}))
      setPwError(j.error ?? 'Incorrect code')
    }
  }

  async function handleSubscribe() {
    setSubscribing(true)
    try {
      const h = await buildHeaders()
      const r = await fetch(`${API_URL}/groups/${groupId}/subscribe`, { method: 'POST', headers: h })
      if (r.ok) {
        setShowSubModal(false)
        const patch = { isJoined: true, isSubscribed: true, memberCount: (group?.memberCount ?? 0) + 1, notificationsEnabled: true }
        setGroup((g) => g ? { ...g, ...patch } : g)
        onGroupUpdate(groupId, patch)
        load()
      }
    } catch {}
    finally { setSubscribing(false) }
  }

  async function toggleNotifications() {
    if (!group) return
    const enabled = !group.notificationsEnabled
    const h = await buildHeaders()
    await fetch(`${API_URL}/groups/${groupId}/notifications`, {
      method: 'PUT', headers: h, body: JSON.stringify({ enabled }),
    })
    setGroup((g) => g ? { ...g, notificationsEnabled: enabled } : g)
  }

  async function loadMembers() {
    setMembersLoading(true)
    try {
      const h = await buildHeaders()
      const r = await fetch(`${API_URL}/groups/${groupId}/members`, { headers: h })
      const j = await r.json()
      if (j.data) setMembers(j.data)
    } catch {} finally { setMembersLoading(false) }
  }

  async function loadJoinRequests() {
    try {
      const h = await buildHeaders()
      const r = await fetch(`${API_URL}/groups/${groupId}/join-requests`, { headers: h })
      const j = await r.json()
      if (j.data) setJoinRequests(j.data)
    } catch {}
  }

  async function approveRequest(userId: string) {
    const h = await buildHeaders()
    const r = await fetch(`${API_URL}/groups/${groupId}/join-requests/${userId}/approve`, { method: 'PUT', headers: h })
    if (r.ok) {
      setJoinRequests((prev) => prev.filter((u) => u.id !== userId))
      setGroup((g) => g ? { ...g, memberCount: (g.memberCount ?? 0) + 1, joinRequestCount: Math.max(0, (g.joinRequestCount ?? 0) - 1) } : g)
    }
  }

  async function rejectRequest(userId: string) {
    const h = await buildHeaders()
    await fetch(`${API_URL}/groups/${groupId}/join-requests/${userId}/reject`, { method: 'DELETE', headers: h })
    setJoinRequests((prev) => prev.filter((u) => u.id !== userId))
    setGroup((g) => g ? { ...g, joinRequestCount: Math.max(0, (g.joinRequestCount ?? 0) - 1) } : g)
  }

  async function sendMessage() {
    if (!text.trim() || sending || !dbUserId) return
    setSending(true)
    const draft = text.trim()
    setText('')

    const optimisticId = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const optimisticMsg: GroupMessage = {
      id: optimisticId,
      senderId: dbUserId,
      senderName: '',
      senderPhoto: null,
      senderUsername: null,
      text: draft,
      createdAt: new Date().toISOString(),
      isFollowing: false,
    }
    setMessages((prev) => [...prev, optimisticMsg])

    try {
      const h = await buildHeaders()
      const r = await fetch(`${API_URL}/groups/${groupId}/messages`, {
        method: 'POST', headers: h, body: JSON.stringify({ text: draft }),
      })
      const j = await r.json()
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

  async function followUser(senderId: string) {
    if (!dbUserId || senderId === dbUserId) return
    const already = followingSet.has(senderId)
    const method = already ? 'DELETE' : 'POST'
    const h = await buildHeaders()
    const r = await fetch(`${API_URL}/follow/${senderId}`, { method, headers: h })
    if (r.ok || r.status === 409) {
      setFollowingSet((s) => {
        const next = new Set(s)
        already ? next.delete(senderId) : next.add(senderId)
        return next
      })
      setMessages((prev) => prev.map((m) => m.senderId === senderId ? { ...m, isFollowing: !already } : m))
    }
    setUserPopup(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
    </div>
  )

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 3.5rem)', background: '#04040d' }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-3"
        style={{ background: 'rgba(4,4,13,0.95)', borderBottom: '1px solid rgba(0,229,255,0.1)', backdropFilter: 'blur(12px)' }}>
        <button onClick={onBack} className="p-1.5 rounded-lg shrink-0" style={{ color: 'rgba(0,229,255,0.6)' }}>
          <ArrowLeft size={18} />
        </button>
        {group && (
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ background: `${group.coverColor}18`, border: `1px solid ${group.coverColor}30` }}>
            {group.emoji}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black truncate" style={{ color: '#ffffff' }}>{group?.name ?? '...'}</p>
          <button
            onClick={() => { setShowMembers(true); loadMembers() }}
            className="text-[10px] transition-colors hover:underline text-left"
            style={{ color: 'rgba(0,229,255,0.5)' }}
          >
            {group?.memberCount ?? 0} members
          </button>
        </div>
        {group && dbUserId && (
          <div className="flex items-center gap-1.5">
            {/* Owner: join requests badge */}
            {group.isOwner && group.isPrivate && !group.hasPassword && (group.joinRequestCount ?? 0) > 0 && (
              <button
                onClick={() => { setShowRequests(true); loadJoinRequests() }}
                className="relative p-2 rounded-xl"
                style={{ background: 'rgba(255,214,0,0.1)', border: '1px solid rgba(255,214,0,0.3)', color: '#ffd600' }}
              >
                <Users size={13} />
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center"
                  style={{ background: '#ffd600', color: '#04040d' }}>
                  {group.joinRequestCount}
                </span>
              </button>
            )}
            {group.isJoined && (
              <button onClick={toggleNotifications}
                className="p-2 rounded-xl transition-all"
                style={{
                  background: group.notificationsEnabled ? 'rgba(0,229,255,0.1)' : 'rgba(0,229,255,0.03)',
                  border: `1px solid ${group.notificationsEnabled ? 'rgba(0,229,255,0.3)' : 'rgba(0,229,255,0.1)'}`,
                  color: group.notificationsEnabled ? '#00e5ff' : 'rgba(0,229,255,0.3)',
                }}>
                {group.notificationsEnabled ? <Bell size={13} /> : <BellOff size={13} />}
              </button>
            )}
            {!group.isOwner && (
              <button onClick={toggleJoin}
                className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
                style={{
                  background: group.isJoined
                    ? 'rgba(0,229,255,0.06)'
                    : group.pendingRequest ? 'rgba(255,214,0,0.08)'
                    : group.isPaid ? 'rgba(255,214,0,0.12)' : `${group.coverColor}22`,
                  border: `1px solid ${group.isJoined
                    ? 'rgba(0,229,255,0.2)'
                    : group.pendingRequest ? 'rgba(255,214,0,0.3)'
                    : group.isPaid ? 'rgba(255,214,0,0.4)' : group.coverColor + '60'}`,
                  color: group.isJoined
                    ? 'rgba(0,229,255,0.6)'
                    : group.pendingRequest ? '#ffd600'
                    : group.isPaid ? '#ffd600' : group.coverColor,
                }}>
                {group.isJoined
                  ? (group.isPaid ? 'SUBSCRIBED' : 'JOINED')
                  : group.pendingRequest ? 'PENDING ✕'
                  : group.isPaid ? `£${group.priceMonthly?.toFixed(2)}`
                  : group.isPrivate ? (group.hasPassword ? '🔑 CODE' : '✋ REQUEST')
                  : 'JOIN'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
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
                  Subscribe for £{group.priceMonthly?.toFixed(2)}/mo to access messages and join the community
                </p>
                <button onClick={() => setShowSubModal(true)}
                  className="mt-1 px-6 py-2.5 rounded-xl text-xs font-black tracking-widest"
                  style={{ background: 'rgba(255,214,0,0.15)', border: '1px solid rgba(255,214,0,0.4)', color: '#ffd600' }}>
                  SUBSCRIBE
                </button>
              </>
            ) : group?.hasPassword ? (
              <>
                <div className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,0,110,0.1)', border: '1px solid rgba(255,0,110,0.3)' }}>
                  <Lock size={28} style={{ color: '#ff006e' }} />
                </div>
                <p className="text-sm font-black tracking-wide" style={{ color: '#ff006e' }}>PRIVATE GROUP</p>
                <p className="text-xs" style={{ color: 'rgba(224,242,254,0.4)', maxWidth: 260 }}>
                  This group requires a password to join
                </p>
                <button onClick={() => setShowPwModal(true)}
                  className="mt-1 px-6 py-2.5 rounded-xl text-xs font-black tracking-widest"
                  style={{ background: 'rgba(255,0,110,0.1)', border: '1px solid rgba(255,0,110,0.35)', color: '#ff006e' }}>
                  🔑 ENTER CODE
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
                  {group?.pendingRequest
                    ? 'Your request is pending approval by the group owner.'
                    : 'Request to join — the owner will review and approve your request.'}
                </p>
                <button
                  onClick={sendJoinRequest}
                  disabled={requesting}
                  className="mt-1 px-6 py-2.5 rounded-xl text-xs font-black tracking-widest disabled:opacity-50"
                  style={{
                    background: group?.pendingRequest ? 'rgba(255,214,0,0.1)' : 'rgba(255,0,110,0.1)',
                    border: `1px solid ${group?.pendingRequest ? 'rgba(255,214,0,0.3)' : 'rgba(255,0,110,0.35)'}`,
                    color: group?.pendingRequest ? '#ffd600' : '#ff006e',
                  }}>
                  {requesting ? 'SENDING...' : group?.pendingRequest ? '⏳ REQUEST PENDING — CANCEL?' : '✋ REQUEST TO JOIN'}
                </button>
              </>
            )}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <Hash size={28} style={{ color: 'rgba(0,229,255,0.15)' }} />
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
                  <p className="text-[10px] mb-0.5 ml-1 font-bold" style={{ color: 'rgba(0,229,255,0.5)' }}>
                    {m.senderName}
                  </p>
                )}
                <div className="px-3 py-2 rounded-2xl text-sm"
                  style={isMe
                    ? { background: 'rgba(0,229,255,0.15)', border: '1px solid rgba(0,229,255,0.3)', color: '#e0f2fe', borderBottomRightRadius: 4 }
                    : { background: 'rgba(7,7,26,0.9)', border: '1px solid rgba(0,229,255,0.08)', color: '#e0f2fe', borderBottomLeftRadius: 4 }}>
                  {m.text}
                </div>
                <p className={`text-[9px] mt-0.5 ${isMe ? 'text-right' : 'text-left'}`}
                  style={{ color: 'rgba(224,242,254,0.2)' }}>{timeAgo(m.createdAt)}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {dbUserId ? (
        <div className="flex-shrink-0 px-4 py-3 flex gap-2"
          style={{ background: 'rgba(4,4,13,0.95)', borderTop: '1px solid rgba(0,229,255,0.08)' }}>
          <input type="text" placeholder={`Message #${group?.name.toLowerCase() ?? 'group'}...`}
            value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-transparent outline-none"
            style={{ border: '1px solid rgba(0,229,255,0.15)', color: '#e0f2fe' }} />
          <button onClick={sendMessage} disabled={!text.trim() || sending}
            className="p-2.5 rounded-xl transition-all"
            style={{
              background: text.trim() ? 'rgba(0,229,255,0.15)' : 'rgba(0,229,255,0.04)',
              border: `1px solid ${text.trim() ? 'rgba(0,229,255,0.4)' : 'rgba(0,229,255,0.1)'}`,
              color: text.trim() ? '#00e5ff' : 'rgba(0,229,255,0.2)',
            }}>
            <Send size={16} />
          </button>
        </div>
      ) : (
        <div className="flex-shrink-0 px-4 py-3 text-center"
          style={{ background: 'rgba(4,4,13,0.95)', borderTop: '1px solid rgba(0,229,255,0.08)' }}>
          <a href="/login" className="text-xs font-bold" style={{ color: 'rgba(0,229,255,0.5)' }}>
            Log in to join the conversation
          </a>
        </div>
      )}

      {/* User popup */}
      {userPopup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setUserPopup(null)}>
          <div className="w-full max-w-sm rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}
            style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(0,229,255,0.15)' }}>
            <div className="flex items-center gap-3">
              <Avatar user={{ displayName: userPopup.senderName, photoUrl: userPopup.senderPhoto }} size={48} />
              <div className="flex-1">
                <p className="font-black text-sm" style={{ color: '#ffffff' }}>{userPopup.senderName}</p>
                {userPopup.senderUsername && (
                  <p className="text-[11px]" style={{ color: 'rgba(0,229,255,0.4)' }}>@{userPopup.senderUsername}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {userPopup.senderUsername && (
                <a href={`/profile/${userPopup.senderUsername}`}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black"
                  style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)', color: '#00e5ff' }}
                  onClick={() => setUserPopup(null)}>
                  <Eye size={12} /> VIEW PROFILE
                </a>
              )}
              {dbUserId && userPopup.senderId !== dbUserId && (
                <button onClick={() => followUser(userPopup.senderId)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all"
                  style={{
                    background: followingSet.has(userPopup.senderId) ? 'rgba(0,229,255,0.06)' : 'rgba(0,229,255,0.12)',
                    border: `1px solid ${followingSet.has(userPopup.senderId) ? 'rgba(0,229,255,0.2)' : 'rgba(0,229,255,0.35)'}`,
                    color: followingSet.has(userPopup.senderId) ? 'rgba(0,229,255,0.5)' : '#00e5ff',
                  }}>
                  {followingSet.has(userPopup.senderId)
                    ? <><UserCheck size={12} /> FOLLOWING</>
                    : <><UserPlus size={12} /> FOLLOW</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Member list modal */}
      {showMembers && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-2 px-2"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowMembers(false)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}
            style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(0,229,255,0.15)', maxHeight: '80vh' }}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
              <div>
                <p className="text-sm font-black" style={{ color: '#ffffff' }}>Group Members</p>
                <p className="text-[10px]" style={{ color: 'rgba(0,229,255,0.4)' }}>{members.length} people</p>
              </div>
              <button onClick={() => setShowMembers(false)} style={{ color: 'rgba(255,255,255,0.3)' }}>✕</button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 80px)' }}>
              {membersLoading ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 rounded-full border-2 animate-spin"
                    style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
                </div>
              ) : members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: '1px solid rgba(0,229,255,0.04)' }}>
                  <Avatar user={{ displayName: m.displayName, photoUrl: m.photoUrl }} size={38} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold truncate" style={{ color: '#ffffff' }}>{m.displayName}</p>
                      {m.isOwner && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded font-black shrink-0"
                          style={{ background: 'rgba(255,214,0,0.12)', color: '#ffd600', border: '1px solid rgba(255,214,0,0.25)' }}>
                          OWNER
                        </span>
                      )}
                      {m.isMe && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded font-black shrink-0"
                          style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.2)' }}>
                          YOU
                        </span>
                      )}
                    </div>
                    {m.username && (
                      <p className="text-[10px]" style={{ color: 'rgba(0,229,255,0.4)' }}>@{m.username}</p>
                    )}
                  </div>
                  {!m.isMe && m.username && (
                    <a href={`/profile/${m.username}`}
                      onClick={() => setShowMembers(false)}
                      className="text-[9px] font-black px-2.5 py-1.5 rounded-lg transition-all"
                      style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)', color: 'rgba(0,229,255,0.6)' }}>
                      PROFILE
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Join requests modal (owner only) */}
      {showRequests && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-2 px-2"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowRequests(false)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}
            style={{ background: 'rgba(7,7,26,0.98)', border: '1px solid rgba(255,214,0,0.2)', maxHeight: '80vh' }}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid rgba(255,214,0,0.08)' }}>
              <div>
                <p className="text-sm font-black" style={{ color: '#ffd600' }}>Join Requests</p>
                <p className="text-[10px]" style={{ color: 'rgba(255,214,0,0.5)' }}>{joinRequests.length} pending</p>
              </div>
              <button onClick={() => setShowRequests(false)} style={{ color: 'rgba(255,255,255,0.3)' }}>✕</button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 80px)' }}>
              {joinRequests.length === 0 ? (
                <div className="py-10 text-center text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>No pending requests</div>
              ) : joinRequests.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: '1px solid rgba(255,214,0,0.04)' }}>
                  <Avatar user={{ displayName: u.displayName, photoUrl: u.photoUrl }} size={38} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: '#ffffff' }}>{u.displayName}</p>
                    {u.username && <p className="text-[10px]" style={{ color: 'rgba(255,214,0,0.4)' }}>@{u.username}</p>}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => approveRequest(u.id)}
                      className="text-[9px] font-black px-2.5 py-1.5 rounded-lg"
                      style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>
                      ✓ APPROVE
                    </button>
                    <button onClick={() => rejectRequest(u.id)}
                      className="text-[9px] font-black px-2.5 py-1.5 rounded-lg"
                      style={{ background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.25)', color: '#ff006e' }}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
                £{group.priceMonthly?.toFixed(2)}<span className="text-sm font-normal text-[rgba(255,214,0,0.5)]">/month</span>
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

function DmSection({ dbUser }: {
  dbUser: { id: string; displayName?: string; photoUrl?: string | null } | null
}) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeConvo, setActiveConvo] = useState<string | null>(null)
  const [messages, setMessages] = useState<DmMessage[]>([])
  const [msgsLoading, setMsgsLoading] = useState(false)
  const [activeOther, setActiveOther] = useState<OtherUser | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<OtherUser[]>([])
  const [searching, setSearching] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function dmHeaders() {
    const tok = await getToken()
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (tok) h['Authorization'] = `Bearer ${tok}`
    return h
  }

  useEffect(() => {
    if (!dbUser) { setLoading(false); return }
    dmHeaders().then((h) =>
      fetch(`${API_URL}/dm`, { headers: h })
        .then((r) => r.json()).then((j) => setConversations(j.data ?? [])).catch(() => {}).finally(() => setLoading(false))
    )
  }, [dbUser?.id])

  useEffect(() => {
    if (!activeConvo) return
    setMsgsLoading(true)
    dmHeaders().then((h) =>
      fetch(`${API_URL}/dm/${activeConvo}`, { headers: h })
        .then((r) => r.json())
        .then((j) => { setMessages(j.data?.messages ?? []); setActiveOther(j.data?.other ?? null) })
        .catch(() => {}).finally(() => setMsgsLoading(false))
    )
  }, [activeConvo])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const h = await dmHeaders()
      fetch(`${API_URL}/dm/users?q=${encodeURIComponent(search)}`, { headers: h })
        .then((r) => r.json()).then((j) => setSearchResults(j.data ?? [])).catch(() => {}).finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  async function openOrCreateConvo(recipientId: string) {
    const h = await dmHeaders()
    const res = await fetch(`${API_URL}/dm`, { method: 'POST', headers: h, body: JSON.stringify({ recipientId }) })
    const j = await res.json()
    if (j.data?.id) {
      setSearch(''); setSearchResults([])
      setActiveConvo(j.data.id)
      dmHeaders().then((h2) => fetch(`${API_URL}/dm`, { headers: h2 }).then((r) => r.json()).then((d) => setConversations(d.data ?? [])).catch(() => {}))
    }
  }

  async function sendMessage() {
    if (!text.trim() || !activeConvo || sending || !dbUser) return
    setSending(true)
    const draft = text.trim(); setText('')

    const optimisticId = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const optimisticMsg: DmMessage = {
      id: optimisticId,
      senderId: dbUser.id,
      senderName: dbUser.displayName ?? '',
      senderPhoto: dbUser.photoUrl ?? null,
      text: draft,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMsg])

    try {
      const h = await dmHeaders()
      const res = await fetch(`${API_URL}/dm/${activeConvo}`, { method: 'POST', headers: h, body: JSON.stringify({ text: draft }) })
      const j = await res.json()
      if (j.data) {
        // Replace optimistic message with server response
        setMessages((prev) => prev.map((m) => m.id === optimisticId ? j.data : m))
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

  if (activeConvo) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 6.5rem)', background: '#04040d' }}>
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
          style={{ background: 'rgba(4,4,13,0.95)', borderBottom: '1px solid rgba(0,229,255,0.1)', backdropFilter: 'blur(12px)' }}>
          <button onClick={() => { setActiveConvo(null); setMessages([]) }} className="p-1 rounded-lg" style={{ color: 'rgba(0,229,255,0.6)' }}>
            <ArrowLeft size={18} />
          </button>
          {activeOther && <Avatar user={activeOther} size={32} />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{activeOther?.displayName ?? '...'}</p>
            {activeOther?.username && <p className="text-[10px]" style={{ color: 'rgba(0,229,255,0.4)' }}>@{activeOther.username}</p>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {msgsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <MessageCircle size={28} style={{ color: 'rgba(0,229,255,0.15)' }} />
              <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>Start the conversation</p>
            </div>
          ) : messages.map((m) => {
            const isMe = m.senderId === dbUser?.id
            return (
              <div key={m.id} className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && activeOther && <Avatar user={activeOther} size={28} />}
                <div className="max-w-[72%]">
                  <div className="px-3 py-2 rounded-2xl text-sm"
                    style={isMe
                      ? { background: 'rgba(0,229,255,0.15)', border: '1px solid rgba(0,229,255,0.3)', color: '#e0f2fe', borderBottomRightRadius: 4 }
                      : { background: 'rgba(7,7,26,0.9)', border: '1px solid rgba(0,229,255,0.08)', color: '#e0f2fe', borderBottomLeftRadius: 4 }}>
                    {m.text}
                  </div>
                  <p className={`text-[9px] mt-0.5 ${isMe ? 'text-right' : 'text-left'}`}
                    style={{ color: 'rgba(224,242,254,0.2)' }}>{timeAgo(m.createdAt)}</p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
        <div className="flex-shrink-0 px-4 py-3 flex gap-2"
          style={{ background: 'rgba(4,4,13,0.95)', borderTop: '1px solid rgba(0,229,255,0.08)' }}>
          <input type="text" placeholder="Message..." value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-transparent outline-none"
            style={{ border: '1px solid rgba(0,229,255,0.15)', color: '#e0f2fe' }} />
          <button onClick={sendMessage} disabled={!text.trim() || sending}
            className="p-2.5 rounded-xl transition-all"
            style={{
              background: text.trim() ? 'rgba(0,229,255,0.15)' : 'rgba(0,229,255,0.04)',
              border: `1px solid ${text.trim() ? 'rgba(0,229,255,0.4)' : 'rgba(0,229,255,0.1)'}`,
              color: text.trim() ? '#00e5ff' : 'rgba(0,229,255,0.2)',
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
        <MessageCircle size={28} style={{ color: 'rgba(0,229,255,0.15)' }} />
        <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>LOG IN TO MESSAGE PEOPLE</p>
        <a href="/login" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black"
          style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}>
          <LogIn size={11} /> LOG IN
        </a>
      </div>
    )
  }

  return (
    <div className="px-4 max-w-xl mx-auto pb-4">
      <div className="relative mb-3">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(0,229,255,0.4)' }} />
        <input type="text" placeholder="Search users to message..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2.5 rounded-xl text-xs bg-transparent outline-none"
          style={{ border: '1px solid rgba(0,229,255,0.15)', color: '#e0f2fe' }} />
      </div>
      {search.trim() && (
        <div className="mb-3 rounded-xl overflow-hidden"
          style={{ border: '1px solid rgba(0,229,255,0.12)', background: 'rgba(7,7,26,0.95)' }}>
          {searching ? (
            <div className="py-4 flex justify-center">
              <div className="w-4 h-4 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-4 text-center text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>No users found</div>
          ) : searchResults.map((u) => (
            <button key={u.id} onClick={() => openOrCreateConvo(u.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
              style={{ borderBottom: '1px solid rgba(0,229,255,0.06)' }}>
              <Avatar user={u} size={36} />
              <div>
                <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{u.displayName}</p>
                {u.username && <p className="text-[10px]" style={{ color: 'rgba(0,229,255,0.4)' }}>@{u.username}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'rgba(0,229,255,0.04)' }} />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3">
          <User size={28} style={{ color: 'rgba(0,229,255,0.15)' }} />
          <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>NO MESSAGES YET</p>
          <p className="text-[11px] text-center" style={{ color: 'rgba(224,242,254,0.3)' }}>
            Search for a user above to start a conversation
          </p>
        </div>
      ) : conversations.map((c) => (
        <button key={c.id} onClick={() => setActiveConvo(c.id)}
          className="w-full flex items-center gap-3 p-3 rounded-2xl text-left mb-2 transition-all"
          style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(0,229,255,0.08)' }}>
          {c.other ? <Avatar user={c.other} size={44} /> : (
            <div className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)' }}>
              <User size={18} style={{ color: 'rgba(0,229,255,0.3)' }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{c.other?.displayName ?? 'Unknown User'}</p>
            {c.lastMessage ? (
              <p className="text-[11px] truncate" style={{ color: 'rgba(224,242,254,0.4)' }}>
                {c.lastMessage.senderId === dbUser?.id ? 'You: ' : ''}{c.lastMessage.text}
              </p>
            ) : (
              <p className="text-[11px]" style={{ color: 'rgba(0,229,255,0.3)' }}>No messages yet</p>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { dbUser } = useAuth()
  const [tab, setTab] = useState<'dms' | 'community'>('dms')
  const [groups, setGroups] = useState<GroupChat[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)

  // Host/attendee mode (same pattern as Navbar)
  const [isHost, setIsHost] = useState(false)
  useEffect(() => {
    setIsHost(localStorage.getItem('partyradar_account_mode') === 'HOST')
    function onModeChange(e: Event) { setIsHost((e as CustomEvent).detail === 'HOST') }
    window.addEventListener('partyradar:mode-change', onModeChange)
    return () => window.removeEventListener('partyradar:mode-change', onModeChange)
  }, [])

  useEffect(() => {
    async function fetchGroups(lat?: number, lng?: number) {
      const tok = await getToken()
      const params = lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : ''
      const h: Record<string, string> = {}
      if (tok) h['Authorization'] = `Bearer ${tok}`
      fetch(`${API_URL}/groups${params}`, { headers: h })
        .then((r) => r.json())
        .then((j) => setGroups(j.data ?? []))
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
          onGroupUpdate={handleGroupUpdate}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#04040d', paddingTop: 56 }}>
      {/* Main tabs */}
      <div className="flex gap-1 px-4 pt-5 pb-3 max-w-xl mx-auto">
        {(['dms', 'community'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 rounded-xl text-[11px] font-black tracking-widest transition-all"
            style={{
              background: tab === t ? 'rgba(0,229,255,0.12)' : 'rgba(0,229,255,0.03)',
              border: `1px solid ${tab === t ? 'rgba(0,229,255,0.35)' : 'rgba(0,229,255,0.08)'}`,
              color: tab === t ? '#00e5ff' : 'rgba(74,96,128,0.5)',
            }}>
            {t === 'dms' ? '💬 MESSAGES' : isHost ? '👑 MY GROUPS' : '🌐 COMMUNITY'}
          </button>
        ))}
      </div>

      {tab === 'dms' && (
        <DmSection dbUser={dbUser} />
      )}

      {tab === 'community' && (
        <>
          {groupsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
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
