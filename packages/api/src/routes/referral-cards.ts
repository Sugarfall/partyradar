import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

function generateCardCode(displayName: string) {
  const base = displayName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6).padEnd(3, 'X')
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6)
  return `${base}-${rand}`
}

/** GET /api/referral-cards/mine — get my referral card(s) */
router.get('/mine', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const cards = await prisma.referralCard.findMany({
      where: { userId },
      include: {
        conversions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { source: true, revenueAmount: true, commissionAmount: true, createdAt: true, isPaidOut: true },
        },
      },
    })
    res.json({ data: cards })
  } catch (err) { next(err) }
})

/** POST /api/referral-cards — create a referral card */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const user = req.user!.dbUser
    const existing = await prisma.referralCard.findFirst({ where: { userId, isActive: true } })
    if (existing) return res.json({ data: existing })

    const code = generateCardCode(user.displayName)
    const card = await prisma.referralCard.create({
      data: { userId, code, displayName: user.displayName },
    })
    res.status(201).json({ data: card })
  } catch (err) { next(err) }
})

/** GET /api/referral-cards/:code — look up a card by code */
router.get('/:code', async (req, res, next) => {
  try {
    const card = await prisma.referralCard.findUnique({
      where: { code: req.params['code'] },
      include: { user: { select: { displayName: true, photoUrl: true, username: true } } },
    })
    if (!card || !card.isActive) throw new AppError('Referral card not found', 404)
    res.json({ data: { code: card.code, displayName: card.displayName, totalUses: card.totalUses, owner: card.user } })
  } catch (err) { next(err) }
})

export default router
