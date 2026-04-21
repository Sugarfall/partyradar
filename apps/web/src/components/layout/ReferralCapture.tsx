'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { captureReferral } from '@/lib/referral'

/**
 * Invisible component mounted once in the root layout.
 * Watches every navigation for a `?ref=CODE` query param and stores the code
 * in localStorage (30-day TTL) so it survives OAuth redirects, email
 * verification, and any navigation up to the moment of signup.
 *
 * Reads from `window.location` directly rather than `useSearchParams()` to
 * avoid needing a Suspense boundary in the root layout.
 */
export default function ReferralCapture() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('ref')
    if (code) captureReferral(code)
  }, [pathname])

  return null
}
