'use client'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'

export function ThemeProvider() {
  const { dbUser } = useAuth()
  useEffect(() => {
    const color = dbUser?.themeColor ?? '#00e5ff'
    document.documentElement.style.setProperty('--accent', color)
  }, [dbUser?.themeColor])
  return null
}
