import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'green'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

const variantStyles: Record<string, CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.12), rgba(61,90,254,0.12))',
    border: '1px solid rgba(var(--accent-rgb),0.45)',
    color: 'var(--accent)',
    boxShadow: '0 0 14px rgba(var(--accent-rgb),0.18)',
    letterSpacing: '0.06em',
  },
  secondary: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(224,242,254,0.65)',
    letterSpacing: '0.06em',
  },
  ghost: {
    background: 'transparent',
    border: '1px solid transparent',
    color: 'rgba(74,96,128,0.85)',
    letterSpacing: '0.06em',
  },
  danger: {
    background: 'rgba(255,0,110,0.1)',
    border: '1px solid rgba(255,0,110,0.4)',
    color: '#ff006e',
    boxShadow: '0 0 12px rgba(255,0,110,0.15)',
    letterSpacing: '0.06em',
  },
  green: {
    background: 'rgba(0,255,136,0.1)',
    border: '1px solid rgba(0,255,136,0.4)',
    color: '#00ff88',
    boxShadow: '0 0 12px rgba(0,255,136,0.15)',
    letterSpacing: '0.06em',
  },
}

const sizeClasses = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  children,
  className = '',
  disabled,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 font-bold rounded-lg
        transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed
        ${sizeClasses[size]} ${className}
      `}
      style={{ ...variantStyles[variant], ...style }}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}
