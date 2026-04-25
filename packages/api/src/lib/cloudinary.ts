import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env['CLOUDINARY_CLOUD_NAME'],
  api_key: process.env['CLOUDINARY_API_KEY'],
  api_secret: process.env['CLOUDINARY_API_SECRET'],
  secure: true,
})

export { cloudinary }

/**
 * Reject any imageUrl that isn't a Cloudinary URL belonging to OUR account.
 * Prevents clients from storing arbitrary third-party URLs (SSRF, phishing,
 * displacing our CDN, content that can be swapped after-the-fact, etc.).
 *
 * Returns the URL unchanged if valid, or throws if invalid.
 */
export function assertOwnImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const cloudName = process.env['CLOUDINARY_CLOUD_NAME']
  if (!cloudName) {
    // In dev/test without Cloudinary configured, accept any https URL — but
    // in production this must be set, or we silently open the SSRF hole.
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error('CLOUDINARY_CLOUD_NAME must be set in production')
    }
    return url
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid image URL')
  }
  if (parsed.protocol !== 'https:') throw new Error('Image URL must be HTTPS')
  // res.cloudinary.com is the canonical delivery host. The path must start with
  // /<cloud_name>/ to prove it belongs to our Cloudinary account.
  if (parsed.hostname !== 'res.cloudinary.com') throw new Error('Image URL must be hosted on Cloudinary')
  if (!parsed.pathname.startsWith(`/${cloudName}/`)) throw new Error('Image URL does not belong to this app')
  return url
}

/**
 * Extract the Cloudinary public ID from a delivery URL so we can delete it.
 * URL form: https://res.cloudinary.com/<cloud>/<resource_type>/upload/[v<ver>/]<public_id>.<ext>
 * Returns null if the URL isn't a recognised Cloudinary asset (e.g. external placeholder).
 */
export function extractPublicId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'res.cloudinary.com') return null
    // pathname: /<cloud>/<resource_type>/upload/[v123456/]<public_id>.<ext>
    const parts = parsed.pathname.split('/')
    const uploadIdx = parts.indexOf('upload')
    if (uploadIdx === -1) return null
    // Everything after 'upload/' (skip optional version segment starting with 'v')
    let remaining = parts.slice(uploadIdx + 1)
    if (remaining[0]?.match(/^v\d+$/)) remaining = remaining.slice(1)
    const withExt = remaining.join('/')
    // Strip extension
    return withExt.replace(/\.[^/.]+$/, '')
  } catch {
    return null
  }
}

/**
 * Delete a single Cloudinary asset by its delivery URL.
 * Silently ignores assets that aren't ours or are already gone.
 */
export async function deleteCloudinaryAsset(url: string, resourceType: 'image' | 'video' = 'image'): Promise<void> {
  const publicId = extractPublicId(url)
  if (!publicId) return
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true })
  } catch (err) {
    console.error(`[Cloudinary] Failed to delete asset ${publicId}:`, err)
  }
}

export async function getSignedUploadUrl(folder: string, transformation?: string) {
  const timestamp = Math.round(Date.now() / 1000)
  const params: Record<string, string | number> = { timestamp, folder }
  if (transformation) params['transformation'] = transformation
  const signature = cloudinary.utils.api_sign_request(
    params,
    process.env['CLOUDINARY_API_SECRET']!
  )
  return {
    timestamp,
    signature,
    cloudName: process.env['CLOUDINARY_CLOUD_NAME'],
    apiKey: process.env['CLOUDINARY_API_KEY'],
    folder,
    transformation: transformation ?? null,
  }
}
