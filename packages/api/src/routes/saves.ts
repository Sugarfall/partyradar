import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

// GET /api/events/saved — list saved events for current user
router.get('/saved', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const saved = await prisma.savedEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        event: {
          include: {
            host: { select: { id: true, displayName: true, photoUrl: true, username: true } },
            _count: { select: { guests: { where: { status: 'CONFIRMED' } } } },
          },
        },
      },
    })
    res.json({ data: saved.map(s => ({ ...s.event, guestCount: s.event._count.guests, savedAt: s.createdAt })) })
  } catch (err) { next(err) }
})

// GET /api/events/:id/save — check if saved
router.get('/:id/save', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId  = req.user!.dbUser.id
    const eventId = req.params['id'] as string
    const saved   = await prisma.savedEvent.findUnique({
      where: { userId_eventId: { userId, eventId } },
    })
    res.json({ data: { saved: !!saved } })
  } catch (err) { next(err) }
})

// POST /api/events/:id/save — save event
router.post('/:id/save', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId  = req.user!.dbUser.id
    const eventId = req.params['id'] as string
    await prisma.savedEvent.upsert({
      where:  { userId_eventId: { userId, eventId } },
      update: {},
      create: { userId, eventId },
    })
    res.json({ data: { saved: true } })
  } catch (err) { next(err) }
})

// DELETE /api/events/:id/save — unsave event
router.delete('/:id/save', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId  = req.user!.dbUser.id
    const eventId = req.params['id'] as string
    await prisma.savedEvent.deleteMany({ where: { userId, eventId } })
    res.json({ data: { saved: false } })
  } catch (err) { next(err) }
})

export default router
