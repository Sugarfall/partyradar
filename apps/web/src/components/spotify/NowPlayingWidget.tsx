'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { api, API_ORIGIN } from '@/lib/api'

interface NowPlaying {
  isPlaying: boolean
  trackId: string
  title: string
  artist: string
  album?: string
  albumArt?: string
  previewUrl: string | null
  spotifyUrl?: string
  progressMs: number
  durationMs: number
  fetchedAt: number
}

interface Props {
  venueId: string
}

function formatMs(ms: number) {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function NowPlayingWidget({ venueId }: Props) {
  const [track, setTrack] = useState<NowPlaying | null>(null)
  const [loading, setLoading] = useState(true)
  const [progressMs, setProgressMs] = useState(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sseRef = useRef<EventSource | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const applyTrack = useCallback((t: NowPlaying | null) => {
    setTrack(t)
    setLoading(false)
    if (!t) { setProgressMs(0); return }
    // Compute real-time offset: how much time has elapsed since fetchedAt
    const elapsed = Date.now() - t.fetchedAt
    const pos = Math.min(t.progressMs + elapsed, t.durationMs)
    setProgressMs(pos)
  }, [])

  // Tick every second to advance the progress bar smoothly
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setTrack((t) => {
        if (!t || !t.isPlaying) return t
        setProgressMs((p) => Math.min(p + 1000, t.durationMs))
        return t
      })
    }, 1000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [])

  // SSE connection
  useEffect(() => {
    let sseOk = false

    function connectSSE() {
      const es = new EventSource(`${API_ORIGIN}/api/spotify/now-playing/${venueId}/live`)
      sseRef.current = es
      sseOk = true

      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data) as NowPlaying | null
          applyTrack(data)
        } catch {}
      }

      es.onerror = () => {
        es.close()
        sseOk = false
        // Fall back to 30-second polling
        startPolling()
      }
    }

    function startPolling() {
      if (pollRef.current) return
      // Initial fetch
      api.get<{ data: NowPlaying | null }>(`/spotify/now-playing/${venueId}`)
        .then((j) => applyTrack(j?.data ?? null))
        .catch(() => setLoading(false))
      pollRef.current = setInterval(() => {
        api.get<{ data: NowPlaying | null }>(`/spotify/now-playing/${venueId}`)
          .then((j) => applyTrack(j?.data ?? null))
          .catch(() => {})
      }, 30_000)
    }

    connectSSE()

    // If SSE never fires within 3s, also start polling as fallback
    const sseTimeout = setTimeout(() => {
      if (!sseOk) startPolling()
    }, 3000)

    return () => {
      clearTimeout(sseTimeout)
      sseRef.current?.close()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [venueId, applyTrack])

  if (loading) {
    return (
      <div className="rounded-2xl p-4 animate-pulse" style={{ background: 'rgba(30,215,96,0.04)', border: '1px solid rgba(30,215,96,0.1)' }}>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl shrink-0" style={{ background: 'rgba(30,215,96,0.07)' }} />
          <div className="flex-1 space-y-2">
            <div className="h-3 rounded w-3/4" style={{ background: 'rgba(30,215,96,0.07)' }} />
            <div className="h-2.5 rounded w-1/2" style={{ background: 'rgba(30,215,96,0.05)' }} />
          </div>
        </div>
      </div>
    )
  }

  if (!track) return null

  const pct = track.durationMs > 0 ? Math.min((progressMs / track.durationMs) * 100, 100) : 0

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(30,215,96,0.04)', border: '1px solid rgba(30,215,96,0.14)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2" style={{ borderBottom: '1px solid rgba(30,215,96,0.07)' }}>
        {/* Animated bars */}
        <div className="flex items-end gap-[2px]" style={{ height: 14 }}>
          {[1, 0.6, 0.85, 0.45].map((h, i) => (
            <div
              key={i}
              className="w-[3px] rounded-full"
              style={{
                height: `${h * 100}%`,
                background: '#1ed760',
                animation: track.isPlaying ? `nowPlayingBar${i} ${0.6 + i * 0.15}s ease-in-out infinite alternate` : 'none',
                opacity: track.isPlaying ? 0.9 : 0.3,
              }}
            />
          ))}
        </div>
        <span className="text-[10px] font-black tracking-[0.15em]" style={{ color: '#1ed760' }}>
          {track.isPlaying ? 'NOW PLAYING' : 'PAUSED'}
        </span>
        <span className="text-[10px] ml-auto" style={{ color: 'rgba(30,215,96,0.4)' }}>via Spotify</span>
      </div>

      {/* Track info */}
      <div className="flex items-center gap-3 px-4 py-3">
        {track.albumArt ? (
          <img
            src={track.albumArt}
            alt={track.album ?? track.title}
            className="w-14 h-14 rounded-xl object-cover shrink-0"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
          />
        ) : (
          <div className="w-14 h-14 rounded-xl shrink-0 flex items-center justify-center text-2xl"
            style={{ background: 'rgba(30,215,96,0.08)' }}>
            🎵
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-black truncate" style={{ color: '#e0f2fe' }}>{track.title}</p>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(224,242,254,0.55)' }}>{track.artist}</p>
          {track.album && (
            <p className="text-[10px] mt-0.5 truncate" style={{ color: 'rgba(224,242,254,0.3)' }}>{track.album}</p>
          )}
        </div>

        {track.spotifyUrl && (
          <a
            href={track.spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full transition-all"
            style={{ background: 'rgba(30,215,96,0.1)', border: '1px solid rgba(30,215,96,0.25)' }}
            title="Open in Spotify"
          >
            {/* Spotify logo icon */}
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#1ed760">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0 01-.858.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 11-.277-1.215c3.809-.87 7.076-.496 9.713 1.115a.623.623 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 11-.543-1.794c3.532-1.072 9.404-.865 13.115 1.338a.937.937 0 01-1.055 1.613z"/>
            </svg>
          </a>
        )}
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.3)' }}>{formatMs(progressMs)}</span>
          <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.3)' }}>{formatMs(track.durationMs)}</span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #1ed760 0%, #3bf27f 100%)' }}
          />
        </div>
      </div>

      <style>{`
        @keyframes nowPlayingBar0 { from { transform: scaleY(0.3) } to { transform: scaleY(1) } }
        @keyframes nowPlayingBar1 { from { transform: scaleY(0.5) } to { transform: scaleY(0.8) } }
        @keyframes nowPlayingBar2 { from { transform: scaleY(0.2) } to { transform: scaleY(1) } }
        @keyframes nowPlayingBar3 { from { transform: scaleY(0.6) } to { transform: scaleY(0.4) } }
      `}</style>
    </div>
  )
}
