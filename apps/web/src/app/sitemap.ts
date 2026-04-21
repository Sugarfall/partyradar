import type { MetadataRoute } from 'next'

/**
 * Static sitemap for public marketing pages. Dynamic content (events, venues,
 * profiles) is intentionally excluded here — it should be produced by a separate
 * /api/sitemap endpoint once the catalog stabilises.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://partyradar.app'
  const now = new Date()
  const routes: { path: string; priority: number }[] = [
    { path: '',            priority: 1.0 },
    { path: '/discover',   priority: 0.95 },
    { path: '/venues',     priority: 0.9 },
    { path: '/leaderboard', priority: 0.7 },
    { path: '/pricing',    priority: 0.8 },
    { path: '/login',      priority: 0.5 },
    { path: '/register',   priority: 0.6 },
  ]
  return routes.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: r.priority,
  }))
}
