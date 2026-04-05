import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { getSignedUploadUrl } from '../lib/cloudinary'
import { z } from 'zod'

const router = Router()

const ALLOWED_FOLDERS = ['events', 'avatars', 'sightings'] as const

/** POST /api/uploads/image — get a signed Cloudinary upload credential */
router.post('/image', requireAuth, async (req: AuthRequest, res, next) => {
  const schema = z.object({
    folder: z.enum(ALLOWED_FOLDERS).default('events'),
  })

  try {
    const { folder } = schema.parse(req.body)
    const credentials = await getSignedUploadUrl(`partyradar/${folder}`)
    res.json({ data: credentials })
  } catch (err) {
    next(err)
  }
})

export default router
