import { auth } from './firebase'

// Always read from NEXT_PUBLIC_API_URL so any redeploy to a new Railway domain
// only requires updating the env var — not a code change + deploy cycle.
export const API_URL =
  process.env['NEXT_PUBLIC_API_URL'] ??
  (process.env.NODE_ENV === 'production'
    ? 'https://api-production-f912.up.railway.app/api'
    : 'http://localhost:4000/api')

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

// Per-request abort timeout (ms). Railway's proxy accepts TCP connections
// but the app process may never send an HTTP response (cold start, crash,
// OOM). Without a timeout the browser's fetch() hangs forever, freezing
// every loading spinner that awaits it. 12 s is generous enough for a slow
// Railway cold start but short enough to surface a real error to the user.
const REQUEST_TIMEOUT_MS = 12_000

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const authHeader = await getAuthHeader()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
        ...(options.headers as Record<string, string> ?? {}),
      },
    })
  } catch (err) {
    // fetch only throws on network/CORS/DNS failures, AbortError (timeout),
    // or CORS rejection — never on HTTP error codes. Rethrow with context so
    // the UI can show something useful instead of the bare "Failed to fetch".
    const isTimeout = err instanceof DOMException && err.name === 'AbortError'
    console.error(`[api] ${options.method ?? 'GET'} ${path} — ${isTimeout ? 'timed out' : 'network/CORS failure'}`, err)
    throw new NetworkError(path, err)
  } finally {
    clearTimeout(timeoutId)
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
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      signal: controller.signal,
      // Bug 10 fix: disable browser cache so SWR always gets fresh data (e.g. scanned tickets)
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...authHeader },
    })
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === 'AbortError'
    console.error(`[fetcher] GET ${path} — ${isTimeout ? 'timed out' : 'network/CORS failure'}`, err)
    throw new NetworkError(path, err)
  } finally {
    clearTimeout(timeoutId)
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
