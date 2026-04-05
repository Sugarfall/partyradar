'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/api'
import { TrendingUp, Users, Ticket, Star } from 'lucide-react'

interface Revenue {
  data: {
    stripeBalance: { amount: number; currency: string }[]
    ticketRevenue: number
    platformFees: number
    tierCounts: { subscriptionTier: string; _count: number }[]
    recentTickets: { id: string; pricePaid: number; event: { name: string }; user: { username: string } }[]
  }
}

export default function AdminDashboard() {
  const { data, isLoading } = useSWR<Revenue>('/admin/revenue', fetcher)

  if (isLoading) return <p className="text-zinc-500">Loading...</p>
  if (!data) return <p className="text-zinc-500">Failed to load. Are you signed in as admin?</p>

  const { ticketRevenue, platformFees, tierCounts, recentTickets } = data.data

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<TrendingUp size={20} />} label="Ticket Revenue" value={`$${ticketRevenue.toFixed(2)}`} color="text-green-400" />
        <KpiCard icon={<TrendingUp size={20} />} label="Platform Fees" value={`$${platformFees.toFixed(2)}`} color="text-purple-400" />
        {tierCounts.map((t) => (
          <KpiCard key={t.subscriptionTier} icon={<Users size={20} />} label={t.subscriptionTier} value={String(t._count)} color="text-blue-400" />
        ))}
      </div>

      {/* Recent tickets */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h2 className="font-semibold mb-4 flex items-center gap-2"><Ticket size={16} />Recent Ticket Sales</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500 text-left border-b border-zinc-800">
              <th className="pb-2">Event</th>
              <th className="pb-2">User</th>
              <th className="pb-2">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {recentTickets.map((t) => (
              <tr key={t.id}>
                <td className="py-2">{t.event.name}</td>
                <td className="py-2 text-zinc-400">@{t.user.username}</td>
                <td className="py-2 text-green-400">${t.pricePaid.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className={`${color} mb-2`}>{icon}</div>
      <p className="text-zinc-500 text-xs">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
    </div>
  )
}
