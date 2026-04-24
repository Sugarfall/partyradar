import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { sendNotification } from '../lib/fcm'
import { TIERS } from '@partyradar/shared'
import type { SubscriptionTier } from '@partyradar/shared'
import { z } from 'zod'

const router = Router({ mergeParams: true })

const userSelect = {
  id: true, username: true, displayName: true,
  photoUrl: true, ageVerified: true, alcoholFriendly: true, subscriptionTier: true,
}

/** GET /api/events/:id/guests — host only */
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params['id'] } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    const guests = await prisma.eventGuest.findMany({
      where: { eventId: event.id },
      include: { user: { select: userSelect } },
      orderBy: { invitedAt: 'desc' },
    })

    res.json({ data: guests })
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

    // Invite-only check
    if (event.isInviteOnly && event.inviteToken !== token) {
      throw new AppError('This event requires an invite link', 403)
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
      const hostTier = TIERS[host!.subscriptionTier as SubscriptionTier]
      if (hostTier.maxGuests !== -1 && confirmed >= hostTier.maxGuests) {
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

/** DELETE /api/events/:id/guests/:guestId — host removes a guest */
router.delete('/:guestId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params['id'] } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    await prisma.eventGuest.update({
      where: { id: req.params['guestId'] },
      data: { status: 'REMOVED' },
    })

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
