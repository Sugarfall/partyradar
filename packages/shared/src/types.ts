// ─── Enums ────────────────────────────────────────────────────────────────────

export type EventType = 'HOME_PARTY' | 'CLUB_NIGHT' | 'CONCERT' | 'PUB_NIGHT' | 'BEACH_PARTY' | 'YACHT_PARTY'
export type AlcoholPolicy = 'NONE' | 'PROVIDED' | 'BYOB'
export type AgeRestriction = 'ALL_AGES' | 'AGE_18' | 'AGE_21'
export type RSVPStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REMOVED'
export type Gender = 'MALE' | 'FEMALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY'
export type SubscriptionTier = 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM'
export type AccountMode = 'ATTENDEE' | 'HOST'
export type NotificationType =
  | 'RSVP_CONFIRMED'
  | 'INVITE_RECEIVED'
  | 'EVENT_REMINDER'
  | 'CELEBRITY_NEARBY'
  | 'EVENT_UPDATED'
  | 'PARTY_BLAST'
  | 'FOLLOW'
  | 'NUDGE'
  | 'GO_OUT_REQUEST'
  | 'GO_OUT_ACCEPTED'
  | 'PROFILE_VIEW'

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  firebaseUid: string
  email: string
  username: string
  displayName: string
  bio?: string | null
  photoUrl?: string | null
  gender?: Gender | null
  ageVerified: boolean
  alcoholFriendly: boolean
  showAlcoholEvents: boolean
  phoneNumber?: string | null
  phoneVerified: boolean
  profileBg?: string | null
  themeColor?: string | null
  themeName?: string | null
  socialScore: number
  lastLat?: number | null
  lastLng?: number | null
  lastSeenAt?: string | null
  subscriptionTier: SubscriptionTier
  accountMode: AccountMode
  stripeCustomerId?: string | null
  createdAt: string
}

export interface PublicUser {
  id: string
  username: string
  displayName: string
  photoUrl?: string | null
  bio?: string | null
  gender?: Gender | null
  ageVerified: boolean
  subscriptionTier: SubscriptionTier
}

export interface GenderRatio {
  male: number
  female: number
  nonBinary: number
  total: number
}

// ─── Event ────────────────────────────────────────────────────────────────────

export interface Event {
  id: string
  hostId: string
  host: PublicUser
  name: string
  type: EventType
  description: string
  startsAt: string
  endsAt?: string | null
  lat: number
  lng: number
  address: string
  neighbourhood: string
  showNeighbourhoodOnly: boolean
  capacity: number
  price: number
  ticketQuantity: number
  ticketsRemaining: number
  alcoholPolicy: AlcoholPolicy
  ageRestriction: AgeRestriction
  dressCode?: string | null
  whatToBring: string[]
  houseRules?: string | null
  vibeTags: string[]
  isInviteOnly: boolean
  inviteToken?: string | null
  isPublished: boolean
  /** HOME_PARTY only — emoji-coded vibe signals */
  partySigns?: string[] | null
  /** Lineup / performers for club nights / concerts */
  lineup?: string | null
  /** Venue or promoter brand name */
  venueName?: string | null
  isCancelled: boolean
  isFeatured: boolean
  coverImageUrl?: string | null
  accentColor?: string | null
  hostRating?: number | null
  guestCount: number
  genderRatio?: GenderRatio | null
  createdAt: string
  /** External sync fields */
  externalSource?: string | null
  socialSourceUrl?: string | null
  ticketmasterId?: string | null
  skiddleId?: string | null
  eventbriteId?: string | null
  eventbriteUrl?: string | null
}

export interface CreateEventInput {
  name: string
  type: EventType
  description: string
  startsAt: string
  endsAt?: string
  lat: number
  lng: number
  address: string
  neighbourhood: string
  showNeighbourhoodOnly: boolean
  capacity: number
  price: number
  ticketQuantity: number
  alcoholPolicy: AlcoholPolicy
  ageRestriction: AgeRestriction
  dressCode?: string
  whatToBring: string[]
  houseRules?: string
  vibeTags: string[]
  isInviteOnly: boolean
  coverImageUrl?: string
  /** HOME_PARTY only — emoji-coded vibe signals visible to attendees */
  partySigns?: string[]
  /** CLUB_NIGHT / CONCERT — lineup or performer names */
  lineup?: string
  /** CLUB_NIGHT — venue / promoter brand name */
  venueName?: string
}

export interface EventDiscoverQuery {
  type?: EventType
  excludeTypes?: string
  lat?: number
  lng?: number
  radius?: number
  alcohol?: boolean
  ageRestriction?: AgeRestriction
  vibes?: string[]
  page?: number
  limit?: number
  search?: string
  tonight?: boolean
}

// ─── Guest ────────────────────────────────────────────────────────────────────

export interface EventGuest {
  id: string
  eventId: string
  userId: string
  user: PublicUser
  status: RSVPStatus
  invitedAt: string
}

// ─── Ticket ───────────────────────────────────────────────────────────────────

export interface Ticket {
  id: string
  eventId: string
  userId: string
  event: Pick<Event, 'id' | 'name' | 'type' | 'startsAt' | 'neighbourhood' | 'address' | 'coverImageUrl'>
  qrCode: string
  pricePaid: number
  scannedAt?: string | null
  createdAt: string
}

// ─── Celebrity Sighting ───────────────────────────────────────────────────────

export interface CelebritySighting {
  id: string
  reporterId: string
  reporter: PublicUser
  celebrity: string
  lat: number
  lng: number
  description?: string | null
  photoUrl?: string | null
  upvotes: number
  downvotes: number
  expiresAt: string
  createdAt: string
  userVote?: 'up' | 'down' | null
}

export interface CreateSightingInput {
  celebrity: string
  lat: number
  lng: number
  description?: string
  photoUrl?: string
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export interface Subscription {
  id: string
  userId: string
  tier: SubscriptionTier
  stripeSubscriptionId?: string | null
  currentPeriodEnd?: string | null
  cancelAtPeriodEnd: boolean
  createdAt: string
}

// ─── Notification ─────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  data?: Record<string, unknown> | null
  read: boolean
  createdAt: string
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export interface ApiError {
  error: string
  code?: string
}

// ─── Wallet ──────────────────────────────────────────────────────────────────

export type WalletTxType = 'TOP_UP' | 'TICKET_PURCHASE' | 'DRINK_REWARD' | 'CARD_ORDER' | 'VENUE_SPEND' | 'REFERRAL_CREDIT' | 'BONUS' | 'WITHDRAWAL'
export type WalletTxStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED'
export type CardDesign = 'CLASSIC_BLACK' | 'NEON_NIGHTS' | 'GOLD_VIP' | 'HOLOGRAPHIC' | 'CUSTOM'
export type CardOrderStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'
export type LoyaltyTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum'

export interface WalletInfo {
  id: string
  balance: number
  rewardPoints: number
  freeDrinksAvailable: number
  freeDrinksUsed: number
  freeDrinksEarned: number
  pointsToNextDrink: number
  lifetimeSpent: number
  lifetimeTopUp: number
}

export interface WalletTransaction {
  id: string
  walletId: string
  type: WalletTxType
  amount: number
  balanceAfter: number
  description: string
  status: WalletTxStatus
  eventId?: string | null
  venueId?: string | null
  createdAt: string
}

export interface CardOrder {
  id: string
  design: CardDesign
  nameOnCard: string
  shippingAddress: string
  shippingCity: string
  shippingPostcode: string
  price: number
  status: CardOrderStatus
  trackingNumber?: string | null
  createdAt: string
}
