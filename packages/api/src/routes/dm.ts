import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

const participantSelect = {
  user: { select: { id: true, displayName: true, photoUrl: true, username: true } },
}

/** GET /api/dm/users?q= — search users to DM, or return suggestions when q is blank */
router.get('/users', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const q = String(req.query['q'] ?? '').trim()
    const myId = req.user!.dbUser.id

    if (!q) {
      const existingConvos = await prisma.conversation.findMany({
        where: { participants: { some: { userId: myId } } },
        include: { participants: { select: { userId: true } } },
      })
      const alreadyTalkedTo = new Set(
        existingConvos.flatMap((c) => c.participants.map((p) => p.userId)).filter((id) => id !== myId),
      )

      const suggestions = await prisma.user.findMany({
        where: {
          id: { not: myId, notIn: alreadyTalkedTo.size > 0 ? [...alreadyTalkedTo] : undefined },
        },
        select: { id: true, displayName: true, username: true, photoUrl: true },
        orderBy: { createdAt: 'desc' },
        take: 12,
      })
      return res.json({ data: suggestions, isSuggestions: true })
    }

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

    res.json({ data: users, isSuggestions: false })
  } catch (err) { next(err) }
})

/** GET /api/dm/public-key/:userId — get a user's E2E public key */
router.get('/public-key/:userId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params as { userId: string }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, e2ePublicKey: true },
    })
    if (!user) throw new AppError('User not found', 404)
    res.json({ data: { publicKey: user.e2ePublicKey ?? null } })
  } catch (err) { next(err) }
})

/** PUT /api/dm/public-key — save own E2E public key */
router.put('/public-key', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { publicKey } = req.body as { publicKey: string }
    if (!publicKey || typeof publicKey !== 'string') throw new AppError('publicKey required', 400)

    await prisma.user.update({ where: { id: userId }, data: { e2ePublicKey: publicKey } })
    res.json({ data: { ok: true } })
  } catch (err) { next(err) }
})

/** GET /api/dm — list all conversations for current user
 *  ?requests=true → return only request conversations
 *  (omitted / false) → return only non-request conversations
 */
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const onlyRequests = req.query['requests'] === 'true'

    const conversations = await prisma.conversation.findMany({
      where: {
        participants: { some: { userId } },
        isRequest: onlyRequests ? true : false,
      },
      orderBy: { lastAt: { sort: 'desc', nulls: 'last' } },
      include: {
        participants: { include: participantSelect },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { id: true, displayName: true } } } },
      },
    })

    const data = conversations.map((c) => {
      const other = c.participants.find((p) => p.userId !== userId)?.user
      const last = c.messages[0]
      const lastText = last
        ? last.isSnap ? '📸 Snap' : last.text
        : null
      return {
        id: c.id,
        updatedAt: c.lastAt ?? c.createdAt,
        other: other ?? null,
        lastMessage: last ? { text: lastText, senderId: last.senderId, createdAt: last.createdAt } : null,
        isRequest: c.isRequest,
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

    const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true, displayName: true } })
    if (!recipient) throw new AppError('User not found', 404)

    const existing = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: myId } } },
          { participants: { some: { userId: recipientId } } },
        ],
      },
      include: { participants: { include: participantSelect } },
    })

    if (existing) return res.json({ data: { id: existing.id, isRequest: existing.isRequest } })

    // Determine if this is a message request: sender must follow recipient OR recipient must follow sender
    const followExists = await prisma.follow.findFirst({
      where: {
        OR: [
          { followerId: myId, followingId: recipientId },
          { followerId: recipientId, followingId: myId },
        ],
      },
    })
    const isRequest = !followExists

    const convo = await prisma.conversation.create({
      data: {
        isRequest,
        participants: {
          create: [{ userId: myId }, { userId: recipientId }],
        },
      },
    })

    res.status(201).json({ data: { id: convo.id, isRequest: convo.isRequest } })
  } catch (err) { next(err) }
})

/** POST /api/dm/:id/accept — accept a message request */
router.post('/:id/accept', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { id } = req.params as { id: string }

    const convo = await prisma.conversation.findUnique({
      where: { id },
      include: { participants: { select: { userId: true } } },
    })
    if (!convo) throw new AppError('Conversation not found', 404)
    if (!convo.participants.some((p) => p.userId === userId)) throw new AppError('Forbidden', 403)

    await prisma.conversation.update({ where: { id }, data: { isRequest: false } })

    res.json({ data: { ok: true } })
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

    // Also return the other user's public key for E2E encryption
    const otherPublicKey = other
      ? (await prisma.user.findUnique({ where: { id: other.id }, select: { e2ePublicKey: true } }))?.e2ePublicKey ?? null
      : null

    res.json({
      data: {
        id: convo.id,
        other,
        otherPublicKey,
        isRequest: convo.isRequest,
        messages: convo.messages.map((m) => {
          // For snaps: only the sender or pre-view recipient sees the URL
          // Once viewed (snapViewedAt set), all parties see [SNAP_VIEWED]
          let text = m.text
          if (m.isSnap && m.snapViewedAt) {
            text = '[SNAP_VIEWED]'
          }
          return {
            id: m.id,
            senderId: m.senderId,
            senderName: m.sender.displayName,
            senderPhoto: m.sender.photoUrl,
            text,
            isSnap: m.isSnap,
            snapViewed: !!m.snapViewedAt,
            createdAt: m.createdAt,
          }
        }),
      },
    })
  } catch (err) { next(err) }
})

/** POST /api/dm/:id — send a message */
router.post('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { id } = req.params as { id: string }
    const { text, isSnap = false } = req.body as { text: string; isSnap?: boolean }
    if (!text?.trim()) throw new AppError('text required', 400)

    const convo = await prisma.conversation.findUnique({
      where: { id },
      include: { participants: { select: { userId: true } } },
    })
    if (!convo) throw new AppError('Conversation not found', 404)
    if (!convo.participants.some((p) => p.userId === userId)) throw new AppError('Forbidden', 403)

    const lastPreview = isSnap ? '📸 Snap' : text.trim().slice(0, 100)

    const [msg] = await prisma.$transaction([
      prisma.directMessage.create({
        data: { conversationId: id, senderId: userId, text: text.trim(), isSnap },
        include: { sender: { select: { id: true, displayName: true, photoUrl: true } } },
      }),
      prisma.conversation.update({
        where: { id },
        data: { lastMessage: lastPreview, lastAt: new Date() },
      }),
    ])

    res.status(201).json({
      data: {
        id: msg.id,
        senderId: msg.senderId,
        senderName: msg.sender.displayName,
        senderPhoto: msg.sender.photoUrl,
        text: msg.text,
        isSnap: msg.isSnap,
        snapViewed: false,
        createdAt: msg.createdAt,
      },
    })
  } catch (err) { next(err) }
})

/** POST /api/dm/:convoId/messages/:msgId/view-snap — mark a snap as viewed */
router.post('/:convoId/messages/:msgId/view-snap', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { convoId, msgId } = req.params as { convoId: string; msgId: string }

    const convo = await prisma.conversation.findUnique({
      where: { id: convoId },
      include: { participants: { select: { userId: true } } },
    })
    if (!convo) throw new AppError('Conversation not found', 404)
    if (!convo.participants.some((p) => p.userId === userId)) throw new AppError('Forbidden', 403)

    const msg = await prisma.directMessage.findUnique({ where: { id: msgId } })
    if (!msg) throw new AppError('Message not found', 404)
    if (!msg.isSnap) throw new AppError('Not a snap', 400)
    if (msg.snapViewedAt) return res.json({ data: { alreadyViewed: true } })

    // Only the recipient (not the sender) can mark it as viewed
    if (msg.senderId === userId) return res.json({ data: { alreadyViewed: false, isSender: true } })

    const updated = await prisma.directMessage.update({
      where: { id: msgId },
      data: { snapViewedAt: new Date() },
    })

    res.json({ data: { ok: true, viewedAt: updated.snapViewedAt } })
  } catch (err) { next(err) }
})

export default router
