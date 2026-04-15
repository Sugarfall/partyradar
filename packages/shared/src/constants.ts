import type { SubscriptionTier } from './types'

// ─── Subscription Tiers ───────────────────────────────────────────────────────

export interface TierConfig {
  name: string
  price: number
  maxEvents: number        // -1 = unlimited
  maxGuests: number        // -1 = unlimited, 0 = none
  ticketSales: boolean
  featured: boolean
  analytics: boolean
  radar: boolean
  description: string
  perks: string[]
}

export const TIERS: Record<SubscriptionTier, TierConfig> = {
  FREE: {
    name: 'Free',
    price: 0,
    maxEvents: 1,
    maxGuests: 0,
    ticketSales: false,
    featured: false,
    analytics: false,
    radar: false,
    description: 'Browse and RSVP to events',
    perks: ['Browse all public events', 'RSVP to events', 'Create 1 free event'],
  },
  BASIC: {
    name: 'Basic',
    price: 4.99,
    maxEvents: 3,
    maxGuests: 20,
    ticketSales: false,
    featured: false,
    analytics: false,
    radar: false,
    description: 'Host small events',
    perks: ['Everything in Free', 'Up to 3 events/month', '20 guest invites per event'],
  },
  PRO: {
    name: 'Pro',
    price: 9.99,
    maxEvents: -1,
    maxGuests: -1,
    ticketSales: true,
    featured: false,
    analytics: false,
    radar: true,
    description: 'Unlimited hosting + ticket sales',
    perks: [
      'Everything in Basic',
      'Unlimited events & guests',
      'Ticket sales (5% platform fee)',
      'Celebrity radar access',
      'Priority listing',
    ],
  },
  PREMIUM: {
    name: 'Premium',
    price: 19.99,
    maxEvents: -1,
    maxGuests: -1,
    ticketSales: true,
    featured: true,
    analytics: true,
    radar: true,
    description: 'Full-featured with analytics & spotlight',
    perks: [
      'Everything in Pro',
      'Featured placement on discovery feed',
      'Event analytics dashboard',
      'Early access to celebrity radar',
    ],
  },
}

// ─── Event Types ──────────────────────────────────────────────────────────────

export const EVENT_TYPE_LABELS: Record<string, string> = {
  HOME_PARTY: 'House Party',
  CLUB_NIGHT: 'Club Night',
  CONCERT: 'Concert',
  PUB_NIGHT: 'Pub Night',
}

export const EVENT_TYPE_COLORS: Record<string, string> = {
  HOME_PARTY: '#ec4899',   // pink
  CLUB_NIGHT: '#a855f7',   // purple
  CONCERT: '#3b82f6',      // blue
  PUB_NIGHT: '#f59e0b',    // amber
}

export const EVENT_TYPE_BG: Record<string, string> = {
  HOME_PARTY: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  CLUB_NIGHT: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  CONCERT: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PUB_NIGHT: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

// ─── Alcohol Policy ───────────────────────────────────────────────────────────

export const ALCOHOL_POLICY_LABELS: Record<string, string> = {
  NONE: 'No Alcohol',
  PROVIDED: 'Alcohol Provided',
  BYOB: 'BYOB',
}

// ─── Age Restriction ──────────────────────────────────────────────────────────

export const AGE_RESTRICTION_LABELS: Record<string, string> = {
  ALL_AGES: 'All Ages',
  AGE_18: '18+',
  AGE_21: '21+',
}

// ─── Vibe Tags ────────────────────────────────────────────────────────────────

export const VIBE_TAGS = [
  'chill', 'rave', 'rooftop', 'garden', 'formal', 'casual',
  'live music', 'DJ', 'themed', 'networking', 'underground',
  'exclusive', 'outdoor', 'warehouse', 'intimate', 'massive',
]

// ─── Push Blast Tiers ─────────────────────────────────────────────────────────

export interface PushBlastTier {
  id: string
  label: string
  sublabel: string   // e.g. "0.8 km · ~2 sq km"
  radius: number     // miles; 0 = city-wide (no geo filter)
  km: number         // radius in km (0 = city-wide)
  price: number      // GBP
  reach: string
}

export const PUSH_BLAST_TIERS: PushBlastTier[] = [
  { id: 'LOCAL',    label: 'Street',       sublabel: '0.5 mi · 0.8 km',  radius: 0.5,  km: 0.8,  price: 1.99,  reach: '~150 people'    },
  { id: 'NEARBY',   label: 'Neighbourhood',sublabel: '2 mi · 3.2 km',    radius: 2,    km: 3.2,  price: 4.99,  reach: '~700 people'    },
  { id: 'DISTRICT', label: 'District',     sublabel: '5 mi · 8 km',      radius: 5,    km: 8,    price: 9.99,  reach: '~2,500 people'  },
  { id: 'CITY',     label: 'City-wide',    sublabel: '15 mi · 24 km',    radius: 15,   km: 24,   price: 19.99, reach: '~10,000 people' },
]

// ─── Paid Group Tiers ────────────────────────────────────────────────────────

export interface GroupPriceTier {
  id: string
  label: string
  price: number      // GBP / month
  description: string
}

export const GROUP_PRICE_TIERS: GroupPriceTier[] = [
  { id: 'MICRO',    label: 'Micro',     price: 0.99,  description: 'Exclusive tips & early access' },
  { id: 'STANDARD', label: 'Standard',  price: 2.99,  description: 'Premium content & priority entry' },
  { id: 'VIP',      label: 'VIP',       price: 4.99,  description: 'Inner circle — direct access to host' },
  { id: 'ELITE',    label: 'Elite',     price: 9.99,  description: 'Full backstage — guestlist & perks' },
  { id: 'CUSTOM',   label: 'Custom',    price: 0,     description: 'Set your own monthly price' },
]

// ─── Referral Program ────────────────────────────────────────────────────────

export const REFERRAL_CONFIG = {
  /** % of the referred user's first ticket purchase the referrer earns */
  TICKET_COMMISSION_PERCENT: 10,
  /** % of the referred user's subscription the referrer earns (recurring) */
  SUBSCRIPTION_COMMISSION_PERCENT: 15,
  /** % of group subscription revenue the referrer earns */
  GROUP_COMMISSION_PERCENT: 10,
  /** Platform cut from group subscription revenue (rest goes to group creator) */
  GROUP_PLATFORM_CUT_PERCENT: 20,
  /** Flat bonus (£) when a referred user makes their first purchase */
  FIRST_PURCHASE_BONUS: 1.00,
  /** Minimum balance to request payout (£) */
  MIN_PAYOUT: 5.00,
}

// ─── Wallet & Loyalty ────────────────────────────────────────────────────────

export interface WalletTopUpTier {
  id: string
  amount: number     // GBP
  bonusPercent: number
  label: string
}

export const WALLET_TOP_UP_TIERS: WalletTopUpTier[] = [
  { id: 'SMALL',    amount: 10,   bonusPercent: 0,   label: '£10' },
  { id: 'MEDIUM',   amount: 25,   bonusPercent: 5,   label: '£25 (+5% bonus)' },
  { id: 'LARGE',    amount: 50,   bonusPercent: 10,  label: '£50 (+10% bonus)' },
  { id: 'VIP',      amount: 100,  bonusPercent: 15,  label: '£100 (+15% bonus)' },
]

export const WALLET_CONFIG = {
  /** Points earned per £1 spent via wallet */
  POINTS_PER_POUND: 10,
  /** Points needed for a free drink reward */
  POINTS_PER_FREE_DRINK: 500,             // Spend £50 = 1 free drink
  /** Max free drinks redeemable per night */
  MAX_FREE_DRINKS_PER_NIGHT: 2,
  /** Minimum top-up (£) */
  MIN_TOP_UP: 5,
  /** Maximum top-up (£) */
  MAX_TOP_UP: 500,
  /** Maximum wallet balance (£) */
  MAX_BALANCE: 1000,
}

export interface CardDesignOption {
  id: string
  name: string
  price: number      // GBP
  description: string
  previewUrl: string  // filled by frontend
}

export const CARD_DESIGNS: CardDesignOption[] = [
  { id: 'CLASSIC_BLACK',  name: 'Classic Black',   price: 9.99,  description: 'Matte black with embossed logo',     previewUrl: '' },
  { id: 'NEON_NIGHTS',    name: 'Neon Nights',     price: 12.99, description: 'UV-reactive neon glow design',       previewUrl: '' },
  { id: 'GOLD_VIP',       name: 'Gold VIP',        price: 19.99, description: 'Metallic gold with VIP hologram',    previewUrl: '' },
  { id: 'HOLOGRAPHIC',    name: 'Holographic',     price: 14.99, description: 'Rainbow holographic shimmer',        previewUrl: '' },
  { id: 'CUSTOM',         name: 'Custom Design',   price: 24.99, description: 'Upload your own artwork',            previewUrl: '' },
]

// ─── Platform Revenue Model ─────────────────────────────────────────────────

export const REVENUE_MODEL = {
  // ── Ticket Sales ──────────────────────────────
  TICKET_PLATFORM_FEE_PERCENT: 5,       // 5% of every ticket sale
  TICKET_PROCESSING_FEE: 0.30,          // £0.30 flat per ticket (Stripe pass-through)

  // ── Host Subscriptions ────────────────────────
  // 100% to platform (£4.99 / £9.99 / £19.99 per month)

  // ── Paid Group Chats ──────────────────────────
  GROUP_PLATFORM_CUT_PERCENT: 20,       // Platform keeps 20%, creator gets 80%

  // ── Push Blasts ───────────────────────────────
  // 100% to platform (£1.99 – £19.99 per blast)

  // ── Wallet & Venue Spend ──────────────────────
  VENUE_COMMISSION_PERCENT: 3,          // 3% merchant fee venues pay on wallet transactions
  WALLET_FLOAT_INTEREST: true,          // Platform earns interest on held balances

  // ── Physical Cards ────────────────────────────
  CARD_COST_OF_GOODS: 3.50,             // Approx production + shipping cost
  // Margin = card price - £3.50 (ranges £6.49 to £21.49 per card)

  // ── Sponsored / Featured ──────────────────────
  FEATURED_EVENT_DAILY_RATE: 4.99,      // £4.99/day for featured placement
  SPONSORED_VENUE_MONTHLY: 49.99,       // £49.99/month for venue spotlight

  // ── Data Insights (B2B) ───────────────────────
  VENUE_ANALYTICS_MONTHLY: 29.99,       // Anonymised foot traffic, demographics, peak hours
}

// ─── Design tokens (shared) ───────────────────────────────────────────────────

export const CELEBRITY_MARKER_COLOR = '#f59e0b'  // gold
export const RADAR_EXPIRY_HOURS = Number(process.env['CELEBRITY_EXPIRY_HOURS'] ?? 2)
export const PLATFORM_FEE_PERCENT = 5

// ─── Celebrity autocomplete list ─────────────────────────────────────────────

export const CELEBRITY_LIST = [
  'Taylor Swift', 'Drake', 'Beyoncé', 'Rihanna', 'Jay-Z',
  'Kanye West', 'Kim Kardashian', 'Justin Bieber', 'Ariana Grande',
  'Billie Eilish', 'Dua Lipa', 'Harry Styles', 'Olivia Rodrigo',
  'The Weeknd', 'Post Malone', 'Cardi B', 'Nicki Minaj', 'Bad Bunny',
  'Travis Scott', 'Kendrick Lamar', 'SZA', 'Lizzo', 'Doja Cat',
  'Ed Sheeran', 'Adele', 'Bruno Mars', 'Lady Gaga', 'Katy Perry',
  'Selena Gomez', 'Zendaya', 'Tom Holland', 'Ryan Reynolds',
  'Margot Robbie', 'Timothée Chalamet', 'Florence Pugh',
  'Sydney Sweeney', 'Pedro Pascal', 'Chris Evans', 'Scarlett Johansson',
  'Jennifer Lopez', 'Diddy', 'Lil Wayne', 'Eminem', 'Snoop Dogg',
  'Ice Spice', 'Latto', 'GloRilla', 'Sexyy Red', 'Central Cee',
  'Dave', 'Stormzy', 'Little Simz', 'Jorja Smith',
]
