import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { REFERRAL_CONFIG } from '@partyradar/shared'
import crypto from 'crypto'

const router = Router()

function generateCode(username: string): string {
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase()
  return `${username.toUpperCase().slice(0, 8)}-${suffix}`
}

/** GET /api/referrals — get my referral info */
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true, referralBalance: true, username: true },
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

    const totalEarned = referrals.reduce((sum, r) => sum + r.earnedAmount, 0)
    const pendingPayout = user.referralBalance
    // Active = referee has made at least one purchase (earnedAmount > 0 on referral record)
    const activeReferrals = referrals.filter((r) => r.earnedAmount > 0)
    const inactiveReferrals = referrals.filter((r) => r.earnedAmount === 0)

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
          earned: r.earnedAmount,
          isPaidOut: r.isPaidOut,
          isActive: r.earnedAmount > 0,
          createdAt: r.createdAt.toISOString(),
        })),
        config: REFERRAL_CONFIG,
      },
    })
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

    // Check if already referred
    const existing = await prisma.referral.findUnique({ where: { referredId: userId } })
    if (existing) throw new AppError('Already referred', 400)

    // Create referral link
    await prisma.referral.create({
      data: { referrerId: referrer.id, referredId: userId, code: code.trim().toUpperCase() },
    })
    await prisma.user.update({ where: { id: userId }, data: { referredBy: referrer.id } })

    res.json({ data: { applied: true } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/referrals/credit — internal: credit referrer when referred user makes a purchase */
export async function creditReferrer(referredUserId: string, amount: number, type: 'ticket' | 'subscription' | 'group') {
  const referral = await prisma.referral.findUnique({ where: { referredId: referredUserId } })
  if (!referral) return

  let percent = 0
  switch (type) {
    case 'ticket': percent = REFERRAL_CONFIG.TICKET_COMMISSION_PERCENT; break
    case 'subscription': percent = REFERRAL_CONFIG.SUBSCRIPTION_COMMISSION_PERCENT; break
    case 'group': percent = REFERRAL_CONFIG.GROUP_COMMISSION_PERCENT; break
  }

  const commission = Number(((amount * percent) / 100).toFixed(2))
  if (commission <= 0) return

  // Add first purchase bonus if this is the first earning
  const isFirst = referral.earnedAmount === 0
  const bonus = isFirst ? REFERRAL_CONFIG.FIRST_PURCHASE_BONUS : 0
  const totalCredit = commission + bonus

  await prisma.referral.update({
    where: { referredId: referredUserId },
    data: { earnedAmount: { increment: totalCredit } },
  })

  await prisma.user.update({
    where: { id: referral.referrerId },
    data: { referralBalance: { increment: totalCredit } },
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
        earned: u.referralBalance,
        referralCount: countMap.get(u.id) ?? 0,
      })),
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/referrals/payout — request payout */
router.post('/payout', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralBalance: true, stripeCustomerId: true },
    })
    if (!user) throw new AppError('User not found', 404)
    if (user.referralBalance < REFERRAL_CONFIG.MIN_PAYOUT) {
      throw new AppError(`Minimum payout is £${REFERRAL_CONFIG.MIN_PAYOUT.toFixed(2)}`, 400)
    }

    // Mark referrals as paid and reset balance
    const amount = user.referralBalance
    await prisma.referral.updateMany({
      where: { referrerId: userId, isPaidOut: false },
      data: { isPaidOut: true },
    })
    await prisma.user.update({
      where: { id: userId },
      data: { referralBalance: 0 },
    })

    // In production, trigger Stripe payout here
    // For now just mark as processed
    res.json({ data: { paidOut: amount, message: `£${amount.toFixed(2)} payout requested — will be processed within 3-5 business days` } })
  } catch (err) {
    next(err)
  }
})

export default router
