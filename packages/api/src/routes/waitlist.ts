import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { AppError } from '../middleware/errorHandler'

const router = Router()

// ── GET /api/waitlist/check-username — public, no auth ────────────────────────
router.get('/check-username', async (req, res, next) => {
  try {
    const raw = (req.query['username'] as string | undefined)?.trim().toLowerCase()
    if (!raw) throw new AppError('Username required', 400)

    if (!/^[a-z0-9_]{3,20}$/.test(raw)) {
      return res.json({ data: { available: false, reason: 'invalid' } })
    }

    const existing = await prisma.waitlistEmail.findUnique({
      where: { username: raw },
    })
    return res.json({ data: { available: !existing, username: raw } })
  } catch (err) { next(err) }
})

// ── POST /api/waitlist — public, no auth ──────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { email, username, name, city, source } = req.body as {
      email?: string
      username?: string
      name?: string
      city?: string
      source?: string
    }

    if (!email || typeof email !== 'string') throw new AppError('Email is required', 400)

    const normalisedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalisedEmail)) {
      throw new AppError('Invalid email address', 400)
    }

    const normalisedUsername = username?.trim().toLowerCase() || undefined
    if (normalisedUsername) {
      if (!/^[a-z0-9_]{3,20}$/.test(normalisedUsername)) {
        throw new AppError('Username must be 3–20 characters: letters, numbers, underscores only', 400)
      }
      // Check username not taken
      const taken = await prisma.waitlistEmail.findUnique({ where: { username: normalisedUsername } })
      if (taken) {
        return res.status(409).json({ error: { code: 'USERNAME_TAKEN', message: 'That username is already reserved' } })
      }
    }

    // Check if email already on list
    const existing = await prisma.waitlistEmail.findUnique({ where: { email: normalisedEmail } })
    if (existing) {
      // Update username if they're adding one now
      if (normalisedUsername && !existing.username) {
        const updated = await prisma.waitlistEmail.update({
          where: { email: normalisedEmail },
          data: { username: normalisedUsername },
        })
        return res.json({ data: { id: updated.id, email: updated.email, username: updated.username, alreadyJoined: false, usernameAdded: true } })
      }
      return res.json({ data: { id: existing.id, email: existing.email, username: existing.username, alreadyJoined: true } })
    }

    const entry = await prisma.waitlistEmail.create({
      data: {
        email: normalisedEmail,
        username: normalisedUsername,
        name: name?.trim() || undefined,
        city: city?.trim() || undefined,
        source: source?.trim() || 'web',
      },
    })

    // Return position on waitlist
    const position = await prisma.waitlistEmail.count()

    res.status(201).json({ data: { id: entry.id, email: entry.email, username: entry.username, position } })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const target = err?.meta?.target as string[] | undefined
      if (target?.includes('username')) {
        return res.status(409).json({ error: { code: 'USERNAME_TAKEN', message: 'That username is already reserved' } })
      }
      return res.json({ data: { alreadyJoined: true } })
    }
    next(err)
  }
})

// ── GET /api/waitlist — admin summary ─────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const secret = req.headers['x-admin-secret']
    if (!secret || secret !== process.env['ADMIN_SECRET']) throw new AppError('Forbidden', 403)

    const [total, byCity, recent] = await Promise.all([
      prisma.waitlistEmail.count(),
      prisma.waitlistEmail.groupBy({
        by: ['city'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 20,
      }),
      prisma.waitlistEmail.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { id: true, email: true, username: true, name: true, city: true, source: true, createdAt: true },
      }),
    ])

    res.json({ data: { total, byCity, recent } })
  } catch (err) { next(err) }
})

export default router
