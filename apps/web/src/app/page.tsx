'use client'

import { Component, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
// Static import so FlatLanding is always bundled — never depends on a lazy load
// that could fail when the error boundary needs to render its fallback
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
          style={{ borderColor: 'rgba(var(--accent-rgb),0.1)', borderTopColor: 'var(--accent)', boxShadow: '0 0 20px rgba(var(--accent-rgb),0.3)' }}
        />
      </div>
    ),
  }
)

interface ErrorBoundaryState { hasError: boolean }

class GlobeErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error) {
    console.error('[PartyRadar] Globe failed, using flat fallback:', error?.message)
  }
  render() {
    if (this.state.hasError) {
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
