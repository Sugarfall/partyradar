import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { z } from 'zod'

const router = Router()

const createSquadSchema = z.object({
  name: z.string().min(1).max(60),
  emoji: z.string().min(1).max(8).default('🎉'),
})

/** GET /api/squads — list squads the caller is in */
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const memberships = await prisma.squadMember.findMany({
      where: { userId },
      include: {
        squad: {
          include: {
            members: {
              include: { user: { select: { id: true, displayName: true, photoUrl: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const data = memberships.map(({ squad }) => ({
      id: squad.id,
      name: squad.name,
      emoji: squad.emoji,
      createdAt: squad.createdAt.toISOString(),
      isOwner: squad.createdBy === userId,
      members: squad.members.map((m) => ({
        id: m.user.id,
        displayName: m.user.displayName,
        photoUrl: m.user.photoUrl ?? null,
        role: m.role,
      })),
    }))

    res.json({ data })
  } catch (err) { next(err) }
})

/** POST /api/squads — create a squad */
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { name, emoji } = createSquadSchema.parse(req.body)

    const squad = await prisma.squad.create({
      data: {
        name,
        emoji,
        createdBy: userId,
        members: { create: { userId, role: 'ADMIN' } },
      },
      include: {
        members: {
          include: { user: { select: { id: true, displayName: true, photoUrl: true } } },
        },
      },
    })

    res.status(201).json({
      data: {
        id: squad.id,
        name: squad.name,
        emoji: squad.emoji,
        createdAt: squad.createdAt.toISOString(),
        isOwner: true,
        members: squad.members.map((m) => ({
          id: m.user.id,
          displayName: m.user.displayName,
          photoUrl: m.user.photoUrl ?? null,
          role: m.role,
        })),
      },
    })
  } catch (err) { next(err) }
})

/** DELETE /api/squads/:id — delete a squad (owner only) */
router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { id } = req.params as { id: string }

    const squad = await prisma.squad.findUnique({ where: { id } })
    if (!squad) throw new AppError('Squad not found', 404)
    if (squad.createdBy !== userId) throw new AppError('Forbidden', 403)

    await prisma.squad.delete({ where: { id } })
    res.json({ data: { ok: true } })
  } catch (err) { next(err) }
})

/** POST /api/squads/:id/members — add a member by userId */
router.post('/:id/members', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const callerId = req.user!.dbUser.id
    const { id } = req.params as { id: string }
    const { userId } = z.object({ userId: z.string() }).parse(req.body)

    const squad = await prisma.squad.findUnique({ where: { id } })
    if (!squad) throw new AppError('Squad not found', 404)
    if (squad.createdBy !== callerId) throw new AppError('Only the squad owner can add members', 403)

    const member = await prisma.squadMember.upsert({
      where: { squadId_userId: { squadId: id, userId } },
      update: {},
      create: { squadId: id, userId, role: 'MEMBER' },
      include: { user: { select: { id: true, displayName: true, photoUrl: true } } },
    })

    res.json({
      data: {
        id: member.user.id,
        displayName: member.user.displayName,
        photoUrl: member.user.photoUrl ?? null,
        role: member.role,
      },
    })
  } catch (err) { next(err) }
})

/** DELETE /api/squads/:id/members/:userId — remove a member */
router.delete('/:id/members/:userId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const callerId = req.user!.dbUser.id
    const { id, userId } = req.params as { id: string; userId: string }

    const squad = await prisma.squad.findUnique({ where: { id } })
    if (!squad) throw new AppError('Squad not found', 404)

    // Owner can remove anyone; a member can remove themselves
    if (squad.createdBy !== callerId && callerId !== userId) {
      throw new AppError('Forbidden', 403)
    }

    await prisma.squadMember.deleteMany({ where: { squadId: id, userId } })
    res.json({ data: { ok: true } })
  } catch (err) { next(err) }
})

export default router
