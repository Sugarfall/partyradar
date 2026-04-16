import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { optionalAuth, requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { GROUP_PRICE_TIERS, REFERRAL_CONFIG } from '@partyradar/shared'
import { stripe } from '../lib/stripe'

const router = Router()

export const GENRE_GROUPS = [
  { slug: 'genre-rave',      name: 'Rave',       description: 'Underground raves, techno nights, warehouse parties',   emoji: '🎧', coverColor: '#a855f7' },
  { slug: 'genre-house',     name: 'House',      description: 'Deep house, tech house, garage and club classics',      emoji: '🏠', coverColor: '#3b82f6' },
  { slug: 'genre-rnb',       name: 'R&B',        description: 'R&B, soul, hip-hop and neo-soul nights',                emoji: '🎤', coverColor: '#ec4899' },
  { slug: 'genre-trippy',    name: 'Trippy',     description: 'Psychedelic, experimental and mind-bending sounds',     emoji: '🌀', coverColor: '#10b981' },
  { slug: 'genre-dnb',       name: 'Drum & Bass', description: 'DnB, jungle, breakbeat and liquid vibes',             emoji: '🥁', coverColor: '#f97316' },
  { slug: 'genre-afrobeats', name: 'Afrobeats',  description: 'Afrobeats, amapiano, dancehall and Caribbean sounds',   emoji: '🌍', coverColor: '#eab308' },
  { slug: 'genre-rock',      name: 'Rock & Indie', description: 'Rock, indie, punk, shoegaze and guitar music',       emoji: '🎸', coverColor: '#ef4444' },
  { slug: 'genre-electronic', name: 'Electronic', description: 'Ambient, IDM, synth and experimental electronics',    emoji: '⚡', coverColor: '#06b6d4' },
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
    const userLat = req.query['lat'] ? Number(req.query['lat']) : null
    const userLng = req.query['lng'] ? Number(req.query['lng']) : null
    const searchQ = req.query['q'] ? String(req.query['q']).trim().toLowerCase() : null

    const groups = await prisma.groupChat.findMany({
      where: searchQ
        ? { OR: [
            { name: { contains: searchQ, mode: 'insensitive' } },
            { description: { contains: searchQ, mode: 'insensitive' } },
          ]}
        : undefined,
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

    // Proximity sort for VENUE groups — extract venueId from slug (pattern: venue-{id})
    let venueDistanceMap = new Map<string, number>()
    if (userLat !== null && userLng !== null && !isNaN(userLat) && !isNaN(userLng)) {
      const venueGroups = groups.filter((g) => g.type === 'VENUE' && g.slug.startsWith('venue-'))
      const venueIds = venueGroups.map((g) => g.slug.replace(/^venue-/, '')).filter(Boolean)
      if (venueIds.length > 0) {
        const venues = await prisma.venue.findMany({
          where: { id: { in: venueIds } },
          select: { id: true, lat: true, lng: true },
        })
        for (const venue of venues) {
          const slug = `venue-${venue.id}`
          const dLat = venue.lat - userLat
          const dLng = venue.lng - userLng
          venueDistanceMap.set(slug, Math.sqrt(dLat * dLat + dLng * dLng))
        }
      }
    }

    // Batch-fetch memberships for current user
    const memberships = userId
      ? await prisma.groupMembership.findMany({
          where: { userId, groupId: { in: groups.map((g) => g.id) } },
          select: { groupId: true, notificationsEnabled: true },
        })
      : []
    const membershipMap = new Map(memberships.map((m) => [m.groupId, m]))

    // Batch-fetch group subscriptions for paid groups
    const paidGroupIds = groups.filter((g) => g.isPaid).map((g) => g.id)
    const groupSubs = userId && paidGroupIds.length > 0
      ? await prisma.groupSubscription.findMany({
          where: { userId, groupId: { in: paidGroupIds } },
          select: { groupId: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
        })
      : []
    const groupSubMap = new Map(groupSubs.map((s) => [s.groupId, s]))

    const data = groups.map((g) => {
      const m = membershipMap.get(g.id)
      const last = g.messages[0]
      const sub = groupSubMap.get(g.id)
      const isOwner = g.createdById === userId
      return {
        id: g.id,
        slug: g.slug,
        name: g.name,
        description: g.description,
        type: g.type,
        emoji: g.emoji,
        coverColor: g.coverColor,
        isPrivate: g.isPrivate,
        isPaid: g.isPaid,
        priceMonthly: g.priceMonthly,
        isOwner,
        memberCount: g.memberCount,
        isJoined: !!m,
        isSubscribed: isOwner || !!sub,
        notificationsEnabled: m?.notificationsEnabled ?? false,
        lastMessage: last
          ? { text: last.text, senderName: last.sender.displayName, createdAt: last.createdAt.toISOString() }
          : null,
        _distance: venueDistanceMap.get(g.slug) ?? null,
      }
    })

    // Sort venue groups by proximity when user location is provided
    if (venueDistanceMap.size > 0) {
      data.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'GENRE' ? -1 : 1 // GENRE first
        if (a.type === 'VENUE' && b.type === 'VENUE') {
          const da = a._distance ?? Infinity
          const db = b._distance ?? Infinity
          return da - db
        }
        return b.memberCount - a.memberCount
      })
    }

    res.json({ data: data.map(({ _distance, ...g }) => g) })
  } catch (err) {
    next(err)
  }
})

/** POST /api/groups — create a new community group */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { name, description, emoji, coverColor, isPrivate, password, isPaid, priceTierId, type: groupType } = req.body as {
      name: string; description?: string; emoji?: string; coverColor?: string
      isPrivate?: boolean; password?: string; isPaid?: boolean; priceTierId?: string
      type?: 'GENRE' | 'FESTIVAL' | 'TRIP'
    }
    if (!name?.trim() || name.trim().length < 2) throw new AppError('Group name must be at least 2 characters', 400)
    if (name.trim().length > 40) throw new AppError('Group name too long (max 40)', 400)
    if (isPrivate && !isPaid && (!password?.trim() || password.trim().length < 4)) {
      throw new AppError('Private groups require a password (min 4 characters)', 400)
    }

    // Validate paid tier
    let priceMonthly: number | null = null
    if (isPaid) {
      const tier = GROUP_PRICE_TIERS.find((t) => t.id === priceTierId)
      if (!tier) throw new AppError('Invalid price tier', 400)
      priceMonthly = tier.price
    }

    const slug = `user-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`

    const group = await prisma.groupChat.create({
      data: {
        slug,
        name: name.trim(),
        description: description?.trim()?.slice(0, 200) ?? null,
        type: (['GENRE', 'FESTIVAL', 'TRIP'] as const).includes(groupType as any) ? (groupType as 'GENRE' | 'FESTIVAL' | 'TRIP') : 'GENRE',
        emoji: emoji?.trim() || '💬',
        coverColor: coverColor || '#6366f1',
        isPrivate: !!(isPrivate || isPaid),
        password: (isPrivate && !isPaid) ? password!.trim() : null,
        isPaid: !!isPaid,
        priceMonthly,
        createdById: userId,
      },
    })

    // Auto-join creator (free — they own it)
    await prisma.groupMembership.create({ data: { groupId: group.id, userId } })
    await prisma.groupChat.update({ where: { id: group.id }, data: { memberCount: 1 } })

    res.status(201).json({
      data: {
        id: group.id,
        slug: group.slug,
        name: group.name,
        description: group.description,
        type: group.type,
        emoji: group.emoji,
        coverColor: group.coverColor,
        isPrivate: group.isPrivate,
        isPaid: group.isPaid,
        priceMonthly: group.priceMonthly,
        isOwner: true,
        memberCount: 1,
        isJoined: true,
        isSubscribed: true,
        notificationsEnabled: true,
        lastMessage: null,
      },
    })
  } catch (err) {
    next(err)
  }
})

/** GET /api/groups/:id/messages */
router.get('/:id/messages', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)

    const userId = req.user?.dbUser.id ?? null
    const membership = userId
      ? await prisma.groupMembership.findUnique({
          where: { groupId_userId: { groupId: group.id, userId } },
        })
      : null

    // Private groups: only members can read messages
    if (group.isPrivate && !membership) {
      res.json({
        data: {
          group: {
            id: group.id, slug: group.slug, name: group.name, emoji: group.emoji,
            coverColor: group.coverColor, memberCount: group.memberCount,
            isPrivate: true, isJoined: false, notificationsEnabled: false,
          },
          messages: [],
          locked: true,
        },
      })
      return
    }

    const messages = await prisma.groupMessage.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: 'asc' },
      take: 60,
      include: {
        sender: { select: { id: true, displayName: true, photoUrl: true, username: true } },
      },
    })

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
          isPrivate: group.isPrivate,
          isOwner: group.createdById === userId,
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
    const { password } = (req.body ?? {}) as { password?: string }
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)

    const isOwner = group.createdById === userId

    // Paid group: must have active subscription (owner exempt)
    if (group.isPaid && !isOwner) {
      const sub = await prisma.groupSubscription.findUnique({
        where: { groupId_userId: { groupId: group.id, userId } },
      })
      if (!sub || (sub.currentPeriodEnd && sub.currentPeriodEnd < new Date())) {
        throw new AppError('This is a paid group — subscribe to join', 402)
      }
    }

    // Private (non-paid) group requires correct password (owner exempt)
    if (group.isPrivate && !group.isPaid && !isOwner) {
      if (!password || password !== group.password) {
        throw new AppError('Incorrect password', 403)
      }
    }

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

/** POST /api/groups/:id/subscribe — subscribe to a paid group */
router.post('/:id/subscribe', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)
    if (!group.isPaid) throw new AppError('This group is free', 400)

    // Check if already subscribed
    const existing = await prisma.groupSubscription.findUnique({
      where: { groupId_userId: { groupId: group.id, userId } },
    })
    if (existing && existing.currentPeriodEnd && existing.currentPeriodEnd > new Date()) {
      throw new AppError('Already subscribed', 400)
    }

    // Owner subscribes for free — bypass Stripe
    if (group.createdById === userId) {
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      await prisma.groupSubscription.upsert({
        where: { groupId_userId: { groupId: group.id, userId } },
        create: { groupId: group.id, userId, currentPeriodEnd: periodEnd },
        update: { currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
      })
      const membership = await prisma.groupMembership.findUnique({
        where: { groupId_userId: { groupId: group.id, userId } },
      })
      if (!membership) {
        await prisma.groupMembership.create({ data: { groupId: group.id, userId } })
        await prisma.groupChat.update({ where: { id: group.id }, data: { memberCount: { increment: 1 } } })
      }
      res.json({ data: { subscribed: true, expiresAt: periodEnd.toISOString() } })
      return
    }

    // Get or create Stripe customer
    let stripeCustomerId = (await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } }))?.stripeCustomerId

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({ email: req.user!.dbUser.email })
      stripeCustomerId = customer.id
      await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId } })
    }

    // Create Stripe checkout session for group subscription
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: { name: `${group.name} — Monthly Subscription` },
          unit_amount: Math.round((group.priceMonthly ?? 0) * 100),
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      mode: 'subscription',
      metadata: { type: 'group_subscription', groupId: group.id, userId },
      success_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/subscriptions?success=true`,
      cancel_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/subscriptions`,
    })

    res.json({ data: { url: session.url } })
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

    // Must be a member to message private groups
    const membership = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId } },
    })
    if (!membership && group.isPrivate) {
      throw new AppError('Join this private group first', 403)
    }
    // Auto-join on first message (public groups only)
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
