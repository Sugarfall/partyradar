import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

/**
 * GET /api/messages/:eventId
 * Paginated chat history — last 50 messages with sender info.
 * Requires auth. Event must exist.
 * Public events: any authenticated user can read.
 * Private/invite-only events: user must be host or confirmed guest.
 */
router.get('/:eventId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { eventId } = req.params as { eventId: string }
    const page = Math.max(1, Number(req.query['page'] ?? 1))
    const limit = Math.min(50, Math.max(1, Number(req.query['limit'] ?? 50)))
    const skip = (page - 1) * limit

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, hostId: true, isInviteOnly: true, isCancelled: true },
    })

    if (!event || event.isCancelled) throw new AppError('Event not found', 404)

    const userId = req.user!.dbUser.id

    // For invite-only events, verify the user is the host or a confirmed guest
    if (event.isInviteOnly && event.hostId !== userId) {
      const guest = await prisma.eventGuest.findUnique({
        where: { eventId_userId: { eventId, userId } },
        select: { status: true },
      })
      if (!guest || guest.status !== 'CONFIRMED') {
        throw new AppError('You must be a confirmed guest to view this chat', 403)
      }
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { eventId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          sender: { select: { id: true, displayName: true, photoUrl: true } },
        },
      }),
      prisma.message.count({ where: { eventId } }),
    ])

    // Return in chronological order (oldest first)
    const data = messages.reverse().map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.sender.displayName,
      senderPhoto: m.sender.photoUrl ?? undefined,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
    }))

    res.json({ data, total, page, limit, hasMore: skip + messages.length < total })
  } catch (err) {
    next(err)
  }
})

export default router
