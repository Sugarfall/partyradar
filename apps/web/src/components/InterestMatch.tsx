'use client'

import { useState, useEffect } from 'react'
import { DEV_MODE } from '@/lib/firebase'
import { Zap, X, UserCircle2 } from 'lucide-react'

interface InterestMatchProps {
  /** eventId for real-mode checkin calls */
  eventId?: string
  /** Delay in ms before showing the toast in DEV_MODE (default: 10000) */
  devDelay?: number
}

export default function InterestMatch({ eventId: _eventId, devDelay = 10000 }: InterestMatchProps) {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!DEV_MODE) return
    if (dismissed) return

    const t = setTimeout(() => {
      setVisible(true)
    }, devDelay)

    return () => clearTimeout(t)
  }, [devDelay, dismissed])

  function handleDismiss() {
    setVisible(false)
    setDismissed(true)
  }

  function handleViewProfile() {
    // In real mode this would navigate to the matched user's profile
    handleDismiss()
  }

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 72,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        width: 'calc(100vw - 32px)',
        maxWidth: 420,
        background: '#04040d',
        border: '1px solid rgba(0,229,255,0.4)',
        borderRadius: 14,
        boxShadow: '0 0 30px rgba(0,229,255,0.15), 0 8px 32px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        animation: 'interestMatchSlideIn 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      {/* Glow top edge */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: 'linear-gradient(90deg, transparent, #00e5ff, rgba(255,0,110,0.8), #00e5ff, transparent)',
        }}
      />

      <div style={{ padding: '14px 16px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(0,229,255,0.1)',
                border: '1px solid rgba(0,229,255,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Zap size={16} style={{ color: '#00e5ff' }} />
            </div>
            <div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: '0.2em',
                  color: '#00e5ff',
                  marginBottom: 1,
                }}
              >
                INTEREST MATCH
              </p>
              <p
                style={{
                  fontSize: 9,
                  color: 'rgba(0,229,255,0.4)',
                  letterSpacing: '0.06em',
                }}
              >
                Someone at this event matches your vibe
              </p>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(0,229,255,0.3)',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Match info */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(0,229,255,0.04)',
            border: '1px solid rgba(0,229,255,0.1)',
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255,0,110,0.1)',
              border: '1px solid rgba(255,0,110,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <UserCircle2 size={18} style={{ color: 'rgba(255,0,110,0.6)' }} />
          </div>
          <p style={{ fontSize: 13, color: '#e0f2fe', lineHeight: 1.4 }}>
            Someone at this event also loves{' '}
            <span style={{ color: '#00e5ff', fontWeight: 700 }}>techno</span> &amp;{' '}
            <span style={{ color: '#00e5ff', fontWeight: 700 }}>underground raves</span>
          </p>
        </div>

        {/* CTA row */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleViewProfile}
            style={{
              flex: 1,
              padding: '9px 0',
              borderRadius: 9,
              background: 'linear-gradient(135deg, rgba(0,229,255,0.15), rgba(0,229,255,0.08))',
              border: '1px solid rgba(0,229,255,0.4)',
              color: '#00e5ff',
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '0.12em',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            VIEW PROFILE
          </button>
          <button
            onClick={handleDismiss}
            style={{
              flex: 1,
              padding: '9px 0',
              borderRadius: 9,
              background: 'transparent',
              border: '1px solid rgba(74,96,128,0.25)',
              color: 'rgba(74,96,128,0.7)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            DISMISS
          </button>
        </div>
      </div>

      <style>{`
        @keyframes interestMatchSlideIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}
