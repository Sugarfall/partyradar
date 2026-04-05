'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Check, Ticket, Compass, Zap } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'

function SuccessContent() {
  const params = useSearchParams()
  const eventId = params.get('event_id')
  const [show, setShow] = useState(false)

  useEffect(() => {
    setTimeout(() => setShow(true), 100)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#04040d' }}>
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(0,255,136,0.06) 0%, transparent 70%)' }} />
      </div>

      <div
        className="w-full max-w-sm text-center transition-all duration-700"
        style={{ opacity: show ? 1 : 0, transform: show ? 'translateY(0)' : 'translateY(20px)' }}
      >
        {/* Success ring */}
        <div className="relative mx-auto mb-8" style={{ width: 100, height: 100 }}>
          <div className="absolute inset-0 rounded-full animate-ping"
            style={{ background: 'rgba(0,255,136,0.1)', animationDuration: '1.5s' }} />
          <div className="absolute inset-0 rounded-full"
            style={{ border: '2px solid rgba(0,255,136,0.3)', boxShadow: '0 0 40px rgba(0,255,136,0.3)' }} />
          <div className="w-full h-full rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,255,136,0.08)', border: '2px solid #00ff88', boxShadow: '0 0 24px rgba(0,255,136,0.4)' }}>
            <Check size={40} strokeWidth={3} style={{ color: '#00ff88' }} />
          </div>
        </div>

        <p className="text-[10px] font-bold tracking-[0.35em] mb-2" style={{ color: 'rgba(0,255,136,0.5)' }}>
          PAYMENT CONFIRMED
        </p>
        <h1 className="text-3xl font-black mb-2" style={{ color: '#e0f2fe' }}>YOU'RE IN!</h1>
        <p className="text-sm mb-8" style={{ color: 'rgba(224,242,254,0.5)' }}>
          Your ticket has been issued. Show the QR code at the door.
        </p>

        {/* Divider */}
        <div className="h-px mb-8" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.2), transparent)' }} />

        <div className="space-y-3">
          <Link href="/profile"
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm"
            style={{
              background: 'linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,229,255,0.1))',
              border: '1px solid rgba(0,255,136,0.45)',
              color: '#00ff88',
              boxShadow: '0 0 24px rgba(0,255,136,0.15)',
              letterSpacing: '0.12em',
            }}>
            <Ticket size={15} /> VIEW MY TICKET
          </Link>

          {eventId && (
            <Link href={`/events/${eventId}`}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm"
              style={{ border: '1px solid rgba(0,229,255,0.2)', color: 'rgba(0,229,255,0.7)', letterSpacing: '0.1em' }}>
              <Zap size={14} /> BACK TO EVENT
            </Link>
          )}

          <Link href="/discover"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm"
            style={{ color: 'rgba(74,96,128,0.6)', letterSpacing: '0.1em' }}>
            <Compass size={14} /> DISCOVER MORE
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#04040d' }}>
        <div className="w-10 h-10 border-2 rounded-full animate-spin"
          style={{ borderColor: 'rgba(0,255,136,0.1)', borderTopColor: '#00ff88' }} />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
