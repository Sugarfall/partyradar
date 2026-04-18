'use client'

import { useState } from 'react'
import { MapPin, Check } from 'lucide-react'

import { API_URL as API_BASE } from '@/lib/api'

type CrowdLevel = 'QUIET' | 'BUSY' | 'RAMMED'

interface CheckInButtonProps {
  eventId?: string
  venueId?: string
  venueName?: string
}

const CROWD_OPTIONS: { level: CrowdLevel; label: string; dot: string; color: string }[] = [
  { level: 'QUIET',  label: 'QUIET',  dot: '🟢', color: '#00ff88' },
  { level: 'BUSY',   label: 'BUSY',   dot: '🟡', color: '#ffd600' },
  { level: 'RAMMED', label: 'RAMMED', dot: '🔴', color: '#ff006e' },
]

export default function CheckInButton({ eventId, venueId, venueName }: CheckInButtonProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [selected, setSelected] = useState<CrowdLevel | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleCheckIn() {
    if (!selected || loading) return
    setLoading(true)
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('partyradar_mock_session') ?? ''
        : ''

      if (!token) {
        // Dev mode / no auth — mock success after 500ms
        await new Promise((r) => setTimeout(r, 500))
      } else {
        await fetch(`${API_BASE}/checkins`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, venueId, crowdLevel: selected }),
        })
      }
      setDone(true)
      setPanelOpen(false)
    } catch {
      setDone(true) // show success anyway (optimistic)
      setPanelOpen(false)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black"
        style={{
          background: 'rgba(0,255,136,0.08)',
          border: '1px solid rgba(0,255,136,0.3)',
          color: '#00ff88',
          letterSpacing: '0.1em',
        }}
      >
        <Check size={13} /> CHECKED IN
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Trigger button */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all duration-200"
          style={{
            background: 'rgba(var(--accent-rgb),0.07)',
            border: '1px solid rgba(var(--accent-rgb),0.25)',
            color: 'var(--accent)',
            letterSpacing: '0.1em',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(var(--accent-rgb),0.12)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(var(--accent-rgb),0.07)' }}
        >
          <MapPin size={13} /> CHECK IN
        </button>
      )}

      {/* Inline crowd picker */}
      {panelOpen && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'rgba(7,7,26,0.97)',
            border: '1px solid rgba(var(--accent-rgb),0.2)',
            boxShadow: '0 0 24px rgba(0,0,0,0.6)',
          }}
        >
          <div
            className="px-3 py-2 flex items-center gap-2"
            style={{ borderBottom: '1px solid rgba(var(--accent-rgb),0.08)' }}
          >
            <MapPin size={11} style={{ color: 'var(--accent)' }} />
            <span className="text-[10px] font-black tracking-widest" style={{ color: 'var(--accent)' }}>
              {venueName ? `CHECK IN @ ${venueName.toUpperCase()}` : 'HOW BUSY IS IT?'}
            </span>
          </div>

          <div className="p-2 flex gap-2">
            {CROWD_OPTIONS.map(({ level, label, dot, color }) => (
              <button
                key={level}
                onClick={() => setSelected(level)}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg text-[10px] font-black transition-all duration-150"
                style={{
                  background: selected === level ? `${color}15` : 'rgba(var(--accent-rgb),0.03)',
                  border: selected === level ? `1px solid ${color}60` : '1px solid rgba(var(--accent-rgb),0.1)',
                  color: selected === level ? color : 'rgba(224,242,254,0.45)',
                  letterSpacing: '0.1em',
                  boxShadow: selected === level ? `0 0 10px ${color}25` : 'none',
                }}
              >
                <span className="text-base">{dot}</span>
                {label}
              </button>
            ))}
          </div>

          <div className="px-2 pb-2 flex gap-2">
            <button
              onClick={() => { setPanelOpen(false); setSelected(null) }}
              className="flex-1 py-2 rounded-lg text-[10px] font-bold"
              style={{ border: '1px solid rgba(var(--accent-rgb),0.1)', color: 'rgba(74,96,128,0.6)' }}
            >
              CANCEL
            </button>
            <button
              onClick={handleCheckIn}
              disabled={!selected || loading}
              className="flex-1 py-2 rounded-lg text-[10px] font-black transition-all duration-200 disabled:opacity-40"
              style={{
                background: selected ? 'rgba(var(--accent-rgb),0.12)' : 'transparent',
                border: selected ? '1px solid rgba(var(--accent-rgb),0.4)' : '1px solid rgba(var(--accent-rgb),0.1)',
                color: selected ? 'var(--accent)' : 'rgba(74,96,128,0.5)',
                letterSpacing: '0.1em',
              }}
            >
              {loading ? (
                <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mx-auto" />
              ) : (
                'CHECK IN →'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
