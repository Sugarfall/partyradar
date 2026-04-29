'use client'

import { useState, useEffect, useRef } from 'react'
import { Input, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import type { CreateSightingInput } from '@partyradar/shared'
import { CELEBRITY_LIST } from '@partyradar/shared'
import { uploadImage } from '@/lib/cloudinary'

interface SightingFormProps {
  defaultLocation?: { lat: number; lng: number }
  onSubmit: (input: CreateSightingInput) => Promise<void>
  onCancel: () => void
}

export function SightingForm({ defaultLocation, onSubmit, onCancel }: SightingFormProps) {
  const [celebrity, setCelebrity] = useState('')
  const [lat, setLat] = useState(defaultLocation?.lat ?? 0)
  const [lng, setLng] = useState(defaultLocation?.lng ?? 0)
  const [description, setDescription] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoPreviewUrlRef = useRef<string | null>(null)

  // Revoke object URL on unmount to prevent memory leak
  useEffect(() => {
    return () => { if (photoPreviewUrlRef.current) URL.revokeObjectURL(photoPreviewUrlRef.current) }
  }, [])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleCelebrityChange(val: string) {
    setCelebrity(val)
    if (val.length >= 2) {
      setSuggestions(
        CELEBRITY_LIST.filter((c) => c.toLowerCase().includes(val.toLowerCase())).slice(0, 6)
      )
    } else {
      setSuggestions([])
    }
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (photoPreviewUrlRef.current) URL.revokeObjectURL(photoPreviewUrlRef.current)
    const url = URL.createObjectURL(file)
    photoPreviewUrlRef.current = url
    setPhotoFile(file)
    setPhotoPreview(url)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!celebrity.trim()) { setError('Please enter a celebrity name'); return }
    setLoading(true)
    setError(null)
    try {
      let photoUrl: string | undefined
      if (photoFile) {
        photoUrl = await uploadImage(photoFile, 'sightings')
      }
      await onSubmit({ celebrity, lat, lng, description: description || undefined, photoUrl })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit sighting')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Celebrity autocomplete */}
      <div className="relative">
        <Input
          label="Celebrity Name *"
          value={celebrity}
          onChange={(e) => handleCelebrityChange(e.target.value)}
          placeholder="Who did you spot?"
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-xl z-10 overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setCelebrity(s); setSuggestions([]) }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-bg-elevated transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Latitude"
          type="number"
          step="any"
          value={lat}
          onChange={(e) => setLat(Number(e.target.value))}
        />
        <Input
          label="Longitude"
          type="number"
          step="any"
          value={lng}
          onChange={(e) => setLng(Number(e.target.value))}
        />
      </div>

      <Textarea
        label="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Where exactly? What were they doing?"
        maxLength={500}
      />

      {/* Photo upload */}
      <div>
        <label className="text-sm font-medium text-zinc-300 block mb-1">Photo (optional)</label>
        {photoPreview && (
          <img src={photoPreview} alt="Preview" className="w-full h-28 object-cover rounded-lg mb-2" />
        )}
        <input type="file" accept="image/*" onChange={handlePhoto}
          className="text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-bg-elevated file:text-white file:cursor-pointer"
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button type="submit" loading={loading} className="flex-1">Submit Sighting ⭐</Button>
      </div>
    </form>
  )
}
