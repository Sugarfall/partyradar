'use client'

import { useState, useEffect } from 'react'
import { Zap, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Don't show if already installed or dismissed
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      localStorage.getItem('pwa-prompt-dismissed')
    ) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Show after 20s on first visit, 5s on return visits
      const visits = Number(localStorage.getItem('pwa-visits') || 0) + 1
      localStorage.setItem('pwa-visits', String(visits))
      const delay = visits === 1 ? 20000 : 5000
      setTimeout(() => setVisible(true), delay)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
      setDeferredPrompt(null)
    }
  }

  function handleDismiss() {
    setVisible(false)
    localStorage.setItem('pwa-prompt-dismissed', '1')
  }

  if (!visible) return null

  return (
    <div
      className="fixed z-[60] left-4 right-4 flex items-center gap-3 px-4 py-3 rounded-2xl"
      style={{
        bottom: 80, // above mobile nav
        background: 'rgba(4,4,13,0.97)',
        border: '1px solid rgba(var(--accent-rgb),0.3)',
        boxShadow: '0 0 30px rgba(var(--accent-rgb),0.15), 0 8px 32px rgba(0,0,0,0.8)',
        backdropFilter: 'blur(20px)',
        animation: 'slideUp 0.3s ease',
      }}
    >
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }`}</style>

      {/* Icon */}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
        <Zap size={18} style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 6px rgba(var(--accent-rgb),0.8))' }} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black tracking-widest" style={{ color: 'var(--accent)' }}>ADD TO HOME SCREEN</p>
        <p className="text-[10px] mt-0.5" style={{ color: 'rgba(224,242,254,0.5)' }}>Get the full app experience ⚡</p>
      </div>

      {/* Install CTA */}
      <button
        onClick={handleInstall}
        className="px-3 py-1.5 rounded-lg text-[11px] font-black tracking-wider shrink-0"
        style={{ background: 'var(--accent)', color: '#04040d' }}
      >
        INSTALL
      </button>

      {/* Dismiss */}
      <button onClick={handleDismiss} style={{ color: 'rgba(74,96,128,0.6)' }}>
        <X size={16} />
      </button>
    </div>
  )
}
