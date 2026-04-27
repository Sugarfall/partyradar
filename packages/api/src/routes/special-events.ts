import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { sendNotificationToMany } from '../lib/fcm'

const router = Router()

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getAllUserIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { isBanned: false },
    select: { id: true },
  })
  return users.map((u) => u.id)
}

// ── Public: list published special events ─────────────────────────────────────

router.get('/', async (_req, res, next) => {
  try {
    const events = await prisma.specialEvent.findMany({
      where: { isPublished: true },
      include: {
        medals: {
          select: { id: true, name: true, icon: true, tier: true, startsAt: true, endsAt: true },
          where: { isActive: true },
        },
        _count: { select: { pushLog: true } },
      },
      orderBy: { startsAt: 'asc' },
    })
    res.json({ data: events })
  } catch (err) { next(err) }
})

// ── Admin: list all special events (including unpublished) ────────────────────

router.get('/admin', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user?.dbUser.isAdmin) return res.status(403).json({ error: 'Admin only' })
    const events = await prisma.specialEvent.findMany({
      include: {
        medals: {
          select: { id: true, name: true, icon: true, tier: true },
          where: { isActive: true },
        },
        pushLog: {
          orderBy: { sentAt: 'desc' },
          take: 5,
          select: { id: true, type: true, title: true, sentAt: true, recipientCount: true },
        },
        _count: { select: { pushLog: true } },
      },
      orderBy: { startsAt: 'desc' },
    })
    res.json({ data: events })
  } catch (err) { next(err) }
})

// ── Admin: get single special event ──────────────────────────────────────────

router.get('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user?.dbUser.isAdmin) return res.status(403).json({ error: 'Admin only' })
    const event = await prisma.specialEvent.findUnique({
      where: { id: req.params['id'] },
      include: {
        medals: { select: { id: true, name: true, icon: true, tier: true, startsAt: true, endsAt: true } },
        pushLog: { orderBy: { sentAt: 'desc' } },
      },
    })
    if (!event) return res.status(404).json({ error: 'Special event not found' })
    res.json({ data: event })
  } catch (err) { next(err) }
})

// ── Admin: create ─────────────────────────────────────────────────────────────

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user?.dbUser.isAdmin) return res.status(403).json({ error: 'Admin only' })
    const { name, description, coverImageUrl, startsAt, endsAt } = req.body
    if (!name || !startsAt || !endsAt) {
      return res.status(400).json({ error: 'name, startsAt and endsAt are required' })
    }
    const event = await prisma.specialEvent.create({
      data: {
        name,
        description: description ?? '',
        coverImageUrl: coverImageUrl ?? null,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
      },
    })
    res.json({ data: event })
  } catch (err) { next(err) }
})

// ── Admin: update ─────────────────────────────────────────────────────────────

router.put('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user?.dbUser.isAdmin) return res.status(403).json({ error: 'Admin only' })
    const { name, description, coverImageUrl, startsAt, endsAt, isPublished } = req.body
    const event = await prisma.specialEvent.update({
      where: { id: req.params['id'] },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(coverImageUrl !== undefined && { coverImageUrl }),
        ...(startsAt !== undefined && { startsAt: new Date(startsAt) }),
        ...(endsAt !== undefined && { endsAt: new Date(endsAt) }),
        ...(isPublished !== undefined && { isPublished }),
      },
    })
    res.json({ data: event })
  } catch (err) { next(err) }
})

// ── Admin: delete ─────────────────────────────────────────────────────────────

router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user?.dbUser.isAdmin) return res.status(403).json({ error: 'Admin only' })
    await prisma.specialEvent.delete({ where: { id: req.params['id'] } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── Admin: publish — marks as live and blasts all users ───────────────────────

router.post('/:id/publish', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user?.dbUser.isAdmin) return res.status(403).json({ error: 'Admin only' })

    const event = await prisma.specialEvent.update({
      where: { id: req.params['id'] },
      data: { isPublished: true },
    })

    const userIds = await getAllUserIds()
    const title = `🎉 ${event.name} is live!`
    const body = event.description
      ? event.description.slice(0, 120)
      : 'A new special event just launched on PartyRadar — go earn your medals!'

    // Fire-and-forget so the response isn't delayed by thousands of FCM calls
    sendNotificationToMany(userIds, {
      type: 'SPECIAL_EVENT',
      title,
      body,
      data: { specialEventId: event.id },
    }).catch((err) => console.error('[SpecialEvents] publish blast error:', err))

    // Log it so we don't re-send on the next cron tick
    await prisma.specialEventPush.create({
      data: { specialEventId: event.id, type: 'LAUNCH', title, body, recipientCount: userIds.length },
    })

    res.json({ ok: true, data: event, recipientCount: userIds.length })
  } catch (err) { next(err) }
})

// ── Admin: manual notify — custom push to all users ───────────────────────────

router.post('/:id/notify', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user?.dbUser.isAdmin) return res.status(403).json({ error: 'Admin only' })

    const { title, body, type: pushType = 'MANUAL' } = req.body
    if (!title || !body) return res.status(400).json({ error: 'title and body are required' })

    const event = await prisma.specialEvent.findUnique({ where: { id: req.params['id'] } })
    if (!event) return res.status(404).json({ error: 'Special event not found' })

    const userIds = await getAllUserIds()

    sendNotificationToMany(userIds, {
      type: 'SPECIAL_EVENT',
      title,
      body,
      data: { specialEventId: event.id },
    }).catch((err) => console.error('[SpecialEvents] manual notify error:', err))

    await prisma.specialEventPush.create({
      data: { specialEventId: event.id, type: pushType, title, body, recipientCount: userIds.length },
    })

    res.json({ ok: true, recipientCount: userIds.length })
  } catch (err) { next(err) }
})

export default router
