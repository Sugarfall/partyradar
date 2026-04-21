'use client'

import { useState, useEffect } from 'react'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { loginHref } from '@/lib/authRedirect'

interface Props {
  eventId: string
  size?: 'sm' | 'md'
}

export default function SaveButton({ eventId, size = 'md' }: Props) {
  const { dbUser } = useAuth()
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!dbUser) return
    api.get<{ data: { saved: boolean } }>(`/events/${eventId}/save`)
      .then(r => setSaved(r.data.saved))
      .catch(() => {})
  }, [eventId, dbUser])

  async function toggle() {
    if (!dbUser) { router.push(loginHref()); return }
    setSaved(s => !s) // optimistic
    setLoading(true)
    try {
      if (saved) {
        await api.delete(`/events/${eventId}/save`)
      } else {
        await api.post(`/events/${eventId}/save`, {})
      }
    } catch {
      setSaved(s => !s) // revert
    } finally {
      setLoading(false)
    }
  }

  const iconSize = size === 'sm' ? 14 : 16

  return (
    <button
      onClick={toggle}
      disabled={loading}
      aria-label={saved ? 'Unsave event' : 'Save event'}
      className="flex items-center justify-center rounded-lg transition-all duration-150 disabled:opacity-50"
      style={{
        width: size === 'sm' ? 32 : 36,
        height: size === 'sm' ? 32 : 36,
        background: saved ? 'rgba(255,214,0,0.1)' : 'rgba(255,255,255,0.04)',
        border: saved ? '1px solid rgba(255,214,0,0.35)' : '1px solid rgba(255,255,255,0.1)',
        color: saved ? '#ffd600' : 'rgba(255,255,255,0.4)',
      }}
    >
      {saved
        ? <BookmarkCheck size={iconSize} fill="currentColor" />
        : <Bookmark size={iconSize} />}
    </button>
  )
}
