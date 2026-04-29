'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Users, Plus, X, Search, ArrowRight, Zap, ChevronRight, ChevronDown, Loader2, PoundSterling, UserPlus, UserMinus } from 'lucide-react'

import { api } from '@/lib/api'
import { formatPrice } from '@/lib/currency'

const EMOJI_OPTIONS = ['🎉', '🔥', '⚡', '🎶', '🍻', '💃', '🕺', '🌙', '🚀', '🎸', '💜', '🦄', '👾', '🎭', '🌈']

interface SquadMember {
  id: string
  displayName: string
  photoUrl: string | null
  role: string
}

interface Squad {
  id: string
  emoji: string
  name: string
  createdAt: string
  isOwner: boolean
  members: SquadMember[]
}

interface UserSearchResult {
  id: string
  username: string
  displayName: string
  photoUrl: string | null
}

// ── Avatar bubble ───────────────────────────────────────────────────────────
function Avatar({ user, size = 28 }: { user: Pick<SquadMember, 'displayName' | 'photoUrl'>; size?: number }) {
  const initials = user.displayName.slice(0, 1).toUpperCase()
  return user.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={user.photoUrl}
      alt={user.displayName}
      width={size}
      height={size}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size, border: '1.5px solid rgba(var(--accent-rgb),0.2)' }}
    />
  ) : (
    <div
      className="rounded-full flex items-center justify-center shrink-0 text-[10px] font-black"
      style={{
        width: size,
        height: size,
        background: 'rgba(var(--accent-rgb),0.1)',
        border: '1.5px solid rgba(var(--accent-rgb),0.2)',
        color: 'var(--accent)',
      }}
    >
      {initials}
    </div>
  )
}

// ── Create Squad Modal ──────────────────────────────────────────────────────
function CreateSquadModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (squad: Squad) => void
}) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎉')
  const [focused, setFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const json = await api.post<{ data: Squad }>('/squads', { name: name.trim(), emoji })
      onCreate(json.data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create squad')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(4,4,13,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4"
        style={{
          background: 'rgba(7,7,26,0.98)',
          border: '1px solid rgba(var(--accent-rgb),0.15)',
          boxShadow: '0 0 60px rgba(0,0,0,0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full mx-auto sm:hidden" style={{ background: 'rgba(var(--accent-rgb),0.2)' }} />
        <div className="flex items-center justify-between">
          <p className="text-sm font-black tracking-widest" style={{ color: 'var(--accent)' }}>CREATE SQUAD</p>
          <button onClick={onClose} style={{ color: 'rgba(74,96,128,0.6)' }}><X size={16} /></button>
        </div>
        <div>
          <p className="text-[10px] font-bold tracking-[0.15em] mb-2" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>SQUAD EMOJI</p>
          <div className="flex flex-wrap gap-2">
            {EMOJI_OPTIONS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className="w-9 h-9 text-xl rounded-xl transition-all duration-150 flex items-center justify-center"
                style={{
                  background: emoji === e ? 'rgba(var(--accent-rgb),0.12)' : 'rgba(var(--accent-rgb),0.04)',
                  border: emoji === e ? '1px solid rgba(var(--accent-rgb),0.4)' : '1px solid rgba(var(--accent-rgb),0.1)',
                  boxShadow: emoji === e ? '0 0 10px rgba(var(--accent-rgb),0.2)' : 'none',
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold tracking-[0.15em] block mb-2" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>SQUAD NAME</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            maxLength={60}
            placeholder="Name your crew..."
            className="w-full px-3 py-2.5 rounded-xl text-sm font-medium focus:outline-none transition-all duration-200"
            style={{
              background: 'rgba(var(--accent-rgb),0.04)',
              border: focused ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(var(--accent-rgb),0.15)',
              color: '#e0f2fe',
            }}
          />
        </div>
        {name.trim() && (
          <div className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.12)' }}>
            <span className="text-2xl">{emoji}</span>
            <div>
              <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{name.trim()}</p>
              <p className="text-[10px]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>1 member</p>
            </div>
          </div>
        )}
        {error && <p className="text-[10px] font-bold" style={{ color: '#ff006e' }}>{error}</p>}
        <button
          onClick={handleCreate}
          disabled={!name.trim() || saving}
          className="w-full py-3 rounded-xl text-sm font-black transition-all duration-200 disabled:opacity-40 flex items-center justify-center gap-2"
          style={{
            background: name.trim() ? 'rgba(var(--accent-rgb),0.1)' : 'transparent',
            border: name.trim() ? '1px solid rgba(var(--accent-rgb),0.4)' : '1px solid rgba(var(--accent-rgb),0.1)',
            color: name.trim() ? 'var(--accent)' : 'rgba(74,96,128,0.5)',
            letterSpacing: '0.1em',
          }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : 'CREATE SQUAD →'}
        </button>
      </div>
    </div>
  )
}

// ── Add Member Modal ────────────────────────────────────────────────────────
function AddMemberModal({
  squad,
  onClose,
  onAdded,
}: {
  squad: Squad
  onClose: () => void
  onAdded: (member: SquadMember) => void
}) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const existingIds = new Set(squad.members.map((m) => m.id))

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const json = await api.get<{ data: UserSearchResult[] }>(`/users/search?q=${encodeURIComponent(query.trim())}`)
        setResults((json?.data ?? []).filter((u) => !existingIds.has(u.id)))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  async function handleAdd(user: UserSearchResult) {
    if (adding) return
    setAdding(user.id)
    setError(null)
    try {
      await api.post(`/squads/${squad.id}/members`, { userId: user.id })
      onAdded({ id: user.id, displayName: user.displayName, photoUrl: user.photoUrl, role: 'MEMBER' })
      setResults((prev) => prev.filter((u) => u.id !== user.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not add member')
    } finally {
      setAdding(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(4,4,13,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4"
        style={{
          background: 'rgba(7,7,26,0.98)',
          border: '1px solid rgba(var(--accent-rgb),0.15)',
          boxShadow: '0 0 60px rgba(0,0,0,0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full mx-auto sm:hidden" style={{ background: 'rgba(var(--accent-rgb),0.2)' }} />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-black tracking-widest" style={{ color: 'var(--accent)' }}>ADD MEMBER</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(74,96,128,0.6)' }}>{squad.emoji} {squad.name}</p>
          </div>
          <button onClick={onClose} style={{ color: 'rgba(74,96,128,0.6)' }}><X size={16} /></button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
          {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search by name or username..."
            className="w-full pl-8 pr-8 py-2.5 rounded-xl text-sm font-medium focus:outline-none transition-all duration-200"
            style={{
              background: 'rgba(var(--accent-rgb),0.04)',
              border: focused ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(var(--accent-rgb),0.15)',
              color: '#e0f2fe',
            }}
          />
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {results.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 p-2.5 rounded-xl"
                style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}
              >
                <Avatar user={user} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate" style={{ color: '#e0f2fe' }}>{user.displayName}</p>
                  <p className="text-[10px] truncate" style={{ color: 'rgba(74,96,128,0.6)' }}>@{user.username}</p>
                </div>
                <button
                  onClick={() => handleAdd(user)}
                  disabled={adding === user.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-all duration-200 disabled:opacity-50"
                  style={{
                    background: 'rgba(var(--accent-rgb),0.08)',
                    border: '1px solid rgba(var(--accent-rgb),0.25)',
                    color: 'var(--accent)',
                    letterSpacing: '0.05em',
                  }}
                >
                  {adding === user.id ? <Loader2 size={10} className="animate-spin" /> : <><UserPlus size={10} /> ADD</>}
                </button>
              </div>
            ))}
          </div>
        )}

        {query.trim() && !searching && results.length === 0 && (
          <p className="text-center text-xs py-4" style={{ color: 'rgba(74,96,128,0.5)' }}>No users found</p>
        )}

        {error && <p className="text-[10px] font-bold" style={{ color: '#ff006e' }}>{error}</p>}
      </div>
    </div>
  )
}

// ── Plan Tonight Modal ──────────────────────────────────────────────────────
function PlanTonightModal({ squad, onClose }: { squad: Squad; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [budget, setBudget] = useState('')
  const [budgetFocused, setBudgetFocused] = useState(false)
  const [sent, setSent] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { return () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current) } }, [])

  function handleShare() {
    setSent(true)
    closeTimerRef.current = setTimeout(onClose, 1500)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(4,4,13,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4"
        style={{
          background: 'rgba(7,7,26,0.98)',
          border: '1px solid rgba(168,85,247,0.2)',
          boxShadow: '0 0 60px rgba(168,85,247,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full mx-auto sm:hidden" style={{ background: 'rgba(168,85,247,0.3)' }} />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{squad.emoji}</span>
            <div>
              <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{squad.name}</p>
              <p className="text-[10px]" style={{ color: 'rgba(168,85,247,0.6)' }}>PLAN TONIGHT</p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'rgba(74,96,128,0.6)' }}><X size={16} /></button>
        </div>
        <div>
          <label className="text-[10px] font-bold tracking-[0.15em] block mb-2" style={{ color: 'rgba(168,85,247,0.5)' }}>PASTE EVENT LINK OR SEARCH</label>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(168,85,247,0.4)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="https://partyradar.app/events/... or search name"
              className="w-full pl-8 pr-4 py-2.5 rounded-xl text-sm font-medium focus:outline-none transition-all duration-200"
              style={{
                background: 'rgba(168,85,247,0.05)',
                border: focused ? '1px solid rgba(168,85,247,0.45)' : '1px solid rgba(168,85,247,0.15)',
                color: '#e0f2fe',
              }}
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold tracking-[0.15em] block mb-2" style={{ color: 'rgba(168,85,247,0.5)' }}>BUDGET PER PERSON (OPTIONAL)</label>
          <div className="relative">
            <PoundSterling size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(168,85,247,0.4)' }} />
            <input
              type="number"
              min="0"
              step="1"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              onFocus={() => setBudgetFocused(true)}
              onBlur={() => setBudgetFocused(false)}
              placeholder="e.g. 30"
              className="w-full pl-8 pr-4 py-2.5 rounded-xl text-sm font-medium focus:outline-none transition-all duration-200"
              style={{
                background: 'rgba(168,85,247,0.05)',
                border: budgetFocused ? '1px solid rgba(168,85,247,0.45)' : '1px solid rgba(168,85,247,0.15)',
                color: '#e0f2fe',
              }}
            />
          </div>
          {budget && !isNaN(Number(budget)) && Number(budget) > 0 && (
            <p className="text-[10px] mt-1.5 font-bold" style={{ color: 'rgba(168,85,247,0.5)' }}>
              Squad total: ~{formatPrice(Number(budget) * squad.members.length)} for {squad.members.length} people
            </p>
          )}
        </div>
        <div className="p-3 rounded-xl flex items-center gap-3"
          style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.12)' }}>
          <Users size={13} style={{ color: 'rgba(168,85,247,0.5)' }} />
          <p className="text-xs" style={{ color: 'rgba(224,242,254,0.6)' }}>
            Sending to <span style={{ color: '#a855f7', fontWeight: 700 }}>{squad.members.length} member{squad.members.length !== 1 ? 's' : ''}</span> in {squad.emoji} {squad.name}
            {budget && !isNaN(Number(budget)) && Number(budget) > 0 && <span style={{ color: 'rgba(168,85,247,0.6)' }}> · {formatPrice(Number(budget))}/person budget</span>}
          </p>
        </div>
        {sent ? (
          <div className="w-full py-3 rounded-xl text-sm font-black text-center"
            style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88', letterSpacing: '0.1em' }}>
            ✓ SHARED WITH SQUAD
          </div>
        ) : (
          <button
            onClick={handleShare}
            disabled={!query.trim()}
            className="w-full py-3 rounded-xl text-sm font-black transition-all duration-200 disabled:opacity-40 flex items-center justify-center gap-2"
            style={{
              background: query.trim() ? 'rgba(168,85,247,0.12)' : 'transparent',
              border: query.trim() ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(168,85,247,0.1)',
              color: query.trim() ? '#a855f7' : 'rgba(74,96,128,0.5)',
              letterSpacing: '0.1em',
            }}
          >
            <Zap size={14} /> SHARE WITH SQUAD
          </button>
        )}
      </div>
    </div>
  )
}

// ── Squad Card ─────────────────────────────────────────────────────────────
function SquadCard({
  squad,
  onPlan,
  onDelete,
  onAddMember,
  onRemoveMember,
  deleting,
  removingId,
}: {
  squad: Squad
  onPlan: () => void
  onDelete: () => void
  onAddMember: () => void
  onRemoveMember: (userId: string) => void
  deleting: boolean
  removingId: string | null
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(24,24,27,0.95)',
        border: '1px solid rgba(var(--accent-rgb),0.1)',
        boxShadow: '0 2px 20px rgba(0,0,0,0.3)',
        opacity: deleting ? 0.5 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {/* Card header row */}
      <div className="p-4 flex items-center gap-4">
        {/* Emoji */}
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
          style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.12)' }}
        >
          {squad.emoji}
        </div>

        {/* Info + member preview */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{squad.name}</p>
          {/* Mini avatar stack */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 mt-1 group"
          >
            <div className="flex -space-x-1.5">
              {squad.members.slice(0, 5).map((m) => (
                <Avatar key={m.id} user={m} size={18} />
              ))}
              {squad.members.length > 5 && (
                <div
                  className="rounded-full flex items-center justify-center text-[8px] font-black"
                  style={{ width: 18, height: 18, background: 'rgba(var(--accent-rgb),0.1)', border: '1.5px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}
                >
                  +{squad.members.length - 5}
                </div>
              )}
            </div>
            <span className="text-[10px]" style={{ color: 'rgba(74,96,128,0.6)' }}>
              {squad.members.length} member{squad.members.length !== 1 ? 's' : ''}
            </span>
            <ChevronDown
              size={10}
              className="transition-transform duration-200"
              style={{ color: 'rgba(74,96,128,0.5)', transform: expanded ? 'rotate(180deg)' : 'none' }}
            />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onPlan}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all duration-200"
            style={{
              background: 'rgba(168,85,247,0.1)',
              border: '1px solid rgba(168,85,247,0.3)',
              color: '#a855f7',
              letterSpacing: '0.08em',
            }}
          >
            PLAN TONIGHT <ArrowRight size={10} />
          </button>
          {squad.isOwner && (
            <button
              onClick={onDelete}
              disabled={deleting}
              className="p-1.5 rounded-lg transition-all duration-200 disabled:opacity-40"
              style={{ border: '1px solid rgba(255,0,110,0.15)', color: 'rgba(255,0,110,0.4)' }}
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded member list */}
      {expanded && (
        <div
          className="px-4 pb-4 pt-0 space-y-1.5"
          style={{ borderTop: '1px solid rgba(var(--accent-rgb),0.06)' }}
        >
          <p className="text-[10px] font-bold tracking-[0.15em] pt-3 pb-1" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
            MEMBERS
          </p>

          {squad.members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-2.5 py-1.5 px-2 rounded-xl"
              style={{ background: 'rgba(var(--accent-rgb),0.02)' }}
            >
              <Avatar user={member} size={28} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate" style={{ color: '#e0f2fe' }}>{member.displayName}</p>
                {member.role === 'ADMIN' && (
                  <p className="text-[9px] font-bold" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>OWNER</p>
                )}
              </div>
              {/* Owner can remove anyone (except self-removal always allowed) */}
              {squad.isOwner && member.role !== 'ADMIN' && (
                <button
                  onClick={() => onRemoveMember(member.id)}
                  disabled={removingId === member.id}
                  className="p-1 rounded-lg transition-all duration-200 disabled:opacity-40"
                  style={{ border: '1px solid rgba(255,0,110,0.12)', color: 'rgba(255,0,110,0.35)' }}
                  title="Remove member"
                >
                  {removingId === member.id
                    ? <Loader2 size={10} className="animate-spin" />
                    : <UserMinus size={10} />}
                </button>
              )}
            </div>
          ))}

          {/* Add member button (owner only) */}
          {squad.isOwner && (
            <button
              onClick={onAddMember}
              className="w-full mt-2 py-2 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition-all duration-200"
              style={{
                background: 'rgba(var(--accent-rgb),0.04)',
                border: '1px dashed rgba(var(--accent-rgb),0.2)',
                color: 'rgba(var(--accent-rgb),0.5)',
                letterSpacing: '0.1em',
              }}
            >
              <UserPlus size={11} /> ADD MEMBER
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Squad Page ─────────────────────────────────────────────────────────
export default function SquadPage() {
  const [squads, setSquads] = useState<Squad[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [planSquad, setPlanSquad] = useState<Squad | null>(null)
  const [addMemberSquad, setAddMemberSquad] = useState<Squad | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [removingMember, setRemovingMember] = useState<{ squadId: string; userId: string } | null>(null)

  const fetchSquads = useCallback(async () => {
    try {
      const json = await api.get<{ data: Squad[] }>('/squads')
      setSquads(json?.data ?? [])
    } catch {
      setSquads([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSquads() }, [fetchSquads])

  function handleCreate(squad: Squad) {
    setSquads((prev) => [...prev, squad])
    setCreateOpen(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await api.delete(`/squads/${id}`)
      setSquads((prev) => prev.filter((s) => s.id !== id))
    } catch {
      // leave in list on error
    } finally {
      setDeletingId(null)
    }
  }

  function handleMemberAdded(squadId: string, member: SquadMember) {
    setSquads((prev) =>
      prev.map((s) =>
        s.id === squadId ? { ...s, members: [...s.members, member] } : s,
      ),
    )
    setAddMemberSquad((current) =>
      current?.id === squadId
        ? { ...current, members: [...current.members, member] }
        : current,
    )
  }

  async function handleRemoveMember(squad: Squad, userId: string) {
    setRemovingMember({ squadId: squad.id, userId })
    try {
      await api.delete(`/squads/${squad.id}/members/${userId}`)
      setSquads((prev) =>
        prev.map((s) =>
          s.id === squad.id ? { ...s, members: s.members.filter((m) => m.id !== userId) } : s,
        ),
      )
    } catch {
      // leave member in list on error
    } finally {
      setRemovingMember(null)
    }
  }

  // Keep addMemberSquad in sync with the latest squad data (member list updates)
  const currentAddMemberSquad = addMemberSquad
    ? squads.find((s) => s.id === addMemberSquad.id) ?? addMemberSquad
    : null

  return (
    <div className="min-h-screen pb-28" style={{ background: '#04040d' }}>
      <div className="absolute top-14 inset-x-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.3), transparent)' }} />

      {/* Header */}
      <div
        className="px-4 pt-6 pb-6"
        style={{ background: 'linear-gradient(180deg, rgba(168,85,247,0.04) 0%, transparent 100%)' }}
      >
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users size={16} style={{ color: '#a855f7', filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.7))' }} />
            <h1 className="text-sm font-black tracking-[0.25em]"
              style={{ color: '#a855f7', textShadow: '0 0 16px rgba(168,85,247,0.5)' }}>
              MY SQUAD
            </h1>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all duration-200"
            style={{
              background: 'rgba(168,85,247,0.1)',
              border: '1px solid rgba(168,85,247,0.3)',
              color: '#a855f7',
              letterSpacing: '0.1em',
            }}
          >
            <Plus size={13} /> CREATE SQUAD
          </button>
        </div>
      </div>

      {/* Squad list */}
      <div className="max-w-xl mx-auto px-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: 'rgba(168,85,247,0.5)' }} />
          </div>
        ) : squads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mb-5"
              style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)' }}>
              👥
            </div>
            <p className="text-sm font-black tracking-widest mb-2" style={{ color: 'rgba(168,85,247,0.5)' }}>
              NO SQUADS YET
            </p>
            <p className="text-xs mb-6" style={{ color: 'rgba(74,96,128,0.6)' }}>
              Create a squad and plan your nights out together
            </p>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all duration-200"
              style={{
                background: 'rgba(168,85,247,0.1)',
                border: '1px solid rgba(168,85,247,0.3)',
                color: '#a855f7',
                letterSpacing: '0.1em',
              }}
            >
              <Plus size={14} /> CREATE YOUR FIRST SQUAD
            </button>
          </div>
        ) : (
          squads.map((squad) => (
            <SquadCard
              key={squad.id}
              squad={squad}
              onPlan={() => setPlanSquad(squad)}
              onDelete={() => handleDelete(squad.id)}
              onAddMember={() => setAddMemberSquad(squad)}
              onRemoveMember={(userId) => handleRemoveMember(squad, userId)}
              deleting={deletingId === squad.id}
              removingId={removingMember?.squadId === squad.id ? removingMember.userId : null}
            />
          ))
        )}

        {squads.length > 0 && (
          <Link
            href="/discover"
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
            style={{
              background: 'rgba(var(--accent-rgb),0.03)',
              border: '1px solid rgba(var(--accent-rgb),0.08)',
              color: 'rgba(var(--accent-rgb),0.5)',
            }}
          >
            <Zap size={13} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
            <span className="text-xs font-bold flex-1">Find events for tonight</span>
            <ChevronRight size={13} style={{ color: 'rgba(var(--accent-rgb),0.3)' }} />
          </Link>
        )}
      </div>

      {/* Modals */}
      {createOpen && (
        <CreateSquadModal
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreate}
        />
      )}
      {planSquad && (
        <PlanTonightModal
          squad={planSquad}
          onClose={() => setPlanSquad(null)}
        />
      )}
      {currentAddMemberSquad && (
        <AddMemberModal
          squad={currentAddMemberSquad}
          onClose={() => setAddMemberSquad(null)}
          onAdded={(member) => handleMemberAdded(currentAddMemberSquad.id, member)}
        />
      )}
    </div>
  )
}
