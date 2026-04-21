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
      appRole: string
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
        appRole: true,
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

    req.user = { firebaseUid: decoded.uid, dbUser: { ...dbUser, appRole: dbUser.appRole as string } }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

/** Single source of truth for app role. Legacy `isAdmin` maps to ADMIN. */
export type AppRole = 'USER' | 'MODERATOR' | 'ADMIN'
const ROLE_ORDER: Record<AppRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2 }

export function effectiveRole(dbUser: { isAdmin: boolean; appRole: string } | null | undefined): AppRole {
  if (!dbUser) return 'USER'
  if (dbUser.isAdmin) return 'ADMIN'
  const r = dbUser.appRole as AppRole
  return r in ROLE_ORDER ? r : 'USER'
}

export function hasRole(dbUser: { isAdmin: boolean; appRole: string } | null | undefined, min: AppRole): boolean {
  return ROLE_ORDER[effectiveRole(dbUser)] >= ROLE_ORDER[min]
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  // Bug 17 fix: allow internal service-to-service calls via INTERNAL_API_KEY
  const internalKey = process.env['INTERNAL_API_KEY']
  if (internalKey && req.headers.authorization === `Bearer ${internalKey}`) {
    next()
    return
  }
  await requireAuth(req, res, () => {
    if (!hasRole(req.user?.dbUser, 'ADMIN')) {
      res.status(403).json({ error: 'Admin access required' })
      return
    }
    next()
  })
}

/** requireAppRole — platform-level MODERATOR or ADMIN gate */
export function requireAppRole(minRole: 'MODERATOR' | 'ADMIN') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest
    if (!authReq.user) return res.status(401).json({ error: 'Authentication required' })
    if (!hasRole(authReq.user.dbUser, minRole)) {
      return res.status(403).json({
        error: `This action requires ${minRole} access or higher`,
        code: 'ROLE_REQUIRED',
        requiredRole: minRole,
      })
    }
    next()
  }
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
        isAdmin: true, appRole: true, isBanned: true, showAlcoholEvents: true,
      },
    })
    if (dbUser && !dbUser.isBanned) req.user = { firebaseUid: decoded.uid, dbUser: { ...dbUser, appRole: dbUser.appRole as string } }
  } catch {
    // token invalid or expired — proceed unauthenticated
  }
  next()
}
