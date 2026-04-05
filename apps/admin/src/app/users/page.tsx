'use client'

import useSWR from 'swr'
import { fetcher, adminFetch } from '@/lib/api'
import { Ban } from 'lucide-react'

interface AdminUser {
  id: string
  email: string
  username: string
  displayName: string
  subscriptionTier: string
  ageVerified: boolean
  isBanned: boolean
  isAdmin: boolean
  createdAt: string
  _count: { hostedEvents: number; tickets: number }
}

const tierColors: Record<string, string> = {
  FREE: 'text-zinc-400',
  BASIC: 'text-blue-400',
  PRO: 'text-purple-400',
  PREMIUM: 'text-yellow-400',
}

export default function AdminUsersPage() {
  const { data, mutate } = useSWR<{ data: AdminUser[] }>('/admin/users', fetcher)

  async function toggleBan(id: string) {
    await adminFetch(`/admin/users/${id}/ban`, { method: 'PUT' })
    mutate()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Users</h1>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800 text-left">
              <th className="p-3">User</th>
              <th className="p-3">Tier</th>
              <th className="p-3">Events</th>
              <th className="p-3">Tickets</th>
              <th className="p-3">Joined</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {data?.data.map((user) => (
              <tr key={user.id}>
                <td className="p-3">
                  <p className="font-medium">{user.displayName}</p>
                  <p className="text-zinc-500 text-xs">@{user.username} · {user.email}</p>
                </td>
                <td className={`p-3 font-medium ${tierColors[user.subscriptionTier]}`}>
                  {user.subscriptionTier}
                </td>
                <td className="p-3 text-center text-zinc-400">{user._count.hostedEvents}</td>
                <td className="p-3 text-center text-zinc-400">{user._count.tickets}</td>
                <td className="p-3 text-zinc-500 text-xs">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="p-3">
                  <div className="flex gap-1 flex-wrap">
                    {user.isBanned && <span className="text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">Banned</span>}
                    {user.isAdmin && <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full">Admin</span>}
                    {user.ageVerified && <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">21+</span>}
                  </div>
                </td>
                <td className="p-3">
                  {!user.isAdmin && (
                    <button
                      onClick={() => toggleBan(user.id)}
                      className={`p-1.5 rounded ${user.isBanned ? 'text-green-400 bg-green-400/10' : 'text-zinc-500 hover:text-red-400'}`}
                      title={user.isBanned ? 'Unban' : 'Ban'}
                    >
                      <Ban size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
