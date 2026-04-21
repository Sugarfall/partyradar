'use client'

/**
 * Lightweight toast system.
 *
 *   import { toast } from '@/components/ui/Toast'
 *   toast.success('Saved')
 *   toast.error('Network error — try again')
 *
 * The provider is mounted once in RootLayout via <ToastHost />.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

interface ToastCtx {
  push: (kind: ToastKind, text: string) => void
}

const Ctx = createContext<ToastCtx | null>(null)

let pushExternal: ((kind: ToastKind, text: string) => void) | null = null

/**
 * Imperative helper — usable from anywhere (including non-React code paths
 * such as API error handlers). Calls become no-ops if the host hasn't mounted.
 */
export const toast = {
  success: (text: string) => pushExternal?.('success', text),
  error:   (text: string) => pushExternal?.('error',   text),
  info:    (text: string) => pushExternal?.('info',    text),
}

/** Hook form — useful inside components for consistency with other hooks. */
export function useToast() {
  const ctx = useContext(Ctx)
  return {
    success: (t: string) => ctx?.push('success', t),
    error:   (t: string) => ctx?.push('error', t),
    info:    (t: string) => ctx?.push('info', t),
  }
}

export function ToastHost({ children }: { children?: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const push = useCallback((kind: ToastKind, text: string) => {
    const id = ++counter.current
    setItems((prev) => [...prev, { id, kind, text }])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, kind === 'error' ? 5000 : 3500)
  }, [])

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    pushExternal = push
    return () => { pushExternal = null }
  }, [push])

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        className="fixed z-[9999] bottom-20 left-1/2 -translate-x-1/2 flex flex-col gap-2 items-center pointer-events-none"
        style={{ width: 'min(92vw, 420px)' }}
      >
        {items.map((t) => {
          const accent =
            t.kind === 'success' ? '#00ff88'
            : t.kind === 'error' ? '#ff006e'
            : 'var(--accent)'
          const Icon =
            t.kind === 'success' ? CheckCircle2
            : t.kind === 'error' ? AlertTriangle
            : Info
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto w-full flex items-start gap-3 px-4 py-3 rounded-xl animate-fade-up"
              style={{
                background: 'rgba(7,7,26,0.95)',
                border: `1px solid ${accent}55`,
                boxShadow: `0 8px 30px rgba(0,0,0,0.45), 0 0 18px ${accent}22`,
                color: '#e0f2fe',
                backdropFilter: 'blur(16px)',
              }}
            >
              <Icon size={18} style={{ color: accent, flexShrink: 0, marginTop: 1 }} />
              <p className="flex-1 text-sm font-medium leading-snug break-words">{t.text}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="opacity-60 hover:opacity-100 transition"
                style={{ color: '#e0f2fe' }}
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}
