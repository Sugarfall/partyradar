'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Rss, Zap, Users, MapPin, Calendar, Plus, Ticket, Camera } from 'lucide-react'

import { api } from '@/lib/api'
import { DEV_MODE } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import ComposePostModal from '@/components/feed/ComposePostModal'
import StoryViewer, { type StoryGroup, type StoryPost } from '@/components/feed/StoryViewer'
import { areAllViewed, countUnviewed } from '@/lib/storyViewed'
import PostDetailModal from '@/components/feed/PostDetailModal'
import {
  FeedItemCard, type FeedItem, type FeedUser,
  timeAgo, TYPE_COLORS, TYPE_LABELS,
} from '@/components/feed/FeedCards'

type FeedTab = 'foryou' | 'following'

const DEMO_FEED: FeedItem[] = [
  { type: 'RSVP',    user: { displayName: 'Jamie K', photoUrl: null },    event: { name: 'Sub Club Techno Night', type: 'CLUB_NIGHT' }, createdAt: new Date(Date.now() - 15*60*1000).toISOString() },
  { type: 'CHECKIN', user: { displayName: 'Sarah M', photoUrl: null },    venue: { name: 'SWG3' }, crowdLevel: 'BUSY',   createdAt: new Date(Date.now() - 32*60*1000).toISOString() },
  { type: 'RSVP',    user: { displayName: 'Lewis R', photoUrl: null },    event: { name: 'Oran Mor Live', type: 'CONCERT' }, createdAt: new Date(Date.now() - 1*60*60*1000).toISOString() },
  { type: 'POST',    user: { displayName: 'Chloe B', photoUrl: null },    event: { name: 'Rooftop Party' }, text: 'Best night!', imageUrl: null, likesCount: 12, commentsCount: 3, createdAt: new Date(Date.now() - 2*60*60*1000).toISOString() },
  { type: 'CHECKIN', user: { displayName: 'Ryan T', photoUrl: null },     venue: { name: 'Stereo' }, crowdLevel: 'RAMMED', createdAt: new Date(Date.now() - 3*60*60*1000).toISOString() },
]

// StoriesBar now renders real data from GET /api/posts/stories grouped by author.

// ── Upcoming Event Card ───────────────────────────────────────────────────────
interface UpcomingEvent {
  id: string
  name: string
  type: string
  startsAt: string
  address?: string
  neighbourhood?: string
  coverImageUrl?: string | null
  ticketPrice?: number | null
  host?: { displayName?: string | null; username?: string | null; photoUrl?: string | null } | null
  _guestsCount?: number
}

function UpcomingEventCard({ event }: { event: UpcomingEvent }) {
  const typeColor = TYPE_COLORS[event.type] ?? 'var(--accent)'
  const typeLabel = TYPE_LABELS[event.type] ?? event.type.replace('_', ' ')
  const dateStr = new Date(event.startsAt).toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <Link href={`/events/${event.id}`}>
      <div
        className="rounded-2xl overflow-hidden transition-all duration-200 active:scale-[0.98]"
        style={{ background: 'rgba(24,24,27,0.95)', border: `1px solid ${typeColor}20` }}
      >
        {event.coverImageUrl && (
          <div style={{ height: 140, overflow: 'hidden' }}>
            <img src={event.coverImageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <span
                className="inline-block text-[9px] font-black px-2 py-0.5 rounded mb-1.5"
                style={{ color: typeColor, border: `1px solid ${typeColor}50`, background: `${typeColor}15`, letterSpacing: '0.12em' }}
              >
                {typeLabel}
              </span>
              <p className="text-sm font-black leading-tight" style={{ color: '#e0f2fe' }}>{event.name}</p>
            </div>
            {event.ticketPrice != null && event.ticketPrice > 0 ? (
              <span className="text-xs font-black shrink-0 px-2 py-1 rounded-lg"
                style={{ color: '#00ff88', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)' }}>
                £{event.ticketPrice.toFixed(2)}
              </span>
            ) : (
              <span className="text-[9px] font-black shrink-0 px-2 py-1 rounded-lg"
                style={{ color: '#00ff88', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)' }}>
                FREE
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>
            <span className="flex items-center gap-1"><Calendar size={9} /> {dateStr}</span>
            {(event.neighbourhood || event.address) && (
              <span className="flex items-center gap-1 truncate"><MapPin size={9} /> {event.neighbourhood ?? event.address}</span>
            )}
          </div>
          {event.host && (
            <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid rgba(var(--accent-rgb),0.06)' }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
                style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--accent)' }}>
                {(event.host.displayName ?? event.host.username ?? '?')[0]?.toUpperCase()}
              </div>
              <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.4)' }}>
                by {event.host.displayName ?? event.host.username ?? 'Unknown'}
              </span>
              {(event._guestsCount ?? 0) > 0 && (
                <span className="ml-auto flex items-center gap-1 text-[9px]" style={{ color: 'rgba(var(--accent-rgb),0.5)' }}>
                  <Ticket size={9} /> {event._guestsCount} going
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

// ── Stories Bar ───────────────────────────────────────────────────────────────
interface StoriesBarProps {
  currentUserId: string | null
  currentUser: { displayName: string; username: string | null; photoUrl: string | null } | null
  groups: StoryGroup[]
  loading: boolean
  onOpenComposeStory: () => void
  onOpenGroup: (index: number) => void
}

function StoriesBar({ currentUserId, currentUser, groups, loading, onOpenComposeStory, onOpenGroup }: StoriesBarProps) {
  const ownGroupIndex = currentUserId ? groups.findIndex((g) => g.user.id === currentUserId) : -1
  const otherGroups = groups
    .map((g, idx) => ({ g, idx }))
    .filter((x) => x.idx !== ownGroupIndex)

  const ownStoryCount = ownGroupIndex >= 0 ? groups[ownGroupIndex]!.stories.length : 0

  function renderAvatar(user: StoryPost['user'], fallbackInitial: string, ring: 'pink' | 'gray' | 'dashed') {
    const ringStyle =
      ring === 'pink'
        ? { border: '2.5px solid transparent', backgroundImage: 'linear-gradient(#04040d, #04040d), linear-gradient(135deg, #ec4899, #f97316, #facc15)', backgroundOrigin: 'border-box', backgroundClip: 'padding-box, border-box' }
        : ring === 'gray'
          ? { border: '2px solid rgba(120,120,140,0.35)' }
          : { border: '2px dashed rgba(var(--accent-rgb),0.3)' }
    if (user.photoUrl) {
      return (
        <div className="w-14 h-14 rounded-full overflow-hidden" style={ringStyle}>
          <img src={user.photoUrl} alt="" className="w-full h-full object-cover rounded-full" style={{ border: '2px solid #04040d' }} />
        </div>
      )
    }
    return (
      <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ ...ringStyle, background: 'rgba(var(--accent-rgb),0.08)' }}>
        <span className="text-lg font-black" style={{ color: '#e0f2fe' }}>{fallbackInitial}</span>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
      <div className="flex gap-3 px-4" style={{ minWidth: 'max-content' }}>
        {/* Your Story */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          {ownStoryCount > 0 && currentUser && ownGroupIndex >= 0 ? (
            <div className="relative">
              <button onClick={() => onOpenGroup(ownGroupIndex)} aria-label="View your story" className="block">
                {renderAvatar(
                  { displayName: currentUser.displayName, username: currentUser.username ?? undefined, photoUrl: currentUser.photoUrl },
                  currentUser.displayName[0]?.toUpperCase() ?? '?',
                  areAllViewed(groups[ownGroupIndex]!.stories.map((s) => s.id)) ? 'gray' : 'pink',
                )}
              </button>
              <button
                onClick={onOpenComposeStory}
                aria-label="Add to your story"
                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: '#ec4899', border: '2px solid #04040d', color: '#fff' }}
              >
                <Plus size={11} />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenComposeStory}
              className="w-14 h-14 rounded-full flex items-center justify-center relative"
              style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '2px dashed rgba(var(--accent-rgb),0.3)' }}
              aria-label="Add your story"
            >
              <Plus size={18} style={{ color: 'rgba(var(--accent-rgb),0.7)' }} />
            </button>
          )}
          <span className="text-[9px] font-bold tracking-wide" style={{ color: 'rgba(var(--accent-rgb),0.6)', maxWidth: 56 }}>
            YOUR STORY
          </span>
        </div>

        {/* Friend stories */}
        {loading && otherGroups.length === 0 ? (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 shrink-0 animate-pulse">
                <div className="w-14 h-14 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
                <div className="h-2 w-10 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
              </div>
            ))}
          </>
        ) : (
          otherGroups.map(({ g, idx }) => {
            const allViewed = areAllViewed(g.stories.map((s) => s.id))
            const unviewed = countUnviewed(g.stories.map((s) => s.id))
            const firstName = g.user.displayName.split(' ')[0] ?? g.user.displayName
            return (
              <button
                key={g.user.id ?? g.user.username ?? idx}
                onClick={() => onOpenGroup(idx)}
                className="flex flex-col items-center gap-1.5 shrink-0"
                aria-label={`View ${g.user.displayName}'s story`}
              >
                <div className="relative">
                  {renderAvatar(g.user, g.user.displayName[0]?.toUpperCase() ?? '?', allViewed ? 'gray' : 'pink')}
                  {unviewed > 1 && !allViewed && (
                    <span
                      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[9px] font-black"
                      style={{ background: '#ec4899', color: '#fff', border: '2px solid #04040d' }}
                    >
                      {unviewed}
                    </span>
                  )}
                </div>
                <span
                  className="text-[9px] font-bold tracking-wide truncate"
                  style={{ color: allViewed ? 'rgba(74,96,128,0.7)' : 'rgba(224,242,254,0.8)', maxWidth: 56 }}
                >
                  {firstName.toUpperCase()}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
        style={{ background: 'rgba(var(--accent-rgb),0.05)', border: '1px solid rgba(var(--accent-rgb),0.12)' }}
      >
        <Users size={28} style={{ color: 'rgba(var(--accent-rgb),0.3)' }} />
      </div>
      <p className="text-sm font-black tracking-widest mb-2" style={{ color: 'rgba(224,242,254,0.4)' }}>
        NOTHING YET
      </p>
      <p className="text-xs mb-5" style={{ color: 'rgba(74,96,128,0.6)' }}>
        Follow people to see their activity here
      </p>
      <Link
        href="/discover"
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all duration-200"
        style={{
          background: 'rgba(var(--accent-rgb),0.08)',
          border: '1px solid rgba(var(--accent-rgb),0.25)',
          color: 'var(--accent)',
          letterSpacing: '0.1em',
        }}
      >
        <Rss size={12} /> DISCOVER EVENTS
      </Link>
    </div>
  )
}

// ── Deep-link wrapper (useSearchParams needs Suspense) ────────────────────────
export default function FeedPage() {
  return (
    <Suspense fallback={null}>
      <FeedPageInner />
    </Suspense>
  )
}

function FeedPageInner() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<FeedTab>('foryou')
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [composing, setComposing] = useState(false)
  const [composingStory, setComposingStory] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const { dbUser } = useAuth()
  const currentUserId = dbUser?.id ?? null
  const isLoggedIn = !!dbUser

  // Notification deep-link: ?post=<id> opens that post in the modal
  const [deepLinkPost, setDeepLinkPost] = useState<FeedItem | null>(null)
  useEffect(() => {
    const postId = searchParams.get('post')
    if (!postId) return
    api.get<{ data: FeedItem }>(`/posts/${postId}`)
      .then((res) => { if (res?.data) setDeepLinkPost(res.data) })
      .catch(() => {})
  }, [searchParams])

  // Stories state
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([])
  const [storiesLoading, setStoriesLoading] = useState(true)
  const [openStoryGroupIndex, setOpenStoryGroupIndex] = useState<number | null>(null)

  function handlePostDeleted(id: string) {
    setFeedItems((prev) => prev.filter((item) => item.id !== id))
  }

  function handleStoryDeleted(id: string) {
    setStoryGroups((prev) => {
      const next = prev
        .map((g) => ({ ...g, stories: g.stories.filter((s) => s.id !== id) }))
        .filter((g) => g.stories.length > 0)
      return next
    })
  }

  useEffect(() => {
    async function loadFeed() {
      setLoading(true)
      const endpoint = tab === 'following' ? '/feed' : '/feed/discover'
      try {
        const [feedRes, eventsRes] = await Promise.allSettled([
          api.get<{ data: FeedItem[] }>(endpoint),
          tab === 'foryou' ? api.get<{ data: UpcomingEvent[] }>('/events?limit=20&published=true') : Promise.resolve(null),
        ])
        const items: FeedItem[] = feedRes.status === 'fulfilled' ? (feedRes.value?.data ?? []) : (DEV_MODE ? DEMO_FEED : [])
        setFeedItems(items.length > 0 ? items : DEV_MODE ? DEMO_FEED : [])
        if (eventsRes.status === 'fulfilled' && eventsRes.value) {
          setUpcomingEvents((eventsRes.value as { data: UpcomingEvent[] }).data ?? [])
        }
      } catch {
        setFeedItems(DEV_MODE ? DEMO_FEED : [])
      } finally {
        setLoading(false)
      }
    }
    loadFeed()
  }, [tab, reloadKey])

  // Load active stories (separate from feed)
  useEffect(() => {
    if (!isLoggedIn) {
      setStoryGroups([])
      setStoriesLoading(false)
      return
    }
    let cancelled = false
    async function loadStories() {
      setStoriesLoading(true)
      try {
        const res = await api.get<{ data: StoryPost[] }>('/posts/stories')
        if (cancelled) return
        const byUser = new Map<string, StoryPost[]>()
        for (const s of (res.data ?? [])) {
          const key = s.user.id ?? s.user.username ?? s.id
          const arr = byUser.get(key) ?? []
          arr.push(s)
          byUser.set(key, arr)
        }
        const groups: StoryGroup[] = Array.from(byUser.values())
          .map((stories) => ({
            user: stories[0]!.user,
            stories: [...stories].reverse(),
          }))
          .sort((a, b) => {
            const aNewest = new Date(a.stories[a.stories.length - 1]!.createdAt).getTime()
            const bNewest = new Date(b.stories[b.stories.length - 1]!.createdAt).getTime()
            return bNewest - aNewest
          })
        setStoryGroups(groups)
      } catch {
        setStoryGroups([])
      } finally {
        if (!cancelled) setStoriesLoading(false)
      }
    }
    loadStories()
    return () => { cancelled = true }
  }, [isLoggedIn, reloadKey])

  return (
    <div className="min-h-screen pb-28" style={{ background: '#04040d' }}>
      {/* Top line */}
      <div className="absolute top-14 inset-x-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.2), transparent)' }} />

      {/* Header */}
      <div
        className="sticky top-14 z-30 px-4 pt-4 pb-0"
        style={{
          background: 'rgba(4,4,13,0.95)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(var(--accent-rgb),0.07)',
        }}
      >
        <div className="max-w-xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Rss size={16} style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 6px rgba(var(--accent-rgb),0.7))' }} />
            <h1
              className="text-sm font-black tracking-[0.25em]"
              style={{ color: 'var(--accent)', textShadow: '0 0 16px rgba(var(--accent-rgb),0.5)' }}
            >
              FEED
            </h1>
          </div>

          <div className="flex gap-0 border-b" style={{ borderColor: 'rgba(var(--accent-rgb),0.08)' }}>
            {([['foryou', 'FOR YOU'], ['following', 'FOLLOWING']] as [FeedTab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="relative px-5 py-2.5 text-[10px] font-black tracking-widest transition-all duration-200"
                style={{
                  color: tab === key ? 'var(--accent)' : 'rgba(74,96,128,0.6)',
                  textShadow: tab === key ? '0 0 10px rgba(var(--accent-rgb),0.6)' : 'none',
                }}
              >
                {label}
                {tab === key && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-px"
                    style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stories */}
      <div className="max-w-xl mx-auto pt-4 mb-1">
        <StoriesBar
          currentUserId={currentUserId}
          currentUser={dbUser ? {
            displayName: dbUser.displayName ?? dbUser.username ?? 'You',
            username: dbUser.username ?? null,
            photoUrl: dbUser.photoUrl ?? null,
          } : null}
          groups={storyGroups}
          loading={storiesLoading}
          onOpenComposeStory={() => {
            if (!isLoggedIn) return
            setComposingStory(true)
          }}
          onOpenGroup={(idx) => setOpenStoryGroupIndex(idx)}
        />
      </div>

      {/* Divider */}
      <div className="max-w-xl mx-auto px-4 mb-4">
        <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.15), transparent)' }} />
      </div>

      {/* Feed */}
      <div className="max-w-xl mx-auto px-4 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center py-20 gap-4">
            <div
              className="w-10 h-10 rounded-full border-2 animate-spin"
              style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)' }}
            />
            <p className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
              LOADING FEED...
            </p>
          </div>
        ) : (
          <>
            {feedItems.map((item, i) => (
              <FeedItemCard key={item.id ?? i} item={item} currentUserId={currentUserId} onDelete={handlePostDeleted} />
            ))}

            {tab === 'foryou' && upcomingEvents.length > 0 && (
              <>
                {feedItems.length > 0 && (
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 h-px" style={{ background: 'rgba(var(--accent-rgb),0.08)' }} />
                    <span className="text-[9px] font-black tracking-[0.2em]" style={{ color: 'rgba(var(--accent-rgb),0.3)' }}>UPCOMING EVENTS</span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(var(--accent-rgb),0.08)' }} />
                  </div>
                )}
                {upcomingEvents.map((event) => (
                  <UpcomingEventCard key={event.id} event={event} />
                ))}
              </>
            )}

            {feedItems.length === 0 && (tab !== 'foryou' || upcomingEvents.length === 0) && (
              <EmptyState />
            )}
          </>
        )}
      </div>

      {/* Floating compose button */}
      {isLoggedIn && (
        <button
          onClick={() => setComposing(true)}
          className="fixed bottom-24 right-5 w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all active:scale-95 z-40"
          style={{
            background: 'linear-gradient(135deg, #ec4899, #f97316)',
            boxShadow: '0 4px 24px rgba(236,72,153,0.4)',
          }}
          aria-label="Create post"
        >
          <Camera size={22} style={{ color: '#fff' }} />
        </button>
      )}

      {composing && (
        <ComposePostModal
          onClose={() => setComposing(false)}
          onPosted={() => setReloadKey((k) => k + 1)}
        />
      )}

      {composingStory && (
        <ComposePostModal
          storyMode
          onClose={() => setComposingStory(false)}
          onPosted={() => setReloadKey((k) => k + 1)}
        />
      )}

      {openStoryGroupIndex !== null && storyGroups[openStoryGroupIndex] && (
        <StoryViewer
          groups={storyGroups}
          startGroupIndex={openStoryGroupIndex}
          currentUserId={currentUserId}
          onClose={() => setOpenStoryGroupIndex(null)}
          onStoryDeleted={handleStoryDeleted}
        />
      )}

      {/* Notification deep-link: ?post=<id> opens the post modal */}
      {deepLinkPost && deepLinkPost.id && (
        <PostDetailModal
          post={{ ...deepLinkPost, id: deepLinkPost.id }}
          onClose={() => {
            setDeepLinkPost(null)
            window.history.replaceState({}, '', '/feed')
          }}
          onLikeToggle={() => {}}
          onCommentAdded={() => {}}
          currentUserId={currentUserId}
        />
      )}
    </div>
  )
}
