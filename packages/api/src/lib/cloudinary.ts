import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env['CLOUDINARY_CLOUD_NAME'],
  api_key: process.env['CLOUDINARY_API_KEY'],
  api_secret: process.env['CLOUDINARY_API_SECRET'],
  secure: true,
})

export { cloudinary }

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
