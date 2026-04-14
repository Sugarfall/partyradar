'use client'

import { useState, useEffect } from 'react'
import { Copy, Check, Users, TrendingUp, Wallet, Gift, ChevronRight, Crown, Share2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { API_URL } from '@/lib/api'
import { DEV_MODE } from '@/lib/firebase'

interface ReferralData {
  code: string
  balance: number
  totalEarned: number
  totalReferrals: number
  activeReferrals: number
  inactiveReferrals: number
  referrals: { id: string; earned: number; isPaidOut: boolean; isActive: boolean; createdAt: string }[]
  config: {
    TICKET_COMMISSION_PERCENT: number
    SUBSCRIPTION_COMMISSION_PERCENT: number
    GROUP_COMMISSION_PERCENT: number
    GROUP_PLATFORM_CUT_PERCENT: number
    FIRST_PURCHASE_BONUS: number
    MIN_PAYOUT: number
  }
}

interface LeaderEntry {
  id: string
  username: string
  displayName: string
  photoUrl?: string | null
  earned: number
  referralCount: number
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="p-4 rounded-2xl" style={{ background: `${color}08`, border: `1px solid ${color}25` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-black tracking-[0.15em]" style={{ color: `${color}80` }}>{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
          {icon}
        </div>
      </div>
      <p className="text-xl font-black" style={{ color }}>{value}</p>
    </div>
  )
}

function EarnCard({ emoji, title, percent, desc }: { emoji: string; title: string; percent: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl"
      style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}>
      <span className="text-xl mt-0.5">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>{title}</p>
          <span className="text-xs font-black" style={{ color: '#00ff88' }}>{percent}</span>
        </div>
        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.4)' }}>{desc}</p>
      </div>
    </div>
  )
}

export default function ReferralsPage() {
  const { dbUser } = useAuth()
  const [data, setData] = useState<ReferralData | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'earn' | 'leaderboard'>('earn')
  const [requestingPayout, setRequestingPayout] = useState(false)
  const [payoutMsg, setPayoutMsg] = useState('')

  const token = typeof window !== 'undefined' ? localStorage.getItem('partyradar_token') ?? '' : ''
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  useEffect(() => {
    if (!dbUser) { setLoading(false); return }
    Promise.all([
      fetch(`${API_URL}/referrals`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/referrals/leaderboard`).then((r) => r.json()),
    ])
      .then(([refRes, lbRes]) => {
        if (refRes.data) setData(refRes.data)
        if (lbRes.data) setLeaderboard(lbRes.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dbUser?.id])

  function copyCode() {
    if (!data?.code) return
    const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/register?ref=${data.code}`
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function shareCode() {
    if (!data?.code) return
    const link = `${window.location.origin}/auth/register?ref=${data.code}`
    if (navigator.share) {
      navigator.share({ title: 'Join PartyRadar', text: `Use my referral code ${data.code} and we both earn!`, url: link })
    } else {
      copyCode()
    }
  }

  async function requestPayout() {
    setRequestingPayout(true)
    setPayoutMsg('')
    try {
      const r = await fetch(`${API_URL}/referrals/payout`, { method: 'POST', headers })
      const j = await r.json()
      if (r.ok) {
        setPayoutMsg(j.data?.message ?? 'Payout requested!')
        setData((d) => d ? { ...d, balance: 0 } : d)
      } else {
        setPayoutMsg(j.error ?? 'Failed')
      }
    } catch { setPayoutMsg('Network error') }
    finally { setRequestingPayout(false) }
  }

  if (!dbUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4" style={{ background: '#04040d', paddingTop: 56 }}>
        <Gift size={40} style={{ color: 'rgba(0,229,255,0.2)' }} />
        <p className="text-sm font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>LOG IN TO EARN</p>
        <a href="/auth/login" className="px-5 py-2.5 rounded-xl text-xs font-black tracking-widest"
          style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', color: '#00e5ff' }}>
          LOG IN
        </a>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#04040d', paddingTop: 56 }}>
        <div className="w-10 h-10 border-2 rounded-full animate-spin"
          style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
      </div>
    )
  }

  const cfg = data?.config

  return (
    <div className="min-h-screen pb-28 px-4 pt-20 max-w-lg mx-auto" style={{ background: '#04040d' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)' }}>
          <Gift size={22} style={{ color: '#00ff88' }} />
        </div>
        <div>
          <h1 className="text-xl font-black" style={{ color: '#e0f2fe' }}>Earn with PartyRadar</h1>
          <p className="text-[10px] font-bold tracking-wide" style={{ color: 'rgba(0,255,136,0.5)' }}>
            REFER FRIENDS. EARN REAL MONEY.
          </p>
        </div>
      </div>

      {/* Referral code card */}
      {data && (
        <div className="rounded-2xl p-5 mb-5"
          style={{
            background: 'linear-gradient(135deg, rgba(0,255,136,0.08), rgba(0,229,255,0.05))',
            border: '1px solid rgba(0,255,136,0.2)',
          }}>
          <p className="text-[9px] font-black tracking-[0.2em] mb-2" style={{ color: 'rgba(0,255,136,0.5)' }}>
            YOUR REFERRAL CODE
          </p>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 px-4 py-3 rounded-xl font-mono text-lg font-black tracking-[0.15em]"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,255,136,0.25)', color: '#00ff88' }}>
              {data.code}
            </div>
            <button onClick={copyCode}
              className="p-3 rounded-xl transition-all"
              style={{
                background: copied ? 'rgba(0,255,136,0.15)' : 'rgba(0,255,136,0.08)',
                border: `1px solid ${copied ? 'rgba(0,255,136,0.4)' : 'rgba(0,255,136,0.2)'}`,
                color: '#00ff88',
              }}>
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
            <button onClick={shareCode}
              className="p-3 rounded-xl transition-all"
              style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}>
              <Share2 size={18} />
            </button>
          </div>
          <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.35)' }}>
            Share your link. When they sign up and spend, you earn.
          </p>
        </div>
      )}

      {/* Stats grid */}
      {data && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <StatCard label="BALANCE" value={`£${data.balance.toFixed(2)}`}
            icon={<Wallet size={14} style={{ color: '#00ff88' }} />} color="#00ff88" />
          <StatCard label="TOTAL EARNED" value={`£${data.totalEarned.toFixed(2)}`}
            icon={<TrendingUp size={14} style={{ color: '#00e5ff' }} />} color="#00e5ff" />
        </div>
      )}
      {data && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <StatCard label="TOTAL REFS" value={String(data.totalReferrals)}
            icon={<Users size={14} style={{ color: '#a855f7' }} />} color="#a855f7" />
          <StatCard label="ACTIVE" value={String(data.activeReferrals ?? 0)}
            icon={<Users size={14} style={{ color: '#00ff88' }} />} color="#00ff88" />
          <StatCard label="PENDING" value={String(data.inactiveReferrals ?? 0)}
            icon={<Users size={14} style={{ color: 'rgba(74,96,128,0.6)' }} />} color="rgba(74,96,128,0.6)" />
        </div>
      )}

      {/* Payout button */}
      {data && data.balance >= (cfg?.MIN_PAYOUT ?? 5) && (
        <button onClick={requestPayout} disabled={requestingPayout}
          className="w-full py-3.5 rounded-xl text-xs font-black tracking-widest mb-5 disabled:opacity-50"
          style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.35)', color: '#00ff88' }}>
          {requestingPayout ? 'REQUESTING...' : `CASH OUT £${data.balance.toFixed(2)}`}
        </button>
      )}
      {payoutMsg && (
        <p className="text-xs text-center mb-4 font-bold" style={{ color: '#00ff88' }}>{payoutMsg}</p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {(['earn', 'leaderboard'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 rounded-xl text-[11px] font-black tracking-widest transition-all"
            style={{
              background: tab === t ? 'rgba(0,229,255,0.12)' : 'rgba(0,229,255,0.03)',
              border: `1px solid ${tab === t ? 'rgba(0,229,255,0.35)' : 'rgba(0,229,255,0.08)'}`,
              color: tab === t ? '#00e5ff' : 'rgba(74,96,128,0.5)',
            }}>
            {t === 'earn' ? 'HOW TO EARN' : 'LEADERBOARD'}
          </button>
        ))}
      </div>

      {/* Earn tab */}
      {tab === 'earn' && cfg && (
        <div className="space-y-2.5">
          <EarnCard emoji="🎟️" title="Ticket Sales" percent={`${cfg.TICKET_COMMISSION_PERCENT}%`}
            desc="Earn on every ticket your referral buys" />
          <EarnCard emoji="⭐" title="Subscriptions" percent={`${cfg.SUBSCRIPTION_COMMISSION_PERCENT}%`}
            desc="Recurring cut when they subscribe to PRO/PREMIUM" />
          <EarnCard emoji="👥" title="Group Subs" percent={`${cfg.GROUP_COMMISSION_PERCENT}%`}
            desc="Earn when your referral subscribes to paid groups" />
          <EarnCard emoji="🎁" title="First Purchase Bonus" percent={`+£${cfg.FIRST_PURCHASE_BONUS.toFixed(2)}`}
            desc="Flat bonus when they make their first purchase" />

          <div className="mt-4 p-4 rounded-2xl" style={{ background: 'rgba(255,214,0,0.04)', border: '1px solid rgba(255,214,0,0.15)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Crown size={14} style={{ color: '#ffd600' }} />
              <p className="text-xs font-black" style={{ color: '#ffd600' }}>GROUP CREATOR EARNINGS</p>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(224,242,254,0.5)' }}>
              Create paid groups and earn <span style={{ color: '#ffd600', fontWeight: 800 }}>{100 - cfg.GROUP_PLATFORM_CUT_PERCENT}%</span> of
              subscription revenue. Platform takes {cfg.GROUP_PLATFORM_CUT_PERCENT}%.
              Minimum payout: <span style={{ color: '#00ff88', fontWeight: 800 }}>£{cfg.MIN_PAYOUT.toFixed(2)}</span>.
            </p>
          </div>

          {/* Recent referrals */}
          {data && data.referrals.length > 0 && (
            <div className="mt-4">
              <p className="text-[9px] font-black tracking-[0.15em] mb-2" style={{ color: 'rgba(0,229,255,0.4)' }}>
                RECENT EARNINGS
              </p>
              {data.referrals.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2"
                  style={{ borderBottom: '1px solid rgba(0,229,255,0.05)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0,255,136,0.1)' }}>
                      <Gift size={10} style={{ color: '#00ff88' }} />
                    </div>
                    <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>
                      {new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <span className="text-xs font-black" style={{ color: r.isPaidOut ? 'rgba(0,255,136,0.4)' : '#00ff88' }}>
                    {r.isPaidOut ? '(paid) ' : ''}+£{r.earned.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Leaderboard tab */}
      {tab === 'leaderboard' && (
        <div className="space-y-2">
          {leaderboard.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <TrendingUp size={28} style={{ color: 'rgba(0,229,255,0.15)' }} />
              <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>No referrers yet — be the first!</p>
            </div>
          ) : leaderboard.map((u, i) => {
            const medals = ['#ffd600', '#c0c0c0', '#cd7f32']
            const medal = medals[i]
            return (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(7,7,26,0.8)', border: `1px solid ${i < 3 ? (medal + '30') : 'rgba(0,229,255,0.06)'}` }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0"
                  style={{
                    background: medal ? `${medal}18` : 'rgba(0,229,255,0.06)',
                    color: medal ?? 'rgba(224,242,254,0.4)',
                  }}>
                  {i + 1}
                </div>
                {u.photoUrl ? (
                  <img src={u.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: 'rgba(0,229,255,0.1)', color: '#00e5ff' }}>
                    {u.displayName[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{u.displayName}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(0,229,255,0.4)' }}>
                    {u.referralCount} referral{u.referralCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="text-sm font-black" style={{ color: '#00ff88' }}>£{u.earned.toFixed(2)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
