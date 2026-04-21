'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Phone, ShieldCheck } from 'lucide-react'

export default function PhoneVerifyPage() {
  const { dbUser, refreshUser } = useAuth()
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)

  async function sendCode() {
    if (!phone.trim()) return
    setLoading(true); setError(null)
    try {
      const json = await api.post<{ data?: { code?: string }; error?: { message: string } }>('/phone/send', { phone: phone.trim() })
      if (json?.data?.code) setDevCode(json.data.code) // dev mode only
      setStep('code')
    } catch (err) { setError(err instanceof Error ? err.message : 'Error') }
    finally { setLoading(false) }
  }

  async function verifyCode() {
    if (!code.trim()) return
    setLoading(true); setError(null)
    try {
      await api.post('/phone/verify', { phone: phone.trim(), code: code.trim() })
      await refreshUser()
      router.push('/profile')
    } catch (err) { setError(err instanceof Error ? err.message : 'Error') }
    finally { setLoading(false) }
  }

  if (!dbUser) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#07071a' }}>
      <Link href="/login?next=/phone-verify" className="text-sm font-black" style={{ color: 'var(--accent)' }}>Log in first</Link>
    </div>
  )

  if (dbUser.phoneVerified) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#07071a' }}>
      <div className="text-center space-y-3">
        <ShieldCheck size={40} style={{ color: '#00ff88', margin: '0 auto' }} />
        <p className="text-lg font-black" style={{ color: '#e0f2fe' }}>Phone Verified</p>
        <p className="text-sm" style={{ color: 'rgba(224,242,254,0.4)' }}>Your phone number is already verified.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#07071a' }}>
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-2">
          <Phone size={36} style={{ color: 'var(--accent)', margin: '0 auto' }} />
          <h1 className="text-xl font-black" style={{ color: '#e0f2fe' }}>Verify Your Phone</h1>
          <p className="text-sm" style={{ color: 'rgba(224,242,254,0.4)' }}>
            {step === 'phone' ? 'Enter your phone number to receive a code' : `Code sent to ${phone}`}
          </p>
        </div>

        {step === 'phone' ? (
          <>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 7700 000000"
              type="tel" className="w-full px-4 py-3 rounded-xl text-sm bg-transparent outline-none"
              style={{ border: '1px solid rgba(var(--accent-rgb),0.2)', color: '#e0f2fe' }} />
            <button onClick={sendCode} disabled={loading || !phone.trim()}
              className="w-full py-3.5 rounded-xl text-sm font-black tracking-widest disabled:opacity-40"
              style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.35)', color: 'var(--accent)' }}>
              {loading ? 'SENDING…' : 'SEND CODE'}
            </button>
          </>
        ) : (
          <>
            {devCode && (
              <div className="px-3 py-2 rounded-lg text-xs text-center" style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.2)', color: '#ffd600' }}>
                DEV MODE — Code: <strong>{devCode}</strong>
              </div>
            )}
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="6-digit code"
              type="text" inputMode="numeric" maxLength={6}
              className="w-full px-4 py-3 rounded-xl text-sm bg-transparent outline-none tracking-widest text-center"
              style={{ border: '1px solid rgba(var(--accent-rgb),0.2)', color: '#e0f2fe' }} />
            <button onClick={verifyCode} disabled={loading || code.length < 6}
              className="w-full py-3.5 rounded-xl text-sm font-black tracking-widest disabled:opacity-40"
              style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.35)', color: 'var(--accent)' }}>
              {loading ? 'VERIFYING…' : 'VERIFY'}
            </button>
            <button onClick={() => { setStep('phone'); setError(null) }}
              className="w-full py-2 text-xs" style={{ color: 'rgba(var(--accent-rgb),0.4)' }}>
              Use a different number
            </button>
          </>
        )}

        {error && <p className="text-xs text-center font-bold" style={{ color: '#ff006e' }}>{error}</p>}
      </div>
    </div>
  )
}
