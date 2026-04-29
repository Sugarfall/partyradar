export * from './types'
export * from './constants'
// TIERS (comprehensive 25-flag feature matrix) + helpers come from tiers.ts.
// HOST_TIERS (simple host gate values) comes from constants.ts above.
export { TIERS, getTier, canAccess } from './tiers'
export type { TierName, TierConfig } from './tiers'
