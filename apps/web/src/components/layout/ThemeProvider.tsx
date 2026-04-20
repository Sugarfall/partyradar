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
    const accent = dbUser?.themeColor
    if (accent && accent.startsWith('#') && accent.length >= 7) {
      // User has a custom hex colour — apply it
      document.documentElement.style.setProperty('--accent', accent)
      document.documentElement.style.setProperty('--accent-rgb', hexToRgb(accent))
    } else {
      // No custom colour — remove overrides so globals.css defaults take effect
      document.documentElement.style.removeProperty('--accent')
      document.documentElement.style.removeProperty('--accent-rgb')
    }
  }, [dbUser?.themeColor])

  return null
}
