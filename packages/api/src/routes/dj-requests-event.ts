/**
 * Event-scoped DJ Song Request routes
 *
 * GET    /api/events/:id/dj-requests                – list requests (sorted by upvotes)
 * POST   /api/events/:id/dj-requests                – submit request (paid or free via tier)
 * POST   /api/events/:id/dj-requests/:reqId/upvote  – toggle upvote
 * PATCH  /api/events/:id/dj-requests/:reqId         – host/mod: update status
 */
import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { getTier } from '@partyradar/shared'

const router = Router()

const DJ_REQUEST_PRICE = 1.00 // £1.00 per request for FREE-tier users

// ── GET /:id/dj-requests ──────────────────────────────────────────────────────
router.get('/:id/dj-requests', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const eventId = req.params['id']!
    const userId  = req.user?.dbUser.id ?? null

    const requests = await prisma.djRequest.findMany({
      where:   { eventId },
      orderBy: [{ upvotes: 'desc' }, { createdAt: 'asc' }],
      include: {
        user: { select: { id: true, displayName: true, photoUrl: true, username: true } },
        ...(userId ? { upvoteEntries: { where: { userId }, select: { id: true } } } : {}),
      },
    })

    const data = requests.map((r) => ({
      id:         r.id,
      song:       r.song,
      artist:     r.artist,
      message:    r.message,
      status:     r.status,
      upvotes:    r.upvotes,
      walletPaid: r.walletPaid,
      createdAt:  r.createdAt,
      user:       r.user,
      hasUpvoted: userId ? ((r as any).upvoteEntries?.length > 0) : false,
    }))

    res.json({ data })
  } catch (err) { next(err) }
})

// ── POST /:id/dj-requests ─────────────────────────────────────────────────────
router.post('/:id/dj-requests', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const eventId = req.params['id']!
    const userId  = req.user!.dbUser.id
    const tier    = req.user!.dbUser.subscriptionTier

    const { song, artist, message } = req.body as {
      song: string; artist?: string; message?: string
    }

    if (!song?.trim()) throw new AppError('Song name is required', 400)

    // Verify event exists and has DJ requests enabled
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, djRequestsEnabled: true },
    })
    if (!event) throw new AppError('Event not found', 404)
    if (!event.djRequestsEnabled) throw new AppError('Song requests are not enabled for this event', 403)

    const userTier = getTier(tier)
    const mustPay  = !userTier.canRequestDJ // FREE tier must pay

    if (mustPay) {
      const wallet = await prisma.wallet.findUnique({ where: { userId } })
      if (!wallet || wallet.balance < DJ_REQUEST_PRICE) {
        throw new AppError(
          `Insufficient wallet balance — £${DJ_REQUEST_PRICE.toFixed(2)} required. ` +
          `Top up your wallet or upgrade to Basic+ for free song requests.`,
          402,
        )
      }

      const [, , request] = await prisma.$transaction([
        prisma.wallet.update({
          where: { userId },
          data: {
            balance:       { decrement: DJ_REQUEST_PRICE },
            lifetimeSpent: { increment: DJ_REQUEST_PRICE },
          },
        }),
        prisma.walletTransaction.create({
          data: {
            walletId:    wallet.id,
            type:        'VENUE_SPEND',
            amount:      -DJ_REQUEST_PRICE,
            balanceAfter: wallet.balance - DJ_REQUEST_PRICE,
            description: `DJ song request: "${song.trim().slice(0, 60)}"`,
            status:      'COMPLETED',
            eventId,
          },
        }),
        prisma.djRequest.create({
          data: {
            userId, eventId,
            song:       song.trim().slice(0, 100),
            artist:     artist?.trim().slice(0, 80)   ?? null,
            message:    message?.trim().slice(0, 200) ?? null,
            creditCost: 0,
            walletPaid: true,
          },
          include: {
            user: { select: { id: true, displayName: true, photoUrl: true, username: true } },
          },
        }),
      ])

      return res.status(201).json({
        data: { ...request, hasUpvoted: false, paid: true, cost: DJ_REQUEST_PRICE },
      })
    }

    // BASIC+ — free request
    const request = await prisma.djRequest.create({
      data: {
        userId, eventId,
        song:       song.trim().slice(0, 100),
        artist:     artist?.trim().slice(0, 80)   ?? null,
        message:    message?.trim().slice(0, 200) ?? null,
        creditCost: 0,
        walletPaid: false,
      },
      include: {
        user: { select: { id: true, displayName: true, photoUrl: true, username: true } },
      },
    })

    return res.status(201).json({
      data: { ...request, hasUpvoted: false, paid: false, cost: 0 },
    })
  } catch (err) { next(err) }
})

// ── POST /:id/dj-requests/:reqId/upvote ──────────────────────────────────────
router.post('/:id/dj-requests/:reqId/upvote', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const eventId = req.params['id']!
    const reqId   = req.params['reqId']!
    const userId  = req.user!.dbUser.id

    const djReq = await prisma.djRequest.findFirst({ where: { id: reqId, eventId } })
    if (!djReq) throw new AppError('Request not found', 404)

    const existing = await prisma.djRequestUpvote.findUnique({
      where: { requestId_userId: { requestId: reqId, userId } },
    })

    if (existing) {
      await prisma.$transaction([
        prisma.djRequestUpvote.delete({ where: { id: existing.id } }),
        prisma.djRequest.update({ where: { id: reqId }, data: { upvotes: { decrement: 1 } } }),
      ])
      return res.json({ data: { upvoted: false } })
    }

    await prisma.$transaction([
      prisma.djRequestUpvote.create({ data: { requestId: reqId, userId } }),
      prisma.djRequest.update({ where: { id: reqId }, data: { upvotes: { increment: 1 } } }),
    ])
    return res.json({ data: { upvoted: true } })
  } catch (err) { next(err) }
})

// ── PATCH /:id/dj-requests/:reqId — host/mod only: update status ──────────────
router.patch('/:id/dj-requests/:reqId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const eventId = req.params['id']!
    const reqId   = req.params['reqId']!
    const userId  = req.user!.dbUser.id
    const { status } = req.body as { status: 'APPROVED' | 'REJECTED' | 'PLAYED' }

    if (!['APPROVED', 'REJECTED', 'PLAYED'].includes(status)) {
      throw new AppError('Invalid status', 400)
    }

    // Verify host or moderator
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        hostId:     true,
        moderators: { where: { userId }, select: { id: true } },
      },
    })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== userId && event.moderators.length === 0) {
      throw new AppError('Only the host or a moderator can manage song requests', 403)
    }

    const request = await prisma.djRequest.update({
      where: { id: reqId, eventId },
      data:  { status },
    })

    // Refund wallet if request was paid and is now rejected
    if (status === 'REJECTED' && request.walletPaid) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: request.userId } })
      if (wallet) {
        await prisma.$transaction([
          prisma.wallet.update({
            where: { id: wallet.id },
            data:  { balance: { increment: DJ_REQUEST_PRICE } },
          }),
          prisma.walletTransaction.create({
            data: {
              walletId:    wallet.id,
              type:        'BONUS',
              amount:      DJ_REQUEST_PRICE,
              balanceAfter: wallet.balance + DJ_REQUEST_PRICE,
              description: `Refund: DJ request declined — "${request.song}"`,
              status:      'COMPLETED',
              eventId,
            },
          }),
        ])
      }
    }

    res.json({ data: request })
  } catch (err) { next(err) }
})

export default router
