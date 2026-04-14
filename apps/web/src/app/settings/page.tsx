'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Wine, Shield } from 'lucide-react'

export default function SettingsPage() {
  const router = useRouter()
  const { dbUser, refreshUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAlcohol, setShowAlcohol] = useState(dbUser?.showAlcoholEvents ?? false)
  const [alcoholFriendly, setAlcoholFriendly] = useState(dbUser?.alcoholFriendly ?? false)

  if (!dbUser) {
    router.push('/login')
    return null
  }

  async function updateSetting(updates: { showAlcoholEvents?: boolean; alcoholFriendly?: boolean }) {
    setSaving(true)
    setError(null)
    try {
      await api.put('/auth/settings', updates)
      await refreshUser()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  function handleShowAlcoholToggle(checked: boolean) {
    setShowAlcohol(checked)
    updateSetting({ showAlcoholEvents: checked, alcoholFriendly })
  }

  function handleAlcoholFriendlyToggle(checked: boolean) {
    setAlcoholFriendly(checked)
    updateSetting({ showAlcoholEvents: showAlcohol, alcoholFriendly: checked })
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24 md:pb-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Alcohol filter */}
      <div className="card p-4 mb-3">
        <div className="flex items-start gap-3">
          <Wine size={20} className="text-zinc-400 shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold mb-0.5">Show Alcohol Events</h3>
            <p className="text-sm text-zinc-400 mb-3">
              {!dbUser.ageVerified
                ? 'Requires age verification (21+). Go to Profile to verify.'
                : 'Show events with alcohol (18+/21+ events, BYOB, alcohol provided).'}
            </p>
            <label className={`flex items-center gap-2 ${!dbUser.ageVerified ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                disabled={!dbUser.ageVerified}
                checked={showAlcohol}
                onChange={(e) => handleShowAlcoholToggle(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm">Enable alcohol event filter</span>
            </label>
          </div>
        </div>
      </div>

      <div className="card p-4 mb-3">
        <div className="flex items-start gap-3">
          <Shield size={20} className="text-zinc-400 shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold mb-0.5">Alcohol-Friendly Profile Badge</h3>
            <p className="text-sm text-zinc-400 mb-3">Display a badge on your profile showing you are alcohol-friendly.</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={alcoholFriendly}
                onChange={(e) => handleAlcoholFriendlyToggle(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm">Show alcohol-friendly badge</span>
            </label>
          </div>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {saving && <p className="text-zinc-400 text-sm text-center">Saving...</p>}
    </div>
  )
}
