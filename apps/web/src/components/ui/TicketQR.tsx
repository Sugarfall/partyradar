'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Client-side QR rendering for ticket barcodes. Previously the API pre-rendered
 * PNG data URLs for every ticket in the list response, which blocked the
 * /tickets/my response on O(n) sync CPU work. Now the server returns only the
 * `qrCode` string and the browser paints it.
 */
interface TicketQRProps {
  qrCode: string
  size?: number
  dark?: string
  light?: string
  className?: string
}

export default function TicketQR({
  qrCode,
  size = 160,
  dark = '#7c3aed',
  light = '#04040d',
  className,
}: TicketQRProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!canvasRef.current) return
    import('qrcode').then((QRCode) => {
      if (cancelled || !canvasRef.current) return
      QRCode.toCanvas(canvasRef.current, qrCode, {
        width: size, margin: 2, color: { dark, light },
      }).catch(() => !cancelled && setFailed(true))
    }).catch(() => !cancelled && setFailed(true))
    return () => { cancelled = true }
  }, [qrCode, size, dark, light])

  if (failed) {
    return (
      <div
        className={className}
        style={{ width: size, height: size, display: 'grid', placeItems: 'center',
          fontFamily: 'monospace', fontSize: 10, color: '#94a3b8',
          background: light, borderRadius: 8 }}
      >
        QR FAILED
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={size}
      height={size}
      style={{ borderRadius: 8 }}
    />
  )
}
