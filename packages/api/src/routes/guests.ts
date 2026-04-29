import { Router } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { sendNotification } from '../lib/fcm'
import { HOST_TIERS } from '@partyradar/shared'
import type { SubscriptionTier } from '@partyradar/shared'
import { z } from 'zod'

const router = Router({ mergeParams: true })

const userSelect = {
  id: true, username: true, displayName: true,
  photoUrl: true, ageVerified: true, alcoholFriendly: true, subscriptionTier: true,
}

/** Returns true if userId is either the event host or an assigned moderator */
async function isHostOrModerator(eventId: string, userId: string, hostId: string): Promise<boolean> {
  if (userId === hostId) return true
  const mod = await prisma.eventModerator.findUnique({
    where: { eventId_userId: { eventId, userId } },
  })
  return !!mod
}

/** GET /api/events/:id/guests — host or moderator, paginated */
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params['id'] } })
    if (!event) throw new AppError('Event not found', 404)
    const userId = req.user!.dbUser.id
    if (!await isHostOrModerator(event.id, userId, event.hostId)) throw new AppError('Forbidden', 403)

    const page  = Math.max(1, Number(req.query['page']  ?? 1))
    const limit = Math.min(200, Math.max(1, Number(req.query['limit'] ?? 100)))
    const skip  = (page - 1) * limit

    const [guests, total] = await Promise.all([
      prisma.eventGuest.findMany({
        where: { eventId: event.id },
        include: { user: { select: userSelect } },
        orderBy: { invitedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.eventGuest.count({ where: { eventId: event.id } }),
    ])

    res.json({ data: guests, total, page, limit, hasMore: skip + guests.length < total })
  } catch (err) {
    next(err)
  }
})

/** POST /api/events/:id/guests/rsvp */
router.post('/rsvp', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params['id'] } })
    if (!event) throw new AppError('Event not found', 404)
    if (!event.isPublished || event.isCancelled) throw new AppError('Event not available', 400)

    const userId = req.user!.dbUser.id
    const token = req.body.inviteToken

    // Invite-only check — use timingSafeEqual to prevent token enumeration via timing
    if (event.isInviteOnly) {
      const provided = String(token ?? '')
      const expected = event.inviteToken ?? ''
      // Tokens are UUIDs (fixed 36-char length), so length comparison doesn't leak info.
      // timingSafeEqual guards against per-character timing leaks on the content itself.
      const tokenMatch =
        provided.length === expected.length &&
        provided.length > 0 &&
        timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
      if (!tokenMatch) throw new AppError('This event requires an invite link', 403)
    }

    // Age restriction check
    if (event.ageRestriction === 'AGE_21' && !req.user!.dbUser.ageVerified) {
      throw new AppError('Age verification required for 21+ events', 403)
    }
    if (event.ageRestriction === 'AGE_18' && !req.user!.dbUser.ageVerified) {
      throw new AppError('Age verification required for 18+ events', 403)
    }

    // Capacity check
    const confirmed = await prisma.eventGuest.count({
      where: { eventId: event.id, status: 'CONFIRMED' },
    })
    const isFull = confirmed >= event.capacity

    // Tier guest limit check on host (only applies when not waitlisting)
    if (!isFull) {
      const host = await prisma.user.findUnique({ where: { id: event.hostId }, select: { subscriptionTier: true } })
      // host can be null for AI-discovered events whose hostId references a system account;
      // fall back to FREE tier limits in that case so the RSVP still succeeds.
      const hostTier = HOST_TIERS[(host?.subscriptionTier ?? 'FREE') as SubscriptionTier]
      // maxGuests semantics: -1 = unlimited, 0 = no guests allowed, >0 = specific cap.
      // The old check (maxGuests > 0) incorrectly skipped the 0 case, letting FREE
      // hosts (maxGuests=0) accumulate unlimited RSVPs instead of being blocked.
      const guestLimit = hostTier.maxGuests
      if (guestLimit !== -1 && (guestLimit === 0 || confirmed >= guestLimit)) {
        throw new AppError('Event host guest limit reached', 400)
      }
    }

    const rsvpStatus = isFull ? 'WAITLISTED' : 'CONFIRMED'

    const guest = await prisma.eventGuest.upsert({
      where: { eventId_userId: { eventId: event.id, userId } },
      create: { eventId: event.id, userId, status: rsvpStatus },
      update: { status: rsvpStatus },
      include: { user: { select: userSelect } },
    })

    if (isFull) {
      // Notify guest they are waitlisted
      await sendNotification({
        userId,
        type: 'RSVP_CONFIRMED',
        title: 'Added to Waitlist',
        body: `You've been added to the waitlist for ${event.name}`,
        data: { eventId: event.id },
      })
    } else {
      // Notify host
      await sendNotification({
        userId: event.hostId,
        type: 'RSVP_CONFIRMED',
        title: `New RSVP for ${event.name}`,
        body: `${req.user!.dbUser.displayName} just RSVPd`,
        data: { eventId: event.id },
      })

      // Notify guest
      await sendNotification({
        userId,
        type: 'RSVP_CONFIRMED',
        title: 'RSVP Confirmed!',
        body: `You're going to ${event.name}`,
        data: { eventId: event.id },
      })
    }

    res.json({ data: guest })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/events/:id/guests/rsvp — cancel own RSVP */
router.delete('/rsvp', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const guest = await prisma.eventGuest.findUnique({
      where: { eventId_userId: { eventId: req.params['id']!, userId } },
    })
    if (!guest) throw new AppError('RSVP not found', 404)

    await prisma.eventGuest.update({
      where: { eventId_userId: { eventId: req.params['id']!, userId } },
      data: { status: 'CANCELLED' },
    })

    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/events/:id/guests/invite/link — generate invite link */
router.post('/invite/link', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params['id'] } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    let { inviteToken } = event
    if (!inviteToken) {
      const { v4: uuidv4 } = await import('uuid')
      inviteToken = uuidv4()
      await prisma.event.update({ where: { id: event.id }, data: { inviteToken } })
    }

    const link = `${process.env['FRONTEND_URL'] ?? 'https://partyradar-web.vercel.app'}/events/invite/${inviteToken}`
    res.json({ data: { link, inviteToken } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/events/:id/guests/invite/search — invite by username */
router.post('/invite/search', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({ username: z.string() })
  try {
    const { username } = schema.parse(req.body)
    const event = await prisma.event.findUnique({ where: { id: req.params['id'] } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    const target = await prisma.user.findUnique({ where: { username } })
    if (!target) throw new AppError('User not found', 404)

    await prisma.eventGuest.upsert({
      where: { eventId_userId: { eventId: event.id, userId: target.id } },
      create: { eventId: event.id, userId: target.id, status: 'PENDING' },
      update: { status: 'PENDING' },
    })

    await sendNotification({
      userId: target.id,
      type: 'INVITE_RECEIVED',
      title: `You're invited to ${event.name}`,
      body: `${req.user!.dbUser.displayName} invited you`,
      data: { eventId: event.id },
    })

    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/events/:id/guests/:guestId — host or moderator removes a guest */
router.delete('/:guestId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params['id'] } })
    if (!event) throw new AppError('Event not found', 404)
    const userId = req.user!.dbUser.id
    if (!await isHostOrModerator(event.id, userId, event.hostId)) throw new AppError('Forbidden', 403)

    // updateMany lets us atomically verify the guest belongs to THIS event —
    // without eventId in the filter, a host of event A could remove guests
    // from event B by knowing (or guessing) the guest's UUID.
    const result = await prisma.eventGuest.updateMany({
      where: { id: req.params['guestId'], eventId: event.id },
      data: { status: 'REMOVED' },
    })
    if (result.count === 0) throw new AppError('Guest not found in this event', 404)

    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/events/:id/guests/close — close RSVPs */
router.put('/close', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params['id'] } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    await prisma.event.update({ where: { id: event.id }, data: { capacity: 0 } })
    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

export default router
