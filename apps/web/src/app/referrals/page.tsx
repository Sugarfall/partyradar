'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Copy, Check, Users, TrendingUp, Wallet, Gift, Crown, Share2,
  Ticket, CreditCard, Calculator, Megaphone, Star,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { formatPrice, getCurrencySymbol } from '@/lib/currency'

interface ReferralData {
  code: string
  balance: number
  totalEarned: number
  totalReferrals: number
  activeReferrals: number
  inactiveReferrals: number
  referrals: { id: string; earned: number; isPaidOut: boolean; isActive: boolean; createdAt: string }[]
  config: {
    REVENUE_SHARE_PERCENT: number
    GROUP_PLATFORM_CUT_PERCENT: number
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

// ── Earn-guide helpers ────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  accent,
  children,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  title: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}>
          <Icon size={18} style={{ color: accent }} />
        </div>
        <h2 className="text-sm font-black tracking-wide" style={{ color: '#e0f2fe' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function GuideStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: `${accent}08`, border: `1px solid ${accent}18` }}>
      <p className="text-lg font-black" style={{ color: accent }}>{value}</p>
      <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.5)' }}>{label}</p>
    </div>
  )
}

function GuideStep({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black"
        style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.25)', color: 'var(--accent)' }}>
        {num}
      </div>
      <div>
        <p className="text-xs font-semibold" style={{ color: '#e0f2fe' }}>{title}</p>
        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.45)' }}>{desc}</p>
      </div>
    </div>
  )
}

function RevenueCalculator() {
  const [events, setEvents] = useState(4)
  const [avgTickets, setAvgTickets] = useState(100)
  const [avgPrice, setAvgPrice] = useState(15)

  const ticketRevenue = events * avgTickets * avgPrice * 0.95
  const pushRevenue = events * 25
  const total = ticketRevenue + pushRevenue

  return (
    <div className="space-y-4">
      {[
        { label: 'Events per month', value: events, set: setEvents, min: 1, max: 20 },
        { label: 'Avg tickets sold', value: avgTickets, set: setAvgTickets, min: 10, max: 500 },
        { label: 'Avg ticket price', value: avgPrice, set: setAvgPrice, min: 5, max: 100 },
      ].map(({ label, value, set, min, max }) => (
        <div key={label}>
          <div className="flex justify-between mb-1.5">
            <span className="text-[11px]" style={{ color: 'rgba(224,242,254,0.5)' }}>{label}</span>
            <span className="text-[11px] font-bold" style={{ color: 'var(--accent)' }}>
              {label.includes('price') ? `${getCurrencySymbol()}${value}` : value}
            </span>
          </div>
          <input type="range" min={min} max={max} value={value}
            onChange={(e) => set(Number(e.target.value))}
            className="w-full" style={{ accentColor: 'var(--accent)' }} />
        </div>
      ))}
      <div className="rounded-xl p-4 text-center"
        style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.08), rgba(0,255,136,0.06))', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
        <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'rgba(var(--accent-rgb),0.6)' }}>
          Estimated monthly earnings
        </p>
        <p className="text-2xl font-black" style={{ color: 'var(--accent)', textShadow: '0 0 30px rgba(var(--accent-rgb),0.3)' }}>
          {formatPrice(total)}
        </p>
        <p className="text-[10px] mt-1.5" style={{ color: 'rgba(224,242,254,0.35)' }}>
          {events} events × {avgTickets} tickets × £{avgPrice} (95% payout)
        </p>
      </div>
    </div>
  )
}

// ── Small components used by the referrals tab ────────────────────────────────

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

function EarnRow({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl"
      style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
      <span className="text-xl mt-0.5">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold" style={{ color: '#e0f2fe' }}>{title}</p>
        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.4)' }}>{desc}</p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReferralsPage() {
  const { dbUser, loading: authLoading } = useAuth()
  const [data, setData] = useState<ReferralData | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [retryKey, setRetryKey] = useState(0)
  const [fetchError, setFetchError] = useState('')
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'guide' | 'earn' | 'leaderboard'>('earn')
  const [requestingPayout, setRequestingPayout] = useState(false)
  const [payoutMsg, setPayoutMsg] = useState('')

  useEffect(() => {
    if (authLoading) return                        // wait for Firebase to resolve
    if (!dbUser) { setLoading(false); return }     // confirmed not logged in
    setFetchError('')
    Promise.all([
      api.get<{ data: ReferralData }>('/referrals'),
      api.get<{ data: LeaderEntry[] }>('/referrals/leaderboard'),
    ])
      .then(([refRes, lbRes]) => {
        if (refRes?.data) setData(refRes.data)
        if (lbRes?.data) setLeaderboard(lbRes.data)
      })
      .catch((err: unknown) => {
        setFetchError(err instanceof Error ? err.message : 'Could not load referral data')
      })
      .finally(() => setLoading(false))
  }, [dbUser?.id, authLoading, retryKey])

  function buildInviteLink(code: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/invite/${code}`
  }

  function copyCode() {
    if (!data?.code) return
    navigator.clipboard?.writeText(buildInviteLink(data.code)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function shareCode() {
    if (!data?.code) return
    const link = buildInviteLink(data.code)
    if (navigator.share) {
      navigator.share({ title: 'Join PartyRadar', text: "Come party with me on PartyRadar — tap the link to sign up, no code needed.", url: link }).catch(() => {})
    } else {
      copyCode()
    }
  }

  async function requestPayout() {
    setRequestingPayout(true)
    setPayoutMsg('')
    try {
      const j = await api.post<{ data: { message?: string } }>('/referrals/payout', {})
      setPayoutMsg(j?.data?.message ?? 'Payout requested!')
      setData((d) => d ? { ...d, balance: 0 } : d)
    } catch (err: unknown) {
      setPayoutMsg(err instanceof Error ? err.message : 'Network error')
    } finally { setRequestingPayout(false) }
  }

  // Spinner while Firebase auth OR data is resolving
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#04040d', paddingTop: 56 }}>
        <div className="w-10 h-10 border-2 rounded-full animate-spin"
          style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!dbUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4" style={{ background: '#04040d', paddingTop: 56 }}>
        <Gift size={40} style={{ color: 'rgba(var(--accent-rgb),0.2)' }} />
        <p className="text-sm font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>LOG IN TO EARN</p>
        <Link href="/login?next=/referrals" className="px-5 py-2.5 rounded-xl text-xs font-black tracking-widest"
          style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.25)', color: 'var(--accent)' }}>
          LOG IN
        </Link>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4" style={{ background: '#04040d', paddingTop: 56 }}>
        <TrendingUp size={36} style={{ color: 'rgba(var(--accent-rgb),0.2)' }} />
        <p className="text-xs font-bold text-center max-w-xs" style={{ color: 'rgba(224,242,254,0.4)' }}>{fetchError}</p>
        <button onClick={() => { setLoading(true); setFetchError(''); setRetryKey((k) => k + 1) }}
          className="px-5 py-2.5 rounded-xl text-xs font-black tracking-widest"
          style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.25)', color: 'var(--accent)' }}>
          TRY AGAIN
        </button>
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
          <TrendingUp size={22} style={{ color: '#00ff88' }} />
        </div>
        <div>
          <h1 className="text-xl font-black" style={{ color: '#e0f2fe' }}>Earn & Referrals</h1>
          <p className="text-[10px] font-bold tracking-wide" style={{ color: 'rgba(0,255,136,0.5)' }}>
            MULTIPLE WAYS TO EARN. ALL IN ONE PLACE.
          </p>
        </div>
      </div>

      {/* Referral link card — always visible */}
      {data && (
        <div className="rounded-2xl p-5 mb-5"
          style={{
            background: 'linear-gradient(135deg, rgba(0,255,136,0.08), rgba(var(--accent-rgb),0.05))',
            border: '1px solid rgba(0,255,136,0.2)',
          }}>
          <p className="text-[9px] font-black tracking-[0.2em] mb-2" style={{ color: 'rgba(0,255,136,0.5)' }}>YOUR INVITE LINK</p>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 min-w-0 px-4 py-3 rounded-xl font-mono text-[11px] font-bold truncate"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,255,136,0.25)', color: '#00ff88' }}
              title={buildInviteLink(data.code)}>
              {buildInviteLink(data.code).replace(/^https?:\/\//, '')}
            </div>
            <button onClick={copyCode}
              className="p-3 rounded-xl transition-all shrink-0"
              style={{ background: copied ? 'rgba(0,255,136,0.15)' : 'rgba(0,255,136,0.08)', border: `1px solid ${copied ? 'rgba(0,255,136,0.4)' : 'rgba(0,255,136,0.2)'}`, color: '#00ff88' }}
              aria-label="Copy link">
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
            <button onClick={shareCode}
              className="p-3 rounded-xl transition-all shrink-0"
              style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}
              aria-label="Share link">
              <Share2 size={18} />
            </button>
          </div>
          <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.35)' }}>
            Send the link — no codes to type. The app links the account to you the moment they sign up.
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'rgba(224,242,254,0.25)' }}>
            Code: <span className="font-mono" style={{ color: 'rgba(0,255,136,0.6)' }}>{data.code}</span>
          </p>
        </div>
      )}

      {/* Stats grid — always visible */}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <StatCard label="BALANCE" value={`£${data.balance.toFixed(2)}`}
              icon={<Wallet size={14} style={{ color: '#00ff88' }} />} color="#00ff88" />
            <StatCard label="TOTAL EARNED" value={`£${data.totalEarned.toFixed(2)}`}
              icon={<TrendingUp size={14} style={{ color: 'var(--accent)' }} />} color="var(--accent)" />
          </div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatCard label="TOTAL REFS" value={String(data.totalReferrals)}
              icon={<Users size={14} style={{ color: '#a855f7' }} />} color="#a855f7" />
            <StatCard label="ACTIVE" value={String(data.activeReferrals ?? 0)}
              icon={<Users size={14} style={{ color: '#00ff88' }} />} color="#00ff88" />
            <StatCard label="PENDING" value={String(data.inactiveReferrals ?? 0)}
              icon={<Users size={14} style={{ color: 'rgba(74,96,128,0.6)' }} />} color="rgba(74,96,128,0.6)" />
          </div>
        </>
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

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-4">
        {([
          { key: 'earn',        label: 'MY REFERRALS' },
          { key: 'guide',       label: 'HOW TO EARN' },
          { key: 'leaderboard', label: 'LEADERBOARD' },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex-1 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all"
            style={{
              background: tab === key ? 'rgba(var(--accent-rgb),0.12)' : 'rgba(var(--accent-rgb),0.03)',
              border: `1px solid ${tab === key ? 'rgba(var(--accent-rgb),0.35)' : 'rgba(var(--accent-rgb),0.08)'}`,
              color: tab === key ? 'var(--accent)' : 'rgba(74,96,128,0.5)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── MY REFERRALS tab ── */}
      {tab === 'earn' && cfg && (
        <div className="space-y-2.5">
          <div className="p-4 rounded-2xl"
            style={{ background: 'linear-gradient(135deg, rgba(0,255,136,0.08), rgba(var(--accent-rgb),0.05))', border: '1px solid rgba(0,255,136,0.2)' }}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} style={{ color: '#00ff88' }} />
              <p className="text-xs font-black tracking-widest" style={{ color: '#00ff88' }}>HOW IT WORKS</p>
            </div>
            <p className="text-2xl font-black leading-tight mb-2" style={{ color: '#e0f2fe' }}>
              Earn <span style={{ color: '#00ff88' }}>{cfg.REVENUE_SHARE_PERCENT}%</span> of every £ we make from your referrals.{' '}
              <span style={{ color: 'rgba(224,242,254,0.45)' }}>For life.</span>
            </p>
            <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(224,242,254,0.55)' }}>
              Every time someone you referred buys a ticket, pays a subscription, joins a paid group,
              or spends at a partner venue — we take our fee, and you keep
              <span style={{ color: '#00ff88', fontWeight: 800 }}> {cfg.REVENUE_SHARE_PERCENT}% of it</span>.
              No caps, no time limit.
            </p>
          </div>

          <p className="text-[9px] font-black tracking-[0.15em] mt-4 mb-1 px-1" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
            WHAT COUNTS
          </p>
          <EarnRow emoji="🎟️" title="Ticket fees"
            desc={`We take 5% of every ticket they buy — you get ${cfg.REVENUE_SHARE_PERCENT}% of that fee`} />
          <EarnRow emoji="⭐" title="Subscriptions"
            desc={`${cfg.REVENUE_SHARE_PERCENT}% of every monthly subscription payment — recurring`} />
          <EarnRow emoji="👥" title="Paid groups"
            desc={`${cfg.REVENUE_SHARE_PERCENT}% of our ${cfg.GROUP_PLATFORM_CUT_PERCENT}% platform cut when they join`} />
          <EarnRow emoji="🍸" title="Venue spend"
            desc={`${cfg.REVENUE_SHARE_PERCENT}% of the commission we earn on their wallet spend at partner venues`} />
          <EarnRow emoji="📣" title="Push blasts"
            desc={`${cfg.REVENUE_SHARE_PERCENT}% of every push blast they buy`} />

          <div className="mt-4 p-4 rounded-2xl" style={{ background: 'rgba(255,214,0,0.04)', border: '1px solid rgba(255,214,0,0.15)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Crown size={14} style={{ color: '#ffd600' }} />
              <p className="text-xs font-black" style={{ color: '#ffd600' }}>ALSO FOR GROUP CREATORS</p>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(224,242,254,0.5)' }}>
              Running a paid group? Keep
              <span style={{ color: '#ffd600', fontWeight: 800 }}> {100 - cfg.GROUP_PLATFORM_CUT_PERCENT}%</span> of
              subscription revenue. Minimum payout:
              <span style={{ color: '#00ff88', fontWeight: 800 }}> £{cfg.MIN_PAYOUT.toFixed(2)}</span>.
            </p>
          </div>

          {data && data.referrals.length > 0 && (
            <div className="mt-4">
              <p className="text-[9px] font-black tracking-[0.15em] mb-2" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
                RECENT EARNINGS
              </p>
              {data.referrals.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2"
                  style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.05)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,255,136,0.1)' }}>
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

      {/* ── HOW TO EARN (guide) tab ── */}
      {tab === 'guide' && (
        <div className="space-y-4">
          <SectionCard icon={Ticket} title="For Hosts" accent="#a855f7">
            <p className="text-xs leading-relaxed mb-3" style={{ color: 'rgba(224,242,254,0.55)' }}>
              Create events and sell tickets directly through PartyRadar. You keep{' '}
              <span className="font-bold" style={{ color: '#a855f7' }}>95%</span> of every ticket sold — one of the
              highest payout rates in the industry.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <GuideStat label="Ticket payout" value="95%" accent="#a855f7" />
              <GuideStat label="Platform fee" value="5%" accent="#a855f7" />
            </div>
            <div className="flex items-start gap-2.5">
              <Megaphone size={14} className="mt-0.5 shrink-0" style={{ color: '#a855f7' }} />
              <p className="text-[11px]" style={{ color: 'rgba(224,242,254,0.45)' }}>
                <span className="font-semibold" style={{ color: '#e0f2fe' }}>Push Blasts</span> — Send targeted
                notifications to attendees in your area. Each blast generates additional revenue as followers engage.
              </p>
            </div>
          </SectionCard>

          <SectionCard icon={Users} title="For Group Creators" accent="#00ff88">
            <p className="text-xs leading-relaxed mb-3" style={{ color: 'rgba(224,242,254,0.55)' }}>
              Build exclusive communities and charge membership fees. You keep{' '}
              <span className="font-bold" style={{ color: '#00ff88' }}>80%</span> of all subscription revenue from
              your paid groups.
            </p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <GuideStat label="Starter" value="£0.99" accent="#00ff88" />
              <GuideStat label="Standard" value="£4.99" accent="#00ff88" />
              <GuideStat label="Premium" value="£9.99" accent="#00ff88" />
            </div>
            <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>
              Pricing tiers from £0.99 to £9.99/month. You set the price, we handle billing.
            </p>
          </SectionCard>

          <SectionCard icon={Share2} title="For Referrers" accent="#ffd600">
            <p className="text-xs leading-relaxed mb-3" style={{ color: 'rgba(224,242,254,0.55)' }}>
              Share your referral link and earn <span className="font-bold" style={{ color: '#ffd600' }}>10%</span> of
              every pound the platform makes from someone you refer — for life. No caps. No expiry.
            </p>
            <div className="space-y-2">
              {[
                { label: 'Share of platform revenue', value: '10%' },
                { label: 'Duration', value: 'Lifetime' },
                { label: 'Counts on', value: 'Tickets, subs, groups, venue' },
                { label: 'Minimum payout', value: '£5.00' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between rounded-lg px-3 py-2 gap-3"
                  style={{ background: 'rgba(255,214,0,0.04)', border: '1px solid rgba(255,214,0,0.1)' }}>
                  <span className="text-[11px] truncate" style={{ color: 'rgba(224,242,254,0.6)' }}>{label}</span>
                  <span className="text-xs font-bold shrink-0" style={{ color: '#ffd600' }}>{value}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] mt-3" style={{ color: 'rgba(224,242,254,0.4)' }}>
              Example: your referral subscribes at <strong style={{ color: '#e0f2fe' }}>£9.99/mo</strong>.
              You earn <strong style={{ color: '#ffd600' }}>£1.00/mo</strong> every month they stay subscribed.
            </p>
          </SectionCard>

          <SectionCard icon={Wallet} title="Wallet Rewards" accent="var(--accent)">
            <p className="text-xs leading-relaxed mb-3" style={{ color: 'rgba(224,242,254,0.55)' }}>
              Every purchase earns you loyalty points. Spend on tickets, food, or merch and watch your rewards grow automatically.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <GuideStat label="Points per £1 spent" value="10 pts" accent="var(--accent)" />
              <GuideStat label="Free drink at" value="500 pts" accent="var(--accent)" />
            </div>
            <p className="text-[10px] mt-3" style={{ color: 'rgba(224,242,254,0.4)' }}>
              Points never expire. Redeem for drinks, merchandise, and exclusive event perks.
            </p>
          </SectionCard>

          <SectionCard icon={CreditCard} title="Physical Cards" accent="#ff6b6b">
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(224,242,254,0.55)' }}>
              Design and sell custom PartyRadar physical cards. Earn a commission on every card sold featuring your
              original artwork. A creative way to build your brand and earn passively.
            </p>
          </SectionCard>

          <SectionCard icon={Star} title="How to Get Started" accent="var(--accent)">
            <div className="space-y-4">
              <GuideStep num={1} title="Create your account" desc="Sign up for free in under a minute." />
              <GuideStep num={2} title="Switch to Host mode" desc="Toggle to Host in the top bar to unlock creator tools." />
              <GuideStep num={3} title="Create events or groups" desc="Set up your first event with tickets or launch a paid community group." />
              <GuideStep num={4} title="Share your referral link" desc="Found above — share it everywhere for passive income." />
              <GuideStep num={5} title="Cash out" desc="Withdraw earnings to your bank account anytime above the minimum." />
            </div>
          </SectionCard>

          <SectionCard icon={Calculator} title="Revenue Calculator" accent="#a855f7">
            <p className="text-xs leading-relaxed mb-4" style={{ color: 'rgba(224,242,254,0.55)' }}>
              See how much you could earn as a host. Adjust the sliders to match your expected event size.
            </p>
            <RevenueCalculator />
          </SectionCard>
        </div>
      )}

      {/* ── LEADERBOARD tab ── */}
      {tab === 'leaderboard' && (
        <div className="space-y-2">
          {leaderboard.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <TrendingUp size={28} style={{ color: 'rgba(var(--accent-rgb),0.15)' }} />
              <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>No referrers yet — be the first!</p>
            </div>
          ) : leaderboard.map((u, i) => {
            const medals = ['#ffd600', '#c0c0c0', '#cd7f32']
            const medal = medals[i]
            return (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(7,7,26,0.8)', border: `1px solid ${i < 3 ? (medal + '30') : 'rgba(var(--accent-rgb),0.06)'}` }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0"
                  style={{ background: medal ? `${medal}18` : 'rgba(var(--accent-rgb),0.06)', color: medal ?? 'rgba(224,242,254,0.4)' }}>
                  {i + 1}
                </div>
                {u.photoUrl ? (
                  <img src={u.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)' }}>
                    {u.displayName[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{u.displayName}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
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
