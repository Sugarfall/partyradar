'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import dynamic from 'next/dynamic'

// RadarClient uses Mapbox GL which is browser-only — load dynamically with SSR off
const RadarClient = dynamic(() => import('@/components/radar/RadarClient'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
      <Loader2 size={24} className="animate-spin text-party-gold" />
    </div>
  ),
})

export default function RadarPage() {
  return (
    <Suspense fallback={null}>
      <RadarClient />
    </Suspense>
  )
}
