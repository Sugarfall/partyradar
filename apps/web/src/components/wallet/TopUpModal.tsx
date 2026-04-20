'use client'

import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { api } from '@/lib/api'
import { WALLET_TOP_UP_TIERS } from '@partyradar/shared'
import { X, CreditCard, Zap, CheckCircle } from 'lucide-react'

// ─── Stripe singleton (module-scoped, never recreated) ────────────────────────

const stripePromise = loadStripe(
  process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'] ?? ''
)

// ─── Stripe Elements appearance (dark theme) ─────────────────────────────────

const STRIPE_APPEARANCE = {
  theme: 'night' as const,
  variables: {
    colorPrimary: '#00c8ff',
    colorBackground: '#0d0d1a',
    colorText: '#e0f2fe',
    colorDanger: '#ff006e',
    fontFamily: '"Inter", system-ui, sans-serif',
    borderRadius: '10px',
    fontSizeBase: '14px',
  },
  rules: {
    '.Input': {
      border: '1px solid rgba(0,200,255,0.15)',
      boxShadow: 'none',
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    '.Input:focus': {
      border: '1px solid rgba(0,200,255,0.45)',
      boxShadow: '0 0 0 2px rgba(0,200,255,0.08)',
    },
    '.Label': {
      color: 'rgba(224,242,254,0.5)',
      fontSize: '11px',
      fontWeight: '700',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
    },
    '.Error': {
      color: '#ff006e',
      fontSize: '12px',
    },
  },
}

// ─── Inner form (needs stripe/elements context) ───────────────────────────────

interface PayFormProps {
  amount: number
  bonusPercent: number
  totalCredit: number
  onSuccess: () => void
  onClose: () => void
}

function PayForm({ amount, bonusPercent, totalCredit, onSuccess, onClose }: PayFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [succeeded, setSucceeded] = useState(false)

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements || paying) return

    setPaying(true)
    setError(null)

    const { error: submitErr } = await elements.submit()
    if (submitErr) {
      setError(submitErr.message ?? 'Payment failed')
      setPaying(false)
      return
    }

    const { error: confirmErr } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Return URL is only used as fallback for redirect-based methods (bank transfer etc.)
        // Card payments complete in-page without a redirect.
        return_url: `${window.location.origin}/wallet?success=true`,
      },
      redirect: 'if_required',
    })

    if (confirmErr) {
      setError(confirmErr.message ?? 'Payment failed')
      setPaying(false)
      return
    }

    // Payment succeeded in-page (no redirect needed for cards)
    setSucceeded(true)
    setTimeout(() => {
      onSuccess()
      onClose()
    }, 1800)
  }

  if (succeeded) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)' }}
        >
          <CheckCircle size={32} style={{ color: '#00ff88' }} />
        </div>
        <div className="text-center">
          <p className="text-base font-black" style={{ color: '#00ff88' }}>Payment successful!</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(224,242,254,0.4)' }}>
            £{totalCredit.toFixed(2)} added to your wallet
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handlePay} className="space-y-5">
      {/* Amount summary */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.12)' }}
      >
        <div>
          <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(224,242,254,0.35)' }}>
            YOU PAY
          </p>
          <p className="text-2xl font-black" style={{ color: '#e0f2fe' }}>£{amount.toFixed(2)}</p>
        </div>
        {bonusPercent > 0 && (
          <div className="text-right">
            <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(0,200,255,0.5)' }}>
              WALLET CREDIT
            </p>
            <p className="text-2xl font-black" style={{ color: 'var(--accent)' }}>
              £{totalCredit.toFixed(2)}
            </p>
            <p className="text-[9px] font-bold" style={{ color: 'var(--accent)' }}>
              +{bonusPercent}% bonus 🎁
            </p>
          </div>
        )}
      </div>

      {/* Stripe Payment Element */}
      <PaymentElement
        options={{
          layout: 'tabs',
          defaultValues: { billingDetails: { address: { country: 'GB' } } },
        }}
      />

      {/* Error */}
      {error && (
        <p className="text-xs font-bold text-center" style={{ color: '#ff006e' }}>{error}</p>
      )}

      {/* Pay button */}
      <button
        type="submit"
        disabled={!stripe || !elements || paying}
        className="w-full py-3.5 rounded-xl text-sm font-black tracking-widest transition-all duration-200 disabled:opacity-50"
        style={{
          background: paying
            ? 'rgba(0,200,255,0.08)'
            : 'linear-gradient(135deg, rgba(0,200,255,0.2) 0%, rgba(0,200,255,0.1) 100%)',
          border: '1px solid rgba(0,200,255,0.4)',
          color: 'var(--accent)',
          boxShadow: paying ? 'none' : '0 0 20px rgba(0,200,255,0.15)',
          letterSpacing: '0.15em',
        }}
      >
        {paying ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'rgba(0,200,255,0.3)', borderTopColor: 'var(--accent)' }} />
            PROCESSING…
          </span>
        ) : (
          `PAY £${amount.toFixed(2)}`
        )}
      </button>

      <p className="text-center text-[9px]" style={{ color: 'rgba(224,242,254,0.2)' }}>
        🔒 Secured by Stripe · PCI-DSS compliant
      </p>
    </form>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface TopUpModalProps {
  tierId: string | null
  onClose: () => void
  onSuccess: () => void
}

export function TopUpModal({ tierId, onClose, onSuccess }: TopUpModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [intentData, setIntentData] = useState<{
    amount: number
    bonusPercent: number
    totalCredit: number
  } | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const tier = tierId ? WALLET_TOP_UP_TIERS.find((t) => t.id === tierId) : null

  // Create PaymentIntent when modal opens
  useEffect(() => {
    if (!tierId) return
    setClientSecret(null)
    setIntentData(null)
    setFetchError(null)

    api.post<{ data: { clientSecret: string; amount: number; bonusPercent: number; totalCredit: number } }>(
      '/wallet/payment-intent',
      { tierId },
    )
      .then((res) => {
        if (res?.data) {
          setClientSecret(res.data.clientSecret)
          setIntentData({
            amount: res.data.amount,
            bonusPercent: res.data.bonusPercent,
            totalCredit: res.data.totalCredit,
          })
        }
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to start payment')
      })
  }, [tierId])

  if (!tierId) return null

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
          maxHeight: '90vh',
          overflowY: 'auto',
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
              {tier && (
                <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.35)' }}>
                  {tier.label}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(224,242,254,0.4)' }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {fetchError ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm font-bold" style={{ color: '#ff006e' }}>{fetchError}</p>
              <button
                onClick={() => {
                  setFetchError(null)
                  // Retrigger by toggling tierId — parent will need to handle; just close for now
                  onClose()
                }}
                className="px-4 py-2 rounded-xl text-xs font-black"
                style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}
              >
                CLOSE
              </button>
            </div>
          ) : !clientSecret || !intentData ? (
            /* Loading PaymentIntent */
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div
                className="w-10 h-10 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(0,200,255,0.1)', borderTopColor: 'var(--accent)' }}
              />
              <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(0,200,255,0.4)' }}>
                PREPARING PAYMENT…
              </p>
            </div>
          ) : (
            <Elements
              stripe={stripePromise}
              options={{ clientSecret, appearance: STRIPE_APPEARANCE }}
            >
              <PayForm
                amount={intentData.amount}
                bonusPercent={intentData.bonusPercent}
                totalCredit={intentData.totalCredit}
                onSuccess={onSuccess}
                onClose={onClose}
              />
            </Elements>
          )}
        </div>

        {/* Reward points reminder */}
        {intentData && !fetchError && (
          <div
            className="mx-5 mb-5 flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,214,0,0.05)', border: '1px solid rgba(255,214,0,0.1)' }}
          >
            <Zap size={11} style={{ color: '#ffd600', flexShrink: 0 }} />
            <p className="text-[10px]" style={{ color: 'rgba(255,214,0,0.55)' }}>
              Spend at partner venues to earn <strong style={{ color: '#ffd600' }}>10 pts / £1</strong> — 500 pts = free drink 🍹
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
