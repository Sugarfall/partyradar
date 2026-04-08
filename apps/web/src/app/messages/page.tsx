'use client'

import { useState, useEffect, useRef } from 'react'
import { MessageCircle, Send, ArrowLeft, Search, LogIn, Zap, User, Users, MapPin, Heart } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { API_URL } from '@/lib/api'

interface OtherUser {
  id: string
  displayName: string
  photoUrl?: string | null
  username?: string
}

interface Conversation {
  id: string
  updatedAt: string
  other: OtherUser | null
  lastMessage: { text: string; senderId: string; createdAt: string } | null
}

interface DmMessage {
  id: string
  senderId: string
  senderName: string
  senderPhoto?: string | null
  text: string
  createdAt: string
}

interface FeedItem {
  type: 'POST' | 'CHECKIN'
  user: { id: string; displayName: string; photoUrl?: string | null; username?: string }
  venue?: { id: string; name: string } | null
  event?: { id: string; name: string } | null
  post?: { id: string; text: string; imageUrl?: string | null; isStory: boolean; likesCount: number } | null
  checkin?: { id: string; crowdLevel?: string | null } | null
  createdAt: string
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function Avatar({ user, size = 40 }: { user: OtherUser; size?: number }) {
  return user.photoUrl ? (
    <img src={user.photoUrl} alt="" className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
      style={{ width: size, height: size, background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.3)', color: '#00e5ff' }}>
      {user.displayName[0]?.toUpperCase()}
    </div>
  )
}

// ── Community feed ─────────────────────────────────────────────────────────────
function CommunityFeed() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_URL}/feed/discover`)
      .then(r => r.json())
      .then(j => setItems(j.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
    // Refresh every 60s
    const t = setInterval(() => {
      fetch(`${API_URL}/feed/discover`)
        .then(r => r.json())
        .then(j => setItems(j.data ?? []))
        .catch(() => {})
    }, 60000)
    return () => clearInterval(t)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
    </div>
  )

  if (items.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Users size={32} style={{ color: 'rgba(0,229,255,0.15)' }} />
      <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>NO ACTIVITY YET</p>
      <p className="text-[11px] text-center max-w-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>
        Activity from venues and events will appear here as the night unfolds
      </p>
    </div>
  )

  return (
    <div className="px-4 py-3 space-y-3 pb-24">
      {items.map((item, i) => {
        const isPost = item.type === 'POST'
        return (
          <div key={i} className="p-3 rounded-2xl"
            style={{ background: 'rgba(7,7,26,0.85)', border: '1px solid rgba(0,229,255,0.07)' }}>
            <div className="flex items-start gap-3">
              <Avatar user={item.user} size={36} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold" style={{ color: '#e0f2fe' }}>{item.user.displayName}</span>
                  {item.venue && (
                    <span className="flex items-center gap-0.5 text-[10px]" style={{ color: 'rgba(0,229,255,0.5)' }}>
                      <MapPin size={9} />{item.venue.name}
                    </span>
                  )}
                  {item.event && (
                    <Link href={`/events/${item.event.id}`}
                      className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: 'rgba(61,90,254,0.1)', border: '1px solid rgba(61,90,254,0.25)', color: '#3d5afe' }}>
                      {item.event.name}
                    </Link>
                  )}
                </div>
                {isPost && item.post?.text && (
                  <p className="text-sm mt-1 leading-snug" style={{ color: 'rgba(224,242,254,0.85)' }}>
                    {item.post.text}
                  </p>
                )}
                {!isPost && item.checkin && (
                  <p className="text-xs mt-1" style={{ color: 'rgba(224,242,254,0.5)' }}>
                    📍 Checked in{item.checkin.crowdLevel ? ` · ${item.checkin.crowdLevel.replace('_', ' ')} crowd` : ''}
                  </p>
                )}
                {isPost && item.post?.imageUrl && (
                  <img src={item.post.imageUrl} alt="" className="mt-2 rounded-xl w-full object-cover"
                    style={{ maxHeight: 200 }} />
                )}
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px]" style={{ color: 'rgba(224,242,254,0.2)' }}>
                    {timeAgo(item.createdAt)}
                  </span>
                  {isPost && item.post && item.post.likesCount > 0 && (
                    <span className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,0,110,0.5)' }}>
                      <Heart size={9} fill="currentColor" /> {item.post.likesCount}
                    </span>
                  )}
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase"
                    style={{
                      background: isPost ? 'rgba(0,229,255,0.06)' : 'rgba(0,255,136,0.06)',
                      border: `1px solid ${isPost ? 'rgba(0,229,255,0.15)' : 'rgba(0,255,136,0.15)'}`,
                      color: isPost ? 'rgba(0,229,255,0.5)' : 'rgba(0,255,136,0.5)',
                    }}>
                    {isPost ? 'post' : 'check-in'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function MessagesPage() {
  const { dbUser } = useAuth()
  const [tab, setTab] = useState<'dms' | 'community'>('dms')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeConvo, setActiveConvo] = useState<string | null>(null)
  const [messages, setMessages] = useState<DmMessage[]>([])
  const [msgsLoading, setMsgsLoading] = useState(false)
  const [activeOther, setActiveOther] = useState<OtherUser | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<OtherUser[]>([])
  const [searching, setSearching] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = typeof window !== 'undefined' ? localStorage.getItem('partyradar_token') ?? '' : ''
  if (token) headers['Authorization'] = `Bearer ${token}`

  useEffect(() => {
    if (!dbUser) { setLoading(false); return }
    fetch(`${API_URL}/dm`, { headers })
      .then(r => r.json())
      .then(j => setConversations(j.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dbUser])

  useEffect(() => {
    if (!activeConvo) return
    setMsgsLoading(true)
    fetch(`${API_URL}/dm/${activeConvo}`, { headers })
      .then(r => r.json())
      .then(j => { setMessages(j.data?.messages ?? []); setActiveOther(j.data?.other ?? null) })
      .catch(() => {})
      .finally(() => setMsgsLoading(false))
  }, [activeConvo])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    const t = setTimeout(() => {
      setSearching(true)
      fetch(`${API_URL}/dm/users?q=${encodeURIComponent(search)}`, { headers })
        .then(r => r.json())
        .then(j => setSearchResults(j.data ?? []))
        .catch(() => {})
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  async function openOrCreateConvo(recipientId: string) {
    const res = await fetch(`${API_URL}/dm`, { method: 'POST', headers, body: JSON.stringify({ recipientId }) })
    const j = await res.json()
    if (j.data?.id) {
      setSearch(''); setSearchResults([])
      setActiveConvo(j.data.id)
      fetch(`${API_URL}/dm`, { headers }).then(r => r.json()).then(d => setConversations(d.data ?? [])).catch(() => {})
    }
  }

  async function sendMessage() {
    if (!text.trim() || !activeConvo || sending) return
    setSending(true)
    const draft = text.trim()
    setText('')
    try {
      const res = await fetch(`${API_URL}/dm/${activeConvo}`, { method: 'POST', headers, body: JSON.stringify({ text: draft }) })
      const j = await res.json()
      if (j.data) setMessages(prev => [...prev, j.data])
    } catch { setText(draft) }
    finally { setSending(false) }
  }

  // ── Not logged in ────────────────────────────────────────────────────────────
  if (!dbUser && !loading && tab === 'dms') {
    return (
      <div className="min-h-screen" style={{ background: '#04040d', paddingTop: 56 }}>
        {/* Tab bar */}
        <div className="flex gap-1 px-4 pt-5 pb-3 max-w-xl mx-auto">
          {(['dms', 'community'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-xl text-[11px] font-black tracking-widest transition-all"
              style={{
                background: tab === t ? 'rgba(0,229,255,0.12)' : 'rgba(0,229,255,0.03)',
                border: `1px solid ${tab === t ? 'rgba(0,229,255,0.35)' : 'rgba(0,229,255,0.08)'}`,
                color: tab === t ? '#00e5ff' : 'rgba(74,96,128,0.5)',
              }}>
              {t === 'dms' ? '💬 MESSAGES' : '🌐 COMMUNITY'}
            </button>
          ))}
        </div>
        <div className="flex flex-col items-center justify-center gap-4 px-4 py-20">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.1)' }}>
            <MessageCircle size={28} style={{ color: 'rgba(0,229,255,0.3)' }} />
          </div>
          <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.6)' }}>LOG IN TO SEND MESSAGES</p>
          <div className="flex gap-2">
            <a href="/login" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black"
              style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}>
              <LogIn size={11} /> LOG IN
            </a>
            <a href="/discover" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black"
              style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.1)', color: 'rgba(0,229,255,0.5)' }}>
              <Zap size={11} /> DISCOVER
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ── Conversation chat view ────────────────────────────────────────────────────
  if (activeConvo) {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 3.5rem)', background: '#04040d' }}>
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
          style={{ background: 'rgba(4,4,13,0.95)', borderBottom: '1px solid rgba(0,229,255,0.1)', backdropFilter: 'blur(12px)' }}>
          <button onClick={() => { setActiveConvo(null); setMessages([]) }}
            className="p-1 rounded-lg" style={{ color: 'rgba(0,229,255,0.6)' }}>
            <ArrowLeft size={18} />
          </button>
          {activeOther && <Avatar user={activeOther} size={32} />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>{activeOther?.displayName ?? '...'}</p>
            {activeOther?.username && <p className="text-[10px]" style={{ color: 'rgba(0,229,255,0.4)' }}>@{activeOther.username}</p>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {msgsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <MessageCircle size={28} style={{ color: 'rgba(0,229,255,0.15)' }} />
              <p className="text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>Start the conversation</p>
            </div>
          ) : messages.map(m => {
            const isMe = m.senderId === dbUser?.id
            return (
              <div key={m.id} className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && activeOther && <Avatar user={activeOther} size={28} />}
                <div className="max-w-[72%]">
                  <div className="px-3 py-2 rounded-2xl text-sm"
                    style={isMe
                      ? { background: 'rgba(0,229,255,0.15)', border: '1px solid rgba(0,229,255,0.3)', color: '#e0f2fe', borderBottomRightRadius: 4 }
                      : { background: 'rgba(7,7,26,0.9)', border: '1px solid rgba(0,229,255,0.08)', color: '#e0f2fe', borderBottomLeftRadius: 4 }}>
                    {m.text}
                  </div>
                  <p className={`text-[9px] mt-0.5 ${isMe ? 'text-right' : 'text-left'}`}
                    style={{ color: 'rgba(224,242,254,0.2)' }}>{timeAgo(m.createdAt)}</p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
        <div className="flex-shrink-0 px-4 py-3 flex gap-2"
          style={{ background: 'rgba(4,4,13,0.95)', borderTop: '1px solid rgba(0,229,255,0.08)' }}>
          <input type="text" placeholder="Message..." value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-transparent outline-none"
            style={{ border: '1px solid rgba(0,229,255,0.15)', color: '#e0f2fe' }} />
          <button onClick={sendMessage} disabled={!text.trim() || sending}
            className="p-2.5 rounded-xl transition-all"
            style={{
              background: text.trim() ? 'rgba(0,229,255,0.15)' : 'rgba(0,229,255,0.04)',
              border: `1px solid ${text.trim() ? 'rgba(0,229,255,0.4)' : 'rgba(0,229,255,0.1)'}`,
              color: text.trim() ? '#00e5ff' : 'rgba(0,229,255,0.2)',
            }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    )
  }

  // ── Main tabs view ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-28" style={{ background: '#04040d', paddingTop: 56 }}>
      {/* Tab switcher */}
      <div className="flex gap-1 px-4 pt-5 pb-3 max-w-xl mx-auto">
        {(['dms', 'community'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 rounded-xl text-[11px] font-black tracking-widest transition-all"
            style={{
              background: tab === t ? 'rgba(0,229,255,0.12)' : 'rgba(0,229,255,0.03)',
              border: `1px solid ${tab === t ? 'rgba(0,229,255,0.35)' : 'rgba(0,229,255,0.08)'}`,
              color: tab === t ? '#00e5ff' : 'rgba(74,96,128,0.5)',
            }}>
            {t === 'dms' ? '💬 MESSAGES' : '🌐 COMMUNITY'}
          </button>
        ))}
      </div>

      {/* ── COMMUNITY tab ── */}
      {tab === 'community' && <CommunityFeed />}

      {/* ── DMs tab ── */}
      {tab === 'dms' && (
        <div className="px-4 max-w-xl mx-auto">
          {/* Search / new DM */}
          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(0,229,255,0.4)' }} />
            <input type="text" placeholder="Search users to message..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2.5 rounded-xl text-xs bg-transparent outline-none"
              style={{ border: '1px solid rgba(0,229,255,0.15)', color: '#e0f2fe' }} />
          </div>

          {/* Search results */}
          {search.trim() && (
            <div className="mb-3 rounded-xl overflow-hidden"
              style={{ border: '1px solid rgba(0,229,255,0.12)', background: 'rgba(7,7,26,0.95)' }}>
              {searching ? (
                <div className="py-4 flex justify-center">
                  <div className="w-4 h-4 rounded-full border-2 animate-spin"
                    style={{ borderColor: 'rgba(0,229,255,0.1)', borderTopColor: '#00e5ff' }} />
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-4 text-center text-xs" style={{ color: 'rgba(224,242,254,0.3)' }}>No users found</div>
              ) : searchResults.map(u => (
                <button key={u.id} onClick={() => openOrCreateConvo(u.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
                  style={{ borderBottom: '1px solid rgba(0,229,255,0.06)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,229,255,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <Avatar user={u} size={36} />
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#e0f2fe' }}>{u.displayName}</p>
                    {u.username && <p className="text-[10px]" style={{ color: 'rgba(0,229,255,0.4)' }}>@{u.username}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Conversations */}
          {!dbUser ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <MessageCircle size={28} style={{ color: 'rgba(0,229,255,0.15)' }} />
              <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>LOG IN TO MESSAGE PEOPLE</p>
              <a href="/login" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black"
                style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)', color: '#00e5ff' }}>
                <LogIn size={11} /> LOG IN
              </a>
            </div>
          ) : loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'rgba(0,229,255,0.04)' }} />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <User size={28} style={{ color: 'rgba(0,229,255,0.15)' }} />
              <p className="text-xs font-bold tracking-widest" style={{ color: 'rgba(74,96,128,0.5)' }}>NO MESSAGES YET</p>
              <p className="text-[11px] text-center" style={{ color: 'rgba(224,242,254,0.3)' }}>
                Search for a user above to start a conversation
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map(c => (
                <button key={c.id} onClick={() => setActiveConvo(c.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all"
                  style={{ background: 'rgba(7,7,26,0.8)', border: '1px solid rgba(0,229,255,0.08)' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,229,255,0.2)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(0,229,255,0.08)')}>
                  {c.other ? <Avatar user={c.other} size={44} /> : (
                    <div className="w-11 h-11 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)' }}>
                      <User size={18} style={{ color: 'rgba(0,229,255,0.3)' }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: '#e0f2fe' }}>
                      {c.other?.displayName ?? 'Unknown User'}
                    </p>
                    {c.lastMessage ? (
                      <p className="text-[11px] truncate" style={{ color: 'rgba(224,242,254,0.4)' }}>
                        {c.lastMessage.senderId === dbUser?.id ? 'You: ' : ''}{c.lastMessage.text}
                      </p>
                    ) : (
                      <p className="text-[11px]" style={{ color: 'rgba(0,229,255,0.3)' }}>No messages yet</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {c.lastMessage && (
                      <span className="text-[9px]" style={{ color: 'rgba(224,242,254,0.25)' }}>
                        {timeAgo(c.lastMessage.createdAt)}
                      </span>
                    )}
                    <MessageCircle size={12} style={{ color: 'rgba(0,229,255,0.2)' }} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
