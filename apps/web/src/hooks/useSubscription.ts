'use client'

import useSWR from 'swr'
import { fetcher, api } from '@/lib/api'
import type { Subscription } from '@partyradar/shared'

export function useSubscription() {
  const { data, isLoading, mutate } = useSWR<{ data: Subscription | null }>(
    '/subscriptions/status',
    fetcher
  )

  return { subscription: data?.data, isLoading, mutate }
}

export async function checkoutSubscription(tier: 'BASIC' | 'PRO' | 'PREMIUM') {
  const res = await api.post<{ data: { url: string } }>('/subscriptions/checkout', { tier })
  if (res.data.url) window.location.href = res.data.url
}

export async function openBillingPortal() {
  const res = await api.post<{ data: { url: string } }>('/subscriptions/portal')
  if (res.data.url) window.location.href = res.data.url
}
