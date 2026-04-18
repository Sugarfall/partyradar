export type TierName = 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM'

export interface TierConfig {
  name: TierName
  label: string
  emoji: string
  priceMonthly: number
  color: string
  perks: string[]
  // Feature flags
  canViewYachtParties: boolean
  canViewBeachParties: boolean
  canSeeProfileViewers: boolean
  canRequestDJ: boolean
  canSeeMatchDistance: boolean
  canMessageMatches: boolean
  maxDailySwipes: number
  canCreateEvents: boolean
  canHostPaidEvents: boolean
  canSeeGuestList: boolean
  prioritySupport: boolean
  exclusiveEvents: boolean
  noAds: boolean
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
  },
  BASIC: {
    name: 'BASIC',
    label: 'Basic',
    emoji: '⚡',
    priceMonthly: 4.99,
    color: '#00e5ff',
    perks: [
      'Everything in Free',
      'Unlimited swipes',
      'See match distance',
      'Message your matches',
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
      'Host paid events',
      'See full guest list',
      'Priority in Nearby radar',
      'Exclusive PRO events access',
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
  },
}

export function getTier(tierName: string | null | undefined): TierConfig {
  return TIERS[(tierName as TierName) ?? 'FREE'] ?? TIERS.FREE
}

export function canAccess(tierName: string | null | undefined, feature: keyof Omit<TierConfig, 'name' | 'label' | 'emoji' | 'priceMonthly' | 'color' | 'perks' | 'maxDailySwipes'>): boolean {
  return getTier(tierName)[feature] as boolean
}
