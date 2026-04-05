import 'dotenv/config'
import { createServer } from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cron from 'node-cron'
import { Server } from 'socket.io'
import { prisma } from '@partyradar/db'

import authRouter from './routes/auth'
import eventsRouter from './routes/events'
import guestsRouter from './routes/guests'
import ticketsRouter from './routes/tickets'
import radarRouter from './routes/radar'
import subscriptionsRouter from './routes/subscriptions'
import notificationsRouter from './routes/notifications'
import uploadsRouter from './routes/uploads'
import adminRouter from './routes/admin'
import webhooksRouter from './routes/webhooks'
import messagesRouter from './routes/messages'
import { errorHandler } from './middleware/errorHandler'
import { sendNotification } from './lib/fcm'
import { auth as firebaseAuth } from './lib/firebase-admin'

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
    // In dev mode with mock tokens — allow with a fallback identity
    if (process.env['NODE_ENV'] !== 'production') {
      socket.data['userId'] = 'dev-user'
      socket.data['displayName'] = 'Dev User'
      socket.data['photoUrl'] = null
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
      io.to(room).emit('online-count', roomOnlineCount[room]!.size)
    }
  })

  // ── disconnect ───────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    // Clean up online count from all rooms this socket was in
    for (const [room, members] of Object.entries(roomOnlineCount)) {
      if (socket.data['userId'] && members.has(socket.data['userId'] as string)) {
        members.delete(socket.data['userId'] as string)
        io.to(room).emit('online-count', members.size)
      }
    }
    console.log(`[Socket] Disconnected: ${socket.id}`)
  })
})

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet())
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env['FRONTEND_URL'] ?? '',
  ].filter(Boolean),
  credentials: true,
}))
app.use(morgan('dev'))

// Raw body for Stripe webhook signature verification
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '2mb' }))

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter)
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

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

app.use(errorHandler)

// ─── Cron Jobs ────────────────────────────────────────────────────────────────

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

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`\n🎉 PartyRadar API running on http://localhost:${PORT}\n`)
})

export default app
