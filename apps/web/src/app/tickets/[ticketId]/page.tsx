'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, MapPin, Download, Share2, Check, Zap } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import type { Ticket } from '@partyradar/shared'
import { formatPrice } from '@/lib/currency'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  })
}

const TYPE_COLOR: Record<string, string> = {
  HOME_PARTY: '#ff006e',
  CLUB_NIGHT:  '#00e5ff',
  CONCERT:     '#3d5afe',
  PUB_NIGHT:   '#f59e0b',
}

export default function TicketPage() {
  const params = useParams()
  const router = useRouter()
  const { dbUser, loading: authLoading } = useAuth()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [qrGenerated, setQrGenerated] = useState(false)

  useEffect(() => {
    if (!authLoading && !dbUser) router.push('/login')
  }, [authLoading, dbUser, router])

  useEffect(() => {
    if (!dbUser) return
    api.get<{ data: Ticket }>(`/tickets/${params['ticketId']}`)
      .then((r) => setTicket(r.data))
      .catch(() => setError('TICKET NOT FOUND'))
      .finally(() => setIsLoading(false))
  }, [dbUser, params])

  // Generate QR code onto canvas
  useEffect(() => {
    if (!ticket || !canvasRef.current) return
    import('qrcode').then((QRCode) => {
      QRCode.toCanvas(canvasRef.current!, ticket.qrCode, {
        width: 220,
        margin: 2,
        color: {
          dark: '#00e5ff',
          light: '#04040d',
        },
      }).then(() => setQrGenerated(true))
    })
  }, [ticket])

  async function handleShare() {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My Ticket', url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {}
  }

  function handleDownload() {
    if (!canvasRef.current) return
    const link = document.createElement('a')
    link.download = `partyradar-ticket-${ticket?.id}.png`
    link.href = canvasRef.current.toDataURL()
    link.click()
  }

  const color = TYPE_COLOR[ticket?.event?.type ?? 'CLUB_NIGHT'] ?? '#00e5ff'

  if (authLoading || (!dbUser && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-2 rounded-full animate-spin"
          style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
      </div>
    )
  }

  if (error || (!isLoading && !ticket)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm font-bold tracking-widest" style={{ color: '#ff006e' }}>TICKET NOT FOUND</p>
        <Link href="/profile" className="text-xs font-bold px-4 py-2 rounded-lg"
          style={{ border: '1px solid rgba(0,229,255,0.3)', color: '#00e5ff' }}>← MY TICKETS</Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-2 rounded-full animate-spin"
          style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
        <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.5)' }}>LOADING TICKET...</p>
      </div>
    )
  }

  const isFree = ticket!.pricePaid === 0
  const isScanned = !!ticket!.scannedAt

  return (
    <div className="min-h-screen pb-28 px-4 py-6 max-w-sm mx-auto" style={{ background: '#04040d' }}>
      {/* Back */}
      <Link href="/profile" className="inline-flex items-center gap-1.5 text-xs font-bold mb-6"
        style={{ color: 'rgba(0,229,255,0.5)' }}>
        <ArrowLeft size={13} /> MY TICKETS
      </Link>

      {/* ── Ticket card ── */}
      <div
        className="rounded-3xl overflow-hidden relative"
        style={{
          background: 'rgba(7,7,26,0.95)',
          border: `1px solid ${color}30`,
          boxShadow: `0 0 60px ${color}12, 0 0 0 1px ${color}15`,
        }}
      >
        {/* Top colour stripe */}
        <div className="h-1.5" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)`, boxShadow: `0 0 16px ${color}` }} />

        {/* Event info header */}
        <div className="px-6 pt-5 pb-4">
          <p className="text-[9px] font-bold tracking-[0.25em] mb-1" style={{ color: `${color}80` }}>
            {ticket!.event.type?.replace('_', ' ')}
          </p>
          <h1 className="text-xl font-black leading-tight" style={{ color: '#e0f2fe' }}>
            {ticket!.event.name}
          </h1>
          <div className="flex flex-col gap-1 mt-3">
            <p className="text-xs flex items-center gap-1.5" style={{ color: 'rgba(224,242,254,0.5)' }}>
              <Calendar size={11} style={{ color: `${color}60` }} />
              {formatDate(ticket!.event.startsAt)}
            </p>
            <p className="text-xs flex items-center gap-1.5" style={{ color: 'rgba(224,242,254,0.5)' }}>
              <MapPin size={11} style={{ color: `${color}60` }} />
              {ticket!.event.address ?? ticket!.event.neighbourhood}
            </p>
          </div>
        </div>

        {/* Perforated divider */}
        <div className="relative flex items-center px-4 my-1">
          <div className="w-5 h-5 rounded-full -ml-7" style={{ background: '#04040d', border: `1px solid ${color}20` }} />
          <div className="flex-1 border-t-2 border-dashed" style={{ borderColor: `${color}20` }} />
          <div className="w-5 h-5 rounded-full -mr-7" style={{ background: '#04040d', border: `1px solid ${color}20` }} />
        </div>

        {/* QR Code section */}
        <div className="flex flex-col items-center px-6 pt-5 pb-6 gap-4">
          {/* Status badge */}
          {isScanned ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(255,0,110,0.1)', border: '1px solid rgba(255,0,110,0.3)' }}>
              <div className="w-2 h-2 rounded-full" style={{ background: '#ff006e' }} />
              <span className="text-[10px] font-bold tracking-widest" style={{ color: '#ff006e' }}>
                SCANNED · {formatDate(ticket!.scannedAt!)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full animate-pulse"
              style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)' }}>
              <div className="w-2 h-2 rounded-full" style={{ background: '#00ff88', boxShadow: '0 0 6px rgba(0,255,136,0.8)' }} />
              <span className="text-[10px] font-bold tracking-widest" style={{ color: '#00ff88' }}>VALID · READY TO SCAN</span>
            </div>
          )}

          {/* QR canvas */}
          <div
            className="relative p-3 rounded-2xl"
            style={{
              background: '#04040d',
              border: `1px solid ${color}25`,
              boxShadow: qrGenerated ? `0 0 30px ${color}20` : 'none',
              opacity: isScanned ? 0.4 : 1,
            }}
          >
            <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 8 }} />
            {isScanned && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl"
                style={{ background: 'rgba(4,4,13,0.7)' }}>
                <div className="text-center">
                  <Check size={32} style={{ color: '#ff006e', margin: '0 auto 4px' }} />
                  <p className="text-[10px] font-bold" style={{ color: '#ff006e' }}>USED</p>
                </div>
              </div>
            )}
          </div>

          {/* Ticket ID */}
          <p className="font-mono text-[10px] tracking-widest" style={{ color: 'rgba(0,229,255,0.3)' }}>
            {ticket!.qrCode.toUpperCase().slice(0, 24)}...
          </p>

          {/* Price paid */}
          <div className="w-full flex items-center justify-between px-2 py-3 rounded-xl"
            style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.08)' }}>
            <span className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(0,229,255,0.4)' }}>PAID</span>
            <span className="text-lg font-black"
              style={{ color: isFree ? '#00ff88' : '#e0f2fe', textShadow: isFree ? '0 0 12px rgba(0,255,136,0.5)' : 'none' }}>
              {formatPrice(ticket!.pricePaid)}
            </span>
          </div>
        </div>

        {/* Bottom stripe */}
        <div className="h-1.5" style={{ background: `linear-gradient(90deg, transparent, ${color}50, transparent)` }} />
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mt-5">
        <button onClick={handleDownload}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs transition-all duration-200"
          style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff', letterSpacing: '0.1em' }}>
          <Download size={13} /> SAVE
        </button>
        <button onClick={handleShare}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs transition-all duration-200"
          style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.2)', color: copied ? '#00ff88' : '#00e5ff', letterSpacing: '0.1em' }}>
          {copied ? <><Check size={13} /> COPIED</> : <><Share2 size={13} /> SHARE</>}
        </button>
      </div>

      {/* View event link */}
      <Link href={`/events/${ticket!.eventId}`}
        className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all duration-200"
        style={{ background: `linear-gradient(135deg, ${color}15, rgba(61,90,254,0.1))`, border: `1px solid ${color}35`, color, letterSpacing: '0.08em' }}>
        <Zap size={14} /> VIEW EVENT
      </Link>
    </div>
  )
}
