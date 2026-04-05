import { api } from './api'

type UploadFolder = 'events' | 'avatars' | 'sightings'

interface UploadCredentials {
  timestamp: number
  signature: string
  cloudName: string
  apiKey: string
  folder: string
}

export async function uploadImage(file: File, folder: UploadFolder = 'events'): Promise<string> {
  // Get signed credentials from our backend
  const { data } = await api.post<{ data: UploadCredentials }>('/uploads/image', { folder })

  const formData = new FormData()
  formData.append('file', file)
  formData.append('timestamp', String(data.timestamp))
  formData.append('signature', data.signature)
  formData.append('api_key', data.apiKey)
  formData.append('folder', data.folder)

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${data.cloudName}/image/upload`,
    { method: 'POST', body: formData }
  )

  if (!res.ok) throw new Error('Image upload failed')
  const result = await res.json() as { secure_url: string }
  return result.secure_url
}
