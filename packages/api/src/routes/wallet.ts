import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { stripe } from '../lib/stripe'
import { WALLET_CONFIG, WALLET_TOP_UP_TIERS, CARD_DESIGNS, REVENUE_MODEL } from '@partyradar/shared'
import { z } from 'zod'

const router = Router()

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getOrCreateWallet(userId: string) {
  let wallet = await prisma.wallet.findUnique({ where: { userId } })
  if (!wallet) {
    wallet = await prisma.wallet.create({ data: { userId } })
  }
  return wallet
}

async function recordPlatformRevenue(source: string, amount: number, referenceId?: string, description?: string) {
  await prisma.platformRevenue.create({
    data: { source, amount, referenceId, description },
  })
}

// ─── GET /api/wallet — get my wallet ─────────────────────────────────────────

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const wallet = await getOrCreateWallet(req.user!.dbUser.id)

    const recentTx = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const freeDrinksAvailable = wallet.freeDrinksEarned - wallet.freeDrinksUsed
    // Bug 17 fix: remainder of 0 means the user is exactly at a threshold (already earned a drink)
    const remainder = wallet.rewardPoints % WALLET_CONFIG.POINTS_PER_FREE_DRINK
    const pointsToNextDrink = remainder === 0 ? 0 : WALLET_CONFIG.POINTS_PER_FREE_DRINK - remainder

    res.json({
      data: {
        id: wallet.id,
        balance: wallet.balance,
        rewardPoints: wallet.rewardPoints,
        freeDrinksAvailable,
        freeDrinksUsed: wallet.freeDrinksUsed,
        freeDrinksEarned: wallet.freeDrinksEarned,
        pointsToNextDrink,
        lifetimeSpent: wallet.lifetimeSpent,
        lifetimeTopUp: wallet.lifetimeTopUp,
        transactions: recentTx,
        topUpTiers: WALLET_TOP_UP_TIERS,
        config: WALLET_CONFIG,
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/wallet/top-up — create Stripe checkout for top-up ─────────────

router.post('/top-up', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({
    tierId: z.string().optional(),
    amount: z.number().min(WALLET_CONFIG.MIN_TOP_UP).max(WALLET_CONFIG.MAX_TOP_UP).optional(),
  })
  try {
    const body = schema.parse(req.body)
    const userId = req.user!.dbUser.id
    const wallet = await getOrCreateWallet(userId)

    // Determine amount
    let topUpAmount: number
    let bonusPercent = 0

    if (body.tierId) {
      const tier = WALLET_TOP_UP_TIERS.find((t) => t.id === body.tierId)
      if (!tier) throw new AppError('Invalid top-up tier', 400)
      topUpAmount = tier.amount
      bonusPercent = tier.bonusPercent
    } else if (body.amount) {
      topUpAmount = body.amount
    } else {
      throw new AppError('Provide tierId or amount', 400)
    }

    // Check max balance
    if (wallet.balance + topUpAmount > WALLET_CONFIG.MAX_BALANCE) {
      throw new AppError(`Wallet balance cannot exceed £${WALLET_CONFIG.MAX_BALANCE}`, 400)
    }

    // Get or create Stripe customer
    let stripeCustomerId = wallet.stripeCustomerId
    if (!stripeCustomerId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, stripeCustomerId: true } })
      stripeCustomerId = user?.stripeCustomerId ?? null

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({ email: user!.email })
        stripeCustomerId = customer.id
        await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId } })
      }
      await prisma.wallet.update({ where: { id: wallet.id }, data: { stripeCustomerId } })
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: `PartyRadar Wallet Top-Up — £${topUpAmount}`,
            description: bonusPercent > 0 ? `Includes ${bonusPercent}% bonus (£${(topUpAmount * bonusPercent / 100).toFixed(2)} extra)` : 'Add funds to your PartyRadar wallet',
          },
          unit_amount: Math.round(topUpAmount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/wallet?success=true`,
      cancel_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/wallet`,
      metadata: {
        type: 'wallet_topup',
        userId,
        walletId: wallet.id,
        topUpAmount: String(topUpAmount),
        bonusPercent: String(bonusPercent),
      },
    })

    res.json({ data: { url: session.url, sessionId: session.id } })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/wallet/spend — spend wallet at venue (QR code scanned) ────────

router.post('/spend', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({
    venueId: z.string(),
    amount: z.number().positive(),
    description: z.string().max(200).optional(),
    items: z.array(z.object({ name: z.string(), price: z.number(), qty: z.number() })).optional(),
  })
  try {
    const { venueId, amount, description, items } = schema.parse(req.body)
    const userId = req.user!.dbUser.id
    const wallet = await getOrCreateWallet(userId)

    if (wallet.balance < amount) {
      throw new AppError('Insufficient wallet balance', 400)
    }

    // Check venue partnership
    const partnership = await prisma.venuePartnership.findUnique({ where: { venueId } })
    const commissionRate = partnership?.commissionRate ?? REVENUE_MODEL.VENUE_COMMISSION_PERCENT
    const platformCut = Number((amount * commissionRate / 100).toFixed(2))

    // Deduct from wallet
    const newBalance = Number((wallet.balance - amount).toFixed(2))
    const pointsEarned = Math.floor(amount * WALLET_CONFIG.POINTS_PER_POUND)
    const newPoints = wallet.rewardPoints + pointsEarned

    // Check if this pushes them to a new free drink
    const oldDrinkCount = Math.floor(wallet.rewardPoints / WALLET_CONFIG.POINTS_PER_FREE_DRINK)
    const newDrinkCount = Math.floor(newPoints / WALLET_CONFIG.POINTS_PER_FREE_DRINK)
    const drinksEarned = newDrinkCount - oldDrinkCount

    const updated = await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: newBalance,
        lifetimeSpent: { increment: amount },
        rewardPoints: newPoints,
        freeDrinksEarned: { increment: drinksEarned },
      },
    })

    // Record transaction
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'VENUE_SPEND',
        amount: -amount,
        balanceAfter: newBalance,
        description: description ?? `Spent at venue`,
        venueId,
        metadata: items ? { items } : undefined,
      },
    })

    // Record platform revenue
    if (platformCut > 0) {
      await recordPlatformRevenue('venue_commission', platformCut, venueId, `${commissionRate}% commission on £${amount} wallet spend`)

      // Update partnership totals
      if (partnership) {
        await prisma.venuePartnership.update({
          where: { venueId },
          data: { totalRevenue: { increment: amount }, totalOrders: { increment: 1 } },
        })
      }
    }

    res.json({
      data: {
        success: true,
        newBalance: updated.balance,
        pointsEarned,
        totalPoints: newPoints,
        freeDrinksEarned: drinksEarned > 0 ? drinksEarned : 0,
        freeDrinksAvailable: updated.freeDrinksEarned - updated.freeDrinksUsed,
        message: drinksEarned > 0
          ? `🍹 You earned ${drinksEarned} free drink${drinksEarned > 1 ? 's' : ''}!`
          : `+${pointsEarned} points earned`,
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/wallet/redeem-drink — redeem a free drink at a venue ──────────

router.post('/redeem-drink', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({ venueId: z.string() })
  try {
    const { venueId } = schema.parse(req.body)
    const userId = req.user!.dbUser.id
    const wallet = await getOrCreateWallet(userId)

    const available = wallet.freeDrinksEarned - wallet.freeDrinksUsed
    if (available <= 0) {
      throw new AppError('No free drinks available', 400)
    }

    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { freeDrinksUsed: { increment: 1 } },
    })

    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'DRINK_REWARD',
        amount: 0,
        balanceAfter: wallet.balance,
        description: '🍹 Free drink redeemed',
        venueId,
      },
    })

    res.json({
      data: {
        success: true,
        freeDrinksRemaining: available - 1,
        message: '🍹 Free drink redeemed! Show this to the bartender.',
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─── POST /api/wallet/order-card — order a physical PartyRadar card ──────────

router.post('/order-card', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({
    design: z.enum(['CLASSIC_BLACK', 'NEON_NIGHTS', 'GOLD_VIP', 'HOLOGRAPHIC', 'CUSTOM']),
    customImageUrl: z.string().optional(),
    nameOnCard: z.string().min(2).max(30),
    shippingAddress: z.string().min(5),
    shippingCity: z.string().min(2),
    shippingPostcode: z.string().min(3),
    payWithWallet: z.boolean().default(false),
  })
  try {
    const body = schema.parse(req.body)
    const userId = req.user!.dbUser.id
    const wallet = await getOrCreateWallet(userId)

    const cardDesign = CARD_DESIGNS.find((c) => c.id === body.design)
    if (!cardDesign) throw new AppError('Invalid card design', 400)

    if (body.design === 'CUSTOM' && !body.customImageUrl) {
      throw new AppError('Custom design requires an image URL', 400)
    }

    const price = cardDesign.price

    if (body.payWithWallet) {
      // Pay with wallet balance
      if (wallet.balance < price) {
        throw new AppError('Insufficient wallet balance', 400)
      }

      const newBalance = Number((wallet.balance - price).toFixed(2))
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance, lifetimeSpent: { increment: price } },
      })

      await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'CARD_ORDER',
          amount: -price,
          balanceAfter: newBalance,
          description: `Physical card: ${cardDesign.name}`,
        },
      })

      const order = await prisma.cardOrder.create({
        data: {
          walletId: wallet.id,
          userId,
          design: body.design as any,
          customImageUrl: body.customImageUrl,
          nameOnCard: body.nameOnCard,
          shippingAddress: body.shippingAddress,
          shippingCity: body.shippingCity,
          shippingPostcode: body.shippingPostcode,
          price,
        },
      })

      // Record platform revenue (card sale margin)
      await recordPlatformRevenue('card_sale', price - REVENUE_MODEL.CARD_COST_OF_GOODS, order.id, `${cardDesign.name} card order`)

      res.json({ data: { order, paidWith: 'wallet' } })
    } else {
      // Pay with Stripe
      let stripeCustomerId = wallet.stripeCustomerId
      if (!stripeCustomerId) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
        const customer = await stripe.customers.create({ email: user!.email })
        stripeCustomerId = customer.id
        await prisma.wallet.update({ where: { id: wallet.id }, data: { stripeCustomerId } })
      }

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `PartyRadar Card — ${cardDesign.name}`,
              description: cardDesign.description,
            },
            unit_amount: Math.round(price * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/wallet/card-ordered?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/wallet`,
        metadata: {
          type: 'card_order',
          userId,
          walletId: wallet.id,
          design: body.design,
          customImageUrl: body.customImageUrl ?? '',
          nameOnCard: body.nameOnCard,
          shippingAddress: body.shippingAddress,
          shippingCity: body.shippingCity,
          shippingPostcode: body.shippingPostcode,
        },
      })

      res.json({ data: { url: session.url, sessionId: session.id } })
    }
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/wallet/cards — get my card orders ──────────────────────────────

router.get('/cards', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const wallet = await getOrCreateWallet(req.user!.dbUser.id)
    const orders = await prisma.cardOrder.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ data: { orders, designs: CARD_DESIGNS } })
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/wallet/rewards — loyalty stats ─────────────────────────────────

router.get('/rewards', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const wallet = await getOrCreateWallet(req.user!.dbUser.id)

    const freeDrinksAvailable = wallet.freeDrinksEarned - wallet.freeDrinksUsed
    const progressToNext = wallet.rewardPoints % WALLET_CONFIG.POINTS_PER_FREE_DRINK
    const progressPercent = Math.round((progressToNext / WALLET_CONFIG.POINTS_PER_FREE_DRINK) * 100)
    const spendToNextDrink = Number(((WALLET_CONFIG.POINTS_PER_FREE_DRINK - progressToNext) / WALLET_CONFIG.POINTS_PER_POUND).toFixed(2))

    // Tier based on lifetime spend
    let loyaltyTier = 'Bronze'
    if (wallet.lifetimeSpent >= 500) loyaltyTier = 'Platinum'
    else if (wallet.lifetimeSpent >= 200) loyaltyTier = 'Gold'
    else if (wallet.lifetimeSpent >= 50) loyaltyTier = 'Silver'

    res.json({
      data: {
        rewardPoints: wallet.rewardPoints,
        freeDrinksAvailable,
        freeDrinksEarned: wallet.freeDrinksEarned,
        freeDrinksUsed: wallet.freeDrinksUsed,
        progressPercent,
        spendToNextDrink,
        loyaltyTier,
        lifetimeSpent: wallet.lifetimeSpent,
        perks: {
          Bronze: ['10 points per £1 spent', '1 free drink per 500 points'],
          Silver: ['10 points per £1 spent', '1 free drink per 500 points', 'Priority queue at partner venues'],
          Gold: ['10 points per £1 spent', '1 free drink per 500 points', 'Priority queue', 'Exclusive event invites'],
          Platinum: ['10 points per £1 spent', '1 free drink per 500 points', 'Priority queue', 'Exclusive invites', 'Free card upgrade', 'VIP entry'],
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─── GET /api/wallet/revenue-model — public: how the platform earns ──────────

router.get('/revenue-model', (_req, res) => {
  res.json({
    data: {
      streams: [
        {
          name: 'Ticket Sales Commission',
          rate: '5% + £0.30 per ticket',
          description: 'Platform fee on every ticket sold through PartyRadar',
          example: '£20 ticket → £1.30 to platform, £18.70 to host',
          recurring: false,
        },
        {
          name: 'Host Subscriptions',
          rate: '£4.99 – £19.99/month',
          tiers: { Basic: '£4.99', Pro: '£9.99', Premium: '£19.99' },
          description: '100% recurring revenue from hosts who want advanced features',
          recurring: true,
        },
        {
          name: 'Paid Group Chats',
          rate: '20% platform cut',
          description: 'Creators set monthly price (£0.99–£9.99), platform takes 20%, creator gets 80%',
          example: '100 subs × £4.99/mo = £499/mo → £99.80 platform, £399.20 creator',
          recurring: true,
        },
        {
          name: 'Push Blast Notifications',
          rate: '£1.99 – £19.99 per blast',
          description: '100% revenue from geo-targeted push notifications to users',
          recurring: false,
        },
        {
          name: 'Wallet & Venue Spending',
          rate: '3% merchant commission',
          description: 'Venues pay 3% on wallet transactions — users pay nothing extra',
          example: 'User spends £30 at bar via wallet → £0.90 to platform',
          recurring: true,
        },
        {
          name: 'Wallet Float Interest',
          rate: 'Variable',
          description: 'Interest earned on held wallet balances (aggregate user deposits)',
          recurring: true,
        },
        {
          name: 'Physical Card Sales',
          rate: '£9.99 – £24.99 per card',
          description: 'Branded physical cards users use at venues, with custom designs',
          margin: '~65-85% margin per card',
          recurring: false,
        },
        {
          name: 'Featured Events',
          rate: '£4.99/day',
          description: 'Premium placement on discovery feed for higher visibility',
          recurring: false,
        },
        {
          name: 'Sponsored Venue Listings',
          rate: '£49.99/month',
          description: 'Venue spotlight — priority placement + analytics',
          recurring: true,
        },
        {
          name: 'Venue Analytics (B2B)',
          rate: '£29.99/month',
          description: 'Anonymised foot traffic data, demographics, peak hours for venue owners',
          recurring: true,
        },
      ],
      feeBreakdown: {
        ticketSale: {
          hostGets: '95% − £0.30',
          platformGets: '5% + £0.30',
          stripeGets: '1.4% + 20p (UK cards)',
        },
        groupChat: {
          creatorGets: '80%',
          platformGets: '20%',
        },
        venueSpend: {
          userPays: '£0 extra',
          venuePays: '3% commission',
          platformGets: '3% of transaction',
        },
        referral: {
          referrerEarns: '10% of ticket + 15% of subscription + 10% of group',
          firstPurchaseBonus: '£1.00',
        },
      },
    },
  })
})

export { getOrCreateWallet, recordPlatformRevenue }
export default router
