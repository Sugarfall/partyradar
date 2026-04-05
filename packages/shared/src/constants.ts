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
  HOME_PARTY: 'Home Party',
  CLUB_NIGHT: 'Club Night',
  CONCERT: 'Concert',
}

export const EVENT_TYPE_COLORS: Record<string, string> = {
  HOME_PARTY: '#ec4899',   // pink
  CLUB_NIGHT: '#a855f7',   // purple
  CONCERT: '#3b82f6',      // blue
}

export const EVENT_TYPE_BG: Record<string, string> = {
  HOME_PARTY: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  CLUB_NIGHT: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  CONCERT: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
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
  radius: number    // miles; 0 = city-wide (no geo filter)
  price: number     // GBP
  reach: string
}

export const PUSH_BLAST_TIERS: PushBlastTier[] = [
  { id: 'LOCAL',    label: '0.5 mile radius', radius: 0.5,  price: 1.99,  reach: '~50 people'    },
  { id: 'NEARBY',   label: '2 mile radius',   radius: 2,    price: 4.99,  reach: '~200 people'   },
  { id: 'DISTRICT', label: '5 mile radius',   radius: 5,    price: 9.99,  reach: '~500 people'   },
  { id: 'CITY',     label: 'City-wide',       radius: 0,    price: 19.99, reach: '~2,000 people' },
]

// ─── Design tokens (shared) ───────────────────────────────────────────────────

export const CELEBRITY_MARKER_COLOR = '#f59e0b'  // gold
export const RADAR_EXPIRY_HOURS = 6
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
