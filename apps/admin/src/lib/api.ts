import { auth } from './firebase'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000/api'

export async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const user = auth.currentUser
  const token = user ? await user.getIdToken() : null
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> ?? {}),
    },
  })
  const data = await res.json() as T
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Request failed')
  return data
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetcher = (path: string): Promise<any> => adminFetch<any>(path)
