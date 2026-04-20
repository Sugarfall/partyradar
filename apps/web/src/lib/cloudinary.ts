import { api } from './api'

export type UploadFolder = 'events' | 'avatars' | 'sightings' | 'profile-backgrounds'

interface UploadCredentials {
  timestamp: number
  signature: string
  cloudName: string
  apiKey: string
  folder: string
  transformation: string | null
}

/** Detect Cloudinary video URLs (vs image URLs) */
export function isVideoUrl(url: string): boolean {
  return url.includes('/video/upload/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)
}

export async function uploadImage(file: File, folder: UploadFolder = 'events'): Promise<string> {
  // Get signed credentials from our backend
  const res = await api.post<{ data: UploadCredentials }>('/uploads/image', { folder })
  const data = res.data

  const formData = new FormData()
  formData.append('file', file)
  formData.append('timestamp', String(data.timestamp))
  formData.append('signature', data.signature)
  formData.append('api_key', data.apiKey)
  formData.append('folder', data.folder)
  // Must include transformation if it was included in the HMAC signature
  if (data.transformation) formData.append('transformation', data.transformation)

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${data.cloudName}/image/upload`,
    { method: 'POST', body: formData }
  )

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? 'Image upload failed')
  }
  const result = await uploadRes.json() as { secure_url: string }
  return result.secure_url
}

export async function uploadVideo(file: File, folder: UploadFolder = 'sightings'): Promise<string> {
  const res = await api.post<{ data: UploadCredentials }>('/uploads/video', { folder })
  const data = res.data

  const formData = new FormData()
  formData.append('file', file)
  formData.append('timestamp', String(data.timestamp))
  formData.append('signature', data.signature)
  formData.append('api_key', data.apiKey)
  formData.append('folder', data.folder)

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${data.cloudName}/video/upload`,
    { method: 'POST', body: formData }
  )

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? 'Video upload failed')
  }
  const result = await uploadRes.json() as { secure_url: string }
  return result.secure_url
}
