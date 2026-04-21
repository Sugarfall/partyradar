'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Check, Zap, Users, BarChart3, Bell, Star, Shield,
  Ticket, Beer, Sparkles, Crown, Flame, ChevronRight,
  Lock, Loader2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type Track = 'attendee' | 'host'

interface Plan {
  tier: 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM'
  label: string
  emoji: string
  price: number
  color: string
  tagline: string
  perks: string[]
  cta: string
  highlighted?: boolean
}

// ─── Plan definitions ─────────────────────────────────────────────────────────

const ATTENDEE_PLANS: Plan[] = [
  {
    tier: 'FREE',
    label: 'Free',
    emoji: '🎉',
    price: 0,
    color: '#4a6080',
    tagline: 'Explore the scene',
    perks: [
      'Discover & browse events',
      'RSVP to free events',
      '5 swipes per day',
      'Group chats',
      'Follow people',
    ],
    cta: 'Current plan',
  },
  {
    tier: 'BASIC',
    label: 'Basic',
    emoji: '⚡',
    price: 4.99,
    color: '#00e5ff',
    tagline: 'Get in the mix',
    perks: [
      'See who\'s nearby (within 2 km)',
      'Unlimited swipes',
      'Match & message people',
      'See match distance',
      'Request DJ songs',
      'Yacht & Beach party access',
      'Buy paid event tickets',
      'No ads',
    ],
    cta: 'Upgrade to Basic',
    highlighted: true,
  },
  {
    tier: 'PRO',
    label: 'Pro',
    emoji: '🔥',
    price: 9.99,
    color: '#a855f7',
    tagline: 'Level up your night',
    perks: [
      'Everything in Basic',
      'See who viewed your profile',
      'Exclusive PRO-only events',
      'Priority in Nearby & Match',
      'Full guest list visibility',
      'Priority support',
    ],
    cta: 'Upgrade to Pro',
  },
  {
    tier: 'PREMIUM',
    label: 'Premium',
    emoji: '👑',
    price: 19.99,
    color: '#ffd600',
    tagline: 'VIP experience',
    perks: [
      'Everything in Pro',
      'Golden profile badge',
      'Top of Nearby & Match feeds',
      'Create private exclusive events',
      'VIP guest list priority',
      'Dedicated account manager',
      'Early access to new features',
      'Custom profile badge & theme',
    ],
    cta: 'Upgrade to Premium',
  },
]

const HOST_PLANS: Plan[] = [
  {
    tier: 'FREE',
    label: 'Starter',
    emoji: '🎤',
    price: 0,
    color: '#4a6080',
    tagline: 'Test the waters',
    perks: [
      '1 event per month',
      'Up to 50 attendees',
      'Free RSVPs only',
      'Basic event listing',
      'Event page & photo upload',
    ],
    cta: 'Current plan',
  },
  {
    tier: 'PRO',
    label: 'Pro Host',
    emoji: '🔥',
    price: 9.99,
    color: '#a855f7',
    tagline: 'Run your nights',
    perks: [
      'Unlimited events per month',
      'Up to 500 attendees per event',
      'Sell tickets & collect revenue',
      'Full guest list & check-in analytics',
      '3 push blast campaigns/month',
      'QR code scanner for check-ins',
      'Priority support',
      'All attendee Basic perks included',
    ],
    cta: 'Start Pro Hosting',
    highlighted: true,
  },
  {
    tier: 'PREMIUM',
    label: 'Business',
    emoji: '👑',
    price: 19.99,
    color: '#ffd600',
    tagline: 'Scale your brand',
    perks: [
      'Everything in Pro Host',
      'Unlimited attendees per event',
      'Unlimited push blast campaigns',
      'Featured on Discover page',
      'Brand partnership opportunities',
      'White-label ticketing options',
      'Dedicated account manager',
      'All attendee Premium perks included',
    ],
    cta: 'Start Business',
  },
]

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isCurrentTier,
  onSelect,
  loading,
}: {
  plan: Plan
  isCurrentTier: boolean
  onSelect: (tier: Plan['tier']) => void
  loading: boolean
}) {
  const isFree = plan.price === 0
  const emoji = plan.emoji
  const col = plan.color

  return (
    <div
      className="relative rounded-2xl flex flex-col overflow-hidden transition-all duration-200"
      style={{
        background: plan.highlighted
          ? `linear-gradient(160deg, ${col}12 0%, rgba(7,7,26,0.98) 60%)`
          : 'rgba(7,7,26,0.95)',
        border: plan.highlighted
          ? `1px solid ${col}50`
          : '1px solid rgba(255,255,255,0.07)',
        boxShadow: plan.highlighted ? `0 0 40px ${col}18` : '0 2px 20px rgba(0,0,0,0.4)',
      }}
    >
      {/* Top accent line */}
      {plan.highlighted && (
        <div className="h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${col}, transparent)` }} />
      )}

      {/* Popular badge */}
      {plan.highlighted && (
        <div
          className="absolute top-3 right-3 text-[9px] font-black px-2 py-0.5 rounded-full"
          style={{ background: `${col}20`, border: `1px solid ${col}50`, color: col, letterSpacing: '0.12em' }}
        >
          MOST POPULAR
        </div>
      )}

      <div className="p-5 flex flex-col flex-1">
        {/* Header */}
        <div className="mb-4">
          <span className="text-2xl">{emoji}</span>
          <h3 className="text-base font-black mt-1" style={{ color: '#e0f2fe' }}>{plan.label}</h3>
          <p className="text-[11px]" style={{ color: 'rgba(224,242,254,0.4)' }}>{plan.tagline}</p>
        </div>

        {/* Price */}
        <div className="mb-5">
          {isFree ? (
            <span className="text-2xl font-black" style={{ color: '#e0f2fe' }}>Free</span>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black" style={{ color: col }}>£{plan.price}</span>
              <span className="text-xs" style={{ color: 'rgba(224,242,254,0.35)' }}>/month</span>
            </div>
          )}
        </div>

        {/* Perks */}
        <ul className="space-y-2 mb-6 flex-1">
          {plan.perks.map((perk) => (
            <li key={perk} className="flex items-start gap-2">
              <Check size={12} className="shrink-0 mt-0.5" style={{ color: col }} />
              <span className="text-[11px] leading-tight" style={{ color: 'rgba(224,242,254,0.65)' }}>{perk}</span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        {isCurrentTier ? (
          <div
            className="w-full py-2.5 rounded-xl text-[11px] font-black text-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}
          >
            CURRENT PLAN
          </div>
        ) : isFree ? (
          <div
            className="w-full py-2.5 rounded-xl text-[11px] font-black text-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}
          >
            DEFAULT
          </div>
        ) : (
          <button
            onClick={() => onSelect(plan.tier)}
            disabled={loading}
            className="w-full py-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
            style={{
              background: plan.highlighted
                ? `linear-gradient(135deg, ${col}25, ${col}15)`
                : `${col}12`,
              border: `1px solid ${col}45`,
              color: col,
              letterSpacing: '0.1em',
              boxShadow: plan.highlighted ? `0 0 20px ${col}15` : 'none',
            }}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : plan.cta.toUpperCase()}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Feature comparison rows ───────────────────────────────────────────────────

function CompareRow({ label, attendee, host }: { label: string; attendee: string; host: string }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="text-[11px]" style={{ color: 'rgba(224,242,254,0.4)' }}>{label}</span>
      <span className="text-[11px] font-bold text-center" style={{ color: '#00e5ff' }}>{attendee}</span>
      <span className="text-[11px] font-bold text-center" style={{ color: '#a855f7' }}>{host}</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const router = useRouter()
  const { dbUser } = useAuth()
  const [track, setTrack] = useState<Track>('attendee')
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)

  const currentTier = dbUser?.subscriptionTier ?? 'FREE'
  const plans = track === 'attendee' ? ATTENDEE_PLANS : HOST_PLANS

  async function handleSelect(tier: 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM') {
    if (!dbUser) {
      router.push('/login?next=/pricing')
      return
    }
    setCheckoutLoading(tier)
    try {
      const json = await api.post<{ url: string }>('/subscriptions/checkout', { tier })
      if (json?.url) window.location.href = json.url
    } catch (err: any) {
      alert(err?.message ?? 'Could not start checkout. Please try again.')
    } finally {
      setCheckoutLoading(null)
    }
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: '#04040d', paddingTop: 56 }}>

      {/* ── Header ── */}
      <div className="px-4 pt-10 pb-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4"
          style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
          <Sparkles size={11} style={{ color: 'var(--accent)' }} />
          <span className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.7)' }}>CHOOSE YOUR PLAN</span>
        </div>
        <h1 className="text-3xl font-black mb-2" style={{ color: '#e0f2fe', letterSpacing: '0.05em' }}>
          Unlock the full<br />
          <span style={{ color: 'var(--accent)', textShadow: '0 0 30px rgba(var(--accent-rgb),0.4)' }}>PartyRadar</span> experience
        </h1>
        <p className="text-sm" style={{ color: 'rgba(224,242,254,0.4)', maxWidth: 320, margin: '0 auto' }}>
          Different plans for different roles. Cancel anytime.
        </p>
      </div>

      {/* ── Track toggle ── */}
      <div className="max-w-sm mx-auto px-4 mb-8">
        <div
          className="flex rounded-xl p-1 gap-1"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {(['attendee', 'host'] as Track[]).map((t) => (
            <button
              key={t}
              onClick={() => setTrack(t)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black transition-all duration-200"
              style={{
                background: track === t
                  ? t === 'attendee'
                    ? 'rgba(0,229,255,0.12)'
                    : 'rgba(168,85,247,0.12)'
                  : 'transparent',
                border: track === t
                  ? t === 'attendee'
                    ? '1px solid rgba(0,229,255,0.35)'
                    : '1px solid rgba(168,85,247,0.35)'
                  : '1px solid transparent',
                color: track === t
                  ? t === 'attendee' ? '#00e5ff' : '#a855f7'
                  : 'rgba(255,255,255,0.35)',
                letterSpacing: '0.1em',
              }}
            >
              {t === 'attendee'
                ? <><Users size={13} /> FOR PARTYGOERS</>
                : <><Beer size={13} /> FOR HOSTS</>
              }
            </button>
          ))}
        </div>
      </div>

      {/* ── Plan cards ── */}
      <div className="max-w-5xl mx-auto px-4">
        <div className={`grid gap-4 ${plans.length === 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.tier + plan.label}
              plan={plan}
              isCurrentTier={plan.tier === currentTier && plan.price > 0 && (
                // For host track, only mark PRO/PREMIUM as current if currently on those tiers
                true
              )}
              onSelect={handleSelect}
              loading={checkoutLoading === plan.tier}
            />
          ))}
        </div>
      </div>

      {/* ── What's included divider ── */}
      <div className="max-w-2xl mx-auto px-4 mt-14 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <span className="text-[10px] font-black tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.2)' }}>FEATURE COMPARISON</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </div>
      </div>

      {/* ── Comparison table ── */}
      <div className="max-w-2xl mx-auto px-4 mb-10">
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(7,7,26,0.95)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="grid grid-cols-3 gap-4 px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>FEATURE</span>
            <span className="text-[10px] font-black tracking-widest text-center" style={{ color: '#00e5ff' }}>PARTYGOER</span>
            <span className="text-[10px] font-black tracking-widest text-center" style={{ color: '#a855f7' }}>HOST</span>
          </div>
          <div className="px-4">
            <CompareRow label="Nearby people" attendee="Basic+" host="Pro+" />
            <CompareRow label="Matchmaking" attendee="Basic+" host="Pro+" />
            <CompareRow label="Sell tickets" attendee="—" host="Pro+" />
            <CompareRow label="Events per month" attendee="Unlimited" host="1 (Free) / ∞ (Pro+)" />
            <CompareRow label="Push blasts" attendee="—" host="3/mo (Pro) / ∞ (Business)" />
            <CompareRow label="Analytics" attendee="—" host="Pro+" />
            <CompareRow label="Featured on Discover" attendee="—" host="Business" />
            <CompareRow label="No ads" attendee="Basic+" host="Pro+" />
            <CompareRow label="Profile viewers" attendee="Pro+" host="Pro+" />
            <CompareRow label="Dedicated manager" attendee="Premium" host="Business" />
          </div>
        </div>
      </div>

      {/* ── FAQ / trust signals ── */}
      <div className="max-w-lg mx-auto px-4 space-y-3">
        {[
          { icon: <Shield size={14} />, title: 'Cancel anytime', body: 'No lock-in. Cancel from Settings in one tap — your current period stays active.' },
          { icon: <Star size={14} />, title: 'Instant activation', body: 'Your features unlock the moment payment clears. No waiting.' },
          { icon: <Ticket size={14} />, title: 'Hosts keep 95%', body: 'PartyRadar takes a 5% platform fee on ticket sales. You keep the rest.' },
        ].map(({ icon, title, body }) => (
          <div key={title} className="flex items-start gap-3 p-4 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="mt-0.5 shrink-0" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>{icon}</div>
            <div>
              <p className="text-xs font-black mb-0.5" style={{ color: '#e0f2fe' }}>{title}</p>
              <p className="text-[11px]" style={{ color: 'rgba(224,242,254,0.4)' }}>{body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Manage existing subscription ── */}
      {dbUser && currentTier !== 'FREE' && (
        <div className="max-w-lg mx-auto px-4 mt-8">
          <Link
            href="/settings"
            className="flex items-center justify-between px-4 py-3 rounded-xl transition-all"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(224,242,254,0.5)' }}
          >
            <span className="text-xs font-bold">Manage your subscription</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      )}

    </div>
  )
}
