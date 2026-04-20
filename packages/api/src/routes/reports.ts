import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { z } from 'zod'

const router = Router()

const VALID_CONTENT_TYPES = ['post', 'group_message', 'group', 'user', 'event'] as const
const VALID_REASONS = ['NUDITY', 'ILLEGAL', 'SPAM', 'HATE', 'VIOLENCE', 'OTHER'] as const

const reportSchema = z.object({
  contentType: z.enum(VALID_CONTENT_TYPES),
  contentId: z.string().min(1),
  reason: z.enum(VALID_REASONS),
  details: z.string().max(500).optional(),
})

/**
 * POST /api/reports
 * Any logged-in user can report a piece of content.
 * One report per (reporter, contentType, contentId) — upsert to avoid spam.
 */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const body = reportSchema.parse(req.body)

    // Upsert — prevent duplicate reports from same user on same content
    const report = await prisma.contentReport.upsert({
      where: {
        reporterId_contentType_contentId: {
          reporterId: userId,
          contentType: body.contentType,
          contentId: body.contentId,
        },
      },
      create: {
        reporterId: userId,
        contentType: body.contentType,
        contentId: body.contentId,
        reason: body.reason,
        details: body.details ?? null,
      },
      update: {
        reason: body.reason,
        details: body.details ?? null,
        status: 'PENDING',
      },
    })

    res.status(201).json({ data: { id: report.id, status: report.status } })
  } catch (err) { next(err) }
})

export default router
