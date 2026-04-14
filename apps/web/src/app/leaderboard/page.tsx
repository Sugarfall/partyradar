'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Trophy, Star, Users, Zap, TrendingUp, Crown, Music, MapPin } from 'lucide-react'
import { GLASGOW_VENUES } from '@/hooks/useEvents'
import { DEV_MODE } from '@/lib/firebase'
import { api } from '@/lib/api'

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_HOSTS = [
  { rank: 1,  id: 'h1',  name: 'Alex Rivera',   username: 'alexrivera',   city: 'Glasgow', events: 38, attendees: 4820, rating: 4.9, tier: 'PREMIUM', badge: '👑', streak: 12 },
  { rank: 2,  id: 'h2',  name: 'Sophia Chen',   username: 'sophiachen',   city: 'Glasgow', events: 29, attendees: 3540, rating: 4.8, tier: 'PRO',     badge: '⚡', streak: 8  },
  { rank: 3,  id: 'h3',  name: 'Marcus Webb',   username: 'marcuswebb',   city: 'London',  events: 24, attendees: 2910, rating: 4.7, tier: 'PRO',     badge: '🔥', streak: 5  },
  { rank: 4,  id: 'h4',  name: 'Priya Sharma',  username: 'priyasharma',  city: 'Glasgow', events: 19, attendees: 2200, rating: 4.6, tier: 'PRO',     badge: '🎯', streak: 4  },
  { rank: 5,  id: 'h5',  name: 'Jake Morrison', username: 'jakemorrison', city: 'Edinburgh',events: 15, attendees: 1780, rating: 4.5, tier: 'BASIC',   badge: '🎵', streak: 3  },
  { rank: 6,  id: 'h6',  name: 'Zara Osei',     username: 'zaraosei',     city: 'Glasgow', events: 12, attendees: 1340, rating: 4.4, tier: 'BASIC',   badge: null,  streak: 2  },
  { rank: 7,  id: 'h7',  name: 'Liam Byrne',    username: 'liambyrne',    city: 'Glasgow', events: 10, attendees: 1100, rating: 4.3, tier: 'BASIC',   badge: null,  streak: 1  },
  { rank: 8,  id: 'h8',  name: 'Nina Patel',    username: 'ninapatel',    city: 'London',  events: 8,  attendees: 890,  rating: 4.2, tier: 'FREE',    badge: null,  streak: 0  },
  { rank: 9,  id: 'h9',  name: 'Olu Adeyemi',   username: 'oluadeyemi',   city: 'Glasgow', events: 7,  attendees: 750,  rating: 4.1, tier: 'FREE',    badge: null,  streak: 0  },
  { rank: 10, id: 'h10', name: 'Eva Kowalski',  username: 'evakowalski',  city: 'Glasgow', events: 5,  attendees: 520,  rating: 4.0, tier: 'FREE',    badge: null,  streak: 0  },
]

const MOCK_PARTYGOERS = [
  { rank: 1,  id: 'p1',  name: 'Jamie K',       username: 'jamiek',       city: 'Glasgow', attended: 67, streak: 14, score: 9820, badge: '👑', title: 'SCENE LEGEND'   },
  { rank: 2,  id: 'p2',  name: 'Mia Chen',      username: 'miachen',      city: 'Glasgow', attended: 54, streak: 9,  score: 7640, badge: '⚡', title: 'PARTY ANIMAL'  },
  { rank: 3,  id: 'p3',  name: 'Ravi Singh',    username: 'ravisingh',    city: 'Edinburgh',attended: 48, streak: 7,  score: 6210, badge: '🔥', title: 'REGULAR'       },
  { rank: 4,  id: 'p4',  name: 'Chloe Dumont',  username: 'chloedumont',  city: 'Glasgow', attended: 41, streak: 5,  score: 5390, badge: '🎯', title: 'REGULAR'       },
  { rank: 5,  id: 'p5',  name: 'Theo Walsh',    username: 'theowalsh',    city: 'Glasgow', attended: 35, streak: 4,  score: 4420, badge: '🎵', title: 'GOING OUT'     },
  { rank: 6,  id: 'p6',  name: 'Amara Diallo',  username: 'amaradiallo',  city: 'Glasgow', attended: 29, streak: 3,  score: 3650, badge: null,  title: 'GOING OUT'     },
  { rank: 7,  id: 'p7',  name: 'Sam Hewitt',    username: 'samhewitt',    city: 'London',  attended: 24, streak: 2,  score: 2980, badge: null,  title: 'NEWCOMER'      },
  { rank: 8,  id: 'p8',  name: 'Kezia Okonkwo', username: 'keziaokonkwo', city: 'Glasgow', attended: 20, streak: 1,  score: 2310, badge: null,  title: 'NEWCOMER'      },
  { rank: 9,  id: 'p9',  name: 'Ben Larsson',   username: 'benlarsson',   city: 'Glasgow', attended: 16, streak: 1,  score: 1880, badge: null,  title: 'NEWCOMER'      },
  { rank: 10, id: 'p10', name: 'Isla Mackay',   username: 'islamackay',   city: 'Glasgow', attended: 12, streak: 0,  score: 1340, badge: null,  title: 'NEWCOMER'      },
]

// Top venues from our Glasgow data
const MOCK_VENUES = GLASGOW_VENUES.slice().sort((a, b) => b.rating - a.rating).slice(0, 10).map((v, i) => ({
  rank: i + 1,
  ...v,
  checkIns: [2840, 2610, 2340, 2100, 1920, 1780, 1640, 1540, 1420, 1300][i]!,
  eventsHosted: [48, 42, 36, 30, 28, 24, 20, 18, 16, 14][i]!,
  badge: i === 0 ? '👑' : i === 1 ? '⚡' : i === 2 ? '🔥' : null,
}))

const TIER_COLORS: Record<string, string> = {
  PREMIUM: '#ffd600',
  PRO:     '#00e5ff',
  BASIC:   '#a855f7',
  FREE:    'rgba(74,96,128,0.5)',
}
const VENUE_TYPE_COLORS: Record<string, string> = {
  NIGHTCLUB: '#00e5ff', BAR: '#a855f7', PUB: '#22c55e',
  CONCERT_HALL: '#3d5afe', ROOFTOP_BAR: '#f59e0b', LOUNGE: '#ec4899',
}

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

function Avatar({ name, color = '#00e5ff' }: { name: string; color?: string }) {
  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0"
      style={{ background: `${color}15`, border: `1px solid ${color}35`, color }}
    >
      {name[0]}
    </div>
  )
}

// ─── Empty state for leaderboard tabs ────────────────────────────────────────
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

// ─── Tab: Hosts ───────────────────────────────────────────────────────────────
function HostsTab({ hosts }: { hosts: typeof MOCK_HOSTS }) {
  if (hosts.length === 0) {
    return <LeaderboardEmpty title="COMING SOON" subtitle="Host rankings will appear here once events are hosted in your area." />
  }

  return (
    <div className="space-y-2 px-4 py-3 pb-24">
      {/* Hero — top 3 podium */}
      {hosts.length >= 3 && (
      <div className="flex items-end justify-center gap-3 py-4 mb-2">
        {/* 2nd */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg"
            style={{ background: 'rgba(192,192,192,0.12)', border: '1px solid rgba(192,192,192,0.3)' }}>
            {hosts[1]!.name[0]}
          </div>
          <div className="w-16 rounded-t-lg flex flex-col items-center pt-2 pb-1"
            style={{ height: 52, background: 'rgba(192,192,192,0.06)', border: '1px solid rgba(192,192,192,0.15)' }}>
            <span style={{ fontSize: 16 }}>🥈</span>
          </div>
          <p className="text-[9px] font-bold text-center truncate w-16" style={{ color: 'rgba(224,242,254,0.6)' }}>
            {hosts[1]!.name.split(' ')[0]}
          </p>
        </div>
        {/* 1st */}
        <div className="flex flex-col items-center gap-1.5">
          <Crown size={16} style={{ color: '#ffd600', filter: 'drop-shadow(0 0 6px rgba(255,214,0,0.8))' }} />
          <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl"
            style={{ background: 'rgba(255,214,0,0.12)', border: '1px solid rgba(255,214,0,0.4)', color: '#ffd600', boxShadow: '0 0 20px rgba(255,214,0,0.2)' }}>
            {hosts[0]!.name[0]}
          </div>
          <div className="w-16 rounded-t-lg flex flex-col items-center pt-2 pb-1"
            style={{ height: 68, background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.2)', borderBottom: 'none', boxShadow: '0 0 20px rgba(255,214,0,0.08)' }}>
            <span style={{ fontSize: 18 }}>🥇</span>
          </div>
          <p className="text-[9px] font-bold text-center truncate w-16" style={{ color: '#ffd600' }}>
            {hosts[0]!.name.split(' ')[0]}
          </p>
        </div>
        {/* 3rd */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg"
            style={{ background: 'rgba(205,127,50,0.12)', border: '1px solid rgba(205,127,50,0.3)' }}>
            {hosts[2]!.name[0]}
          </div>
          <div className="w-16 rounded-t-lg flex flex-col items-center pt-2 pb-1"
            style={{ height: 40, background: 'rgba(205,127,50,0.06)', border: '1px solid rgba(205,127,50,0.15)' }}>
            <span style={{ fontSize: 14 }}>🥉</span>
          </div>
          <p className="text-[9px] font-bold text-center truncate w-16" style={{ color: 'rgba(224,242,254,0.6)' }}>
            {hosts[2]!.name.split(' ')[0]}
          </p>
        </div>
      </div>
      )}

      {/* Full list */}
      {hosts.map((host) => {
        const tierColor = TIER_COLORS[host.tier] ?? '#00e5ff'
        return (
          <div
            key={host.id}
            className="flex items-center gap-3 rounded-xl px-3 py-3"
            style={{
              background: host.rank <= 3 ? `rgba(255,214,0,0.03)` : 'rgba(7,7,26,0.6)',
              border: host.rank === 1 ? '1px solid rgba(255,214,0,0.2)' : '1px solid rgba(0,229,255,0.07)',
            }}
          >
            <RankBadge rank={host.rank} />
            <Avatar name={host.name} color={tierColor} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-black truncate" style={{ color: '#e0f2fe' }}>{host.name}</p>
                {host.badge && <span style={{ fontSize: 12 }}>{host.badge}</span>}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ color: tierColor, border: `1px solid ${tierColor}40`, background: `${tierColor}10`, letterSpacing: '0.1em' }}>
                  {host.tier}
                </span>
                <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>{host.city}</span>
                {host.streak > 0 && (
                  <span className="text-[9px] font-bold" style={{ color: '#ff006e' }}>🔥 {host.streak}wk</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-black" style={{ color: '#00e5ff' }}>{host.attendees.toLocaleString()}</p>
              <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>attendees</p>
              <p className="text-[9px] font-bold" style={{ color: '#ffd600' }}>★ {host.rating}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Tab: Venues ──────────────────────────────────────────────────────────────
function VenuesTab({ venues }: { venues: typeof MOCK_VENUES }) {
  if (venues.length === 0) {
    return <LeaderboardEmpty title="COMING SOON" subtitle="Venue rankings will appear here as people check in around your city." />
  }

  return (
    <div className="space-y-2 px-4 py-3 pb-24">
      {venues.map((venue) => {
        const color = VENUE_TYPE_COLORS[venue.type] ?? '#00e5ff'
        return (
          <div
            key={venue.id}
            className="flex items-center gap-3 rounded-xl px-3 py-3"
            style={{
              background: venue.rank <= 3 ? `${color}05` : 'rgba(7,7,26,0.6)',
              border: venue.rank === 1 ? `1px solid ${color}25` : '1px solid rgba(0,229,255,0.07)',
            }}
          >
            <RankBadge rank={venue.rank} />
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0"
              style={{ background: `${color}15`, border: `1px solid ${color}35`, color }}
            >
              {venue.type === 'NIGHTCLUB' ? '🎧' : venue.type === 'CONCERT_HALL' ? '🎸' : venue.type === 'BAR' ? '🍸' : '🏠'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-black truncate" style={{ color: '#e0f2fe' }}>{venue.name}</p>
                {venue.badge && <span style={{ fontSize: 12 }}>{venue.badge}</span>}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ color, border: `1px solid ${color}40`, background: `${color}10`, letterSpacing: '0.1em' }}>
                  {venue.type.replace('_', ' ')}
                </span>
                <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>
                  <MapPin size={8} className="inline" /> {venue.city}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-black" style={{ color }}>{venue.checkIns.toLocaleString()}</p>
              <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>check-ins</p>
              <p className="text-[9px] font-bold" style={{ color: '#ffd600' }}>★ {venue.rating.toFixed(1)}</p>
            </div>
          </div>
        )
      })}

      {/* Claim CTA */}
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
const TITLE_COLORS: Record<string, string> = {
  'SCENE LEGEND': '#ffd600',
  'PARTY ANIMAL': '#00e5ff',
  'REGULAR':      '#a855f7',
  'GOING OUT':    '#22c55e',
  'NEWCOMER':     'rgba(74,96,128,0.6)',
}

function PartygoersTab({ partygoers }: { partygoers: typeof MOCK_PARTYGOERS }) {
  if (partygoers.length === 0) {
    return <LeaderboardEmpty title="COMING SOON" subtitle="Partygoer rankings will appear here as people attend events." />
  }

  return (
    <div className="space-y-2 px-4 py-3 pb-24">
      {/* Score explainer */}
      <div
        className="rounded-xl px-3 py-2.5 flex items-center gap-3 mb-3"
        style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.1)' }}
      >
        <TrendingUp size={14} style={{ color: '#00e5ff' }} />
        <p className="text-[10px]" style={{ color: 'rgba(224,242,254,0.45)' }}>
          Score = events attended × 100 + weekly streak bonus + early RSVP bonus
        </p>
      </div>

      {partygoers.map((pg) => {
        const titleColor = TITLE_COLORS[pg.title] ?? 'rgba(74,96,128,0.5)'
        return (
          <div
            key={pg.id}
            className="flex items-center gap-3 rounded-xl px-3 py-3"
            style={{
              background: pg.rank <= 3 ? 'rgba(255,214,0,0.03)' : 'rgba(7,7,26,0.6)',
              border: pg.rank === 1 ? '1px solid rgba(255,214,0,0.2)' : '1px solid rgba(0,229,255,0.07)',
            }}
          >
            <RankBadge rank={pg.rank} />
            <Avatar name={pg.name} color={titleColor} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-black truncate" style={{ color: '#e0f2fe' }}>{pg.name}</p>
                {pg.badge && <span style={{ fontSize: 12 }}>{pg.badge}</span>}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ color: titleColor, border: `1px solid ${titleColor}50`, background: `${titleColor}10`, letterSpacing: '0.08em' }}>
                  {pg.title}
                </span>
                <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>{pg.city}</span>
                {pg.streak > 0 && (
                  <span className="text-[9px] font-bold" style={{ color: '#ff006e' }}>🔥 {pg.streak}wk</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-black" style={{ color: '#00e5ff' }}>{pg.score.toLocaleString()}</p>
              <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.3)' }}>pts</p>
              <p className="text-[9px]" style={{ color: 'rgba(224,242,254,0.35)' }}>{pg.attended} events</p>
            </div>
          </div>
        )
      })}

      {/* Join CTA */}
      <div
        className="rounded-2xl p-4 text-center mt-4"
        style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.12)' }}
      >
        <Zap size={20} className="mx-auto mb-2" style={{ color: '#00e5ff' }} />
        <p className="text-xs font-black tracking-widest mb-1" style={{ color: '#00e5ff' }}>YOUR TURN</p>
        <p className="text-[10px] mb-3" style={{ color: 'rgba(224,242,254,0.4)' }}>
          Start attending events to earn points and climb the ranks.
        </p>
        <Link
          href="/discover"
          className="inline-block px-4 py-2 rounded-lg text-[10px] font-black"
          style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)', color: '#00e5ff', letterSpacing: '0.1em' }}
        >
          FIND EVENTS →
        </Link>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
type Tab = 'hosts' | 'venues' | 'partygoers'

const TABS: { id: Tab; label: string; icon: typeof Trophy }[] = [
  { id: 'hosts',      label: 'HOSTS',      icon: Trophy },
  { id: 'venues',     label: 'VENUES',     icon: MapPin  },
  { id: 'partygoers', label: 'PARTYGOERS', icon: Users   },
]

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>('hosts')
  const [hosts, setHosts] = useState<typeof MOCK_HOSTS>(DEV_MODE ? MOCK_HOSTS : [])
  const [venues, setVenues] = useState<typeof MOCK_VENUES>(DEV_MODE ? MOCK_VENUES : [])
  const [partygoers, setPartygoers] = useState<typeof MOCK_PARTYGOERS>(DEV_MODE ? MOCK_PARTYGOERS : [])
  const [loading, setLoading] = useState(!DEV_MODE)

  useEffect(() => {
    if (DEV_MODE) return
    async function loadLeaderboard() {
      setLoading(true)
      try {
        const [hostsRes, venuesRes, partygoersRes] = await Promise.allSettled([
          api.get<{ data: typeof MOCK_HOSTS }>('/leaderboard/hosts'),
          api.get<{ data: typeof MOCK_VENUES }>('/leaderboard/venues'),
          api.get<{ data: typeof MOCK_PARTYGOERS }>('/leaderboard/partygoers'),
        ])
        if (hostsRes.status === 'fulfilled' && hostsRes.value?.data?.length) setHosts(hostsRes.value.data)
        if (venuesRes.status === 'fulfilled' && venuesRes.value?.data?.length) setVenues(venuesRes.value.data)
        if (partygoersRes.status === 'fulfilled' && partygoersRes.value?.data?.length) setPartygoers(partygoersRes.value.data)
      } catch {
        // Keep empty arrays — shows "coming soon" empty states
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
        style={{ background: 'rgba(4,4,13,0.9)', borderBottom: '1px solid rgba(0,229,255,0.1)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <Trophy size={16} style={{ color: '#ffd600', filter: 'drop-shadow(0 0 6px rgba(255,214,0,0.7))' }} />
          <h1 className="text-sm font-black tracking-widest" style={{ color: '#ffd600', textShadow: '0 0 16px rgba(255,214,0,0.5)', letterSpacing: '0.2em' }}>
            LEADERBOARD
          </h1>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ color: 'rgba(0,229,255,0.5)', border: '1px solid rgba(0,229,255,0.15)', letterSpacing: '0.1em' }}>
            GLASGOW
          </span>
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
                  border: active ? '1px solid rgba(255,214,0,0.3)' : '1px solid rgba(0,229,255,0.08)',
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
            {tab === 'hosts'      && <HostsTab hosts={hosts} />}
            {tab === 'venues'     && <VenuesTab venues={venues} />}
            {tab === 'partygoers' && <PartygoersTab partygoers={partygoers} />}
          </>
        )}
      </div>
    </div>
  )
}
