import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { TIERS } from '@partyradar/shared'
import { stripe } from '../lib/stripe'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import type { SubscriptionTier } from '@partyradar/shared'

const router = Router()

const eventSchema = z.object({
  name: z.string().min(3).max(100),
  type: z.enum(['HOME_PARTY', 'CLUB_NIGHT', 'CONCERT']),
  description: z.string().min(10).max(2000),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().min(3).max(200),
  neighbourhood: z.string().min(2).max(100),
  showNeighbourhoodOnly: z.boolean().default(false),
  capacity: z.number().int().min(1).max(10000),
  price: z.number().min(0).default(0),
  ticketQuantity: z.number().int().min(0).default(0),
  alcoholPolicy: z.enum(['NONE', 'PROVIDED', 'BYOB']).default('NONE'),
  ageRestriction: z.enum(['ALL_AGES', 'AGE_18', 'AGE_21']).default('ALL_AGES'),
  dressCode: z.string().max(200).optional(),
  whatToBring: z.array(z.string()).default([]),
  houseRules: z.string().max(1000).optional(),
  vibeTags: z.array(z.string()).max(8).default([]),
  isInviteOnly: z.boolean().default(false),
  coverImageUrl: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().url().optional()
  ),
})

const userSelect = {
  id: true, username: true, displayName: true,
  photoUrl: true, bio: true, ageVerified: true,
  alcoholFriendly: true, subscriptionTier: true,
}

/** GET /api/events — discover events */
router.get('/', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { type, lat, lng, radius = 50, alcohol, search, page = '1', limit = '20' } = req.query

    const skip = (Number(page) - 1) * Number(limit)
    const showAlcohol = req.user?.dbUser.showAlcoholEvents ?? false

    const where: Record<string, unknown> = {
      isPublished: true,
      isCancelled: false,
      startsAt: { gte: new Date() },
    }

    if (type) where['type'] = type
    if (search) where['name'] = { contains: search as string, mode: 'insensitive' }

    // Hide alcohol events if user hasn't enabled the toggle
    if (!showAlcohol) {
      where['alcoholPolicy'] = 'NONE'
    }

    // Geo filter
    if (lat && lng) {
      const latN = Number(lat), lngN = Number(lng), radN = Number(radius)
      const latDelta = radN / 69
      const lngDelta = radN / (69 * Math.cos((latN * Math.PI) / 180))
      where['lat'] = { gte: latN - latDelta, lte: latN + latDelta }
      where['lng'] = { gte: lngN - lngDelta, lte: lngN + lngDelta }
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: [{ isFeatured: 'desc' }, { startsAt: 'asc' }],
        include: {
          host: { select: userSelect },
          _count: { select: { guests: { where: { status: 'CONFIRMED' } } } },
        },
      }),
      prisma.event.count({ where }),
    ])

    const data = events.map((e) => ({
      ...e,
      // Hide exact address for neighbourhood-only events
      address: e.showNeighbourhoodOnly && !req.user ? e.neighbourhood : e.address,
      guestCount: e._count.guests,
    }))

    res.json({ data, total, page: Number(page), limit: Number(limit), hasMore: skip + data.length < total })
  } catch (err) {
    next(err)
  }
})

/** GET /api/events/invite/:token */
router.get('/invite/:token', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({
      where: { inviteToken: req.params['token'] },
      include: { host: { select: userSelect }, _count: { select: { guests: true } } },
    })
    if (!event) throw new AppError('Invite link not found', 404)
    res.json({ data: { ...event, guestCount: event._count.guests } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/events/:id */
router.get('/:id', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params['id'] },
      include: {
        host: { select: userSelect },
        _count: { select: { guests: { where: { status: 'CONFIRMED' } } } },
      },
    })

    if (!event || event.isCancelled) throw new AppError('Event not found', 404)

    if (event.isInviteOnly) {
      const token = req.query['token']
      const isHost = req.user?.dbUser.id === event.hostId
      const isGuest = req.user
        ? await prisma.eventGuest.findUnique({ where: { eventId_userId: { eventId: event.id, userId: req.user.dbUser.id } } })
        : null
      if (!isHost && !isGuest && token !== event.inviteToken) {
        throw new AppError('This event is invite-only', 403)
      }
    }

    const showAlcohol = req.user?.dbUser.showAlcoholEvents ?? false
    if (!showAlcohol && event.alcoholPolicy !== 'NONE' && req.user?.dbUser.id !== event.hostId) {
      throw new AppError('Enable alcohol events in settings to view this event', 403)
    }

    res.json({ data: { ...event, guestCount: event._count.guests } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/events — create event */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = eventSchema.parse(req.body)
    const user = req.user!.dbUser
    const tier = TIERS[user.subscriptionTier as SubscriptionTier]

    // Tier check: event creation limits
    if (tier.maxEvents !== -1) {
      const thisMonth = new Date()
      thisMonth.setDate(1)
      thisMonth.setHours(0, 0, 0, 0)
      const count = await prisma.event.count({
        where: { hostId: user.id, createdAt: { gte: thisMonth } },
      })
      if (count >= tier.maxEvents) {
        throw new AppError(`Your ${tier.name} plan allows ${tier.maxEvents} event(s)/month. Upgrade to host more.`, 403, 'TIER_LIMIT')
      }
    }

    // Ticket sales require Pro+
    if (body.price > 0 && !tier.ticketSales) {
      throw new AppError('Upgrade to Pro to sell tickets', 403, 'TIER_LIMIT')
    }

    const event = await prisma.event.create({
      data: {
        ...body,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        hostId: user.id,
        ticketsRemaining: body.ticketQuantity,
        isPublished: true,
        inviteToken: body.isInviteOnly ? uuidv4() : null,
        isFeatured: TIERS[user.subscriptionTier as SubscriptionTier].featured,
      },
      include: { host: { select: userSelect } },
    })

    // Create Stripe product + price for paid events
    if (event.price > 0) {
      const product = await stripe.products.create({ name: event.name })
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(event.price * 100),
        currency: 'usd',
      })
      await prisma.event.update({
        where: { id: event.id },
        data: { stripeProductId: product.id, stripePriceId: price.id },
      })
    }

    res.status(201).json({ data: event })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/events/:id */
router.put('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params['id'] } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    const body = eventSchema.partial().parse(req.body)
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: {
        ...body,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
      },
      include: { host: { select: userSelect } },
    })

    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/events/:id — cancel event */
router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params['id'] } })
    if (!event) throw new AppError('Event not found', 404)
    if (event.hostId !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    await prisma.event.update({ where: { id: event.id }, data: { isCancelled: true } })
    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

export default router
