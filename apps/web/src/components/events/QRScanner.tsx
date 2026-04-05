'use client'

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface QRScannerProps {
  onScan: (result: string) => void
  onError?: (error: string) => void
}

export function QRScanner({ onScan, onError }: QRScannerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [started, setStarted] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    const scannerId = 'qr-scanner-container'
    const scanner = new Html5Qrcode(scannerId)
    scannerRef.current = scanner

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (decodedText) => {
        onScan(decodedText)
      },
      () => { /* ignore per-frame errors */ }
    )
      .then(() => setStarted(true))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Camera access denied'
        setCameraError(msg)
        onError?.(msg)
      })

    return () => {
      scanner.isScanning && scanner.stop().catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <div
        id="qr-scanner-container"
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden"
        style={{ minHeight: 280 }}
      />

      {!started && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-elevated rounded-xl">
          <p className="text-zinc-500 text-sm">Starting camera...</p>
        </div>
      )}

      {cameraError && (
        <div className="w-full h-64 flex items-center justify-center bg-bg-elevated rounded-xl border border-red-500/30">
          <div className="text-center px-4">
            <p className="text-red-400 text-sm font-medium mb-1">Camera unavailable</p>
            <p className="text-zinc-500 text-xs">{cameraError}</p>
          </div>
        </div>
      )}
    </div>
  )
}
