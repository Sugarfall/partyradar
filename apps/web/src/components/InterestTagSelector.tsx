'use client'

import { useState } from 'react'

const MUSIC_GENRES = [
  'techno', 'house', 'drum and bass', 'hip-hop', 'jazz',
  'r&b', 'afrobeats', 'reggaeton', 'pop', 'indie', 'rock',
]

const VIBE_TAGS = [
  'warehouse', 'rooftop', 'intimate', 'massive', 'exclusive', 'outdoor',
]

interface InterestTagSelectorProps {
  /** Currently selected interest tags */
  selected?: string[]
  /** Called when the selection changes */
  onChange?: (interests: string[]) => void
  /** Max number of selectable tags (default: unlimited) */
  maxSelect?: number
}

function Tag({
  label,
  active,
  onToggle,
}: {
  label: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        padding: '5px 12px',
        borderRadius: 999,
        border: active ? '1px solid rgba(0,229,255,0.55)' : '1px solid rgba(74,96,128,0.25)',
        background: active ? 'rgba(0,229,255,0.12)' : 'rgba(4,4,13,0.5)',
        color: active ? '#00e5ff' : 'rgba(74,96,128,0.6)',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        letterSpacing: '0.06em',
        cursor: 'pointer',
        transition: 'all 0.15s',
        boxShadow: active ? '0 0 10px rgba(0,229,255,0.1)' : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 9,
        fontWeight: 900,
        letterSpacing: '0.2em',
        color: 'rgba(0,229,255,0.4)',
        marginBottom: 8,
      }}
    >
      {children}
    </p>
  )
}

export default function InterestTagSelector({
  selected: externalSelected,
  onChange,
  maxSelect,
}: InterestTagSelectorProps) {
  const [internalSelected, setInternalSelected] = useState<string[]>([])

  const selected = externalSelected ?? internalSelected

  function toggle(tag: string) {
    let next: string[]
    if (selected.includes(tag)) {
      next = selected.filter((t) => t !== tag)
    } else {
      if (maxSelect !== undefined && selected.length >= maxSelect) return
      next = [...selected, tag]
    }

    if (onChange) {
      onChange(next)
    } else {
      setInternalSelected(next)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Music genres */}
      <div>
        <SectionLabel>MUSIC GENRES</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {MUSIC_GENRES.map((tag) => (
            <Tag
              key={tag}
              label={tag}
              active={selected.includes(tag)}
              onToggle={() => toggle(tag)}
            />
          ))}
        </div>
      </div>

      {/* Vibe */}
      <div>
        <SectionLabel>VIBE</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {VIBE_TAGS.map((tag) => (
            <Tag
              key={tag}
              label={tag}
              active={selected.includes(tag)}
              onToggle={() => toggle(tag)}
            />
          ))}
        </div>
      </div>

      {/* Selection summary */}
      {selected.length > 0 && (
        <p style={{ fontSize: 10, color: 'rgba(0,229,255,0.4)', letterSpacing: '0.08em' }}>
          {selected.length} selected{maxSelect !== undefined ? ` / ${maxSelect} max` : ''}
        </p>
      )}
    </div>
  )
}
