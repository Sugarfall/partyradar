import 'dotenv/config' // v2789fe8

// ─── Global crash guards ──────────────────────────────────────────────────────
// Node 18+ crashes the process on any unhandled rejection or uncaught exception.
// Without these handlers, a single unguarded async error anywhere in the app
// kills the server silently — Railway counts it as a crash and restarts up to 3
// times before stopping the service entirely. Log the error and continue instead.
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise rejection — server kept alive:', reason)
  console.error('  Promise:', promise)
})
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception — server kept alive:', err)
})

import { createServer } from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cron from 'node-cron'
import { Server } from 'socket.io'
import { prisma } from '@partyradar/db'

import authRouter from './routes/auth'
import savesRouter from './routes/saves'
import analyticsRouter from './routes/analytics'
import blastRouter from './routes/blast'
import eventsRouter from './routes/events'
import guestsRouter from './routes/guests'
import ticketsRouter from './routes/tickets'
// radarRouter removed — feature discontinued
import subscriptionsRouter from './routes/subscriptions'
import notificationsRouter from './routes/notifications'
import uploadsRouter from './routes/uploads'
import adminRouter from './routes/admin'
import webhooksRouter from './routes/webhooks'
import friendsGoingRouter from './routes/friendsGoing'
import messagesRouter from './routes/messages'
import dmRouter from './routes/dm'
import eventbriteRouter from './routes/eventbrite'
import socialRouter from './routes/social'
import venuesRouter from './routes/venues'
import followRouter from './routes/follow'
import feedRouter from './routes/feed'
import groupsRouter from './routes/groups'
import checkinsRouter from './routes/checkins'
import postsRouter from './routes/posts'
import reviewsRouter from './routes/reviews'
import referralsRouter from './routes/referrals'
import dashboardRouter from './routes/dashboard'
import leaderboardRouter from './routes/leaderboard'
import venueDiscoverRouter from './routes/venue-discover'
import walletRouter from './routes/wallet'
import usersRouter from './routes/users'
import nearbyRouter from './routes/nearby'
import socialScoreRouter from './routes/social-score'
import djRequestsRouter from './routes/dj-requests'
import djEventRequestsRouter from './routes/dj-requests-event'
import phoneRouter from './routes/phone-verify'
import brandsRouter from './routes/partner-brands'
import referralCardsRouter from './routes/referral-cards'
import matchRouter from './routes/match'
import squadsRouter from './routes/squads'
import pubCrawlRouter from './routes/pubcrawl'
import goOutRouter from './routes/go-out'
import reportsRouter from './routes/reports'
import spotifyRouter from './routes/spotify'
import connectRouter from './routes/connect'
import { errorHandler } from './middleware/errorHandler'
import { sendNotification } from './lib/fcm'
import { auth as firebaseAuth } from './lib/firebase-admin'
import rateLimit from 'express-rate-limit'

const app = express()
const httpServer = createServer(app)
const PORT = process.env['PORT'] ?? 4000

// Trust Railway's / Vercel's reverse proxy so express-rate-limit can correctly
// identify client IPs from the X-Forwarded-For header.
// Without this, express-rate-limit v7 throws a ValidationError on EVERY request,
// which causes CORS OPTIONS preflight responses to never be sent — blocking all
// cross-origin API calls in the browser entirely.
app.set('trust proxy', 1)

// ─── Socket.io ────────────────────────────────────────────────────────────────

export const io = new Server(httpServer, {
  cors: {
    // Mirror the HTTP CORS logic: explicit allow-list + regex fallback for
    // PartyRadar Vercel deploys. Same reasoning — Firebase ID tokens are
    // the real auth gate.
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      const explicit = [
        'http://localhost:3000',
        'http://localhost:3001',
        process.env['FRONTEND_URL'] ?? '',
        ...(process.env['ADDITIONAL_ORIGINS']?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
      ].filter(Boolean)
      const regexes = [
        /^https:\/\/partyradar[a-z0-9-]*\.vercel\.app$/i,
        /^https:\/\/([a-z0-9-]+\.)?partyradar\.app$/i,
      ]
      if (explicit.includes(origin) || regexes.some((r) => r.test(origin))) {
        return callback(null, true)
      }
      return callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  },
})

// Socket authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth['token'] as string | undefined
    if (!token) {
      // Allow unauthenticated connections for read-only access (guest viewers)
      socket.data['userId'] = null
      socket.data['displayName'] = 'Anonymous'
      socket.data['photoUrl'] = null
      return next()
    }

    const decoded = await firebaseAuth.verifyIdToken(token)
    const dbUser = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true, displayName: true, photoUrl: true, isBanned: true },
    })

    if (!dbUser || dbUser.isBanned) {
      return next(new Error('Unauthorized'))
    }

    socket.data['userId'] = dbUser.id
    socket.data['displayName'] = dbUser.displayName
    socket.data['photoUrl'] = dbUser.photoUrl ?? null
    next()
  } catch {
    // In dev mode with mock tokens — upsert a real dev user to avoid FK violations
    if (process.env['NODE_ENV'] !== 'production') {
      try {
        const devUser = await prisma.user.upsert({
          where: { firebaseUid: 'dev-user' },
          create: {
            firebaseUid: 'dev-user',
            email: 'dev@partyradar.local',
            username: 'devuser',
            displayName: 'Dev User',
          },
          update: {},
          select: { id: true, displayName: true, photoUrl: true },
        })
        socket.data['userId'] = devUser.id
        socket.data['displayName'] = devUser.displayName
        socket.data['photoUrl'] = devUser.photoUrl ?? null
      } catch {
        socket.data['userId'] = null
        socket.data['displayName'] = 'Anonymous'
        socket.data['photoUrl'] = null
      }
      return next()
    }
    next(new Error('Invalid token'))
  }
})

// Track online count per room
const roomOnlineCount: Record<string, Set<string>> = {}

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id} (user: ${socket.data['userId'] ?? 'anon'})`)

  // ── join-event ──────────────────────────────────────────────────────────────
  socket.on('join-event', async (eventId: string) => {
    if (typeof eventId !== 'string') return

    const room = `event:${eventId}`
    await socket.join(room)

    // Track online count
    if (!roomOnlineCount[room]) roomOnlineCount[room] = new Set()
    if (socket.data['userId']) roomOnlineCount[room]!.add(socket.data['userId'] as string)
    io.to(room).emit('online-count', roomOnlineCount[room]!.size)

    // Send last 50 messages
    try {
      const messages = await prisma.message.findMany({
        where: { eventId },
        orderBy: { createdAt: 'asc' },
        take: 50,
        include: {
          sender: { select: { id: true, displayName: true, photoUrl: true } },
        },
      })

      const history = messages.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.sender.displayName,
        senderPhoto: m.sender.photoUrl ?? undefined,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
      }))

      socket.emit('message-history', history)
    } catch (err) {
      console.error('[Socket] Error fetching message history:', err)
      socket.emit('message-history', [])
    }
  })

  // ── message ─────────────────────────────────────────────────────────────────
  socket.on('message', async (payload: { eventId: string; text: string }) => {
    const userId = socket.data['userId'] as string | null
    if (!userId) return
    if (!payload?.eventId || typeof payload.text !== 'string') return

    const text = payload.text.trim().slice(0, 500)
    if (!text) return

    const room = `event:${payload.eventId}`

    try {
      const saved = await prisma.message.create({
        data: { eventId: payload.eventId, senderId: userId, text },
        include: { sender: { select: { id: true, displayName: true, photoUrl: true } } },
      })

      const outgoing = {
        id: saved.id,
        senderId: saved.senderId,
        senderName: saved.sender.displayName,
        senderPhoto: saved.sender.photoUrl ?? undefined,
        text: saved.text,
        createdAt: saved.createdAt.toISOString(),
      }

      io.to(room).emit('message', outgoing)
    } catch (err) {
      console.error('[Socket] Error saving message:', err)
    }
  })

  // ── typing ───────────────────────────────────────────────────────────────────
  socket.on('typing', (eventId: string) => {
    if (typeof eventId !== 'string') return
    const name = socket.data['displayName'] as string
    const room = `event:${eventId}`
    socket.to(room).emit('typing', { name })
  })

  // ── leave-event ──────────────────────────────────────────────────────────────
  socket.on('leave-event', async (eventId: string) => {
    if (typeof eventId !== 'string') return
    const room = `event:${eventId}`
    await socket.leave(room)

    if (roomOnlineCount[room] && socket.data['userId']) {
      roomOnlineCount[room]!.delete(socket.data['userId'] as string)
      // Bug 16 fix: delete empty Sets to prevent unbounded memory growth
      if (roomOnlineCount[room]!.size === 0) delete roomOnlineCount[room]
      else io.to(room).emit('online-count', roomOnlineCount[room]!.size)
    }
  })

  // ── disconnect ───────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    // Clean up online count from all rooms this socket was in
    for (const [room, members] of Object.entries(roomOnlineCount)) {
      if (socket.data['userId'] && members.has(socket.data['userId'] as string)) {
        members.delete(socket.data['userId'] as string)
        // Bug 16 fix: prune empty Sets
        if (members.size === 0) delete roomOnlineCount[room]
        else io.to(room).emit('online-count', members.size)
      }
    }
    console.log(`[Socket] Disconnected: ${socket.id}`)
  })
})

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet())

// Build CORS allowlist once at boot so we can log it and catch misconfig early.
// Includes: localhost (dev), FRONTEND_URL (prod), and a comma-separated
// ADDITIONAL_ORIGINS for preview deploys you explicitly trust.
const CORS_ALLOWLIST = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env['FRONTEND_URL'] ?? '',
  ...(process.env['ADDITIONAL_ORIGINS']?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
].filter(Boolean)

// Regex allow-list for PartyRadar Vercel deploys + custom domain. This keeps
// the site working without requiring FRONTEND_URL to be set manually on
// Railway — previously that single missing env var broke login, venues,
// events, and upgrade for every production user. Firebase ID tokens are the
// actual auth gate; CORS is just defense in depth.
const CORS_REGEX_ALLOWLIST: RegExp[] = [
  // Any PartyRadar Vercel deployment (prod + preview builds)
  //   https://partyradar-web.vercel.app
  //   https://partyradar-web-<hash>-<team>.vercel.app
  //   https://partyradar-<whatever>.vercel.app
  /^https:\/\/partyradar[a-z0-9-]*\.vercel\.app$/i,
  // Custom domain, if/when wired up
  /^https:\/\/([a-z0-9-]+\.)?partyradar\.app$/i,
]

if (!process.env['FRONTEND_URL']) {
  console.warn(
    '⚠️  [CORS] FRONTEND_URL is not set — falling back to regex allow-list for ' +
    'partyradar*.vercel.app and *.partyradar.app. Set FRONTEND_URL in Railway ' +
    'env vars to your canonical deploy URL to silence this warning.',
  )
}
console.log(
  `[CORS] Explicit allow-list: ${CORS_ALLOWLIST.join(', ') || '(none)'} | ` +
  `Regex allow-list: ${CORS_REGEX_ALLOWLIST.map((r) => r.source).join(', ')}`,
)

function isAllowedOrigin(origin: string): boolean {
  if (CORS_ALLOWLIST.includes(origin)) return true
  return CORS_REGEX_ALLOWLIST.some((r) => r.test(origin))
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true)
    } else {
      // Deny cleanly (no thrown error → no 500). The request is still
      // answered, but without Access-Control-Allow-Origin, so the browser
      // blocks the response client-side. Log every rejection so misconfig
      // is visible in Railway logs.
      console.warn(`[CORS] Rejected origin: ${origin}`)
      callback(null, false)
    }
  },
  credentials: true,
}))
app.use(morgan('dev'))

// ─── Rate Limiting ───────────────────────────────────────────────────────────

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 120,                 // 120 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again shortly' },
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                    // 30 auth attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts' },
})

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 10,                   // 10 payment actions per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests' },
})

const discoverLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 15,                   // 15 Google Places lookups per minute (protect API quota)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many venue discovery requests' },
})

// Anti-spam limiter for message sends — only limits WRITE methods so
// reading conversations stays snappy. Scoped to send/conversation-create
// paths only (applied further below).
const dmWriteLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 30,                   // 30 outbound DMs per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'POST',
  message: { error: 'Sending messages too quickly — slow down' },
})

// Referral-code apply: prevent brute-force guessing of valid codes.
// A legitimate user calls this exactly once per signup, so 5/min is generous.
const referralApplyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many referral attempts — slow down' },
})

app.use('/api', globalLimiter)
app.use('/api/auth', authLimiter)
app.use('/api/tickets', paymentLimiter)
app.use('/api/subscriptions', paymentLimiter)
app.use('/api/blast', paymentLimiter)
app.use('/api/wallet/top-up', paymentLimiter)
app.use('/api/wallet/payment-intent', paymentLimiter)
app.use('/api/wallet/spend', paymentLimiter)
app.use('/api/wallet/order-card', paymentLimiter)
app.use('/api/connect', paymentLimiter)
app.use('/api/venues/discover', discoverLimiter)
app.use('/api/dm', dmWriteLimiter)
app.use('/api/referrals/apply', referralApplyLimiter)

// Raw body for Stripe webhook signature verification
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '2mb' }))

// ─── Global request timeout ───────────────────────────────────────────────────
// Sends 503 if any route handler doesn't respond within the budget.
// Regular routes: 15s — enough for any real-time query; stalled Prisma calls
// surface clearly instead of hanging until the OS TCP timeout.
// Admin routes: 120s — seed-venues and seed-activity do bulk DB work that
// legitimately needs more time (createMany, upserts, group chat seeding).
app.use((_req, res, next) => {
  // Top-level middleware sees the full path (e.g. /api/admin/seed-activity),
  // NOT the router-relative path — so check for '/api/admin', not '/admin'.
  const isAdmin   = _req.path.startsWith('/api/admin')
  // ai-sync awaits Eventbrite + SerpAPI + Perplexity sequentially — can take 30-60 s
  const isAiSync  = _req.path === '/api/events/ai-sync'
  const timeoutMs = (isAdmin || isAiSync) ? 120_000 : 15_000
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      console.warn(`[API] Request timed out: ${_req.method} ${_req.path}`)
      res.status(503).json({ error: 'Request timed out — please try again' })
    }
  }, timeoutMs)
  res.on('finish', () => clearTimeout(timer))
  res.on('close', () => clearTimeout(timer))
  next()
})

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter)
app.use('/api/events', friendsGoingRouter)
app.use('/api/events', savesRouter)
app.use('/api/events', analyticsRouter)
app.use('/api/events', eventsRouter)
app.use('/api/events/:id/guests', guestsRouter)
app.use('/api/tickets', ticketsRouter)
// /api/radar removed — feature discontinued
app.use('/api/subscriptions', subscriptionsRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/uploads', uploadsRouter)
app.use('/api/admin', adminRouter)
app.use('/api/webhooks', webhooksRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/dm', dmRouter)
app.use('/api/eventbrite', eventbriteRouter)
app.use('/api/social', socialRouter)
app.use('/api/venues/discover', venueDiscoverRouter)
app.use('/api/venues', venuesRouter)
app.use('/api/follow', followRouter)
app.use('/api/feed', feedRouter)
app.use('/api/checkins', checkinsRouter)
app.use('/api/posts', postsRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api/blast', blastRouter)
app.use('/api/groups', groupsRouter)
app.use('/api/referrals', referralsRouter)
app.use('/api/wallet', walletRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/leaderboard', leaderboardRouter)
app.use('/api/users', usersRouter)
app.use('/api/nearby', nearbyRouter)
app.use('/api/social-score', socialScoreRouter)
app.use('/api/dj-requests', djRequestsRouter)
app.use('/api/events', djEventRequestsRouter)
app.use('/api/phone', phoneRouter)
app.use('/api/brands', brandsRouter)
app.use('/api/referral-cards', referralCardsRouter)
app.use('/api/match', matchRouter)
app.use('/api/squads', squadsRouter)
app.use('/api/pub-crawl', pubCrawlRouter)
app.use('/api/go-out', goOutRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/spotify', spotifyRouter)
app.use('/api/connect', connectRouter)

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// DB connectivity probe — hits the DB with a 10s timeout so we can distinguish
// "API up, DB down" from "API down". Safe to call unauthenticated.
app.get('/api/health/db', async (_req, res) => {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB query timed out after 10s')), 10_000)),
    ])
    res.json({ status: 'ok', db: 'connected' })
  } catch (err: any) {
    res.status(503).json({ status: 'error', db: 'unreachable', error: err?.message ?? String(err) })
  }
})

app.use(errorHandler)

// ─── Cron Jobs ────────────────────────────────────────────────────────────────

// ── Neon keepalive ───────────────────────────────────────────────────────────
// Neon free-tier computes auto-suspend after 5 minutes of inactivity.
// A SELECT 1 ping every 4 minutes keeps the compute warm so the first real
// request after a quiet period is never stalled by a cold-start handshake.
// The pooler URL rewrite (packages/db/src/index.ts) is the safety net if the
// server itself was restarted — this cron prevents suspension while it runs.
cron.schedule('*/4 * * * *', async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (err) {
    console.error('[Keepalive] DB ping failed:', err instanceof Error ? err.message : String(err))
  }
})

// Every 30 minutes: expire stories
cron.schedule('*/30 * * * *', async () => {
  try {
    const deleted = await prisma.post.deleteMany({
      where: { isStory: true, expiresAt: { lte: new Date() } },
    })
    if (deleted.count > 0) {
      console.log(`[Cron] Expired ${deleted.count} story/stories`)
    }
  } catch (err) {
    console.error('[Cron] Error expiring stories:', err)
  }
})

// Every 5 minutes: expire old celebrity sightings
cron.schedule('*/5 * * * *', async () => {
  try {
    const expired = await prisma.celebritySighting.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: { id: true },
    })
    if (expired.length > 0) {
      await prisma.sightingVote.deleteMany({ where: { sightingId: { in: expired.map((s) => s.id) } } })
      await prisma.celebritySighting.deleteMany({ where: { id: { in: expired.map((s) => s.id) } } })
      console.log(`[Cron] Expired ${expired.length} celebrity sighting(s)`)
    }
  } catch (err) {
    console.error('[Cron] Error expiring sightings:', err)
  }
})

// Every hour: send 1-hour-before event reminders
cron.schedule('0 * * * *', async () => {
  try {
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000)
    const fiftyMinFromNow = new Date(Date.now() + 50 * 60 * 1000)

    const upcomingEvents = await prisma.event.findMany({
      where: {
        isPublished: true,
        isCancelled: false,
        startsAt: { gte: fiftyMinFromNow, lte: oneHourFromNow },
      },
      include: {
        guests: { where: { status: 'CONFIRMED' }, select: { userId: true } },
      },
    })

    for (const event of upcomingEvents) {
      for (const { userId } of event.guests) {
        await sendNotification({
          userId,
          type: 'EVENT_REMINDER',
          title: `${event.name} starts in 1 hour!`,
          body: `Get ready — it's almost time`,
          data: { eventId: event.id },
        })
      }
    }

    if (upcomingEvents.length > 0) {
      console.log(`[Cron] Sent reminders for ${upcomingEvents.length} event(s)`)
    }
  } catch (err) {
    console.error('[Cron] Error sending reminders:', err)
  }
})

// Every 30 minutes: send dress code reminder 2h before events that have a dress code
cron.schedule('*/30 * * * *', async () => {
  try {
    const in2h  = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const in90m = new Date(Date.now() + 90 * 60 * 1000)

    const events = await prisma.event.findMany({
      where: {
        isPublished: true,
        isCancelled: false,
        dressCode: { not: null },
        startsAt: { gte: in90m, lte: in2h },
      },
      include: {
        guests: { where: { status: 'CONFIRMED' }, select: { userId: true } },
      },
    })

    for (const event of events) {
      for (const { userId } of event.guests) {
        await sendNotification({
          userId,
          type: 'EVENT_REMINDER',
          title: `👔 ${event.name} — dress code reminder`,
          body: `Dress code: ${event.dressCode}. Event starts in ~2 hours.`,
          data: { eventId: event.id },
        })
      }
    }

    if (events.length > 0) {
      console.log(`[Cron] Sent dress code reminders for ${events.length} event(s)`)
    }
  } catch (err) {
    console.error('[Cron] Error sending dress code reminders:', err)
  }
})

// Bot-post cron removed — feed shows real users only

// ─── Auto-reseed events when they all expire ──────────────────────────────────
// Every hour: if no future published events remain, delete stale ones and re-seed
cron.schedule('0 * * * *', async () => {
  try {
    const futureCount = await prisma.event.count({
      where: {
        isPublished: true,
        isCancelled: false,
        startsAt: { gt: new Date() },
      },
    })

    if (futureCount > 0) return  // still have upcoming events, nothing to do

    console.log('[Cron] No future events found — reseeding Glasgow nightlife events...')

    // Delete old demo events (those hosted by demo accounts)
    const demoHosts = await prisma.user.findMany({
      where: { firebaseUid: { startsWith: 'demo_' } },
      select: { id: true },
    })
    const demoHostIds = demoHosts.map((u) => u.id)

    if (demoHostIds.length > 0) {
      const staleEvents = await prisma.event.findMany({
        where: { hostId: { in: demoHostIds } },
        select: { id: true },
      })
      const staleIds = staleEvents.map((e) => e.id)
      if (staleIds.length > 0) {
        await prisma.eventGuest.deleteMany({ where: { eventId: { in: staleIds } } })
        await prisma.ticket.deleteMany({ where: { eventId: { in: staleIds } } })
        await prisma.message.deleteMany({ where: { eventId: { in: staleIds } } })
        await prisma.event.deleteMany({ where: { id: { in: staleIds } } })
        console.log(`[Cron] Deleted ${staleIds.length} stale demo events`)
      }
    }

    // Call seed-activity internally — use APP_URL in production, localhost in dev
    const port = process.env['PORT'] ?? 4000
    const railwayDomain = process.env['RAILWAY_PUBLIC_DOMAIN']
    const appUrl = process.env['APP_URL']
    const baseUrl = appUrl
      ? appUrl
      : railwayDomain
        ? `https://${railwayDomain}`
        : `http://localhost:${port}`
    // Bug 17 fix: include internal API key so requireAdmin middleware lets the cron through
    await fetch(`${baseUrl}/api/admin/seed-activity`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env['INTERNAL_API_KEY'] ?? ''}` },
    })
    console.log('[Cron] Reseed complete')
  } catch (err) {
    console.error('[Cron] Error auto-reseeding events:', err)
  }
})

// ─── Startup cleanup ──────────────────────────────────────────────────────────
// Deferred 60s after boot so DB connection pool is fully available to serve
// real requests during the Railway health-check window.
//
// IMPORTANT: All queries are fire-and-forget (.then/.catch — never awaited at
// the top level). The previous await + Promise.race pattern looked like it
// timed out, but the underlying Prisma query kept running and holding its
// connection pool slot — starving events/feed routes for the full duration.
// Fire-and-forget lets each query release its slot the moment it finishes,
// regardless of how long the others take.
setTimeout(() => {
  const cutoff = new Date(Date.now() - 8 * 3_600_000)

  // 1. Delete expired externally-synced events (independent — fire-and-forget)
  //    User-created events are never auto-deleted.
  prisma.event.deleteMany({
    where: { externalSource: { not: null }, startsAt: { lt: cutoff } },
  })
    .then((r) => { if (r.count > 0) console.log(`[Startup] Deleted ${r.count} expired external events`) })
    .catch((err) => console.error('[Startup] delete expired events failed:', err))

  // 2. Unpublish external events outside UK/Ireland bbox (independent — fire-and-forget)
  //    UK+Ireland rough bbox: lat 49–60, lng -11 to 2
  prisma.event.updateMany({
    where: {
      externalSource: { not: null },
      isPublished: true,
      OR: [
        { lat: { lt: 49 } },
        { lat: { gt: 60 } },
        { lng: { lt: -11 } },
        { lng: { gt: 2 } },
      ],
    },
    data: { isPublished: false },
  })
    .then((r) => { if (r.count > 0) console.log(`[Startup] Unpublished ${r.count} out-of-region external events`) })
    .catch((err) => console.error('[Startup] unpublish overseas events failed:', err))

  // 3 + 4. Upsert system user → then migrate demo-host events (chained, fire-and-forget)
  prisma.user.upsert({
    where: { firebaseUid: 'partyradar_system' },
    create: {
      firebaseUid: 'partyradar_system',
      email: 'assistant@partyradar.app',
      username: 'partyradar',
      displayName: 'PartyRadar Assistant',
      photoUrl: 'https://partyradar.app/icons/icon-192.png',
      interests: [],
      subscriptionTier: 'FREE',
    },
    update: {
      displayName: 'PartyRadar Assistant',
      photoUrl: 'https://partyradar.app/icons/icon-192.png',
    },
  })
    .then((systemUser) => {
      prisma.event.updateMany({
        where: {
          externalSource: { not: null },
          host: { displayName: 'demo' },
          hostId: { not: systemUser.id },
        },
        data: { hostId: systemUser.id },
      })
        .then((r) => { if (r.count > 0) console.log(`[Startup] Reassigned ${r.count} external events from "demo" → PartyRadar Assistant`) })
        .catch((err) => console.error('[Startup] migrate demo-host events failed:', err))
    })
    .catch((err) => console.error('[Startup] upsert system user failed:', err))

  // 5 + 6. Find demo users → then delete bot posts (chained, fire-and-forget)
  prisma.user.findMany({
    where: { firebaseUid: { startsWith: 'demo_' } },
    select: { id: true },
  })
    .then((botUsers) => {
      if (botUsers.length === 0) return
      const botIds = botUsers.map((u) => u.id)
      prisma.post.deleteMany({ where: { userId: { in: botIds } } })
        .then((r) => { if (r.count > 0) console.log(`[Startup] Deleted ${r.count} bot post(s) from demo accounts`) })
        .catch((err) => console.error('[Startup] delete bot posts failed:', err))
    })
    .catch((err) => console.error('[Startup] find demo users failed:', err))

  // 7 + 8. Find legacy posts → then backfill PostMedia (chained, fire-and-forget)
  prisma.post.findMany({
    where: { imageUrl: { not: null }, media: { none: {} } },
    select: { id: true, imageUrl: true },
    take: 200,
  })
    .then((legacyPosts) => {
      if (legacyPosts.length === 0) return
      prisma.postMedia.createMany({
        data: legacyPosts
          .filter((p) => p.imageUrl)
          .map((p) => ({
            postId: p.id,
            url: p.imageUrl!,
            type: p.imageUrl!.includes('/video/') ? ('VIDEO' as const) : ('IMAGE' as const),
            sortOrder: 0,
          })),
      })
        .then((r) => console.log(`[Startup] Backfilled PostMedia for ${r.count} legacy post(s)`))
        .catch((err) => console.error('[Startup] backfill PostMedia failed:', err))
    })
    .catch((err) => console.error('[Startup] find legacy posts failed:', err))
}, 60_000) // 60s delay — DB must be warm before cleanup queries run

// ─── Startup: immediate DB pre-warmup ────────────────────────────────────────
// The very first user request after a cold deploy is almost always ai-sync,
// which arrives ~7 s after boot and immediately calls prisma.user.upsert().
// If Neon's compute is suspended, PgBouncer wakes it but the query may take
// 15–30 s. During that window every Prisma pool slot is occupied by the cold-
// start handshake, and the server becomes unresponsive (zombie state).
//
// Fix: fire a SELECT 1 immediately at startup. The async await returns control
// to the event loop (health checks keep passing) while PgBouncer wakes Neon in
// the background. By the time ai-sync's upsert runs (~7 s later), Neon is warm
// and the connection slot is already released back to the pool.
;(async () => {
  console.log('[Startup] Pre-warming DB connection via PgBouncer pooler…')
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`
      console.log(`[Startup] DB pre-warm succeeded (attempt ${attempt})`)
      return
    } catch (err) {
      console.warn(
        `[Startup] DB pre-warm attempt ${attempt}/5 failed:`,
        err instanceof Error ? err.message : String(err),
      )
      // Short back-off before retrying — PgBouncer may still be waking Neon
      await new Promise<void>((r) => setTimeout(r, 5_000))
    }
  }
  console.error('[Startup] DB pre-warm failed after 5 attempts — continuing anyway')
})()

// ─── Startup: log event/venue counts (informational only) ────────────────────
// The old pattern called fetch(localhost/api/admin/seed-*) here, which was a
// self-HTTP call. It could arrive while the DB pool was still warming, and a
// hung fetch held one of Neon's 3 free-tier connections indefinitely, starving
// all incoming requests. Removed — event sync is now driven by the frontend
// (POST /events/ai-sync fires when the user's location resolves, with a 120s
// timeout so Eventbrite+SerpAPI+Perplexity can complete comfortably).
// Venue seeding is driven by POST /venues/discover when the venues tab opens.
setTimeout(() => {
  Promise.all([
    prisma.venue.count(),
    prisma.event.count({ where: { isPublished: true, isCancelled: false, startsAt: { gt: new Date() } } }),
  ])
    .then(([venues, events]) => {
      console.log(`[Startup] DB state: ${venues} venue(s), ${events} upcoming event(s)`)
    })
    .catch((err) => console.error('[Startup] DB count failed:', err))
}, 90_000) // fire after cleanup window — just a diagnostic log, never blocks

// ─── Env-var sanity check ────────────────────────────────────────────────────

function checkEnvVars() {
  const required = [
    'DATABASE_URL',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
  ]
  const paymentRequired = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ]
  const missing: string[] = []
  for (const key of required) {
    if (!process.env[key]) missing.push(key)
  }
  const missingPayment: string[] = []
  for (const key of paymentRequired) {
    if (!process.env[key]) missingPayment.push(key)
  }

  if (missing.length > 0) {
    // Never exit — a dead server is worse than a partially-broken one.
    // Individual routes (auth, events, etc.) will fail with their own errors
    // when the missing var is actually needed. The health endpoint must stay up.
    console.error(`\n❌ [Startup] Missing env vars: ${missing.join(', ')} — dependent features will fail but server will start.`)
  }

  if (missingPayment.length > 0) {
    // Non-fatal: payment routes will fail gracefully on individual requests,
    // but the rest of the API (events, venues, auth) must remain available.
    // Previously this called process.exit(1) in production — that silently
    // killed the server if Stripe keys weren't set, making the entire API
    // unreachable. Warn loudly instead.
    console.warn(`\n⚠️  [Startup] Missing payment env vars (Stripe disabled): ${missingPayment.join(', ')}\n`)
    console.warn('   Ticket purchases and subscriptions will fail. Set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET to enable.')
  }

  // INTERNAL_API_KEY — required for startup auto-seed + hourly reseed cron.
  // Without it the DB stays empty on fresh deploys: no venues, no events, no feed.
  if (!process.env['INTERNAL_API_KEY']) {
    console.warn(
      '⚠️  [Startup] INTERNAL_API_KEY is not set — startup auto-seed and the ' +
      'hourly reseed cron will be skipped. Set a random secret string in Railway ' +
      'env vars to enable automatic venue + event population on fresh deploys.',
    )
  }

  // Discovery env vars — NOT fatal (the app still works without them, just
  // with an empty venue/event list) but we surface them loudly because an
  // empty "nothing near you" state otherwise looks like a bug to the user.
  if (!process.env['GOOGLE_PLACES_API_KEY']) {
    console.warn(
      '⚠️  [Startup] GOOGLE_PLACES_API_KEY is not set — venue discovery will ' +
      'return only venues already in the DB. Set it to unlock real-time ' +
      'Google Places lookups.',
    )
  }
  const eventSourceKeys = [
    'TICKETMASTER_API_KEY', 'SKIDDLE_API_KEY', 'EVENTBRITE_PRIVATE_TOKEN',
    'SERPAPI_KEY', 'PERPLEXITY_API_KEY',
  ]
  const anyEventSource = eventSourceKeys.some((k) => process.env[k])
  if (!anyEventSource) {
    console.warn(
      `⚠️  [Startup] No event source keys configured (${eventSourceKeys.join(', ')}). ` +
      'Event lists will only show whatever is already in the DB. Set at least ' +
      'one of these to auto-populate events from external sources.',
    )
  }
}

checkEnvVars()

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`\n🎉 PartyRadar API running on http://localhost:${PORT}\n`)
})

export default app
