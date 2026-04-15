'use client'

import { useState } from 'react'
import { UserPlus, UserCheck, UserMinus } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

interface FollowButtonProps {
  userId: string
  initialFollowing?: boolean
  size?: 'sm' | 'md'
}

export default function FollowButton({ userId, initialFollowing = false, size = 'sm' }: FollowButtonProps) {
  const { dbUser } = useAuth()
  const [following, setFollowing] = useState(initialFollowing)
  const [hover, setHover] = useState(false)
  const [loading, setLoading] = useState(false)

  // Don't show follow button for own profile or when not logged in
  if (!dbUser || dbUser.id === userId) return null

  async function handleToggle() {
    if (loading) return
    const prev = following
    setFollowing(!prev)
    setLoading(true)
    try {
      if (prev) {
        await api.delete(`/follow/${userId}`)
      } else {
        await api.post(`/follow/${userId}`)
      }
    } catch {
      setFollowing(prev) // revert on error
    } finally {
      setLoading(false)
    }
  }

  const pad = size === 'md' ? '10px 18px' : '6px 12px'
  const fs = size === 'md' ? 11 : 9

  return (
    <button
      onClick={handleToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-lg font-black transition-all duration-200 disabled:opacity-60"
      style={{
        padding: pad,
        fontSize: fs,
        letterSpacing: '0.1em',
        background: following
          ? hover ? 'rgba(255,0,110,0.1)' : 'rgba(0,229,255,0.08)'
          : 'transparent',
        border: following
          ? hover ? '1px solid rgba(255,0,110,0.4)' : '1px solid rgba(0,229,255,0.35)'
          : '1px solid rgba(0,229,255,0.25)',
        color: following
          ? hover ? '#ff006e' : '#00e5ff'
          : 'rgba(0,229,255,0.6)',
      }}
    >
      {loading ? (
        <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
      ) : following ? (
        hover ? <UserMinus size={11} /> : <UserCheck size={11} />
      ) : (
        <UserPlus size={11} />
      )}
      {following ? (hover ? 'UNFOLLOW' : 'FOLLOWING') : 'FOLLOW'}
    </button>
  )
}
