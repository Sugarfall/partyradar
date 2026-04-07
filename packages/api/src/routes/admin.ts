import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAdmin } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { stripe } from '../lib/stripe'

const router = Router()

/** GET /api/admin/events */
router.get('/events', requireAdmin, async (_req, res, next) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        host: { select: { id: true, username: true, displayName: true, email: true } },
        _count: { select: { guests: true, tickets: true } },
      },
      take: 100,
    })
    res.json({ data: events })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/admin/events/:id/feature */
router.put('/events/:id/feature', requireAdmin, async (req, res, next) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params['id'] } })
    if (!event) throw new AppError('Event not found', 404)
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: { isFeatured: !event.isFeatured },
    })
    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/admin/events/:id */
router.delete('/events/:id', requireAdmin, async (req, res, next) => {
  try {
    await prisma.event.update({ where: { id: req.params['id'] }, data: { isCancelled: true, isPublished: false } })
    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/admin/sightings */
router.get('/sightings', requireAdmin, async (_req, res, next) => {
  try {
    const sightings = await prisma.celebritySighting.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, username: true, displayName: true } },
      },
      take: 100,
    })
    res.json({ data: sightings })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/admin/sightings/:id/verify */
router.put('/sightings/:id/verify', requireAdmin, async (req, res, next) => {
  try {
    const updated = await prisma.celebritySighting.update({
      where: { id: req.params['id'] },
      data: { isVerified: true },
    })
    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/admin/sightings/:id */
router.delete('/sightings/:id', requireAdmin, async (req, res, next) => {
  try {
    await prisma.celebritySighting.delete({ where: { id: req.params['id'] } })
    res.json({ data: { success: true } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/admin/users */
router.get('/users', requireAdmin, async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, username: true, displayName: true,
        subscriptionTier: true, ageVerified: true, isBanned: true,
        isAdmin: true, createdAt: true,
        _count: { select: { hostedEvents: true, tickets: true } },
      },
      take: 200,
    })
    res.json({ data: users })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/admin/users/:id/ban */
router.put('/users/:id/ban', requireAdmin, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params['id'] } })
    if (!user) throw new AppError('User not found', 404)
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { isBanned: !user.isBanned },
    })
    res.json({ data: { isBanned: updated.isBanned } })
  } catch (err) {
    next(err)
  }
})

/** GET /api/admin/revenue */
router.get('/revenue', requireAdmin, async (_req, res, next) => {
  try {
    // Get Stripe balance
    const balance = await stripe.balance.retrieve()

    // Platform revenue from ticket fees
    const tickets = await prisma.ticket.aggregate({ _sum: { platformFee: true, pricePaid: true } })

    // Subscription counts by tier
    const tierCounts = await prisma.user.groupBy({
      by: ['subscriptionTier'],
      _count: true,
    })

    // Recent tickets
    const recentTickets = await prisma.ticket.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        event: { select: { name: true } },
        user: { select: { username: true } },
      },
    })

    res.json({
      data: {
        stripeBalance: balance.available,
        ticketRevenue: tickets._sum.pricePaid ?? 0,
        platformFees: tickets._sum.platformFee ?? 0,
        tierCounts,
        recentTickets,
      },
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/admin/seed-venues — seed Glasgow venues (idempotent) */
router.post('/seed-venues', async (_req, res, next) => {
  try {
    const venues = [
      { name: 'Sub Club', address: '22 Jamaica St, Glasgow G1 4QD', city: 'Glasgow', lat: 55.8585, lng: -4.2534, type: 'NIGHTCLUB' as const, website: 'https://subclub.co.uk', vibeTags: ['Techno', 'House', 'Underground', 'Intimate'] },
      { name: 'SWG3', address: 'Eastvale Place, Glasgow G3 8QG', city: 'Glasgow', lat: 55.8648, lng: -4.2887, type: 'CONCERT_HALL' as const, website: 'https://swg3.tv', vibeTags: ['Live Music', 'Art', 'Warehouse', 'Eclectic'] },
      { name: 'Barrowland Ballroom', address: '244 Gallowgate, Glasgow G4 0TT', city: 'Glasgow', lat: 55.8564, lng: -4.2368, type: 'CONCERT_HALL' as const, website: 'https://barrowland-ballroom.co.uk', vibeTags: ['Live Music', 'Iconic', 'Rock', 'Indie'] },
      { name: 'Òran Mór', address: 'Top of Byres Rd, Glasgow G12 8QX', city: 'Glasgow', lat: 55.8748, lng: -4.2932, type: 'BAR' as const, website: 'https://oranmor.co.uk', vibeTags: ['Comedy', 'Live Music', 'Theatre', 'Whisky'] },
      { name: 'Merchant City Inn', address: '52 Virginia St, Glasgow G1 1TY', city: 'Glasgow', lat: 55.8603, lng: -4.2437, type: 'PUB' as const, vibeTags: ['Cosy', 'Real Ale', 'Sports', 'Locals'] },
      { name: 'The Garage', address: '490 Sauchiehall St, Glasgow G2 3LW', city: 'Glasgow', lat: 55.8658, lng: -4.2706, type: 'NIGHTCLUB' as const, website: 'https://garageglasgow.co.uk', vibeTags: ['Student', 'Pop', 'R&B', 'Live Music'] },
      { name: 'Buff Club', address: '142 Bath Ln, Glasgow G2 4SQ', city: 'Glasgow', lat: 55.8647, lng: -4.2680, type: 'NIGHTCLUB' as const, vibeTags: ['House', 'Dance', 'Student', 'Late Night'] },
      { name: 'Nice N Sleazy', address: '421 Sauchiehall St, Glasgow G2 3LG', city: 'Glasgow', lat: 55.8655, lng: -4.2693, type: 'BAR' as const, vibeTags: ['Indie', 'Rock', 'Live Music', 'Grungy'] },
      { name: 'Stereo', address: '20-28 Renfield Ln, Glasgow G2 6PH', city: 'Glasgow', lat: 55.8622, lng: -4.2593, type: 'BAR' as const, website: 'https://stereo-glasgow.com', vibeTags: ['Vegan', 'Indie', 'Alternative', 'Live Music'] },
      { name: 'The Hug and Pint', address: '171 Great Western Rd, Glasgow G4 9AW', city: 'Glasgow', lat: 55.8702, lng: -4.2764, type: 'PUB' as const, vibeTags: ['Live Music', 'Vegan', 'Intimate', 'Acoustic'] },
      { name: 'King Tut\'s Wah Wah Hut', address: '272A St Vincent St, Glasgow G2 5RL', city: 'Glasgow', lat: 55.8631, lng: -4.2678, type: 'CONCERT_HALL' as const, website: 'https://kingtuts.co.uk', vibeTags: ['Live Music', 'Indie', 'Historic', 'Intimate'] },
      { name: 'Room 2', address: '50 Renfrew St, Glasgow G2 3BW', city: 'Glasgow', lat: 55.8665, lng: -4.2662, type: 'NIGHTCLUB' as const, vibeTags: ['House', 'Techno', 'LGBT+', 'Late Night'] },
      { name: 'The ABC', address: '300 Sauchiehall St, Glasgow G2 3HD', city: 'Glasgow', lat: 55.8660, lng: -4.2683, type: 'CONCERT_HALL' as const, vibeTags: ['Live Music', 'Alternative', 'Rock', 'Big Nights'] },
      { name: 'Avant Garde', address: '33 Parnie St, Glasgow G1 5RJ', city: 'Glasgow', lat: 55.8577, lng: -4.2430, type: 'BAR' as const, vibeTags: ['Craft Beer', 'Industrial', 'Hipster', 'Art'] },
      { name: 'Drygate Brewery', address: '85 Drygate, Glasgow G4 0UT', city: 'Glasgow', lat: 55.8607, lng: -4.2301, type: 'BAR' as const, website: 'https://drygate.com', vibeTags: ['Craft Beer', 'Brewery', 'Casual', 'Food'] },
      { name: 'The Pot Still', address: '154 Hope St, Glasgow G2 2TH', city: 'Glasgow', lat: 55.8634, lng: -4.2618, type: 'PUB' as const, vibeTags: ['Whisky', 'Traditional', 'Classic', 'Cosy'] },
      { name: 'Civic House', address: '26 Civic St, Glasgow G4 9RH', city: 'Glasgow', lat: 55.8721, lng: -4.2697, type: 'LOUNGE' as const, vibeTags: ['Community', 'Events', 'Alternative', 'Creative'] },
      { name: 'The Admiral Bar', address: '72A Waterloo St, Glasgow G2 7DA', city: 'Glasgow', lat: 55.8620, lng: -4.2598, type: 'BAR' as const, vibeTags: ['Live Music', 'Rock', 'Intimate', 'Grassroots'] },
    ]

    let created = 0
    let skipped = 0

    for (const venue of venues) {
      const existing = await prisma.venue.findFirst({ where: { name: venue.name, city: venue.city } })
      if (existing) { skipped++; continue }
      await prisma.venue.create({ data: venue })
      created++
    }

    res.json({ message: `Seeded ${created} venues, skipped ${skipped} existing` })
  } catch (err) {
    next(err)
  }
})

/** POST /api/admin/seed-activity — seed Glasgow nightlife activity (idempotent) */
router.post('/seed-activity', async (_req, res, next) => {
  try {
    // ── 1. Ensure demo host users exist ──────────────────────────────────────
    const demoHosts = [
      { firebaseUid: 'demo_subclub', email: 'bookings@subclub.co.uk', username: 'subclub_gla', displayName: 'Sub Club Glasgow' },
      { firebaseUid: 'demo_swg3', email: 'events@swg3.tv', username: 'swg3_events', displayName: 'SWG3 Events' },
      { firebaseUid: 'demo_kingtuts', email: 'bookings@kingtuts.co.uk', username: 'kingtuts_gla', displayName: "King Tut's" },
      { firebaseUid: 'demo_garage', email: 'info@garageglasgow.co.uk', username: 'garage_gla', displayName: 'The Garage Glasgow' },
      { firebaseUid: 'demo_barrowland', email: 'info@barrowland.co.uk', username: 'barrowland_gla', displayName: 'Barrowland Ballroom' },
      { firebaseUid: 'demo_user1', email: 'jamie@demo.partyradar.app', username: 'jamie_radar', displayName: 'Jamie K' },
      { firebaseUid: 'demo_user2', email: 'sarah@demo.partyradar.app', username: 'sarah_vibes', displayName: 'Sarah V' },
      { firebaseUid: 'demo_user3', email: 'ross@demo.partyradar.app', username: 'ross_gla', displayName: 'Ross M' },
      { firebaseUid: 'demo_user4', email: 'kezia@demo.partyradar.app', username: 'kezia_out', displayName: 'Kezia B' },
      { firebaseUid: 'demo_user5', email: 'lewis@demo.partyradar.app', username: 'lewis_dj', displayName: 'Lewis DJ' },
    ]

    const hosts: Record<string, string> = {}
    for (const h of demoHosts) {
      const user = await prisma.user.upsert({
        where: { firebaseUid: h.firebaseUid },
        create: { ...h, interests: [], subscriptionTier: 'FREE' },
        update: {},
      })
      hosts[h.username] = user.id
    }

    // ── 2. Find seeded venues ─────────────────────────────────────────────────
    const venueNames = ['Sub Club', 'SWG3', "King Tut's Wah Wah Hut", 'The Garage', 'Barrowland Ballroom',
      'Nice N Sleazy', 'Stereo', 'Buff Club', 'Òran Mór', 'Drygate Brewery']
    const venues = await prisma.venue.findMany({
      where: { name: { in: venueNames } },
      select: { id: true, name: true, lat: true, lng: true, address: true },
    })
    const v = Object.fromEntries(venues.map((venue) => [venue.name, venue]))

    const now = new Date()
    const tonight = (h: number, m = 0) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d }
    const inDays = (days: number, h = 22, m = 0) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d }

    // ── 3. Create events (skip if venue missing or event already exists) ───────
    const eventDefs = [
      {
        name: 'Subculture with Harri & Domenic',
        venueKey: 'Sub Club', hostKey: 'subclub_gla',
        type: 'CLUB_NIGHT' as const, price: 12, capacity: 250,
        startsAt: tonight(23), endsAt: inDays(1, 5),
        description: 'The longest-running club night in Scotland. Deep, dark and hypnotic techno and house. Harri & Domenic have held this residency for over 30 years.',
        vibeTags: ['Techno', 'Deep House', 'Legendary', 'Late Night'],
        dressCode: 'Dress to sweat. No sportswear.',
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
      {
        name: 'Golden Teacher Presents: Phantasy Sound',
        venueKey: 'SWG3', hostKey: 'swg3_events',
        type: 'CLUB_NIGHT' as const, price: 18, capacity: 800,
        startsAt: inDays(1, 22), endsAt: inDays(2, 4),
        description: 'Golden Teacher bring their acclaimed Phantasy Sound night to SWG3. Eclectic, cosmic and unmistakably Glasgow.',
        vibeTags: ['House', 'Disco', 'Warehouse', 'Eclectic'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
      {
        name: 'Local Heroes: Rising Acts Night',
        venueKey: "King Tut's Wah Wah Hut", hostKey: 'kingtuts_gla',
        type: 'CONCERT' as const, price: 8, capacity: 300,
        startsAt: tonight(20), endsAt: tonight(23, 30),
        description: "Three of Glasgow's best emerging acts take the stage at King Tut's. First band on at 8pm sharp.",
        vibeTags: ['Indie', 'Live Music', 'Local', 'Emerging'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'ALL_AGES' as const,
      },
      {
        name: 'Sleazy Saturday Sessions',
        venueKey: 'Nice N Sleazy', hostKey: 'jamie_radar',
        type: 'CLUB_NIGHT' as const, price: 0, capacity: 120,
        startsAt: inDays(2, 21), endsAt: inDays(3, 2),
        description: 'Free entry all night. Indie, punk and everything in between. The Sleazy basement in full swing.',
        vibeTags: ['Indie', 'Punk', 'Free Entry', 'Grungy'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
      {
        name: 'Buff Club: House Music All Night Long',
        venueKey: 'Buff Club', hostKey: 'lewis_dj',
        type: 'CLUB_NIGHT' as const, price: 10, capacity: 200,
        startsAt: tonight(22, 30), endsAt: inDays(1, 4),
        description: 'Glasgow\'s favourite basement. Proper house music, proper crowd. Residents + special guest TBA.',
        vibeTags: ['House', 'Dance', 'Late Night', 'Resident DJs'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
      {
        name: 'Drygate Tap Takeover: Craft Beer Night',
        venueKey: 'Drygate Brewery', hostKey: 'ross_gla',
        type: 'HOME_PARTY' as const, price: 0, capacity: 150,
        startsAt: inDays(3, 18), endsAt: inDays(3, 23),
        description: 'Monthly tap takeover. New seasonal releases, brewery tour, food pairings. All welcome.',
        vibeTags: ['Craft Beer', 'Casual', 'Food', 'Social'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
      {
        name: 'SWG3 Festival Preview: Summer Series',
        venueKey: 'SWG3', hostKey: 'swg3_events',
        type: 'CONCERT' as const, price: 25, capacity: 1200,
        startsAt: inDays(5, 18), endsAt: inDays(5, 23),
        description: 'A preview of this summer\'s festival season. Multiple stages, outdoor area, food village. Glasgow\'s summer starts here.',
        vibeTags: ['Festival', 'Outdoor', 'Multi-Stage', 'Summer'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
      {
        name: 'Stereo: Post-Punk Presents',
        venueKey: 'Stereo', hostKey: 'sarah_vibes',
        type: 'CONCERT' as const, price: 6, capacity: 100,
        startsAt: inDays(4, 19, 30), endsAt: inDays(4, 23),
        description: 'Intimate basement gig. Post-punk, shoegaze, dream pop. Vegan kitchen open till midnight.',
        vibeTags: ['Post-Punk', 'Intimate', 'Vegan', 'Alternative'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'ALL_AGES' as const,
      },
    ]

    let eventsCreated = 0
    const createdEventIds: string[] = []
    for (const def of eventDefs) {
      const venue = v[def.venueKey]
      const hostId = hosts[def.hostKey]
      if (!venue || !hostId) continue
      const existing = await prisma.event.findFirst({ where: { name: def.name, hostId } })
      if (existing) { createdEventIds.push(existing.id); continue }
      const event = await prisma.event.create({
        data: {
          name: def.name, hostId, venueId: venue.id,
          type: def.type, price: def.price, capacity: def.capacity,
          startsAt: def.startsAt, endsAt: def.endsAt,
          description: def.description,
          lat: venue.lat, lng: venue.lng, address: venue.address,
          neighbourhood: 'Glasgow City Centre',
          alcoholPolicy: def.alcoholPolicy, ageRestriction: def.ageRestriction,
          dressCode: (def as any).dressCode ?? null,
          vibeTags: def.vibeTags,
          isPublished: true,
          ticketQuantity: def.capacity, ticketsRemaining: Math.floor(def.capacity * 0.4),
          whatToBring: [],
        },
      })
      createdEventIds.push(event.id)
      eventsCreated++
    }

    // ── 4. Seed RSVPs on tonight's events ─────────────────────────────────────
    const guestUsers = ['demo_user1','demo_user2','demo_user3','demo_user4','demo_user5'].map((u) => {
      const username = demoHosts.find((h) => h.firebaseUid === u)?.username ?? ''
      return hosts[username]
    }).filter(Boolean) as string[]

    for (const eventId of createdEventIds.slice(0, 3)) {
      for (const userId of guestUsers.slice(0, 3)) {
        await prisma.eventGuest.upsert({
          where: { eventId_userId: { eventId, userId } },
          create: { eventId, userId, status: 'CONFIRMED' },
          update: {},
        })
      }
    }

    // ── 5. Seed venue posts (spread over last 3 hours) ─────────────────────────
    const venuePosts = [
      { venueKey: 'Sub Club', authorKey: 'jamie_radar', minsAgo: 15, text: 'Queue round the block already 🔥 worth it every time' },
      { venueKey: 'Sub Club', authorKey: 'sarah_vibes', minsAgo: 45, text: 'Harri just dropped the most mental mix, floor is absolutely packed 🎵' },
      { venueKey: 'Sub Club', authorKey: 'ross_gla', minsAgo: 90, text: 'Doors open, sound check done. Tonight is going to be something special 🖤' },
      { venueKey: 'SWG3', authorKey: 'swg3_events', minsAgo: 20, text: 'Outdoor area is open 🌙 Grab a drink, doors on the main stage at 10' },
      { venueKey: 'SWG3', authorKey: 'kezia_out', minsAgo: 60, text: 'Just arrived at SWG3, vibes are already immaculate ✨' },
      { venueKey: "King Tut's Wah Wah Hut", authorKey: 'kingtuts_gla', minsAgo: 30, text: 'First act just finished — absolutely smashed it. Second band on at 9:15 🎸' },
      { venueKey: "King Tut's Wah Wah Hut", authorKey: 'lewis_dj', minsAgo: 100, text: 'One of the best King Tut\'s nights in a while. Get down here if you can!' },
      { venueKey: 'Nice N Sleazy', authorKey: 'sarah_vibes', minsAgo: 25, text: 'Basement is rammed with the best crowd 🤘 if you like noise, come now' },
      { venueKey: 'Buff Club', authorKey: 'lewis_dj', minsAgo: 10, text: 'Just started my set, house music all night 🕺 come through!' },
      { venueKey: 'Buff Club', authorKey: 'jamie_radar', minsAgo: 55, text: 'Dance floor at capacity lol. Proper good vibe in here tonight' },
      { venueKey: 'Barrowland Ballroom', authorKey: 'barrowland_gla', minsAgo: 180, text: 'Huge show coming up this Friday — last few tickets at the box office 🎟️' },
      { venueKey: 'Stereo', authorKey: 'kezia_out', minsAgo: 40, text: 'Just grabbed a vegan burger from the kitchen here at Stereo, incredible as always 🌱' },
      { venueKey: 'Drygate Brewery', authorKey: 'ross_gla', minsAgo: 70, text: 'New seasonal release just tapped — the Mango Sour is 🤌🤌🤌' },
      { venueKey: 'Òran Mór', authorKey: 'sarah_vibes', minsAgo: 50, text: 'Comedy night sold out but the whisky bar is wide open 🥃' },
    ]

    let postsCreated = 0
    for (const p of venuePosts) {
      const venue = v[p.venueKey]
      const userId = hosts[p.authorKey]
      if (!venue || !userId) continue
      // Only create if no similar recent post exists
      const recent = await prisma.post.findFirst({
        where: { venueId: venue.id, userId, text: p.text },
      })
      if (recent) continue
      const createdAt = new Date(now.getTime() - p.minsAgo * 60 * 1000)
      await prisma.post.create({
        data: { userId, venueId: venue.id, text: p.text, createdAt, isStory: false },
      })
      postsCreated++
    }

    // ── 6. Seed check-ins ─────────────────────────────────────────────────────
    const checkInDefs = [
      { venueKey: 'Sub Club', userKey: 'jamie_radar', crowd: 'RAMMED' },
      { venueKey: 'Sub Club', userKey: 'sarah_vibes', crowd: 'RAMMED' },
      { venueKey: 'Buff Club', userKey: 'lewis_dj', crowd: 'BUSY' },
      { venueKey: "King Tut's Wah Wah Hut", userKey: 'kezia_out', crowd: 'BUSY' },
      { venueKey: 'Nice N Sleazy', userKey: 'sarah_vibes', crowd: 'RAMMED' },
      { venueKey: 'SWG3', userKey: 'ross_gla', crowd: 'BUSY' },
    ]
    let checkInsCreated = 0
    for (const ci of checkInDefs) {
      const venue = v[ci.venueKey]
      const userId = hosts[ci.userKey]
      if (!venue || !userId) continue
      const recent = await prisma.checkIn.findFirst({
        where: { venueId: venue.id, userId, createdAt: { gte: new Date(now.getTime() - 4 * 60 * 60 * 1000) } },
      })
      if (recent) continue
      await prisma.checkIn.create({ data: { userId, venueId: venue.id, crowdLevel: ci.crowd } })
      checkInsCreated++
    }

    res.json({
      message: 'Activity seeded',
      users: Object.keys(hosts).length,
      eventsCreated,
      postsCreated,
      checkInsCreated,
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/admin/refresh-activity — add fresh posts to feel live (called by cron) */
router.post('/refresh-activity', async (_req, res, next) => {
  try {
    const hour = new Date().getHours()

    // Time-aware message banks
    const eveningMessages = [
      'Doors open, early crowd filtering in 🚪',
      'Sound check done — tonight is going to go off 🎵',
      'Bar just opened, get here early for the queue 🍺',
      'Tickets still available on the door 🎟️',
      'Support act just started, main room filling up fast',
    ]
    const nightMessages = [
      'Floor is absolutely rammed 🔥',
      'Best crowd we\'ve had all month 🙌',
      'DJ just dropped a monster set 💥',
      'Vibes in here are genuinely immaculate tonight ✨',
      'Queue moving fast — worth the wait 🖤',
      'This is what Glasgow nightlife is about 🏴󠁧󠁢󠁳󠁣󠁴󠁿',
      'Sound system absolutely thumping 🎧',
      'Sweatiest dance floor in the city right now 🕺',
    ]
    const lateMessages = [
      'Still going strong at 2am 🌙',
      'Last hour — make it count 🔥',
      'Afterparty energy is different 💫',
      'Nearly home time but nobody\'s leaving yet',
    ]
    const dayMessages = [
      'Tonight\'s lineup is confirmed 🎤',
      'Tickets selling fast — grab yours now 🎟️',
      'Venue opens at 7pm, restaurant from 5pm 🍽️',
      'This weekend is fully booked — check upcoming dates',
    ]

    const msgs = hour >= 22 || hour < 2
      ? nightMessages
      : hour >= 2 && hour < 8
        ? lateMessages
        : hour >= 18
          ? eveningMessages
          : dayMessages

    // Pick random demo users and venues
    const demoUsers = await prisma.user.findMany({
      where: { firebaseUid: { startsWith: 'demo_user' } },
      select: { id: true },
    })
    const venues = await prisma.venue.findMany({
      where: { city: 'Glasgow' },
      select: { id: true, name: true },
      take: 10,
    })

    if (demoUsers.length === 0 || venues.length === 0) {
      res.json({ message: 'No demo users or venues found — run seed-activity first' })
      return
    }

    // Create 2 fresh posts at random venues
    const created: string[] = []
    const picked = venues.sort(() => Math.random() - 0.5).slice(0, 2)
    for (const venue of picked) {
      const user = demoUsers[Math.floor(Math.random() * demoUsers.length)]!
      const text = msgs[Math.floor(Math.random() * msgs.length)]!
      const post = await prisma.post.create({
        data: { userId: user.id, venueId: venue.id, text },
      })
      created.push(`${venue.name}: "${text}"`)
    }

    res.json({ message: `Added ${created.length} fresh posts`, posts: created })
  } catch (err) {
    next(err)
  }
})

export default router
