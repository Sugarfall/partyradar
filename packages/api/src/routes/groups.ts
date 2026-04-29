import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { optionalAuth, requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { GROUP_PRICE_TIERS } from '@partyradar/shared'
import { ensureStripe } from '../lib/stripe'
import { moderateContent, recordViolation } from '../lib/moderation'
import { hashPassword, verifyPassword, isHashed } from '../lib/passwordHash'
import { assertOwnImageUrl } from '../lib/cloudinary'
import { sendNotification } from '../lib/fcm'
import { createHmac, timingSafeEqual } from 'crypto'

// ─── Group invite HMAC helpers ───────────────────────────────────────────────
// C5 fix: invites are now server-signed. The signature binds groupId +
// recipientId so a token cannot be reused for a different group or user.

function inviteSecret(): string {
  // Prefer a dedicated GROUP_INVITE_SECRET; fall back to INTERNAL_API_KEY (which
  // itself falls back to an ephemeral UUID in dev — acceptable there). In production,
  // operators should set one of these to a stable value so invite tokens survive restarts.
  const s = process.env['GROUP_INVITE_SECRET'] ?? process.env['INTERNAL_API_KEY']
  if (!s) {
    // Should never reach production — INTERNAL_API_KEY is generated at startup.
    // Log loudly so operators catch this misconfiguration immediately.
    if (process.env['NODE_ENV'] === 'production') {
      console.error('[groups] SECURITY: GROUP_INVITE_SECRET and INTERNAL_API_KEY are both unset — invite tokens are using a public fallback secret and can be forged. Set GROUP_INVITE_SECRET immediately.')
    }
    return 'dev-group-invite-secret-change-in-prod'
  }
  return s
}

function signGroupInvite(groupId: string, recipientId: string): string {
  const payload = `${groupId}:${recipientId}`
  return createHmac('sha256', inviteSecret()).update(payload).digest('hex')
}

export function verifyGroupInviteToken(token: string, groupId: string, recipientId: string): boolean {
  const expected = Buffer.from(signGroupInvite(groupId, recipientId), 'hex')
  let received: Buffer
  try {
    received = Buffer.from(token, 'hex')
  } catch {
    return false
  }
  if (expected.length !== received.length) return false
  return timingSafeEqual(expected, received)
}

/** Marker prefix used to encode a structured group invite inside a DM.
 *  Format: [INVITE_GROUP:{groupId}:{base64(JSON({name,emoji,coverColor,inviterName,token}))}]
 *  The UI detects this and renders inline Accept/Decline buttons.
 *  The `token` field is an HMAC that the join endpoint verifies to skip the
 *  password prompt for private groups — preventing both:
 *   a) fake invites crafted by arbitrary chat users
 *   b) invited users bypassing the password on their own
 */
function encodeInviteDmText(payload: { groupId: string; recipientId: string; name: string; emoji: string | null; coverColor: string | null; inviterName: string }) {
  const token = signGroupInvite(payload.groupId, payload.recipientId)
  const body = Buffer.from(JSON.stringify({
    name: payload.name,
    emoji: payload.emoji,
    coverColor: payload.coverColor,
    inviter: payload.inviterName,
    token,
  })).toString('base64')
  return `[INVITE_GROUP:${payload.groupId}:${body}]`
}

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
    const { name, description, emoji, coverColor, isPrivate, password, isPaid, priceTierId, priceMonthly: customPrice, type: groupType } = req.body as {
      name: string; description?: string; emoji?: string; coverColor?: string
      isPrivate?: boolean; password?: string; isPaid?: boolean; priceTierId?: string; priceMonthly?: number
      type?: 'GENRE' | 'FESTIVAL' | 'TRIP'
    }
    if (!name?.trim() || name.trim().length < 2) throw new AppError('Group name must be at least 2 characters', 400)
    if (name.trim().length > 40) throw new AppError('Group name too long (max 40)', 400)
    if (isPrivate && !isPaid && (!password?.trim() || password.trim().length < 4)) {
      throw new AppError('Private groups require a password (min 4 characters)', 400)
    }

    // Resolve monthly price — accept custom amount or fall back to legacy tier lookup
    let priceMonthly: number | null = null
    if (isPaid) {
      if (customPrice != null) {
        const p = Number(customPrice)
        if (isNaN(p) || p < 0.5 || p > 999) throw new AppError('Price must be between £0.50 and £999', 400)
        priceMonthly = Math.round(p * 100) / 100
      } else if (priceTierId) {
        const tier = GROUP_PRICE_TIERS.find((t) => t.id === priceTierId)
        if (!tier) throw new AppError('Invalid price tier', 400)
        priceMonthly = tier.price
      } else {
        throw new AppError('Paid groups require a price', 400)
      }
    }

    const slug = `user-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`

    // Hash the group password before storing (never persist plaintext)
    const passwordHash = (isPrivate && !isPaid && password?.trim())
      ? await hashPassword(password.trim())
      : null

    const group = await prisma.groupChat.create({
      data: {
        slug,
        name: name.trim(),
        description: description?.trim()?.slice(0, 200) ?? null,
        type: (['GENRE', 'FESTIVAL', 'TRIP'] as const).includes(groupType as 'GENRE' | 'FESTIVAL' | 'TRIP') ? (groupType as 'GENRE' | 'FESTIVAL' | 'TRIP') : 'GENRE',
        emoji: emoji?.trim() || '💬',
        coverColor: coverColor || '#6366f1',
        isPrivate: !!(isPrivate || isPaid),
        password: passwordHash,
        isPaid: !!isPaid,
        priceMonthly,
        createdById: userId,
      },
    })

    // Auto-join creator as OWNER
    await prisma.groupMembership.create({ data: { groupId: group.id, userId, role: 'OWNER' } })
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

    const isOwnerOfGroup = group.createdById === userId

    // System-seeded public groups (genre-*, venue-*) are readable by anyone —
    // they're app-wide discussion channels.
    const isSystemGroup = group.slug.startsWith('genre-') || group.slug.startsWith('venue-')

    // Subscription status for paid groups (used for both the lock check and UI)
    const groupSub = userId && group.isPaid && !isOwnerOfGroup
      ? await prisma.groupSubscription.findUnique({
          where: { groupId_userId: { groupId: group.id, userId } },
        })
      : null
    const isSubscribed = isOwnerOfGroup || (!!groupSub && (!groupSub.currentPeriodEnd || groupSub.currentPeriodEnd > new Date()))

    // Lock rules:
    //  - System groups: open to all
    //  - Paid groups: require active subscription (owner exempt)
    //  - Private groups: require membership (owner exempt)
    //  - User-created public groups: require auth (no anon scraping)
    const lockReason =
      isSystemGroup || isOwnerOfGroup
        ? null
        : group.isPaid && !isSubscribed
          ? 'subscription'
          : group.isPrivate && !membership
            ? 'membership'
            : !userId
              ? 'auth'
              : null

    if (lockReason) {
      res.json({
        data: {
          group: {
            id: group.id, slug: group.slug, name: group.name, emoji: group.emoji,
            coverColor: group.coverColor, memberCount: group.memberCount,
            isPrivate: group.isPrivate, isPaid: group.isPaid, priceMonthly: group.priceMonthly,
            isJoined: !!membership, isSubscribed, notificationsEnabled: false,
          },
          messages: [],
          locked: true,
          lockReason,
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
          description: group.description,
          emoji: group.emoji,
          coverColor: group.coverColor,
          memberCount: group.memberCount,
          isPrivate: group.isPrivate,
          isPaid: group.isPaid,
          priceMonthly: group.priceMonthly,
          isOwner: isOwnerOfGroup,
          isSubscribed,
          myRole: isOwnerOfGroup
            ? 'OWNER'
            : (membership?.role ?? (membership ? 'MEMBER' : null)),
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
          imageUrl: m.imageUrl ?? null,
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
    const { password, inviteToken } = (req.body ?? {}) as { password?: string; inviteToken?: string }
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
    // C5 fix: a valid HMAC invite token (from the owner's DM invite) also
    // grants access, bypassing the password prompt for the specific recipient.
    if (group.isPrivate && !group.isPaid && !isOwner) {
      const hasValidInvite = !!inviteToken && verifyGroupInviteToken(inviteToken, group.id, userId)
      const ok = hasValidInvite || (!!password && await verifyPassword(password, group.password))
      if (!ok) throw new AppError('Incorrect password', 403)
      // Upgrade legacy plaintext passwords to a hash on successful login
      if (group.password && !isHashed(group.password)) {
        try {
          await prisma.groupChat.update({ where: { id: group.id }, data: { password: await hashPassword(password!) } })
        } catch { /* non-fatal */ }
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

/** POST /api/groups/:id/invite
 *  Owner-only: sends a structured group invite DM to another user with a
 *  push notification. The recipient's chat renders inline Accept/Decline
 *  buttons instead of a plain URL.
 */
router.post('/:id/invite', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { recipientId } = (req.body ?? {}) as { recipientId?: string }
    if (!recipientId) throw new AppError('recipientId required', 400)
    if (recipientId === userId) throw new AppError('Cannot invite yourself', 400)

    const group = await prisma.groupChat.findUnique({
      where: { id: req.params['id'] },
      select: { id: true, name: true, emoji: true, coverColor: true, createdById: true },
    })
    if (!group) throw new AppError('Group not found', 404)
    if (group.createdById !== userId) throw new AppError('Only the group owner can send invites', 403)

    const inviter = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, username: true },
    })
    const inviterName = inviter?.displayName || inviter?.username || 'Someone'

    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true },
    })
    if (!recipient) throw new AppError('Recipient not found', 404)

    // Get or create the DM conversation (same rules as POST /api/dm).
    const existing = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: recipientId } } },
        ],
      },
      select: { id: true },
    })
    let convoId = existing?.id
    if (!convoId) {
      const followExists = await prisma.follow.findFirst({
        where: {
          OR: [
            { followerId: userId, followingId: recipientId },
            { followerId: recipientId, followingId: userId },
          ],
        },
      })
      const isRequest = !followExists
      const convo = await prisma.conversation.create({
        data: {
          isRequest,
          participants: { create: [{ userId }, { userId: recipientId }] },
        },
      })
      convoId = convo.id
    }

    const dmText = encodeInviteDmText({
      groupId: group.id,
      recipientId,
      name: group.name,
      emoji: group.emoji,
      coverColor: group.coverColor,
      inviterName,
    })

    await prisma.$transaction([
      prisma.directMessage.create({
        data: { conversationId: convoId, senderId: userId, text: dmText },
      }),
      prisma.conversation.update({
        where: { id: convoId },
        data: { lastMessage: `🎟️ Invite: ${group.name}`, lastAt: new Date() },
      }),
    ])

    // Push notification + in-app notification center entry
    await sendNotification({
      userId: recipientId,
      type: 'GROUP_INVITE_RECEIVED',
      title: `${inviterName} invited you to a group`,
      body: `${group.emoji ?? '🎉'} ${group.name}`,
      data: { groupId: group.id, conversationId: convoId },
    }).catch((err) => console.error('[group-invite-notify]', err))

    res.json({ data: { ok: true, conversationId: convoId } })
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
    const stripe = ensureStripe()
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
      success_url: `${process.env['FRONTEND_URL'] ?? 'https://partyradar-web.vercel.app'}/subscriptions?success=true`,
      cancel_url: `${process.env['FRONTEND_URL'] ?? 'https://partyradar-web.vercel.app'}/subscriptions`,
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

// ── Moderation: assign/remove mod role ───────────────────────────────────────
router.put('/:id/members/:userId/role', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const groupId = req.params['id'] as string
    const targetUserId = req.params['userId'] as string
    const { role } = req.body as { role: 'MOD' | 'MEMBER' }
    if (!['MOD', 'MEMBER'].includes(role)) {
      return res.status(400).json({ error: { message: 'Role must be MOD or MEMBER' } })
    }
    // Only group owner can change roles
    const group = await prisma.groupChat.findUnique({ where: { id: groupId }, select: { createdById: true } })
    if (!group) return res.status(404).json({ error: { message: 'Group not found' } })
    if (group.createdById !== req.user!.dbUser.id) {
      return res.status(403).json({ error: { message: 'Only the group owner can assign roles' } })
    }
    // Can't change owner's own role
    if (targetUserId === group.createdById) {
      return res.status(400).json({ error: { message: 'Cannot change owner role' } })
    }
    await prisma.groupMembership.update({
      where: { groupId_userId: { groupId, userId: targetUserId } },
      data: { role },
    })
    res.json({ data: { userId: targetUserId, role } })
  } catch (err) { next(err) }
})

// ── Moderation: kick member ──────────────────────────────────────────────────
router.delete('/:id/members/:userId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const groupId = req.params['id'] as string
    const targetUserId = req.params['userId'] as string
    const callerId = req.user!.dbUser.id
    const group = await prisma.groupChat.findUnique({ where: { id: groupId }, select: { createdById: true } })
    if (!group) return res.status(404).json({ error: { message: 'Group not found' } })
    // Owner can kick anyone; MODs can kick MEMBERs only
    const callerMembership = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId: callerId } },
      select: { role: true },
    })
    const targetMembership = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
      select: { role: true },
    })
    const isOwner = group.createdById === callerId
    const isMod = callerMembership?.role === 'MOD'
    const targetIsMod = targetMembership?.role === 'MOD'
    const targetIsOwner = targetUserId === group.createdById
    if (!isOwner && !isMod) return res.status(403).json({ error: { message: 'Insufficient permissions' } })
    if (!isOwner && (targetIsMod || targetIsOwner)) return res.status(403).json({ error: { message: 'MODs cannot kick other MODs or the owner' } })
    if (targetIsOwner) return res.status(400).json({ error: { message: 'Cannot kick the group owner' } })
    await prisma.groupMembership.delete({ where: { groupId_userId: { groupId, userId: targetUserId } } })
    await prisma.groupChat.update({ where: { id: groupId }, data: { memberCount: { decrement: 1 } } })
    res.json({ data: { kicked: true } })
  } catch (err) { next(err) }
})

// ── Members list (for moderation panel) ──────────────────────────────────────
router.get('/:id/members', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const groupId = req.params['id'] as string
    const group = await prisma.groupChat.findUnique({ where: { id: groupId }, select: { createdById: true } })
    if (!group) return res.status(404).json({ error: { message: 'Group not found' } })
    const memberships = await prisma.groupMembership.findMany({
      where: { groupId },
      include: { user: { select: { id: true, displayName: true, username: true, photoUrl: true } } },
      orderBy: { joinedAt: 'asc' },
    })
    const enriched = memberships.map(m => ({
      ...m,
      role: m.userId === group.createdById ? 'OWNER' : (m.role ?? 'MEMBER'),
    }))
    res.json({ data: enriched })
  } catch (err) { next(err) }
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
    const { text, imageUrl } = req.body as { text?: string; imageUrl?: string }
    if (!text?.trim() && !imageUrl) throw new AppError('Message required', 400)

    // Only accept image URLs that our own Cloudinary upload produced.
    try {
      if (imageUrl) assertOwnImageUrl(imageUrl)
    } catch (e) {
      throw new AppError((e as Error).message, 400)
    }

    const group = await prisma.groupChat.findUnique({ where: { id: req.params['id'] } })
    if (!group) throw new AppError('Group not found', 404)

    // ── Content moderation ──────────────────────────────────────────────────
    const modResult = await moderateContent({ text: text ?? null, imageUrl: imageUrl ?? null })
    if (!modResult.passed) {
      await recordViolation({
        userId,
        contentType: 'group_message',
        contentRef: group.id,
        content: text ?? undefined,
        contentUrl: imageUrl ?? undefined,
        flagType: modResult.flagType ?? 'ILLEGAL',
        confidence: modResult.confidence ?? 1,
        reason: modResult.reason,
        action: 'BLOCKED',
      })
      throw new AppError('Your message was blocked by our content filter.', 422)
    }

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
      data: { groupId: group.id, senderId: userId, text: text ? text.trim().slice(0, 500) : null, imageUrl: imageUrl ?? null },
      include: { sender: { select: { id: true, displayName: true, photoUrl: true, username: true } } },
    })

    const lastMessagePreview = text?.trim() ? text.trim().slice(0, 100) : '📷 Photo'
    await prisma.groupChat.update({
      where: { id: group.id },
      data: { lastMessage: lastMessagePreview, lastAt: saved.createdAt },
    })

    res.status(201).json({
      data: {
        id: saved.id,
        senderId: saved.senderId,
        senderName: saved.sender.displayName,
        senderPhoto: saved.sender.photoUrl,
        senderUsername: saved.sender.username,
        text: saved.text,
        imageUrl: saved.imageUrl ?? null,
        createdAt: saved.createdAt.toISOString(),
        isFollowing: false,
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─── Pub Crawl Routes ──────────────────────────────────────────────────────────

/** GET /api/groups/:groupId/pub-crawl — get active pub crawl for group */
router.get('/:groupId/pub-crawl', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { groupId } = req.params as { groupId: string }
    const userId = req.user?.dbUser.id ?? null

    // Gate paid groups: user must be an active member
    const group = await prisma.groupChat.findUnique({ where: { id: groupId }, select: { isPaid: true } })
    if (!group) throw new AppError('Group not found', 404)
    if (group.isPaid) {
      if (!userId) throw new AppError('Authentication required', 401)
      const membership = await prisma.groupMembership.findUnique({
        where: { groupId_userId: { groupId, userId } },
      })
      if (!membership) throw new AppError('Members only', 403)
    }

    const crawl = await prisma.pubCrawl.findFirst({
      where: { groupId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, displayName: true, username: true, photoUrl: true } },
        stops: {
          orderBy: { order: 'asc' },
          include: {
            checkIns: {
              include: { user: { select: { id: true, displayName: true, photoUrl: true, username: true } } },
            },
          },
        },
      },
    })

    if (!crawl) return res.json({ data: null })

    // Build leaderboard
    const scoreMap = new Map<string, { user: { id: string; displayName: string; photoUrl: string | null; username: string | null }; score: number; firstCheckInAt: Date }>()
    for (const stop of crawl.stops) {
      for (const ci of stop.checkIns) {
        const existing = scoreMap.get(ci.userId)
        if (existing) {
          existing.score++
          if (ci.createdAt < existing.firstCheckInAt) existing.firstCheckInAt = ci.createdAt
        } else {
          scoreMap.set(ci.userId, { user: ci.user, score: 1, firstCheckInAt: ci.createdAt })
        }
      }
    }
    // Sort by score desc; ties broken by who checked in first (ascending)
    const leaderboard = [...scoreMap.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.firstCheckInAt.getTime() - b.firstCheckInAt.getTime()
    })

    const stopsFormatted = crawl.stops.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      order: s.order,
      checkInCount: s.checkIns.length,
      checkedIn: userId ? s.checkIns.some((c) => c.userId === userId) : false,
      checkers: s.checkIns.map((c) => ({ id: c.user.id, displayName: c.user.displayName, photoUrl: c.user.photoUrl })),
    }))

    // All-time leaderboard across all crawls for this group
    const allTimeCheckins = await prisma.pubCrawlCheckIn.groupBy({
      by: ['userId'] as const,
      where: { stop: { crawl: { groupId } } },
      _sum: { score: true },
      _count: { id: true },
      orderBy: { _sum: { score: 'desc' as const } },
      take: 10,
    }) as unknown as Array<{ userId: string; _sum: { score: number | null }; _count: { id: number } }>
    const leaderboardUsers = await prisma.user.findMany({
      where: { id: { in: allTimeCheckins.map(c => c.userId) } },
      select: { id: true, displayName: true, username: true, photoUrl: true },
    })
    const allTimeBest = allTimeCheckins.map(c => ({
      ...leaderboardUsers.find(u => u.id === c.userId),
      totalScore: c._sum?.score ?? 0,
      totalCheckIns: c._count?.id ?? 0,
    })).sort((a, b) => b.totalScore - a.totalScore)

    res.json({ data: { ...crawl, stops: stopsFormatted, leaderboard, allTimeBest } })
  } catch (err) {
    next(err)
  }
})

// POST /api/groups/:groupId/pub-crawl/plan — AI plans optimal route from nearby venues
router.post('/:groupId/pub-crawl/plan', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { groupId } = req.params
    const { lat, lng, radiusKm = 2, count = 5 } = req.body as { lat: number; lng: number; radiusKm?: number; count?: number }

    if (!lat || !lng) return res.status(400).json({ error: { message: 'lat and lng required' } })

    // Haversine distance
    function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
      const R = 6371
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLng = (lng2 - lng1) * Math.PI / 180
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    }

    // Fetch nearby venues (pubs/bars/nightclubs)
    const venues = await prisma.venue.findMany({
      where: {
        lat: { gte: lat - 0.05, lte: lat + 0.05 },
        lng: { gte: lng - 0.05, lte: lng + 0.05 },
        type: { in: ['PUB', 'BAR', 'NIGHTCLUB', 'LOUNGE'] as ('PUB' | 'BAR' | 'NIGHTCLUB' | 'LOUNGE')[] },
      },
      select: { id: true, name: true, address: true, lat: true, lng: true, type: true, rating: true },
    })

    if (venues.length === 0) {
      return res.json({ data: { stops: [], message: 'No venues found nearby. Add venues to the area first.' } })
    }

    // Sort by distance, then greedily build route (nearest-neighbour)
    const withDist = venues.map(v => ({
      ...v,
      distKm: haversine(lat, lng, v.lat, v.lng),
    })).filter(v => v.distKm <= radiusKm).sort((a, b) => a.distKm - b.distKm)

    // Nearest-neighbour TSP approximation
    const stops: typeof withDist = []
    const remaining = [...withDist]
    let current = { lat, lng }
    const take = Math.min(count, remaining.length)

    for (let i = 0; i < take; i++) {
      remaining.sort((a, b) =>
        haversine(current.lat, current.lng, a.lat, a.lng) -
        haversine(current.lat, current.lng, b.lat, b.lng)
      )
      const next = remaining.shift()!
      stops.push(next)
      current = { lat: next.lat, lng: next.lng }
    }

    const result = stops.map((v, i) => ({
      order: i + 1,
      name: v.name,
      address: v.address,
      lat: v.lat,
      lng: v.lng,
      type: v.type,
      rating: v.rating,
      distanceKm: Math.round(v.distKm * 10) / 10,
    }))

    res.json({ data: { stops: result, totalStops: result.length, radiusKm } })
  } catch (err) { next(err) }
})

/** POST /api/groups/:groupId/pub-crawl — create a pub crawl */
router.post('/:groupId/pub-crawl', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { groupId } = req.params as { groupId: string }
    const userId = req.user!.dbUser.id
    const { name, stops } = req.body as {
      name: string
      stops: Array<{ name: string; address?: string; lat?: number | null; lng?: number | null }>
    }

    if (!name?.trim()) throw new AppError('Pub crawl name required', 400)
    if (!Array.isArray(stops) || stops.length < 2) throw new AppError('At least 2 stops required', 400)
    if (stops.length > 12) throw new AppError('Max 12 stops', 400)

    // End any existing active crawl
    await prisma.pubCrawl.updateMany({ where: { groupId, status: 'ACTIVE' }, data: { status: 'COMPLETED' } })

    const crawl = await prisma.pubCrawl.create({
      data: {
        groupId,
        createdById: userId,
        name: name.trim(),
        stops: {
          create: stops.map((s, i) => ({
            name: s.name.trim(),
            address: s.address?.trim() ?? null,
            lat: s.lat ?? null,
            lng: s.lng ?? null,
            order: i,
          })),
        },
      },
      include: {
        stops: { orderBy: { order: 'asc' }, include: { checkIns: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    })

    res.status(201).json({ data: crawl })
  } catch (err) {
    next(err)
  }
})

/** POST /api/groups/:groupId/pub-crawl/stops/:stopId/checkin — check in at a stop */
router.post('/:groupId/pub-crawl/stops/:stopId/checkin', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { groupId, stopId } = req.params as { groupId: string; stopId: string }
    const userId = req.user!.dbUser.id

    // Verify membership for paid groups
    const group = await prisma.groupChat.findUnique({ where: { id: groupId }, select: { isPaid: true } })
    if (!group) throw new AppError('Group not found', 404)
    if (group.isPaid) {
      const membership = await prisma.groupMembership.findUnique({
        where: { groupId_userId: { groupId, userId } },
      })
      if (!membership) throw new AppError('Members only', 403)
    }

    const stop = await prisma.pubCrawlStop.findUnique({ where: { id: stopId } })
    if (!stop) throw new AppError('Stop not found', 404)

    const ci = await prisma.pubCrawlCheckIn.upsert({
      where: { stopId_userId: { stopId, userId } },
      update: {},
      create: { stopId, userId },
    })

    res.json({ data: ci })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/groups/:groupId/pub-crawl — end/delete active pub crawl */
router.delete('/:groupId/pub-crawl', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { groupId } = req.params as { groupId: string }
    await prisma.pubCrawl.updateMany({ where: { groupId, status: 'ACTIVE' }, data: { status: 'COMPLETED' } })
    res.json({ data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

// ─── Group Settings & Admin ───────────────────────────────────────────────────

/** PUT /api/groups/:id/settings — edit group name/desc/emoji/color (OWNER or MOD) */
router.put('/:id/settings', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const groupId = req.params['id'] as string
    const { name, description, emoji, coverColor } = req.body as {
      name?: string; description?: string; emoji?: string; coverColor?: string
    }
    const group = await prisma.groupChat.findUnique({ where: { id: groupId } })
    if (!group) throw new AppError('Group not found', 404)

    const membership = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId } },
      select: { role: true },
    })
    const isOwner = group.createdById === userId
    const isMod = membership?.role === 'MOD' || membership?.role === 'OWNER'
    if (!isOwner && !isMod) throw new AppError('Only group admins and moderators can edit settings', 403)

    const updated = await prisma.groupChat.update({
      where: { id: group.id },
      data: {
        ...(name?.trim() ? { name: name.trim().slice(0, 40) } : {}),
        ...(description !== undefined ? { description: description?.trim()?.slice(0, 200) ?? null } : {}),
        ...(emoji?.trim() ? { emoji: emoji.trim() } : {}),
        ...(coverColor ? { coverColor } : {}),
      },
    })
    res.json({
      data: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        emoji: updated.emoji,
        coverColor: updated.coverColor,
      },
    })
  } catch (err) { next(err) }
})

/** DELETE /api/groups/:id — delete group (OWNER only) */
router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const groupId = req.params['id'] as string
    const group = await prisma.groupChat.findUnique({ where: { id: groupId } })
    if (!group) throw new AppError('Group not found', 404)
    if (group.createdById !== userId) throw new AppError('Only the group owner can delete this group', 403)
    await prisma.groupChat.delete({ where: { id: groupId } })
    res.json({ data: { deleted: true } })
  } catch (err) { next(err) }
})

/** DELETE /api/groups/:id/messages/:messageId — delete a message (OWNER or MOD) */
router.delete('/:id/messages/:messageId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { id: groupId, messageId } = req.params as { id: string; messageId: string }

    const group = await prisma.groupChat.findUnique({ where: { id: groupId }, select: { createdById: true } })
    if (!group) throw new AppError('Group not found', 404)

    const membership = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { role: true },
    })

    const isOwner = group.createdById === userId
    const isMod = membership?.role === 'MOD' || membership?.role === 'OWNER'
    if (!isOwner && !isMod) throw new AppError('Only group admins and moderators can delete messages', 403)

    const msg = await prisma.groupMessage.findUnique({ where: { id: messageId } })
    if (!msg || msg.groupId !== groupId) throw new AppError('Message not found', 404)

    await prisma.groupMessage.delete({ where: { id: messageId } })
    res.json({ data: { deleted: true } })
  } catch (err) { next(err) }
})

export default router
