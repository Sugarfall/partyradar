import Stripe from 'stripe'

export const stripe = new Stripe(process.env['STRIPE_SECRET_KEY']!, {
  apiVersion: '2024-12-18.acacia',
})

export const PLATFORM_FEE_PERCENT = Number(process.env['PLATFORM_FEE_PERCENT'] ?? 5)

/** Calculate platform fee in cents */
export function platformFeeCents(priceInDollars: number): number {
  return Math.round((priceInDollars * PLATFORM_FEE_PERCENT) / 100 * 100)
}
