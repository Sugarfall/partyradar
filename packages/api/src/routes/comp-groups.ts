import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { randomUUID } from 'crypto'

const router = Router()

const userSelect = { id: true, username: true, displayName: true, photoUrl: true }

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const myMemberships = await prisma.competitionMember.findMany({ where: { userId }, include: { group: { include: { _count: { select: { members: true } } } } } })
    const myGroupIds = myMemberships.map(m => m.groupId)
    const discover = await prisma.competitionGroup.findMany({ where: { isPrivate: false, id: { notIn: myGroupIds } }, take: 20, include: { _count: { select: { members: true } } }, orderBy: { createdAt: 'desc' } })
    res.json({ mine: myMemberships.map(m => m.group), discover })
  } catch (err) { next(err) }
})

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const { name, description, emoji, isPrivate, maxMembers } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' })
    const group = await prisma.competitionGroup.create({
      data: { name: name.trim(), description: description?.trim(), emoji: emoji ?? '🏆', isPrivate: !!isPrivate, maxMembers: maxMembers ?? 20, inviteCode: randomUUID(), createdById: userId, members: { create: { userId, role: 'OWNER' } } },
      include: { members: { include: { user: { select: userSelect } } }, _count: { select: { members: true } } },
    })
    res.json({ data: group })
  } catch (err) { next(err) }
})

router.get('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const group = await prisma.competitionGroup.findUnique({ where: { id: req.params['id'] }, include: { members: { include: { user: { select: userSelect } } }, _count: { select: { members: true } } } })
    if (!group) return res.status(404).json({ error: 'Not found' })
    const isMember = group.members.some(m => m.userId === userId)
    if (group.isPrivate && !isMember) return res.status(403).json({ error: 'Private group' })
    const leaderboard = await Promise.all(group.members.map(async m => ({
      ...m,
      medalCount: await prisma.userMedal.count({ where: { userId: m.userId } }),
      goldCount: await prisma.userMedal.count({ where: { userId: m.userId, medal: { tier: 'GOLD' } } }),
      silverCount: await prisma.userMedal.count({ where: { userId: m.userId, medal: { tier: 'SILVER' } } }),
      bronzeCount: await prisma.userMedal.count({ where: { userId: m.userId, medal: { tier: 'BRONZE' } } }),
    })))
    leaderboard.sort((a, b) => b.medalCount - a.medalCount || b.goldCount - a.goldCount)
    res.json({ data: { ...group, leaderboard, isMember } })
  } catch (err) { next(err) }
})

router.post('/join/:code', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const group = await prisma.competitionGroup.findUnique({ where: { inviteCode: req.params['code'] }, include: { _count: { select: { members: true } } } })
    if (!group) return res.status(404).json({ error: 'Invalid invite code' })
    if (group._count.members >= group.maxMembers) return res.status(400).json({ error: 'Group is full' })
    const existing = await prisma.competitionMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } })
    if (existing) return res.status(400).json({ error: 'Already a member' })
    await prisma.competitionMember.create({ data: { groupId: group.id, userId, role: 'MEMBER' } })
    res.json({ data: group })
  } catch (err) { next(err) }
})

router.post('/:id/join', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const group = await prisma.competitionGroup.findUnique({ where: { id: req.params['id'] }, include: { _count: { select: { members: true } } } })
    if (!group) return res.status(404).json({ error: 'Not found' })
    if (group.isPrivate) return res.status(403).json({ error: 'Use invite code for private groups' })
    if (group._count.members >= group.maxMembers) return res.status(400).json({ error: 'Group is full' })
    const existing = await prisma.competitionMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } })
    if (existing) return res.status(400).json({ error: 'Already a member' })
    await prisma.competitionMember.create({ data: { groupId: group.id, userId, role: 'MEMBER' } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.delete('/:id/leave', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const member = await prisma.competitionMember.findUnique({ where: { groupId_userId: { groupId: req.params['id']!, userId } } })
    if (!member) return res.status(404).json({ error: 'Not a member' })
    if (member.role === 'OWNER') {
      const other = await prisma.competitionMember.findFirst({ where: { groupId: req.params['id'], userId: { not: userId } } })
      if (other) { await prisma.competitionMember.update({ where: { id: other.id }, data: { role: 'OWNER' } }) }
      else { await prisma.competitionGroup.delete({ where: { id: req.params['id'] } }); return res.json({ ok: true, deleted: true }) }
    }
    await prisma.competitionMember.delete({ where: { groupId_userId: { groupId: req.params['id']!, userId } } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const member = await prisma.competitionMember.findUnique({ where: { groupId_userId: { groupId: req.params['id']!, userId } } })
    if (!member || member.role !== 'OWNER') return res.status(403).json({ error: 'Owner only' })
    await prisma.competitionGroup.delete({ where: { id: req.params['id'] } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
