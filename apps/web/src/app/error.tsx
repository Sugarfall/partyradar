'use client'

import { useEffect } from 'react'
import { Zap, RefreshCw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[PartyRadar] Unhandled page error:', error)
  }, [error])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
      style={{ background: '#04040d' }}
    >
      <div className="flex items-center gap-3 mb-8">
        <Zap
          size={26}
          fill="rgba(0,229,255,0.2)"
          style={{ color: '#00e5ff', filter: 'drop-shadow(0 0 10px rgba(0,229,255,0.9))' }}
        />
        <span className="font-black text-xl tracking-[0.3em]" style={{ color: '#00e5ff' }}>
          PARTYRADAR
        </span>
      </div>

      <div
        className="w-full max-w-sm text-center"
        style={{
          background: 'rgba(8,12,24,0.95)',
          border: '1px solid rgba(255,0,110,0.25)',
          borderRadius: 16,
          padding: '32px 28px',
        }}
      >
        <p className="text-xs font-black tracking-[0.2em] mb-3" style={{ color: 'rgba(255,0,110,0.7)' }}>
          SIGNAL LOST
        </p>
        <p className="text-sm mb-6" style={{ color: 'rgba(224,242,254,0.5)' }}>
          Something went wrong loading the app. Tap retry to reconnect.
        </p>
        <button
          onClick={reset}
          className="w-full py-3 rounded-lg font-black text-sm flex items-center justify-center gap-2 transition-all"
          style={{
            background: 'linear-gradient(135deg, rgba(0,229,255,0.2), rgba(61,90,254,0.2))',
            border: '1px solid rgba(0,229,255,0.55)',
            color: '#00e5ff',
            letterSpacing: '0.14em',
          }}
        >
          <RefreshCw size={14} /> RETRY
        </button>
      </div>
    </div>
  )
}
