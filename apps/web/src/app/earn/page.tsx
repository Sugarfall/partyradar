'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Zap,
  Ticket,
  Users,
  Share2,
  Wallet,
  CreditCard,
  ArrowRight,
  TrendingUp,
  Calculator,
  Megaphone,
  Crown,
  Star,
} from 'lucide-react'

/* ── Reusable section card ─────────────────────────────────────────────────── */
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
    <div
      className="rounded-2xl p-6 sm:p-8"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}
        >
          <Icon size={20} style={{ color: accent }} />
        </div>
        <h2 className="text-lg font-bold tracking-wide" style={{ color: '#e0f2fe' }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-center"
      style={{ background: `${accent}08`, border: `1px solid ${accent}18` }}
    >
      <p className="text-xl font-black" style={{ color: accent }}>
        {value}
      </p>
      <p className="text-[11px] mt-1" style={{ color: 'rgba(224,242,254,0.5)' }}>
        {label}
      </p>
    </div>
  )
}

function Step({
  num,
  title,
  desc,
}: {
  num: number
  title: string
  desc: string
}) {
  return (
    <div className="flex items-start gap-4">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-black"
        style={{
          background: 'rgba(var(--accent-rgb),0.1)',
          border: '1px solid rgba(var(--accent-rgb),0.25)',
          color: 'var(--accent)',
        }}
      >
        {num}
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: '#e0f2fe' }}>
          {title}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(224,242,254,0.45)' }}>
          {desc}
        </p>
      </div>
    </div>
  )
}

/* ── Revenue calculator ────────────────────────────────────────────────────── */
function RevenueCalculator() {
  const [events, setEvents] = useState(4)
  const [avgTickets, setAvgTickets] = useState(100)
  const [avgPrice, setAvgPrice] = useState(15)

  const ticketRevenue = events * avgTickets * avgPrice * 0.95
  const pushRevenue = events * 25 // estimated push blast revenue per event
  const total = ticketRevenue + pushRevenue

  return (
    <div className="space-y-5">
      {/* Sliders */}
      {[
        { label: 'Events per month', value: events, set: setEvents, min: 1, max: 20, suffix: '' },
        { label: 'Avg tickets sold', value: avgTickets, set: setAvgTickets, min: 10, max: 500, suffix: '' },
        { label: 'Avg ticket price', value: avgPrice, set: setAvgPrice, min: 5, max: 100, suffix: '' },
      ].map(({ label, value, set, min, max }) => (
        <div key={label}>
          <div className="flex justify-between mb-2">
            <span className="text-xs" style={{ color: 'rgba(224,242,254,0.5)' }}>
              {label}
            </span>
            <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
              {label.includes('price') ? `\u00a3${value}` : value}
            </span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(e) => set(Number(e.target.value))}
            className="w-full accent-cyan-400"
            style={{ accentColor: 'var(--accent)' }}
          />
        </div>
      ))}

      {/* Result */}
      <div
        className="rounded-xl p-5 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.08) 0%, rgba(0,255,136,0.06) 100%)',
          border: '1px solid rgba(var(--accent-rgb),0.2)',
        }}
      >
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'rgba(var(--accent-rgb),0.6)' }}>
          Estimated monthly earnings
        </p>
        <p
          className="text-3xl font-black"
          style={{
            color: 'var(--accent)',
            textShadow: '0 0 30px rgba(var(--accent-rgb),0.3)',
          }}
        >
          {'\u00a3'}{total.toLocaleString('en-GB', { minimumFractionDigits: 0 })}
        </p>
        <p className="text-[10px] mt-2" style={{ color: 'rgba(224,242,254,0.35)' }}>
          Based on {events} events x {avgTickets} tickets x {'\u00a3'}{avgPrice} avg price (95% payout)
        </p>
      </div>
    </div>
  )
}

/* ── Main page ─────────────────────────────────────────────────────────────── */
export default function EarnPage() {
  return (
    <div className="min-h-screen" style={{ background: '#04040d' }}>
      {/* Hero */}
      <section className="pt-28 pb-14 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-center mb-5">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: 'rgba(var(--accent-rgb),0.08)',
                border: '1px solid rgba(var(--accent-rgb),0.2)',
                boxShadow: '0 0 40px rgba(var(--accent-rgb),0.15)',
              }}
            >
              <TrendingUp size={28} style={{ color: 'var(--accent)' }} />
            </div>
          </div>
          <h1
            className="text-3xl sm:text-5xl font-black tracking-wider"
            style={{
              color: 'var(--accent)',
              textShadow: '0 0 60px rgba(var(--accent-rgb),0.25), 0 0 120px rgba(var(--accent-rgb),0.1)',
            }}
          >
            EARN WITH PARTYRADAR
          </h1>
          <p className="mt-4 text-sm sm:text-base max-w-lg mx-auto" style={{ color: 'rgba(224,242,254,0.55)' }}>
            Turn your events, communities, and connections into real revenue.
            Multiple ways to earn -- whether you are hosting, creating, or sharing.
          </p>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 pb-32 space-y-6">
        {/* ── For Hosts ──────────────────────────────────────────────────── */}
        <SectionCard icon={Ticket} title="For Hosts" accent="#a855f7">
          <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(224,242,254,0.55)' }}>
            Create events and sell tickets directly through PartyRadar. You keep{' '}
            <span className="font-bold" style={{ color: '#a855f7' }}>95%</span> of every ticket sold -- one of the
            highest payout rates in the industry.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Stat label="Ticket payout" value="95%" accent="#a855f7" />
            <Stat label="Platform fee" value="5%" accent="#a855f7" />
          </div>
          <div className="flex items-start gap-3 mt-4">
            <Megaphone size={16} className="mt-0.5 shrink-0" style={{ color: '#a855f7' }} />
            <p className="text-xs" style={{ color: 'rgba(224,242,254,0.45)' }}>
              <span className="font-semibold" style={{ color: '#e0f2fe' }}>Push Blasts</span> -- Send
              targeted notifications to attendees in your area. Each blast generates additional revenue
              as followers engage with your events.
            </p>
          </div>
        </SectionCard>

        {/* ── For Group Creators ──────────────────────────────────────────── */}
        <SectionCard icon={Users} title="For Group Creators" accent="#00ff88">
          <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(224,242,254,0.55)' }}>
            Build exclusive communities and charge membership fees. You keep{' '}
            <span className="font-bold" style={{ color: '#00ff88' }}>80%</span> of all subscription revenue
            from your paid groups.
          </p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Starter" value={'\u00a30.99'} accent="#00ff88" />
            <Stat label="Standard" value={'\u00a34.99'} accent="#00ff88" />
            <Stat label="Premium" value={'\u00a39.99'} accent="#00ff88" />
          </div>
          <p className="text-xs" style={{ color: 'rgba(224,242,254,0.4)' }}>
            Pricing tiers from {'\u00a3'}0.99 to {'\u00a3'}9.99/month. You set the price, we handle billing.
          </p>
        </SectionCard>

        {/* ── For Referrers ──────────────────────────────────────────────── */}
        <SectionCard icon={Share2} title="For Referrers" accent="#ffd600">
          <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(224,242,254,0.55)' }}>
            Share your referral code and earn <span className="font-bold" style={{ color: '#ffd600' }}>10%</span> of
            every pound the platform makes from someone you refer — for life. We take our fee, you keep 10% of it.
            No caps. No expiry.
          </p>
          <div className="space-y-2.5">
            {[
              { label: 'Share of platform revenue', value: '10%', icon: TrendingUp },
              { label: 'Duration', value: 'Lifetime', icon: Crown },
              { label: 'Counts on', value: 'Tickets, subs, groups, venue', icon: Ticket },
              { label: 'Minimum payout threshold', value: '\u00a35.00', icon: Wallet },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-lg px-4 py-2.5 gap-3"
                style={{ background: 'rgba(255,214,0,0.04)', border: '1px solid rgba(255,214,0,0.1)' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon size={14} style={{ color: '#ffd600' }} />
                  <span className="text-xs truncate" style={{ color: 'rgba(224,242,254,0.6)' }}>
                    {label}
                  </span>
                </div>
                <span className="text-sm font-bold shrink-0" style={{ color: '#ffd600' }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] mt-4" style={{ color: 'rgba(224,242,254,0.4)' }}>
            Example: your referral subscribes at <strong style={{ color: '#e0f2fe' }}>£9.99/mo</strong>.
            You earn <strong style={{ color: '#ffd600' }}>£1.00/mo</strong> every month they stay subscribed.
          </p>
        </SectionCard>

        {/* ── Wallet Rewards ─────────────────────────────────────────────── */}
        <SectionCard icon={Wallet} title="Wallet Rewards" accent="var(--accent)">
          <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(224,242,254,0.55)' }}>
            Every purchase earns you loyalty points. Spend on tickets, food, or merch and watch your
            rewards grow automatically.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Points per \u00a31 spent" value="10 pts" accent="var(--accent)" />
            <Stat label="Free drink at" value="500 pts" accent="var(--accent)" />
          </div>
          <p className="text-xs mt-4" style={{ color: 'rgba(224,242,254,0.4)' }}>
            Points never expire. Redeem for drinks, merchandise, and exclusive event perks.
          </p>
        </SectionCard>

        {/* ── Physical Cards ─────────────────────────────────────────────── */}
        <SectionCard icon={CreditCard} title="Physical Cards" accent="#ff6b6b">
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(224,242,254,0.55)' }}>
            Design and sell custom PartyRadar physical cards. Earn a commission on every card sold
            featuring your original artwork. A creative way to build your brand and earn passively.
          </p>
        </SectionCard>

        {/* ── How to Get Started ─────────────────────────────────────────── */}
        <SectionCard icon={Star} title="How to Get Started" accent="var(--accent)">
          <div className="space-y-5">
            <Step num={1} title="Create your account" desc="Sign up for free in under a minute." />
            <Step num={2} title="Switch to Host mode" desc="Toggle to Host in the top bar to unlock creator tools." />
            <Step
              num={3}
              title="Create events or groups"
              desc="Set up your first event with tickets or launch a paid community group."
            />
            <Step
              num={4}
              title="Share your referral code"
              desc="Found in your profile -- share it everywhere for passive income."
            />
            <Step num={5} title="Cash out" desc="Withdraw earnings to your bank account anytime above the minimum." />
          </div>
        </SectionCard>

        {/* ── Revenue Calculator ─────────────────────────────────────────── */}
        <SectionCard icon={Calculator} title="Revenue Calculator" accent="#a855f7">
          <p className="text-sm leading-relaxed mb-5" style={{ color: 'rgba(224,242,254,0.55)' }}>
            See how much you could earn as a host. Adjust the sliders to match your expected event size.
          </p>
          <RevenueCalculator />
        </SectionCard>

      </div>
    </div>
  )
}
