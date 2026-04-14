'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Shield } from 'lucide-react'

export default function SettingsPage() {
  const router = useRouter()
  const { dbUser } = useAuth()

  if (!dbUser) {
    if (typeof window !== 'undefined') router.push('/login')
    return null
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24 md:pb-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="card p-4 mb-3">
        <div className="flex items-start gap-3">
          <Shield size={20} className="text-zinc-400 shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold mb-0.5">Age Verification</h3>
            <p className="text-sm text-zinc-400">
              {dbUser.ageVerified ? '✅ Your age has been verified.' : 'Go to your profile to verify your age.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
