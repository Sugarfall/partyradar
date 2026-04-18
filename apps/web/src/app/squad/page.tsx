'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Users, Plus, X, Search, ArrowRight, Zap, ChevronRight } from 'lucide-react'

const EMOJI_OPTIONS = ['🎉', '🔥', '⚡', '🎶', '🍻', '💃', '🕺', '🌙', '🚀', '🎸', '💜', '🦄', '👾', '🎭', '🌈']

interface Squad {
  id: string
  emoji: string
  name: string
  members: string[]
  createdAt: string
}

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

function loadSquads(): Squad[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem('partyradar_squads') ?? '[]') as Squad[]
  } catch {
    return []
  }
}

function saveSquads(squads: Squad[]) {
  localStorage.setItem('partyradar_squads', JSON.stringify(squads))
}

// ── Create Squad Modal ──────────────────────────────────────────────────────
function CreateSquadModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (squad: Squad) => void
}) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎉')
  const [focused, setFocused] = useState(false)

  function handleCreate() {
    if (!name.trim()) return
    const squad: Squad = {
      id: generateId(),
      emoji,
      name: name.trim(),
      members: ['You'],
      createdAt: new Date().toISOString(),
    }
    onCreate(squad)
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
        {/* Handle */}
        <div className="w-10 h-1 rounded-full mx-auto sm:hidden" style={{ background: 'rgba(var(--accent-rgb),0.2)' }} />

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-black tracking-widest" style={{ color: 'var(--accent)' }}>CREATE SQUAD</p>
          <button onClick={onClose} style={{ color: 'rgba(74,96,128,0.6)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Emoji picker */}
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

        {/* Name input */}
        <div>
          <label className="text-[10px] font-bold tracking-[0.15em] block mb-2" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
            SQUAD NAME
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            maxLength={40}
            placeholder="Name your crew..."
            className="w-full px-3 py-2.5 rounded-xl text-sm font-medium focus:outline-none transition-all duration-200"
            style={{
              background: 'rgba(var(--accent-rgb),0.04)',
              border: focused ? '1px solid rgba(var(--accent-rgb),0.5)' : '1px solid rgba(var(--accent-rgb),0.15)',
              color: '#e0f2fe',
            }}
          />
        </div>

        {/* Preview */}
        {name.trim() && (
          <div
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.12)' }}
          >
            <span className="text-2xl">{emoji}</span>
            <div>
              <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{name.trim()}</p>
              <p className="text-[10px]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>1 member</p>
            </div>
          </div>
        )}

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={!name.trim()}
          className="w-full py-3 rounded-xl text-sm font-black transition-all duration-200 disabled:opacity-40"
          style={{
            background: name.trim() ? 'rgba(var(--accent-rgb),0.1)' : 'transparent',
            border: name.trim() ? '1px solid rgba(var(--accent-rgb),0.4)' : '1px solid rgba(var(--accent-rgb),0.1)',
            color: name.trim() ? 'var(--accent)' : 'rgba(74,96,128,0.5)',
            letterSpacing: '0.1em',
          }}
        >
          CREATE SQUAD →
        </button>
      </div>
    </div>
  )
}

// ── Plan Tonight Modal ──────────────────────────────────────────────────────
function PlanTonightModal({ squad, onClose }: { squad: Squad; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [sent, setSent] = useState(false)

  function handleShare() {
    setSent(true)
    setTimeout(onClose, 1500)
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
        {/* Handle */}
        <div className="w-10 h-1 rounded-full mx-auto sm:hidden" style={{ background: 'rgba(168,85,247,0.3)' }} />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{squad.emoji}</span>
            <div>
              <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{squad.name}</p>
              <p className="text-[10px]" style={{ color: 'rgba(168,85,247,0.6)' }}>PLAN TONIGHT</p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'rgba(74,96,128,0.6)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Search / paste */}
        <div>
          <label className="text-[10px] font-bold tracking-[0.15em] block mb-2" style={{ color: 'rgba(168,85,247,0.5)' }}>
            PASTE EVENT LINK OR SEARCH
          </label>
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

        {/* Members who'll see it */}
        <div
          className="p-3 rounded-xl flex items-center gap-3"
          style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.12)' }}
        >
          <Users size={13} style={{ color: 'rgba(168,85,247,0.5)' }} />
          <p className="text-xs" style={{ color: 'rgba(224,242,254,0.6)' }}>
            Sending to <span style={{ color: '#a855f7', fontWeight: 700 }}>{squad.members.length} member{squad.members.length !== 1 ? 's' : ''}</span> in {squad.emoji} {squad.name}
          </p>
        </div>

        {/* Share button */}
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
function SquadCard({ squad, onPlan, onDelete }: {
  squad: Squad
  onPlan: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="rounded-2xl p-4 flex items-center gap-4"
      style={{
        background: 'rgba(24,24,27,0.95)',
        border: '1px solid rgba(var(--accent-rgb),0.1)',
        boxShadow: '0 2px 20px rgba(0,0,0,0.3)',
      }}
    >
      {/* Emoji */}
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
        style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.12)' }}
      >
        {squad.emoji}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>{squad.name}</p>
        <p className="text-[10px] flex items-center gap-1 mt-0.5" style={{ color: 'rgba(74,96,128,0.6)' }}>
          <Users size={9} />
          {squad.members.length} member{squad.members.length !== 1 ? 's' : ''}
        </p>
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
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg transition-all duration-200"
          style={{ border: '1px solid rgba(255,0,110,0.15)', color: 'rgba(255,0,110,0.4)' }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

// ── Main Squad Page ─────────────────────────────────────────────────────────
export default function SquadPage() {
  const [squads, setSquads] = useState<Squad[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [planSquad, setPlanSquad] = useState<Squad | null>(null)

  useEffect(() => {
    setSquads(loadSquads())
  }, [])

  function handleCreate(squad: Squad) {
    const updated = [...squads, squad]
    setSquads(updated)
    saveSquads(updated)
    setCreateOpen(false)
  }

  function handleDelete(id: string) {
    const updated = squads.filter((s) => s.id !== id)
    setSquads(updated)
    saveSquads(updated)
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: '#04040d' }}>
      {/* Top accent line */}
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
            <h1
              className="text-sm font-black tracking-[0.25em]"
              style={{ color: '#a855f7', textShadow: '0 0 16px rgba(168,85,247,0.5)' }}
            >
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
        {squads.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mb-5"
              style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)' }}
            >
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
            />
          ))
        )}

        {/* Discover link */}
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
    </div>
  )
}
