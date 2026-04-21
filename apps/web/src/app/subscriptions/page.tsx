'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** /subscriptions is deprecated — redirect to /pricing */
export default function SubscriptionsPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/pricing') }, [router])
  return null
}
