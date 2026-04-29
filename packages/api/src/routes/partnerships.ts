/**
 * /api/partnerships — Venue Partnership + DrinkMenuItem CRUD
 *
 * A VenuePartnership links a Venue to the in-app wallet ordering system.
 * Once a partnership exists, venue staff (claimedById user) or admins can
 * manage the drink/food menu. Guests at the venue can browse the menu and
 * pay from their wallet.
 *
 * Auth rules:
 *   • Read endpoints (GET) — public / no auth required
 *   • Create/update/delete partnership — admin only
 *   • Create/update/delete menu items — admin OR the venue's claimedById user
 */

import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, requireAdmin } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { WALLET_CONFIG, REVENUE_MODEL } from '@partyradar/shared'

const router = Router()

// ─── Admin list ──────────────────────────────────────────────────────────────

/**
 * GET /api/partnerships — admin only, list all partnerships with venue info
 * Sorted by most recently created. Includes menu item counts.
 */
router.get('/', requireAdmin, async (_req, res, next) => {
  try {
    const partnerships = await prisma.venuePartnership.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        venue: {
          select: {
            id: true, name: true, address: true, city: true,
            photoUrl: true, type: true, claimedById: true,
          },
        },
        _count: { select: { drinkMenuItems: true } },
      },
    })
    res.json({ data: partnerships })
  } catch (err) {
    next(err)
  }
})

// ─── Partnership CRUD ─────────────────────────────────────────────────────────

/** GET /api/partnerships/venue/:venueId — public */
router.get('/venue/:venueId', async (req, res, next) => {
  try {
    const { venueId } = req.params
    const partnership = await prisma.venuePartnership.findUnique({
      where: { venueId },
      include: {
        venue: { select: { id: true, name: true, address: true, city: true, photoUrl: true } },
        drinkMenuItems: {
          where: { isAvailable: true },
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        },
      },
    })
    if (!partnership) throw new AppError('Partnership not found', 404)
    res.json({ data: partnership })
  } catch (err) {
    next(err)
  }
})

/** POST /api/partnerships/venue/:venueId — admin only, create partnership */
router.post('/venue/:venueId', requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const { venueId } = req.params
    const { commissionRate, contactEmail, contactPhone, agreementUrl } =
      req.body as {
        commissionRate?: number
        contactEmail?: string
        contactPhone?: string
        agreementUrl?: string
      }

    const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } })
    if (!venue) throw new AppError('Venue not found', 404)

    const existing = await prisma.venuePartnership.findUnique({ where: { venueId } })
    if (existing) throw new AppError('Partnership already exists for this venue', 409)

    const partnership = await prisma.venuePartnership.create({
      data: {
        venueId,
        commissionRate: commissionRate ?? 3,
        contactEmail: contactEmail ?? null,
        contactPhone: contactPhone ?? null,
        agreementUrl: agreementUrl ?? null,
      },
    })
    res.status(201).json({ data: partnership })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/partnerships/venue/:venueId — admin only, update partnership */
router.put('/venue/:venueId', requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const { venueId } = req.params
    const { commissionRate, contactEmail, contactPhone, agreementUrl, isActive } =
      req.body as {
        commissionRate?: number
        contactEmail?: string
        contactPhone?: string
        agreementUrl?: string
        isActive?: boolean
      }

    const partnership = await prisma.venuePartnership.findUnique({ where: { venueId } })
    if (!partnership) throw new AppError('Partnership not found', 404)

    const updated = await prisma.venuePartnership.update({
      where: { venueId },
      data: {
        ...(commissionRate !== undefined && { commissionRate }),
        ...(contactEmail !== undefined && { contactEmail }),
        ...(contactPhone !== undefined && { contactPhone }),
        ...(agreementUrl !== undefined && { agreementUrl }),
        ...(isActive !== undefined && { isActive }),
      },
    })
    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/partnerships/venue/:venueId — admin only */
router.delete('/venue/:venueId', requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const { venueId } = req.params
    const partnership = await prisma.venuePartnership.findUnique({ where: { venueId } })
    if (!partnership) throw new AppError('Partnership not found', 404)
    // DrinkMenuItems cascade-delete via onDelete: Cascade on partnershipId FK
    await prisma.venuePartnership.delete({ where: { venueId } })
    res.json({ data: { deleted: true } })
  } catch (err) {
    next(err)
  }
})

// ─── Menu CRUD ────────────────────────────────────────────────────────────────

/** Middleware: resolve partnership and check caller is admin or venue owner */
async function resolvePartnershipAndCheckAccess(
  req: AuthRequest,
  venueId: string,
  requireWrite: boolean,
): Promise<{ partnershipId: string }> {
  const partnership = await prisma.venuePartnership.findUnique({
    where: { venueId },
    include: { venue: { select: { claimedById: true } } },
  })
  if (!partnership) throw new AppError('Partnership not found', 404)

  if (requireWrite) {
    const userId = req.user?.dbUser?.id
    const isAdmin = req.user?.dbUser?.isAdmin
    const isOwner = partnership.venue.claimedById === userId
    if (!isAdmin && !isOwner) {
      throw new AppError('Forbidden — admin or venue owner required', 403)
    }
  }

  return { partnershipId: partnership.id }
}

/** GET /api/partnerships/venue/:venueId/menu — public, all items incl. unavailable for staff */
router.get('/venue/:venueId/menu', async (req, res, next) => {
  try {
    const { venueId } = req.params
    const partnership = await prisma.venuePartnership.findUnique({ where: { venueId } })
    if (!partnership) throw new AppError('Partnership not found', 404)

    const items = await prisma.drinkMenuItem.findMany({
      where: { partnershipId: partnership.id },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    })
    res.json({ data: items })
  } catch (err) {
    next(err)
  }
})

/** POST /api/partnerships/venue/:venueId/menu — admin or venue owner */
router.post('/venue/:venueId/menu', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { venueId } = req.params
    const { partnershipId } = await resolvePartnershipAndCheckAccess(req, venueId, true)
    const { name, description, price, category, imageUrl, isAvailable } =
      req.body as {
        name: string
        description?: string
        price: number
        category?: string
        imageUrl?: string
        isAvailable?: boolean
      }

    if (!name?.trim()) throw new AppError('Name is required', 400)
    if (typeof price !== 'number' || price < 0) throw new AppError('Valid price is required', 400)

    const item = await prisma.drinkMenuItem.create({
      data: {
        partnershipId,
        name: name.trim(),
        description: description?.trim() ?? null,
        price,
        category: category?.trim() ?? 'drink',
        imageUrl: imageUrl ?? null,
        isAvailable: isAvailable ?? true,
      },
    })
    res.status(201).json({ data: item })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/partnerships/venue/:venueId/menu/:itemId — admin or venue owner */
router.put('/venue/:venueId/menu/:itemId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { venueId, itemId } = req.params
    const { partnershipId } = await resolvePartnershipAndCheckAccess(req, venueId, true)

    const existing = await prisma.drinkMenuItem.findFirst({
      where: { id: itemId, partnershipId },
    })
    if (!existing) throw new AppError('Menu item not found', 404)

    const { name, description, price, category, imageUrl, isAvailable } =
      req.body as {
        name?: string
        description?: string
        price?: number
        category?: string
        imageUrl?: string
        isAvailable?: boolean
      }

    const item = await prisma.drinkMenuItem.update({
      where: { id: itemId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() || null }),
        ...(price !== undefined && { price }),
        ...(category !== undefined && { category: category.trim() }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(isAvailable !== undefined && { isAvailable }),
      },
    })
    res.json({ data: item })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/partnerships/venue/:venueId/menu/:itemId — admin or venue owner */
router.delete('/venue/:venueId/menu/:itemId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { venueId, itemId } = req.params
    const { partnershipId } = await resolvePartnershipAndCheckAccess(req, venueId, true)

    const existing = await prisma.drinkMenuItem.findFirst({
      where: { id: itemId, partnershipId },
    })
    if (!existing) throw new AppError('Menu item not found', 404)

    await prisma.drinkMenuItem.delete({ where: { id: itemId } })
    res.json({ data: { deleted: true } })
  } catch (err) {
    next(err)
  }
})

// ─── In-app ordering ─────────────────────────────────────────────────────────

/** POST /api/partnerships/venue/:venueId/order — pay for menu items from wallet */
router.post('/venue/:venueId/order', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { venueId } = req.params
    const { items } = req.body as { items: { itemId: string; qty: number }[] }

    if (!Array.isArray(items) || items.length === 0) throw new AppError('items array is required', 400)

    const sanitised = items.map((i) => ({
      itemId: String(i.itemId),
      qty: Math.max(1, Math.floor(Number(i.qty))),
    }))

    // Guard against duplicate item IDs (client should merge quantities)
    const uniqueIds = new Set(sanitised.map((i) => i.itemId))
    if (uniqueIds.size !== sanitised.length) throw new AppError('Duplicate items in order — merge quantities client-side', 400)

    const partnership = await prisma.venuePartnership.findUnique({
      where: { venueId },
      include: { venue: { select: { name: true } } },
    })
    if (!partnership) throw new AppError('This venue is not a partner', 404)
    if (!partnership.isActive) throw new AppError('Venue partnership is currently inactive', 400)

    // Prices come from DB — never trust client-supplied amounts
    const dbItems = await prisma.drinkMenuItem.findMany({
      where: {
        id: { in: [...uniqueIds] },
        partnershipId: partnership.id,
        isAvailable: true,
      },
    })
    if (dbItems.length !== sanitised.length) {
      throw new AppError('One or more items are unavailable or not on this menu', 400)
    }

    const orderLines = sanitised.map((line) => {
      const db = dbItems.find((d) => d.id === line.itemId)!
      return { name: db.name, price: db.price, qty: line.qty, lineTotal: db.price * line.qty }
    })
    const total = orderLines.reduce((s, l) => s + l.lineTotal, 0)
    if (total <= 0) throw new AppError('Order total must be greater than zero', 400)

    const commissionRate = partnership.commissionRate ?? REVENUE_MODEL.VENUE_COMMISSION_PERCENT
    const platformCut = Number((total * commissionRate / 100).toFixed(2))
    const pointsEarned = Math.floor(total * WALLET_CONFIG.POINTS_PER_POUND)

    const userId = req.user!.dbUser.id
    // Upsert wallet — mirrors getOrCreateWallet from wallet.ts (inlined to avoid circular import)
    const wallet = await prisma.wallet.upsert({ where: { userId }, create: { userId }, update: {} })

    if (wallet.balance.toNumber() < total) throw new AppError('Insufficient wallet balance', 400)

    const { updated, drinksEarned, newPoints } = await prisma.$transaction(async (tx) => {
      const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } })
      if (!fresh || fresh.balance.toNumber() < total) throw new AppError('Insufficient wallet balance', 400)

      const oldDrinkCount = Math.floor(fresh.rewardPoints / WALLET_CONFIG.POINTS_PER_FREE_DRINK)
      const updatedPoints = fresh.rewardPoints + pointsEarned
      const newDrinkCount = Math.floor(updatedPoints / WALLET_CONFIG.POINTS_PER_FREE_DRINK)
      const drinks = newDrinkCount - oldDrinkCount

      const u = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: total },
          lifetimeSpent: { increment: total },
          rewardPoints: { increment: pointsEarned },
          freeDrinksEarned: { increment: drinks },
        },
      })

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'VENUE_SPEND',
          amount: -total,
          balanceAfter: u.balance,
          description: `Order at ${partnership.venue.name}`,
          venueId,
          metadata: { items: orderLines },
        },
      })

      if (platformCut > 0) {
        await tx.platformRevenue.create({
          data: {
            source: 'venue_commission',
            amount: platformCut,
            referenceId: venueId,
            description: `${commissionRate}% commission on £${total.toFixed(2)} in-app order`,
          },
        })
        await tx.venuePartnership.update({
          where: { venueId },
          data: { totalRevenue: { increment: total }, totalOrders: { increment: 1 } },
        })
      }

      return { updated: u, drinksEarned: drinks, newPoints: updatedPoints }
    })

    res.status(201).json({
      data: {
        success: true,
        total,
        newBalance: updated.balance.toNumber(),
        pointsEarned,
        totalPoints: newPoints,
        freeDrinksEarned: drinksEarned > 0 ? drinksEarned : 0,
        orderLines,
        message: drinksEarned > 0
          ? `🍹 You earned ${drinksEarned} free drink${drinksEarned > 1 ? 's' : ''}!`
          : `+${pointsEarned} points earned`,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
