'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, ScanLine, Keyboard, Check, X, Loader2, Hash } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useEvent } from '@/hooks/useEvents'
import { api } from '@/lib/api'

const QRScanner = dynamic(
  () => import('@/components/events/QRScanner').then((m) => m.QRScanner),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 rounded-2xl flex items-center justify-center gap-3"
        style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.1)' }}>
        <div className="w-5 h-5 border-2 rounded-full animate-spin"
          style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
        <span className="text-xs font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.4)' }}>LOADING CAMERA...</span>
      </div>
    ),
  }
)

interface ScanResult {
  valid: boolean
  ticket: {
    id: string
    scannedAt: string
    user: { displayName: string; username: string; photoUrl?: string }
  }
}

export default function ScanPage() {
  const params = useParams()
  const { dbUser } = useAuth()
  const { event } = useEvent(params['id'] as string)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [useCameraMode, setUseCameraMode] = useState(true)
  const [lastScanned, setLastScanned] = useState('')
  const [scanCount, setScanCount] = useState(0)

  if (!dbUser || (event && event.hostId !== dbUser.id)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#04040d' }}>
        <div className="text-center space-y-3">
          <div className="text-4xl">🚫</div>
          <p className="text-sm font-bold tracking-widest" style={{ color: '#ff006e' }}>ACCESS DENIED</p>
          <p className="text-xs" style={{ color: 'rgba(74,96,128,0.6)' }}>Hosts only</p>
        </div>
      </div>
    )
  }

  async function handleScan(qrCode: string) {
    if (scanning || qrCode === lastScanned) return
    setLastScanned(qrCode)
    setScanning(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.post<{ data: ScanResult }>('/tickets/scan', { qrCode })
      setResult(res.data)
      if (res.data.valid) setScanCount((c) => c + 1)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid or already scanned ticket')
    } finally {
      setScanning(false)
      setTimeout(() => setLastScanned(''), 3000)
    }
  }

  function handleReset() {
    setResult(null)
    setError(null)
    setManualCode('')
  }

  return (
    <div className="min-h-screen pb-24 px-4 py-6 max-w-sm mx-auto" style={{ background: '#04040d' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link href={`/events/${params['id']}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold"
          style={{ color: 'rgba(0,229,255,0.5)' }}>
          <ArrowLeft size={13} /> BACK
        </Link>

        {/* Scan counter */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full"
          style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)' }}>
          <Hash size={10} style={{ color: 'rgba(0,229,255,0.5)' }} />
          <span className="text-[10px] font-black tracking-widest" style={{ color: '#00e5ff' }}>
            {scanCount} SCANNED
          </span>
        </div>
      </div>

      {/* Title */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-3"
          style={{ border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,229,255,0.05)' }}>
          <ScanLine size={10} style={{ color: '#00e5ff' }} />
          <span className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.7)' }}>TICKET SCANNER</span>
        </div>
        <h1 className="text-2xl font-black" style={{ color: '#e0f2fe' }}>SCAN TICKETS</h1>
        {event && (
          <p className="text-xs mt-1 font-bold tracking-wide" style={{ color: 'rgba(0,229,255,0.4)' }}>
            {event.name.toUpperCase()}
          </p>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-5 p-1 rounded-xl" style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(0,229,255,0.1)' }}>
        <button
          onClick={() => { setUseCameraMode(true); handleReset() }}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black transition-all"
          style={{
            background: useCameraMode ? 'rgba(0,229,255,0.1)' : 'transparent',
            border: useCameraMode ? '1px solid rgba(0,229,255,0.3)' : '1px solid transparent',
            color: useCameraMode ? '#00e5ff' : 'rgba(74,96,128,0.6)',
            letterSpacing: '0.1em',
          }}>
          <ScanLine size={12} /> CAMERA
        </button>
        <button
          onClick={() => { setUseCameraMode(false); handleReset() }}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black transition-all"
          style={{
            background: !useCameraMode ? 'rgba(0,229,255,0.1)' : 'transparent',
            border: !useCameraMode ? '1px solid rgba(0,229,255,0.3)' : '1px solid transparent',
            color: !useCameraMode ? '#00e5ff' : 'rgba(74,96,128,0.6)',
            letterSpacing: '0.1em',
          }}>
          <Keyboard size={12} /> MANUAL
        </button>
      </div>

      {/* Camera mode */}
      {useCameraMode && (
        <div className="mb-5">
          <div className="relative rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(0,229,255,0.15)', boxShadow: '0 0 30px rgba(0,229,255,0.05)' }}>
            {/* Corner brackets overlay */}
            <div className="absolute inset-0 pointer-events-none z-10">
              <div className="absolute top-4 left-4 w-6 h-6" style={{ borderTop: '2px solid #00e5ff', borderLeft: '2px solid #00e5ff', opacity: 0.8 }} />
              <div className="absolute top-4 right-4 w-6 h-6" style={{ borderTop: '2px solid #00e5ff', borderRight: '2px solid #00e5ff', opacity: 0.8 }} />
              <div className="absolute bottom-4 left-4 w-6 h-6" style={{ borderBottom: '2px solid #00e5ff', borderLeft: '2px solid #00e5ff', opacity: 0.8 }} />
              <div className="absolute bottom-4 right-4 w-6 h-6" style={{ borderBottom: '2px solid #00e5ff', borderRight: '2px solid #00e5ff', opacity: 0.8 }} />
            </div>
            <QRScanner onScan={handleScan} />
          </div>

          {scanning ? (
            <div className="mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl"
              style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.2)' }}>
              <Loader2 size={13} className="animate-spin" style={{ color: '#00e5ff' }} />
              <span className="text-[10px] font-black tracking-widest" style={{ color: '#00e5ff' }}>VALIDATING...</span>
            </div>
          ) : (
            <p className="text-center text-[10px] mt-3 font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>
              POINT CAMERA AT QR CODE
            </p>
          )}
        </div>
      )}

      {/* Manual mode */}
      {!useCameraMode && (
        <div className="mb-5 space-y-3">
          <div className="relative">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && manualCode && handleScan(manualCode)}
              placeholder="PASTE TICKET UUID..."
              className="w-full px-4 py-3.5 rounded-xl font-mono text-sm outline-none transition-all"
              style={{
                background: 'rgba(0,229,255,0.04)',
                border: '1px solid rgba(0,229,255,0.2)',
                color: '#e0f2fe',
                letterSpacing: '0.05em',
              }}
            />
          </div>
          <button
            onClick={() => handleScan(manualCode)}
            disabled={!manualCode || scanning}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm transition-all disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, rgba(0,229,255,0.15), rgba(0,229,255,0.08))',
              border: '1px solid rgba(0,229,255,0.4)',
              color: '#00e5ff',
              letterSpacing: '0.1em',
              boxShadow: '0 0 20px rgba(0,229,255,0.1)',
            }}>
            {scanning
              ? <><Loader2 size={14} className="animate-spin" /> VALIDATING...</>
              : <><ScanLine size={14} /> VALIDATE TICKET</>
            }
          </button>
        </div>
      )}

      {/* Valid result */}
      {result?.valid && (
        <div className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(0,255,136,0.4)', boxShadow: '0 0 30px rgba(0,255,136,0.1)' }}>
          <div className="h-1" style={{ background: 'linear-gradient(90deg, transparent, #00ff88, transparent)' }} />
          <div className="p-5" style={{ background: 'rgba(0,255,136,0.05)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.4)' }}>
                <Check size={20} style={{ color: '#00ff88' }} />
              </div>
              <div>
                <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(0,255,136,0.6)' }}>TICKET VALID</p>
                <p className="text-lg font-black leading-tight" style={{ color: '#e0f2fe' }}>
                  {result.ticket.user.displayName}
                </p>
                <p className="text-xs" style={{ color: 'rgba(0,255,136,0.5)' }}>@{result.ticket.user.username}</p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="w-full py-2.5 rounded-xl text-xs font-black transition-all"
              style={{
                background: 'rgba(0,255,136,0.1)',
                border: '1px solid rgba(0,255,136,0.3)',
                color: '#00ff88',
                letterSpacing: '0.12em',
              }}>
              SCAN NEXT →
            </button>
          </div>
        </div>
      )}

      {/* Invalid / error result */}
      {(error || (result && !result.valid)) && (
        <div className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(255,0,110,0.4)', boxShadow: '0 0 30px rgba(255,0,110,0.1)' }}>
          <div className="h-1" style={{ background: 'linear-gradient(90deg, transparent, #ff006e, transparent)' }} />
          <div className="p-5" style={{ background: 'rgba(255,0,110,0.05)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,0,110,0.15)', border: '1px solid rgba(255,0,110,0.4)' }}>
                <X size={20} style={{ color: '#ff006e' }} />
              </div>
              <div>
                <p className="text-[10px] font-black tracking-widest" style={{ color: 'rgba(255,0,110,0.6)' }}>INVALID TICKET</p>
                <p className="text-sm font-bold" style={{ color: 'rgba(255,0,110,0.8)' }}>
                  {error ?? 'Ticket already used or not found'}
                </p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="w-full py-2.5 rounded-xl text-xs font-black transition-all"
              style={{
                background: 'rgba(255,0,110,0.1)',
                border: '1px solid rgba(255,0,110,0.3)',
                color: '#ff006e',
                letterSpacing: '0.12em',
              }}>
              TRY AGAIN →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
