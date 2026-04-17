import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

const VALID_CATEGORIES = ['vibe', 'punctuality', 'friendliness', 'host_quality']

/** GET /api/social-score/:username — get public social score + feedback */
router.get('/:username', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params['username'] },
      select: { id: true, socialScore: true },
    })
    if (!user) throw new AppError('User not found', 404)

    const feedback = await prisma.anonymousFeedback.findMany({
      where: { toUserId: user.id, isHidden: false },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { category: true, score: true, comment: true, createdAt: true },
    })

    const avgByCategory: Record<string, number> = {}
    for (const cat of VALID_CATEGORIES) {
      const items = feedback.filter(f => f.category === cat)
      if (items.length > 0) avgByCategory[cat] = Math.round(items.reduce((s, f) => s + f.score, 0) / items.length * 10) / 10
    }

    res.json({ data: { socialScore: user.socialScore, avgByCategory, recentFeedback: feedback } })
  } catch (err) { next(err) }
})

/** POST /api/social-score/:userId/feedback — leave anonymous feedback */
router.post('/:userId/feedback', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const fromUserId = req.user!.dbUser.id
    const toUserId = req.params['userId']
    if (fromUserId === toUserId) throw new AppError('Cannot rate yourself', 400)

    const { category, score, comment } = req.body as { category: string; score: number; comment?: string }
    if (!VALID_CATEGORIES.includes(category)) throw new AppError('Invalid category', 400)
    if (typeof score !== 'number' || score < 1 || score > 5) throw new AppError('Score must be 1–5', 400)
    if (comment && comment.length > 300) throw new AppError('Comment too long (max 300 chars)', 400)

    const target = await prisma.user.findUnique({ where: { id: toUserId } })
    if (!target) throw new AppError('User not found', 404)

    // Rate limit: one feedback per from→to pair per 24h
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recent = await prisma.anonymousFeedback.findFirst({
      where: { fromUserId, toUserId, createdAt: { gte: dayAgo } },
    })
    if (recent) throw new AppError('You can only leave feedback once per 24 hours per person', 429)

    await prisma.anonymousFeedback.create({
      data: { fromUserId, toUserId, category, score, comment: comment?.trim().slice(0, 300) ?? null },
    })

    // Recompute social score: avg of all scores * 20 (max 100)
    const allScores = await prisma.anonymousFeedback.aggregate({
      where: { toUserId, isHidden: false },
      _avg: { score: true },
    })
    const newScore = Math.round(((allScores._avg?.score) ?? 0) * 20)
    await prisma.user.update({ where: { id: toUserId }, data: { socialScore: newScore } })

    res.status(201).json({ data: { ok: true } })
  } catch (err) { next(err) }
})

/** POST /api/social-score/feedback/:id/report */
router.post('/feedback/:id/report', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const fb = await prisma.anonymousFeedback.findUnique({ where: { id: req.params['id'] } })
    if (!fb) throw new AppError('Feedback not found', 404)
    await prisma.anonymousFeedback.update({
      where: { id: fb.id },
      data: { reportCount: { increment: 1 }, isHidden: fb.reportCount + 1 >= 3 },
    })
    res.json({ data: { ok: true } })
  } catch (err) { next(err) }
})

export default router
