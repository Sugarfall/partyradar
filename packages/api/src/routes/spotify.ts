import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_URI,
  basicAuthHeader,
  getClientCredToken,
} from '../lib/spotify'

const router = Router()

const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'https://partyradar-web.vercel.app'

// ── Venue OAuth ───────────────────────────────────────────────────────────────

/** GET /api/spotify/connect-url/:venueId — returns Spotify OAuth URL (venue owner only) */
router.get('/connect-url/:venueId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const venue = await prisma.venue.findUnique({
      where: { id: req.params['venueId'] },
      select: { claimedById: true },
    })
    if (!venue || venue.claimedById !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REDIRECT_URI) {
      throw new AppError('Spotify is not configured on this server — contact support', 503)
    }

    const state = Buffer.from(
      JSON.stringify({ venueId: req.params['venueId'], userId: req.user!.dbUser.id }),
    ).toString('base64url')

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: SPOTIFY_CLIENT_ID,
      scope: 'user-read-currently-playing user-read-playback-state',
      redirect_uri: SPOTIFY_REDIRECT_URI,
      state,
    })
    res.json({ data: { url: `https://accounts.spotify.com/authorize?${params}` } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/spotify/callback — OAuth callback from Spotify */
router.get('/callback', async (req, res, next) => {
  const { code, state, error } = req.query as {
    code?: string; state?: string; error?: string
  }

  if (error || !code || !state) {
    return res.redirect(`${FRONTEND_URL}/?spotify_error=${error ?? 'cancelled'}`)
  }

  try {
    const { venueId } = JSON.parse(Buffer.from(state, 'base64url').toString()) as {
      venueId: string; userId: string
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuthHeader(),
      },
      body: new URLSearchParams({
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })
    const tokens = (await tokenRes.json()) as {
      access_token: string; refresh_token: string; expires_in: number; error?: string
    }
    if (tokens.error) throw new Error(tokens.error)

    // Get Spotify user profile
    const profileRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const profile = (await profileRes.json()) as { id: string; display_name: string }

    await prisma.venue.update({
      where: { id: venueId },
      data: {
        spotifyConnected: true,
        spotifyUserId: profile.id,
        spotifyDisplayName: profile.display_name,
        spotifyAccessToken: tokens.access_token,
        spotifyRefreshToken: tokens.refresh_token,
        spotifyTokenExpiry: new Date(Date.now() + tokens.expires_in * 1_000),
      },
    })

    res.redirect(`${FRONTEND_URL}/venues/${venueId}?spotify=connected`)
  } catch (err) {
    console.error('[spotify callback]', err)
    res.redirect(`${FRONTEND_URL}/?spotify_error=callback_failed`)
  }
})

/** DELETE /api/spotify/connect/:venueId — disconnect Spotify from venue */
router.delete('/connect/:venueId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const venue = await prisma.venue.findUnique({
      where: { id: req.params['venueId'] },
      select: { claimedById: true },
    })
    if (!venue || venue.claimedById !== req.user!.dbUser.id) throw new AppError('Forbidden', 403)

    await prisma.venue.update({
      where: { id: req.params['venueId'] },
      data: {
        spotifyConnected: false,
        spotifyUserId: null,
        spotifyDisplayName: null,
        spotifyAccessToken: null,
        spotifyRefreshToken: null,
        spotifyTokenExpiry: null,
        nowPlayingJson: null,
        nowPlayingAt: null,
      },
    })
    res.json({ data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

// ── Now Playing ───────────────────────────────────────────────────────────────

/** Refresh venue's access token if expired; returns fresh token or null */
async function getFreshVenueToken(venueId: string): Promise<string | null> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      spotifyAccessToken: true,
      spotifyRefreshToken: true,
      spotifyTokenExpiry: true,
    },
  })
  if (!venue?.spotifyAccessToken || !venue.spotifyRefreshToken) return null

  // Still valid
  if (venue.spotifyTokenExpiry && venue.spotifyTokenExpiry.getTime() > Date.now() + 60_000) {
    return venue.spotifyAccessToken
  }

  // Refresh
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: venue.spotifyRefreshToken,
    }),
  })
  const data = (await res.json()) as {
    access_token?: string; expires_in?: number; error?: string
  }
  if (!data.access_token) return null

  await prisma.venue.update({
    where: { id: venue.id },
    data: {
      spotifyAccessToken: data.access_token,
      spotifyTokenExpiry: new Date(Date.now() + (data.expires_in ?? 3600) * 1_000),
    },
  })
  return data.access_token
}

function parsePlayback(playback: Record<string, unknown>) {
  const item = playback.item as Record<string, unknown> | null
  if (!item) return null
  const artists = item.artists as Array<{ name: string }>
  const album = item.album as Record<string, unknown>
  const images = album?.images as Array<{ url: string }>
  return {
    isPlaying: playback.is_playing as boolean,
    trackId: item.id as string,
    title: item.name as string,
    artist: artists.map((a) => a.name).join(', '),
    album: album?.name as string | undefined,
    albumArt: images?.[0]?.url as string | undefined,
    previewUrl: (item.preview_url as string | null) ?? null,
    spotifyUrl: (item.external_urls as Record<string, string>)?.spotify as string | undefined,
    progressMs: playback.progress_ms as number,
    durationMs: item.duration_ms as number,
    fetchedAt: Date.now(),
  }
}

const CACHE_TTL = 30_000 // 30 seconds

/** GET /api/spotify/now-playing/:venueId — current track with 30 s cache (public) */
router.get('/now-playing/:venueId', optionalAuth, async (_req: AuthRequest, res, next) => {
  try {
    const venue = await prisma.venue.findUnique({
      where: { id: _req.params['venueId'] },
      select: { id: true, spotifyConnected: true, nowPlayingJson: true, nowPlayingAt: true },
    })
    if (!venue?.spotifyConnected) return res.json({ data: null })

    // Serve from cache if fresh
    if (
      venue.nowPlayingAt &&
      Date.now() - venue.nowPlayingAt.getTime() < CACHE_TTL &&
      venue.nowPlayingJson
    ) {
      return res.json({ data: JSON.parse(venue.nowPlayingJson) })
    }

    const token = await getFreshVenueToken(venue.id)
    if (!token) return res.json({ data: null })

    const spRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (spRes.status === 204 || !spRes.ok) {
      await prisma.venue.update({
        where: { id: venue.id },
        data: { nowPlayingJson: null, nowPlayingAt: new Date() },
      })
      return res.json({ data: null })
    }

    const playback = (await spRes.json()) as Record<string, unknown>
    const nowPlaying = parsePlayback(playback)

    await prisma.venue.update({
      where: { id: venue.id },
      data: {
        nowPlayingJson: nowPlaying ? JSON.stringify(nowPlaying) : null,
        nowPlayingAt: new Date(),
      },
    })

    res.json({ data: nowPlaying })
  } catch (err) {
    next(err)
  }
})

/** GET /api/spotify/now-playing/:venueId/live — SSE stream, pushes on track change */
router.get('/now-playing/:venueId/live', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const venueId = req.params['venueId']!
  let lastTrackId: string | null | undefined = undefined

  async function poll() {
    try {
      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        select: { id: true, spotifyConnected: true, nowPlayingJson: true, nowPlayingAt: true },
      })
      if (!venue?.spotifyConnected) {
        res.write('data: null\n\n')
        return
      }

      let nowPlaying: ReturnType<typeof parsePlayback> = null

      if (
        venue.nowPlayingAt &&
        Date.now() - venue.nowPlayingAt.getTime() < CACHE_TTL &&
        venue.nowPlayingJson
      ) {
        nowPlaying = JSON.parse(venue.nowPlayingJson) as ReturnType<typeof parsePlayback>
      } else {
        const token = await getFreshVenueToken(venue.id)
        if (token) {
          const spRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (spRes.ok && spRes.status !== 204) {
            nowPlaying = parsePlayback((await spRes.json()) as Record<string, unknown>)
          }
          await prisma.venue.update({
            where: { id: venue.id },
            data: {
              nowPlayingJson: nowPlaying ? JSON.stringify(nowPlaying) : null,
              nowPlayingAt: new Date(),
            },
          })
        }
      }

      const currentId = (nowPlaying as { trackId?: string } | null)?.trackId ?? null
      if (currentId !== lastTrackId) {
        lastTrackId = currentId
        res.write(`data: ${JSON.stringify(nowPlaying)}\n\n`)
      }
    } catch {
      // swallow — SSE stream stays open
    }
  }

  await poll()
  const interval = setInterval(poll, 15_000)
  req.on('close', () => clearInterval(interval))
})

// ── Artist Spotify ────────────────────────────────────────────────────────────

/** POST /api/spotify/artist — link Spotify artist profile (paste URL) */
router.post('/artist', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { spotifyUrl } = req.body as { spotifyUrl?: string }
    const match = spotifyUrl?.match(/artist\/([A-Za-z0-9]+)/)
    if (!match) {
      throw new AppError(
        'Paste a Spotify artist URL, e.g. https://open.spotify.com/artist/…',
        400,
      )
    }
    const artistId = match[1]!

    const token = await getClientCredToken()
    const [artistRes, topRes] = await Promise.all([
      fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=GB`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ])
    if (!artistRes.ok) throw new AppError('Artist not found on Spotify', 404)

    const artist = (await artistRes.json()) as Record<string, unknown>
    const topData = (await topRes.json()) as { tracks?: Array<Record<string, unknown>> }

    const artistData = {
      id: artist.id as string,
      name: artist.name as string,
      followers: (artist.followers as { total?: number } | undefined)?.total ?? 0,
      genres: (artist.genres as string[] | undefined) ?? [],
      imageUrl:
        ((artist.images as Array<{ url: string }> | undefined)?.[0]?.url) ?? null,
      spotifyUrl: (artist.external_urls as { spotify?: string } | undefined)?.spotify ?? null,
      topTracks: (topData.tracks ?? []).slice(0, 10).map((t) => {
        const tAlbum = t.album as Record<string, unknown> | undefined
        return {
          id: t.id as string,
          name: t.name as string,
          album: tAlbum?.name as string | undefined,
          albumArt: (tAlbum?.images as Array<{ url: string }> | undefined)?.[0]?.url ?? null,
          previewUrl: (t.preview_url as string | null) ?? null,
          spotifyUrl:
            (t.external_urls as { spotify?: string } | undefined)?.spotify ?? null,
          durationMs: t.duration_ms as number,
        }
      }),
    }

    await prisma.user.update({
      where: { id: req.user!.dbUser.id },
      data: {
        spotifyArtistId: artistId,
        spotifyArtistData: JSON.stringify(artistData),
        spotifyArtistSyncedAt: new Date(),
      },
    })

    res.json({ data: artistData })
  } catch (err) {
    next(err)
  }
})

/** GET /api/spotify/artist/:userId — public artist Spotify data */
router.get('/artist/:userId', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params['userId'] },
      select: { spotifyArtistId: true, spotifyArtistData: true },
    })
    if (!user?.spotifyArtistId || !user.spotifyArtistData) return res.json({ data: null })
    res.json({ data: JSON.parse(user.spotifyArtistData) })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/spotify/artist — disconnect own Spotify artist */
router.delete('/artist', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.dbUser.id },
      data: { spotifyArtistId: null, spotifyArtistData: null, spotifyArtistSyncedAt: null },
    })
    res.json({ data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

export default router
