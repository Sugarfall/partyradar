'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Ticket, Calendar, MapPin, Loader2 } from 'lucide-react'
import { EventTypeBadge } from '@/components/ui/Badge'
import { formatPrice } from '@/lib/currency'
import type { Ticket as TicketType } from '@partyradar/shared'

export default function TicketsPage() {
  const { dbUser, loading } = useAuth()
  const router = useRouter()

  const { data, isLoading } = useSWR<{ data: (TicketType & { qrDataUrl: string })[] }>(
    dbUser ? '/tickets/my' : null,
    fetcher
  )

  useEffect(() => {
    if (!loading && !dbUser && typeof window !== 'undefined') router.push('/login')
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
        <div className="text-center py-12">
          <Ticket size={48} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 mb-2">No tickets yet</p>
          <Link href="/discover" className="text-accent text-sm hover:underline">Browse events</Link>
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
                    <img
                      src={ticket.qrDataUrl}
                      alt="Ticket QR"
                      className="w-40 h-40 rounded-lg"
                    />
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
