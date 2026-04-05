'use client'

import useSWR from 'swr'
import { fetcher, adminFetch } from '@/lib/api'
import { Star, Trash2 } from 'lucide-react'

interface AdminEvent {
  id: string
  name: string
  type: string
  isPublished: boolean
  isCancelled: boolean
  isFeatured: boolean
  startsAt: string
  host: { username: string; email: string }
  _count: { guests: number; tickets: number }
}

export default function AdminEventsPage() {
  const { data, mutate } = useSWR<{ data: AdminEvent[] }>('/admin/events', fetcher)

  async function toggleFeature(id: string) {
    await adminFetch(`/admin/events/${id}/feature`, { method: 'PUT' })
    mutate()
  }

  async function removeEvent(id: string) {
    if (!confirm('Remove this event?')) return
    await adminFetch(`/admin/events/${id}`, { method: 'DELETE' })
    mutate()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Events</h1>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800 text-left">
              <th className="p-3">Event</th>
              <th className="p-3">Host</th>
              <th className="p-3">Date</th>
              <th className="p-3">Guests</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {data?.data.map((event) => (
              <tr key={event.id}>
                <td className="p-3">
                  <div className="font-medium">{event.name}</div>
                  <div className="text-zinc-500 text-xs">{event.type.replace('_', ' ')}</div>
                </td>
                <td className="p-3 text-zinc-400">@{event.host.username}</td>
                <td className="p-3 text-zinc-400 text-xs">
                  {new Date(event.startsAt).toLocaleDateString()}
                </td>
                <td className="p-3 text-center">{event._count.guests}</td>
                <td className="p-3">
                  <div className="flex gap-1 flex-wrap">
                    {event.isCancelled && <span className="text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">Cancelled</span>}
                    {event.isFeatured && <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">Featured</span>}
                    {event.isPublished && !event.isCancelled && <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">Active</span>}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleFeature(event.id)}
                      title={event.isFeatured ? 'Remove feature' : 'Feature event'}
                      className={`p-1.5 rounded ${event.isFeatured ? 'text-yellow-400 bg-yellow-400/10' : 'text-zinc-500 hover:text-yellow-400'}`}
                    >
                      <Star size={14} />
                    </button>
                    <button
                      onClick={() => removeEvent(event.id)}
                      className="p-1.5 rounded text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
