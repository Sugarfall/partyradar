'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { formatPrice } from '@/lib/currency'
import { WALLET_TOP_UP_TIERS } from '@partyradar/shared'
import {
  Wallet, CreditCard, Gift, TrendingUp,
  ArrowUp, ArrowDown, Zap, Star, CheckCircle,
} from 'lucide-react'
import { TopUpModal } from '@/components/wallet/TopUpModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WalletData {
  id: string
  balance: number
  rewardPoints: number
  freeDrinksAvailable: number
  freeDrinksEarned: number
  pointsToNextDrink: number
  lifetimeSpent: number
  lifetimeTopUp: number
}

interface WalletTransaction {
  id: string
  type: string
  amount: number
  balanceAfter: number
  description: string
  status: string
  createdAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function txIcon(type: string) {
  switch (type) {
    case 'TOP_UP':    return <ArrowDown size={14} style={{ color: '#00ff88' }} />
    case 'SPEND':     return <ArrowUp   size={14} style={{ color: '#ff006e' }} />
    case 'REWARD':    return <Gift      size={14} style={{ color: '#ffd600' }} />
    case 'REFUND':    return <TrendingUp size={14} style={{ color: '#3b82f6' }} />
    default:          return <Zap       size={14} style={{ color: 'rgba(224,242,254,0.4)' }} />
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div
        className="w-10 h-10 rounded-full border-2 animate-spin"
        style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }}
      />
      <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
        LOADING WALLET…
      </p>
    </div>
  )
}

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{
        background: 'rgba(24,24,27,0.95)',
        border: '1px solid rgba(var(--accent-rgb),0.1)',
      }}
    >
      {children}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WalletPage() {
  const { dbUser } = useAuth()
  const router = useRouter()

  const [wallet, setWallet]           = useState<WalletData | null>(null)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [loading, setLoading]         = useState(true)
  const [loadError, setLoadError]     = useState<string | null>(null)
  const [topUpTierId, setTopUpTierId] = useState<string | null>(null)   // which tier modal is open for
  const [topUpSuccess, setTopUpSuccess] = useState(false)

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await api.get<{ data: WalletData & { transactions: WalletTransaction[] } }>('/wallet')
      if (res?.data) {
        const { transactions: txs, ...walletData } = res.data
        setWallet(walletData as WalletData)
        setTransactions(txs ?? [])
      }
    } catch {
      // Bug 8 fix: show error instead of silent blank page
      setLoadError('Failed to load wallet — please try again')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!dbUser) return
    load()

    // Handle ?success=true redirect from Stripe Checkout
    // Read from window.location so we don't need useSearchParams (avoids Next.js Suspense requirement)
    if (new URLSearchParams(window.location.search).get('success') === 'true') {
      setTopUpSuccess(true)
      // Clean the query param without a full page reload
      window.history.replaceState({}, '', '/wallet')
      // Auto-hide success banner after 6 s
      const t = setTimeout(() => setTopUpSuccess(false), 6000)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbUser])

  function handleTopUpSuccess() {
    setTopUpTierId(null)
    setTopUpSuccess(true)
    const t = setTimeout(() => setTopUpSuccess(false), 6000)
    // Reload wallet so new balance appears immediately
    load()
    return () => clearTimeout(t)
  }

  // ── Auth gate ──────────────────────────────────────────────────────────────

  if (!dbUser) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ paddingTop: 56, paddingBottom: 88, background: '#04040d' }}
      >
        <div className="text-center space-y-4 px-8">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
            style={{ background: 'rgba(var(--accent-rgb),0.05)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}
          >
            <Wallet size={28} style={{ color: 'rgba(var(--accent-rgb),0.3)' }} />
          </div>
          <p className="text-sm font-black tracking-widest" style={{ color: 'rgba(224,242,254,0.5)' }}>
            LOG IN TO VIEW YOUR WALLET
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-2.5 rounded-xl text-xs font-black"
            style={{
              background: 'rgba(var(--accent-rgb),0.1)',
              border: '1px solid rgba(var(--accent-rgb),0.3)',
              color: 'var(--accent)',
              letterSpacing: '0.1em',
            }}
          >
            LOG IN
          </a>
        </div>
      </div>
    )
  }

  // Bug 8 fix: show load error instead of a blank page
  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#04040d' }}>
        <p className="text-sm font-bold" style={{ color: 'rgba(255,0,110,0.7)' }}>{loadError}</p>
        <button onClick={load}
          className="text-xs font-black px-4 py-2 rounded-xl"
          style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)' }}>
          TRY AGAIN
        </button>
      </div>
    )
  }

  // ── Main ───────────────────────────────────────────────────────────────────

  const POINTS_PER_DRINK = 500

  return (
    <div style={{ background: '#04040d', minHeight: '100vh', paddingTop: 56, paddingBottom: 88 }}>
      {/* Header */}
      <div
        className="px-4 py-4 sticky top-14 z-10"
        style={{
          background: 'rgba(4,4,13,0.92)',
          borderBottom: '1px solid rgba(var(--accent-rgb),0.1)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-center gap-3">
          <Wallet size={16} style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 6px rgba(var(--accent-rgb),0.7))' }} />
          <h1
            className="text-sm font-black tracking-widest"
            style={{ color: 'var(--accent)', textShadow: '0 0 16px rgba(var(--accent-rgb),0.4)', letterSpacing: '0.2em' }}
          >
            MY WALLET
          </h1>
        </div>
      </div>

      {/* ── Top-up success banner (Stripe redirect) ────────────────────── */}
      {topUpSuccess && (
        <div
          className="mx-4 mt-4 flex items-center gap-3 p-4 rounded-2xl"
          style={{
            background: 'rgba(0,255,136,0.08)',
            border: '1px solid rgba(0,255,136,0.3)',
            boxShadow: '0 0 20px rgba(0,255,136,0.1)',
          }}
        >
          <CheckCircle size={20} style={{ color: '#00ff88', flexShrink: 0 }} />
          <div className="flex-1">
            <p className="text-xs font-black" style={{ color: '#00ff88' }}>TOP-UP SUCCESSFUL!</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(0,255,136,0.6)' }}>
              Funds added to your wallet — ready to spend at partner venues.
            </p>
          </div>
          <button onClick={() => setTopUpSuccess(false)} style={{ color: 'rgba(0,255,136,0.4)', flexShrink: 0 }}>✕</button>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

          {/* ── Balance card ─────────────────────────────────────────────── */}
          <SectionCard className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold tracking-widest mb-1" style={{ color: 'rgba(224,242,254,0.4)' }}>
                  AVAILABLE BALANCE
                </p>
                <p className="text-4xl font-black" style={{ color: '#e0f2fe', lineHeight: 1.1 }}>
                  {wallet ? formatPrice(wallet.balance, 'GBP') : '—'}
                </p>
              </div>
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}
              >
                <CreditCard size={22} style={{ color: 'var(--accent)' }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Reward points */}
              <div
                className="rounded-xl px-3 py-2.5"
                style={{ background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.15)' }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Star size={11} style={{ color: '#ffd600' }} />
                  <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(255,214,0,0.6)' }}>
                    POINTS
                  </p>
                </div>
                <p className="text-lg font-black" style={{ color: '#ffd600' }}>
                  {wallet?.rewardPoints?.toLocaleString() ?? '0'}
                </p>
              </div>

              {/* Free drinks */}
              <div
                className="rounded-xl px-3 py-2.5"
                style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)' }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Gift size={11} style={{ color: '#a855f7' }} />
                  <p className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(168,85,247,0.6)' }}>
                    FREE DRINKS
                  </p>
                </div>
                <p className="text-lg font-black" style={{ color: '#a855f7' }}>
                  {wallet?.freeDrinksAvailable ?? 0}
                </p>
              </div>
            </div>

            {wallet && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(var(--accent-rgb),0.07)' }}>
                <div className="flex justify-between text-[10px]" style={{ color: 'rgba(224,242,254,0.3)' }}>
                  <span>Lifetime spent: <span className="font-bold" style={{ color: 'rgba(224,242,254,0.55)' }}>{formatPrice(wallet.lifetimeSpent, 'GBP')}</span></span>
                  <span>Total top-ups: <span className="font-bold" style={{ color: 'rgba(224,242,254,0.55)' }}>{formatPrice(wallet.lifetimeTopUp, 'GBP')}</span></span>
                </div>
              </div>
            )}
          </SectionCard>

          {/* ── Loyalty progress bar ─────────────────────────────────────── */}
          {wallet && (
            <SectionCard className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={14} style={{ color: 'var(--accent)' }} />
                <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(224,242,254,0.6)' }}>
                  LOYALTY REWARDS
                </p>
              </div>

              {/* Progress track */}
              {(() => {
                const earned = wallet.rewardPoints % POINTS_PER_DRINK
                const pct = Math.min((earned / POINTS_PER_DRINK) * 100, 100)
                return (
                  <>
                    <div className="flex justify-between text-[10px] mb-1.5" style={{ color: 'rgba(224,242,254,0.4)' }}>
                      <span>{earned} pts</span>
                      <span>{POINTS_PER_DRINK} pts = 1 free drink</span>
                    </div>
                    <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(var(--accent-rgb),0.08)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: 'linear-gradient(90deg, var(--accent), rgba(var(--accent-rgb),0.6))',
                          boxShadow: '0 0 8px rgba(var(--accent-rgb),0.5)',
                        }}
                      />
                    </div>
                    <p className="text-[10px] mt-2" style={{ color: 'rgba(224,242,254,0.4)' }}>
                      {wallet.pointsToNextDrink > 0
                        ? <><span className="font-bold" style={{ color: 'var(--accent)' }}>{wallet.pointsToNextDrink} more points</span> to your next free drink</>
                        : <span className="font-bold" style={{ color: 'var(--accent)' }}>You have a free drink waiting! 🎉</span>
                      }
                    </p>
                  </>
                )
              })()}

              <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(var(--accent-rgb),0.06)' }}>
                <Gift size={12} style={{ color: '#a855f7' }} />
                <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.35)' }}>
                  Earned <span className="font-bold" style={{ color: '#a855f7' }}>{wallet.freeDrinksEarned}</span> free drinks total · Spend with wallet to earn 10 pts / £1
                </p>
              </div>
            </SectionCard>
          )}

          {/* ── Top-up section ────────────────────────────────────────────── */}
          <SectionCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} style={{ color: 'var(--accent)' }} />
              <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(224,242,254,0.6)' }}>
                TOP UP
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {WALLET_TOP_UP_TIERS.map(tier => (
                <button
                  key={tier.id}
                  onClick={() => setTopUpTierId(tier.id)}
                  className="rounded-xl px-3 py-3 text-left transition-all duration-150 active:scale-[0.97]"
                  style={{
                    background: 'rgba(var(--accent-rgb),0.05)',
                    border: '1px solid rgba(var(--accent-rgb),0.12)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.1)'
                    e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.3)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.05)'
                    e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.12)'
                  }}
                >
                  <p className="text-sm font-black" style={{ color: '#e0f2fe' }}>
                    £{tier.amount}
                  </p>
                  {tier.bonusPercent > 0 ? (
                    <p className="text-[9px] font-bold mt-0.5" style={{ color: 'var(--accent)' }}>
                      +{tier.bonusPercent}% bonus 🎁
                    </p>
                  ) : (
                    <p className="text-[9px] mt-0.5" style={{ color: 'rgba(224,242,254,0.25)' }}>
                      no bonus
                    </p>
                  )}
                  <p className="text-[9px] mt-1" style={{ color: 'rgba(var(--accent-rgb),0.35)' }}>
                    TAP TO PAY →
                  </p>
                </button>
              ))}
            </div>

            <p className="text-[9px] mt-3" style={{ color: 'rgba(224,242,254,0.25)' }}>
              🔒 Pay in-app via Stripe · Funds added instantly after payment
            </p>
          </SectionCard>

          {/* ── Transaction history ───────────────────────────────────────── */}
          <SectionCard className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.07)' }}>
              <ArrowDown size={14} style={{ color: 'var(--accent)' }} />
              <p className="text-[10px] font-black tracking-widest flex-1" style={{ color: 'rgba(224,242,254,0.6)' }}>
                TRANSACTIONS
              </p>
            </div>

            {transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                  style={{ background: 'rgba(var(--accent-rgb),0.05)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
                >
                  <Wallet size={22} style={{ color: 'rgba(var(--accent-rgb),0.25)' }} />
                </div>
                <p className="text-xs font-black" style={{ color: 'rgba(224,242,254,0.3)' }}>
                  No transactions yet
                </p>
                <p className="text-[10px] mt-1" style={{ color: 'rgba(224,242,254,0.2)' }}>
                  Top up your wallet to get started
                </p>
              </div>
            ) : (
              <div>
                {transactions.map((tx, i) => {
                  const positive = tx.amount > 0
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{
                        borderBottom: i < transactions.length - 1
                          ? '1px solid rgba(var(--accent-rgb),0.04)'
                          : 'none',
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: positive
                            ? 'rgba(0,255,136,0.08)'
                            : 'rgba(255,0,110,0.08)',
                          border: positive
                            ? '1px solid rgba(0,255,136,0.2)'
                            : '1px solid rgba(255,0,110,0.2)',
                        }}
                      >
                        {txIcon(tx.type)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate" style={{ color: '#e0f2fe' }}>
                          {tx.description}
                        </p>
                        <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>
                          {timeAgo(tx.createdAt)}
                          {tx.status !== 'COMPLETED' && (
                            <span className="ml-1.5 px-1 rounded text-[8px] font-bold" style={{ background: 'rgba(255,214,0,0.1)', color: '#ffd600' }}>
                              {tx.status}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p
                          className="text-xs font-black"
                          style={{ color: positive ? '#00ff88' : '#ff006e' }}
                        >
                          {positive ? '+' : ''}{formatPrice(tx.amount, 'GBP')}
                        </p>
                        <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.25)' }}>
                          bal: {formatPrice(tx.balanceAfter, 'GBP')}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </SectionCard>

        </div>
      )}

      {/* ── Payment Elements modal ─────────────────────────────────────────── */}
      <TopUpModal
        tierId={topUpTierId}
        onClose={() => setTopUpTierId(null)}
        onSuccess={handleTopUpSuccess}
      />
    </div>
  )
}
