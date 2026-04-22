import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// Append connection/pool timeouts to DATABASE_URL so Prisma fails fast
// instead of hanging for 30+ seconds when the DB is unreachable. Without
// these, every route that queries the DB hangs until the OS TCP timeout
// (~2 min), which also blocks the Express response and the client.
// connect_timeout: seconds to establish TCP + TLS connection
// pool_timeout:    seconds to wait for a free connection from the pool
// statement_timeout: (Postgres only) max ms per query — set via pgbouncer
function buildDatasourceUrl(): string {
  const base = process.env['DATABASE_URL'] ?? ''
  if (!base) return base
  try {
    const url = new URL(base)
    if (!url.searchParams.has('connect_timeout')) url.searchParams.set('connect_timeout', '10')
    if (!url.searchParams.has('pool_timeout'))    url.searchParams.set('pool_timeout', '10')
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
