'use client'

/**
 * Last-resort error boundary — renders when the root layout itself crashes.
 * Must contain its own <html>/<body> because the normal layout is gone.
 * Keep CSS inline; global stylesheets may not load in this state.
 */
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[PartyRadar] GLOBAL error:', error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#04040d', color: '#e0f2fe', fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
        }}>
          <div style={{
            maxWidth: 380,
            background: 'rgba(8,12,24,0.95)',
            border: '1px solid rgba(255,0,110,0.3)',
            borderRadius: 16,
            padding: '32px 28px',
          }}>
            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.25em', color: 'rgba(255,0,110,0.8)', marginBottom: 12 }}>
              CRITICAL FAILURE
            </p>
            <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>
              The app hit an unexpected error.
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(224,242,254,0.55)', margin: '0 0 24px', lineHeight: 1.5 }}>
              Reload the page to try again. If this keeps happening, please let support know.
            </p>
            {error?.digest && (
              <p style={{
                fontSize: 10,
                fontFamily: 'monospace',
                color: 'rgba(255,0,110,0.6)',
                background: 'rgba(255,0,110,0.06)',
                border: '1px solid rgba(255,0,110,0.15)',
                padding: '8px 10px',
                borderRadius: 6,
                marginBottom: 20,
                wordBreak: 'break-all',
              }}>
                Ref: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, rgba(120,80,220,0.25), rgba(60,90,200,0.2))',
                border: '1px solid rgba(120,80,220,0.55)',
                color: '#e0f2fe',
                fontWeight: 900,
                fontSize: 13,
                letterSpacing: '0.14em',
                cursor: 'pointer',
              }}
            >
              RELOAD APP
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
