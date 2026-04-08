import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { optionalAuth, requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

export const GENRE_GROUPS = [
  { slug: 'genre-rave',   name: 'Rave',   description: 'Underground raves, techno nights, warehouse parties',  emoji: '🎧', coverColor: '#a855f7' },
  { slug: 'genre-house',  name: 'House',  description: 'Deep house, tech house, garage and club classics',       emoji: '🏠', coverColor: '#3b82f6' },
  { slug: 'genre-rnb',    name: 'R&B',    description: 'R&B, soul, hip-hop and neo-soul nights',                emoji: '🎤', coverColor: '#ec4899' },
  { slug: 'genre-trippy', name: 'Trippy', description: 'Psychedelic, experimental and mind-bending sounds',     emoji: '🌀', coverColor: '#10b981' },
]

/** Seed genre + venue group chats — idempotent, called from admin seed */
export async function seedGroupChats(venueNames?: { id: string; name: string; type: string }[]) {
  // Genre groups
  for (const g of GENRE_GROUPS) {
    await prisma.groupChat.upsert({
      where: { slug: g.slug },
      update: {},
      create: { ...g, type: 'GENRE' },
    })
  }

  // Venue groups
  if (venueNames && venueNames.length > 0) {
    const emojiMap: Record<string, string> = {
      NIGHTCLUB: '🎉', BAR: '🍺', PUB: '🍻', CONCERT_HALL: '🎸', ROOFTOP_BAR: '🌙', LOUNGE: '🥃',
    }
    const colorMap: Record<string, string> = {
      NIGHTCLUB: '#a855f7', BAR: '#3b82f6', PUB: '#f59e0b', CONCERT_HALL: '#ec4899', ROOFTOP_BAR: '#10b981', LOUNGE: '#6366f1',
    }
    for (const venue of venueNames) {
      const slug = `venue-${venue.id}`
      await prisma.groupChat.upsert({
        where: { slug },
        update: {},
        create: {
          slug,
          name: venue.name,
          description: `Chat for ${venue.name} — Glasgow`,
          type: 'VENUE',
          emoji: emojiMap[venue.type] ?? '🏙️',
          coverColor: colorMap[venue.type] ?? '#6366f1',
        },
      })
    }
  }
}

/** GET /api/groups — list all groups */
router.get('/', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.dbUser.id ?? null

    const groups = await prisma.groupChat.findMany({
      orderBy: [{ type: 'asc' }, { memberCount: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { memberships: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { sender: { select: { displayName: true } } },
        },
      },
    })

    // Batch-fetch memberships for current user
    const memberships = userId
      ? await prisma.groupMembership.findMany({
          where: { userId, groupId: { in: groups.map((g) => g.id) } },
          select: { groupId: true, notificationsEnabled: true },
        })
      : []
    const membershipMap = new Map(memberships.map((m) => [m.groupId, m]))

    const data = groups.map((g) => {
      const m = membershipMap.get(g.id)
      const last = g.messages[0]
      return {
        id: g.id,
        slug: g.slug,
        name: g.name,
        description: g.description,
        type: g.type,
        emoji: g.emoji,
        coverColor: g.coverColor,
        memberCount: g.memberCount,
        isJoined: !!m,
        notificationsEnabled: m?.notificationsEnabled ?? false,
        lastMessage: last
          ? { text: last.text, senderName: last.sender.displayName, createdAt: last.createdAt.toISOString() }
          : null,
      }
    })

    res.json({ data })
  } catch (err) {
    next(err)
  }
})

/** GET /api/groups/:id/messages */
router.get('/:id/messages', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)

    const messages = await prisma.groupMessage.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: 'asc' },
      take: 60,
      include: {
        sender: { select: { id: true, displayName: true, photoUrl: true, username: true } },
      },
    })

    const userId = req.user?.dbUser.id ?? null
    const membership = userId
      ? await prisma.groupMembership.findUnique({
          where: { groupId_userId: { groupId: group.id, userId } },
        })
      : null

    // Which senders does the current user follow?
    const senderIds = [...new Set(messages.map((m) => m.senderId))]
    const follows = userId
      ? await prisma.follow.findMany({
          where: { followerId: userId, followingId: { in: senderIds } },
          select: { followingId: true },
        })
      : []
    const followedIds = new Set(follows.map((f) => f.followingId))

    res.json({
      data: {
        group: {
          id: group.id,
          slug: group.slug,
          name: group.name,
          emoji: group.emoji,
          coverColor: group.coverColor,
          memberCount: group.memberCount,
          isJoined: !!membership,
          notificationsEnabled: membership?.notificationsEnabled ?? false,
        },
        messages: messages.map((m) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.sender.displayName,
          senderPhoto: m.sender.photoUrl,
          senderUsername: m.sender.username,
          text: m.text,
          createdAt: m.createdAt.toISOString(),
          isFollowing: followedIds.has(m.senderId),
        })),
      },
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/groups/:id/join */
router.post('/:id/join', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)

    const existing = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId } },
    })
    if (!existing) {
      await prisma.groupMembership.create({ data: { groupId: group.id, userId } })
      await prisma.groupChat.update({ where: { id: group.id }, data: { memberCount: { increment: 1 } } })
    }

    res.json({ data: { joined: true } })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/groups/:id/leave */
router.delete('/:id/leave', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)

    const existing = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId } },
    })
    if (existing) {
      await prisma.groupMembership.delete({ where: { groupId_userId: { groupId: group.id, userId } } })
      await prisma.groupChat.update({
        where: { id: group.id },
        data: { memberCount: { decrement: 1 } },
      })
    }

    res.json({ data: { left: true } })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/groups/:id/notifications */
router.put('/:id/notifications', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { enabled } = req.body as { enabled: boolean }
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)

    await prisma.groupMembership.upsert({
      where: { groupId_userId: { groupId: group.id, userId } },
      create: { groupId: group.id, userId, notificationsEnabled: enabled },
      update: { notificationsEnabled: enabled },
    })

    res.json({ data: { notificationsEnabled: enabled } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/groups/:id/messages */
router.post('/:id/messages', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { text } = req.body as { text: string }
    if (!text?.trim()) throw new AppError('Message text required', 400)

    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)

    // Auto-join on first message
    const membership = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId } },
    })
    if (!membership) {
      await prisma.groupMembership.create({ data: { groupId: group.id, userId } })
      await prisma.groupChat.update({ where: { id: group.id }, data: { memberCount: { increment: 1 } } })
    }

    const saved = await prisma.groupMessage.create({
      data: { groupId: group.id, senderId: userId, text: text.trim().slice(0, 500) },
      include: { sender: { select: { id: true, displayName: true, photoUrl: true, username: true } } },
    })

    await prisma.groupChat.update({
      where: { id: group.id },
      data: { lastMessage: text.trim().slice(0, 100), lastAt: saved.createdAt },
    })

    res.status(201).json({
      data: {
        id: saved.id,
        senderId: saved.senderId,
        senderName: saved.sender.displayName,
        senderPhoto: saved.sender.photoUrl,
        senderUsername: saved.sender.username,
        text: saved.text,
        createdAt: saved.createdAt.toISOString(),
        isFollowing: false,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
