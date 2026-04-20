import 'dotenv/config' // v2789fe8
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
import radarRouter from './routes/radar'
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
import phoneRouter from './routes/phone-verify'
import brandsRouter from './routes/partner-brands'
import referralCardsRouter from './routes/referral-cards'
import matchRouter from './routes/match'
import squadsRouter from './routes/squads'
import goOutRouter from './routes/go-out'
import { errorHandler } from './middleware/errorHandler'
import { sendNotification } from './lib/fcm'
import { auth as firebaseAuth } from './lib/firebase-admin'
import rateLimit from 'express-rate-limit'

const app = express()
const httpServer = createServer(app)
const PORT = process.env['PORT'] ?? 4000

// ─── Socket.io ────────────────────────────────────────────────────────────────

export const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env['FRONTEND_URL'] ?? '',
    ].filter(Boolean),
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
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env['FRONTEND_URL'] ?? '',
    ].filter(Boolean)
    // Allow all Vercel deployments and requests with no origin (curl, mobile)
    if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true)
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`))
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

app.use('/api', globalLimiter)
app.use('/api/auth', authLimiter)
app.use('/api/tickets', paymentLimiter)
app.use('/api/subscriptions', paymentLimiter)
app.use('/api/blast', paymentLimiter)
app.use('/api/wallet/top-up', paymentLimiter)
app.use('/api/wallet/spend', paymentLimiter)
app.use('/api/wallet/order-card', paymentLimiter)
app.use('/api/venues/discover', discoverLimiter)

// Raw body for Stripe webhook signature verification
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '2mb' }))

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter)
app.use('/api/events', friendsGoingRouter)
app.use('/api/events', savesRouter)
app.use('/api/events', analyticsRouter)
app.use('/api/events', eventsRouter)
app.use('/api/events/:id/guests', guestsRouter)
app.use('/api/tickets', ticketsRouter)
app.use('/api/radar', radarRouter)
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
app.use('/api/phone', phoneRouter)
app.use('/api/brands', brandsRouter)
app.use('/api/referral-cards', referralCardsRouter)
app.use('/api/match', matchRouter)
app.use('/api/squads', squadsRouter)
app.use('/api/go-out', goOutRouter)

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

app.use(errorHandler)

// ─── Cron Jobs ────────────────────────────────────────────────────────────────

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

// Every 30 minutes: inject fresh venue activity posts to keep feed live
cron.schedule('*/30 * * * *', async () => {
  try {
    const hour = new Date().getHours()
    // Only post activity between 6pm and 4am (active nightlife hours)
    // Bug 16 fix: was `hour > 4` (skips 5-17 only), should be `hour >= 4` (also skips 4am)
    if (hour >= 4 && hour < 18) return

    const eveningMessages = [
      'Doors open, early crowd filtering in 🚪',
      'Sound check done — tonight is going to go off 🎵',
      'Bar just opened, get here early for the queue 🍺',
      'Tickets still available on the door 🎟️',
    ]
    const nightMessages = [
      'Floor is absolutely rammed 🔥',
      'Best crowd we\'ve had all month 🙌',
      'DJ just dropped a monster set 💥',
      'Vibes in here are genuinely immaculate tonight ✨',
      'Queue moving fast — worth the wait 🖤',
      'This is what Glasgow nightlife is about 🏴󠁧󠁢󠁳󠁣󠁴󠁿',
      'Sound system absolutely thumping tonight 🎧',
    ]
    const msgs = (hour >= 22 || hour < 4) ? nightMessages : eveningMessages

    const demoUsers = await prisma.user.findMany({
      where: { firebaseUid: { startsWith: 'demo_user' } },
      select: { id: true },
    })
    const venues = await prisma.venue.findMany({
      where: { city: 'Glasgow' },
      select: { id: true, name: true },
      take: 18,
    })
    if (demoUsers.length === 0 || venues.length === 0) return

    // Post to 1-2 random venues
    const count = Math.random() > 0.5 ? 2 : 1
    const picked = venues.sort(() => Math.random() - 0.5).slice(0, count)
    for (const venue of picked) {
      const user = demoUsers[Math.floor(Math.random() * demoUsers.length)]!
      const text = msgs[Math.floor(Math.random() * msgs.length)]!
      await prisma.post.create({ data: { userId: user.id, venueId: venue.id, text } })
      console.log(`[Cron] Live post at ${venue.name}: "${text}"`)
    }
  } catch (err) {
    console.error('[Cron] Error refreshing activity:', err)
  }
})

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
// Runs once on boot: purges external events that expired or were synced for wrong cities
;(async () => {
  try {
    const cutoff = new Date(Date.now() - 8 * 3_600_000)

    // 1. Delete expired externally-synced events (Ticketmaster, Skiddle, Perplexity, etc.)
    //    User-created events are never auto-deleted.
    const expiredExternal = await prisma.event.deleteMany({
      where: {
        externalSource: { not: null },
        startsAt: { lt: cutoff },
      },
    })
    if (expiredExternal.count > 0) {
      console.log(`[Startup] Deleted ${expiredExternal.count} expired external events`)
    }

    // 2. Unpublish external events outside the UK/Ireland bounding box
    //    (catches Amsterdam, US, or other mis-geocoded events that slipped through)
    //    UK+Ireland rough bbox: lat 49–60, lng -11 to 2
    const overseas = await prisma.event.updateMany({
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
    if (overseas.count > 0) {
      console.log(`[Startup] Unpublished ${overseas.count} out-of-region external events`)
    }

    // 3. Ensure the PartyRadar Assistant system account exists and reassign any external
    //    events that are still pointing to an old "demo" admin user as host.
    const systemUser = await prisma.user.upsert({
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
      update: { displayName: 'PartyRadar Assistant' },
    })

    // Migrate externally-synced events whose host displayName is still "demo" (legacy admin)
    const migrated = await prisma.event.updateMany({
      where: {
        externalSource: { not: null },
        host: { displayName: 'demo' },
        hostId: { not: systemUser.id },
      },
      data: { hostId: systemUser.id },
    })
    if (migrated.count > 0) {
      console.log(`[Startup] Reassigned ${migrated.count} external events from "demo" → PartyRadar Assistant`)
    }
  } catch (err) {
    console.error('[Startup] Cleanup error:', err)
  }
})()

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`\n🎉 PartyRadar API running on http://localhost:${PORT}\n`)
})

export default app
