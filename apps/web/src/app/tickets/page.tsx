'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Ticket, Calendar, MapPin, Loader2 } from 'lucide-react'
import { EventTypeBadge } from '@/components/ui/Badge'
import TicketQR from '@/components/ui/TicketQR'
import { formatPrice } from '@/lib/currency'
import { loginHref } from '@/lib/authRedirect'
import type { Ticket as TicketType } from '@partyradar/shared'

export default function TicketsPage() {
  const { dbUser, loading } = useAuth()
  const router = useRouter()

  const { data, isLoading } = useSWR<{ data: TicketType[] }>(
    dbUser ? '/tickets/my' : null,
    fetcher
  )

  useEffect(() => {
    if (!loading && !dbUser && typeof window !== 'undefined') router.push(loginHref('/tickets'))
  }, [dbUser, loading, router])

  if (loading) return null
  if (!dbUser) return null

  const tickets = data?.data ?? []

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24 md:pb-6">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Ticket size={22} className="text-accent" />
        My Tickets
      </h1>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-accent" size={28} />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 px-6">
          <div
            className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center"
            style={{
              background: 'rgba(var(--accent-rgb),0.08)',
              border: '1px solid rgba(var(--accent-rgb),0.2)',
            }}
          >
            <Ticket size={36} style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-lg font-black mb-2" style={{ color: '#e0f2fe' }}>
            No tickets yet
          </h2>
          <p className="text-sm mb-6 max-w-xs mx-auto leading-relaxed" style={{ color: 'rgba(224,242,254,0.5)' }}>
            Book a club night, concert or home party and your ticket QR codes will live here.
          </p>
          <Link
            href="/discover"
            className="inline-block px-6 py-3 rounded-xl font-black text-sm"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.18), rgba(61,90,254,0.12))',
              border: '1px solid rgba(var(--accent-rgb),0.5)',
              color: 'var(--accent)',
              letterSpacing: '0.1em',
            }}
          >
            BROWSE EVENTS
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="card overflow-hidden">
              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <EventTypeBadge type={ticket.event.type} />
                  {ticket.scannedAt && (
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">Used</span>
                  )}
                </div>

                <h3 className="font-semibold mb-2">{ticket.event.name}</h3>

                <div className="space-y-1 text-xs text-zinc-500 mb-4">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={11} />
                    {new Date(ticket.event.startsAt).toLocaleDateString('en-US', {
                      weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin size={11} />
                    {ticket.event.neighbourhood}
                  </div>
                </div>

                {/* QR Code */}
                <div className="flex justify-center border-t border-border pt-4">
                  {ticket.scannedAt ? (
                    <div className="text-center text-zinc-500">
                      <p className="text-sm">Ticket scanned</p>
                      <p className="text-xs">{new Date(ticket.scannedAt).toLocaleString()}</p>
                    </div>
                  ) : (
                    <TicketQR qrCode={ticket.qrCode} size={160} />
                  )}
                </div>

                <p className="text-center text-xs text-zinc-600 mt-2">
                  {formatPrice(ticket.pricePaid)} · {ticket.qrCode?.slice(0, 8) ?? '--------'}...
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
