'use client'

import { useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export type EarnedMedal = {
  id: string
  earnedAt: string
  medal: { slug: string; name: string; icon: string; tier: string; [key: string]: unknown }
}

interface Props {
  profileMedals: EarnedMedal[]
  isMe?: boolean
}

// ── Catalogue — only used to show locked/unearned medals below earned ones ──

const CATALOGUE = [
  { slug: 'social-butterfly', name: 'Social Butterfly', icon: '🦋', hint: 'Gain followers on PartyRadar' },
  { slug: 'connector',        name: 'Connector',        icon: '🔗', hint: 'Refer friends to PartyRadar' },
  { slug: 'networker',        name: 'Networker',        icon: '🌐', hint: 'Follow people on PartyRadar' },
  { slug: 'party-animal',     name: 'Party Animal',     icon: '🎉', hint: 'Attend events' },
  { slug: 'ticket-holder',    name: 'Ticket Holder',    icon: '🎟️', hint: 'Buy tickets' },
  { slug: 'party-host',       name: 'Party Host',       icon: '🎪', hint: 'Host events' },
  { slug: 'venue-hopper',     name: 'Venue Hopper',     icon: '📍', hint: 'Visit unique venues' },
  { slug: 'loyal-raver',      name: 'Loyal Raver',      icon: '🔥', hint: 'Check in at events' },
] as const

// ── Styling ───────────────────────────────────────────────────────────────────

const TIER_COLOR: Record<string, string> = {
  GOLD: '#FFD700', SILVER: '#C0C0C0', BRONZE: '#cd7f32',
}
const TIER_BG: Record<string, string> = {
  GOLD:   'rgba(255,215,0,0.2)',
  SILVER: 'rgba(192,192,192,0.16)',
  BRONZE: 'rgba(205,127,50,0.18)',
}
const TIER_GLOW: Record<string, string> = {
  GOLD:   'rgba(255,215,0,0.55)',
  SILVER: 'rgba(192,192,192,0.45)',
  BRONZE: 'rgba(205,127,50,0.5)',
}
const TIER_ORDER: Record<string, number> = { BRONZE: 0, SILVER: 1, GOLD: 2 }

const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'
const W  = 46
const H  = Math.round(W * 1.1547)   // ≈ 53 px  (proper hexagon ratio)
const GAP = 6
const COLS = 4

// ── Component ─────────────────────────────────────────────────────────────────

export default function MedalGrid({ profileMedals, isMe }: Props) {
  const [activeKey, setActiveKey] = useState<string | null>(null)

  // ── Build display list ───────────────────────────────────────────────────
  // 1. Earned medals — sourced directly from the API (any slug, newest first)
  //    De-duplicate by (slug, tier): keep highest tier per slug if awarded twice.
  const seenSlugTier = new Set<string>()
  const earnedItems = profileMedals
    .slice()                                     // preserve original newest-first order
    .filter(um => {
      const key = `${um.medal.slug}:${um.medal.tier}`
      if (seenSlugTier.has(key)) return false
      seenSlugTier.add(key)
      return true
    })
    .map(um => ({
      key:     um.id,
      slug:    um.medal.slug,
      name:    um.medal.name,
      icon:    um.medal.icon,
      tier:    um.medal.tier,
      earnedAt:um.earnedAt,
      earned:  true,
      hint:    null as string | null,
    }))

  // 2. Unearned catalogue medals (greyed out, for discovery)
  const earnedSlugs = new Set(profileMedals.map(um => um.medal.slug))
  const unearnedItems = CATALOGUE
    .filter(def => !earnedSlugs.has(def.slug))
    .map(def => ({
      key:     def.slug,
      slug:    def.slug,
      name:    def.name,
      icon:    def.icon,
      tier:    null as string | null,
      earnedAt:null as string | null,
      earned:  false,
      hint:    def.hint,
    }))

  const allItems = [...earnedItems, ...unearnedItems]

  return (
    <div
      className="rounded-2xl py-3"
      style={{ background: 'rgba(var(--accent-rgb),0.02)', border: '1px solid rgba(var(--accent-rgb),0.07)' }}
      onClick={e => { if (e.currentTarget === e.target) setActiveKey(null) }}
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
            {earnedItems.length} earned
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

      {/* ── CSS grid — 4 columns, no absolute positioning → no overlap ── */}
      <div className="flex justify-center px-3">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, ${W}px)`,
            gap: GAP,
          }}
        >
          {allItems.map(item => {
            const tc    = item.tier ? (TIER_COLOR[item.tier] ?? '#9EA0A5') : 'rgba(var(--accent-rgb),0.18)'
            const tb    = item.tier ? (TIER_BG[item.tier]    ?? 'rgba(158,160,165,0.15)') : 'rgba(var(--accent-rgb),0.04)'
            const tg    = item.tier ? TIER_GLOW[item.tier]   : undefined
            const active = activeKey === item.key

            // Tooltip direction: show above by default; if this is in the first
            // row (index < COLS) show below so it doesn't clip off the top.
            const idx        = allItems.indexOf(item)
            const tipBelow   = idx < COLS
            const tierLabel  = item.tier
              ? (TIER_ORDER[item.tier] === 2 ? 'GOLD — MAX TIER' : item.tier)
              : 'LOCKED'

            return (
              <div
                key={item.key}
                style={{
                  position:   'relative',
                  width:      W,
                  height:     H,
                  opacity:    item.earned ? 1 : 0.3,
                  cursor:     'pointer',
                  zIndex:     active ? 20 : 1,
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={() => setActiveKey(item.key)}
                onMouseLeave={() => setActiveKey(null)}
                onClick={e => { e.stopPropagation(); setActiveKey(active ? null : item.key) }}
              >
                {/* ── Tooltip ── */}
                {active && (
                  <div style={{
                    position:      'absolute',
                    left:          '50%',
                    transform:     'translateX(-50%)',
                    ...(tipBelow
                      ? { top:    H + 8 }
                      : { bottom: H + 8 }),
                    width:         160,
                    background:    'rgba(7,7,26,0.97)',
                    border:        `1px solid ${tc}50`,
                    borderRadius:  10,
                    padding:       '8px 10px',
                    pointerEvents: 'none',
                    zIndex:        30,
                    boxShadow:     '0 4px 24px rgba(0,0,0,0.65)',
                  }}>
                    {/* Arrow */}
                    <div style={{
                      position:  'absolute',
                      left:      '50%',
                      transform: 'translateX(-50%) rotate(45deg)',
                      width: 8, height: 8,
                      background: 'rgba(7,7,26,0.97)',
                      ...(tipBelow
                        ? { top: -5,    borderLeft: `1px solid ${tc}50`, borderTop:    `1px solid ${tc}50` }
                        : { bottom: -5, borderRight:`1px solid ${tc}50`, borderBottom: `1px solid ${tc}50` }),
                    }} />

                    {/* Medal name + icon */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span style={{ fontSize: 14, lineHeight: 1 }}>{item.icon}</span>
                      <span style={{ color: '#e0f2fe', fontSize: 10, fontWeight: 900, letterSpacing: '0.05em' }}>
                        {item.name}
                      </span>
                    </div>

                    {/* Tier / status badge */}
                    <span style={{
                      display:       'inline-block',
                      fontSize:       8,
                      fontWeight:     900,
                      letterSpacing: '0.14em',
                      color:          tc,
                      background:    `${tc}18`,
                      border:        `1px solid ${tc}40`,
                      borderRadius:   4,
                      padding:       '1px 6px',
                      marginBottom:   5,
                    }}>
                      {tierLabel}
                    </span>

                    {/* Earned date or hint */}
                    {item.earnedAt ? (
                      <p style={{ color: 'rgba(224,242,254,0.4)', fontSize: 9, marginTop: 2 }}>
                        Earned {new Date(item.earnedAt).toLocaleDateString()}
                      </p>
                    ) : item.hint ? (
                      <p style={{ color: 'rgba(224,242,254,0.5)', fontSize: 9, lineHeight: 1.4 }}>
                        {item.hint}
                      </p>
                    ) : null}
                  </div>
                )}

                {/* ── Hex border layer ── */}
                <div style={{
                  position: 'absolute', inset: 0,
                  clipPath:  HEX_CLIP,
                  background: tc,
                  ...(tg ? { filter: `drop-shadow(0 0 ${Math.round(W * 0.14)}px ${tg})` } : {}),
                }} />

                {/* ── Hex fill + icon ── */}
                <div style={{
                  position:   'absolute',
                  top: 2, left: 2, right: 2, bottom: 2,
                  clipPath:   HEX_CLIP,
                  background: tb,
                  display:    'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  filter: item.earned ? undefined : 'grayscale(100%)',
                }}>
                  <span style={{ fontSize: W * 0.4, lineHeight: 1, userSelect: 'none' }}>
                    {item.icon}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Empty state ── */}
      {earnedItems.length === 0 && (
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
