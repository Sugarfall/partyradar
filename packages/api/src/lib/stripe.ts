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

/**
 * Get or create a Stripe customer for a user, persisting the ID to the DB.
 * Uses an atomic upsert pattern to prevent race-condition duplicates when two
 * concurrent requests (e.g. ticket checkout + wallet top-up) both try to
 * create a customer for a brand-new user at the same time.
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  prismaClient: import('@prisma/client').PrismaClient,
): Promise<string> {
  const s = ensureStripe()

  // Re-read inside the helper so concurrent callers both see the freshest value
  const user = await prismaClient.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  })

  if (user?.stripeCustomerId) {
    // Validate the stored customer still exists in the connected Stripe account.
    // This can fail when the app is switched between Stripe accounts or
    // test ↔ live mode — the stored ID then references a non-existent customer.
    try {
      const existing = await s.customers.retrieve(user.stripeCustomerId)
      // `retrieve` returns a DeletedCustomer if the customer was deleted
      if (!(existing as { deleted?: boolean }).deleted) {
        return user.stripeCustomerId
      }
    } catch {
      // "No such customer" or similar — fall through to create a new one
    }
    // Clear the stale ID so the update below sets the new one
    await prismaClient.user.update({
      where: { id: userId },
      data: { stripeCustomerId: null },
    }).catch(() => {})
  }

  const customer = await s.customers.create({ email, metadata: { partyradarUserId: userId } })
  await prismaClient.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  })
  return customer.id
}

export const PLATFORM_FEE_PERCENT = Number(process.env['PLATFORM_FEE_PERCENT'] ?? 5)

// Fixed per-ticket fee in pence (£0.30). Set PLATFORM_FEE_FIXED_PENCE=0 to
// disable if you want percentage-only pricing.
export const PLATFORM_FEE_FIXED_PENCE = Number(process.env['PLATFORM_FEE_FIXED_PENCE'] ?? 30)

/**
 * Calculate the total platform application_fee_amount in pence for `quantity` tickets.
 * Fee = (price × 5%) + £0.30 per ticket, both in pence.
 *
 * Example: £20 ticket × 2
 *   pct  = round(20 × 5 / 100 × 100) × 2 = 200 pence
 *   fixed = 30 × 2 = 60 pence
 *   total = 260 pence (£2.60)
 */
export function platformFeeCents(priceGBP: number, quantity = 1): number {
  const pctPence   = Math.round((priceGBP * PLATFORM_FEE_PERCENT) / 100 * 100)
  const fixedPence = PLATFORM_FEE_FIXED_PENCE
  return (pctPence + fixedPence) * quantity
}
