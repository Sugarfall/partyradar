'use client'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'

export function ThemeProvider() {
  const { dbUser } = useAuth()
  useEffect(() => {
    const color = dbUser?.themeColor ?? '#00e5ff'
    document.documentElement.style.setProperty('--accent', color)
    // Derive --accent-rgb from the hex so rgba(var(--accent-rgb),0.x) works everywhere
    const hex = color.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    if (!isNaN(r + g + b)) {
      document.documentElement.style.setProperty('--accent-rgb', `${r},${g},${b}`)
    }
  }, [dbUser?.themeColor])
  return null
}
