import type { CSSProperties, ReactNode } from 'react'
import { EVENT_TYPE_BG, EVENT_TYPE_LABELS } from '@partyradar/shared'
import type { EventType } from '@partyradar/shared'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'pink' | 'purple' | 'blue' | 'gold' | 'green' | 'red'
  className?: string
}

const variantClasses: Record<string, string> = {
  default: 'border text-[10px] font-bold tracking-wider',
  pink: 'border text-[10px] font-bold tracking-wider',
  purple: 'border text-[10px] font-bold tracking-wider',
  blue: 'border text-[10px] font-bold tracking-wider',
  gold: 'border text-[10px] font-bold tracking-wider',
  green: 'border text-[10px] font-bold tracking-wider',
  red: 'border text-[10px] font-bold tracking-wider',
}

const variantStyles: Record<string, CSSProperties> = {
  default: { color: 'rgba(224,242,254,0.55)', border: '1px solid rgba(224,242,254,0.12)', background: 'rgba(4,4,13,0.5)' },
  pink: { color: '#ff006e', border: '1px solid rgba(255,0,110,0.35)', background: 'rgba(255,0,110,0.08)' },
  purple: { color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.35)', background: 'rgba(var(--accent-rgb),0.08)' },
  blue: { color: '#3d5afe', border: '1px solid rgba(61,90,254,0.35)', background: 'rgba(61,90,254,0.08)' },
  gold: { color: '#ffd600', border: '1px solid rgba(255,214,0,0.35)', background: 'rgba(255,214,0,0.08)' },
  green: { color: '#00ff88', border: '1px solid rgba(0,255,136,0.35)', background: 'rgba(0,255,136,0.08)' },
  red: { color: '#ff006e', border: '1px solid rgba(255,0,110,0.35)', background: 'rgba(255,0,110,0.08)' },
}

const TYPE_COLORS: Record<string, CSSProperties> = {
  HOME_PARTY: { color: '#ff006e', border: '1px solid rgba(255,0,110,0.4)', background: 'rgba(255,0,110,0.1)' },
  CLUB_NIGHT:  { color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.4)', background: 'rgba(var(--accent-rgb),0.1)' },
  CONCERT:     { color: '#3d5afe', border: '1px solid rgba(61,90,254,0.4)', background: 'rgba(61,90,254,0.1)' },
  PUB_NIGHT:   { color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.1)' },
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-widest ${variantClasses[variant]} ${className}`}
      style={variantStyles[variant]}
    >
      {children}
    </span>
  )
}

export function EventTypeBadge({ type }: { type: EventType }) {
  const style = TYPE_COLORS[type] ?? variantStyles['default']
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-widest"
      style={style}
    >
      {(EVENT_TYPE_LABELS[type] ?? type).toUpperCase()}
    </span>
  )
}
