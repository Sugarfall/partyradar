export type TierName = 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM'

export interface TierConfig {
  name: TierName
  label: string
  emoji: string
  priceMonthly: number
  color: string

  // ── Attendee perks (legacy field kept for backward compat) ──────────────
  perks: string[]

  // ── Attendee feature flags ──────────────────────────────────────────────
  canViewYachtParties: boolean
  canViewBeachParties: boolean
  canSeeProfileViewers: boolean
  canRequestDJ: boolean
  canSeeMatchDistance: boolean
  canMessageMatches: boolean
  maxDailySwipes: number         // -1 = unlimited
  canCreateEvents: boolean
  canHostPaidEvents: boolean
  canSeeGuestList: boolean
  prioritySupport: boolean
  exclusiveEvents: boolean
  noAds: boolean

  // ── Host feature flags (NEW) ────────────────────────────────────────────
  maxEventsPerMonth: number      // -1 = unlimited
  maxGuestsPerEvent: number      // -1 = unlimited
  pushBlastsPerMonth: number     // -1 = unlimited
  featuredPlacement: boolean
  brandPartnerships: boolean
  advancedAnalytics: boolean
  ticketSales: boolean

  // ── Host perks list (NEW) ───────────────────────────────────────────────
  hostPerks: string[]
}

export const TIERS: Record<TierName, TierConfig> = {
  FREE: {
    name: 'FREE',
    label: 'Free',
    emoji: '🎉',
    priceMonthly: 0,
    color: '#4a6080',

    perks: [
      'Discover events nearby',
      'Follow people',
      'RSVP to free events',
      '5 swipes per day',
      'Group chats',
    ],

    canViewYachtParties: false,
    canViewBeachParties: true,
    canSeeProfileViewers: false,
    canRequestDJ: false,
    canSeeMatchDistance: false,
    canMessageMatches: false,
    maxDailySwipes: 5,
    canCreateEvents: true,
    canHostPaidEvents: false,
    canSeeGuestList: false,
    prioritySupport: false,
    exclusiveEvents: false,
    noAds: false,

    maxEventsPerMonth: 1,
    maxGuestsPerEvent: 50,
    pushBlastsPerMonth: 0,
    featuredPlacement: false,
    brandPartnerships: false,
    advancedAnalytics: false,
    ticketSales: false,

    hostPerks: [
      '1 event per month',
      'Up to 50 attendees',
      'Free RSVPs only',
      'Basic event listing',
    ],
  },

  BASIC: {
    name: 'BASIC',
    label: 'Basic',
    emoji: '⚡',
    priceMonthly: 4.99,
    color: '#00e5ff',

    perks: [
      'Everything in Free',
      'See who\'s nearby (within 2km)',
      'Unlimited swipes',
      'Match & message people',
      'See match distance',
      'Request DJ songs',
      'View Yacht & Beach parties',
      'Buy tickets to paid events',
      'No ads',
    ],

    canViewYachtParties: true,
    canViewBeachParties: true,
    canSeeProfileViewers: false,
    canRequestDJ: true,
    canSeeMatchDistance: true,
    canMessageMatches: true,
    maxDailySwipes: -1,
    canCreateEvents: true,
    canHostPaidEvents: false,
    canSeeGuestList: false,
    prioritySupport: false,
    exclusiveEvents: false,
    noAds: true,

    maxEventsPerMonth: 3,
    maxGuestsPerEvent: 100,
    pushBlastsPerMonth: 0,
    featuredPlacement: false,
    brandPartnerships: false,
    advancedAnalytics: false,
    ticketSales: false,

    hostPerks: [
      'Up to 3 events per month',
      'Up to 100 attendees per event',
      'Free RSVPs only',
      'Basic event listing',
      'All attendee Basic perks included',
    ],
  },

  PRO: {
    name: 'PRO',
    label: 'Pro',
    emoji: '🔥',
    priceMonthly: 9.99,
    color: '#a855f7',

    perks: [
      'Everything in Basic',
      'See who viewed your profile',
      'Host paid ticketed events',
      'See full guest list',
      'Priority in Nearby & Match',
      'Access to exclusive PRO events',
      'Priority support',
    ],

    canViewYachtParties: true,
    canViewBeachParties: true,
    canSeeProfileViewers: true,
    canRequestDJ: true,
    canSeeMatchDistance: true,
    canMessageMatches: true,
    maxDailySwipes: -1,
    canCreateEvents: true,
    canHostPaidEvents: true,
    canSeeGuestList: true,
    prioritySupport: true,
    exclusiveEvents: true,
    noAds: true,

    maxEventsPerMonth: -1,
    maxGuestsPerEvent: 500,
    pushBlastsPerMonth: 3,
    featuredPlacement: false,
    brandPartnerships: false,
    advancedAnalytics: true,
    ticketSales: true,

    hostPerks: [
      'Unlimited events per month',
      'Up to 500 attendees per event',
      'Sell tickets & collect revenue',
      'Full guest list & attendance analytics',
      '3 push blast campaigns per month',
      'Event check-in QR scanner',
      'Priority support',
    ],
  },

  PREMIUM: {
    name: 'PREMIUM',
    label: 'Premium',
    emoji: '👑',
    priceMonthly: 19.99,
    color: '#ffd600',

    perks: [
      'Everything in Pro',
      'Golden profile badge',
      'Top of Nearby & Match feeds',
      'Create private exclusive events',
      'VIP guest list priority',
      'Dedicated account manager',
      'Early access to new features',
      'Custom profile theme & badge',
    ],

    canViewYachtParties: true,
    canViewBeachParties: true,
    canSeeProfileViewers: true,
    canRequestDJ: true,
    canSeeMatchDistance: true,
    canMessageMatches: true,
    maxDailySwipes: -1,
    canCreateEvents: true,
    canHostPaidEvents: true,
    canSeeGuestList: true,
    prioritySupport: true,
    exclusiveEvents: true,
    noAds: true,

    maxEventsPerMonth: -1,
    maxGuestsPerEvent: -1,
    pushBlastsPerMonth: -1,
    featuredPlacement: true,
    brandPartnerships: true,
    advancedAnalytics: true,
    ticketSales: true,

    hostPerks: [
      'Unlimited events & unlimited guests',
      'Unlimited push blast campaigns',
      'Featured placement on Discover',
      'Brand partnership opportunities',
      'White-label ticketing options',
      'Dedicated account manager',
      'Early access to new features',
      'All attendee Premium perks included',
    ],
  },
}

export function getTier(tierName: string | null | undefined): TierConfig {
  return TIERS[(tierName as TierName) ?? 'FREE'] ?? TIERS.FREE
}

export function canAccess(
  tierName: string | null | undefined,
  feature: keyof Omit<TierConfig, 'name' | 'label' | 'emoji' | 'priceMonthly' | 'color' | 'perks' | 'hostPerks' | 'maxDailySwipes' | 'maxEventsPerMonth' | 'maxGuestsPerEvent' | 'pushBlastsPerMonth'>,
): boolean {
  return getTier(tierName)[feature] as boolean
}
