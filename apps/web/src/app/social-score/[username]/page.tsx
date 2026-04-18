'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { API_URL } from '@/lib/api'
import { Star, Flag } from 'lucide-react'

interface ScoreData {
  socialScore: number
  avgByCategory: Record<string, number>
  recentFeedback: { category: string; score: number; comment?: string | null; createdAt: string }[]
}

const CATEGORIES = [
  { key: 'vibe', label: 'Vibe', emoji: '✨' },
  { key: 'punctuality', label: 'Punctuality', emoji: '⏰' },
  { key: 'friendliness', label: 'Friendliness', emoji: '😊' },
  { key: 'host_quality', label: 'Host Quality', emoji: '🎉' },
]

function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function SocialScorePage() {
  const { username } = useParams<{ username: string }>()
  const { dbUser, firebaseUser } = useAuth()
  const [data, setData] = useState<ScoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [fbCategory, setFbCategory] = useState('vibe')
  const [fbScore, setFbScore] = useState(3)
  const [fbComment, setFbComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/social-score/${username}`)
      .then(r => r.json())
      .then(j => { if (j.data) setData(j.data) })
      .finally(() => setLoading(false))
  }, [username])

  async function submitFeedback() {
    if (!firebaseUser) return
    setSubmitting(true)
    const token = await firebaseUser.getIdToken().catch(() => null)
    // Need userId — fetch user first
    const userRes = await fetch(`${API_URL}/users/${username}`)
    const userJson = await userRes.json()
    const targetId = userJson.data?.id
    if (!targetId) { setSubmitting(false); return }

    await fetch(`${API_URL}/social-score/${targetId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
      body: JSON.stringify({ category: fbCategory, score: fbScore, comment: fbComment.trim() || undefined }),
    })
    setSubmitted(true)
    setShowForm(false)
    setSubmitting(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#07071a' }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }} />
    </div>
  )

  const isOwnProfile = dbUser?.username === username

  return (
    <div className="min-h-screen pb-24" style={{ background: '#07071a' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-4"
        style={{ background: 'rgba(7,7,26,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(var(--accent-rgb),0.08)' }}>
        <h1 className="text-xl font-black text-center" style={{ color: '#e0f2fe' }}>Social Score</h1>
        <p className="text-xs text-center mt-1" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>@{username}</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Score */}
        <div className="p-6 rounded-2xl text-center" style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.1)' }}>
          <div className="text-5xl font-black mb-1" style={{ color: 'var(--accent)' }}>{data?.socialScore ?? 0}</div>
          <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>OUT OF 100</p>
        </div>

        {/* Category breakdown */}
        {data && Object.keys(data.avgByCategory).length > 0 && (
          <div className="p-4 rounded-2xl space-y-3" style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
            {CATEGORIES.filter(c => data.avgByCategory[c.key] !== undefined).map(cat => (
              <div key={cat.key} className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'rgba(224,242,254,0.7)' }}>{cat.emoji} {cat.label}</span>
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} size={12} fill={i <= (data.avgByCategory[cat.key] ?? 0) ? '#ffd600' : 'none'} style={{ color: '#ffd600' }} />
                  ))}
                  <span className="text-xs ml-1 font-bold" style={{ color: '#ffd600' }}>{data.avgByCategory[cat.key]}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Leave feedback */}
        {dbUser && !isOwnProfile && !submitted && (
          <button onClick={() => setShowForm(!showForm)}
            className="w-full py-3 rounded-xl text-sm font-black tracking-widest"
            style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'var(--accent)' }}>
            {showForm ? 'CANCEL' : '+ LEAVE ANONYMOUS FEEDBACK'}
          </button>
        )}
        {submitted && (
          <div className="py-3 text-center text-sm font-black" style={{ color: 'rgba(0,255,136,0.7)' }}>✓ Feedback submitted anonymously</div>
        )}

        {showForm && (
          <div className="p-4 rounded-2xl space-y-4" style={{ background: 'rgba(7,7,26,0.9)', border: '1px solid rgba(var(--accent-rgb),0.12)' }}>
            <p className="text-[10px] font-black tracking-[0.2em]" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>ANONYMOUS FEEDBACK</p>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat.key} onClick={() => setFbCategory(cat.key)}
                  className="py-2 px-3 rounded-xl text-xs font-bold text-left"
                  style={fbCategory === cat.key
                    ? { background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.4)', color: 'var(--accent)' }
                    : { background: 'rgba(7,7,26,0.6)', border: '1px solid rgba(var(--accent-rgb),0.08)', color: 'rgba(224,242,254,0.5)' }}>
                  {cat.emoji} {cat.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-center">
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setFbScore(n)}
                  className="w-10 h-10 rounded-xl font-black text-sm"
                  style={n <= fbScore
                    ? { background: 'rgba(255,214,0,0.15)', border: '1px solid rgba(255,214,0,0.4)', color: '#ffd600' }
                    : { background: 'rgba(7,7,26,0.6)', border: '1px solid rgba(var(--accent-rgb),0.08)', color: 'rgba(224,242,254,0.3)' }}>
                  {n}
                </button>
              ))}
            </div>
            <textarea placeholder="Optional comment (anonymous)…" value={fbComment} onChange={e => setFbComment(e.target.value)}
              maxLength={300} rows={3}
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-transparent outline-none resize-none"
              style={{ border: '1px solid rgba(var(--accent-rgb),0.12)', color: '#e0f2fe' }} />
            <button onClick={submitFeedback} disabled={submitting}
              className="w-full py-3 rounded-xl text-xs font-black tracking-widest disabled:opacity-50"
              style={{ background: 'rgba(var(--accent-rgb),0.1)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)' }}>
              {submitting ? 'SUBMITTING…' : 'SUBMIT ANONYMOUSLY'}
            </button>
          </div>
        )}

        {/* Recent feedback */}
        {data && data.recentFeedback.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black tracking-[0.2em] px-1" style={{ color: 'rgba(var(--accent-rgb),0.3)' }}>RECENT FEEDBACK</p>
            {data.recentFeedback.map((fb, i) => (
              <div key={i} className="p-3 rounded-xl" style={{ background: 'rgba(7,7,26,0.7)', border: '1px solid rgba(var(--accent-rgb),0.06)' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
                    {CATEGORIES.find(c => c.key === fb.category)?.emoji} {fb.category.replace('_', ' ')}
                  </span>
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(n => (
                      <div key={n} className="w-1.5 h-1.5 rounded-full" style={{ background: n <= fb.score ? '#ffd600' : 'rgba(255,214,0,0.15)' }} />
                    ))}
                  </div>
                </div>
                {fb.comment && <p className="text-xs" style={{ color: 'rgba(224,242,254,0.5)' }}>{fb.comment}</p>}
                <p className="text-[9px] mt-1" style={{ color: 'rgba(224,242,254,0.2)' }}>{timeAgo(fb.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
