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
import { randomUUID } from 'crypto'
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
import medalsRouter from './routes/medals'
import compGroupsRouter from './routes/comp-groups'
import challengesRouter, { dispatchWeekendChallenges } from './routes/challenges'
import { errorHandler } from './middleware/errorHandler'
import { sendNotification, sendNotificationToMany } from './lib/fcm'
import { deleteCloudinaryAsset } from './lib/cloudinary'
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

// ─── Early OPTIONS preflight handler ─────────────────────────────────────────
// Must be registered before rate limiters and all other middleware.
//
// Root cause: Railway's Fastly edge can strip the Access-Control-Request-Method
// header from OPTIONS requests before they reach the origin server. When that
// header is missing, the cors() middleware does NOT recognise the request as a
// CORS preflight and calls next() instead of responding 204. The request then
// flows into the rate limiter → request-timeout middleware → route handlers.
// None of those send a response for OPTIONS on API paths, so the browser's
// preflight hangs indefinitely, blocking every cross-origin GET/POST.
//
// This explicit handler short-circuits OPTIONS before any other layer can touch
// the request, and always returns 204 with the correct Access-Control headers.
app.options('*', (req, res) => {
  const origin = req.headers.origin ?? ''
  const allowed =
    /^https:\/\/partyradar[a-z0-9-]*\.vercel\.app$/i.test(origin) ||
    /^https:\/\/([a-z0-9-]+\.)?partyradar\.app$/i.test(origin) ||
    origin === 'http://localhost:3000' ||
    origin === 'http://localhost:3001' ||
    (!!process.env['FRONTEND_URL'] && origin === process.env['FRONTEND_URL'])
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      (req.headers['access-control-request-headers'] as string | undefined) ??
        'Content-Type,Authorization',
    )
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  res.status(204).end()
})

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
      // Notify the sender their message failed — prevents silent loss
      socket.emit('message-error', { text, reason: 'Failed to send message. Please try again.' })
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

// Configure Helmet with an explicit CSP that permits WebSocket (wss:) connections.
// The default helmet() CSP sets connect-src 'self' only, which blocks Socket.io
// WebSocket upgrade requests in the browser. Since this is a JSON API + Socket.io
// server the CSP also allows data: and https: for images/fonts.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", 'https:', "'unsafe-inline'"],
      imgSrc:         ["'self'", 'data:', 'https:'],
      fontSrc:        ["'self'", 'https:', 'data:'],
      connectSrc:     ["'self'", 'wss:', 'ws:', 'https:'],  // allow Socket.io WebSocket
      frameSrc:       ["'none'"],
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
      formAction:     ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
}))

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
  const timeoutMs = (isAdmin || isAiSync) ? 120_000 : 25_000
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
app.use('/api/medals', medalsRouter)
app.use('/api/comp-groups', compGroupsRouter)
app.use('/api/challenges', challengesRouter)

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

// Events-table probe — tests count, bare findMany (no include), and findMany
// with host include. Each step timed individually to isolate the bottleneck.
// Safe to call unauthenticated.
app.get('/api/health/events', async (_req, res) => {
  const results: Record<string, number | string> = {}
  const eightHoursAgo = new Date(Date.now() - 8 * 3_600_000)
  const where = { isPublished: true, isCancelled: false, startsAt: { gte: eightHoursAgo } }

  // Step 1: count
  let t = Date.now()
  try {
    const count = await Promise.race([
      prisma.event.count({ where }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('count timeout')), 15_000)),
    ])
    results['countMs'] = Date.now() - t
    results['futureEvents'] = count
  } catch (err: any) { results['countErr'] = err?.message ?? String(err) }

  // Step 2: bare findMany, no include — just id+name
  t = Date.now()
  try {
    const rows = await Promise.race([
      prisma.event.findMany({ where, take: 5, select: { id: true, name: true, startsAt: true }, orderBy: { startsAt: 'asc' } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('bareFind timeout')), 15_000)),
    ])
    results['bareFindMs'] = Date.now() - t
    results['bareFindCount'] = rows.length
  } catch (err: any) { results['bareFindErr'] = err?.message ?? String(err) }

  // Step 3: findMany with host include
  t = Date.now()
  try {
    const rows = await Promise.race([
      prisma.event.findMany({
        where, take: 3,
        orderBy: [{ isFeatured: 'desc' }, { startsAt: 'asc' }],
        include: { host: { select: { id: true, username: true, displayName: true, photoUrl: true } } },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('includeFind timeout')), 15_000)),
    ])
    results['includeFindMs'] = Date.now() - t
    results['includeFindCount'] = rows.length
  } catch (err: any) { results['includeFindErr'] = err?.message ?? String(err) }

  res.json({ status: 'ok', ...results })
})

// Full events-handler diagnostic — mirrors GET /api/events exactly (take:30,
// full userSelect, dedupeEvents, guestGroupBy, savesGroupBy) with per-step
// timing. Shows WHICH step causes the 60s hang that plain probe misses.
// Safe to call unauthenticated.
app.get('/api/health/events-full', async (_req, res) => {
  const diag: Record<string, number | string> = {}
  const eightHoursAgo = new Date(Date.now() - 8 * 3_600_000)
  const where = { isPublished: true, isCancelled: false, startsAt: { gte: eightHoursAgo } }
  const fullSelect = {
    id: true, username: true, displayName: true,
    photoUrl: true, bio: true, ageVerified: true,
    alcoholFriendly: true, subscriptionTier: true,
  }

  const raceStep = <T>(label: string, p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after 15s`)), 15_000)
      ),
    ])

  // Step 1: findMany take:30, NO include, single-field orderBy (matches fixed events handler)
  let t = Date.now()
  let allEvents: { id: string; hostId: string; externalSource?: string | null; name: string; venueName?: string | null; venueId?: string | null; lat: number; lng: number; startsAt: Date; isFeatured: boolean }[] = []
  try {
    allEvents = await raceStep('findMany30', prisma.event.findMany({
      where,
      take: 30,
      orderBy: { startsAt: 'asc' },  // single-field: index-backed, no full-table sort
    }) as unknown as Promise<typeof allEvents>)
    diag['findMany30Ms'] = Date.now() - t
    diag['findMany30Count'] = allEvents.length
  } catch (err: any) {
    diag['findMany30Err'] = err?.message ?? String(err)
    return res.status(500).json({ diag })
  }

  // Step 2: dedupeEvents (pure JS, should be instant)
  t = Date.now()
  let deduped: typeof allEvents = []
  try {
    const { dedupeEvents: de } = await import('./lib/dedupeEvents')
    deduped = de(allEvents)
    diag['dedupeMs'] = Date.now() - t
    diag['dedupedCount'] = deduped.length
  } catch (err: any) {
    diag['dedupeErr'] = err?.message ?? String(err)
    return res.status(500).json({ diag })
  }

  // Step 3: guestGroupBy (EventGuest WHERE eventId IN paged IDs)
  const pagedIds = deduped.slice(0, 20).map((e) => e.id)
  diag['pagedIds'] = pagedIds.length
  t = Date.now()
  type GBRow = { eventId: string; _count: { id: number } }
  let guestRows: GBRow[] = []
  try {
    if (pagedIds.length > 0) {
      guestRows = await raceStep('guestGroupBy',
        prisma.eventGuest.groupBy({
          by: ['eventId'],
          where: { eventId: { in: pagedIds }, status: 'CONFIRMED' },
          _count: { id: true },
        }) as unknown as Promise<GBRow[]>
      )
    }
    diag['guestGroupByMs'] = Date.now() - t
    diag['guestRowCount'] = guestRows.length
  } catch (err: any) {
    diag['guestGroupByErr'] = err?.message ?? String(err)
    return res.status(500).json({ diag })
  }

  // Step 4: savesGroupBy (SavedEvent WHERE eventId IN paged IDs)
  t = Date.now()
  let savesRows: GBRow[] = []
  try {
    if (pagedIds.length > 0) {
      savesRows = await raceStep('savesGroupBy',
        prisma.savedEvent.groupBy({
          by: ['eventId'],
          where: { eventId: { in: pagedIds } },
          _count: { id: true },
        }) as unknown as Promise<GBRow[]>
      )
    }
    diag['savesGroupByMs'] = Date.now() - t
    diag['savesRowCount'] = savesRows.length
  } catch (err: any) {
    diag['savesGroupByErr'] = err?.message ?? String(err)
    return res.status(500).json({ diag })
  }

  res.json({ status: 'ok', diag })
})

app.use(errorHandler)

// ─── Cron Jobs ────────────────────────────────────────────────────────────────

// ── Neon keepalive ───────────────────────────────────────────────────────────
// Neon free-tier computes auto-suspend after 5 minutes of inactivity.
// Ping every minute so there is never more than 60 s of DB idle time —
// well below the 5-minute suspend threshold.
//
// IMPORTANT: We run 3 pings concurrently (connection_limit=3 pool) so that ALL
// pool connections are touched every minute. A single SELECT 1 only refreshes
// connection 1; connections 2 and 3 stay idle and drift into a zombie half-open
// state after Neon's brief intra-session suspension. When a large query then
// lands on a zombie connection, Prisma's Rust engine blocks the socket read
// indefinitely — freezing the Node.js event loop. Pinging all 3 slots prevents
// zombie connections entirely at the cost of 3 trivial SELECT 1 queries/min.
cron.schedule('* * * * *', async () => {
  try {
    // Three concurrent pings to keep all pool connections alive.
    await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      prisma.$queryRaw`SELECT 1`,
      prisma.$queryRaw`SELECT 1`,
    ])
  } catch (err) {
    console.error('[Keepalive] DB ping failed:', err instanceof Error ? err.message : String(err))
  }
})

// Every 30 minutes: expire stories
cron.schedule('*/30 * * * *', async () => {
  try {
    // M5 fix: collect Cloudinary asset URLs before deletion so we can clean
    // them up — previously the cron left orphaned storage after every story expiry.
    const expiredStories = await prisma.post.findMany({
      where: { isStory: true, expiresAt: { lte: new Date() } },
      select: {
        id: true,
        imageUrl: true,
        media: { select: { url: true, type: true } },
      },
    })

    if (expiredStories.length === 0) return

    // Delete from Cloudinary (best-effort, don't let failures block DB cleanup)
    await Promise.allSettled(
      expiredStories.flatMap((story) => {
        const assets: Promise<void>[] = []
        if (story.imageUrl) assets.push(deleteCloudinaryAsset(story.imageUrl, 'image'))
        for (const m of story.media) {
          assets.push(deleteCloudinaryAsset(m.url, m.type === 'VIDEO' ? 'video' : 'image'))
        }
        return assets
      })
    )

    await prisma.post.deleteMany({
      where: { id: { in: expiredStories.map((s) => s.id) } },
    })

    console.log(`[Cron] Expired ${expiredStories.length} story/stories (Cloudinary assets cleaned up)`)
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

    // M4 fix: parallelize per-event fan-out (was sequential awaits per guest)
    await Promise.allSettled(
      upcomingEvents.map((event) =>
        sendNotificationToMany(
          event.guests.map((g) => g.userId),
          {
            type: 'EVENT_REMINDER',
            title: `${event.name} starts in 1 hour!`,
            body: `Get ready — it's almost time`,
            data: { eventId: event.id },
          },
        )
      )
    )

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

    // M4 fix: parallelize per-event fan-out (was sequential awaits per guest)
    await Promise.allSettled(
      events.map((event) =>
        sendNotificationToMany(
          event.guests.map((g) => g.userId),
          {
            type: 'EVENT_REMINDER',
            title: `👔 ${event.name} — dress code reminder`,
            body: `Dress code: ${event.dressCode}. Event starts in ~2 hours.`,
            data: { eventId: event.id },
          },
        )
      )
    )

    if (events.length > 0) {
      console.log(`[Cron] Sent dress code reminders for ${events.length} event(s)`)
    }
  } catch (err) {
    console.error('[Cron] Error sending dress code reminders:', err)
  }
})

// ── Weekend group challenges ───────────────────────────────────────────────────
// Friday at 18:00 UTC — dispatch weekend challenges to active groups
cron.schedule('0 18 * * 5', async () => {
  try {
    console.log('[Cron] Dispatching weekend group challenges…')
    const result = await dispatchWeekendChallenges()
    console.log(`[Cron] Weekend challenges dispatched: ${result.challengeCount} challenges to ${result.groupCount} groups`)
  } catch (err) {
    console.error('[Cron] Error dispatching weekend challenges:', err)
  }
})

// Saturday at 14:00 UTC — second wave for groups that weren't in the first batch
cron.schedule('0 14 * * 6', async () => {
  try {
    console.log('[Cron] Saturday challenge top-up…')
    const result = await dispatchWeekendChallenges()
    console.log(`[Cron] Saturday top-up: ${result.challengeCount} challenges dispatched`)
  } catch (err) {
    console.error('[Cron] Error in Saturday challenge top-up:', err)
  }
})

// Bot-post cron removed — feed shows real users only

// ─── Auto-reseed events when they all expire ──────────────────────────────────
// Every hour: if no future published events remain, delete stale ones and log
// a warning. seed-activity is NOT called here — it runs 120+ sequential Prisma
// queries which saturates the 3-slot Neon connection pool and pushes the 512 MB
// Railway container over its memory limit (OOM crash).
//
// To seed events manually after the server has been stable for a few minutes:
//   POST /api/admin/seed-venues   Authorization: Bearer <INTERNAL_API_KEY>
//   POST /api/admin/seed-activity Authorization: Bearer <INTERNAL_API_KEY>
//
// The server is safe to seed manually once the keepalive cron has been running
// for a few minutes (Neon is warm) — typically 3–5 min after startup.
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

    console.log('[Cron] No future events found — cleanup only (manual seed required; see index.ts comments)')

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

    // ⚠️  seed-activity call intentionally removed — OOM risk on cold Neon.
    // Use manual POST /api/admin/seed-activity once server has been up 3+ min.
  } catch (err) {
    console.error('[Cron] Error in hourly cleanup:', err)
  }
})

// ─── Startup cleanup ──────────────────────────────────────────────────────────
// ─── Startup cleanup REMOVED ──────────────────────────────────────────────────
// The deferred cleanup setTimeout was removed while stabilising the Railway
// container on Neon free tier. The queries it ran (delete expired events,
// upsert system user, etc.) are all no-ops on a fresh DB and can be re-added
// once the server is confirmed stable under sustained load.


// ─── Env-var sanity check ────────────────────────────────────────────────────

function checkEnvVars() {
  const isProd = process.env['NODE_ENV'] === 'production'
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

  // INTERNAL_API_KEY — used by startup auto-seed + hourly reseed cron + spend-token endpoint.
  // C7 fix: in production an ephemeral key changes on every restart, breaking any
  // external callers and making group invite tokens invalid after a deploy.
  // Require a stable value in production. In dev an ephemeral key is acceptable.
  if (!process.env['INTERNAL_API_KEY']) {
    if (isProd) {
      // Non-fatal but loud — the server still starts so existing routes aren't
      // disrupted, but operators will see this in Railway logs.
      console.error(
        '❌ [Startup] INTERNAL_API_KEY is not set in production! ' +
        'An ephemeral key is being generated — group invite tokens will become ' +
        'invalid on the next restart and the /api/wallet/spend-token endpoint ' +
        'cannot be used by venue POS devices. Set a stable secret in Railway env vars.'
      )
    } else {
      console.warn(
        '⚠️  [Startup] INTERNAL_API_KEY not in env — ephemeral key generated for dev. ' +
        'Group invites will be invalidated on restart.',
      )
    }
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

// ── Ephemeral internal key ────────────────────────────────────────────────────
// requireAdmin accepts Bearer ${INTERNAL_API_KEY} for service-to-service calls
// (hourly reseed cron, startup auto-seed). If the env var isn't configured in
// Railway we generate a random UUID for this process lifetime. External callers
// can never guess it; the cron and startup code read the same env var so they
// always use the correct in-process value.
if (!process.env['INTERNAL_API_KEY']) {
  process.env['INTERNAL_API_KEY'] = randomUUID()
  console.log('[Startup] No INTERNAL_API_KEY configured — generated ephemeral session key')
}

// ─── Startup schema guard ─────────────────────────────────────────────────────
// Creates the Medal / UserMedal tables if they don't exist yet in production.
// Runs as a non-blocking background task so it never delays the healthcheck.
async function ensureMedalSchema() {
  try {
    await (prisma as any).medal.count() // fast check — returns immediately if table exists
    console.log('[schema] Medal table OK')
  } catch (e: any) {
    if (e?.code !== 'P2021') return // unknown error — don't try to auto-create
    console.log('[schema] Medal table missing — creating now...')
    const stmts = [
      `DO $$ BEGIN CREATE TYPE "MedalTier" AS ENUM ('BRONZE','SILVER','GOLD'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "MedalCategory" AS ENUM ('SOCIAL','EVENTS','HOST','EXPLORER','LOYALTY','SPECIAL'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN CREATE TYPE "MedalCondition" AS ENUM ('FOLLOWERS_COUNT','FOLLOWING_COUNT','EVENTS_ATTENDED','EVENTS_ORGANISED','TICKETS_BOUGHT','CHECKINS_COUNT','REFERRALS_MADE','VENUES_VISITED','POSTS_COUNT','SPECIFIC_EVENT'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `CREATE TABLE IF NOT EXISTS "Medal" ("id" TEXT NOT NULL,"slug" TEXT NOT NULL,"name" TEXT NOT NULL,"description" TEXT NOT NULL,"icon" TEXT NOT NULL,"tier" "MedalTier" NOT NULL,"category" "MedalCategory" NOT NULL,"conditionType" "MedalCondition" NOT NULL,"threshold" INTEGER NOT NULL DEFAULT 1,"eventId" TEXT,"sortOrder" INTEGER NOT NULL DEFAULT 0,"isActive" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "Medal_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "UserMedal" ("id" TEXT NOT NULL,"userId" TEXT NOT NULL,"medalId" TEXT NOT NULL,"earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "UserMedal_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "Medal_slug_tier_key" ON "Medal"("slug","tier")`,
      `CREATE INDEX IF NOT EXISTS "Medal_category_isActive_idx" ON "Medal"("category","isActive")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "UserMedal_userId_medalId_key" ON "UserMedal"("userId","medalId")`,
      `DO $$ BEGIN ALTER TABLE "UserMedal" ADD CONSTRAINT "UserMedal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `DO $$ BEGIN ALTER TABLE "UserMedal" ADD CONSTRAINT "UserMedal_medalId_fkey" FOREIGN KEY ("medalId") REFERENCES "Medal"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$`,
    ]
    for (const sql of stmts) {
      await prisma.$executeRawUnsafe(sql)
    }
    console.log('[schema] Medal and UserMedal tables created successfully')
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
// Bind the port immediately — Railway's healthcheck (/api/health) must respond
// within healthcheckTimeout (120 s) or the deploy is marked failed.
// /api/health has no DB dependency so it responds in <1 ms.
// Prisma + Neon warm up lazily on the first real DB query after startup.
httpServer.listen(PORT, () => {
  console.log(`\n🎉 PartyRadar API running on http://localhost:${PORT}\n`)
  // Fire-and-forget — creates Medal/UserMedal tables in the background if missing.
  // Never blocks startup; errors are caught and logged, never thrown.
  ensureMedalSchema().catch((err) => console.error('[schema] ensureMedalSchema failed:', err))
  setInterval(() => {
    console.log(`[Heartbeat] ${new Date().toISOString()} event-loop alive`)
  }, 30_000)

    // ── Startup auto-seed REMOVED ──────────────────────────────────────────
    // seed-activity runs 120+ sequential Prisma queries. Running it on startup
    // (even at T+10min) saturates the 3-slot Neon connection pool and pushes
    // the 512 MB Railway container over its memory limit → OOM crash.
    //
    // Seeding is now done in two ways:
    //   1. MANUAL: POST /api/admin/seed-venues then /api/admin/seed-activity
    //      with Authorization: Bearer <INTERNAL_API_KEY> after the server
    //      has been stable for a few minutes.
    //   2. AUTOMATIC: The hourly reseed cron (below) fires at :00 of every
    //      hour and re-seeds if no future events exist. So within 60 min of
    //      a fresh deploy with an empty DB, events populate automatically.
})

export default app
