'use client'

import { useState, useEffect, useCallback } from 'react'
import { Trophy, Users, Calendar, MapPin, Heart, Zap, Star, RefreshCw, Check, Lock } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

type MedalTier = 'BRONZE' | 'SILVER' | 'GOLD'
type MedalCategory = 'SOCIAL' | 'EVENTS' | 'HOST' | 'EXPLORER' | 'LOYALTY' | 'SPECIAL'

interface MedalWithProgress {
  id: string; slug: string; name: string; description: string; icon: string
  tier: MedalTier; category: MedalCategory; conditionType: string
  threshold: number; earned: boolean; earnedAt: string | null
  progress: number; currentValue: number
}

const TIER_CFG = {
  BRONZE: { label: 'BRONZE', color: '#cd7f32', bg: 'rgba(205,127,50,0.15)', border: 'rgba(205,127,50,0.4)' },
  SILVER: { label: 'SILVER', color: '#9EA0A5', bg: 'rgba(158,160,165,0.15)', border: 'rgba(158,160,165,0.4)' },
  GOLD:   { label: 'GOLD',   color: '#FFD700', bg: 'rgba(255,215,0,0.15)',   border: 'rgba(255,215,0,0.4)'   },
}
const CAT_CFG: Record<MedalCategory, { label: string; icon: React.ElementType; color: string }> = {
  SOCIAL:   { label: 'Social',   icon: Users,     color: '#a855f7' },
  EVENTS:   { label: 'Events',   icon: Calendar,  color: '#3d5afe' },
  HOST:     { label: 'Host',     icon: Star,      color: '#f59e0b' },
  EXPLORER: { label: 'Explorer', icon: MapPin,    color: '#06b6d4' },
  LOYALTY:  { label: 'Loyalty',  icon: Heart,     color: '#ff006e' },
  SPECIAL:  { label: 'Special',  icon: Zap,       color: '#FFD700' },
}
const TABS = ['ALL','SOCIAL','EVENTS','HOST','EXPLORER','LOYALTY','SPECIAL'] as const

export default function MedalsPage() {
  const { dbUser } = useAuth()
  const [medals, setMedals] = useState<MedalWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [newCount, setNewCount] = useState(0)
  const [tab, setTab] = useState<typeof TABS[number]>('ALL')

  const load = useCallback(async () => {
    try {
      const res = await api.get('/medals/mine') as any
      setMedals(res.data ?? [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { if (dbUser) load() }, [dbUser, load])

  async function checkProgress() {
    setChecking(true)
    try {
      const res = await api.post('/medals/check', {}) as any
      setNewCount(res.count ?? 0)
      if (res.count > 0) load()
    } catch {} finally { setChecking(false) }
  }

  const filtered = tab === 'ALL' ? medals : medals.filter(m => m.category === tab)
  const sorted = [...filtered].sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1
    return b.progress - a.progress
  })
  const earnedCount = medals.filter(m => m.earned).length

  return (
    <div className="min-h-screen pb-24" style={{ background: '#07071a' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3" style={{ background: 'rgba(7,7,26,0.95)', borderBottom: '1px solid rgba(var(--accent-rgb),0.1)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Trophy size={18} style={{ color: '#FFD700' }} />
              <h1 className="text-xl font-black tracking-widest" style={{ color: '#e0f2fe', letterSpacing: '0.15em' }}>ACHIEVEMENTS</h1>
            </div>
            <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>{earnedCount} / {medals.length} medals earned</p>
          </div>
          <button onClick={checkProgress} disabled={checking}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)' }}>
            <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking…' : 'Check Progress'}
          </button>
        </div>

        {newCount > 0 && (
          <div className="mb-3 px-3 py-2 rounded-xl text-xs font-bold text-center" style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', color: '#FFD700' }}>
            🎉 {newCount} new medal{newCount > 1 ? 's' : ''} earned!
          </div>
        )}

        <div className="mb-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(var(--accent-rgb),0.08)' }}>
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${medals.length ? (earnedCount / medals.length) * 100 : 0}%`, background: 'linear-gradient(90deg, var(--accent), #FFD700)' }} />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(t => {
            const cat = t !== 'ALL' ? CAT_CFG[t as MedalCategory] : null
            const cnt = t === 'ALL' ? earnedCount : medals.filter(m => m.category === t && m.earned).length
            return (
              <button key={t} onClick={() => setTab(t)}
                className="shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wider transition-all"
                style={{ background: tab === t ? (cat?.color ?? 'var(--accent)') + '20' : 'transparent', border: `1px solid ${tab === t ? (cat?.color ?? 'var(--accent)') + '55' : 'rgba(var(--accent-rgb),0.08)'}`, color: tab === t ? (cat?.color ?? 'var(--accent)') : 'rgba(224,242,254,0.35)', letterSpacing: '0.1em' }}>
                {t}{cnt > 0 ? ` · ${cnt}` : ''}
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-3">
        {loading ? [...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'rgba(var(--accent-rgb),0.05)' }} />) :
         sorted.length === 0 ? (
          <div className="text-center py-16">
            <Trophy size={40} style={{ color: 'rgba(255,215,0,0.2)', margin: '0 auto 12px' }} />
            <p className="text-sm font-bold" style={{ color: 'rgba(224,242,254,0.35)' }}>No medals here yet</p>
          </div>
         ) : sorted.map(m => {
          const tier = TIER_CFG[m.tier]
          const cat = CAT_CFG[m.category]
          const CatIcon = cat.icon
          return (
            <div key={m.id} className="rounded-2xl overflow-hidden" style={{ background: m.earned ? 'rgba(7,7,26,0.95)' : 'rgba(7,7,26,0.55)', border: `1px solid ${m.earned ? tier.border : 'rgba(var(--accent-rgb),0.07)'}`, boxShadow: m.earned ? `0 0 18px ${tier.color}15` : 'none', opacity: m.earned ? 1 : 0.72 }}>
              <div className="flex items-center gap-4 p-4">
                <div className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-2xl relative" style={{ background: m.earned ? tier.bg : 'rgba(var(--accent-rgb),0.05)', border: `1px solid ${m.earned ? tier.border : 'rgba(var(--accent-rgb),0.1)'}` }}>
                  <span style={{ filter: m.earned ? 'none' : 'grayscale(1) opacity(0.35)' }}>{m.icon}</span>
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: m.earned ? tier.color : 'rgba(7,7,26,0.9)', border: m.earned ? 'none' : '1px solid rgba(var(--accent-rgb),0.15)' }}>
                    {m.earned ? <Check size={9} color="#000" strokeWidth={3} /> : <Lock size={8} style={{ color: 'rgba(224,242,254,0.25)' }} />}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-sm font-black" style={{ color: m.earned ? '#e0f2fe' : 'rgba(224,242,254,0.45)' }}>{m.name}</span>
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0" style={{ background: tier.bg, border: `1px solid ${tier.border}`, color: tier.color, letterSpacing: '0.1em' }}>{tier.label}</span>
                  </div>
                  <p className="text-[10px] mb-2 line-clamp-1" style={{ color: 'rgba(224,242,254,0.3)' }}>{m.description}</p>
                  {m.earned ? (
                    <p className="text-[9px] font-bold" style={{ color: tier.color }}>✓ Earned {m.earnedAt ? new Date(m.earnedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
                  ) : (
                    <>
                      <div className="flex justify-between mb-1">
                        <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.25)' }}>{m.currentValue} / {m.threshold}</span>
                        <span className="text-[9px] font-bold" style={{ color: tier.color }}>{Math.round(m.progress * 100)}%</span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(var(--accent-rgb),0.07)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${m.progress * 100}%`, background: tier.color }} />
                      </div>
                    </>
                  )}
                </div>
                <CatIcon size={13} style={{ color: cat.color + '70', flexShrink: 0 }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
