'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { WALLET_TOP_UP_TIERS } from '@partyradar/shared'
import { formatPrice } from '@/lib/currency'
import { X, CreditCard, Zap, ExternalLink } from 'lucide-react'

// ─── Main modal ───────────────────────────────────────────────────────────────
// Uses Stripe Checkout redirect — avoids all client-side Stripe.js key
// configuration issues. Stripe hosts the payment page; we just redirect to it.

interface TopUpModalProps {
  tierId: string | null
  onClose: () => void
  onSuccess: () => void
}

export function TopUpModal({ tierId, onClose, onSuccess }: TopUpModalProps) {
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const tier = tierId ? WALLET_TOP_UP_TIERS.find((t) => t.id === tierId) : null

  if (!tierId || !tier) return null

  const bonusAmount = Number((tier.amount * tier.bonusPercent / 100).toFixed(2))
  const totalCredit = tier.amount + bonusAmount

  async function handlePay() {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await api.post<{ data: { url: string } }>('/wallet/top-up', { tierId })
      if (res?.data?.url) {
        window.location.href = res.data.url   // redirect to Stripe Checkout
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (err: unknown) {
      setFetchError((err as { message?: string })?.message ?? 'Failed to start payment')
      setLoading(false)
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(4,4,13,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Sheet */}
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: '#0d0d1a',
          border: '1px solid rgba(0,200,255,0.12)',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(0,200,255,0.06)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(0,200,255,0.08)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)' }}
            >
              <CreditCard size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <p className="text-xs font-black tracking-widest" style={{ color: 'var(--accent)', letterSpacing: '0.15em' }}>
                TOP UP WALLET
              </p>
              <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.35)' }}>{tier.label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(224,242,254,0.4)' }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {/* Amount summary */}
          <div
            className="flex items-center justify-between px-4 py-3 rounded-xl"
            style={{ background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.12)' }}
          >
            <div>
              <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(224,242,254,0.35)' }}>YOU PAY</p>
              <p className="text-2xl font-black" style={{ color: '#e0f2fe' }}>{formatPrice(tier.amount)}</p>
            </div>
            {tier.bonusPercent > 0 && (
              <div className="text-right">
                <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(0,200,255,0.5)' }}>WALLET CREDIT</p>
                <p className="text-2xl font-black" style={{ color: 'var(--accent)' }}>{formatPrice(totalCredit)}</p>
                <p className="text-[9px] font-bold" style={{ color: 'var(--accent)' }}>+{tier.bonusPercent}% bonus 🎁</p>
              </div>
            )}
          </div>

          {fetchError && (
            <p className="text-xs font-bold text-center" style={{ color: '#ff006e' }}>{fetchError}</p>
          )}

          {/* Pay button — opens Stripe Checkout */}
          <button
            onClick={handlePay}
            disabled={loading}
            className="w-full py-3.5 rounded-xl text-sm font-black tracking-widest transition-all duration-200 disabled:opacity-60 flex items-center justify-center gap-2"
            style={{
              background: loading
                ? 'rgba(0,200,255,0.06)'
                : 'linear-gradient(135deg, rgba(0,200,255,0.2) 0%, rgba(0,200,255,0.1) 100%)',
              border: '1px solid rgba(0,200,255,0.4)',
              color: 'var(--accent)',
              boxShadow: loading ? 'none' : '0 0 20px rgba(0,200,255,0.15)',
              letterSpacing: '0.15em',
            }}
          >
            {loading ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: 'rgba(0,200,255,0.3)', borderTopColor: 'var(--accent)' }} />
                PREPARING…
              </>
            ) : (
              <>
                <ExternalLink size={14} />
                PAY {formatPrice(tier.amount)} SECURELY
              </>
            )}
          </button>

          <p className="text-center text-[9px]" style={{ color: 'rgba(224,242,254,0.2)' }}>
            🔒 You'll be taken to Stripe's secure checkout · Returns here automatically
          </p>
        </div>

        {/* Reward points reminder */}
        <div
          className="mx-5 mb-5 flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(255,214,0,0.05)', border: '1px solid rgba(255,214,0,0.1)' }}
        >
          <Zap size={11} style={{ color: '#ffd600', flexShrink: 0 }} />
          <p className="text-[10px]" style={{ color: 'rgba(255,214,0,0.55)' }}>
            Spend at partner venues to earn <strong style={{ color: '#ffd600' }}>10 pts / £1</strong> — 500 pts = free drink 🍹
          </p>
        </div>
      </div>
    </div>
  )
}
