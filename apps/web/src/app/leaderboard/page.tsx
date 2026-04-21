'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Trophy, Users, Zap, TrendingUp, Crown, MapPin, Gift, Star } from 'lucide-react'
import { api } from '@/lib/api'

// ─── API response shapes ──────────────────────────────────────────────────────

interface ApiHost {
  id: string
  username: string | null
  displayName: string | null
  photoUrl: string | null
  eventCount: number
  avgRating: number | null
}

interface ApiVenue {
  name: string
  address: string | null
  eventCount: number
  avgRating: number | null
}

interface ApiPartygoer {
  id: string
  username: string | null
  displayName: string | null
  photoUrl: string | null
  eventsAttended: number
}

interface ApiEarner {
  id: string
  username: string | null
  displayName: string | null
  photoUrl: string | null
  earned: number
  referralCount: number
}

interface ApiSocial {
  id: string
  username: string | null
  displayName: string | null
  photoUrl: string | null
  socialScore: number
  subscriptionTier: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: 20 }}>🥇</span>
  if (rank === 2) return <span style={{ fontSize: 20 }}>🥈</span>
  if (rank === 3) return <span style={{ fontSize: 20 }}>🥉</span>
  return (
    <span className="text-xs font-black w-7 text-center" style={{ color: 'rgba(74,96,128,0.5)' }}>
      #{rank}
    </span>
  )
}

function Avatar({ name, photoUrl, color = 'var(--accent)' }: { name: string; photoUrl?: string | null; color?: string }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className="w-9 h-9 rounded-xl object-cover shrink-0"
        style={{ border: `1px solid ${color}35` }}
      />
    )
  }
  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0"
      style={{ background: `${color}15`, border: `1px solid ${color}35`, color }}
    >
      {name[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function LeaderboardEmpty({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
        style={{ background: 'rgba(255,214,0,0.05)', border: '1px solid rgba(255,214,0,0.12)' }}
      >
        <Trophy size={28} style={{ color: 'rgba(255,214,0,0.3)' }} />
      </div>
      <p className="text-sm font-black tracking-widest mb-2" style={{ color: 'rgba(224,242,254,0.4)' }}>
        {title}
      </p>
      <p className="text-xs" style={{ color: 'rgba(74,96,128,0.6)' }}>
        {subtitle}
      </p>
    </div>
  )
}

function Podium({ items, nameKey }: { items: Array<{ displayName?: string | null; name?: string }>, nameKey?: string }) {
  const getName = (item: any) => item.displayName ?? item.name ?? '?'
  if (items.length < 3) return null
  return (
    <div className="flex items-end justify-center gap-3 py-4 mb-2">
      {/* 2nd */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg"
          style={{ background: 'rgba(192,192,192,0.12)', border: '1px solid rgba(192,192,192,0.3)' }}>
          {getName(items[1])[0]}
        </div>
        <div className="w-16 rounded-t-lg flex flex-col items-center pt-2 pb-1"
          style={{ height: 52, background: 'rgba(192,192,192,0.06)', border: '1px solid rgba(192,192,192,0.15)' }}>
          <span style={{ fontSize: 16 }}>🥈</span>
        </div>
        <p className="text-[9px] font-bold text-center truncate w-16" style={{ color: 'rgba(224,242,254,0.6)' }}>
          {getName(items[1]).split(' ')[0]}
        </p>
      </div>
      {/* 1st */}
      <div className="flex flex-col items-center gap-1.5">
        <Crown size={16} style={{ color: '#ffd600', filter: 'drop-shadow(0 0 6px rgba(255,214,0,0.8))' }} />
        <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl"
          style={{ background: 'rgba(255,214,0,0.12)', border: '1px solid rgba(255,214,0,0.4)', color: '#ffd600', boxShadow: '0 0 20px rgba(255,214,0,0.2)' }}>
          {getName(items[0])[0]}
        </div>
        <div className="w-16 rounded-t-lg flex flex-col items-center pt-2 pb-1"
          style={{ height: 68, background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.2)', borderBottom: 'none', boxShadow: '0 0 20px rgba(255,214,0,0.08)' }}>
          <span style={{ fontSize: 18 }}>🥇</span>
        </div>
        <p className="text-[9px] font-bold text-center truncate w-16" style={{ color: '#ffd600' }}>
          {getName(items[0]).split(' ')[0]}
        </p>
      </div>
      {/* 3rd */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg"
          style={{ background: 'rgba(205,127,50,0.12)', border: '1px solid rgba(205,127,50,0.3)' }}>
          {getName(items[2])[0]}
        </div>
        <div className="w-16 rounded-t-lg flex flex-col items-center pt-2 pb-1"
          style={{ height: 40, background: 'rgba(205,127,50,0.06)', border: '1px solid rgba(205,127,50,0.15)' }}>
          <span style={{ fontSize: 14 }}>🥉</span>
        </div>
        <p className="text-[9px] font-bold text-center truncate w-16" style={{ color: 'rgba(224,242,254,0.6)' }}>
          {getName(items[2]).split(' ')[0]}
        </p>
      </div>
    </div>
  )
}

// ─── Tab: Hosts ───────────────────────────────────────────────────────────────

function HostsTab({ hosts }: { hosts: ApiHost[] }) {
  if (hosts.length === 0) {
    return <LeaderboardEmpty title="NO HOSTS YET" subtitle="Host rankings will appear here once events are hosted." />
  }

  return (
    <div className="space-y-2 px-4 py-3 pb-24">
      <Podium items={hosts} />
      {hosts.map((host, i) => (
        <div
          key={host.id}
          className="flex items-center gap-3 rounded-xl px-3 py-3"
          style={{
            background: i < 3 ? 'rgba(255,214,0,0.03)' : 'rgba(7,7,26,0.6)',
            border: i === 0 ? '1px solid rgba(255,214,0,0.2)' : '1px solid rgba(var(--accent-rgb),0.07)',
          }}
        >
          <RankBadge rank={i + 1} />
          <Avatar name={host.displayName ?? host.username ?? '?'} photoUrl={host.photoUrl} color="var(--accent)" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black truncate" style={{ color: '#e0f2fe' }}>
              {host.displayName ?? host.username ?? 'Unknown Host'}
            </p>
            {host.username && (
              <p className="text-[9px]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>@{host.username}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-black" style={{ color: 'var(--accent)' }}>{host.eventCount}</p>
            <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>
              {host.username === 'partyradar' || host.displayName === 'PartyRadar Assistant'
                ? 'TOTAL ON PLATFORM'
                : 'events hosted'}
            </p>
            {host.avgRating != null && (
              <p className="text-[9px] font-bold" style={{ color: '#ffd600' }}>★ {host.avgRating.toFixed(1)}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Tab: Venues ──────────────────────────────────────────────────────────────

function VenuesTab({ venues }: { venues: ApiVenue[] }) {
  if (venues.length === 0) {
    return <LeaderboardEmpty title="NO VENUES YET" subtitle="Venue rankings will appear here as events are hosted at venues." />
  }

  return (
    <div className="space-y-2 px-4 py-3 pb-24">
      {venues.map((venue, i) => (
        <div
          key={`${venue.name}-${i}`}
          className="flex items-center gap-3 rounded-xl px-3 py-3"
          style={{
            background: i < 3 ? 'rgba(255,214,0,0.03)' : 'rgba(7,7,26,0.6)',
            border: i === 0 ? '1px solid rgba(255,214,0,0.2)' : '1px solid rgba(var(--accent-rgb),0.07)',
          }}
        >
          <RankBadge rank={i + 1} />
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0"
            style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.25)', color: 'var(--accent)' }}
          >
            🏙️
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black truncate" style={{ color: '#e0f2fe' }}>{venue.name}</p>
            {venue.address && (
              <p className="text-[9px] truncate flex items-center gap-1" style={{ color: 'rgba(224,242,254,0.3)' }}>
                <MapPin size={8} /> {venue.address}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-black" style={{ color: 'var(--accent)' }}>{venue.eventCount}</p>
            <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>events</p>
            {venue.avgRating != null && (
              <p className="text-[9px] font-bold" style={{ color: '#ffd600' }}>★ {venue.avgRating.toFixed(1)}</p>
            )}
          </div>
        </div>
      ))}

      <div
        className="rounded-2xl p-4 text-center mt-4"
        style={{ background: 'rgba(255,214,0,0.04)', border: '1px solid rgba(255,214,0,0.2)' }}
      >
        <Crown size={20} className="mx-auto mb-2" style={{ color: '#ffd600' }} />
        <p className="text-xs font-black tracking-widest mb-1" style={{ color: '#ffd600' }}>OWN A VENUE?</p>
        <p className="text-[10px] mb-3" style={{ color: 'rgba(224,242,254,0.4)' }}>
          Claim your listing to track check-ins, host events, and reach thousands of partygoers.
        </p>
        <Link
          href="/discover"
          className="inline-block px-4 py-2 rounded-lg text-[10px] font-black"
          style={{ background: 'rgba(255,214,0,0.12)', border: '1px solid rgba(255,214,0,0.4)', color: '#ffd600', letterSpacing: '0.1em' }}
        >
          CLAIM YOUR VENUE →
        </Link>
      </div>
    </div>
  )
}

// ─── Tab: Partygoers ──────────────────────────────────────────────────────────

function PartygoersTab({ partygoers }: { partygoers: ApiPartygoer[] }) {
  if (partygoers.length === 0) {
    return <LeaderboardEmpty title="NO PARTYGOERS YET" subtitle="Rankings will appear here as people attend events." />
  }

  return (
    <div className="space-y-2 px-4 py-3 pb-24">
      <div
        className="rounded-xl px-3 py-2.5 flex items-center gap-3 mb-3"
        style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}
      >
        <TrendingUp size={14} style={{ color: 'var(--accent)' }} />
        <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.45)' }}>
          Ranked by confirmed events attended
        </p>
      </div>

      <Podium items={partygoers} />

      {partygoers.map((pg, i) => (
        <div
          key={pg.id}
          className="flex items-center gap-3 rounded-xl px-3 py-3"
          style={{
            background: i < 3 ? 'rgba(255,214,0,0.03)' : 'rgba(7,7,26,0.6)',
            border: i === 0 ? '1px solid rgba(255,214,0,0.2)' : '1px solid rgba(var(--accent-rgb),0.07)',
          }}
        >
          <RankBadge rank={i + 1} />
          <Avatar name={pg.displayName ?? pg.username ?? '?'} photoUrl={pg.photoUrl} color="#a855f7" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black truncate" style={{ color: '#e0f2fe' }}>
              {pg.displayName ?? pg.username ?? 'Unknown'}
            </p>
            {pg.username && (
              <p className="text-[9px]" style={{ color: 'rgba(168,85,247,0.5)' }}>@{pg.username}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-black" style={{ color: '#a855f7' }}>{pg.eventsAttended}</p>
            <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>events</p>
          </div>
        </div>
      ))}

      <div
        className="rounded-2xl p-4 text-center mt-4"
        style={{ background: 'rgba(var(--accent-rgb),0.03)', border: '1px solid rgba(var(--accent-rgb),0.12)' }}
      >
        <Zap size={20} className="mx-auto mb-2" style={{ color: 'var(--accent)' }} />
        <p className="text-xs font-black tracking-widest mb-1" style={{ color: 'var(--accent)' }}>YOUR TURN</p>
        <p className="text-[10px] mb-3" style={{ color: 'rgba(224,242,254,0.4)' }}>
          Start attending events to earn your place on the leaderboard.
        </p>
        <Link
          href="/discover"
          className="inline-block px-4 py-2 rounded-lg text-[10px] font-black"
          style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)', letterSpacing: '0.1em' }}
        >
          FIND EVENTS →
        </Link>
      </div>
    </div>
  )
}

// ─── Tab: Earners ─────────────────────────────────────────────────────────────

function EarnersTab({ earners }: { earners: ApiEarner[] }) {
  if (earners.length === 0) {
    return <LeaderboardEmpty title="NO EARNERS YET" subtitle="Refer friends and make purchases to appear here." />
  }

  return (
    <div className="space-y-2 px-4 py-3 pb-24">
      <div
        className="rounded-xl px-3 py-2.5 flex items-center gap-3 mb-3"
        style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.1)' }}
      >
        <Gift size={14} style={{ color: '#00ff88' }} />
        <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.45)' }}>
          Ranked by total earnings from referrals
        </p>
      </div>

      <Podium items={earners} />

      {earners.map((earner, i) => (
        <div
          key={earner.id}
          className="flex items-center gap-3 rounded-xl px-3 py-3"
          style={{
            background: i < 3 ? 'rgba(0,255,136,0.03)' : 'rgba(7,7,26,0.6)',
            border: i === 0 ? '1px solid rgba(0,255,136,0.2)' : '1px solid rgba(var(--accent-rgb),0.07)',
          }}
        >
          <RankBadge rank={i + 1} />
          <Avatar name={earner.displayName ?? earner.username ?? '?'} photoUrl={earner.photoUrl} color="#00ff88" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black truncate" style={{ color: '#e0f2fe' }}>
              {earner.displayName ?? earner.username ?? 'Unknown'}
            </p>
            {earner.username && (
              <p className="text-[9px]" style={{ color: 'rgba(0,255,136,0.4)' }}>@{earner.username}</p>
            )}
            <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>
              {earner.referralCount} {earner.referralCount === 1 ? 'referral' : 'referrals'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-black" style={{ color: '#00ff88' }}>£{earner.earned.toFixed(2)}</p>
            <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>earned</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Tab: Social Score ────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  FREE:    'rgba(74,96,128,0.5)',
  BASIC:   '#3b82f6',
  PRO:     '#a855f7',
  PREMIUM: '#ffd600',
}

function SocialTab({ users }: { users: ApiSocial[] }) {
  if (users.length === 0) {
    return <LeaderboardEmpty title="NO SCORES YET" subtitle="Social scores are earned by attending events, hosting, referring friends and being active." />
  }

  return (
    <div className="space-y-2 px-4 py-3 pb-24">
      {/* Info banner */}
      <div className="rounded-xl px-3 py-2.5 flex items-center gap-3 mb-3"
        style={{ background: 'rgba(255,214,0,0.04)', border: '1px solid rgba(255,214,0,0.12)' }}>
        <Star size={14} style={{ color: '#ffd600' }} />
        <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.45)' }}>
          Ranked by Social Score — earned through events, referrals &amp; activity
        </p>
      </div>

      <Podium items={users} />

      {users.map((user, i) => {
        const tierColor = TIER_COLORS[user.subscriptionTier ?? 'FREE'] ?? TIER_COLORS['FREE']
        return (
          <div
            key={user.id}
            className="flex items-center gap-3 rounded-xl px-3 py-3"
            style={{
              background: i < 3 ? 'rgba(255,214,0,0.03)' : 'rgba(7,7,26,0.6)',
              border: i === 0 ? '1px solid rgba(255,214,0,0.2)' : '1px solid rgba(var(--accent-rgb),0.07)',
            }}
          >
            <RankBadge rank={i + 1} />
            <Avatar name={user.displayName ?? user.username ?? '?'} photoUrl={user.photoUrl} color="#ffd600" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-black truncate" style={{ color: '#e0f2fe' }}>
                  {user.displayName ?? user.username ?? 'Anonymous'}
                </p>
                {user.subscriptionTier && user.subscriptionTier !== 'FREE' && (
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded"
                    style={{ color: tierColor, background: `${tierColor}18`, border: `1px solid ${tierColor}40`, letterSpacing: '0.06em' }}>
                    {user.subscriptionTier}
                  </span>
                )}
              </div>
              {user.username && (
                <p className="text-[9px]" style={{ color: 'rgba(255,214,0,0.4)' }}>@{user.username}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 justify-end">
                <Star size={10} style={{ color: '#ffd600' }} />
                <p className="text-xs font-black" style={{ color: '#ffd600' }}>
                  {user.socialScore.toLocaleString()}
                </p>
              </div>
              <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>points</p>
            </div>
          </div>
        )
      })}

      <div className="rounded-2xl p-4 text-center mt-4"
        style={{ background: 'rgba(255,214,0,0.04)', border: '1px solid rgba(255,214,0,0.2)' }}>
        <Star size={20} className="mx-auto mb-2" style={{ color: '#ffd600' }} />
        <p className="text-xs font-black tracking-widest mb-1" style={{ color: '#ffd600' }}>BOOST YOUR SCORE</p>
        <p className="text-[10px] mb-3" style={{ color: 'rgba(224,242,254,0.4)' }}>
          Attend events, host parties, invite friends and stay active to climb the ranks.
        </p>
        <a href="/discover" className="inline-block px-4 py-2 rounded-lg text-[10px] font-black"
          style={{ background: 'rgba(255,214,0,0.12)', border: '1px solid rgba(255,214,0,0.4)', color: '#ffd600', letterSpacing: '0.1em' }}>
          FIND EVENTS →
        </a>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'social' | 'hosts' | 'venues' | 'partygoers' | 'earners'

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }> }[] = [
  { id: 'social',     label: 'SOCIAL',   icon: Star    },
  { id: 'hosts',      label: 'HOSTS',    icon: Trophy  },
  { id: 'venues',     label: 'VENUES',   icon: MapPin  },
  { id: 'partygoers', label: 'GOERS',    icon: Users   },
  { id: 'earners',    label: 'EARNERS',  icon: Gift    },
]

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>('social')
  const [social, setSocial] = useState<ApiSocial[]>([])
  const [hosts, setHosts] = useState<ApiHost[]>([])
  const [venues, setVenues] = useState<ApiVenue[]>([])
  const [partygoers, setPartygoers] = useState<ApiPartygoer[]>([])
  const [earners, setEarners] = useState<ApiEarner[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadLeaderboard() {
      setLoading(true)
      try {
        const [socialRes, hostsRes, venuesRes, partygoersRes, earnersRes] = await Promise.allSettled([
          api.get<{ data: ApiSocial[] }>('/leaderboard/social'),
          api.get<{ data: ApiHost[] }>('/leaderboard/hosts'),
          api.get<{ data: ApiVenue[] }>('/leaderboard/venues'),
          api.get<{ data: ApiPartygoer[] }>('/leaderboard/partygoers'),
          api.get<{ data: ApiEarner[] }>('/referrals/leaderboard'),
        ])
        if (socialRes.status === 'fulfilled' && socialRes.value?.data) setSocial(socialRes.value.data)
        if (hostsRes.status === 'fulfilled' && hostsRes.value?.data) setHosts(hostsRes.value.data)
        if (venuesRes.status === 'fulfilled' && venuesRes.value?.data) setVenues(venuesRes.value.data)
        if (partygoersRes.status === 'fulfilled' && partygoersRes.value?.data) setPartygoers(partygoersRes.value.data)
        if (earnersRes.status === 'fulfilled' && earnersRes.value?.data) setEarners(earnersRes.value.data)
      } catch {
        // Keep empty arrays — shows empty states
      } finally {
        setLoading(false)
      }
    }
    loadLeaderboard()
  }, [])

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>
      {/* Header */}
      <div
        className="flex-shrink-0 px-4 py-4"
        style={{ background: 'rgba(4,4,13,0.9)', borderBottom: '1px solid rgba(var(--accent-rgb),0.1)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <Trophy size={16} style={{ color: '#ffd600', filter: 'drop-shadow(0 0 6px rgba(255,214,0,0.7))' }} />
          <h1 className="text-sm font-black tracking-widest" style={{ color: '#ffd600', textShadow: '0 0 16px rgba(255,214,0,0.5)', letterSpacing: '0.2em' }}>
            LEADERBOARD
          </h1>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-black transition-all duration-200"
                style={{
                  background: active ? 'rgba(255,214,0,0.1)' : 'transparent',
                  border: active ? '1px solid rgba(255,214,0,0.3)' : '1px solid rgba(var(--accent-rgb),0.08)',
                  color: active ? '#ffd600' : 'rgba(74,96,128,0.6)',
                  letterSpacing: '0.08em',
                  boxShadow: active ? '0 0 12px rgba(255,214,0,0.1)' : 'none',
                }}
              >
                <Icon size={11} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 rounded-full border-2 animate-spin"
              style={{ borderColor: 'rgba(255,214,0,0.1)', borderTopColor: '#ffd600' }} />
            <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(255,214,0,0.4)' }}>
              LOADING LEADERBOARD...
            </p>
          </div>
        ) : (
          <>
            {tab === 'social'     && <SocialTab users={social} />}
            {tab === 'hosts'      && <HostsTab hosts={hosts} />}
            {tab === 'venues'     && <VenuesTab venues={venues} />}
            {tab === 'partygoers' && <PartygoersTab partygoers={partygoers} />}
            {tab === 'earners'    && <EarnersTab earners={earners} />}
          </>
        )}
      </div>
    </div>
  )
}
