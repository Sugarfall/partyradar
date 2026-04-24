import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// Build the Prisma datasource URL with timeout parameters that prevent the
// server from entering zombie state when Neon's free-tier compute suspends.
//
// Background — why this matters
// ──────────────────────────────
// Neon free tier suspends its compute after 5 min of DB inactivity. When it
// suspends, existing TCP connections from Prisma's connection pool enter a
// "half-open" state: Neon's side closes them but the Node.js side doesn't
// know. Prisma's Rust query engine then blocks on a socket read waiting for
// a response that never arrives, freezing the Node.js event loop (zombie).
//
// Parameters used to prevent this
// ────────────────────────────────
// connect_timeout=30  Give Neon 30 s to wake a suspended compute on a fresh
//                     connection. The Neon proxy accepts TCP immediately but
//                     stalls the PostgreSQL handshake until the compute is up.
// pool_timeout=10     Fail fast (10 s) if all pool slots are occupied and a
//                     new request is waiting — avoids request pile-up.
// connection_limit=3  Small pool so background startup queries can't starve
//                     incoming HTTP requests on the Neon free tier.
// socket_timeout=10   KEY ZOMBIE FIX: if a socket read receives no data for
//                     10 s, Prisma throws P2024 instead of blocking forever.
//                     This converts an indefinite event-loop freeze into a
//                     fast, catchable error. The global 15 s request timeout
//                     in index.ts then sends a 503 before the user even sees
//                     the socket timeout — the server stays responsive.
//
// Pooler note
// ───────────
// We do NOT auto-rewrite to the Neon PgBouncer pooler URL because the pooler
// endpoint is not accessible on this project (connection refused at port 5432
// on ep-NAME-pooler.us-east-1.aws.neon.tech). The socket_timeout parameter
// above achieves the same "fail fast" goal without requiring the pooler.
// If the project owner enables Neon connection pooling in their Neon dashboard
// and sets DATABASE_POOLER_URL, that URL is used preferentially below.
function buildDatasourceUrl(): string {
  // Allow an explicit pooler URL override (set in Railway env vars from the
  // Neon dashboard's "Connection pooling" section).
  const poolerUrl = process.env['DATABASE_POOLER_URL']
  const base = poolerUrl ?? process.env['DATABASE_URL'] ?? ''
  if (!base) return base

  try {
    const url = new URL(base)

    // Add pgbouncer flag when using the pooler URL so Prisma uses the
    // compatible query protocol (no prepared statements).
    if (poolerUrl && !url.searchParams.has('pgbouncer')) {
      url.searchParams.set('pgbouncer', 'true')
    }

    // Timeout parameters (only set if not already present in the URL).
    if (!url.searchParams.has('connect_timeout'))  url.searchParams.set('connect_timeout', '30')
    if (!url.searchParams.has('pool_timeout'))     url.searchParams.set('pool_timeout', '10')
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '3')
    // socket_timeout: convert indefinite event-loop freeze → fast P2024 error.
    if (!url.searchParams.has('socket_timeout'))   url.searchParams.set('socket_timeout', '10')

    const final = url.toString()
    // Log the host (not credentials) so Railway logs confirm which endpoint is used.
    console.log(`[DB] datasource host: ${url.hostname}${poolerUrl ? ' (pooler)' : ' (direct)'}`)
    return final
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
