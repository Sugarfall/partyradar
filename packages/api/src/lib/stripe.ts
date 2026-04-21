import Stripe from 'stripe'

const key = process.env['STRIPE_SECRET_KEY']
export const stripe = key
  ? new Stripe(key, { apiVersion: '2025-02-24.acacia' })
  : null as any

export const PLATFORM_FEE_PERCENT = Number(process.env['PLATFORM_FEE_PERCENT'] ?? 5)

/** Calculate platform fee in cents */
export function platformFeeCents(priceInDollars: number): number {
  return Math.round((priceInDollars * PLATFORM_FEE_PERCENT) / 100 * 100)
}
