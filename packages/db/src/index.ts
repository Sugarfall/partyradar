import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// Append connection/pool timeouts to DATABASE_URL so Prisma fails fast
// instead of hanging indefinitely when the Neon free-tier compute is suspended.
//
// Root cause: Neon's proxy accepts TCP connections immediately but stalls
// the PostgreSQL authentication handshake until the compute wakes up.
// connect_timeout=30 gives the compute enough time to wake (typically 5-15s).
// pool_timeout=30 lets queued requests wait for a slot rather than failing instantly.
//
// Pooler URL: if DATABASE_URL points at the raw compute endpoint (ep-xxx.xxx.aws.neon.tech),
// we auto-rewrite it to the PgBouncer pooler URL (ep-xxx-pooler.xxx.aws.neon.tech).
// The pooler stays alive when the compute suspends and handles wakeup buffering
// transparently, eliminating the hanging-connection problem entirely.
function buildDatasourceUrl(): string {
  const base = process.env['DATABASE_URL'] ?? ''
  if (!base) return base
  try {
    const url = new URL(base)

    // Auto-convert direct Neon endpoint → pooler endpoint.
    // Direct:  ep-<name>[.<prefix>].<region>.aws.neon.tech
    // Pooler:  ep-<name>-pooler[.<prefix>].<region>.aws.neon.tech
    // Only rewrite if the URL isn't already using a pooler or a non-Neon host.
    // Use a simple string check (startsWith + includes) rather than a strict regex
    // so it works across all Neon endpoint URL formats (c-N prefix, no prefix, etc.).
    if (url.hostname.startsWith('ep-') &&
        url.hostname.includes('.aws.neon.tech') &&
        !url.hostname.includes('-pooler.')) {
      // Insert -pooler immediately after the endpoint slug (first dot-segment)
      url.hostname = url.hostname.replace(/^(ep-[a-z0-9-]+)(\..*)$/, '$1-pooler$2')
      if (!url.searchParams.has('pgbouncer')) url.searchParams.set('pgbouncer', 'true')
    }

    // Give Neon 30s to wake a suspended compute (proxy accepts TCP instantly
    // but stalls the PostgreSQL handshake until the compute is ready).
    if (!url.searchParams.has('connect_timeout'))  url.searchParams.set('connect_timeout', '30')
    if (!url.searchParams.has('pool_timeout'))     url.searchParams.set('pool_timeout', '30')
    // Keep pool small on Neon free tier so startup background queries
    // can't starve incoming HTTP requests.
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '3')
    return url.toString()
  } catch {
    return base // unparseable URL — return as-is
  }
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasourceUrl: buildDatasourceUrl(),
  })

// Cache in ALL environments to prevent connection exhaustion on Neon
globalForPrisma.prisma = prisma

export * from '@prisma/client'
