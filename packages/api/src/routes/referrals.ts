import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { REFERRAL_CONFIG } from '@partyradar/shared'
import { getGBPRates } from '../lib/fx'
import crypto from 'crypto'

const router = Router()

function generateCode(username: string): string {
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase()
  return `${username.toUpperCase().slice(0, 8)}-${suffix}`
}

/** Validate a custom referral code: 3-20 alphanumeric + dash, uppercase only */
function isValidCustomCode(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{1,18}[A-Z0-9]$/.test(code)
}

/** GET /api/referrals — get my referral info */
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true, referralBalance: true, username: true, currency: true },
    })
    if (!user) throw new AppError('User not found', 404)

    // Generate code if user doesn't have one
    let code = user.referralCode
    if (!code) {
      code = generateCode(user.username)
      await prisma.user.update({ where: { id: userId }, data: { referralCode: code } })
    }

    // Count referrals
    const referrals = await prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const totalEarned = referrals.reduce((sum, r) => sum + r.earnedAmount.toNumber(), 0)
    const pendingPayout = user.referralBalance.toNumber()
    // Active = referee has made at least one purchase (earnedAmount > 0 on referral record)
    const activeReferrals = referrals.filter((r) => r.earnedAmount.toNumber() > 0)
    const inactiveReferrals = referrals.filter((r) => r.earnedAmount.toNumber() === 0)

    // Convert GBP amounts to the user's preferred currency for display.
    // A single getGBPRates() call is shared across all conversions (1 HTTP round-trip max).
    const userCurrency = (user.currency || 'GBP').toUpperCase()
    const rates = await getGBPRates()
    const fxRate = userCurrency !== 'GBP' ? (rates[userCurrency] ?? null) : null
    const displayCurrency = fxRate ? userCurrency : 'GBP'
    const toDisplay = (gbp: number) =>
      fxRate ? Math.round(gbp * fxRate * 100) / 100 : gbp

    res.json({
      data: {
        code,
        balance: pendingPayout,
        totalEarned,
        totalReferrals: referrals.length,
        activeReferrals: activeReferrals.length,
        inactiveReferrals: inactiveReferrals.length,
        referrals: referrals.map((r) => ({
          id: r.id,
          earned: r.earnedAmount.toNumber(),
          isPaidOut: r.isPaidOut,
          isActive: r.earnedAmount.toNumber() > 0,
          createdAt: r.createdAt.toISOString(),
        })),
        config: REFERRAL_CONFIG,
        // Currency-aware display values (converted from GBP using live FX rates)
        userCurrency: displayCurrency,
        balanceInUserCurrency: toDisplay(pendingPayout),
        totalEarnedInUserCurrency: toDisplay(totalEarned),
        minPayoutInUserCurrency: toDisplay(REFERRAL_CONFIG.MIN_PAYOUT),
      },
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/referrals/check/:code — check if a code is available */
router.get('/check/:code', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const raw = (req.params['code'] ?? '').trim().toUpperCase()
    if (!raw || raw.length < 3 || raw.length > 20) {
      return res.json({ data: { available: false, reason: 'Code must be 3–20 characters' } })
    }
    if (!isValidCustomCode(raw)) {
      return res.json({ data: { available: false, reason: 'Only letters, numbers, and dashes allowed' } })
    }
    const existing = await prisma.user.findUnique({ where: { referralCode: raw }, select: { id: true } })
    if (existing) {
      return res.json({ data: { available: false, reason: 'That code is already taken' } })
    }
    return res.json({ data: { available: true } })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/referrals/code — set or change your own referral code */
router.put('/code', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { code } = req.body as { code: string }
    if (!code?.trim()) throw new AppError('Code is required', 400)

    const normalized = code.trim().toUpperCase()

    if (normalized.length < 3 || normalized.length > 20) {
      throw new AppError('Code must be 3–20 characters', 400)
    }
    if (!isValidCustomCode(normalized)) {
      throw new AppError('Only letters, numbers, and dashes allowed', 400)
    }

    // Check uniqueness — exclude current user so they can re-save same code
    const conflict = await prisma.user.findFirst({
      where: { referralCode: normalized, id: { not: userId } },
      select: { id: true },
    })
    if (conflict) {
      throw new AppError('That referral code is already taken — try another', 409)
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { referralCode: normalized },
      select: { referralCode: true },
    })
    res.json({ data: { code: updated.referralCode } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/referrals/apply — apply a referral code during signup */
router.post('/apply', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { code } = req.body as { code: string }
    if (!code?.trim()) throw new AppError('Referral code required', 400)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referredBy: true },
    })
    if (user?.referredBy) throw new AppError('You already used a referral code', 400)

    // Find referrer
    const referrer = await prisma.user.findUnique({
      where: { referralCode: code.trim().toUpperCase() },
      select: { id: true },
    })
    if (!referrer) throw new AppError('Invalid referral code', 404)
    if (referrer.id === userId) throw new AppError('Cannot refer yourself', 400)

    // Check if already referred (checked again inside transaction to handle race conditions)
    const existing = await prisma.referral.findUnique({ where: { referredId: userId } })
    if (existing) throw new AppError('Already referred', 400)

    // Wrap both writes in a transaction — if concurrent requests slip through the
    // pre-check above, the unique constraint on referredId will cause a P2002 on
    // the second writer which we catch and convert to a clean 400.
    try {
      await prisma.$transaction([
        prisma.referral.create({
          data: { referrerId: referrer.id, referredId: userId, code: code.trim().toUpperCase() },
        }),
        prisma.user.update({ where: { id: userId }, data: { referredBy: referrer.id } }),
      ])
    } catch (txErr: any) {
      if (txErr?.code === 'P2002') throw new AppError('Already referred', 400)
      throw txErr
    }

    res.json({ data: { applied: true } })
  } catch (err) {
    next(err)
  }
})

/**
 * Internal: credit the referrer with a share of the PLATFORM REVENUE earned
 * from a referred user. `platformRevenue` is the amount the platform actually
 * keeps (e.g. the 5% ticket fee, the full subscription amount, the 20% group
 * cut, the venue commission). The referrer earns
 * REFERRAL_CONFIG.REVENUE_SHARE_PERCENT of that — lifetime, no flat bonus.
 *
 * Safe to call on any purchase event: a no-op if the user was not referred.
 */
export async function creditReferrer(referredUserId: string, platformRevenue: number) {
  if (platformRevenue <= 0) return

  const referral = await prisma.referral.findUnique({ where: { referredId: referredUserId } })
  if (!referral) return

  const commission = Number(((platformRevenue * REFERRAL_CONFIG.REVENUE_SHARE_PERCENT) / 100).toFixed(2))
  if (commission <= 0) return

  await prisma.referral.update({
    where: { referredId: referredUserId },
    data: { earnedAmount: { increment: commission } },
  })

  await prisma.user.update({
    where: { id: referral.referrerId },
    data: { referralBalance: { increment: commission } },
  })
}

/** GET /api/referrals/leaderboard — top referrers */
router.get('/leaderboard', optionalAuth, async (_req, res, next) => {
  try {
    const topReferrers = await prisma.user.findMany({
      where: { referralBalance: { gt: 0 } },
      orderBy: { referralBalance: 'desc' },
      take: 20,
      select: {
        id: true, username: true, displayName: true, photoUrl: true,
        referralBalance: true,
      },
    })

    // Count referrals per user
    const counts = await prisma.referral.groupBy({
      by: ['referrerId'],
      where: { referrerId: { in: topReferrers.map((u) => u.id) } },
      _count: true,
    })
    const countMap = new Map(counts.map((c) => [c.referrerId, c._count]))

    res.json({
      data: topReferrers.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        photoUrl: u.photoUrl,
        earned: u.referralBalance.toNumber(),
        referralCount: countMap.get(u.id) ?? 0,
      })),
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/referrals/payout — credit referral earnings to wallet balance */
router.post('/payout', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralBalance: true, currency: true },
    })
    if (!user) throw new AppError('User not found', 404)
    if (user.referralBalance.toNumber() < REFERRAL_CONFIG.MIN_PAYOUT) {
      throw new AppError(`Minimum payout is £${REFERRAL_CONFIG.MIN_PAYOUT.toFixed(2)}`, 400)
    }

    // Pre-fetch FX rates (cached) so we can use them synchronously inside the transaction
    const userCurrencyCode = (user.currency || 'GBP').toUpperCase()
    const rates = await getGBPRates()
    const fxRate = userCurrencyCode !== 'GBP' ? (rates[userCurrencyCode] ?? null) : null

    // Atomic: re-read balance inside a transaction so concurrent requests
    // cannot both pass the pre-check above and double-credit the same balance.
    const { paidOut } = await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUnique({ where: { id: userId }, select: { referralBalance: true } })
      if (!fresh || fresh.referralBalance.toNumber() < REFERRAL_CONFIG.MIN_PAYOUT) {
        throw new AppError(`Minimum payout is £${REFERRAL_CONFIG.MIN_PAYOUT.toFixed(2)}`, 400)
      }
      const amount = fresh.referralBalance.toNumber()

      // Build currency note for the wallet transaction description
      const localAmount = fxRate ? Math.round(amount * fxRate * 100) / 100 : null
      const description = localAmount
        ? `Referral earnings transferred to wallet (≈${userCurrencyCode} ${localAmount.toFixed(2)})`
        : 'Referral earnings transferred to wallet'

      // Upsert wallet (creates it if this is the user's first action)
      const wallet = await tx.wallet.upsert({
        where: { userId },
        create: { userId },
        update: {},
      })

      // Credit wallet balance (always stored in GBP — the platform's base currency)
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      })

      // Ledger entry so the user can see the credit in their transaction history
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'REFERRAL_CREDIT',
          amount,
          balanceAfter: updatedWallet.balance,
          description,
        },
      })

      // Mark all pending referrals as paid out and zero the referral balance
      await tx.referral.updateMany({
        where: { referrerId: userId, isPaidOut: false },
        data: { isPaidOut: true },
      })
      await tx.user.update({ where: { id: userId }, data: { referralBalance: 0 } })

      return { paidOut: amount }
    })

    // Build a user-facing success message in their local currency
    const localPaidOut = fxRate ? Math.round(paidOut * fxRate * 100) / 100 : null
    const message = localPaidOut
      ? `${userCurrencyCode} ${localPaidOut.toFixed(2)} has been credited to your wallet`
      : `£${paidOut.toFixed(2)} has been credited to your wallet`

    res.json({
      data: {
        paidOut,
        paidOutInUserCurrency: localPaidOut ?? paidOut,
        userCurrency: localPaidOut ? userCurrencyCode : 'GBP',
        message,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
