import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/** POST /api/phone/send — send verification code */
router.post('/send', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { phone } = req.body as { phone: string }
    if (!phone?.match(/^\+?[1-9]\d{7,14}$/)) throw new AppError('Invalid phone number', 400)

    // Rate limit: max 3 codes per hour per user
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentCount = await prisma.phoneVerification.count({
      where: { userId, createdAt: { gte: hourAgo } },
    })
    if (recentCount >= 3) throw new AppError('Too many verification attempts. Try again in 1 hour.', 429)

    const code = generateCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    await prisma.phoneVerification.create({ data: { userId, phone, code, expiresAt } })

    // In production: send SMS via Twilio/etc. For now, return code in dev mode.
    const isDev = process.env['NODE_ENV'] !== 'production'
    res.json({ data: { sent: true, ...(isDev ? { code } : {}) } })
  } catch (err) { next(err) }
})

/** POST /api/phone/verify — verify the code */
router.post('/verify', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { phone, code } = req.body as { phone: string; code: string }
    if (!phone || !code) throw new AppError('phone and code required', 400)

    const verification = await prisma.phoneVerification.findFirst({
      where: { userId, phone, verified: false },
      orderBy: { createdAt: 'desc' },
    })
    if (!verification) throw new AppError('No pending verification found', 404)
    if (verification.expiresAt < new Date()) throw new AppError('Code expired', 410)

    // Increment attempts
    await prisma.phoneVerification.update({
      where: { id: verification.id },
      data: { attempts: { increment: 1 } },
    })
    if (verification.attempts >= 5) throw new AppError('Too many failed attempts', 429)
    if (verification.code !== code) throw new AppError('Incorrect code', 400)

    await prisma.$transaction([
      prisma.phoneVerification.update({ where: { id: verification.id }, data: { verified: true } }),
      prisma.user.update({ where: { id: userId }, data: { phoneNumber: phone, phoneVerified: true } }),
    ])

    res.json({ data: { verified: true } })
  } catch (err) { next(err) }
})

export default router
