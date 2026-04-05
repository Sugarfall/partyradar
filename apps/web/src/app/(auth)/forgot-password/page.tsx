'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, Zap } from 'lucide-react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)
    try {
      await sendPasswordResetEmail(auth, email)
      setSent(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset email'
      if (msg.includes('user-not-found')) {
        setError('No account found with that email.')
      } else if (msg.includes('invalid-email')) {
        setError('Please enter a valid email address.')
      } else {
        setError('Something went wrong. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#04040d' }}>
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(0,229,255,0.04) 0%, transparent 70%)' }} />
      </div>

      <div className="w-full max-w-xs">
        {/* Back link */}
        <Link href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-bold mb-8"
          style={{ color: 'rgba(0,229,255,0.5)' }}>
          <ArrowLeft size={13} /> BACK TO LOGIN
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4"
            style={{ border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,229,255,0.05)' }}>
            <Mail size={10} style={{ color: '#00e5ff' }} />
            <span className="text-[10px] font-bold tracking-[0.2em]" style={{ color: 'rgba(0,229,255,0.7)' }}>PASSWORD RECOVERY</span>
          </div>
          <h1 className="text-2xl font-black" style={{ color: '#00e5ff', textShadow: '0 0 30px rgba(0,229,255,0.3)' }}>
            RESET ACCESS
          </h1>
          <p className="text-xs mt-2" style={{ color: 'rgba(224,242,254,0.4)' }}>
            Enter your email and we&apos;ll send a reset link
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="text-[10px] font-black tracking-[0.15em] block mb-1.5"
                style={{ color: 'rgba(0,229,255,0.5)' }}>EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: 'rgba(0,229,255,0.04)',
                  border: '1px solid rgba(0,229,255,0.2)',
                  color: '#e0f2fe',
                }}
              />
            </div>

            {error && (
              <p className="text-xs font-bold px-3 py-2 rounded-lg"
                style={{ color: '#ff006e', background: 'rgba(255,0,110,0.08)', border: '1px solid rgba(255,0,110,0.2)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!email || loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm transition-all disabled:opacity-40"
              style={{
                background: 'linear-gradient(135deg, rgba(0,229,255,0.15), rgba(0,229,255,0.08))',
                border: '1px solid rgba(0,229,255,0.4)',
                color: '#00e5ff',
                letterSpacing: '0.12em',
                boxShadow: '0 0 24px rgba(0,229,255,0.1)',
              }}>
              {loading
                ? <><div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" /> SENDING...</>
                : <><Zap size={14} /> SEND RESET LINK</>
              }
            </button>
          </form>
        ) : (
          /* Success state */
          <div className="space-y-5">
            <div className="rounded-2xl p-5 text-center"
              style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)' }}>
              <div className="text-3xl mb-3">📬</div>
              <p className="text-sm font-black mb-1" style={{ color: '#00ff88' }}>CHECK YOUR INBOX</p>
              <p className="text-xs" style={{ color: 'rgba(224,242,254,0.5)' }}>
                Reset link sent to<br />
                <span className="font-bold" style={{ color: 'rgba(0,255,136,0.7)' }}>{email}</span>
              </p>
            </div>

            <p className="text-[10px] text-center" style={{ color: 'rgba(74,96,128,0.5)' }}>
              Didn&apos;t receive it? Check your spam folder or{' '}
              <button onClick={() => setSent(false)} className="underline" style={{ color: 'rgba(0,229,255,0.5)' }}>
                try again
              </button>
            </p>

            <Link href="/login"
              className="w-full flex items-center justify-center py-3 rounded-xl text-xs font-black transition-all"
              style={{ border: '1px solid rgba(0,229,255,0.2)', color: 'rgba(0,229,255,0.6)', letterSpacing: '0.1em' }}>
              BACK TO LOGIN
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
