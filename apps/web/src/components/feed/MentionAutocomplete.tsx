'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

interface MentionUser {
  id: string
  username: string
  displayName: string
  photoUrl?: string | null
}

interface Props {
  /** The current full text of the input/textarea */
  value: string
  /** Called with the new text after a suggestion is picked */
  onChange: (newText: string) => void
  /** Current caret position inside `value` */
  caretPos: number
  /** Called after pick — parent should re-focus input and reset caret */
  onPicked?: (nextCaret: number) => void
  /** Anchor element (textarea/input) for positioning */
  anchorRef: React.RefObject<HTMLElement | null>
}

/**
 * Detects an "@word" token ending at the caret (no whitespace between the @
 * and the caret) and pops a small menu of username matches from
 * /api/users/search. Picking inserts "@{username} " and moves the caret past
 * it. Dismisses on Escape or when the @-token is broken.
 */
export default function MentionAutocomplete({ value, onChange, caretPos, onPicked, anchorRef }: Props) {
  const [results, setResults] = useState<MentionUser[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const debounceRef = useRef<number | null>(null)

  // Find current @token: the last "@" before caret that has no whitespace between it and caret.
  const tokenInfo = (() => {
    const left = value.slice(0, caretPos)
    const m = left.match(/(?:^|\s)@([\w.]{0,30})$/)
    if (!m) return null
    const query = m[1] ?? ''
    const tokenStart = caretPos - query.length - 1 // include the @
    return { query, tokenStart }
  })()

  // Fetch suggestions (debounced)
  useEffect(() => {
    if (!tokenInfo) {
      setResults([])
      return
    }
    const q = tokenInfo.query
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(async () => {
      if (!q) {
        setResults([])
        return
      }
      setLoading(true)
      try {
        const res = await api.get<{ data: MentionUser[] }>(`/users/search?q=${encodeURIComponent(q)}`)
        setResults((res?.data ?? []).slice(0, 6))
        setSelected(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 120)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [tokenInfo?.query])

  // Key nav — piggybacks on parent's keydown
  useEffect(() => {
    const el = anchorRef.current
    if (!el || !tokenInfo || results.length === 0) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const user = results[selected]
        if (user) pick(user)
      } else if (e.key === 'Escape') {
        setResults([])
      }
    }
    el.addEventListener('keydown', handler as EventListener)
    return () => el.removeEventListener('keydown', handler as EventListener)
  }, [results, selected, tokenInfo, anchorRef])

  function pick(user: MentionUser) {
    if (!tokenInfo) return
    const before = value.slice(0, tokenInfo.tokenStart)
    const after = value.slice(caretPos)
    const insertion = `@${user.username} `
    const next = before + insertion + after
    const nextCaret = (before + insertion).length
    onChange(next)
    setResults([])
    onPicked?.(nextCaret)
  }

  if (!tokenInfo || (results.length === 0 && !loading)) return null

  return (
    <div
      className="absolute left-3 right-3 rounded-xl overflow-hidden z-10"
      style={{
        bottom: 'calc(100% + 6px)',
        background: 'rgba(6,6,18,0.96)',
        border: '1px solid rgba(var(--accent-rgb),0.22)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        maxHeight: 220,
        overflowY: 'auto',
      }}
    >
      {loading && results.length === 0 && (
        <div className="px-3 py-2 text-xs" style={{ color: 'rgba(224,242,254,0.45)' }}>Searching…</div>
      )}
      {results.map((u, i) => (
        <button
          key={u.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); pick(u) }}
          onMouseEnter={() => setSelected(i)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
          style={{
            background: i === selected ? 'rgba(var(--accent-rgb),0.12)' : 'transparent',
            borderBottom: i < results.length - 1 ? '1px solid rgba(var(--accent-rgb),0.05)' : 'none',
          }}
        >
          {u.photoUrl
            ? <img src={u.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
            : <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0"
                   style={{ background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)' }}>
                {u.displayName[0]?.toUpperCase() ?? '?'}
              </div>}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black truncate" style={{ color: '#e0f2fe' }}>{u.displayName}</p>
            <p className="text-[10px] truncate" style={{ color: 'rgba(var(--accent-rgb),0.55)' }}>@{u.username}</p>
          </div>
        </button>
      ))}
    </div>
  )
}
