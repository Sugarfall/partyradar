'use client'

/**
 * Phase 5 — per-post analytics for the post owner.
 *
 * Reads GET /api/posts/:id/insights (server enforces author-only access).
 * Renders:
 *   • Headline totals: views, likes, comments, shares, reposts
 *   • Share-by-method breakdown (bars)
 *   • Engagement over time (hourly for <48h-old posts, daily otherwise)
 *   • Top commenters shortlist
 *
 * All charts are plain HTML/SVG — no external chart lib, keeps the bundle
 * small and the visual style consistent with events/[id]/analytics.
 */

import { useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Eye, Heart, MessageCircle, Share2, Repeat2,
  Users, Link as LinkIcon, BarChart2, Activity,
} from 'lucide-react'
import useSWR from 'swr'

import { fetcher } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { loginHref } from '@/lib/authRedirect'

// ─── API types ───────────────────────────────────────────────────────────
interface InsightsUser {
  id: string
  username: string
  displayName: string
  photoUrl?: string | null
}

interface InsightsPoint {
  t: string
  likes: number
  comments: number
  shares: number
}

interface InsightsData {
  post: {
    id: string
    text: string | null
    imageUrl: string | null
    createdAt: string
    user: InsightsUser
  }
  totals: {
    views: number
    likes: number
    comments: number
    shares: number
    reposts: number
    sharesByMethod: Record<string, number>
  }
  timeseries: {
    bucket: 'hour' | 'day'
    points: InsightsPoint[]
  }
  topCommenters: Array<{ user: InsightsUser; count: number }>
  capped: { likes: boolean; comments: boolean; shares: boolean }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return n.toString()
}

const METHOD_META: Record<string, { label: string; color: string; icon: typeof Share2 }> = {
  native: { label: 'Native share', color: 'var(--accent)', icon: Share2 },
  copy:   { label: 'Copy link',    color: '#00ff88',       icon: LinkIcon },
  repost: { label: 'Repost',       color: '#ec4899',       icon: Repeat2 },
}

function methodInfo(key: string) {
  return METHOD_META[key] ?? { label: key, color: '#888', icon: Share2 }
}

// ─── Components ──────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, color, sub,
}: {
  icon: typeof Heart
  label: string
  value: string | number
  color: string
  sub?: string
}) {
  return (
    <div
      className="p-4 rounded-2xl"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} style={{ color }} />
        <span
          className="text-[10px] font-bold tracking-widest uppercase"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          {label}
        </span>
      </div>
      <p className="text-2xl font-black" style={{ color: '#e0f2fe' }}>{value}</p>
      {sub && (
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {sub}
        </p>
      )}
    </div>
  )
}

function MethodBar({
  method, count, max,
}: {
  method: string
  count: number
  max: number
}) {
  const info = methodInfo(method)
  const Icon = info.icon
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={12} style={{ color: info.color }} />
        <span className="text-xs font-bold" style={{ color: '#e0f2fe' }}>{info.label}</span>
        <span className="ml-auto text-xs font-black tabular-nums" style={{ color: info.color }}>
          {count}
        </span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: info.color, boxShadow: `0 0 6px ${info.color}60` }}
        />
      </div>
    </div>
  )
}

// Stacked bar chart — one bar per time bucket, segments for likes/comments/shares.
function Timeseries({
  points, bucket,
}: {
  points: InsightsPoint[]
  bucket: 'hour' | 'day'
}) {
  if (points.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
        Not enough data to chart yet.
      </p>
    )
  }
  const max = Math.max(1, ...points.map((p) => p.likes + p.comments + p.shares))
  const HEIGHT = 96

  // Axis labels: first + last bucket (bucket-aware format).
  function fmtTick(iso: string) {
    const d = new Date(iso)
    if (bucket === 'hour') return d.toLocaleTimeString([], { hour: '2-digit' })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  const first = points[0]?.t
  const last  = points[points.length - 1]?.t

  return (
    <div>
      <div
        className="flex items-end gap-[3px]"
        style={{ height: HEIGHT }}
      >
        {points.map((p, i) => {
          const total = p.likes + p.comments + p.shares
          const h = (total / max) * HEIGHT
          const likeH    = (p.likes / max) * HEIGHT
          const commentH = (p.comments / max) * HEIGHT
          const shareH   = (p.shares / max) * HEIGHT
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end group relative"
              style={{ minWidth: 3 }}
              title={`${fmtTick(p.t)} · ${p.likes}L / ${p.comments}C / ${p.shares}S`}
            >
              {/* shares on top */}
              {shareH > 0 && (
                <div style={{ height: Math.max(1, shareH), background: '#ec4899', opacity: 0.9 }} />
              )}
              {/* comments middle */}
              {commentH > 0 && (
                <div style={{ height: Math.max(1, commentH), background: 'var(--accent)', opacity: 0.85 }} />
              )}
              {/* likes bottom — rounded corners */}
              {likeH > 0 && (
                <div
                  style={{
                    height: Math.max(1, likeH),
                    background: '#ff006e',
                    opacity: 0.9,
                    borderTopLeftRadius: total === p.likes ? 2 : 0,
                    borderTopRightRadius: total === p.likes ? 2 : 0,
                  }}
                />
              )}
              {/* empty placeholder so bar still has layout */}
              {h === 0 && <div style={{ height: 1, background: 'rgba(255,255,255,0.04)' }} />}
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {first ? fmtTick(first) : ''}
        </span>
        <span className="text-[9px] font-bold tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>
          {bucket === 'hour' ? 'LAST 48H' : `LAST ${points.length}D`}
        </span>
        <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {last ? fmtTick(last) : ''}
        </span>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-3">
        <LegendDot color="#ff006e"       label="Likes" />
        <LegendDot color="var(--accent)" label="Comments" />
        <LegendDot color="#ec4899"       label="Shares" />
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block rounded-sm"
        style={{ width: 8, height: 8, background: color, boxShadow: `0 0 4px ${color}80` }}
      />
      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>
    </div>
  )
}

function CommenterRow({ user, count }: { user: InsightsUser; count: number }) {
  const initials = user.displayName?.[0]?.toUpperCase() ?? user.username?.[0]?.toUpperCase() ?? '?'
  return (
    <Link
      href={`/profile/${user.username}`}
      className="flex items-center gap-3 p-2 rounded-xl transition-colors"
      style={{ background: 'transparent' }}
    >
      {user.photoUrl ? (
        <img src={user.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
      ) : (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0"
          style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}
        >
          {initials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black truncate" style={{ color: '#e0f2fe' }}>{user.displayName}</p>
        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>@{user.username}</p>
      </div>
      <span
        className="text-xs font-black px-2 py-0.5 rounded tabular-nums"
        style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}
      >
        {count}
      </span>
    </Link>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function PostInsightsPage() {
  const params = useParams()
  const router = useRouter()
  const postId = params['postId'] as string
  const { dbUser, loading: authLoading } = useAuth()

  // Only fetch once auth is resolved — the endpoint requires an authed owner.
  const { data, isLoading } = useSWR<{ data: InsightsData }>(
    !authLoading && dbUser ? `/posts/${postId}/insights` : null,
    fetcher,
  )

  // Bounce unauthenticated users to the login flow. The server also enforces
  // owner-only access and will return 403 for non-owners — in that case our
  // SWR hook swallows the error and we fall through to the "not available"
  // empty state below, which is the same UX as a deleted post.
  useEffect(() => {
    if (!authLoading && !dbUser) {
      router.push(loginHref(`/feed/${postId}/insights`))
    }
  }, [authLoading, dbUser, router, postId])

  const insights = data?.data

  if (authLoading || (isLoading && !insights)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#04040d' }}>
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }}
        />
      </div>
    )
  }

  if (!insights) {
    return (
      <div className="min-h-screen pt-20 px-4" style={{ background: '#04040d' }}>
        <div className="max-w-xl mx-auto">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 text-xs font-bold mb-6"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            <ArrowLeft size={14} /> Back to feed
          </Link>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Insights aren&apos;t available for this post.
          </p>
        </div>
      </div>
    )
  }

  const { post, totals, timeseries, topCommenters, capped } = insights
  const shareEntries = Object.entries(totals.sharesByMethod).sort((a, b) => b[1] - a[1])
  const maxShareMethod = shareEntries.reduce((m, [, v]) => Math.max(m, v), 1)
  const postedAt = new Date(post.createdAt).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const engagementRate = totals.views > 0
    ? Math.round(((totals.likes + totals.comments + totals.shares) / totals.views) * 100)
    : null

  return (
    <div className="min-h-screen pt-20 pb-32 px-4" style={{ background: '#04040d' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/feed"
            className="p-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <ArrowLeft size={16} style={{ color: 'rgba(255,255,255,0.5)' }} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold flex items-center gap-2" style={{ color: '#e0f2fe' }}>
              <BarChart2 size={16} style={{ color: 'var(--accent)' }} />
              Post insights
            </h1>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Posted {postedAt}
            </p>
          </div>
        </div>

        {/* Post preview */}
        <div
          className="flex gap-3 p-3 rounded-2xl mb-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {post.imageUrl ? (
            <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0" style={{ background: '#000' }}>
              <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}
            >
              <Activity size={20} style={{ color: 'rgba(var(--accent-rgb),0.6)' }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black tracking-widest uppercase" style={{ color: 'rgba(var(--accent-rgb),0.65)' }}>
              @{post.user.username}
            </p>
            <p className="text-xs mt-1 line-clamp-3" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {post.text ?? <span style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>No caption</span>}
            </p>
          </div>
        </div>

        {/* Headline stat grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <StatCard icon={Eye}           label="Views"    value={fmt(totals.views)}    color="#6366f1"       sub={engagementRate != null ? `${engagementRate}% engagement` : undefined} />
          <StatCard icon={Heart}         label="Likes"    value={fmt(totals.likes)}    color="#ff006e" />
          <StatCard icon={MessageCircle} label="Comments" value={fmt(totals.comments)} color="var(--accent)" />
          <StatCard icon={Share2}        label="Shares"   value={fmt(totals.shares)}   color="#ec4899" />
          <StatCard icon={Repeat2}       label="Reposts"  value={fmt(totals.reposts)}  color="#f59e0b" />
          <StatCard
            icon={Activity}
            label="Total actions"
            value={fmt(totals.likes + totals.comments + totals.shares + totals.reposts)}
            color="#00ff88"
          />
        </div>

        {/* Engagement over time */}
        <div
          className="p-4 rounded-2xl mb-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Activity size={13} style={{ color: 'rgba(var(--accent-rgb),0.7)' }} />
            <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Engagement over time
            </span>
          </div>
          <Timeseries points={timeseries.points} bucket={timeseries.bucket} />
          {(capped.likes || capped.comments || capped.shares) && (
            <p className="text-[10px] mt-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Some older events beyond the sample cap aren&apos;t shown. Totals above are accurate.
            </p>
          )}
        </div>

        {/* Shares breakdown */}
        {shareEntries.length > 0 && (
          <div
            className="p-4 rounded-2xl mb-4 space-y-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Share2 size={13} style={{ color: '#ec4899' }} />
              <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Shares by channel
              </span>
            </div>
            {shareEntries.map(([m, n]) => (
              <MethodBar key={m} method={m} count={n} max={maxShareMethod} />
            ))}
          </div>
        )}

        {/* Top commenters */}
        {topCommenters.length > 0 && (
          <div
            className="p-4 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Users size={13} style={{ color: 'var(--accent)' }} />
              <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Top commenters
              </span>
            </div>
            <div className="space-y-1">
              {topCommenters.map((c) => (
                <CommenterRow key={c.user.id} user={c.user} count={c.count} />
              ))}
            </div>
          </div>
        )}

        {/* Empty-engagement fallback */}
        {totals.likes + totals.comments + totals.shares + totals.views === 0 && (
          <div
            className="p-8 rounded-2xl text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <Activity size={32} className="mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>No engagement yet</p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Stats will start showing once people interact with your post.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
