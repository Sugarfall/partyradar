import Stripe from 'stripe'
import { AppError } from '../middleware/errorHandler'

const key = process.env['STRIPE_SECRET_KEY']

if (!key) {
  // Don't crash the whole server — Stripe-gated features (wallet, paid
  // subscriptions, tickets) will fail at request-time with a clean 503
  // via `ensureStripe()`. Everything else (feed, events, DMs) still works.
  console.warn('[stripe] STRIPE_SECRET_KEY is not set — payment endpoints will return 503')
}

// Cap every Stripe API call at 10 s so a slow/unresponsive Stripe response
// fails server-side before the browser's 12-second AbortController fires.
// Without this the browser gives up first and the user sees a confusing
// "Network error" instead of a clean "checkout unavailable" message.
export const stripe = key
  ? new Stripe(key, { apiVersion: '2025-02-24.acacia', timeout: 10_000 })
  : null as unknown as Stripe

/**
 * Call at the top of any route handler that needs Stripe. Throws a 503
 * AppError with a user-readable message if the integration isn't
 * configured, rather than letting a TypeError bubble up as an opaque
 * "Internal server error" from downstream `.customers.create(…)` calls.
 */
export function ensureStripe(): Stripe {
  if (!key) {
    throw new AppError('Payments are temporarily unavailable. Please try again later.', 503)
  }
  return stripe
}

export const PLATFORM_FEE_PERCENT = Number(process.env['PLATFORM_FEE_PERCENT'] ?? 5)

/** Calculate platform fee in cents */
export function platformFeeCents(priceInDollars: number): number {
  return Math.round((priceInDollars * PLATFORM_FEE_PERCENT) / 100 * 100)
}
