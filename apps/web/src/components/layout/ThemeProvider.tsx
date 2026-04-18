'use client'

import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

export function ThemeProvider() {
  const { dbUser } = useAuth()

  useEffect(() => {
    const accent = dbUser?.themeColor ?? 'var(--accent)'
    document.documentElement.style.setProperty('--accent', accent)
    // Provide RGB version for rgba() usage
    if (accent.startsWith('#') && accent.length >= 7) {
      document.documentElement.style.setProperty('--accent-rgb', hexToRgb(accent))
    }
  }, [dbUser?.themeColor])

  return null
}
