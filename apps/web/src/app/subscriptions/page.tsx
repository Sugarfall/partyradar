'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, Zap, Crown } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { checkoutSubscription, openBillingPortal } from '@/hooks/useSubscription'
import { TIERS } from '@partyradar/shared'
import type { SubscriptionTier } from '@partyradar/shared'

const TIER_ORDER: SubscriptionTier[] = ['FREE', 'BASIC', 'PRO', 'PREMIUM']

const TIER_STYLE: Record<string, { color: string; glow: string; icon: string; badge?: string }> = {
  FREE:    { color: '#4b5563', glow: 'rgba(75,85,99,0.2)',     icon: '⚡' },
  BASIC:   { color: '#3b82f6', glow: 'rgba(59,130,246,0.2)',   icon: '🔵' },
  PRO:     { color: '#00e5ff', glow: 'rgba(0,229,255,0.2)',    icon: '💎', badge: 'MOST POPULAR' },
  PREMIUM: { color: '#ffd600', glow: 'rgba(255,214,0,0.2)',    icon: '👑', badge: 'FULL ACCESS' },
}

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#04040d' }} />}>
      <SubscriptionsContent />
    </Suspense>
  )
}

function SubscriptionsContent() {
  const { dbUser, refreshUser } = useAuth()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState<string | null>(null)
  const [successBanner, setSuccessBanner] = useState(false)
  const currentTier = (dbUser?.subscriptionTier ?? 'FREE') as SubscriptionTier

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setSuccessBanner(true)
      refreshUser()
    }
  }, [searchParams])

  async function handleCheckout(tier: 'BASIC' | 'PRO' | 'PREMIUM') {
    if (!dbUser) return
    setLoading(tier)
    try { await checkoutSubscription(tier) }
    finally { setLoading(null) }
  }

  async function handleManage() {
    setLoading('portal')
    try { await openBillingPortal() }
    finally { setLoading(null) }
  }

  return (
    <div className="min-h-screen pb-28 px-4 py-8" style={{ background: '#04040d' }}>
      {/* Success banner */}
      {successBanner && (
        <div className="max-w-lg mx-auto mb-6 px-4 py-3 rounded-xl text-center text-sm font-bold"
          style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>
          Subscription activated! Your plan has been upgraded.
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-10 max-w-lg mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4"
          style={{ border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,229,255,0.05)' }}>
          <Crown size={11} style={{ color: '#00e5ff' }} />
          <span className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.7)' }}>PLANS & PRICING</span>
        </div>
        <h1 className="text-3xl font-black mb-3"
          style={{ color: '#00e5ff', textShadow: '0 0 30px rgba(0,229,255,0.3)' }}>
          UNLOCK THE RADAR
        </h1>
        <p className="text-sm" style={{ color: 'rgba(224,242,254,0.5)' }}>
          From hosting to ticket sales — choose your level
        </p>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
        {TIER_ORDER.map((tierKey) => {
          const tier = TIERS[tierKey]
          const style = TIER_STYLE[tierKey]
          const isCurrent = currentTier === tierKey
          const currentIdx = TIER_ORDER.indexOf(currentTier)
          const thisIdx = TIER_ORDER.indexOf(tierKey)
          const isUpgrade = thisIdx > currentIdx

          return (
            <div
              key={tierKey}
              className="relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300"
              style={{
                background: isCurrent ? `${style.color}08` : 'rgba(7,7,26,0.8)',
                border: isCurrent ? `1px solid ${style.color}50` : `1px solid ${style.color}20`,
                boxShadow: isCurrent ? `0 0 30px ${style.glow}` : 'none',
              }}
            >
              {/* Top stripe */}
              <div className="h-1" style={{ background: `linear-gradient(90deg, transparent, ${style.color}, transparent)` }} />

              {/* Popular badge */}
              {style.badge && (
                <div className="absolute top-4 right-4">
                  <span className="text-[9px] font-black px-2 py-0.5 rounded"
                    style={{ color: style.color, border: `1px solid ${style.color}40`, background: `${style.color}10`, letterSpacing: '0.1em' }}>
                    {style.badge}
                  </span>
                </div>
              )}

              <div className="p-5 flex flex-col flex-1">
                {/* Icon + name */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{style.icon}</span>
                  <div>
                    <p className="text-xs font-black tracking-[0.15em]" style={{ color: style.color }}>{tierKey}</p>
                    <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>{tier.description}</p>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-5">
                  {tier.price === 0 ? (
                    <span className="text-3xl font-black" style={{ color: '#e0f2fe' }}>FREE</span>
                  ) : (
                    <>
                      <span className="text-3xl font-black" style={{ color: style.color, textShadow: `0 0 20px ${style.glow}` }}>
                        £{tier.price}
                      </span>
                      <span className="text-sm font-medium ml-1" style={{ color: 'rgba(224,242,254,0.4)' }}>/mo</span>
                    </>
                  )}
                </div>

                {/* Perks */}
                <ul className="space-y-2 mb-6 flex-1">
                  {tier.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(224,242,254,0.7)' }}>
                      <Check size={12} className="shrink-0 mt-0.5" style={{ color: style.color }} />
                      {perk}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrent ? (
                  <div className="space-y-2">
                    <div className="py-2.5 rounded-xl text-center text-xs font-black tracking-widest"
                      style={{ background: `${style.color}12`, border: `1px solid ${style.color}30`, color: style.color }}>
                      ✓ CURRENT PLAN
                    </div>
                    {tierKey !== 'FREE' && (
                      <button
                        onClick={handleManage}
                        disabled={loading === 'portal'}
                        className="w-full py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                        style={{ border: '1px solid rgba(0,229,255,0.2)', color: 'rgba(0,229,255,0.6)', letterSpacing: '0.08em' }}>
                        {loading === 'portal' ? 'LOADING...' : 'MANAGE BILLING'}
                      </button>
                    )}
                  </div>
                ) : tierKey === 'FREE' ? (
                  <div className="py-2.5 rounded-xl text-center text-xs font-bold"
                    style={{ border: '1px solid rgba(74,96,128,0.2)', color: 'rgba(74,96,128,0.5)' }}>
                    DOWNGRADE
                  </div>
                ) : (
                  <button
                    onClick={() => handleCheckout(tierKey as 'BASIC' | 'PRO' | 'PREMIUM')}
                    disabled={!dbUser || !!loading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs transition-all disabled:opacity-40"
                    style={{
                      background: isUpgrade ? `linear-gradient(135deg, ${style.color}20, ${style.color}10)` : 'transparent',
                      border: `1px solid ${style.color}${isUpgrade ? '60' : '30'}`,
                      color: style.color,
                      boxShadow: isUpgrade ? `0 0 20px ${style.glow}` : 'none',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {loading === tierKey
                      ? <><div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" /> LOADING...</>
                      : !dbUser
                      ? 'SIGN IN FIRST'
                      : isUpgrade
                      ? <><Zap size={12} /> UPGRADE</>
                      : 'SWITCH PLAN'
                    }
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-center text-[10px] mt-8" style={{ color: 'rgba(74,96,128,0.5)' }}>
        Payments processed securely by Stripe · Cancel anytime · No hidden fees
      </p>
    </div>
  )
}
