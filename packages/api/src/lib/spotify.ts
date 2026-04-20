export const SPOTIFY_CLIENT_ID = process.env['SPOTIFY_CLIENT_ID'] ?? ''
export const SPOTIFY_CLIENT_SECRET = process.env['SPOTIFY_CLIENT_SECRET'] ?? ''
export const SPOTIFY_REDIRECT_URI =
  process.env['SPOTIFY_REDIRECT_URI'] ?? 'http://localhost:3001/api/spotify/callback'

export function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
}

// ── Client Credentials token (for public/artist lookups, no user auth needed) ─

let _ccToken: { value: string; expiry: number } | null = null

export async function getClientCredToken(): Promise<string> {
  if (_ccToken && _ccToken.expiry > Date.now() + 60_000) return _ccToken.value

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body: 'grant_type=client_credentials',
  })
  const data = (await res.json()) as { access_token: string; expires_in: number }
  _ccToken = { value: data.access_token, expiry: Date.now() + data.expires_in * 1_000 }
  return _ccToken.value
}
