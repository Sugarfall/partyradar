import type { Metadata } from 'next'
import './globals.css'
import Link from 'next/link'

export const metadata: Metadata = { title: 'PartyRadar Admin' }

const navLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '/events', label: 'Events' },
  { href: '/sightings', label: 'Sightings' },
  { href: '/users', label: 'Users' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0d0d0f] text-white min-h-screen flex">
        {/* Sidebar */}
        <aside className="w-56 min-h-screen border-r border-zinc-800 bg-zinc-950 flex flex-col">
          <div className="p-4 border-b border-zinc-800">
            <span className="font-bold text-purple-400">⚡ PartyRadar</span>
            <span className="block text-xs text-zinc-500 mt-0.5">Admin Panel</span>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href}
                className="block px-3 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                {l.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </body>
    </html>
  )
}
