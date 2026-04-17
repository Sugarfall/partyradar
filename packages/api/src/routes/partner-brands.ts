import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'

const router = Router()

/** GET /api/brands — list active brands */
router.get('/', async (_req, res, next) => {
  try {
    const brands = await prisma.partnerBrand.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, name: true, description: true, logoUrl: true, accentColor: true },
    })
    res.json({ data: brands })
  } catch (err) { next(err) }
})

/** GET /api/brands/:slug — brand + current user's entitlement */
router.get('/:slug', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const brand = await prisma.partnerBrand.findUnique({ where: { slug: req.params['slug'] } })
    if (!brand || !brand.isActive) throw new AppError('Brand not found', 404)

    const userId = req.user?.dbUser.id ?? null
    const entitlement = userId ? await prisma.brandEntitlement.findUnique({
      where: { brandId_userId: { brandId: brand.id, userId } },
    }) : null

    const isActive = entitlement
      ? (!entitlement.revokedAt && (!entitlement.expiresAt || entitlement.expiresAt > new Date()))
      : false

    res.json({
      data: {
        ...brand,
        entitlement: isActive ? { tier: entitlement!.tier, grantedAt: entitlement!.grantedAt } : null,
      },
    })
  } catch (err) { next(err) }
})

/** POST /api/brands/:slug/apply — request entitlement (self-service apply) */
router.post('/:slug/apply', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const brand = await prisma.partnerBrand.findUnique({ where: { slug: req.params['slug'] } })
    if (!brand || !brand.isActive) throw new AppError('Brand not found', 404)

    const existing = await prisma.brandEntitlement.findUnique({
      where: { brandId_userId: { brandId: brand.id, userId } },
    })
    if (existing && !existing.revokedAt) throw new AppError('Already applied or entitled', 400)

    // Auto-grant STANDARD tier on apply (admin can upgrade)
    await prisma.brandEntitlement.upsert({
      where: { brandId_userId: { brandId: brand.id, userId } },
      update: { revokedAt: null, tier: 'STANDARD', grantedAt: new Date() },
      create: { brandId: brand.id, userId, tier: 'STANDARD' },
    })

    res.status(201).json({ data: { status: 'granted', tier: 'STANDARD' } })
  } catch (err) { next(err) }
})

export default router
