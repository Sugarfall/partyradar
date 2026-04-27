/**
 * /api/wallet/issuing — Stripe Issuing virtual + physical card management
 *
 * Flow:
 *   1. POST /activate           → creates Stripe Cardholder + issues virtual card
 *   2. GET  /                   → list user's cards + last 20 transactions each
 *   3. POST /:id/freeze         → toggle freeze / unfreeze
 *   4. POST /:id/physical       → order physical card (requires existing virtual card)
 *   5. POST /:id/ephemeral-key  → server-side half of PCI-safe card detail reveal
 *
 * Balance deductions happen in the authorization webhook (issuing.ts routes only
 * manage card objects). The spend lifecycle is:
 *   card tap → issuing_authorization.request webhook → DB deduct + Stripe approve
 *           → issuing_transaction.created webhook  → record ledger entry
 */

import { Router } from 'express'
import type { Response, NextFunction } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { ensureStripe } from '../lib/stripe'
import { AppError } from '../middleware/errorHandler'
import { z } from 'zod'

const router = Router()
router.use(requireAuth)

// ─── Helper: get or create Stripe Cardholder ─────────────────────────────────

async function getOrCreateCardholderId(
  stripe: ReturnType<typeof ensureStripe>,
  userId: string,
  email: string,
  displayName: string,
  phoneNumber?: string | null,
): Promise<string> {
  // Reuse cardholder if any card already exists for this user
  const existing = await prisma.issuedCard.findFirst({
    where: { userId },
    select: { stripeCardholderId: true },
  })
  if (existing) return existing.stripeCardholderId

  const cardholder = await stripe.issuing.cardholders.create({
    type: 'individual',
    name: displayName,
    email,
    ...(phoneNumber ? { phone_number: phoneNumber } : {}),
    // Billing address required by Stripe — use a generic UK HQ address.
    // This is the cardholder record address, NOT where statements are sent.
    billing: {
      address: {
        line1: '1 Partyradar HQ',
        city: 'London',
        postal_code: 'EC1A 1BB',
        country: 'GB',
      },
    },
    status: 'active',
  })

  return cardholder.id
}

// ─── POST /api/wallet/issuing/activate ───────────────────────────────────────
// Idempotent — returns existing virtual card if already issued.

router.post('/activate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stripe = ensureStripe()
    const { dbUser } = req.user!

    // Check for existing virtual card first
    const existingCard = await prisma.issuedCard.findFirst({
      where: { userId: dbUser.id, type: 'VIRTUAL' },
    })
    if (existingCard) {
      res.json({ data: existingCard, alreadyActivated: true })
      return
    }

    // Need wallet + full user details
    const [wallet, user] = await Promise.all([
      prisma.wallet.findUnique({ where: { userId: dbUser.id } }),
      prisma.user.findUnique({
        where: { id: dbUser.id },
        select: { email: true, displayName: true, phoneNumber: true },
      }),
    ])

    if (!wallet) throw new AppError('Wallet not found — top up first to create your wallet', 404)
    if (!user?.email) throw new AppError('Account email required', 400)

    const cardholderId = await getOrCreateCardholderId(
      stripe,
      dbUser.id,
      user.email,
      user.displayName ?? dbUser.displayName ?? user.email.split('@')[0],
      user.phoneNumber,
    )

    // Create the virtual card in Stripe Issuing
    const stripeCard = await stripe.issuing.cards.create({
      cardholder: cardholderId,
      currency: 'gbp',
      type: 'virtual',
      status: 'active',
      spending_controls: {
        // Hard cap: £1 000 per single authorisation (matches MAX_BALANCE)
        spending_limits: [{ amount: 100_000, interval: 'per_authorization' }],
      },
    })

    const issuedCard = await prisma.issuedCard.create({
      data: {
        userId: dbUser.id,
        walletId: wallet.id,
        stripeCardholderId: cardholderId,
        stripeCardId: stripeCard.id,
        type: 'VIRTUAL',
        status: 'ACTIVE',
        last4: stripeCard.last4,
        expMonth: stripeCard.exp_month,
        expYear: stripeCard.exp_year,
        brand: stripeCard.brand,
      },
    })

    res.status(201).json({ data: issuedCard })
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/wallet/issuing ──────────────────────────────────────────────────

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { dbUser } = req.user!

    const cards = await prisma.issuedCard.findMany({
      where: { userId: dbUser.id },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    res.json({ data: cards })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/wallet/issuing/:cardId/freeze ──────────────────────────────────

router.post('/:cardId/freeze', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stripe = ensureStripe()
    const { dbUser } = req.user!
    const { cardId } = req.params as { cardId: string }

    const card = await prisma.issuedCard.findFirst({
      where: { id: cardId, userId: dbUser.id },
    })
    if (!card) throw new AppError('Card not found', 404)
    if (card.status === 'CANCELED') throw new AppError('Cancelled card cannot be modified', 400)
    if (card.status === 'SHIPPING') throw new AppError('Card must be activated before freezing', 400)

    const freeze = card.status === 'ACTIVE'          // true = freeze, false = unfreeze
    const newStripeStatus = freeze ? 'inactive' : 'active'
    const newDbStatus = freeze ? 'INACTIVE' : 'ACTIVE'

    await stripe.issuing.cards.update(card.stripeCardId, { status: newStripeStatus })

    const updated = await prisma.issuedCard.update({
      where: { id: cardId },
      data: { status: newDbStatus as 'ACTIVE' | 'INACTIVE' },
    })

    res.json({ data: updated, frozen: freeze })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/wallet/issuing/:cardId/activate-physical ─────────────────────
// Called when the physical card arrives and the user activates it via the app.

router.post('/:cardId/activate-physical', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stripe = ensureStripe()
    const { dbUser } = req.user!
    const { cardId } = req.params as { cardId: string }

    const card = await prisma.issuedCard.findFirst({
      where: { id: cardId, userId: dbUser.id, type: 'PHYSICAL' },
    })
    if (!card) throw new AppError('Physical card not found', 404)
    if (card.status !== 'SHIPPING') throw new AppError('Card is already active or cancelled', 400)

    await stripe.issuing.cards.update(card.stripeCardId, { status: 'active' })

    const updated = await prisma.issuedCard.update({
      where: { id: cardId },
      data: { status: 'ACTIVE', shippingStatus: 'delivered' },
    })

    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/wallet/issuing/:cardId/physical ───────────────────────────────
// Order a physical card. Requires an existing VIRTUAL card as the "parent"
// (Stripe links the physical card to the same cardholder + spending controls).

const physicalSchema = z.object({
  name: z.string().min(2).max(60),
  line1: z.string().min(3).max(100),
  city: z.string().min(2).max(60),
  postcode: z.string().min(4).max(10),
  country: z.string().length(2).default('GB'),
  expedited: z.boolean().default(false),
})

router.post('/:cardId/physical', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stripe = ensureStripe()
    const { dbUser } = req.user!
    const { cardId } = req.params as { cardId: string }
    const body = physicalSchema.parse(req.body)

    const virtualCard = await prisma.issuedCard.findFirst({
      where: { id: cardId, userId: dbUser.id, type: 'VIRTUAL' },
    })
    if (!virtualCard) throw new AppError('Virtual card not found', 404)

    // One physical card per user
    const alreadyOrdered = await prisma.issuedCard.findFirst({
      where: { userId: dbUser.id, type: 'PHYSICAL', status: { not: 'CANCELED' } },
    })
    if (alreadyOrdered) throw new AppError('Physical card already ordered', 400)

    // Issue physical card via Stripe — ships in 5-7 days (standard) or 2-3 (express)
    const stripeCard = await (stripe.issuing.cards.create as Function)({
      cardholder: virtualCard.stripeCardholderId,
      currency: 'gbp',
      type: 'physical',
      status: 'inactive',              // user activates via app on arrival
      original_card: virtualCard.stripeCardId,
      shipping: {
        name: body.name,
        address: {
          line1: body.line1,
          city: body.city,
          postal_code: body.postcode,
          country: body.country,
        },
        service: body.expedited ? 'express' : 'standard',
      },
      spending_controls: {
        spending_limits: [{ amount: 100_000, interval: 'per_authorization' }],
      },
    })

    const physicalCard = await prisma.issuedCard.create({
      data: {
        userId: dbUser.id,
        walletId: virtualCard.walletId,
        stripeCardholderId: virtualCard.stripeCardholderId,
        stripeCardId: stripeCard.id,
        type: 'PHYSICAL',
        status: 'SHIPPING',
        last4: stripeCard.last4,
        expMonth: stripeCard.exp_month,
        expYear: stripeCard.exp_year,
        brand: stripeCard.brand,
        shippingName: body.name,
        shippingLine1: body.line1,
        shippingCity: body.city,
        shippingPostcode: body.postcode,
        shippingCountry: body.country,
        shippingStatus: 'pending',
      },
    })

    res.status(201).json({ data: physicalCard })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/wallet/issuing/:cardId/ephemeral-key ──────────────────────────
// Server-side half of PCI-safe card detail reveal.
// Client generates a nonce via stripe.js, sends it here, we return an
// ephemeral key secret. Client passes that to stripe.js to render the
// card number, CVV, expiry in secure iframes — raw PAN never leaves Stripe.

router.post('/:cardId/ephemeral-key', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stripe = ensureStripe()
    const { dbUser } = req.user!
    const { cardId } = req.params as { cardId: string }
    const { nonce } = req.body as { nonce?: string }

    if (!nonce) throw new AppError('nonce is required', 400)

    const card = await prisma.issuedCard.findFirst({
      where: { id: cardId, userId: dbUser.id },
    })
    if (!card) throw new AppError('Card not found', 404)

    // Create a short-lived ephemeral key scoped to this card
    const ephemeralKey = await (stripe.ephemeralKeys.create as Function)(
      { issuing_card: card.stripeCardId, nonce },
      { apiVersion: '2025-02-24.acacia' },
    )

    res.json({ secret: (ephemeralKey as any).secret })
  } catch (err) {
    next(err)
  }
})

export default router
