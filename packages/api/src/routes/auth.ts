import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { auth } from '../lib/firebase-admin'
import { AppError } from '../middleware/errorHandler'
import { z } from 'zod'

const router = Router()

/** POST /api/auth/sync — upsert user after Firebase login */
router.post('/sync', async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1]
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return }

  try {
    const decoded = await auth.verifyIdToken(token)
    const { uid, email, name, picture } = decoded

    if (!email) throw new AppError('Email required', 400)

    // Generate username from email if needed
    const baseUsername = email.split('@')[0]!.toLowerCase().replace(/[^a-z0-9]/g, '')

    let user = await prisma.user.findUnique({ where: { firebaseUid: uid } })

    if (!user) {
      // Check username uniqueness
      let username = baseUsername
      let attempt = 0
      while (await prisma.user.findUnique({ where: { username } })) {
        attempt++
        username = `${baseUsername}${attempt}`
      }

      user = await prisma.user.create({
        data: {
          firebaseUid: uid,
          email,
          username,
          displayName: name ?? username,
          photoUrl: picture ?? null,
        },
      })
    }

    res.json({ data: user })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/auth/profile */
router.put('/profile', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({
    displayName: z.string().min(1).max(60).optional(),
    bio: z.string().max(300).optional(),
    photoUrl: z.string().url().optional().nullable(),
    alcoholFriendly: z.boolean().optional(),
    username: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/).optional(),
  })

  try {
    const body = schema.parse(req.body)
    const userId = req.user!.dbUser.id

    if (body.username) {
      const existing = await prisma.user.findUnique({ where: { username: body.username } })
      if (existing && existing.id !== userId) throw new AppError('Username already taken', 409)
    }

    const user = await prisma.user.update({ where: { id: userId }, data: body })
    res.json({ data: user })
  } catch (err) {
    next(err)
  }
})

/** POST /api/auth/age-verify */
router.post('/age-verify', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.dbUser.id },
      data: { ageVerified: true },
    })
    res.json({ data: user })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/auth/settings */
router.put('/settings', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({
    showAlcoholEvents: z.boolean().optional(),
    alcoholFriendly: z.boolean().optional(),
  })

  try {
    const body = schema.parse(req.body)
    const dbUser = req.user!.dbUser

    if (body.showAlcoholEvents && !dbUser.ageVerified) {
      throw new AppError('Age verification required to enable alcohol filter', 403)
    }

    const user = await prisma.user.update({ where: { id: dbUser.id }, data: body })
    res.json({ data: user })
  } catch (err) {
    next(err)
  }
})

/** GET /api/auth/me */
router.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.dbUser.id },
      include: { subscription: true },
    })
    res.json({ data: user })
  } catch (err) {
    next(err)
  }
})

export default router
