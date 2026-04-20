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
      isAdmin: boolean
      isBanned: boolean
      showAlcoholEvents: boolean
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
        isAdmin: true,
        isBanned: true,
        showAlcoholEvents: true,
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
  // Bug 17 fix: allow internal service-to-service calls via INTERNAL_API_KEY
  const internalKey = process.env['INTERNAL_API_KEY']
  if (internalKey && req.headers.authorization === `Bearer ${internalKey}`) {
    next()
    return
  }
  await requireAuth(req, res, () => {
    if (!req.user?.dbUser.isAdmin) {
      res.status(403).json({ error: 'Admin access required' })
      return
    }
    next()
  })
}

export function requireTier(minTier: 'BASIC' | 'PRO' | 'PREMIUM', featureName: string) {
  const order: Record<string, number> = { FREE: 0, BASIC: 1, PRO: 2, PREMIUM: 3 }
  return async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest
    // Bug 11 fix: use flat error string so frontend can read data.error directly
    if (!authReq.user) return res.status(401).json({ error: 'Authentication required' })
    const userTier = authReq.user.dbUser.subscriptionTier ?? 'FREE'
    if ((order[userTier] ?? 0) < (order[minTier] ?? 0)) {
      return res.status(403).json({
        error: `${featureName} requires ${minTier} subscription or higher`,
        code: 'TIER_REQUIRED',
        requiredTier: minTier,
      })
    }
    next()
  }
}

export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split('Bearer ')[1]
  if (!token) { next(); return }

  try {
    const decoded = await auth.verifyIdToken(token)
    const dbUser = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: {
        id: true, email: true, username: true, displayName: true,
        subscriptionTier: true, ageVerified: true,
        isAdmin: true, isBanned: true, showAlcoholEvents: true,
      },
    })
    if (dbUser && !dbUser.isBanned) req.user = { firebaseUid: decoded.uid, dbUser }
  } catch {
    // token invalid or expired — proceed unauthenticated
  }
  next()
}
