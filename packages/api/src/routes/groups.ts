import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { optionalAuth, requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { GROUP_PRICE_TIERS } from '@partyradar/shared'
import { stripe } from '../lib/stripe'

const router = Router()

export const GENRE_GROUPS = [
  { slug: 'genre-rave',      name: 'Rave',         description: 'Underground raves, techno nights, warehouse parties',   emoji: '🎧', coverColor: '#a855f7' },
  { slug: 'genre-house',     name: 'House',         description: 'Deep house, tech house, garage and club classics',      emoji: '🏠', coverColor: '#3b82f6' },
  { slug: 'genre-rnb',       name: 'R&B',           description: 'R&B, soul, hip-hop and neo-soul nights',                emoji: '🎤', coverColor: '#ec4899' },
  { slug: 'genre-trippy',    name: 'Trippy',        description: 'Psychedelic, experimental and mind-bending sounds',     emoji: '🌀', coverColor: '#10b981' },
  { slug: 'genre-dnb',       name: 'Drum & Bass',   description: 'DnB, jungle, breakbeat and liquid vibes',              emoji: '🥁', coverColor: '#f97316' },
  { slug: 'genre-afrobeats', name: 'Afrobeats',     description: 'Afrobeats, amapiano, dancehall and Caribbean sounds',  emoji: '🌍', coverColor: '#eab308' },
  { slug: 'genre-rock',      name: 'Rock & Indie',  description: 'Rock, indie, punk, shoegaze and guitar music',         emoji: '🎸', coverColor: '#ef4444' },
  { slug: 'genre-electronic',name: 'Electronic',    description: 'Ambient, IDM, synth and experimental electronics',     emoji: '⚡', coverColor: '#06b6d4' },
]

/** Seed genre + venue group chats — idempotent, called from admin seed */
export async function seedGroupChats(venueNames?: { id: string; name: string; type: string }[]) {
  for (const g of GENRE_GROUPS) {
    await prisma.groupChat.upsert({ where: { slug: g.slug }, update: {}, create: { ...g, type: 'GENRE' } })
  }
  if (venueNames && venueNames.length > 0) {
    const emojiMap: Record<string, string> = { NIGHTCLUB: '🎉', BAR: '🍺', PUB: '🍻', CONCERT_HALL: '🎸', ROOFTOP_BAR: '🌙', LOUNGE: '🥃' }
    const colorMap: Record<string, string> = { NIGHTCLUB: '#a855f7', BAR: '#3b82f6', PUB: '#f59e0b', CONCERT_HALL: '#ec4899', ROOFTOP_BAR: '#10b981', LOUNGE: '#6366f1' }
    for (const venue of venueNames) {
      const slug = `venue-${venue.id}`
      await prisma.groupChat.upsert({
        where: { slug },
        update: {},
        create: { slug, name: venue.name, description: `Chat for ${venue.name} — Glasgow`, type: 'VENUE', emoji: emojiMap[venue.type] ?? '🏙️', coverColor: colorMap[venue.type] ?? '#6366f1' },
      })
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGroup(g: any, userId: string | null, membershipMap: Map<string, any>, groupSubMap: Map<string, any>) {
  const m = membershipMap.get(g.id)
  const last = g.messages?.[0]
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
    hasPassword: !!g.password,
    priceMonthly: g.priceMonthly,
    isOwner,
    memberCount: g.memberCount,
    isJoined: !!m,
    isSubscribed: isOwner || !!sub,
    notificationsEnabled: m?.notificationsEnabled ?? false,
    pendingRequest: !!(userId && g.joinRequests?.includes(userId)),
    joinRequestCount: isOwner ? (g.joinRequests?.length ?? 0) : undefined,
    lastMessage: last ? { text: last.text, senderName: last.sender.displayName, createdAt: last.createdAt.toISOString() } : null,
  }
}

// ─── GET /api/groups ──────────────────────────────────────────────────────────

router.get('/', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.dbUser.id ?? null
    const userLat = req.query['lat'] ? Number(req.query['lat']) : null
    const userLng = req.query['lng'] ? Number(req.query['lng']) : null

    const groups = await prisma.groupChat.findMany({
      orderBy: [{ type: 'asc' }, { memberCount: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { memberships: true } },
        messages: { take: 1, orderBy: { createdAt: 'desc' }, include: { sender: { select: { displayName: true } } } },
      },
    })

    let venueDistanceMap = new Map<string, number>()
    if (userLat !== null && userLng !== null && !isNaN(userLat) && !isNaN(userLng)) {
      const venueGroups = groups.filter((g) => g.type === 'VENUE' && g.slug.startsWith('venue-'))
      const venueIds = venueGroups.map((g) => g.slug.replace(/^venue-/, '')).filter(Boolean)
      if (venueIds.length > 0) {
        const venues = await prisma.venue.findMany({ where: { id: { in: venueIds } }, select: { id: true, lat: true, lng: true } })
        for (const venue of venues) {
          const slug = `venue-${venue.id}`
          const dLat = venue.lat - userLat!, dLng = venue.lng - userLng!
          venueDistanceMap.set(slug, Math.sqrt(dLat * dLat + dLng * dLng))
        }
      }
    }

    const memberships = userId
      ? await prisma.groupMembership.findMany({ where: { userId, groupId: { in: groups.map((g) => g.id) } }, select: { groupId: true, notificationsEnabled: true } })
      : []
    const membershipMap = new Map(memberships.map((m) => [m.groupId, m]))

    const paidGroupIds = groups.filter((g) => g.isPaid).map((g) => g.id)
    const groupSubs = userId && paidGroupIds.length > 0
      ? await prisma.groupSubscription.findMany({ where: { userId, groupId: { in: paidGroupIds } }, select: { groupId: true, currentPeriodEnd: true } })
      : []
    const groupSubMap = new Map(groupSubs.map((s) => [s.groupId, s]))

    const data = groups.map((g) => ({ ...formatGroup(g, userId, membershipMap, groupSubMap), _distance: venueDistanceMap.get(g.slug) ?? null }))

    if (venueDistanceMap.size > 0) {
      data.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'GENRE' ? -1 : 1
        if (a.type === 'VENUE' && b.type === 'VENUE') return (a._distance ?? Infinity) - (b._distance ?? Infinity)
        return b.memberCount - a.memberCount
      })
    }

    res.json({ data: data.map(({ _distance, ...g }) => g) })
  } catch (err) { next(err) }
})

// ─── POST /api/groups — create group ─────────────────────────────────────────

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { name, description, emoji, coverColor, isPrivate, password, isPaid, priceTierId, customPrice } = req.body as {
      name: string; description?: string; emoji?: string; coverColor?: string
      isPrivate?: boolean; password?: string; isPaid?: boolean; priceTierId?: string; customPrice?: number
    }
    if (!name?.trim() || name.trim().length < 2) throw new AppError('Group name must be at least 2 characters', 400)
    if (name.trim().length > 40) throw new AppError('Group name too long (max 40)', 400)
    if (isPrivate && !isPaid && password && password.trim().length > 0 && password.trim().length < 4) {
      throw new AppError('Password must be at least 4 characters', 400)
    }

    let priceMonthly: number | null = null
    if (isPaid) {
      if (priceTierId === 'CUSTOM') {
        if (!customPrice || customPrice < 0.5 || customPrice > 99.99) {
          throw new AppError('Custom price must be between £0.50 and £99.99', 400)
        }
        priceMonthly = Math.round(customPrice * 100) / 100
      } else {
        const tier = GROUP_PRICE_TIERS.find((t) => t.id === priceTierId && t.id !== 'CUSTOM')
        if (!tier) throw new AppError('Invalid price tier', 400)
        priceMonthly = tier.price
      }
    }

    const slug = `user-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`

    const group = await prisma.groupChat.create({
      data: {
        slug, name: name.trim(),
        description: description?.trim()?.slice(0, 200) ?? null,
        type: 'GENRE',
        emoji: emoji?.trim() || '💬',
        coverColor: coverColor || '#6366f1',
        isPrivate: !!(isPrivate || isPaid),
        // password only if explicitly provided and non-empty
        password: (isPrivate && !isPaid && password?.trim()) ? password.trim() : null,
        isPaid: !!isPaid,
        priceMonthly,
        createdById: userId,
      },
    })

    await prisma.groupMembership.create({ data: { groupId: group.id, userId } })
    await prisma.groupChat.update({ where: { id: group.id }, data: { memberCount: 1 } })

    res.status(201).json({
      data: {
        id: group.id, slug: group.slug, name: group.name, description: group.description,
        type: group.type, emoji: group.emoji, coverColor: group.coverColor,
        isPrivate: group.isPrivate, isPaid: group.isPaid, hasPassword: !!group.password,
        priceMonthly: group.priceMonthly, isOwner: true, memberCount: 1,
        isJoined: true, isSubscribed: true, notificationsEnabled: true, lastMessage: null,
        pendingRequest: false, joinRequestCount: 0,
      },
    })
  } catch (err) { next(err) }
})

// ─── GET /api/groups/:id/messages ────────────────────────────────────────────

router.get('/:id/messages', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)

    const userId = req.user?.dbUser.id ?? null
    const membership = userId
      ? await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } })
      : null

    if (group.isPrivate && !membership) {
      res.json({
        data: {
          group: {
            id: group.id, slug: group.slug, name: group.name, emoji: group.emoji,
            coverColor: group.coverColor, memberCount: group.memberCount, description: group.description,
            isPrivate: true, isPaid: group.isPaid, hasPassword: !!group.password,
            priceMonthly: group.priceMonthly, isJoined: false, notificationsEnabled: false,
            pendingRequest: !!(userId && group.joinRequests.includes(userId)),
            joinRequestCount: group.createdById === userId ? group.joinRequests.length : undefined,
            isOwner: group.createdById === userId,
          },
          messages: [], locked: true,
        },
      })
      return
    }

    const messages = await prisma.groupMessage.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: 'asc' },
      take: 80,
      include: { sender: { select: { id: true, displayName: true, photoUrl: true, username: true } } },
    })

    const senderIds = [...new Set(messages.map((m) => m.senderId))]
    const follows = userId
      ? await prisma.follow.findMany({ where: { followerId: userId, followingId: { in: senderIds } }, select: { followingId: true } })
      : []
    const followedIds = new Set(follows.map((f) => f.followingId))

    res.json({
      data: {
        group: {
          id: group.id, slug: group.slug, name: group.name, emoji: group.emoji,
          coverColor: group.coverColor, memberCount: group.memberCount, description: group.description,
          isPrivate: group.isPrivate, isPaid: group.isPaid, hasPassword: !!group.password,
          priceMonthly: group.priceMonthly, isOwner: group.createdById === userId,
          isJoined: !!membership, notificationsEnabled: membership?.notificationsEnabled ?? false,
          pendingRequest: false,
          joinRequestCount: group.createdById === userId ? group.joinRequests.length : undefined,
        },
        messages: messages.map((m) => ({
          id: m.id, senderId: m.senderId,
          senderName: m.sender.displayName, senderPhoto: m.sender.photoUrl,
          senderUsername: m.sender.username, text: m.text,
          createdAt: m.createdAt.toISOString(), isFollowing: followedIds.has(m.senderId),
        })),
      },
    })
  } catch (err) { next(err) }
})

// ─── GET /api/groups/:id/members ─────────────────────────────────────────────

router.get('/:id/members', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)

    const userId = req.user?.dbUser.id ?? null
    const membership = userId
      ? await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } })
      : null

    if (group.isPrivate && !membership) throw new AppError('Join this group to see members', 403)

    const memberships = await prisma.groupMembership.findMany({
      where: { groupId: group.id },
      orderBy: { joinedAt: 'asc' },
      include: { user: { select: { id: true, displayName: true, username: true, photoUrl: true, bio: true } } },
    })

    // Check who current user follows
    const memberIds = memberships.map((m) => m.user.id)
    const follows = userId
      ? await prisma.follow.findMany({ where: { followerId: userId, followingId: { in: memberIds } }, select: { followingId: true } })
      : []
    const followedIds = new Set(follows.map((f) => f.followingId))

    res.json({
      data: memberships.map((m) => ({
        id: m.user.id,
        displayName: m.user.displayName,
        username: m.user.username,
        photoUrl: m.user.photoUrl,
        bio: m.user.bio,
        joinedAt: m.joinedAt.toISOString(),
        isOwner: group.createdById === m.user.id,
        isFollowing: followedIds.has(m.user.id),
        isMe: m.user.id === userId,
      })),
    })
  } catch (err) { next(err) }
})

// ─── GET /api/groups/:id/join-requests (owner only) ──────────────────────────

router.get('/:id/join-requests', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)
    if (group.createdById !== userId) throw new AppError('Only the group owner can view requests', 403)

    if (group.joinRequests.length === 0) { res.json({ data: [] }); return }

    const users = await prisma.user.findMany({
      where: { id: { in: group.joinRequests } },
      select: { id: true, displayName: true, username: true, photoUrl: true },
    })
    res.json({ data: users })
  } catch (err) { next(err) }
})

// ─── POST /api/groups/:id/join-request ───────────────────────────────────────

router.post('/:id/join-request', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)
    if (!group.isPrivate || group.password) throw new AppError('This group uses a password to join', 400)
    if (group.createdById === userId) throw new AppError('You own this group', 400)

    const existing = await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } })
    if (existing) throw new AppError('Already a member', 400)
    if (group.joinRequests.includes(userId)) { res.json({ data: { requested: true } }); return }

    await prisma.groupChat.update({
      where: { id: group.id },
      data: { joinRequests: { push: userId } },
    })

    res.json({ data: { requested: true } })
  } catch (err) { next(err) }
})

// ─── PUT /api/groups/:id/join-requests/:userId/approve ───────────────────────

router.put('/:id/join-requests/:requestUserId/approve', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const ownerId = req.user!.dbUser.id
    const { requestUserId } = req.params as { requestUserId: string }
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)
    if (group.createdById !== ownerId) throw new AppError('Only owner can approve requests', 403)

    // Remove from joinRequests array
    await prisma.groupChat.update({
      where: { id: group.id },
      data: { joinRequests: group.joinRequests.filter((id) => id !== requestUserId) },
    })

    // Add membership
    const existing = await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId: group.id, userId: requestUserId } } })
    if (!existing) {
      await prisma.groupMembership.create({ data: { groupId: group.id, userId: requestUserId } })
      await prisma.groupChat.update({ where: { id: group.id }, data: { memberCount: { increment: 1 } } })
    }

    res.json({ data: { approved: true } })
  } catch (err) { next(err) }
})

// ─── DELETE /api/groups/:id/join-requests/:userId/reject ─────────────────────

router.delete('/:id/join-requests/:requestUserId/reject', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const ownerId = req.user!.dbUser.id
    const { requestUserId } = req.params as { requestUserId: string }
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)
    if (group.createdById !== ownerId) throw new AppError('Only owner can reject requests', 403)

    await prisma.groupChat.update({
      where: { id: group.id },
      data: { joinRequests: group.joinRequests.filter((id) => id !== requestUserId) },
    })

    res.json({ data: { rejected: true } })
  } catch (err) { next(err) }
})

// ─── DELETE /api/groups/:id/join-request (cancel own request) ────────────────

router.delete('/:id/join-request', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)

    await prisma.groupChat.update({
      where: { id: group.id },
      data: { joinRequests: group.joinRequests.filter((id) => id !== userId) },
    })

    res.json({ data: { cancelled: true } })
  } catch (err) { next(err) }
})

// ─── POST /api/groups/:id/join ────────────────────────────────────────────────

router.post('/:id/join', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { password } = (req.body ?? {}) as { password?: string }
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)

    const isOwner = group.createdById === userId

    if (group.isPaid && !isOwner) {
      const sub = await prisma.groupSubscription.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } })
      if (!sub || (sub.currentPeriodEnd && sub.currentPeriodEnd < new Date())) {
        throw new AppError('This is a paid group — subscribe to join', 402)
      }
    }

    if (group.isPrivate && !group.isPaid && !isOwner) {
      if (!password || password !== group.password) {
        throw new AppError('Incorrect code', 403)
      }
    }

    const existing = await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } })
    if (!existing) {
      await prisma.groupMembership.create({ data: { groupId: group.id, userId } })
      await prisma.groupChat.update({ where: { id: group.id }, data: { memberCount: { increment: 1 } } })
    }

    // Remove from join requests if they were waiting
    if (group.joinRequests.includes(userId)) {
      await prisma.groupChat.update({
        where: { id: group.id },
        data: { joinRequests: group.joinRequests.filter((id) => id !== userId) },
      })
    }

    res.json({ data: { joined: true } })
  } catch (err) { next(err) }
})

// ─── POST /api/groups/:id/subscribe ──────────────────────────────────────────

router.post('/:id/subscribe', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)
    if (!group.isPaid) throw new AppError('This group is free', 400)

    const existing = await prisma.groupSubscription.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } })
    if (existing && existing.currentPeriodEnd && existing.currentPeriodEnd > new Date()) throw new AppError('Already subscribed', 400)

    if (group.createdById === userId) {
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      await prisma.groupSubscription.upsert({
        where: { groupId_userId: { groupId: group.id, userId } },
        create: { groupId: group.id, userId, currentPeriodEnd: periodEnd },
        update: { currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
      })
      const m = await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } })
      if (!m) {
        await prisma.groupMembership.create({ data: { groupId: group.id, userId } })
        await prisma.groupChat.update({ where: { id: group.id }, data: { memberCount: { increment: 1 } } })
      }
      res.json({ data: { subscribed: true, expiresAt: periodEnd.toISOString() } })
      return
    }

    let stripeCustomerId = (await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } }))?.stripeCustomerId
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({ email: req.user!.dbUser.email })
      stripeCustomerId = customer.id
      await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId } })
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: 'gbp', product_data: { name: `${group.name} — Monthly Subscription` }, unit_amount: Math.round((group.priceMonthly ?? 0) * 100), recurring: { interval: 'month' } }, quantity: 1 }],
      mode: 'subscription',
      metadata: { type: 'group_subscription', groupId: group.id, userId },
      success_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/subscriptions?success=true`,
      cancel_url: `${process.env['FRONTEND_URL'] ?? 'http://localhost:3000'}/subscriptions`,
    })

    res.json({ data: { url: session.url } })
  } catch (err) { next(err) }
})

// ─── DELETE /api/groups/:id/leave ────────────────────────────────────────────

router.delete('/:id/leave', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)

    const existing = await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } })
    if (existing) {
      await prisma.groupMembership.delete({ where: { groupId_userId: { groupId: group.id, userId } } })
      await prisma.groupChat.update({ where: { id: group.id }, data: { memberCount: { decrement: 1 } } })
    }

    res.json({ data: { left: true } })
  } catch (err) { next(err) }
})

// ─── PUT /api/groups/:id/notifications ───────────────────────────────────────

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
  } catch (err) { next(err) }
})

// ─── POST /api/groups/:id/messages ───────────────────────────────────────────

router.post('/:id/messages', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { text } = req.body as { text: string }
    if (!text?.trim()) throw new AppError('Message text required', 400)

    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)

    const membership = await prisma.groupMembership.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } })
    if (!membership && group.isPrivate) throw new AppError('Join this private group first', 403)
    if (!membership) {
      await prisma.groupMembership.create({ data: { groupId: group.id, userId } })
      await prisma.groupChat.update({ where: { id: group.id }, data: { memberCount: { increment: 1 } } })
    }

    const saved = await prisma.groupMessage.create({
      data: { groupId: group.id, senderId: userId, text: text.trim().slice(0, 500) },
      include: { sender: { select: { id: true, displayName: true, photoUrl: true, username: true } } },
    })

    await prisma.groupChat.update({ where: { id: group.id }, data: { lastMessage: text.trim().slice(0, 100), lastAt: saved.createdAt } })

    res.status(201).json({
      data: {
        id: saved.id, senderId: saved.senderId,
        senderName: saved.sender.displayName, senderPhoto: saved.sender.photoUrl,
        senderUsername: saved.sender.username, text: saved.text,
        createdAt: saved.createdAt.toISOString(), isFollowing: false,
      },
    })
  } catch (err) { next(err) }
})

export default router
