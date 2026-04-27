import { Router } from 'express'
import { prisma, Prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { auth } from '../lib/firebase-admin'
import { AppError } from '../middleware/errorHandler'
import { z } from 'zod'
import { moderateText, recordViolation } from '../lib/moderation'

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

    // Check if this Firebase UID is an admin
    const adminUids = (process.env['ADMIN_FIREBASE_UIDS'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const shouldBeAdmin = adminUids.includes(uid)

    if (!user) {
      // Check username uniqueness
      let username = baseUsername
      let attempt = 0
      while (await prisma.user.findUnique({ where: { username } })) {
        attempt++
        username = `${baseUsername}${attempt}`
      }

      // Bug 12 fix: catch P2002 unique-constraint violation from concurrent registrations
      try {
        user = await prisma.user.create({
          data: {
            firebaseUid: uid,
            email,
            username,
            displayName: name ?? username,
            photoUrl: picture ?? null,
            isAdmin: shouldBeAdmin,
          },
        })
      } catch (createErr: any) {
        if (createErr?.code === 'P2002') {
          // Another request created a user with this username between our check and create.
          // Fall back to uid-suffixed username to guarantee uniqueness.
          user = await prisma.user.create({
            data: {
              firebaseUid: uid,
              email,
              username: `${baseUsername}${uid.slice(-4)}`,
              displayName: name ?? username,
              photoUrl: picture ?? null,
              isAdmin: shouldBeAdmin,
            },
          })
        } else {
          throw createErr
        }
      }

      // Auto-follow all admin accounts + @Trippyboy so new users see official content
      const toFollow: string[] = []

      if (adminUids.length > 0) {
        const adminUsers = await prisma.user.findMany({
          where: { firebaseUid: { in: adminUids }, id: { not: user.id } },
          select: { id: true },
        })
        toFollow.push(...adminUsers.map((a) => a.id))
      }

      // Auto-follow the founder/official account (configurable via env var)
      const founderUsername = process.env['FOUNDER_USERNAME'] ?? 'trippyboy'
      const founderUser = await prisma.user.findUnique({
        where: { username: founderUsername },
        select: { id: true },
      })
      if (founderUser && founderUser.id !== user.id && !toFollow.includes(founderUser.id)) {
        toFollow.push(founderUser.id)
      }

      for (const followingId of toFollow) {
        try {
          await prisma.follow.create({
            data: { followerId: user.id, followingId },
          })
        } catch {
          // Ignore duplicate constraint
        }
      }
    } else if (shouldBeAdmin && !user.isAdmin) {
      // Promote to admin if UID is in admin list but not yet flagged
      user = await prisma.user.update({
        where: { id: user.id },
        data: { isAdmin: true, appRole: 'ADMIN' },
      })
    } else if (!shouldBeAdmin && user.isAdmin) {
      // Demote if UID was removed from ADMIN_FIREBASE_UIDS — without this,
      // removing a UID from the env var has no effect until a manual DB edit.
      user = await prisma.user.update({
        where: { id: user.id },
        data: { isAdmin: false, appRole: 'USER' },
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
    profileBgImage: z.string().url().optional().nullable(),
    username: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/).optional(),
    gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']).optional().nullable(),
    profileBg: z.string().max(200).optional().nullable(),
    themeColor: z.string().max(50).optional().nullable(),
    themeName: z.string().max(50).optional().nullable(),
    // Settings / preferences
    notifPrefs: z.record(z.boolean()).optional().nullable(),
    showInNearby: z.boolean().optional(),
    showProfileViews: z.boolean().optional(),
    allowGoOutFromStrangers: z.boolean().optional(),
  })

  try {
    const body = schema.parse(req.body)
    const userId = req.user!.dbUser.id

    if (body.username) {
      const existing = await prisma.user.findUnique({ where: { username: body.username } })
      if (existing && existing.id !== userId) throw new AppError('Username already taken', 409)
    }

    // ── Content moderation for bio & displayName ──────────────────────────────
    const textToCheck = [body.displayName, body.bio].filter(Boolean).join(' ')
    if (textToCheck.trim()) {
      const modResult = await moderateText(textToCheck)
      if (!modResult.passed) {
        await recordViolation({
          userId,
          contentType: 'bio',
          content: textToCheck,
          flagType: modResult.flagType ?? 'ILLEGAL',
          confidence: modResult.confidence ?? 1,
          reason: modResult.reason,
          action: 'BLOCKED',
        })
        throw new AppError('Your profile contains content that violates our community guidelines.', 422)
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...body,
        notifPrefs: body.notifPrefs === null ? Prisma.JsonNull : body.notifPrefs,
      },
    })
    res.json({ data: user })
  } catch (err) {
    next(err)
  }
})

/** POST /api/auth/age-verify */
router.post('/age-verify', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    })
    const { dateOfBirth } = schema.parse(req.body)

    // Validate the user is at least 18 years old
    const dob = new Date(dateOfBirth)
    if (isNaN(dob.getTime())) throw new AppError('Invalid date of birth', 400)
    const today = new Date()
    const eighteenYearsAgo = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())
    if (dob > eighteenYearsAgo) throw new AppError('You must be 18 or older to verify your age.', 400)

    const user = await prisma.user.update({
      where: { id: req.user!.dbUser.id },
      data: { ageVerified: true, dateOfBirth: dob },
    })
    res.json({ data: user })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/auth/settings — update user privacy & notification preferences */
router.put('/settings', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({
    showInNearby:            z.boolean().optional(),
    showProfileViews:        z.boolean().optional(),
    allowGoOutFromStrangers: z.boolean().optional(),
    showAlcoholEvents:       z.boolean().optional(),
    notifPrefs:              z.record(z.boolean()).optional().nullable(),
  })
  try {
    const parsed = schema.parse(req.body)
    const { notifPrefs, ...rest } = parsed
    const user = await prisma.user.update({
      where: { id: req.user!.dbUser.id },
      data: {
        ...rest,
        // Prisma requires Prisma.JsonNull (not JS null) to explicitly null a Json field
        ...(notifPrefs !== undefined
          ? { notifPrefs: notifPrefs === null ? Prisma.JsonNull : notifPrefs }
          : {}),
      },
    })
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

/** PUT /api/auth/mode — switch between ATTENDEE and HOST mode */
router.put('/mode', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({
    accountMode: z.enum(['ATTENDEE', 'HOST']),
  })
  try {
    const { accountMode } = schema.parse(req.body)
    const user = await prisma.user.update({
      where: { id: req.user!.dbUser.id },
      data: { accountMode },
    })
    res.json({ data: user })
  } catch (err) {
    next(err)
  }
})

export default router
