'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { formatPrice, detectCurrency } from '@/lib/currency'
import { WALLET_TOP_UP_TIERS, CARD_DESIGNS } from '@partyradar/shared'
import {
  Wallet, CreditCard, Gift, TrendingUp,
  ArrowUp, ArrowDown, Zap, Star, CheckCircle,
  Package, ChevronDown, ChevronUp, Sparkles,
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

interface CardOrder {
  id: string
  design: string
  nameOnCard: string
  shippingAddress: string
  shippingCity: string
  shippingPostcode: string
  price: number
  status: string
  createdAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function txIcon(type: string) {
  switch (type) {
    case 'TOP_UP':          return <ArrowDown  size={14} style={{ color: '#00ff88' }} />
    case 'VENUE_SPEND':     return <ArrowUp    size={14} style={{ color: '#ff006e' }} />
    case 'TICKET_PURCHASE': return <ArrowUp    size={14} style={{ color: '#ff006e' }} />
    case 'CARD_ORDER':      return <CreditCard size={14} style={{ color: '#ff006e' }} />
    case 'DRINK_REWARD':    return <Gift       size={14} style={{ color: '#ffd600' }} />
    case 'REFERRAL_CREDIT': return <TrendingUp size={14} style={{ color: '#00ff88' }} />
    case 'BONUS':           return <Star       size={14} style={{ color: '#ffd600' }} />
    case 'WITHDRAWAL':      return <ArrowUp    size={14} style={{ color: '#3b82f6' }} />
    default:                return <Zap        size={14} style={{ color: 'rgba(224,242,254,0.4)' }} />
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

const CARD_VISUALS: Record<string, { gradient: string; emoji: string; accent: string }> = {
  CLASSIC_BLACK:  { gradient: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #111 100%)', emoji: '🖤', accent: '#888' },
  NEON_NIGHTS:    { gradient: 'linear-gradient(135deg, #0a0a1a 0%, #1a0533 50%, #0d1a0a 100%)', emoji: '🌃', accent: '#ff006e' },
  GOLD_VIP:       { gradient: 'linear-gradient(135deg, #2a1a00 0%, #b8860b 50%, #ffd700 100%)', emoji: '👑', accent: '#ffd700' },
  HOLOGRAPHIC:    { gradient: 'linear-gradient(135deg, #1a0533 0%, #003366 33%, #004d00 66%, #330033 100%)', emoji: '✨', accent: '#a855f7' },
  CUSTOM:         { gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', emoji: '🎨', accent: 'var(--accent)' },
}

const CARD_STATUS_COLORS: Record<string, string> = {
  PENDING:    '#ffd600',
  PROCESSING: 'var(--accent)',
  SHIPPED:    '#3b82f6',
  DELIVERED:  '#00ff88',
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

  const [wallet, setWallet]             = useState<WalletData | null>(null)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [loading, setLoading]           = useState(true)
  const [loadError, setLoadError]       = useState<string | null>(null)
  const [topUpTierId, setTopUpTierId]   = useState<string | null>(null)
  const [topUpSuccess, setTopUpSuccess] = useState(false)

  // Card ordering state
  const [cardOrders, setCardOrders]         = useState<CardOrder[]>([])
  const [showCardOrder, setShowCardOrder]   = useState(false)
  const [selectedDesign, setSelectedDesign] = useState<string>('CLASSIC_BLACK')
  const [nameOnCard, setNameOnCard]         = useState('')
  const [shipAddr, setShipAddr]             = useState('')
  const [shipCity, setShipCity]             = useState('')
  const [shipPost, setShipPost]             = useState('')
  const [customImageUrl, setCustomImageUrl] = useState('')
  const [cardPayWallet, setCardPayWallet]   = useState(false)
  const [cardOrdering, setCardOrdering]     = useState(false)
  const [cardOrderError, setCardOrderError] = useState<string | null>(null)
  const [cardOrderSuccess, setCardOrderSuccess] = useState(false)

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
      // Load card orders in parallel
      const cardsRes = await api.get<{ data: { orders: CardOrder[] } }>('/wallet/cards')
      if (cardsRes?.data?.orders) setCardOrders(cardsRes.data.orders)
    } catch {
      setLoadError('Failed to load wallet — please try again')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!dbUser) return
    // Seed name on card from user display name
    if (dbUser.displayName) setNameOnCard(dbUser.displayName.toUpperCase().slice(0, 30))
    load()

    if (new URLSearchParams(window.location.search).get('success') === 'true') {
      setTopUpSuccess(true)
      window.history.replaceState({}, '', '/wallet')
      const t = setTimeout(() => setTopUpSuccess(false), 6000)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbUser])

  function handleTopUpSuccess() {
    setTopUpTierId(null)
    setTopUpSuccess(true)
    const t = setTimeout(() => setTopUpSuccess(false), 6000)
    load()
    return () => clearTimeout(t)
  }

  async function submitCardOrder() {
    if (!nameOnCard.trim() || !shipAddr.trim() || !shipCity.trim() || !shipPost.trim()) {
      setCardOrderError('Please fill in all shipping details')
      return
    }
    if (selectedDesign === 'CUSTOM' && !customImageUrl.trim()) {
      setCardOrderError('Please enter an image URL for your custom design')
      return
    }
    setCardOrdering(true)
    setCardOrderError(null)
    try {
      const res = await api.post<{ data: { order?: CardOrder; url?: string; paidWith?: string } }>('/wallet/order-card', {
        design: selectedDesign,
        nameOnCard: nameOnCard.trim(),
        shippingAddress: shipAddr.trim(),
        shippingCity: shipCity.trim(),
        shippingPostcode: shipPost.trim(),
        customImageUrl: selectedDesign === 'CUSTOM' ? customImageUrl.trim() : undefined,
        payWithWallet: cardPayWallet,
      })
      if (res?.data?.url) {
        // Stripe redirect
        window.location.href = res.data.url
      } else if (res?.data?.order) {
        // Paid with wallet
        setCardOrderSuccess(true)
        setShowCardOrder(false)
        load()
        setTimeout(() => setCardOrderSuccess(false), 6000)
      }
    } catch (err: unknown) {
      setCardOrderError((err as { message?: string })?.message ?? 'Order failed — please try again')
    } finally {
      setCardOrdering(false)
    }
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

  const currency = detectCurrency()
  const POINTS_PER_DRINK = 500
  const selectedDesignData = CARD_DESIGNS.find(d => d.id === selectedDesign)

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

      {/* ── Top-up success banner ──────────────────────────────────────────── */}
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

      {/* ── Card order success banner ──────────────────────────────────────── */}
      {cardOrderSuccess && (
        <div
          className="mx-4 mt-4 flex items-center gap-3 p-4 rounded-2xl"
          style={{
            background: 'rgba(168,85,247,0.08)',
            border: '1px solid rgba(168,85,247,0.3)',
            boxShadow: '0 0 20px rgba(168,85,247,0.1)',
          }}
        >
          <CheckCircle size={20} style={{ color: '#a855f7', flexShrink: 0 }} />
          <div className="flex-1">
            <p className="text-xs font-black" style={{ color: '#a855f7' }}>CARD ORDER PLACED! 🎉</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(168,85,247,0.6)' }}>
              Your PartyRadar card is being prepared. We'll notify you when it ships.
            </p>
          </div>
          <button onClick={() => setCardOrderSuccess(false)} style={{ color: 'rgba(168,85,247,0.4)', flexShrink: 0 }}>✕</button>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

          {/* ── Balance card ─────────────────────────────────────────────── */}
          <SectionCard className="p-5">
            <div className="flex items-start justify-between mb-4 gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-widest mb-1" style={{ color: 'rgba(224,242,254,0.4)' }}>
                  AVAILABLE BALANCE
                </p>
                <p className="text-4xl font-black truncate" style={{ color: '#e0f2fe', lineHeight: 1.1 }}>
                  {wallet ? formatPrice(wallet.balance, currency) : '—'}
                </p>
              </div>
              <button
                onClick={() => setTopUpTierId('MEDIUM')}
                className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 font-black text-[11px] tracking-widest transition-all duration-150 active:scale-[0.96] shrink-0"
                style={{
                  background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.22), rgba(var(--accent-rgb),0.12))',
                  border: '1px solid rgba(var(--accent-rgb),0.4)',
                  color: 'var(--accent)',
                  boxShadow: '0 0 14px rgba(var(--accent-rgb),0.18)',
                }}
              >
                <CreditCard size={14} />
                TOP UP
              </button>
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
                  <span>Lifetime spent: <span className="font-bold" style={{ color: 'rgba(224,242,254,0.55)' }}>{formatPrice(wallet.lifetimeSpent, currency)}</span></span>
                  <span>Total top-ups: <span className="font-bold" style={{ color: 'rgba(224,242,254,0.55)' }}>{formatPrice(wallet.lifetimeTopUp, currency)}</span></span>
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

              {/* Monthly loyalty bonus callout */}
              <div
                className="flex items-center gap-2 mt-3 pt-3 rounded-xl px-3 py-2.5"
                style={{ background: 'rgba(255,214,0,0.05)', border: '1px solid rgba(255,214,0,0.12)' }}
              >
                <Sparkles size={12} style={{ color: '#ffd600', flexShrink: 0 }} />
                <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>
                  <span className="font-black" style={{ color: '#ffd600' }}>2.5% monthly bonus</span> credited on the 1st of every month on balances over £1 (up to £50)
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

          {/* ── PartyRadar Physical Card ──────────────────────────────────── */}
          <SectionCard className="overflow-hidden">
            {/* Section header */}
            <button
              className="w-full flex items-center gap-2 px-4 py-3.5 transition-colors"
              style={{ borderBottom: showCardOrder ? '1px solid rgba(var(--accent-rgb),0.07)' : 'none' }}
              onClick={() => setShowCardOrder(v => !v)}
            >
              <CreditCard size={14} style={{ color: '#a855f7' }} />
              <p className="text-[10px] font-black tracking-widest flex-1 text-left" style={{ color: 'rgba(224,242,254,0.6)' }}>
                PARTYRADAR CARD
              </p>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}>
                from £9.99
              </span>
              {showCardOrder
                ? <ChevronUp size={14} style={{ color: 'rgba(224,242,254,0.3)' }} />
                : <ChevronDown size={14} style={{ color: 'rgba(224,242,254,0.3)' }} />
              }
            </button>

            {/* Existing orders */}
            {cardOrders.length > 0 && !showCardOrder && (
              <div className="px-4 pb-3">
                {cardOrders.map(order => {
                  const vis = CARD_VISUALS[order.design] ?? CARD_VISUALS['CLASSIC_BLACK']!
                  const statusColor = CARD_STATUS_COLORS[order.status] ?? 'rgba(224,242,254,0.4)'
                  return (
                    <div
                      key={order.id}
                      className="flex items-center gap-3 py-2.5"
                      style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.04)' }}
                    >
                      <div
                        className="w-10 h-7 rounded-lg flex items-center justify-center text-[14px] shrink-0"
                        style={{ background: vis.gradient, border: `1px solid ${vis.accent}33` }}
                      >
                        {vis.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold truncate" style={{ color: '#e0f2fe' }}>
                          {CARD_DESIGNS.find(d => d.id === order.design)?.name ?? order.design}
                        </p>
                        <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>
                          {order.nameOnCard} · {timeAgo(order.createdAt)}
                        </p>
                      </div>
                      <span
                        className="text-[8px] font-black tracking-wider px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}33` }}
                      >
                        {order.status}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Order form */}
            {showCardOrder && (
              <div className="p-4 space-y-4">
                {/* Intro blurb */}
                <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>
                  Order your physical PartyRadar card — use it to pay at partner venues, earn points, and flex your membership. Money stays in the ecosystem.
                </p>

                {/* Design picker */}
                <div>
                  <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: 'rgba(224,242,254,0.4)' }}>
                    CHOOSE DESIGN
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {CARD_DESIGNS.map(design => {
                      const vis = CARD_VISUALS[design.id] ?? CARD_VISUALS['CLASSIC_BLACK']!
                      const isSelected = selectedDesign === design.id
                      return (
                        <button
                          key={design.id}
                          onClick={() => setSelectedDesign(design.id)}
                          className="rounded-xl overflow-hidden transition-all duration-150 active:scale-[0.97]"
                          style={{
                            border: isSelected ? `2px solid ${vis.accent}` : '2px solid transparent',
                            boxShadow: isSelected ? `0 0 12px ${vis.accent}44` : 'none',
                            outline: 'none',
                          }}
                        >
                          {/* Mini card preview */}
                          <div
                            className="h-16 flex flex-col justify-between p-2 relative overflow-hidden"
                            style={{ background: vis.gradient }}
                          >
                            <div className="flex justify-between items-start">
                              <span className="text-[16px]">{vis.emoji}</span>
                              {isSelected && (
                                <CheckCircle size={12} style={{ color: vis.accent }} />
                              )}
                            </div>
                            <div>
                              <p className="text-[8px] font-black truncate" style={{ color: 'rgba(255,255,255,0.9)', letterSpacing: '0.05em' }}>
                                {design.name.toUpperCase()}
                              </p>
                              <p className="text-[8px] font-bold" style={{ color: vis.accent }}>
                                £{design.price.toFixed(2)}
                              </p>
                            </div>
                          </div>
                          <div
                            className="px-2 py-1.5 text-[9px]"
                            style={{
                              background: isSelected ? `${vis.accent}18` : 'rgba(255,255,255,0.03)',
                              color: isSelected ? vis.accent : 'rgba(224,242,254,0.35)',
                            }}
                          >
                            {design.description}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Custom image URL (only for CUSTOM design) */}
                {selectedDesign === 'CUSTOM' && (
                  <div>
                    <p className="text-[9px] font-black tracking-widest mb-1.5" style={{ color: 'rgba(224,242,254,0.4)' }}>
                      ARTWORK URL
                    </p>
                    <input
                      type="url"
                      value={customImageUrl}
                      onChange={e => setCustomImageUrl(e.target.value)}
                      placeholder="https://your-image.com/artwork.png"
                      className="w-full rounded-xl px-3 py-2.5 text-xs font-medium outline-none"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(var(--accent-rgb),0.2)',
                        color: '#e0f2fe',
                      }}
                    />
                    <p className="text-[9px] mt-1" style={{ color: 'rgba(224,242,254,0.25)' }}>
                      Provide a direct image URL (PNG/JPG, min 1500×940px recommended)
                    </p>
                  </div>
                )}

                {/* Name on card */}
                <div>
                  <p className="text-[9px] font-black tracking-widest mb-1.5" style={{ color: 'rgba(224,242,254,0.4)' }}>
                    NAME ON CARD
                  </p>
                  <input
                    type="text"
                    value={nameOnCard}
                    onChange={e => setNameOnCard(e.target.value.toUpperCase().slice(0, 30))}
                    placeholder="YOUR NAME"
                    className="w-full rounded-xl px-3 py-2.5 text-xs font-black tracking-widest outline-none"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(var(--accent-rgb),0.2)',
                      color: '#e0f2fe',
                    }}
                  />
                </div>

                {/* Shipping details */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black tracking-widest" style={{ color: 'rgba(224,242,254,0.4)' }}>
                    SHIPPING ADDRESS
                  </p>
                  <input
                    type="text"
                    value={shipAddr}
                    onChange={e => setShipAddr(e.target.value)}
                    placeholder="Street address"
                    className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(var(--accent-rgb),0.15)',
                      color: '#e0f2fe',
                    }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={shipCity}
                      onChange={e => setShipCity(e.target.value)}
                      placeholder="City"
                      className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(var(--accent-rgb),0.15)',
                        color: '#e0f2fe',
                      }}
                    />
                    <input
                      type="text"
                      value={shipPost}
                      onChange={e => setShipPost(e.target.value.toUpperCase())}
                      placeholder="Postcode"
                      className="w-full rounded-xl px-3 py-2.5 text-xs outline-none"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(var(--accent-rgb),0.15)',
                        color: '#e0f2fe',
                      }}
                    />
                  </div>
                </div>

                {/* Payment method toggle */}
                <div
                  className="rounded-xl p-3 flex items-center gap-3"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
                >
                  <div className="flex-1">
                    <p className="text-[10px] font-bold" style={{ color: '#e0f2fe' }}>Pay with wallet balance</p>
                    <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.35)' }}>
                      Balance: <span style={{ color: wallet && wallet.balance >= (selectedDesignData?.price ?? 9.99) ? '#00ff88' : '#ff006e' }}>
                        {wallet ? formatPrice(wallet.balance, currency) : '—'}
                      </span>
                      {wallet && wallet.balance < (selectedDesignData?.price ?? 9.99) && ' (insufficient)'}
                    </p>
                  </div>
                  <button
                    onClick={() => setCardPayWallet(v => !v)}
                    disabled={!wallet || wallet.balance < (selectedDesignData?.price ?? 9.99)}
                    className="relative w-10 h-5 rounded-full transition-all duration-200 shrink-0"
                    style={{
                      background: cardPayWallet ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                      opacity: (!wallet || wallet.balance < (selectedDesignData?.price ?? 9.99)) ? 0.4 : 1,
                    }}
                  >
                    <div
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200"
                      style={{ left: cardPayWallet ? '22px' : '2px' }}
                    />
                  </button>
                </div>

                {/* Error */}
                {cardOrderError && (
                  <p className="text-[10px] font-bold text-center" style={{ color: '#ff006e' }}>
                    {cardOrderError}
                  </p>
                )}

                {/* Order summary + CTA */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>
                    <span>{selectedDesignData?.name ?? 'Card'}</span>
                    <span className="font-bold" style={{ color: '#e0f2fe' }}>£{selectedDesignData?.price?.toFixed(2) ?? '—'}</span>
                  </div>
                  <div className="flex justify-between text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>
                    <span>Shipping</span>
                    <span className="font-bold" style={{ color: '#00ff88' }}>FREE</span>
                  </div>
                  <div className="flex justify-between text-[10px] pt-1" style={{ borderTop: '1px solid rgba(var(--accent-rgb),0.06)', color: 'rgba(224,242,254,0.6)' }}>
                    <span className="font-black">TOTAL</span>
                    <span className="font-black" style={{ color: '#e0f2fe' }}>£{selectedDesignData?.price?.toFixed(2) ?? '—'}</span>
                  </div>
                </div>

                <button
                  onClick={submitCardOrder}
                  disabled={cardOrdering}
                  className="w-full py-3 rounded-xl text-xs font-black tracking-widest transition-all duration-150 active:scale-[0.97]"
                  style={{
                    background: cardOrdering
                      ? 'rgba(168,85,247,0.1)'
                      : 'linear-gradient(135deg, rgba(168,85,247,0.3), rgba(168,85,247,0.15))',
                    border: '1px solid rgba(168,85,247,0.4)',
                    color: '#a855f7',
                    boxShadow: cardOrdering ? 'none' : '0 0 20px rgba(168,85,247,0.15)',
                  }}
                >
                  {cardOrdering
                    ? 'PROCESSING…'
                    : cardPayWallet
                      ? `ORDER WITH WALLET (£${selectedDesignData?.price?.toFixed(2) ?? '—'})`
                      : `ORDER WITH CARD (£${selectedDesignData?.price?.toFixed(2) ?? '—'})`
                  }
                </button>

                <p className="text-[9px] text-center" style={{ color: 'rgba(224,242,254,0.2)' }}>
                  🚚 Free shipping UK-wide · Allow 5–10 business days
                </p>
              </div>
            )}

            {/* Existing orders (when form is open) */}
            {showCardOrder && cardOrders.length > 0 && (
              <div className="px-4 pb-4">
                <p className="text-[9px] font-black tracking-widest mb-2" style={{ color: 'rgba(224,242,254,0.3)' }}>
                  YOUR ORDERS
                </p>
                {cardOrders.map(order => {
                  const vis = CARD_VISUALS[order.design] ?? CARD_VISUALS['CLASSIC_BLACK']!
                  const statusColor = CARD_STATUS_COLORS[order.status] ?? 'rgba(224,242,254,0.4)'
                  return (
                    <div
                      key={order.id}
                      className="flex items-center gap-3 py-2.5"
                      style={{ borderTop: '1px solid rgba(var(--accent-rgb),0.06)' }}
                    >
                      <div
                        className="w-10 h-7 rounded-lg flex items-center justify-center text-[14px] shrink-0"
                        style={{ background: vis.gradient, border: `1px solid ${vis.accent}33` }}
                      >
                        {vis.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold truncate" style={{ color: '#e0f2fe' }}>
                          {CARD_DESIGNS.find(d => d.id === order.design)?.name ?? order.design}
                        </p>
                        <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>
                          {order.nameOnCard} · {timeAgo(order.createdAt)}
                        </p>
                      </div>
                      <span
                        className="text-[8px] font-black tracking-wider px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}33` }}
                      >
                        {order.status}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Empty state when no orders */}
            {cardOrders.length === 0 && !showCardOrder && (
              <div className="flex items-center gap-3 px-4 pb-4">
                <Package size={16} style={{ color: 'rgba(168,85,247,0.35)' }} />
                <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.3)' }}>
                  No cards ordered yet · Tap above to order yours
                </p>
              </div>
            )}
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
