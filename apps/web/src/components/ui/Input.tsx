import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-[11px] font-bold tracking-widest uppercase">{label}</label>}
      <input
        {...props}
        className={`input-field ${error ? 'border-red-500 focus:ring-red-500/50' : ''} ${className}`}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

export function Textarea({ label, error, className = '', ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-[11px] font-bold tracking-widest uppercase">{label}</label>}
      <textarea
        {...props}
        className={`input-field resize-none ${error ? 'border-red-500' : ''} ${className}`}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

export function Select({ label, error, className = '', children, ...props }: TextareaHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-[11px] font-bold tracking-widest uppercase">{label}</label>}
      <select
        {...props}
        className={`input-field ${error ? 'border-red-500' : ''} ${className}`}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
