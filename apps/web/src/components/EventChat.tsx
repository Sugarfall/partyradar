'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { useAuth } from '@/hooks/useAuth'
import { DEV_MODE } from '@/lib/firebase'
import { API_ORIGIN } from '@/lib/api'
import { Send, X, MessageCircle, Zap } from 'lucide-react'

interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  senderPhoto?: string
  text: string
  createdAt: string
}

interface TypingPayload {
  name: string
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function Avatar({ name, photo, size = 28 }: { name: string; photo?: string; size?: number }) {
  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '1px solid rgba(var(--accent-rgb),0.2)',
          flexShrink: 0,
        }}
      />
    )
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(var(--accent-rgb),0.12)',
        border: '1px solid rgba(var(--accent-rgb),0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 900,
        color: 'var(--accent)',
        flexShrink: 0,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export default function EventChat({ eventId, eventName, hostId, hostName }: { eventId: string; eventName: string; hostId?: string; hostName?: string }) {
  const { dbUser, firebaseUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState<string | null>(null)
  const [onlineCount, setOnlineCount] = useState(1)
  const [hostOnline, setHostOnline] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (messages.length > 0) scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (!open) return

    // ── DEV MODE: simulate demo messages ──────────────────────────────────────
    if (DEV_MODE) {
      setTimeout(() => {
        setMessages([
          {
            id: '1',
            senderId: hostId ?? 'host',
            senderName: hostName ?? 'Event Host',
            text: 'Welcome everyone! Doors open at 10pm, see you there 🎉',
            createdAt: new Date(Date.now() - 600000).toISOString(),
            isHost: true,
          } as any,
          {
            id: '2',
            senderId: 'other',
            senderName: 'Alex Rivera',
            text: 'Anyone else already here? Queue is mad 🔥',
            createdAt: new Date(Date.now() - 300000).toISOString(),
          },
          {
            id: '3',
            senderId: 'other2',
            senderName: 'Jamie K',
            text: 'Just arrived, vibes are immaculate',
            createdAt: new Date(Date.now() - 120000).toISOString(),
          },
          {
            id: '4',
            senderId: 'other',
            senderName: 'Alex Rivera',
            text: 'DJ set starts in 20 mins apparently',
            createdAt: new Date(Date.now() - 60000).toISOString(),
          },
        ])
        setOnlineCount(12)
        setHostOnline(true)
      }, 1000)
      return
    }

    // ── Real socket connection ────────────────────────────────────────────────
    if (!dbUser) return

    let cancelled = false

    async function connect() {
      const token = firebaseUser ? await firebaseUser.getIdToken() : undefined
      if (cancelled) return

      const socket = io(API_ORIGIN, {
        auth: token ? { token } : {},
        transports: ['websocket', 'polling'],
      })

      socketRef.current = socket

      socket.on('connect', () => {
        socket.emit('join-event', eventId)
      })

      socket.on('message-history', (history: ChatMessage[]) => {
        setMessages(history)
      })

      socket.on('message', (msg: ChatMessage) => {
        setMessages((prev) => [...prev, msg])
      })

      socket.on('typing', (payload: TypingPayload) => {
        setTyping(payload.name)
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = setTimeout(() => setTyping(null), 3000)
      })

      socket.on('online-count', (count: number) => {
        setOnlineCount(count)
      })

      socket.on('host-presence', (online: boolean) => {
        setHostOnline(online)
      })
    }

    connect()

    return () => {
      cancelled = true
      if (socketRef.current) {
        socketRef.current.off()
        socketRef.current.emit('leave-event', eventId)
        socketRef.current.disconnect()
        socketRef.current = null
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [open, dbUser, firebaseUser, eventId])

  function sendMessage() {
    const text = input.trim()
    if (!text) return

    if (DEV_MODE && dbUser) {
      const mockMsg: ChatMessage = {
        id: `mock_${Date.now()}`,
        senderId: dbUser.id,
        senderName: dbUser.displayName ?? 'You',
        text,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, mockMsg])
      setInput('')
      return
    }

    if (socketRef.current?.connected) {
      socketRef.current.emit('message', { eventId, text })
      setInput('')
    }
    // If not connected, don't clear input so user can retry — no ghost messages
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
      return
    }

    // Typing indicator — debounced
    if (!DEV_MODE && socketRef.current) {
      socketRef.current.emit('typing', eventId)
    }
  }

  const myId = dbUser?.id ?? null

  return (
    <>
      {/* ── Chat trigger button ── */}
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          borderRadius: 8,
          background: 'rgba(var(--accent-rgb),0.07)',
          border: '1px solid rgba(var(--accent-rgb),0.3)',
          color: 'var(--accent)',
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: '0.12em',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <MessageCircle size={13} />
        LIVE CHAT
      </button>

      {/* ── Slide-up chat panel ── */}
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            pointerEvents: 'none',
          }}
        >
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(4,4,13,0.6)',
              backdropFilter: 'blur(4px)',
              pointerEvents: 'all',
            }}
          />

          {/* Panel */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '60vh',
              background: '#04040d',
              border: '1px solid rgba(var(--accent-rgb),0.2)',
              borderBottom: 'none',
              borderRadius: '16px 16px 0 0',
              boxShadow: '0 -8px 40px rgba(var(--accent-rgb),0.1)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              pointerEvents: 'all',
              animation: 'slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid rgba(var(--accent-rgb),0.1)',
                background: 'rgba(var(--accent-rgb),0.03)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#00ff88',
                    boxShadow: '0 0 8px rgba(0,255,136,0.7)',
                    animation: 'pulse 2s ease-in-out infinite',
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: '0.16em',
                    color: 'var(--accent)',
                  }}
                >
                  LIVE CHAT
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'rgba(var(--accent-rgb),0.5)',
                  }}
                >
                  ● {onlineCount} online
                </span>
                {/* Host status */}
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: 4,
                    letterSpacing: '0.08em',
                    background: hostOnline ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${hostOnline ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    color: hostOnline ? '#00ff88' : 'rgba(74,96,128,0.5)',
                  }}
                >
                  HOST {hostOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'rgba(var(--accent-rgb),0.35)',
                    letterSpacing: '0.1em',
                    maxWidth: 140,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {eventName}
                </span>
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'rgba(var(--accent-rgb),0.4)',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Messages list */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {messages.length === 0 && (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: 0.4,
                  }}
                >
                  <MessageCircle size={28} style={{ color: 'rgba(var(--accent-rgb),0.4)' }} />
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(var(--accent-rgb),0.5)', letterSpacing: '0.12em' }}>
                    NO MESSAGES YET
                  </p>
                  <p style={{ fontSize: 10, color: 'rgba(74,96,128,0.6)' }}>Be the first to say something!</p>
                </div>
              )}

              {messages.map((msg) => {
                const isOwn = msg.senderId === myId
                const isMsgHost = msg.senderId === hostId || (msg as any).isHost
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      flexDirection: isOwn ? 'row-reverse' : 'row',
                      alignItems: 'flex-end',
                      gap: 8,
                    }}
                  >
                    {!isOwn && (
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <Avatar name={msg.senderName} photo={msg.senderPhoto} size={26} />
                        {isMsgHost && (
                          <div style={{
                            position: 'absolute', bottom: -2, right: -2,
                            width: 10, height: 10, borderRadius: '50%',
                            background: '#ffd600', border: '2px solid #04040d',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 6,
                          }}>★</div>
                        )}
                      </div>
                    )}

                    <div
                      style={{
                        maxWidth: '72%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        alignItems: isOwn ? 'flex-end' : 'flex-start',
                      }}
                    >
                      {!isOwn && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: isMsgHost ? '#ffd600' : 'var(--accent)', letterSpacing: '0.06em' }}>
                            {msg.senderName}
                          </span>
                          {isMsgHost && (
                            <span style={{
                              fontSize: 7, fontWeight: 900, padding: '1px 4px', borderRadius: 3,
                              background: 'rgba(255,214,0,0.15)', border: '1px solid rgba(255,214,0,0.3)',
                              color: '#ffd600', letterSpacing: '0.1em',
                            }}>HOST</span>
                          )}
                        </div>
                      )}

                      <div
                        style={{
                          padding: '8px 12px',
                          borderRadius: isOwn ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                          background: isOwn
                            ? 'rgba(255,0,110,0.12)'
                            : isMsgHost
                            ? 'rgba(255,214,0,0.06)'
                            : 'rgba(var(--accent-rgb),0.06)',
                          border: isOwn
                            ? '1px solid rgba(255,0,110,0.25)'
                            : isMsgHost
                            ? '1px solid rgba(255,214,0,0.2)'
                            : '1px solid rgba(var(--accent-rgb),0.12)',
                          fontSize: 13,
                          color: isOwn ? '#fce7f3' : '#e0f2fe',
                          lineHeight: 1.4,
                          wordBreak: 'break-word',
                        }}
                      >
                        {msg.text}
                      </div>

                      <span style={{ fontSize: 9, color: 'rgba(74,96,128,0.5)' }}>
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>

                    {isOwn && <Avatar name={dbUser?.displayName ?? 'You'} photo={dbUser?.photoUrl ?? undefined} size={26} />}
                  </div>
                )
              })}

              {/* Typing indicator */}
              {typing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 3, padding: '6px 10px', borderRadius: 12, background: 'rgba(var(--accent-rgb),0.05)', border: '1px solid rgba(var(--accent-rgb),0.08)' }}>
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: 'rgba(var(--accent-rgb),0.4)',
                          animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: 9, color: 'rgba(74,96,128,0.5)', fontStyle: 'italic' }}>
                    {typing} is typing...
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div
              style={{
                padding: '10px 12px',
                borderTop: '1px solid rgba(var(--accent-rgb),0.1)',
                background: 'rgba(var(--accent-rgb),0.02)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0,
              }}
            >
              {!dbUser ? (
                <p style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'rgba(74,96,128,0.5)', fontWeight: 700, letterSpacing: '0.08em' }}>
                  LOG IN TO CHAT
                </p>
              ) : (
                <>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Say something..."
                    maxLength={500}
                    style={{
                      flex: 1,
                      background: 'rgba(4,4,13,0.8)',
                      border: '1px solid rgba(var(--accent-rgb),0.15)',
                      borderRadius: 10,
                      padding: '9px 13px',
                      fontSize: 13,
                      color: '#e0f2fe',
                      outline: 'none',
                      caretColor: 'var(--accent)',
                    }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim()}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: input.trim() ? 'rgba(var(--accent-rgb),0.15)' : 'rgba(var(--accent-rgb),0.04)',
                      border: `1px solid ${input.trim() ? 'rgba(var(--accent-rgb),0.4)' : 'rgba(var(--accent-rgb),0.1)'}`,
                      color: input.trim() ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: input.trim() ? 'pointer' : 'default',
                      transition: 'all 0.15s',
                      flexShrink: 0,
                    }}
                  >
                    <Zap size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  )
}
