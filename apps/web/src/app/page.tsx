'use client'

import dynamic from 'next/dynamic'

const GlobeLanding = dynamic(
  () => import('@/components/globe/GlobeLanding'),
  {
    ssr: false,
    loading: () => (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center"
        style={{ background: '#04040d' }}
      >
        <div
          className="w-16 h-16 rounded-full border-2 animate-spin"
          style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)', boxShadow: '0 0 20px rgba(var(--accent-rgb),0.3)' }}
        />
      </div>
    ),
  }
)

export default function Home() {
  return <GlobeLanding />
}
