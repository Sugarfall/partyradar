// Seed script: create/upsert all PartyRadar medal definitions
// Usage: node scripts/seed-medals.mjs
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const MEDAL_DEFS = [
  // ── SOCIAL ─────────────────────────────────────────────────────────────
  {
    slug: 'social-butterfly', name: 'Social Butterfly', icon: '🦋',
    category: 'SOCIAL', conditionType: 'FOLLOWERS_COUNT', sortOrder: 1,
    tiers: [
      { tier: 'BRONZE', threshold: 10,    description: 'Gain your first 10 followers' },
      { tier: 'SILVER', threshold: 1000,  description: 'Reach 1,000 followers' },
      { tier: 'GOLD',   threshold: 10000, description: 'Become a star with 10,000 followers' },
    ],
  },
  {
    slug: 'connector', name: 'Connector', icon: '🔗',
    category: 'SOCIAL', conditionType: 'REFERRALS_MADE', sortOrder: 2,
    tiers: [
      { tier: 'BRONZE', threshold: 1,  description: 'Refer your first friend to PartyRadar' },
      { tier: 'SILVER', threshold: 10, description: 'Bring 10 friends to the party' },
      { tier: 'GOLD',   threshold: 50, description: "You've built a crew of 50 referrals" },
    ],
  },
  {
    slug: 'networker', name: 'Networker', icon: '🌐',
    category: 'SOCIAL', conditionType: 'FOLLOWING_COUNT', sortOrder: 3,
    tiers: [
      { tier: 'BRONZE', threshold: 25,   description: 'Follow 25 people on PartyRadar' },
      { tier: 'SILVER', threshold: 250,  description: 'You know 250 party-goers' },
      { tier: 'GOLD',   threshold: 1000, description: 'An elite network of 1,000+ connections' },
    ],
  },

  // ── EVENTS ─────────────────────────────────────────────────────────────
  {
    slug: 'party-animal', name: 'Party Animal', icon: '🎉',
    category: 'EVENTS', conditionType: 'EVENTS_ATTENDED', sortOrder: 1,
    tiers: [
      { tier: 'BRONZE', threshold: 5,   description: 'Attend 5 events' },
      { tier: 'SILVER', threshold: 25,  description: 'Hit 25 events attended' },
      { tier: 'GOLD',   threshold: 100, description: 'A century of parties — legendary!' },
    ],
  },
  {
    slug: 'ticket-holder', name: 'Ticket Holder', icon: '🎟️',
    category: 'EVENTS', conditionType: 'TICKETS_BOUGHT', sortOrder: 2,
    tiers: [
      { tier: 'BRONZE', threshold: 1,  description: 'Buy your first ticket' },
      { tier: 'SILVER', threshold: 10, description: 'Collect 10 tickets' },
      { tier: 'GOLD',   threshold: 50, description: 'An impressive 50 tickets purchased' },
    ],
  },

  // ── HOST ───────────────────────────────────────────────────────────────
  {
    slug: 'party-host', name: 'Party Host', icon: '🎪',
    category: 'HOST', conditionType: 'EVENTS_ORGANISED', sortOrder: 1,
    tiers: [
      { tier: 'BRONZE', threshold: 1,  description: 'Host your first event' },
      { tier: 'SILVER', threshold: 10, description: 'Run 10 successful events' },
      { tier: 'GOLD',   threshold: 50, description: 'A veteran organiser with 50 events' },
    ],
  },

  // ── EXPLORER ───────────────────────────────────────────────────────────
  {
    slug: 'venue-hopper', name: 'Venue Hopper', icon: '📍',
    category: 'EXPLORER', conditionType: 'VENUES_VISITED', sortOrder: 1,
    tiers: [
      { tier: 'BRONZE', threshold: 3,  description: 'Check in at 3 different venues' },
      { tier: 'SILVER', threshold: 15, description: 'Explore 15 unique venues' },
      { tier: 'GOLD',   threshold: 50, description: 'A true explorer — 50 venues visited' },
    ],
  },

  // ── LOYALTY ────────────────────────────────────────────────────────────
  {
    slug: 'loyal-raver', name: 'Loyal Raver', icon: '🔥',
    category: 'LOYALTY', conditionType: 'CHECKINS_COUNT', sortOrder: 1,
    tiers: [
      { tier: 'BRONZE', threshold: 5,   description: 'Check in to 5 events' },
      { tier: 'SILVER', threshold: 25,  description: 'A regular with 25 check-ins' },
      { tier: 'GOLD',   threshold: 100, description: 'Legendary commitment — 100 check-ins!' },
    ],
  },
]

async function main() {
  console.log('🎖️  Seeding PartyRadar medals...\n')
  let upserted = 0
  let failed = 0

  for (const def of MEDAL_DEFS) {
    for (const t of def.tiers) {
      try {
        await prisma.medal.upsert({
          where: { slug_tier: { slug: def.slug, tier: t.tier } },
          create: {
            slug:          def.slug,
            name:          def.name,
            description:   t.description,
            icon:          def.icon,
            tier:          t.tier,
            category:      def.category,
            conditionType: def.conditionType,
            threshold:     t.threshold,
            sortOrder:     def.sortOrder,
          },
          update: {
            name:        def.name,
            description: t.description,
            icon:        def.icon,
            threshold:   t.threshold,
            sortOrder:   def.sortOrder,
          },
        })
        const bar = t.tier === 'BRONZE' ? '🟫' : t.tier === 'SILVER' ? '⬜' : '🟡'
        console.log(`  ${bar} ${def.slug} [${t.tier}] — need ${t.threshold}`)
        upserted++
      } catch (err) {
        console.error(`  ❌ ${def.slug} [${t.tier}]:`, err.message)
        failed++
      }
    }
  }

  console.log(`\n✅ Done — ${upserted} medals upserted, ${failed} failed.`)
  console.log('\nNow run: node scripts/seed-medals.mjs on Railway or locally with DATABASE_URL set.')
}

main().finally(() => prisma.$disconnect())
