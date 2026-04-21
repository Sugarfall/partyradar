import { auth } from './firebase'

// In production always use the Railway backend; locally fall back to dev server
export const API_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://api-production-f912.up.railway.app/api'
    : (process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000/api')

/** Root URL without /api suffix — used for socket.io connections */
export const API_ORIGIN = API_URL.replace(/\/api$/, '')

async function getAuthHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser
  if (!user) return {}
  const token = await user.getIdToken()
  return { Authorization: `Bearer ${token}` }
}

/** Thrown when fetch itself fails (network down, CORS rejected, DNS, etc.).
 *  Callers can distinguish network failures from HTTP errors by instanceof check.
 */
export class NetworkError extends Error {
  constructor(public readonly path: string, cause?: unknown) {
    super(`Network error reaching API (${path}). Check your connection — if you're on the live site this usually means the API is unreachable or CORS is blocking the request.`)
    this.name = 'NetworkError'
    if (cause) (this as any).cause = cause
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const authHeader = await getAuthHeader()
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
        ...(options.headers as Record<string, string> ?? {}),
      },
    })
  } catch (err) {
    // fetch only throws on network/CORS/DNS failures — never on HTTP error
    // codes. Rethrow with context so the UI can show something useful instead
    // of the bare "Failed to fetch" that browsers produce by default.
    console.error(`[api] ${options.method ?? 'GET'} ${path} — network/CORS failure`, err)
    throw new NetworkError(path, err)
  }

  // Bug 1 fix: guard against non-JSON bodies (e.g. Railway/Cloudflare 502 HTML pages)
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch { data = { error: text || 'Request failed' } }

  if (!res.ok) {
    // Bug 2 fix: tier-gated errors return { error: { message, code, requiredTier } }
    const errVal = data?.error
    const msg = typeof errVal === 'string' ? errVal : errVal?.message ?? 'Request failed'
    throw new Error(msg)
  }
  return data
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// ─── SWR fetcher ─────────────────────────────────────────────────────────────

export async function fetcher(path: string) {
  const authHeader = await getAuthHeader()
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      // Bug 10 fix: disable browser cache so SWR always gets fresh data (e.g. scanned tickets)
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...authHeader },
    })
  } catch (err) {
    console.error(`[fetcher] GET ${path} — network/CORS failure`, err)
    throw new NetworkError(path, err)
  }
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch { data = { error: text || 'Fetch failed' } }
  if (!res.ok) {
    const errVal = data?.error
    const msg = typeof errVal === 'string' ? errVal : errVal?.message ?? 'Fetch failed'
    throw new Error(msg)
  }
  return data
}
