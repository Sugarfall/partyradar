'use client'

import { useState } from 'react'
import { UserPlus, UserCheck } from 'lucide-react'

import { API_URL as API_BASE } from '@/lib/api'

interface FollowButtonProps {
  userId: string
  initialFollowing?: boolean
}

export default function FollowButton({ userId, initialFollowing = false }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing)
  const [loading, setLoading] = useState(false)

  async function handleToggle() {
    if (loading) return
    const prev = following
    setFollowing(!prev)
    setLoading(true)
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('partyradar_mock_session') ?? ''
        : ''
      const method = prev ? 'DELETE' : 'POST'
      const res = await fetch(`${API_BASE}/follow/${userId}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      // Revert optimistic update
      setFollowing(prev)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all duration-200 disabled:opacity-60"
      style={{
        background: following ? 'rgba(0,229,255,0.12)' : 'transparent',
        border: following ? '1px solid rgba(0,229,255,0.5)' : '1px solid rgba(0,229,255,0.25)',
        color: following ? '#00e5ff' : 'rgba(0,229,255,0.6)',
        letterSpacing: '0.1em',
        boxShadow: following ? '0 0 10px rgba(0,229,255,0.15)' : 'none',
      }}
    >
      {loading ? (
        <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
      ) : following ? (
        <UserCheck size={12} />
      ) : (
        <UserPlus size={12} />
      )}
      {following ? 'FOLLOWING' : 'FOLLOW'}
    </button>
  )
}
