import type { Request, Response, NextFunction } from 'express'
import { auth } from '../lib/firebase-admin'
import { prisma } from '@partyradar/db'

export interface AuthRequest extends Request {
  user?: {
    firebaseUid: string
    dbUser: {
      id: string
      email: string
      username: string
      displayName: string
      subscriptionTier: string
      ageVerified: boolean
      showAlcoholEvents: boolean
      isAdmin: boolean
      isBanned: boolean
    }
  }
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split('Bearer ')[1]
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const decoded = await auth.verifyIdToken(token)
    const dbUser = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        subscriptionTier: true,
        ageVerified: true,
        showAlcoholEvents: true,
        isAdmin: true,
        isBanned: true,
      },
    })

    if (!dbUser) {
      res.status(401).json({ error: 'User not found. Please sync your profile.' })
      return
    }

    if (dbUser.isBanned) {
      res.status(403).json({ error: 'Account suspended.' })
      return
    }

    req.user = { firebaseUid: decoded.uid, dbUser }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    if (!req.user?.dbUser.isAdmin) {
      res.status(403).json({ error: 'Admin access required' })
      return
    }
    next()
  })
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split('Bearer ')[1]
  if (!token) { next(); return }

  auth.verifyIdToken(token)
    .then(async (decoded) => {
      const dbUser = await prisma.user.findUnique({
        where: { firebaseUid: decoded.uid },
        select: {
          id: true, email: true, username: true, displayName: true,
          subscriptionTier: true, ageVerified: true, showAlcoholEvents: true,
          isAdmin: true, isBanned: true,
        },
      })
      if (dbUser && !dbUser.isBanned) req.user = { firebaseUid: decoded.uid, dbUser }
      next()
    })
    .catch(() => next())
}
