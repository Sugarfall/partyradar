import type { MetadataRoute } from 'next'

/** Next.js App Router generates /robots.txt from this file at build time. */
export default function robots(): MetadataRoute.Robots {
  const base = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://partyradar.app'
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/dashboard', '/settings', '/wallet', '/tickets', '/messages', '/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
