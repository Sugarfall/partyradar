import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { getSignedUploadUrl } from '../lib/cloudinary'
import { z } from 'zod'

const router = Router()

// ── Per-user upload rate limiters ─────────────────────────────────────────────
const videoUploadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,  // 24 hours
  max: 10,                          // 10 video uploads per day per user
  keyGenerator: (req) => (req as any).user?.uid ?? req.ip ?? 'anon',
  message: { error: 'Daily video upload limit reached. Try again tomorrow.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const audioUploadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => (req as any).user?.uid ?? req.ip ?? 'anon',
  message: { error: 'Daily audio upload limit reached. Try again tomorrow.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const imageUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 30,                    // 30 image uploads per hour per user
  keyGenerator: (req) => (req as any).user?.uid ?? req.ip ?? 'anon',
  message: { error: 'Hourly image upload limit reached. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const ALLOWED_FOLDERS = ['events', 'avatars', 'sightings', 'profile-backgrounds'] as const

// Auto-transformation applied per folder (included in signature so Cloudinary accepts it)
const FOLDER_TRANSFORMS: Partial<Record<typeof ALLOWED_FOLDERS[number], string>> = {
  avatars: 'c_fill,w_400,h_400,q_auto,f_auto',
  'profile-backgrounds': 'c_fill,w_1200,h_400,q_auto,f_auto',
}

/** POST /api/uploads/image — get a signed Cloudinary upload credential */
router.post('/image', imageUploadLimiter, requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({
    folder: z.enum(ALLOWED_FOLDERS).default('events'),
  })

  try {
    const { folder } = schema.parse(req.body)
    const transformation = FOLDER_TRANSFORMS[folder]
    const credentials = await getSignedUploadUrl(`partyradar/${folder}`, transformation)
    res.json({ data: credentials })
  } catch (err) {
    next(err)
  }
})

/** POST /api/uploads/video — get a signed Cloudinary upload credential for video posts */
router.post('/video', videoUploadLimiter, requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const credentials = await getSignedUploadUrl('partyradar/sightings')
    res.json({ data: credentials })
  } catch (err) {
    next(err)
  }
})

/** POST /api/uploads/audio — get a signed Cloudinary upload credential for voice notes */
router.post('/audio', audioUploadLimiter, requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const credentials = await getSignedUploadUrl('partyradar/voice')
    res.json({ data: credentials })
  } catch (err) {
    next(err)
  }
})

export default router
