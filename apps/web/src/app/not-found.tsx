import Link from 'next/link'
import { Zap, Radar } from 'lucide-react'

export default function NotFound() {
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center px-6"
      style={{ background: '#04040d' }}
    >
      <div className="flex items-center gap-3 mb-8">
        <Zap
          size={26}
          fill="rgba(var(--accent-rgb),0.2)"
          style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 10px rgba(var(--accent-rgb),0.9))' }}
        />
        <span className="font-black text-xl tracking-[0.3em]" style={{ color: 'var(--accent)' }}>
          PARTYRADAR
        </span>
      </div>

      <div
        className="w-full max-w-sm text-center"
        style={{
          background: 'rgba(8,12,24,0.95)',
          border: '1px solid rgba(var(--accent-rgb),0.18)',
          borderRadius: 16,
          padding: '40px 28px',
        }}
      >
        <div
          className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
          style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}
        >
          <Radar size={24} style={{ color: 'var(--accent)' }} />
        </div>
        <p className="text-xs font-black tracking-[0.25em] mb-2" style={{ color: 'rgba(var(--accent-rgb),0.7)' }}>
          OUT OF RANGE
        </p>
        <h1 className="text-2xl font-black mb-2" style={{ color: '#e0f2fe', letterSpacing: '0.04em' }}>
          404
        </h1>
        <p className="text-sm mb-7" style={{ color: 'rgba(224,242,254,0.5)' }}>
          We couldn&apos;t pick up that page on the radar.
        </p>

        <Link
          href="/discover"
          className="block w-full py-3 rounded-lg font-black text-sm transition-all"
          style={{
            background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.18), rgba(61,90,254,0.15))',
            border: '1px solid rgba(var(--accent-rgb),0.5)',
            color: 'var(--accent)',
            letterSpacing: '0.12em',
          }}
        >
          BACK TO DISCOVER
        </Link>
      </div>
    </div>
  )
}
