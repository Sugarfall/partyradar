import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

const participantSelect = {
  user: { select: { id: true, displayName: true, photoUrl: true, username: true } },
}

/** GET /api/dm/users?q= — search users to DM */
router.get('/users', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const q = String(req.query['q'] ?? '').trim()
    const myId = req.user!.dbUser.id
    if (!q) return res.json({ data: [] })

    const users = await prisma.user.findMany({
      where: {
        id: { not: myId },
        OR: [
          { displayName: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, displayName: true, username: true, photoUrl: true },
      take: 8,
    })

    res.json({ data: users })
  } catch (err) { next(err) }
})

/** GET /api/dm — list all conversations for current user */
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id

    const conversations = await prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      orderBy: { lastAt: { sort: 'desc', nulls: 'last' } },
      include: {
        participants: { include: participantSelect },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { id: true, displayName: true } } } },
      },
    })

    const data = conversations.map((c) => {
      const other = c.participants.find((p) => p.userId !== userId)?.user
      const last = c.messages[0]
      return {
        id: c.id,
        updatedAt: c.lastAt ?? c.createdAt,
        other: other ?? null,
        lastMessage: last ? { text: last.text, senderId: last.senderId, createdAt: last.createdAt } : null,
      }
    })

    res.json({ data })
  } catch (err) { next(err) }
})

/** POST /api/dm — start or fetch a conversation with another user */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const myId = req.user!.dbUser.id
    const { recipientId } = req.body as { recipientId: string }
    if (!recipientId) throw new AppError('recipientId required', 400)
    if (recipientId === myId) throw new AppError('Cannot DM yourself', 400)

    // Check recipient exists
    const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true, displayName: true } })
    if (!recipient) throw new AppError('User not found', 404)

    // Find existing conversation between these two users
    const existing = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: myId } } },
          { participants: { some: { userId: recipientId } } },
        ],
      },
      include: { participants: { include: participantSelect } },
    })

    if (existing) return res.json({ data: { id: existing.id } })

    // Create new conversation
    const convo = await prisma.conversation.create({
      data: {
        participants: {
          create: [{ userId: myId }, { userId: recipientId }],
        },
      },
    })

    res.status(201).json({ data: { id: convo.id } })
  } catch (err) { next(err) }
})

/** GET /api/dm/:id — get messages in a conversation */
router.get('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { id } = req.params as { id: string }

    const convo = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: { include: participantSelect },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 100,
          include: { sender: { select: { id: true, displayName: true, photoUrl: true } } },
        },
      },
    })

    if (!convo) throw new AppError('Conversation not found', 404)
    const isMember = convo.participants.some((p) => p.userId === userId)
    if (!isMember) throw new AppError('Forbidden', 403)

    const other = convo.participants.find((p) => p.userId !== userId)?.user

    res.json({
      data: {
        id: convo.id,
        other,
        messages: convo.messages.map((m) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.sender.displayName,
          senderPhoto: m.sender.photoUrl,
          text: m.text,
          createdAt: m.createdAt,
        })),
      },
    })
  } catch (err) { next(err) }
})

/** POST /api/dm/:id — send a message */
router.post('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { id } = req.params as { id: string }
    const { text } = req.body as { text: string }
    if (!text?.trim()) throw new AppError('text required', 400)

    const convo = await prisma.conversation.findUnique({
      where: { id },
      include: { participants: { select: { userId: true } } },
    })
    if (!convo) throw new AppError('Conversation not found', 404)
    if (!convo.participants.some((p) => p.userId === userId)) throw new AppError('Forbidden', 403)

    const [msg] = await prisma.$transaction([
      prisma.directMessage.create({
        data: { conversationId: id, senderId: userId, text: text.trim() },
        include: { sender: { select: { id: true, displayName: true, photoUrl: true } } },
      }),
      prisma.conversation.update({
        where: { id },
        data: { lastMessage: text.trim().slice(0, 100), lastAt: new Date() },
      }),
    ])

    res.status(201).json({
      data: {
        id: msg.id,
        senderId: msg.senderId,
        senderName: msg.sender.displayName,
        senderPhoto: msg.sender.photoUrl,
        text: msg.text,
        createdAt: msg.createdAt,
      },
    })
  } catch (err) { next(err) }
})

export default router
