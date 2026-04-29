'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Gift, Copy, Check, TrendingUp } from 'lucide-react'
import { formatPrice } from '@/lib/currency'

interface ReferralCard {
  id: string
  code: string
  displayName: string
  totalUses: number
  totalEarned: number
  isActive: boolean
  createdAt: string
  conversions: { source: string | null; revenueAmount: number; commissionAmount: number; createdAt: string; isPaidOut: boolean }[]
}

export default function ReferralCardPage() {
  const { dbUser } = useAuth()
  const [card, setCard] = useState<ReferralCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { return () => { if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current) } }, [])

  useEffect(() => {
    if (!dbUser) { setLoading(false); return }
    api.get<{ data: ReferralCard[] }>('/referral-cards/mine')
      .then(j => { if (j?.data?.length > 0) setCard(j.data[0]) })
      .finally(() => setLoading(false))
      .catch(() => setLoading(false))
  }, [dbUser?.id])

  async function createCard() {
    if (!dbUser) return
    setCreating(true)
    const json = await api.post<{ data: ReferralCard }>('/referral-cards', {}).catch(() => null)
    if (json?.data) setCard(json.data)
    setCreating(false)
  }

  function copyCode() {
    if (!card) return
    navigator.clipboard.writeText(card.code).then(() => {
      setCopied(true)
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!dbUser) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#07071a' }}>
      <div className="text-center space-y-3">
        <Gift size={36} style={{ color: 'rgba(var(--accent-rgb),0.2)', margin: '0 auto' }} />
        <Link href="/login?next=/referral-card" className="text-sm font-black" style={{ color: 'var(--accent)' }}>Log in to get your referral card</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen pb-24" style={{ background: '#07071a' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-4"
        style={{ background: 'rgba(7,7,26,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(var(--accent-rgb),0.08)' }}>
        <h1 className="text-xl font-black" style={{ color: '#e0f2fe' }}>Referral Card</h1>
        <p className="text-xs mt-1" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>Earn 5% on every referral purchase</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {loading && (
          <div className="py-16 flex justify-center">
            <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
          </div>
        )}

        {!loading && !card && (
          <div className="space-y-4">
            <div className="p-6 rounded-2xl text-center space-y-3" style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
              <Gift size={40} style={{ color: 'rgba(var(--accent-rgb),0.3)', margin: '0 auto' }} />
              <p className="text-base font-black" style={{ color: '#e0f2fe' }}>Get your referral card</p>
              <p className="text-sm" style={{ color: 'rgba(224,242,254,0.4)' }}>
                Share your unique code and earn 5% on every ticket, subscription, and purchase made by people you refer.
              </p>
              <button onClick={createCard} disabled={creating}
                className="w-full py-3.5 rounded-xl text-sm font-black tracking-widest disabled:opacity-50"
                style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.35)', color: 'var(--accent)' }}>
                {creating ? 'GENERATING…' : 'GET MY CARD'}
              </button>
            </div>
            <div className="space-y-2">
              {[['5% commission', 'Earn on tickets, subs, and group chat purchases'],
                ['Real-time tracking', 'See every conversion and payout in your dashboard'],
                ['Physical + digital', 'Share your code IRL or online — both count'],
              ].map(([title, desc]) => (
                <div key={title} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(7,7,26,0.6)', border: '1px solid rgba(var(--accent-rgb),0.06)' }}>
                  <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: 'var(--accent)' }} />
                  <div>
                    <p className="text-xs font-black" style={{ color: '#e0f2fe' }}>{title}</p>
                    <p className="text-[11px]" style={{ color: 'rgba(224,242,254,0.4)' }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && card && (
          <>
            {/* The card */}
            <div className="p-6 rounded-2xl relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #07071a 0%, #0f0a2a 100%)', border: '1px solid rgba(var(--accent-rgb),0.25)', boxShadow: '0 0 40px rgba(var(--accent-rgb),0.06)' }}>
              <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, var(--accent), transparent)', transform: 'translate(30%, -30%)' }} />
              <p className="text-[9px] font-black tracking-[0.3em] mb-1" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>PARTYRADAR · REFERRAL CARD</p>
              <p className="text-lg font-black mb-4" style={{ color: '#e0f2fe' }}>{card.displayName}</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-black tracking-widest" style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{card.code}</p>
                  <p className="text-[10px] mt-1" style={{ color: 'rgba(var(--accent-rgb),0.35)' }}>5% REVENUE SHARE</p>
                </div>
                <button onClick={copyCode} className="p-3 rounded-xl"
                  style={{ background: copied ? 'rgba(0,255,136,0.1)' : 'rgba(var(--accent-rgb),0.08)', border: `1px solid ${copied ? 'rgba(0,255,136,0.3)' : 'rgba(var(--accent-rgb),0.2)'}`, color: copied ? '#00ff88' : 'var(--accent)' }}>
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'TOTAL USES', value: card.totalUses },
                { label: 'EARNED', value: formatPrice(card.totalEarned, undefined, false) },
                { label: 'CONVERSIONS', value: card.conversions?.length ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} className="p-3 rounded-xl text-center" style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
                  <p className="text-base font-black" style={{ color: 'var(--accent)' }}>{value}</p>
                  <p className="text-[9px] font-bold mt-0.5" style={{ color: 'rgba(var(--accent-rgb),0.3)' }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Recent conversions */}
            {(card.conversions?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black tracking-[0.2em] px-1" style={{ color: 'rgba(var(--accent-rgb),0.3)' }}>RECENT CONVERSIONS</p>
                {card.conversions.map((c, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(7,7,26,0.7)', border: '1px solid rgba(var(--accent-rgb),0.06)' }}>
                    <div>
                      <p className="text-xs font-bold capitalize" style={{ color: '#e0f2fe' }}>{c.source?.replace('_', ' ') ?? 'Purchase'}</p>
                      <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.3)' }}>{new Date(c.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black" style={{ color: '#00ff88' }}>+{formatPrice(c.commissionAmount, undefined, false)}</p>
                      <p className="text-[9px]" style={{ color: c.isPaidOut ? 'rgba(0,255,136,0.5)' : 'rgba(255,214,0,0.5)' }}>
                        {c.isPaidOut ? 'PAID' : 'PENDING'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="p-4 rounded-xl text-center" style={{ background: 'rgba(7,7,26,0.5)', border: '1px solid rgba(var(--accent-rgb),0.06)' }}>
              <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>
                Share your code <strong style={{ color: 'rgba(var(--accent-rgb),0.6)' }}>{card.code}</strong> and earn 5% on every purchase your referrals make on PartyRadar.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
