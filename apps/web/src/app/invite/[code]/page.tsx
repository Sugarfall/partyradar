'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { captureReferral } from '@/lib/referral'
import { useAuth } from '@/hooks/useAuth'
import { Zap, Gift } from 'lucide-react'

/**
 * Pretty shareable invite link: partyradar.app/invite/ABC123
 * Captures the referral code, then routes the visitor onward:
 *  - already logged in → /discover
 *  - not logged in → /register (the banner there will acknowledge the invite)
 */
export default function InvitePage() {
  const router = useRouter()
  const params = useParams<{ code?: string }>()
  const { dbUser } = useAuth()

  useEffect(() => {
    const code = params?.code
    if (code) captureReferral(code)

    // Small delay so the splash is visible and the localStorage write completes
    const t = setTimeout(() => {
      router.replace(dbUser ? '/discover' : '/register')
    }, 600)

    return () => clearTimeout(t)
  }, [params?.code, dbUser, router])

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: '#04040d' }}
    >
      <div className="flex items-center gap-2 mb-6 animate-fade-up">
        <Zap
          size={20}
          fill="rgba(var(--accent-rgb),0.2)"
          style={{
            color: 'var(--accent)',
            filter: 'drop-shadow(0 0 8px rgba(var(--accent-rgb),0.8))',
          }}
        />
        <span
          className="font-black text-sm tracking-[0.2em]"
          style={{ color: 'var(--accent)', textShadow: '0 0 16px rgba(var(--accent-rgb),0.6)' }}
        >
          PARTYRADAR
        </span>
      </div>

      <div className="max-w-sm w-full text-center animate-fade-up space-y-4">
        <div
          className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
          style={{
            background: 'rgba(0,255,136,0.08)',
            border: '1px solid rgba(0,255,136,0.3)',
            boxShadow: '0 0 30px rgba(0,255,136,0.15)',
          }}
        >
          <Gift size={26} style={{ color: '#00ff88' }} />
        </div>

        <p className="text-[10px] font-bold tracking-[0.3em]" style={{ color: 'rgba(0,255,136,0.6)' }}>
          YOU&apos;VE BEEN INVITED
        </p>

        <h1 className="text-2xl font-black" style={{ color: '#e0f2fe', letterSpacing: '0.03em' }}>
          Join PartyRadar
        </h1>

        <p className="text-sm" style={{ color: 'rgba(224,242,254,0.55)', lineHeight: 1.6 }}>
          Taking you to sign up…
        </p>

        <div className="pt-4">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin mx-auto"
            style={{ borderColor: 'rgba(var(--accent-rgb),0.15)', borderTopColor: 'var(--accent)' }}
          />
        </div>
      </div>
    </div>
  )
}
