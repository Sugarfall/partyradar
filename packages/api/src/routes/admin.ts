import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAdmin } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { stripe } from '../lib/stripe'
import { seedGroupChats } from './groups'

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

/**
 * POST /api/admin/events/purge-non-nightlife
 * Scans all externally-synced events and cancels/unpublishes any that contain
 * non-nightlife keywords — cleaning up previously imported bad events (aquariums,
 * funfairs, etc.). Safe: marks cancelled rather than hard-deletes.
 */
router.post('/events/purge-non-nightlife', requireAdmin, async (_req, res, next) => {
  try {
    const REJECT_KEYWORDS = [
      'aquarium', 'sea life', 'zoo', 'wildlife', 'safari', 'museum', 'gallery',
      'science centre', 'discovery centre', 'planetarium',
      'theme park', 'funland', 'funfair', 'fairground', 'amusement',
      'soft play', 'trampoline park', 'bowling',
      'for kids', 'for children', "children's", 'family friendly', 'family fun',
      'kids activity', 'toddler', 'baby', 'school holiday', 'half term',
      'easter egg hunt', 'easter trail', 'easter funland', 'easter fair',
      'halloween trail', 'halloween family',
      'christmas grotto', 'santa grotto', 'nativity', 'pantomime', 'panto',
      'half marathon', 'fun run', '5k run', '10k run', 'marathon', 'triathlon',
      'yoga class', 'pilates', 'meditation', 'fitness class', 'bootcamp',
      'conference', 'seminar', 'workshop', 'webinar', 'networking event',
      'craft fair', 'artisan market', 'farmers market', 'car boot sale',
      'art exhibition', 'photo exhibition', 'guided tour', 'heritage tour',
      'walking tour', 'ghost tour', 'pottery class', 'painting class', 'art class',
      'cooking class', 'baking class',
      'church service', 'prayer meeting', 'sermon',
      'film screening', 'movie screening', 'cinema night',
      'theatre show', 'theatre performance', 'play performance',
      'ballet', 'opera',
      'charity walk', 'sponsored walk', 'ted talk', 'book club', 'author talk',
      'dog show', 'horse show', 'equestrian', 'agricultural show',
      'antiques fair', 'collectors fair',
    ]

    // Fetch all external (synced) events that are currently published
    const externalEvents = await prisma.event.findMany({
      where: {
        externalSource: { not: null },
        isPublished: true,
        isCancelled: false,
      },
      select: { id: true, name: true, description: true, externalSource: true },
    })

    const toPurge: string[] = []
    for (const event of externalEvents) {
      const combined = `${event.name} ${event.description}`.toLowerCase()
      if (REJECT_KEYWORDS.some((kw) => combined.includes(kw))) {
        toPurge.push(event.id)
      }
    }

    if (toPurge.length === 0) {
      res.json({ data: { purged: 0, message: 'No non-nightlife events found — DB is clean.' } })
      return
    }

    await prisma.event.updateMany({
      where: { id: { in: toPurge } },
      data: { isCancelled: true, isPublished: false },
    })

    res.json({
      data: {
        purged: toPurge.length,
        message: `Purged ${toPurge.length} non-nightlife external events.`,
        ids: toPurge,
      },
    })
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
      // ─── NIGHTCLUBS ──────────────────────────────────────────────────────
      { name: 'Sub Club', address: '22 Jamaica St, Glasgow G1 4QD', city: 'Glasgow', lat: 55.8585, lng: -4.2534, type: 'NIGHTCLUB' as const, website: 'https://subclub.co.uk', vibeTags: ['Techno', 'House', 'Underground', 'Iconic'] },
      { name: 'The Garage', address: '490 Sauchiehall St, Glasgow G2 3LW', city: 'Glasgow', lat: 55.8658, lng: -4.2706, type: 'NIGHTCLUB' as const, website: 'https://garageglasgow.co.uk', vibeTags: ['Student', 'Pop', 'R&B', 'Chart'] },
      { name: 'Buff Club', address: '142 Bath Ln, Glasgow G2 4SQ', city: 'Glasgow', lat: 55.8647, lng: -4.2680, type: 'NIGHTCLUB' as const, vibeTags: ['House', 'Dance', 'Late Night', 'Resident DJs'] },
      { name: 'Room 2', address: '50 Renfrew St, Glasgow G2 3BW', city: 'Glasgow', lat: 55.8665, lng: -4.2662, type: 'NIGHTCLUB' as const, vibeTags: ['House', 'Techno', 'LGBT+', 'Late Night'] },
      { name: 'Sanctuary', address: '18-22 Union St, Glasgow G1 3QF', city: 'Glasgow', lat: 55.8595, lng: -4.2524, type: 'NIGHTCLUB' as const, vibeTags: ['House', 'Club Night', 'R&B', 'Weekend'] },
      { name: 'The Polo Lounge', address: '84 Wilson St, Glasgow G1 1UZ', city: 'Glasgow', lat: 55.8573, lng: -4.2438, type: 'NIGHTCLUB' as const, website: 'https://pologlasgow.com', vibeTags: ['LGBT+', 'Pop', 'Drag', 'Cabaret', 'Karaoke'] },
      { name: 'Cathouse Rock Club', address: '15 Union St, Glasgow G1 3RB', city: 'Glasgow', lat: 55.8594, lng: -4.2528, type: 'NIGHTCLUB' as const, website: 'https://cathouse.co.uk', vibeTags: ['Rock', 'Metal', 'Alternative', 'Live Music'] },
      { name: 'The Berkeley Suite', address: '237 North St, Glasgow G3 7DL', city: 'Glasgow', lat: 55.8650, lng: -4.2770, type: 'NIGHTCLUB' as const, vibeTags: ['Techno', 'House', 'Underground', 'Late Night'] },
      { name: 'Bamboo', address: '51a West Regent St, Glasgow G2 2AE', city: 'Glasgow', lat: 55.8628, lng: -4.2564, type: 'NIGHTCLUB' as const, vibeTags: ['Student', 'Chart', 'Drinks Deals', 'Weekend'] },
      { name: 'Kushion', address: '182 Hope St, Glasgow G2 2UE', city: 'Glasgow', lat: 55.8624, lng: -4.2612, type: 'NIGHTCLUB' as const, vibeTags: ['R&B', 'Hip-Hop', 'Chart', 'Late Night'] },
      { name: 'The Savoy', address: '140 Sauchiehall St, Glasgow G2 3DH', city: 'Glasgow', lat: 55.8651, lng: -4.2580, type: 'NIGHTCLUB' as const, vibeTags: ['Chart', 'Pop', 'Student', 'Weekend'] },
      { name: 'Viper', address: '515 Sauchiehall St, Glasgow G3 7PQ', city: 'Glasgow', lat: 55.8655, lng: -4.2735, type: 'NIGHTCLUB' as const, vibeTags: ['Dance', 'R&B', 'Hip-Hop', 'Late Night'] },

      // ─── CONCERT HALLS & LIVE MUSIC VENUES ───────────────────────────────
      { name: 'SWG3', address: '100 Eastvale Pl, Glasgow G3 8QG', city: 'Glasgow', lat: 55.8648, lng: -4.2887, type: 'CONCERT_HALL' as const, website: 'https://swg3.tv', vibeTags: ['Live Music', 'Art', 'Warehouse', 'Eclectic'] },
      { name: 'Barrowland Ballroom', address: '244 Gallowgate, Glasgow G4 0TT', city: 'Glasgow', lat: 55.8564, lng: -4.2368, type: 'CONCERT_HALL' as const, website: 'https://barrowland-ballroom.co.uk', vibeTags: ['Live Music', 'Iconic', 'Rock', 'Indie'] },
      { name: "King Tut's Wah Wah Hut", address: '272A St Vincent St, Glasgow G2 5RL', city: 'Glasgow', lat: 55.8631, lng: -4.2678, type: 'CONCERT_HALL' as const, website: 'https://kingtuts.co.uk', vibeTags: ['Live Music', 'Indie', 'Iconic', 'Intimate'] },
      { name: 'OVO Hydro', address: 'Exhibition Way, Glasgow G3 8YW', city: 'Glasgow', lat: 55.8602, lng: -4.2856, type: 'CONCERT_HALL' as const, website: 'https://ovohydro.com', vibeTags: ['Arena', 'Live Music', 'Major Acts', 'Concerts'] },
      { name: 'SEC Armadillo', address: 'Exhibition Way, Glasgow G3 8YW', city: 'Glasgow', lat: 55.8608, lng: -4.2833, type: 'CONCERT_HALL' as const, website: 'https://sec.co.uk', vibeTags: ['Live Music', 'Concerts', 'Comedy', 'Events'] },
      { name: 'O2 Academy Glasgow', address: '121 Eglinton St, Glasgow G5 9NT', city: 'Glasgow', lat: 55.8498, lng: -4.2575, type: 'CONCERT_HALL' as const, vibeTags: ['Live Music', 'Rock', 'Indie', 'DnB'] },
      { name: 'The ABC', address: '300 Sauchiehall St, Glasgow G2 3HD', city: 'Glasgow', lat: 55.8660, lng: -4.2683, type: 'CONCERT_HALL' as const, vibeTags: ['Live Music', 'Alternative', 'Rock', 'Indie'] },
      { name: 'Saint Luke\'s', address: '17 Bain St, Glasgow G40 1AU', city: 'Glasgow', lat: 55.8534, lng: -4.2284, type: 'CONCERT_HALL' as const, website: 'https://stlukesglasgow.com', vibeTags: ['Live Music', 'Converted Church', 'Intimate', 'Acoustic'] },
      { name: 'Glasgow Royal Concert Hall', address: '2 Sauchiehall St, Glasgow G2 3NY', city: 'Glasgow', lat: 55.8648, lng: -4.2530, type: 'CONCERT_HALL' as const, vibeTags: ['Classical', 'Orchestra', 'Jazz', 'World Music'] },
      { name: 'Òran Mór', address: 'Top of Byres Rd, Glasgow G12 8QX', city: 'Glasgow', lat: 55.8748, lng: -4.2932, type: 'CONCERT_HALL' as const, website: 'https://oranmor.co.uk', vibeTags: ['Live Music', 'Comedy', 'Theatre', 'Whisky'] },
      { name: 'Mono', address: '12 Kings Ct, Glasgow G1 5RB', city: 'Glasgow', lat: 55.8575, lng: -4.2432, type: 'CONCERT_HALL' as const, vibeTags: ['Live Music', 'Vegan', 'Indie', 'Record Shop'] },
      { name: 'The Old Hairdresser\'s', address: '20 Renfield Ln, Glasgow G2 6PH', city: 'Glasgow', lat: 55.8622, lng: -4.2590, type: 'CONCERT_HALL' as const, vibeTags: ['Live Music', 'Art', 'DIY', 'Underground'] },

      // ─── BARS ─────────────────────────────────────────────────────────────
      { name: 'Nice N Sleazy', address: '421 Sauchiehall St, Glasgow G2 3LG', city: 'Glasgow', lat: 55.8655, lng: -4.2693, type: 'BAR' as const, vibeTags: ['Indie', 'Rock', 'Live Music', 'Grungy'] },
      { name: 'Stereo', address: '20-28 Renfield Ln, Glasgow G2 6PH', city: 'Glasgow', lat: 55.8622, lng: -4.2593, type: 'BAR' as const, website: 'https://stereo-glasgow.com', vibeTags: ['Vegan', 'Indie', 'Alternative', 'Live Music'] },
      { name: 'Broadcast', address: '427 Sauchiehall St, Glasgow G2 3LG', city: 'Glasgow', lat: 55.8652, lng: -4.2702, type: 'BAR' as const, vibeTags: ['Indie', 'Alternative', 'Live Music', 'Late Night'] },
      { name: 'The Flying Duck', address: '142 Renfield St, Glasgow G2 3AU', city: 'Glasgow', lat: 55.8613, lng: -4.2571, type: 'BAR' as const, vibeTags: ['Alternative', 'Indie', 'DJ', 'Underground'] },
      { name: 'Brel', address: 'Ashton Ln, Glasgow G12 8SJ', city: 'Glasgow', lat: 55.8732, lng: -4.2849, type: 'BAR' as const, vibeTags: ['Beer Garden', 'Belgian Beer', 'Cocktails', 'Chill'] },
      { name: 'Chinaskis', address: '239 North St, Glasgow G3 7DL', city: 'Glasgow', lat: 55.8652, lng: -4.2772, type: 'BAR' as const, vibeTags: ['Cocktails', 'Rock', 'Indie', 'Late Night'] },
      { name: 'The Admiral Bar', address: '72A Waterloo St, Glasgow G2 7DA', city: 'Glasgow', lat: 55.8620, lng: -4.2598, type: 'BAR' as const, vibeTags: ['Live Music', 'Rock', 'Intimate', 'Grassroots'] },
      { name: 'Avant Garde', address: '33 Parnie St, Glasgow G1 5RJ', city: 'Glasgow', lat: 55.8577, lng: -4.2430, type: 'BAR' as const, vibeTags: ['Craft Beer', 'Industrial', 'Hipster', 'Art'] },
      { name: 'Drygate Brewery', address: '85 Drygate, Glasgow G4 0UT', city: 'Glasgow', lat: 55.8607, lng: -4.2301, type: 'BAR' as const, website: 'https://drygate.com', vibeTags: ['Craft Beer', 'Brewery', 'Rooftop', 'Food'] },
      { name: 'Tabac', address: '10 Mitchell Ln, Glasgow G1 3NU', city: 'Glasgow', lat: 55.8598, lng: -4.2553, type: 'BAR' as const, vibeTags: ['Cocktails', 'Late Night', 'DJ', 'Intimate'] },
      { name: 'The Spiritualist', address: '62 Miller St, Glasgow G1 1DT', city: 'Glasgow', lat: 55.8600, lng: -4.2498, type: 'BAR' as const, vibeTags: ['Cocktails', 'Stylish', 'After Work', 'Date Night'] },
      { name: 'Hillhead Bookclub', address: '17 Vinicombe St, Glasgow G12 8SJ', city: 'Glasgow', lat: 55.8730, lng: -4.2865, type: 'BAR' as const, vibeTags: ['Quirky', 'Cocktails', 'Student', 'Games'] },
      { name: 'Max\'s Bar & Grill', address: '73 Queen St, Glasgow G1 3BZ', city: 'Glasgow', lat: 55.8605, lng: -4.2497, type: 'BAR' as const, vibeTags: ['Cocktails', 'Burgers', 'American', 'Late Night'] },
      { name: 'Slouch', address: '203 Bath St, Glasgow G2 4HZ', city: 'Glasgow', lat: 55.8642, lng: -4.2620, type: 'BAR' as const, vibeTags: ['Cocktails', 'Relaxed', 'Late Night', 'Chill'] },
      { name: 'The Butterfly and the Pig', address: '153 Bath St, Glasgow G2 4SQ', city: 'Glasgow', lat: 55.8640, lng: -4.2606, type: 'BAR' as const, vibeTags: ['Quirky', 'Cocktails', 'Vintage', 'Basement'] },
      { name: 'Bar Bloc', address: '117 Bath St, Glasgow G2 2SZ', city: 'Glasgow', lat: 55.8637, lng: -4.2590, type: 'BAR' as const, vibeTags: ['Live Music', 'Vegan', 'Indie', 'Free Gigs'] },
      { name: 'Maggie May\'s', address: '64 Trongate, Glasgow G1 5EP', city: 'Glasgow', lat: 55.8579, lng: -4.2458, type: 'BAR' as const, vibeTags: ['Karaoke', 'Late Night', 'Fun', 'Party'] },
      { name: 'Vodka Wodka', address: '31-35 Ashton Ln, Glasgow G12 8SJ', city: 'Glasgow', lat: 55.8728, lng: -4.2852, type: 'BAR' as const, vibeTags: ['Vodka', 'Student', 'Cocktails', 'Chill'] },
      { name: 'Moskito', address: '200 Bath St, Glasgow G2 4HG', city: 'Glasgow', lat: 55.8645, lng: -4.2620, type: 'BAR' as const, vibeTags: ['Cocktails', 'Gin', 'Stylish', 'Date Night'] },
      { name: 'Bar Soba', address: '11 Mitchell Ln, Glasgow G1 3NU', city: 'Glasgow', lat: 55.8598, lng: -4.2551, type: 'BAR' as const, vibeTags: ['Asian Fusion', 'Cocktails', 'DJ', 'Late Night'] },
      { name: 'Tiki Bar & Kitsch Inn', address: '214 Bath St, Glasgow G2 4HW', city: 'Glasgow', lat: 55.8643, lng: -4.2630, type: 'BAR' as const, vibeTags: ['Tiki', 'Rum', 'Cocktails', 'Retro'] },
      { name: 'Gin71', address: '71 Renfield St, Glasgow G2 1LP', city: 'Glasgow', lat: 55.8613, lng: -4.2559, type: 'BAR' as const, vibeTags: ['Gin', 'Cocktails', 'Stylish', 'After Work'] },
      { name: 'DogHouse Merchant City', address: '13 Blackfriars St, Glasgow G1 1PE', city: 'Glasgow', lat: 55.8574, lng: -4.2413, type: 'BAR' as const, vibeTags: ['Craft Beer', 'BrewDog', 'Burgers', 'Casual'] },
      { name: 'Munro\'s', address: '185 Great Western Rd, Glasgow G4 9EB', city: 'Glasgow', lat: 55.8705, lng: -4.2778, type: 'BAR' as const, vibeTags: ['Cocktails', 'Late Night', 'DJ', 'Student'] },

      // ─── PUBS ─────────────────────────────────────────────────────────────
      { name: 'The Hug and Pint', address: '171 Great Western Rd, Glasgow G4 9AW', city: 'Glasgow', lat: 55.8702, lng: -4.2764, type: 'PUB' as const, vibeTags: ['Live Music', 'Vegan', 'Intimate', 'Acoustic'] },
      { name: 'The Pot Still', address: '154 Hope St, Glasgow G2 2TH', city: 'Glasgow', lat: 55.8634, lng: -4.2618, type: 'PUB' as const, vibeTags: ['Whisky', 'Traditional', 'Classic', 'Cosy'] },
      { name: 'Bon Accord', address: '153 North St, Glasgow G3 7DA', city: 'Glasgow', lat: 55.8644, lng: -4.2756, type: 'PUB' as const, vibeTags: ['Real Ale', 'CAMRA', 'Whisky', 'Traditional'] },
      { name: 'The Ben Nevis', address: '1147 Argyle St, Glasgow G3 8TB', city: 'Glasgow', lat: 55.8632, lng: -4.2852, type: 'PUB' as const, vibeTags: ['Live Music', 'Folk', 'Whisky', 'Traditional'] },
      { name: 'The Doublet', address: '74 Park Rd, Glasgow G4 9JG', city: 'Glasgow', lat: 55.8713, lng: -4.2792, type: 'PUB' as const, vibeTags: ['Karaoke', 'Traditional', 'Locals', 'Classic'] },
      { name: 'Sloans', address: '108 Argyle St, Glasgow G2 8BG', city: 'Glasgow', lat: 55.8590, lng: -4.2547, type: 'PUB' as const, website: 'https://sloansglasgow.com', vibeTags: ['Ceilidh', 'Live Music', 'Beer Garden', 'Historic'] },
      { name: 'The Ark', address: '44 North Frederick St, Glasgow G1 2BS', city: 'Glasgow', lat: 55.8624, lng: -4.2489, type: 'PUB' as const, vibeTags: ['Karaoke', 'Late Night', 'Locals', 'Fun'] },
      { name: 'The State Bar', address: '148 Holland St, Glasgow G2 4NG', city: 'Glasgow', lat: 55.8658, lng: -4.2688, type: 'PUB' as const, vibeTags: ['Live Music', 'Blues', 'Jazz', 'Traditional'] },
      { name: 'Jinty McGuinty\'s', address: '21 Ashton Ln, Glasgow G12 8SJ', city: 'Glasgow', lat: 55.8727, lng: -4.2850, type: 'PUB' as const, vibeTags: ['Irish', 'Live Music', 'Folk', 'Student'] },
      { name: 'The Curler\'s Rest', address: '256 Byres Rd, Glasgow G12 8SH', city: 'Glasgow', lat: 55.8724, lng: -4.2876, type: 'PUB' as const, vibeTags: ['Craft Beer', 'Real Ale', 'Chill', 'Student'] },
      { name: 'Inn Deep', address: '445 Great Western Rd, Glasgow G12 8HH', city: 'Glasgow', lat: 55.8736, lng: -4.2878, type: 'PUB' as const, vibeTags: ['Riverside', 'Craft Beer', 'Chill', 'Outdoor'] },
      { name: 'The Sparkle Horse', address: '16 Dowanhill St, Glasgow G12 9DA', city: 'Glasgow', lat: 55.8716, lng: -4.2898, type: 'PUB' as const, vibeTags: ['Craft Beer', 'Cosy', 'West End', 'Chill'] },
      { name: 'The Laurieston', address: '58 Bridge St, Glasgow G5 9HU', city: 'Glasgow', lat: 55.8537, lng: -4.2582, type: 'PUB' as const, vibeTags: ['Traditional', 'Historic', 'Locals', 'Cheap Pints'] },
      { name: 'The Saracen Head (Sarry Heid)', address: '209 Gallowgate, Glasgow G1 5DX', city: 'Glasgow', lat: 55.8570, lng: -4.2390, type: 'PUB' as const, vibeTags: ['Historic', 'Traditional', 'Locals', 'Classic'] },
      { name: 'Waxy O\'Connor\'s', address: '44 West George St, Glasgow G2 1DH', city: 'Glasgow', lat: 55.8614, lng: -4.2541, type: 'PUB' as const, vibeTags: ['Irish', 'Live Music', 'Tourist', 'Large'] },
      { name: 'The Horseshoe Bar', address: '17 Drury St, Glasgow G2 5AE', city: 'Glasgow', lat: 55.8602, lng: -4.2553, type: 'PUB' as const, vibeTags: ['Iconic', 'Karaoke', 'Traditional', 'Cheap Pints'] },
      { name: 'Merchant City Inn', address: '52 Virginia St, Glasgow G1 1TY', city: 'Glasgow', lat: 55.8603, lng: -4.2437, type: 'PUB' as const, vibeTags: ['Cosy', 'Real Ale', 'Sports', 'Locals'] },
      { name: 'Tennent\'s Bar', address: '191 Byres Rd, Glasgow G12 8TN', city: 'Glasgow', lat: 55.8717, lng: -4.2879, type: 'PUB' as const, vibeTags: ['Live Music', 'Traditional', 'Student', 'West End'] },
      { name: 'Three Judges', address: '141 Dumbarton Rd, Glasgow G11 6PR', city: 'Glasgow', lat: 55.8693, lng: -4.2835, type: 'PUB' as const, vibeTags: ['Real Ale', 'Craft Beer', 'Classic', 'West End'] },

      // ─── KARAOKE ──────────────────────────────────────────────────────────
      { name: 'Lucky Cat', address: '29 Queen St, Glasgow G1 3EF', city: 'Glasgow', lat: 55.8595, lng: -4.2510, type: 'BAR' as const, vibeTags: ['Karaoke', 'Private Rooms', 'Cocktails', 'Party'] },
      { name: 'K2 Karaoke', address: '15 Chisholm St, Glasgow G1 5HA', city: 'Glasgow', lat: 55.8565, lng: -4.2450, type: 'BAR' as const, vibeTags: ['Karaoke', 'Private Rooms', 'BYOB', 'Party'] },

      // ─── LOUNGES ──────────────────────────────────────────────────────────
      { name: 'Civic House', address: '26 Civic St, Glasgow G4 9RH', city: 'Glasgow', lat: 55.8721, lng: -4.2697, type: 'LOUNGE' as const, vibeTags: ['Community', 'Events', 'Alternative', 'Creative'] },
      { name: 'The Corinthian Club', address: '191 Ingram St, Glasgow G1 1DA', city: 'Glasgow', lat: 55.8595, lng: -4.2445, type: 'LOUNGE' as const, vibeTags: ['Cocktails', 'Grand', 'Dining', 'Late Night'] },
      { name: 'Blythswood Square', address: '11 Blythswood Sq, Glasgow G2 4AD', city: 'Glasgow', lat: 55.8630, lng: -4.2625, type: 'LOUNGE' as const, vibeTags: ['Cocktails', 'Upscale', 'Hotel Bar', 'Date Night'] },
      { name: 'Champagne Central', address: 'Glasgow Central Station, Glasgow G1 3SL', city: 'Glasgow', lat: 55.8596, lng: -4.2569, type: 'LOUNGE' as const, vibeTags: ['Champagne', 'After Work', 'Stylish', 'Station'] },
    ]

    let created = 0
    let skipped = 0

    for (const venue of venues) {
      const existing = await prisma.venue.findFirst({ where: { name: venue.name, city: venue.city } })
      if (existing) { skipped++; continue }
      await prisma.venue.create({ data: venue })
      created++
    }

    const allVenuesForGroups = await prisma.venue.findMany({
      where: { city: 'Glasgow' },
      select: { id: true, name: true, type: true },
    })
    await seedGroupChats(allVenuesForGroups)

    res.json({ data: { message: `Seeded ${created} venues, skipped ${skipped} existing, groups seeded` } })
  } catch (err) {
    next(err)
  }
})

/** POST /api/admin/fix-event-types — one-shot migration: correct HOME_PARTY → proper type */
router.post('/fix-event-types', async (_req, res, next) => {
  try {
    const pubNightNames = [
      'The Doublet: Pub Karaoke',
      'Lucky Cat: Private Room Karaoke Party',
      'Drygate Tap Takeover: Craft Beer Night',
      "Maggie May's: Saturday Singalong",
      'Horseshoe Bar: Karaoke Night',
      'Ben Nevis: Live Folk Session',
      'State Bar: Blues Night',
      'Polo Lounge: Drag Bingo & Karaoke',
    ]
    const { count } = await prisma.event.updateMany({
      where: { name: { in: pubNightNames } },
      data: { type: 'PUB_NIGHT' },
    })
    res.json({ data: { message: `Fixed ${count} events → PUB_NIGHT` } })
  } catch (err) { next(err) }
})

/** POST /api/admin/seed-activity — seed Glasgow nightlife activity (idempotent) */
router.post('/seed-activity', async (_req, res, next) => {
  try {
    // ── 0. One-shot type corrections (idempotent) ────────────────────────────
    const pubNightFix = [
      'The Doublet: Pub Karaoke', 'Lucky Cat: Private Room Karaoke Party',
      'Drygate Tap Takeover: Craft Beer Night', "Maggie May's: Saturday Singalong",
      'Horseshoe Bar: Karaoke Night', 'Ben Nevis: Live Folk Session',
      'State Bar: Blues Night', 'Polo Lounge: Drag Bingo & Karaoke',
    ]
    await prisma.event.updateMany({
      where: { name: { in: pubNightFix } },
      data: { type: 'PUB_NIGHT' },
    })

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
      'Nice N Sleazy', 'Stereo', 'Buff Club', 'Òran Mór', 'Drygate Brewery',
      'The Polo Lounge', 'Cathouse Rock Club', 'The Berkeley Suite', 'Sloans',
      'The Hug and Pint', 'The Ben Nevis', 'The Doublet', 'The Horseshoe Bar',
      'Lucky Cat', 'Saint Luke\'s', 'Broadcast', 'The State Bar', 'Bar Bloc',
      "Maggie May's", 'O2 Academy Glasgow', 'Room 2']
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
        type: 'PUB_NIGHT' as const, price: 0, capacity: 150,
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
      // ── PUB / BAR events ──────────────────────────────────────────────────
      {
        name: 'Polo Lounge: Drag Bingo & Karaoke',
        venueKey: 'The Polo Lounge', hostKey: 'kezia_out',
        type: 'CLUB_NIGHT' as const, price: 5, capacity: 200,
        startsAt: tonight(20), endsAt: inDays(1, 2),
        description: 'Glasgow\'s iconic LGBT+ venue. Drag queen bingo from 8pm, karaoke from 10pm, club night till 2am. Everyone welcome.',
        vibeTags: ['LGBT+', 'Karaoke', 'Drag', 'Cabaret', 'Fun'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
      {
        name: 'Cathouse: Rock Anthems Night',
        venueKey: 'Cathouse Rock Club', hostKey: 'jamie_radar',
        type: 'CLUB_NIGHT' as const, price: 4, capacity: 300,
        startsAt: inDays(1, 22, 30), endsAt: inDays(2, 3),
        description: 'Two floors of rock, metal and alternative music. Upstairs indie & emo, downstairs heavy. Glasgow\'s home of rock.',
        vibeTags: ['Rock', 'Metal', 'Alternative', 'Emo', 'Live Music'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
      {
        name: 'Berkeley Suite: Deep Cuts',
        venueKey: 'The Berkeley Suite', hostKey: 'lewis_dj',
        type: 'CLUB_NIGHT' as const, price: 8, capacity: 150,
        startsAt: inDays(2, 23), endsAt: inDays(3, 5),
        description: 'Deep house & minimal techno in one of Glasgow\'s most atmospheric underground spaces. Expect low ceilings and big bass.',
        vibeTags: ['Techno', 'Deep House', 'Underground', 'Intimate'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
      {
        name: 'Sloans: Friday Ceilidh',
        venueKey: 'Sloans', hostKey: 'ross_gla',
        type: 'CONCERT' as const, price: 10, capacity: 250,
        startsAt: inDays(3, 19), endsAt: inDays(3, 23),
        description: 'Live ceilidh band in the grand ballroom. No experience needed — callers guide every dance. Great for birthdays & hen dos.',
        vibeTags: ['Ceilidh', 'Live Music', 'Folk', 'Dancing', 'Scottish'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'ALL_AGES' as const,
      },
      {
        name: 'Horseshoe Bar: Karaoke Night',
        venueKey: 'The Horseshoe Bar', hostKey: 'kezia_out',
        type: 'PUB_NIGHT' as const, price: 0, capacity: 120,
        startsAt: tonight(21), endsAt: inDays(1, 0, 30),
        description: 'Karaoke upstairs at Glasgow\'s most iconic pub. Free entry, longest bar in Europe downstairs. Belters and ballads welcome.',
        vibeTags: ['Karaoke', 'Free Entry', 'Iconic', 'Traditional', 'Pub Night'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
      {
        name: 'The Doublet: Pub Karaoke',
        venueKey: 'The Doublet', hostKey: 'sarah_vibes',
        type: 'PUB_NIGHT' as const, price: 0, capacity: 60,
        startsAt: inDays(1, 20, 30), endsAt: inDays(1, 23, 30),
        description: 'A proper Glasgow local with the best karaoke atmosphere in the West End. Regulars, students and everyone in between.',
        vibeTags: ['Karaoke', 'Free Entry', 'West End', 'Locals', 'Pub Night'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
      {
        name: 'Ben Nevis: Live Folk Session',
        venueKey: 'The Ben Nevis', hostKey: 'ross_gla',
        type: 'PUB_NIGHT' as const, price: 0, capacity: 80,
        startsAt: tonight(21), endsAt: tonight(23, 30),
        description: 'Live traditional folk music session. Fiddles, guitars, bodhráns. Huge whisky selection. The spirit of Scotland in Finnieston.',
        vibeTags: ['Folk', 'Live Music', 'Whisky', 'Traditional', 'Free Entry'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'ALL_AGES' as const,
      },
      {
        name: 'Lucky Cat: Private Room Karaoke Party',
        venueKey: 'Lucky Cat', hostKey: 'kezia_out',
        type: 'PUB_NIGHT' as const, price: 15, capacity: 100,
        startsAt: inDays(2, 19), endsAt: inDays(2, 23, 30),
        description: 'Japanese-style private room karaoke. Sing your heart out with cocktails & Asian street food. Book a room or walk in.',
        vibeTags: ['Karaoke', 'Private Rooms', 'Cocktails', 'Asian', 'Party'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
      {
        name: 'Hug & Pint: Acoustic Showcase',
        venueKey: 'The Hug and Pint', hostKey: 'sarah_vibes',
        type: 'CONCERT' as const, price: 7, capacity: 80,
        startsAt: inDays(1, 19, 30), endsAt: inDays(1, 22, 30),
        description: 'Three singer-songwriters performing stripped-back sets in Glasgow\'s cosiest venue. Vegan food served till 10pm.',
        vibeTags: ['Acoustic', 'Live Music', 'Singer-Songwriter', 'Vegan', 'Intimate'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'ALL_AGES' as const,
      },
      {
        name: 'Broadcast: Indie All-Dayer',
        venueKey: 'Broadcast', hostKey: 'jamie_radar',
        type: 'CONCERT' as const, price: 5, capacity: 150,
        startsAt: inDays(4, 14), endsAt: inDays(4, 23),
        description: 'Afternoon into evening of local indie & alternative bands. Six acts, two stages. DJs between bands till late.',
        vibeTags: ['Indie', 'Live Music', 'All-Dayer', 'Local Bands', 'DJ'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'ALL_AGES' as const,
      },
      {
        name: 'State Bar: Blues Night',
        venueKey: 'The State Bar', hostKey: 'ross_gla',
        type: 'PUB_NIGHT' as const, price: 0, capacity: 80,
        startsAt: inDays(2, 20), endsAt: inDays(2, 23),
        description: 'Live blues & jazz from Glasgow\'s finest. Free entry, real ale on tap. A proper midweek wind-down.',
        vibeTags: ['Blues', 'Jazz', 'Live Music', 'Free Entry', 'Chill'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'ALL_AGES' as const,
      },
      {
        name: 'Bar Bloc: Free Gig Night',
        venueKey: 'Bar Bloc', hostKey: 'sarah_vibes',
        type: 'CONCERT' as const, price: 0, capacity: 100,
        startsAt: tonight(20), endsAt: tonight(23),
        description: 'Three bands, zero cover charge. Bar Bloc keeps live music accessible. Vegan food, craft beer, good people.',
        vibeTags: ['Live Music', 'Free Entry', 'Indie', 'Vegan', 'Grassroots'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'ALL_AGES' as const,
      },
      {
        name: 'Maggie May\'s: Saturday Singalong',
        venueKey: "Maggie May's", hostKey: 'kezia_out',
        type: 'PUB_NIGHT' as const, price: 0, capacity: 100,
        startsAt: inDays(3, 21), endsAt: inDays(4, 1),
        description: 'Trongate\'s karaoke headquarters. No judgement, maximum volume. Two stages, massive song library, cheap drinks.',
        vibeTags: ['Karaoke', 'Free Entry', 'Late Night', 'Fun', 'Party'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
      {
        name: 'Saint Luke\'s: Candlelit Sessions',
        venueKey: "Saint Luke's", hostKey: 'swg3_events',
        type: 'CONCERT' as const, price: 14, capacity: 400,
        startsAt: inDays(5, 19, 30), endsAt: inDays(5, 22, 30),
        description: 'Live music by candlelight in a converted church. Stunning acoustics, intimate atmosphere. Tonight: acoustic covers of classic albums.',
        vibeTags: ['Live Music', 'Acoustic', 'Intimate', 'Candlelit', 'Atmospheric'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'ALL_AGES' as const,
      },
      {
        name: 'O2 Academy: DnB Takeover',
        venueKey: 'O2 Academy Glasgow', hostKey: 'lewis_dj',
        type: 'CLUB_NIGHT' as const, price: 20, capacity: 2500,
        startsAt: inDays(6, 22), endsAt: inDays(7, 4),
        description: 'Glasgow\'s biggest drum & bass night. Multiple rooms, headline DJs, massive sound system. Last tickets available.',
        vibeTags: ['DnB', 'Drum & Bass', 'Jungle', 'Big Night', 'Multi-Room'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
      {
        name: 'Room 2: Queer Rave',
        venueKey: 'Room 2', hostKey: 'kezia_out',
        type: 'CLUB_NIGHT' as const, price: 10, capacity: 200,
        startsAt: inDays(4, 23), endsAt: inDays(5, 5),
        description: 'Inclusive rave for everyone. House, techno, disco. Safe space, zero tolerance policy. Come as you are.',
        vibeTags: ['LGBT+', 'House', 'Techno', 'Inclusive', 'Rave'],
        alcoholPolicy: 'PROVIDED' as const,
        ageRestriction: 'AGE_18' as const,
      },
    ]

    let eventsCreated = 0
    const createdEventIds: string[] = []
    for (const def of eventDefs) {
      const venue = v[def.venueKey]
      const hostId = hosts[def.hostKey]
      if (!venue || !hostId) continue
      const existing = await prisma.event.findFirst({ where: { name: def.name, hostId } })
      // If event exists but has expired, update its dates to new future times
      if (existing) {
        const hasExpired = existing.startsAt < new Date()
        // Always update type + vibe tags so corrections in seed defs propagate to DB
        const updateData: Record<string, unknown> = {
          type: def.type,
          vibeTags: def.vibeTags,
          isPublished: true,
        }
        if (hasExpired) {
          updateData['startsAt'] = def.startsAt
          updateData['endsAt'] = def.endsAt
          updateData['isCancelled'] = false
          updateData['ticketsRemaining'] = Math.floor(def.capacity * 0.4)
          eventsCreated++
        }
        await prisma.event.update({ where: { id: existing.id }, data: updateData })
        createdEventIds.push(existing.id)
        continue
      }
      const isDemoHost = demoHosts.find((h) => h.username === def.hostKey)?.firebaseUid?.startsWith('demo_') ?? false
      const descriptionWithPrefix = isDemoHost ? `[DEMO] ${def.description}` : def.description
      const event = await prisma.event.create({
        data: {
          name: def.name, hostId, venueId: venue.id,
          type: def.type, price: def.price, capacity: def.capacity,
          startsAt: def.startsAt, endsAt: def.endsAt,
          description: descriptionWithPrefix,
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
      // New venue posts
      { venueKey: 'The Polo Lounge', authorKey: 'kezia_out', minsAgo: 35, text: 'Drag bingo was INCREDIBLE 👑 karaoke starting now, get down here!' },
      { venueKey: 'Cathouse Rock Club', authorKey: 'jamie_radar', minsAgo: 22, text: 'Two floors absolutely rammed. Metal upstairs, indie downstairs 🤘' },
      { venueKey: 'The Ben Nevis', authorKey: 'ross_gla', minsAgo: 65, text: 'Live folk session in full swing. Fiddle player is unreal tonight 🎻' },
      { venueKey: 'Sloans', authorKey: 'sarah_vibes', minsAgo: 28, text: 'First time at a ceilidh — this is genuinely the most fun I\'ve had in ages 💃' },
      { venueKey: 'The Horseshoe Bar', authorKey: 'kezia_out', minsAgo: 42, text: 'Someone just sang Bohemian Rhapsody and the whole pub joined in 🎤' },
      { venueKey: 'Lucky Cat', authorKey: 'lewis_dj', minsAgo: 18, text: 'Private room karaoke is class. Cocktails flowing, songs queued up 🎵' },
      { venueKey: 'The Berkeley Suite', authorKey: 'lewis_dj', minsAgo: 85, text: 'The sound system in here hits different. Deep house warming up the room 🔊' },
      { venueKey: 'Broadcast', authorKey: 'jamie_radar', minsAgo: 33, text: 'Support band just blew the roof off. Headliner on in 20 mins 🎸' },
      { venueKey: 'The State Bar', authorKey: 'ross_gla', minsAgo: 75, text: 'Blues trio absolutely cooking tonight. This place is a Glasgow institution 🎷' },
      { venueKey: 'Bar Bloc', authorKey: 'sarah_vibes', minsAgo: 48, text: 'Free gig night and the bands are actually incredible. Vegan nachos are 10/10 🌱' },
      { venueKey: "Maggie May's", authorKey: 'kezia_out', minsAgo: 12, text: 'Karaoke on both stages tonight and everyone is giving it 110% 🎤🎤' },
      { venueKey: 'The Hug and Pint', authorKey: 'sarah_vibes', minsAgo: 55, text: 'Acoustic set just started — this venue was made for intimate gigs 🎶' },
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
      { venueKey: 'The Polo Lounge', userKey: 'kezia_out', crowd: 'RAMMED' },
      { venueKey: 'Cathouse Rock Club', userKey: 'jamie_radar', crowd: 'BUSY' },
      { venueKey: 'The Horseshoe Bar', userKey: 'kezia_out', crowd: 'BUSY' },
      { venueKey: 'The Ben Nevis', userKey: 'ross_gla', crowd: 'QUIET' },
      { venueKey: 'Sloans', userKey: 'sarah_vibes', crowd: 'RAMMED' },
      { venueKey: 'Broadcast', userKey: 'jamie_radar', crowd: 'BUSY' },
      { venueKey: 'The Berkeley Suite', userKey: 'lewis_dj', crowd: 'BUSY' },
      { venueKey: "Maggie May's", userKey: 'kezia_out', crowd: 'RAMMED' },
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

    // ── 7. Seed group chats ───────────────────────────────────────────────────
    const allVenues = await prisma.venue.findMany({
      where: { city: 'Glasgow' },
      select: { id: true, name: true, type: true },
    })
    await seedGroupChats(allVenues)

    // Seed starter messages in genre groups (only if empty)
    const genreSeedMessages: Record<string, { authorKey: string; text: string; minsAgo: number }[]> = {
      'genre-rave': [
        { authorKey: 'jamie_radar', text: 'Anyone going to Sub Club tonight? 🎧', minsAgo: 120 },
        { authorKey: 'lewis_dj',    text: 'SWG3 warehouse tent is the one this weekend, grab tickets now', minsAgo: 90 },
        { authorKey: 'ross_gla',    text: 'Harri & Domenic residency never misses. Been going for years 🖤', minsAgo: 45 },
        { authorKey: 'kezia_out',   text: 'Techno massive 🔥 see you on the floor', minsAgo: 20 },
      ],
      'genre-house': [
        { authorKey: 'lewis_dj',    text: 'Buff Club basement is the best house room in Glasgow fight me', minsAgo: 100 },
        { authorKey: 'sarah_vibes', text: 'Who has recommendations for deep house nights this month?', minsAgo: 75 },
        { authorKey: 'jamie_radar', text: "Golden Teacher at SWG3 — don't sleep on this one 🏠", minsAgo: 40 },
        { authorKey: 'kezia_out',   text: 'The crowd at Buff Club last week was unreal ✨', minsAgo: 15 },
      ],
      'genre-rnb': [
        { authorKey: 'sarah_vibes', text: 'Best R&B nights in Glasgow? Drop your recs 🎤', minsAgo: 110 },
        { authorKey: 'kezia_out',   text: 'The Garage does a solid R&B floor on Fridays', minsAgo: 80 },
        { authorKey: 'ross_gla',    text: 'Looking for something more underground, not mainstream pop R&B', minsAgo: 50 },
        { authorKey: 'jamie_radar', text: 'Check the Polo Lounge on Saturdays 💜', minsAgo: 25 },
      ],
      'genre-trippy': [
        { authorKey: 'kezia_out',   text: 'Anyone else into the more experimental stuff? 🌀', minsAgo: 130 },
        { authorKey: 'lewis_dj',    text: 'Civic House had an incredible psych night last month', minsAgo: 95 },
        { authorKey: 'sarah_vibes', text: 'Flying Duck basement gets pretty wild on the right night', minsAgo: 60 },
        { authorKey: 'ross_gla',    text: 'Trip-hop + live visuals + underground venue = 🌀🌀🌀', minsAgo: 30 },
      ],
    }

    for (const [slug, messages] of Object.entries(genreSeedMessages)) {
      const group = await prisma.groupChat.findUnique({ where: { slug } })
      if (!group) continue
      const existingCount = await prisma.groupMessage.count({ where: { groupId: group.id } })
      if (existingCount > 0) continue
      for (const msg of messages) {
        const userId = hosts[msg.authorKey]
        if (!userId) continue
        const createdAt = new Date(now.getTime() - msg.minsAgo * 60 * 1000)
        await prisma.groupMessage.create({
          data: { groupId: group.id, senderId: userId, text: msg.text, createdAt },
        })
        await prisma.groupMembership.upsert({
          where: { groupId_userId: { groupId: group.id, userId } },
          create: { groupId: group.id, userId },
          update: {},
        })
      }
      const uniqueAuthors = new Set(messages.map((m) => m.authorKey)).size
      await prisma.groupChat.update({
        where: { id: group.id },
        data: {
          lastMessage: messages[messages.length - 1]!.text.slice(0, 100),
          lastAt: new Date(now.getTime() - messages[messages.length - 1]!.minsAgo * 60 * 1000),
          memberCount: uniqueAuthors,
        },
      })
    }

    res.json({
      data: {
        message: 'Activity seeded',
        users: Object.keys(hosts).length,
        eventsCreated,
        postsCreated,
        checkInsCreated,
        groupsSeeded: true,
      },
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
      res.json({ data: { message: 'No demo users or venues found — run seed-activity first' } })
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

    res.json({ data: { message: `Added ${created.length} fresh posts`, posts: created } })
  } catch (err) {
    next(err)
  }
})

// ─── Platform Revenue Dashboard ──────────────────────────────────────────────

/** GET /api/admin/revenue — platform revenue overview */
router.get('/revenue', requireAdmin, async (_req, res, next) => {
  try {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [allTimeRevenue, monthlyRevenue, revenueBySource, cardOrders, walletStats] = await Promise.all([
      prisma.platformRevenue.aggregate({ _sum: { amount: true } }),
      prisma.platformRevenue.aggregate({
        where: { createdAt: { gte: thirtyDaysAgo } },
        _sum: { amount: true },
      }),
      prisma.platformRevenue.groupBy({
        by: ['source'],
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: 'desc' } },
      }),
      prisma.cardOrder.findMany({
        where: { status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.wallet.aggregate({
        _sum: { balance: true, lifetimeSpent: true, lifetimeTopUp: true },
        _count: true,
      }),
    ])

    // Active subscriptions
    const subscriptionRevenue = await prisma.subscription.groupBy({
      by: ['tier'],
      where: { tier: { not: 'FREE' } },
      _count: true,
    })

    res.json({
      data: {
        allTimeRevenue: allTimeRevenue._sum.amount ?? 0,
        monthlyRevenue: monthlyRevenue._sum.amount ?? 0,
        revenueBySource: revenueBySource.map((r) => ({
          source: r.source,
          total: r._sum.amount ?? 0,
          count: r._count,
        })),
        subscriptions: subscriptionRevenue.map((s) => ({
          tier: s.tier,
          count: s._count,
        })),
        walletStats: {
          totalWallets: walletStats._count,
          totalBalance: walletStats._sum.balance ?? 0,
          totalSpent: walletStats._sum.lifetimeSpent ?? 0,
          totalTopUps: walletStats._sum.lifetimeTopUp ?? 0,
        },
        recentCardOrders: cardOrders,
      },
    })
  } catch (err) {
    next(err)
  }
})

/** PUT /api/admin/cards/:id/status — update card order status */
router.put('/cards/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const { status, trackingNumber } = req.body as { status: string; trackingNumber?: string }
    const validStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']
    if (!validStatuses.includes(status)) throw new AppError('Invalid status', 400)

    const order = await prisma.cardOrder.update({
      where: { id: req.params['id'] },
      data: {
        status: status as any,
        ...(trackingNumber ? { trackingNumber } : {}),
      },
    })
    res.json({ data: order })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/admin/purge-bad-events-now
 * One-time maintenance: cancel all non-nightlife external events already in DB.
 * No auth required (one-time cleanup only, only cancels events).
 */
/** POST /api/admin/purge-non-uk-events — cancel events outside UK bounding box */
router.post('/purge-non-uk-events', async (_req, res, next) => {
  try {
    // UK bounding box: lat 49.9–61.0, lng -10.0–2.0
    const nonUkEvents = await prisma.event.findMany({
      where: {
        isPublished: true,
        isCancelled: false,
        OR: [
          { lng: { gt: 2.0 } },
          { lng: { lt: -10.0 } },
          { lat: { lt: 49.0 } },
          { lat: { gt: 61.0 } },
        ],
      },
      select: { id: true, name: true, address: true, lat: true, lng: true },
    })

    if (nonUkEvents.length === 0) {
      return res.json({ data: { purged: 0, message: 'No non-UK events found.' } })
    }

    const ids = nonUkEvents.map((e) => e.id)
    await prisma.event.updateMany({
      where: { id: { in: ids } },
      data: { isCancelled: true, isPublished: false },
    })

    res.json({
      data: {
        purged: ids.length,
        events: nonUkEvents.map((e) => `${e.name} (${e.address})`),
        message: `Cancelled ${ids.length} non-UK events.`,
      },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/purge-bad-events-now', async (_req, res, next) => {
  try {
    const REJECT_KEYWORDS = [
      'aquarium', 'sea life', 'zoo', 'wildlife', 'safari', 'museum', 'gallery',
      'science centre', 'discovery centre', 'planetarium',
      'theme park', 'funland', 'funfair', 'fairground', 'amusement',
      'soft play', 'trampoline park', 'bowling',
      'for kids', 'for children', "children's", 'family friendly', 'family fun',
      'kids activity', 'toddler', 'baby', 'school holiday', 'half term',
      'easter egg hunt', 'easter trail', 'easter funland', 'easter fair',
      'halloween trail', 'halloween family',
      'christmas grotto', 'santa grotto', 'nativity', 'pantomime', 'panto',
      'half marathon', 'fun run', '5k run', '10k run', 'marathon', 'triathlon',
      'yoga class', 'pilates', 'meditation', 'fitness class', 'bootcamp',
      'conference', 'seminar', 'workshop', 'webinar', 'networking event',
      'craft fair', 'artisan market', 'farmers market', 'car boot sale',
      'art exhibition', 'photo exhibition', 'guided tour', 'heritage tour',
      'walking tour', 'ghost tour', 'pottery class', 'painting class', 'art class',
      'cooking class', 'baking class',
      'church service', 'prayer meeting', 'sermon',
      'film screening', 'movie screening', 'cinema night',
      'theatre show', 'theatre performance', 'play performance',
      'ballet', 'opera',
      'charity walk', 'sponsored walk', 'ted talk', 'book club', 'author talk',
      'dog show', 'horse show', 'equestrian', 'agricultural show',
      'antiques fair', 'collectors fair',
      'comedy brunch', 'brunch', 'boozy brush', 'paint', 'life drawing',
      // Ticketmaster ticket-upgrade listings
      'venue premium', 'comfort seats', 'parking permit', 'vip package',
      'hospitality package', 'platinum seats', 'accessible tickets',
    ]

    const externalEvents = await prisma.event.findMany({
      where: { isPublished: true, isCancelled: false },
      select: { id: true, name: true, description: true },
    })

    const toPurge: string[] = []
    for (const event of externalEvents) {
      const combined = `${event.name} ${event.description ?? ''}`.toLowerCase()
      if (REJECT_KEYWORDS.some((kw) => combined.includes(kw))) {
        toPurge.push(event.id)
      }
    }

    if (toPurge.length === 0) {
      return res.json({ data: { purged: 0, message: 'DB already clean.' } })
    }

    await prisma.event.updateMany({
      where: { id: { in: toPurge } },
      data: { isCancelled: true, isPublished: false },
    })

    res.json({ data: { purged: toPurge.length, message: `Removed ${toPurge.length} non-nightlife events.` } })
  } catch (err) {
    next(err)
  }
})

export default router
