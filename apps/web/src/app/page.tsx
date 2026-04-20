'use client'

import { Component, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
// Static import — always bundled, never a lazy-load failure in the fallback path
import FlatLanding from '@/components/globe/FlatLanding'

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
          style={{
            borderColor: 'rgba(0,229,255,0.1)',
            borderTopColor: '#00e5ff',
            boxShadow: '0 0 20px rgba(0,229,255,0.3)',
          }}
        />
      </div>
    ),
  }
)

interface EBState { hasError: boolean }

class GlobeErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): EBState {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    // Silently fall back — no need to surface this to the user
    console.warn('[PartyRadar] Globe failed, falling back to flat UI:', error?.message)
  }

  render() {
    if (this.state.hasError) {
      // FlatLanding is safe: useAuth() returns a fallback when context is missing,
      // and useRouter() is always available inside Next.js App Router pages.
      return <FlatLanding />
    }
    return this.props.children
  }
}

export default function Home() {
  return (
    <GlobeErrorBoundary>
      <GlobeLanding />
    </GlobeErrorBoundary>
  )
}
