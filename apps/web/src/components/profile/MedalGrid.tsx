'use client'

import { useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export type EarnedMedal = {
  id: string
  medal: { slug: string; tier: string; [key: string]: unknown }
}

interface Props {
  profileMedals: EarnedMedal[]
  isMe?: boolean
}

// ── Medal catalogue (mirrors backend MEDAL_DEFS) ─────────────────────────────

const ALL_MEDALS = [
  {
    slug: 'social-butterfly', name: 'Social Butterfly', icon: '🦋',
    tiers: {
      BRONZE: 'Gain your first 10 followers',
      SILVER: 'Reach 1,000 followers',
      GOLD:   'Become a star with 10,000 followers',
    },
  },
  {
    slug: 'connector', name: 'Connector', icon: '🔗',
    tiers: {
      BRONZE: 'Refer your first friend to PartyRadar',
      SILVER: 'Bring 10 friends to the party',
      GOLD:   "You've built a crew of 50 referrals",
    },
  },
  {
    slug: 'networker', name: 'Networker', icon: '🌐',
    tiers: {
      BRONZE: 'Follow 25 people on PartyRadar',
      SILVER: 'You know 250 party-goers',
      GOLD:   'An elite network of 1,000+ connections',
    },
  },
  {
    slug: 'party-animal', name: 'Party Animal', icon: '🎉',
    tiers: {
      BRONZE: 'Attend 5 events',
      SILVER: 'Hit 25 events attended',
      GOLD:   'A century of parties — legendary!',
    },
  },
  {
    slug: 'ticket-holder', name: 'Ticket Holder', icon: '🎟️',
    tiers: {
      BRONZE: 'Buy your first ticket',
      SILVER: 'Collect 10 tickets',
      GOLD:   'An impressive 50 tickets purchased',
    },
  },
  {
    slug: 'party-host', name: 'Party Host', icon: '🎪',
    tiers: {
      BRONZE: 'Host your first event',
      SILVER: 'Run 10 successful events',
      GOLD:   'A veteran organiser with 50 events',
    },
  },
  {
    slug: 'venue-hopper', name: 'Venue Hopper', icon: '📍',
    tiers: {
      BRONZE: 'Check in at 3 different venues',
      SILVER: 'Explore 15 unique venues',
      GOLD:   'A true explorer — 50 venues visited',
    },
  },
  {
    slug: 'loyal-raver', name: 'Loyal Raver', icon: '🔥',
    tiers: {
      BRONZE: 'Check in to 5 events',
      SILVER: 'A regular with 25 check-ins',
      GOLD:   'Legendary commitment — 100 check-ins!',
    },
  },
] as const

type MedalDef = typeof ALL_MEDALS[number]
type TierKey  = 'BRONZE' | 'SILVER' | 'GOLD'

// ── Styling maps ─────────────────────────────────────────────────────────────

const TIER_COLOR: Record<string, string> = {
  GOLD: '#FFD700', SILVER: '#C0C0C0', BRONZE: '#cd7f32',
}
const TIER_BG: Record<string, string> = {
  GOLD: 'rgba(255,215,0,0.2)', SILVER: 'rgba(192,192,192,0.16)', BRONZE: 'rgba(205,127,50,0.18)',
}
const TIER_GLOW: Record<string, string> = {
  GOLD: 'rgba(255,215,0,0.55)', SILVER: 'rgba(192,192,192,0.45)', BRONZE: 'rgba(205,127,50,0.5)',
}
const TIER_ORDER: Record<string, number> = { BRONZE: 0, SILVER: 1, GOLD: 2 }
const NEXT_TIER: Record<string, TierKey | null> = {
  BRONZE: 'SILVER', SILVER: 'GOLD', GOLD: null,
}

// ── Tooltip content logic ─────────────────────────────────────────────────────

function tooltipFor(def: MedalDef, earnedTier: string | undefined) {
  if (!earnedTier) {
    return {
      label:    'LOCKED',
      labelCol: 'rgba(var(--accent-rgb),0.6)',
      borderCol:'rgba(var(--accent-rgb),0.25)',
      desc:     def.tiers.BRONZE,
      hint:     'Earn this medal:',
    }
  }
  const next = NEXT_TIER[earnedTier] ?? null
  if (!next) {
    return {
      label:    'MAX TIER',
      labelCol: TIER_COLOR['GOLD'],
      borderCol:TIER_COLOR['GOLD'] + '50',
      desc:     "You've reached the highest tier — legendary!",
      hint:     '👑',
    }
  }
  return {
    label:    `UPGRADE TO ${next}`,
    labelCol: TIER_COLOR[next] ?? 'var(--accent)',
    borderCol:(TIER_COLOR[next] ?? 'var(--accent)') + '50',
    desc:     def.tiers[next],
    hint:     'To upgrade:',
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'
const W = 46, H = Math.round(W * 1.1547)   // 46 × 53
const GAP = 6, COLS = 4
const hStep = W + GAP
const vStep = Math.round(H * 0.75)
const totalW = COLS * hStep - GAP
const totalH = H + vStep   // 2 rows

export default function MedalGrid({ profileMedals, isMe }: Props) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null)

  // Build earnedMap: slug → highest tier achieved
  const earnedMap = new Map<string, string>()
  for (const um of profileMedals) {
    const prev = earnedMap.get(um.medal.slug)
    if (!prev || (TIER_ORDER[um.medal.tier] ?? -1) > (TIER_ORDER[prev] ?? -1)) {
      earnedMap.set(um.medal.slug, um.medal.tier)
    }
  }

  return (
    <div
      className="rounded-2xl py-3"
      style={{ background: 'rgba(var(--accent-rgb),0.02)', border: '1px solid rgba(var(--accent-rgb),0.07)' }}
      // Close tooltip when clicking anywhere outside a hex
      onClick={(e) => { if (e.currentTarget === e.target) setActiveSlug(null) }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 mb-3">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-black tracking-widest"
            style={{ color: 'rgba(255,215,0,0.7)', letterSpacing: '0.18em' }}
          >
            MEDALS
          </span>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(255,215,0,0.08)', color: 'rgba(255,215,0,0.6)', border: '1px solid rgba(255,215,0,0.2)' }}
          >
            {earnedMap.size}/{ALL_MEDALS.length}
          </span>
        </div>
        {isMe && (
          <a
            href="/medals"
            className="text-[9px] font-black tracking-widest"
            style={{ color: 'rgba(var(--accent-rgb),0.45)', letterSpacing: '0.1em' }}
          >
            VIEW ALL →
          </a>
        )}
      </div>

      {/* ── Hex grid ── */}
      <div className="flex justify-center px-3">
        <div style={{ position: 'relative', width: totalW, height: totalH }}>
          {ALL_MEDALS.map((def, idx) => {
            const row    = Math.floor(idx / COLS)
            const col    = idx % COLS
            const tier   = earnedMap.get(def.slug)
            const earned = !!tier
            const active = activeSlug === def.slug

            const tc    = tier ? (TIER_COLOR[tier] ?? '#9EA0A5') : 'rgba(var(--accent-rgb),0.18)'
            const tb    = tier ? (TIER_BG[tier]    ?? 'rgba(158,160,165,0.15)') : 'rgba(var(--accent-rgb),0.04)'
            const tg    = tier ?  TIER_GLOW[tier] : undefined
            const inset = 2

            const tip        = tooltipFor(def, tier)
            // Row 0 → tooltip below hex; Row 1 → tooltip above hex
            const tipBelow   = row === 0
            // Clamp tooltip so it doesn't bleed past left/right edge of container
            const rawLeft    = col * hStep + W / 2   // centre of this hex (px from container left)
            const tipW       = 164
            const clampedLeft = Math.max(tipW / 2, Math.min(totalW - tipW / 2, rawLeft))
            const arrowOff   = rawLeft - clampedLeft  // how far the arrow shifts to stay over the hex

            return (
              <div
                key={def.slug}
                style={{
                  position: 'absolute',
                  left:   col * hStep,
                  top:    row * vStep,
                  width:  W,
                  height: H,
                  opacity:    earned ? 1 : 0.35,
                  zIndex:     active ? 20 : 1,
                  cursor:     'pointer',
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={() => setActiveSlug(def.slug)}
                onMouseLeave={() => setActiveSlug(null)}
                onClick={(e) => { e.stopPropagation(); setActiveSlug(active ? null : def.slug) }}
              >
                {/* ── Tooltip ── */}
                {active && (
                  <div style={{
                    position:   'absolute',
                    left:       clampedLeft - rawLeft + W / 2,  // offset from hex left
                    transform:  'translateX(-50%)',
                    ...(tipBelow
                      ? { top:    H + 10 }
                      : { bottom: H + 10 }),
                    width:          tipW,
                    background:     'rgba(7,7,26,0.97)',
                    border:         `1px solid ${tip.borderCol}`,
                    borderRadius:   10,
                    padding:        '8px 10px',
                    pointerEvents:  'none',
                    boxShadow:      `0 4px 24px rgba(0,0,0,0.6), 0 0 12px ${tip.labelCol}18`,
                    zIndex:         30,
                  }}>
                    {/* Arrow */}
                    <div style={{
                      position:   'absolute',
                      left:       `calc(50% + ${-arrowOff}px)`,
                      transform:  'translateX(-50%) rotate(45deg)',
                      width: 8, height: 8,
                      background: 'rgba(7,7,26,0.97)',
                      ...(tipBelow
                        ? { top: -5, borderLeft: `1px solid ${tip.borderCol}`, borderTop: `1px solid ${tip.borderCol}` }
                        : { bottom: -5, borderRight: `1px solid ${tip.borderCol}`, borderBottom: `1px solid ${tip.borderCol}` }),
                    }} />

                    {/* Medal name + icon */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span style={{ fontSize: 13, lineHeight: 1 }}>{def.icon}</span>
                      <span style={{ color: '#e0f2fe', fontSize: 10, fontWeight: 900, letterSpacing: '0.05em' }}>
                        {def.name}
                      </span>
                    </div>

                    {/* Tier badge */}
                    <span style={{
                      display:      'inline-block',
                      fontSize:     8,
                      fontWeight:   900,
                      letterSpacing:'0.14em',
                      color:        tip.labelCol,
                      background:   `${tip.labelCol}18`,
                      border:       `1px solid ${tip.labelCol}40`,
                      borderRadius: 4,
                      padding:      '1px 6px',
                      marginBottom: 5,
                    }}>
                      {tip.label}
                    </span>

                    {/* Hint label */}
                    {tip.hint !== '👑' && (
                      <p style={{ color: 'rgba(224,242,254,0.3)', fontSize: 8, marginBottom: 2, letterSpacing: '0.04em' }}>
                        {tip.hint}
                      </p>
                    )}

                    {/* Description */}
                    <p style={{ color: 'rgba(224,242,254,0.65)', fontSize: 9, lineHeight: 1.45 }}>
                      {tip.desc}
                    </p>
                  </div>
                )}

                {/* ── Hex border layer ── */}
                <div style={{
                  position: 'absolute', inset: 0,
                  clipPath: HEX_CLIP,
                  background: tc,
                  ...(tg ? { filter: `drop-shadow(0 0 ${Math.round(W * 0.14)}px ${tg})` } : {}),
                }} />

                {/* ── Hex fill + icon ── */}
                <div style={{
                  position: 'absolute',
                  top: inset, left: inset, right: inset, bottom: inset,
                  clipPath: HEX_CLIP,
                  background: tb,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  filter: earned ? undefined : 'grayscale(100%)',
                }}>
                  <span style={{ fontSize: W * 0.4, lineHeight: 1, userSelect: 'none' }}>{def.icon}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Empty caption ── */}
      {earnedMap.size === 0 && (
        <p
          className="text-center text-[9px] font-black mt-4"
          style={{ color: 'rgba(var(--accent-rgb),0.25)', letterSpacing: '0.12em' }}
        >
          NO MEDALS EARNED YET — TAP A MEDAL TO SEE HOW
        </p>
      )}
    </div>
  )
}
