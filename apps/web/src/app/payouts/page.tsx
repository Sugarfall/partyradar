'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { silent, logError } from '@/lib/logError'
import { loginHref } from '@/lib/authRedirect'
import {
  CreditCard, ShieldCheck, AlertTriangle, ExternalLink,
  Loader2, CheckCircle2, ArrowRight,
} from 'lucide-react'

interface ConnectStatus {
  connected: boolean
  accountId?: string
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  requirementsDisabledReason?: string | null
}

function PayoutsInner() {
  const { dbUser, loading: authLoading } = useAuth()
  const search = useSearchParams()
  const justOnboarded = search.get('onboarded') === '1'

  const [status, setStatus] = useState<ConnectStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ data: ConnectStatus }>('/connect/status')
      setStatus(res.data)
    } catch (e) {
      logError('payouts:load-status', e)
      setError('Could not load payout status. Try again shortly.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (dbUser) loadStatus() }, [dbUser, loadStatus])

  async function startOnboarding() {
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<{ data: { url: string } }>('/connect/onboard', {})
      if (res.data?.url) window.location.href = res.data.url
    } catch (e: any) {
      setError(e?.message ?? 'Could not start Stripe onboarding')
      logError('payouts:onboard', e)
    } finally { setBusy(false) }
  }

  async function openDashboard() {
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<{ data: { url: string } }>('/connect/dashboard', {})
      if (res.data?.url) window.open(res.data.url, '_blank', 'noopener,noreferrer')
    } catch (e: any) {
      setError(e?.message ?? 'Could not open payouts dashboard')
      logError('payouts:dashboard', e)
    } finally { setBusy(false) }
  }

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (authLoading) return null
  if (!dbUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#04040d' }}>
        <div className="text-center space-y-4 px-8">
          <CreditCard size={32} style={{ color: 'rgba(var(--accent-rgb),0.3)', margin: '0 auto' }} />
          <p className="text-sm font-black tracking-widest" style={{ color: 'rgba(224,242,254,0.5)' }}>
            LOG IN TO MANAGE PAYOUTS
          </p>
          <Link
            href={loginHref('/payouts')}
            className="inline-block px-6 py-2.5 rounded-xl text-xs font-black"
            style={{
              background: 'rgba(var(--accent-rgb),0.1)',
              border: '1px solid rgba(var(--accent-rgb),0.3)',
              color: 'var(--accent)',
              letterSpacing: '0.1em',
            }}
          >
            LOG IN
          </Link>
        </div>
      </div>
    )
  }

  const ready = status?.connected && status.chargesEnabled
  const partial = status?.connected && !status.chargesEnabled && status.detailsSubmitted

  return (
    <div className="min-h-screen pt-14 pb-24" style={{ background: '#04040d' }}>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.3)' }}>
            <CreditCard size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-widest" style={{ color: 'var(--accent)', letterSpacing: '0.15em' }}>
              HOST PAYOUTS
            </h1>
            <p className="text-xs" style={{ color: 'rgba(224,242,254,0.5)' }}>
              Receive ticket revenue via Stripe
            </p>
          </div>
        </div>

        {/* Just-onboarded confirmation banner */}
        {justOnboarded && (
          <div className="rounded-xl p-3 flex items-start gap-3"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
            <CheckCircle2 size={16} style={{ color: '#22c55e' }} className="shrink-0 mt-0.5" />
            <p className="text-xs" style={{ color: 'rgba(224,242,254,0.8)' }}>
              Thanks! Stripe is verifying your details — the status below will update shortly.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl p-3 flex items-start gap-3"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertTriangle size={16} style={{ color: '#ef4444' }} className="shrink-0 mt-0.5" />
            <p className="text-xs" style={{ color: 'rgba(254,202,202,0.9)' }}>{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin" size={24} style={{ color: 'var(--accent)' }} />
          </div>
        ) : (
          <>
            {/* Status card */}
            <div className="rounded-2xl p-5 space-y-4"
              style={{ background: 'rgba(24,24,27,0.85)', border: '1px solid rgba(var(--accent-rgb),0.12)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(224,242,254,0.4)', letterSpacing: '0.2em' }}>
                    CONNECTION STATUS
                  </p>
                  <p className="text-sm font-black mt-1" style={{ color: ready ? '#22c55e' : partial ? '#f59e0b' : '#ef4444' }}>
                    {ready ? 'READY TO ACCEPT TICKETS' : partial ? 'VERIFICATION PENDING' : 'NOT CONNECTED'}
                  </p>
                </div>
                <ShieldCheck size={24} style={{ color: ready ? '#22c55e' : 'rgba(224,242,254,0.2)' }} />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2">
                <StatusPill label="Details" ok={status?.detailsSubmitted} />
                <StatusPill label="Charges" ok={status?.chargesEnabled} />
                <StatusPill label="Payouts" ok={status?.payoutsEnabled} />
              </div>

              {status?.requirementsDisabledReason && (
                <p className="text-[10px]" style={{ color: 'rgba(245,158,11,0.9)' }}>
                  Stripe reason: {status.requirementsDisabledReason}
                </p>
              )}
            </div>

            {/* Action */}
            {!ready ? (
              <button
                onClick={startOnboarding}
                disabled={busy}
                className="w-full rounded-2xl px-5 py-4 font-black text-sm tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.2), rgba(61,90,254,0.15))',
                  border: '1px solid rgba(var(--accent-rgb),0.5)',
                  color: 'var(--accent)',
                  letterSpacing: '0.15em',
                }}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <>
                  {partial || status?.connected ? 'CONTINUE ONBOARDING' : 'CONNECT WITH STRIPE'}
                  <ArrowRight size={16} />
                </>}
              </button>
            ) : (
              <button
                onClick={openDashboard}
                disabled={busy}
                className="w-full rounded-2xl px-5 py-4 font-black text-sm tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                style={{
                  background: 'rgba(34,197,94,0.12)',
                  border: '1px solid rgba(34,197,94,0.4)',
                  color: '#22c55e',
                  letterSpacing: '0.15em',
                }}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <>
                  OPEN PAYOUTS DASHBOARD
                  <ExternalLink size={14} />
                </>}
              </button>
            )}

            {/* Explainer */}
            <div className="space-y-2 pt-2">
              <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(224,242,254,0.4)', letterSpacing: '0.2em' }}>
                HOW IT WORKS
              </p>
              <ul className="space-y-2 text-xs" style={{ color: 'rgba(224,242,254,0.65)' }}>
                <li>• Stripe handles KYC, tax forms, and bank transfers on your behalf.</li>
                <li>• Ticket revenue lands in your Stripe account within 2&ndash;7 days of the sale.</li>
                <li>• PartyRadar takes a {process.env['NEXT_PUBLIC_PLATFORM_FEE_PERCENT'] ?? '5'}% platform fee at checkout. The rest is yours.</li>
                <li>• You can pause, view payout history, and update banking info via the Stripe dashboard above.</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatusPill({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <div className="rounded-xl py-2 text-center"
      style={{
        background: ok ? 'rgba(34,197,94,0.08)' : 'rgba(24,24,27,0.8)',
        border: `1px solid ${ok ? 'rgba(34,197,94,0.25)' : 'rgba(var(--accent-rgb),0.08)'}`,
      }}>
      <p className="text-[9px] font-black tracking-widest" style={{ color: 'rgba(224,242,254,0.4)' }}>
        {label.toUpperCase()}
      </p>
      <p className="text-xs font-black mt-0.5" style={{ color: ok ? '#22c55e' : 'rgba(224,242,254,0.3)' }}>
        {ok ? '✓' : '—'}
      </p>
    </div>
  )
}

export default function PayoutsPage() {
  return (
    <Suspense fallback={null}>
      <PayoutsInner />
    </Suspense>
  )
}
