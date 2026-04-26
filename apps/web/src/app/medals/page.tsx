'use client'

import { useState, useEffect, useCallback } from 'react'
import { Trophy, Users, Calendar, Star, MapPin, Heart, Zap, RefreshCw, X, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

type MedalTier     = 'BRONZE' | 'SILVER' | 'GOLD'
type MedalCategory = 'SOCIAL' | 'EVENTS' | 'HOST' | 'EXPLORER' | 'LOYALTY' | 'SPECIAL'

interface MedalWithProgress {
  id: string; slug: string; name: string; description: string; icon: string
  tier: MedalTier; category: MedalCategory; conditionType: string
  threshold: number; earned: boolean; earnedAt: string | null
  progress: number; currentValue: number
}

// ── Tier colours ────────────────────────────────────────────────────────────
const TIER = {
  BRONZE: { label: 'BRONZE', color: '#cd7f32', bg: 'rgba(205,127,50,0.2)',  glow: 'rgba(205,127,50,0.55)' },
  SILVER: { label: 'SILVER', color: '#C0C0C0', bg: 'rgba(192,192,192,0.18)', glow: 'rgba(192,192,192,0.5)' },
  GOLD:   { label: 'GOLD',   color: '#FFD700', bg: 'rgba(255,215,0,0.22)',   glow: 'rgba(255,215,0,0.6)'   },
}

// ── Category config ─────────────────────────────────────────────────────────
const CAT: Record<MedalCategory, { label: string; icon: React.ElementType; color: string }> = {
  SOCIAL:   { label: 'Social',   icon: Users,    color: '#a855f7' },
  EVENTS:   { label: 'Events',   icon: Calendar, color: '#3b82f6' },
  HOST:     { label: 'Host',     icon: Star,     color: '#f59e0b' },
  EXPLORER: { label: 'Explorer', icon: MapPin,   color: '#06b6d4' },
  LOYALTY:  { label: 'Loyalty',  icon: Heart,    color: '#ff006e' },
  SPECIAL:  { label: 'Special',  icon: Zap,      color: '#FFD700' },
}

const TABS = ['ALL', 'SOCIAL', 'EVENTS', 'HOST', 'EXPLORER', 'LOYALTY', 'SPECIAL'] as const
const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'

// ── Individual hex tile ──────────────────────────────────────────────────────
function HexTile({
  medal, size = 54, onClick,
}: {
  medal: MedalWithProgress; size?: number; onClick?: () => void
}) {
  const W = size
  const H = Math.round(W * 1.1547)
  const tc = TIER[medal.tier]
  const inset = Math.max(2, Math.round(W * 0.035))

  return (
    <div
      onClick={onClick}
      title={`${medal.name} (${tc.label})`}
      style={{ width: W, height: H, position: 'relative', cursor: 'pointer', flexShrink: 0 }}
    >
      {/* ── Border / glow layer ── */}
      <div style={{
        position: 'absolute', inset: 0,
        clipPath: HEX_CLIP,
        background: medal.earned ? tc.color : 'rgba(74,96,128,0.2)',
        filter: medal.earned ? `drop-shadow(0 0 ${Math.round(W * 0.14)}px ${tc.glow})` : 'none',
      }} />

      {/* ── Inner content layer ── */}
      <div style={{
        position: 'absolute',
        top: inset, left: inset, right: inset, bottom: inset,
        clipPath: HEX_CLIP,
        background: medal.earned ? tc.bg : 'rgba(7,7,26,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {medal.earned ? (
          <span style={{ fontSize: W * 0.40, lineHeight: 1, userSelect: 'none' }}>{medal.icon}</span>
        ) : (
          <span style={{ fontSize: W * 0.28, lineHeight: 1, opacity: 0.25, userSelect: 'none' }}>🔒</span>
        )}
      </div>

      {/* ── Progress shimmer at bottom (partial earn) ── */}
      {!medal.earned && medal.progress > 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          clipPath: HEX_CLIP,
          background: `linear-gradient(to top, ${tc.color}18 0%, transparent ${Math.round(medal.progress * 100)}%)`,
          pointerEvents: 'none',
        }} />
      )}
    </div>
  )
}


// ── Detail sheet ─────────────────────────────────────────────────────────────
function MedalSheet({ medal, onClose }: { medal: MedalWithProgress; onClose: () => void }) {
  const tc = TIER[medal.tier]
  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-3xl pb-10"
        style={{ background: '#0d0d2b', border: '1px solid rgba(255,255,255,0.06)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* Large hex */}
        <div className="flex justify-center mt-4 mb-4">
          <HexTile medal={medal} size={90} />
        </div>

        {/* Name & tier */}
        <div className="text-center px-6 mb-5">
          <h2 className="text-xl font-black mb-1" style={{ color: '#e0f2fe', letterSpacing: '0.05em' }}>{medal.name}</h2>
          <span className="text-[10px] font-black px-3 py-1 rounded-full tracking-widest"
            style={{ background: tc.bg, border: `1px solid ${tc.color}50`, color: tc.color }}>
            {tc.label}
          </span>
        </div>

        {/* Description */}
        <p className="text-center text-sm px-8 mb-5" style={{ color: 'rgba(224,242,254,0.55)' }}>
          {medal.description}
        </p>

        {/* Progress / earned state */}
        <div className="px-8">
          {medal.earned ? (
            <div className="flex items-center justify-center gap-2 py-3 rounded-xl"
              style={{ background: `${tc.color}12`, border: `1px solid ${tc.color}30` }}>
              <Check size={14} style={{ color: tc.color }} />
              <span className="text-sm font-black" style={{ color: tc.color }}>
                Earned {medal.earnedAt
                  ? new Date(medal.earnedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                  : ''}
              </span>
            </div>
          ) : (
            <>
              <div className="flex justify-between mb-2">
                <span className="text-xs font-bold" style={{ color: 'rgba(224,242,254,0.4)' }}>
                  Progress: {medal.currentValue} / {medal.threshold}
                </span>
                <span className="text-xs font-black" style={{ color: tc.color }}>
                  {Math.round(medal.progress * 100)}%
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${medal.progress * 100}%`, background: tc.color }} />
              </div>
              <p className="text-center text-[10px] mt-3" style={{ color: 'rgba(224,242,254,0.25)' }}>
                {medal.threshold - medal.currentValue} more needed to unlock
              </p>
            </>
          )}
        </div>

        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full"
          style={{ background: 'rgba(255,255,255,0.06)' }}>
          <X size={16} style={{ color: 'rgba(224,242,254,0.5)' }} />
        </button>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function MedalsPage() {
  const { dbUser } = useAuth()
  const [medals, setMedals]       = useState<MedalWithProgress[]>([])
  const [loading, setLoading]     = useState(true)
  const [checking, setChecking]   = useState(false)
  const [newCount, setNewCount]   = useState(0)
  const [tab, setTab]             = useState<typeof TABS[number]>('ALL')
  const [selected, setSelected]   = useState<MedalWithProgress | null>(null)

  const load = useCallback(async () => {
    if (!dbUser) return
    try {
      const res = await api.get('/medals/mine') as { data: MedalWithProgress[] }
      setMedals(res.data ?? [])
    } catch {/* */} finally { setLoading(false) }
  }, [dbUser])

  // On mount, also silently check for new medals
  useEffect(() => {
    if (!dbUser) return
    load()
    api.post('/medals/check', {}).then((r) => {
      const res = r as { count: number }
      if (res.count > 0) { setNewCount(res.count); load() }
    }).catch(() => {/* */})
  }, [dbUser, load])

  async function checkProgress() {
    setChecking(true)
    try {
      const r = await api.post('/medals/check', {}) as { count: number }
      setNewCount(r.count ?? 0)
      if ((r.count ?? 0) > 0) load()
    } catch {/* */} finally { setChecking(false) }
  }

  const filtered = tab === 'ALL' ? medals : medals.filter(m => m.category === tab)
  // Sort: earned first, then by progress desc
  const sorted = [...filtered].sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1
    return b.progress - a.progress
  })

  const earnedCount = medals.filter(m => m.earned).length

  return (
    <div className="min-h-screen pb-28" style={{ background: '#07071a' }}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3"
        style={{ background: 'rgba(7,7,26,0.95)', borderBottom: '1px solid rgba(var(--accent-rgb),0.08)', backdropFilter: 'blur(20px)' }}>

        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Trophy size={18} style={{ color: '#FFD700' }} />
              <h1 className="text-xl font-black tracking-widest" style={{ color: '#e0f2fe', letterSpacing: '0.15em' }}>MEDALS</h1>
            </div>
            <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.35)' }}>
              {earnedCount} / {medals.length} unlocked
            </p>
          </div>
          <button onClick={checkProgress} disabled={checking}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.25)', color: 'var(--accent)' }}>
            <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking…' : 'Sync'}
          </button>
        </div>

        {newCount > 0 && (
          <div className="mb-2 px-3 py-2 rounded-xl text-xs font-bold text-center"
            style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.3)', color: '#FFD700' }}>
            🎖️ {newCount} new medal{newCount > 1 ? 's' : ''} unlocked!
          </div>
        )}

        {/* Overall progress bar */}
        <div className="mb-3 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(var(--accent-rgb),0.07)' }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${medals.length ? (earnedCount / medals.length) * 100 : 0}%`, background: 'linear-gradient(90deg, var(--accent), #FFD700)' }} />
        </div>

        {/* Category tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(t => {
            const cat   = t !== 'ALL' ? CAT[t as MedalCategory] : null
            const color = cat?.color ?? 'var(--accent)'
            const cnt   = t === 'ALL' ? earnedCount : medals.filter(m => m.category === t && m.earned).length
            return (
              <button key={t} onClick={() => setTab(t)}
                className="shrink-0 px-3 py-1.5 rounded-lg text-[9px] font-black tracking-wider transition-all"
                style={{
                  background: tab === t ? `${color}18` : 'transparent',
                  border:     `1px solid ${tab === t ? `${color}50` : 'rgba(var(--accent-rgb),0.08)'}`,
                  color:      tab === t ? color : 'rgba(224,242,254,0.3)',
                  letterSpacing: '0.1em',
                }}>
                {t}{cnt > 0 ? ` · ${cnt}` : ''}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Hex grid ── */}
      <div className="px-3 py-6 overflow-x-hidden">
        {loading ? (
          // Skeleton hexes
          <div style={{ position: 'relative', width: 6 * 57 - 3, height: 4 * Math.round(62 * 0.75) + 62, margin: '0 auto' }}>
            {Array.from({ length: 24 }).map((_, i) => {
              const ri = Math.floor(i / 6)
              const ci = i % 6
              return (
                <div key={i} style={{
                  position: 'absolute',
                  left: ci * 57 + (ri % 2 === 1 ? 28.5 : 0),
                  top:  ri * Math.round(62 * 0.75),
                  width: 54, height: 62,
                  clipPath: HEX_CLIP,
                  background: 'rgba(var(--accent-rgb),0.05)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
              )
            })}
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-24">
            <Trophy size={48} style={{ color: 'rgba(255,215,0,0.15)', margin: '0 auto 12px' }} />
            <p className="text-sm font-bold" style={{ color: 'rgba(224,242,254,0.3)' }}>No medals in this category yet</p>
          </div>
        ) : (
          <HexGridInner medals={sorted} onSelect={setSelected} />
        )}
      </div>

      {/* ── Legend ── */}
      {!loading && medals.length > 0 && (
        <div className="flex items-center justify-center gap-5 pb-4">
          {(['BRONZE', 'SILVER', 'GOLD'] as MedalTier[]).map(t => (
            <div key={t} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: TIER[t].color }} />
              <span className="text-[9px] font-black tracking-widest" style={{ color: 'rgba(224,242,254,0.3)' }}>{TIER[t].label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.2)' }}>🔒</span>
            <span className="text-[9px] font-black tracking-widest" style={{ color: 'rgba(224,242,254,0.3)' }}>LOCKED</span>
          </div>
        </div>
      )}

      {/* ── Detail sheet ── */}
      {selected && <MedalSheet medal={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// Separate component to fix the forward-ref / callback prop issue
function HexGridInner({ medals, onSelect }: { medals: MedalWithProgress[]; onSelect: (m: MedalWithProgress) => void }) {
  const W     = 54
  const H     = Math.round(W * 1.1547)  // 62
  const GAP   = 3
  const COLS  = 6
  const hStep = W + GAP   // 57
  const vStep = Math.round(H * 0.75)    // 47

  const rows: MedalWithProgress[][] = []
  for (let i = 0; i < medals.length; i += COLS) {
    rows.push(medals.slice(i, i + COLS))
  }

  const totalH = rows.length > 0 ? H + (rows.length - 1) * vStep : H
  const totalW = COLS * hStep - GAP

  return (
    <div style={{ position: 'relative', width: totalW, height: totalH, margin: '0 auto' }}>
      {rows.map((row, ri) =>
        row.map((medal, ci) => (
          <div
            key={medal.id}
            style={{
              position: 'absolute',
              left: ci * hStep + (ri % 2 === 1 ? hStep / 2 : 0),
              top:  ri * vStep,
            }}
          >
            <HexTile medal={medal} size={W} onClick={() => onSelect(medal)} />
          </div>
        ))
      )}
    </div>
  )
}
