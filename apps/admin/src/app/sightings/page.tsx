'use client'

import useSWR from 'swr'
import { fetcher, adminFetch } from '@/lib/api'
import { CheckCircle, Trash2, ThumbsUp, ThumbsDown } from 'lucide-react'

interface AdminSighting {
  id: string
  celebrity: string
  lat: number
  lng: number
  description?: string
  photoUrl?: string
  upvotes: number
  downvotes: number
  isVerified: boolean
  expiresAt: string
  createdAt: string
  reporter: { username: string; displayName: string }
}

export default function AdminSightingsPage() {
  const { data, mutate } = useSWR<{ data: AdminSighting[] }>('/admin/sightings', fetcher)

  async function verify(id: string) {
    await adminFetch(`/admin/sightings/${id}/verify`, { method: 'PUT' })
    mutate()
  }

  async function remove(id: string) {
    if (!confirm('Delete this sighting?')) return
    await adminFetch(`/admin/sightings/${id}`, { method: 'DELETE' })
    mutate()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Celebrity Sightings</h1>

      <div className="grid gap-3">
        {data?.data.map((s) => (
          <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-4">
            {s.photoUrl && (
              <img src={s.photoUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-yellow-400">{s.celebrity}</p>
                  <p className="text-xs text-zinc-500">
                    Reported by @{s.reporter.username} · {new Date(s.createdAt).toLocaleString()}
                  </p>
                  {s.description && <p className="text-sm text-zinc-400 mt-1">{s.description}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                    <span className="flex items-center gap-1 text-green-400"><ThumbsUp size={11} />{s.upvotes}</span>
                    <span className="flex items-center gap-1 text-red-400"><ThumbsDown size={11} />{s.downvotes}</span>
                    <span>{s.isVerified ? '✓ Verified' : 'Unverified'}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {!s.isVerified && (
                    <button onClick={() => verify(s.id)} className="p-1.5 rounded text-zinc-500 hover:text-green-400" title="Verify">
                      <CheckCircle size={16} />
                    </button>
                  )}
                  <button onClick={() => remove(s.id)} className="p-1.5 rounded text-zinc-500 hover:text-red-400" title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {data?.data.length === 0 && <p className="text-zinc-500">No sightings</p>}
      </div>
    </div>
  )
}
