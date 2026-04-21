/**
 * Pub Crawl — AI-powered group route planner
 *
 * POST /api/pub-crawl/generate
 *   Body: { lat, lng, groupSize, startTime, vibes?, stops? }
 *   Returns a curated crawl with per-venue arrival times, durations & AI descriptions
 */
import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { optionalAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

const OPENAI_API_KEY = process.env['OPENAI_API_KEY']

// ── Haversine distance in km ───────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Nearest-neighbour route optimiser ─────────────────────────────────────────
function optimiseRoute<T extends { lat: number; lng: number }>(venues: T[], startLat: number, startLng: number): T[] {
  const remaining = [...venues]
  const route: T[] = []
  let curLat = startLat, curLng = startLng

  while (remaining.length) {
    let nearest = 0
    let nearestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(curLat, curLng, remaining[i]!.lat, remaining[i]!.lng)
      if (d < nearestDist) { nearestDist = d; nearest = i }
    }
    route.push(remaining.splice(nearest, 1)[0]!)
    curLat = route[route.length - 1]!.lat
    curLng = route[route.length - 1]!.lng
  }
  return route
}

// ── Minutes per venue type ─────────────────────────────────────────────────────
const DURATION_MAP: Record<string, number> = {
  PUB:          50,
  BAR:          55,
  LOUNGE:       60,
  ROOFTOP_BAR:  65,
  CONCERT_HALL: 90,
  NIGHTCLUB:   110,
}

// ── Time helpers ──────────────────────────────────────────────────────────────
function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (h ?? 0) * 60 + (m ?? 0) + mins
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function walkingMinutes(distKm: number): number {
  return Math.max(3, Math.round((distKm / 4.5) * 60)) // avg 4.5 km/h walking speed
}

// ── Optional OpenAI enhancement ───────────────────────────────────────────────
async function enrichWithAI(
  stops: Array<{ name: string; type: string; vibeTags: string[]; arrivalTime: string; duration: number; order: number }>,
  groupSize: number,
  vibes: string[],
  theme: string,
): Promise<{ stopDescriptions: string[]; crawlTitle: string; openingLine: string }> {
  if (!OPENAI_API_KEY) {
    return {
      crawlTitle: theme,
      openingLine: `A ${groupSize}-person crawl through the best spots in the area.`,
      stopDescriptions: stops.map((s) =>
        s.order === 1
          ? `Kick off the night here — a great warm-up spot.`
          : s.order === stops.length
          ? `End the night in style at ${s.name}.`
          : `A solid mid-crawl stop with the right energy.`,
      ),
    }
  }

  const prompt = `You are a nightlife expert AI for PartyRadar, a party-discovery app.
Create a fun, punchy pub-crawl narrative for a group of ${groupSize} people.

Stops (in order):
${stops.map((s, i) => `${i + 1}. ${s.name} (${s.type}) — arrives ${s.arrivalTime}, stays ${s.duration} min — vibes: ${s.vibeTags.join(', ') || 'none listed'}`).join('\n')}

Vibe preferences: ${vibes.length ? vibes.join(', ') : 'general fun'}

Return ONLY valid JSON (no markdown) in this exact shape:
{
  "crawlTitle": "Catchy crawl name (max 6 words)",
  "openingLine": "One punchy opening sentence (max 20 words)",
  "stopDescriptions": ["One sentence per stop — what to do/drink/expect (max 18 words each)"]
}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.75,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error('OpenAI error')
    const json = (await res.json()) as { choices: { message: { content: string } }[] }
    const raw = json.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return parsed
  } catch {
    // Fallback
    return {
      crawlTitle: theme,
      openingLine: `A ${groupSize}-person crawl through the best spots nearby.`,
      stopDescriptions: stops.map((s) =>
        s.order === 1 ? `Start here to warm up the group.` : s.order === stops.length ? `Finish strong — this is the main event.` : `Great mid-crawl energy here.`,
      ),
    }
  }
}

// ── POST /api/pub-crawl/generate ──────────────────────────────────────────────
router.post('/generate', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const {
      lat,
      lng,
      groupSize = 6,
      startTime = '19:00',
      vibes = [],
      stops: requestedStops = 5,
    } = req.body as {
      lat: number; lng: number
      groupSize?: number; startTime?: string
      vibes?: string[]; stops?: number
    }

    if (lat == null || lng == null) {
      return res.status(400).json({ error: { message: 'lat and lng are required' } })
    }

    const numStops = Math.min(8, Math.max(3, Number(requestedStops)))
    const radiusKm = 3

    // ── 1. Fetch candidate venues ──────────────────────────────────────────────
    const latDelta = radiusKm / 111
    const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180))

    const candidates = await prisma.venue.findMany({
      where: {
        lat: { gte: lat - latDelta, lte: lat + latDelta },
        lng: { gte: lng - lngDelta, lte: lng + lngDelta },
        isBanned: false,
        type: { in: ['PUB', 'BAR', 'LOUNGE', 'ROOFTOP_BAR', 'NIGHTCLUB', 'CONCERT_HALL'] },
      },
      select: {
        id: true, name: true, address: true, city: true,
        lat: true, lng: true, type: true,
        photoUrl: true, vibeTags: true,
        rating: true, isClaimed: true,
      },
      take: 40,
    })

    if (candidates.length < 2) {
      return res.status(404).json({ error: { message: 'Not enough venues found in this area. Try moving the map.' } })
    }

    // ── 2. Score & sort ────────────────────────────────────────────────────────
    // Prefer: claimed > rated > vibe match > close
    const vibeSet = new Set(vibes.map((v: string) => v.toLowerCase()))
    const scored = candidates.map((v) => {
      const distKm = haversine(lat, lng, v.lat, v.lng)
      const vibeMatch = v.vibeTags.filter((t: string) => vibeSet.has(t.toLowerCase())).length
      const score =
        (v.isClaimed ? 2 : 0) +
        (v.rating ? v.rating : 0) +
        vibeMatch * 1.5 -
        distKm * 0.4
      return { ...v, distKm, score }
    })
    scored.sort((a, b) => b.score - a.score)

    // ── 3. Pick stops — one nightclub max and it goes last ─────────────────────
    const topPicks = scored.slice(0, Math.min(numStops * 3, 20))
    const nightclubs = topPicks.filter((v) => v.type === 'NIGHTCLUB')
    const others     = topPicks.filter((v) => v.type !== 'NIGHTCLUB')

    const preClub = others.slice(0, numStops - (nightclubs.length > 0 ? 1 : 0))
    const finalClub = nightclubs.slice(0, 1)
    const selected = [...preClub, ...finalClub].slice(0, numStops)

    if (selected.length < 2) {
      return res.status(404).json({ error: { message: 'Not enough variety of venues found. Try a wider radius.' } })
    }

    // ── 4. Optimise walking route (nearest-neighbour) ─────────────────────────
    // Keep nightclub last if present
    const fixedLast = finalClub.length > 0 ? finalClub[0]! : null
    const toOptimise = fixedLast ? selected.filter((v) => v.id !== fixedLast.id) : selected
    const optimised  = optimiseRoute(toOptimise, lat, lng)
    if (fixedLast) optimised.push(fixedLast)

    // ── 5. Assign times ───────────────────────────────────────────────────────
    const route: Array<{
      order: number
      venueId: string; name: string; address: string; city: string
      lat: number; lng: number; type: string
      photoUrl: string | null; vibeTags: string[]; rating: number | null; isClaimed: boolean
      distanceFromPrevKm: number; walkingMins: number
      arrivalTime: string; departureTime: string; durationMins: number
      description: string
    }> = []

    let currentTime = startTime
    let prevLat = lat, prevLng = lng

    for (let i = 0; i < optimised.length; i++) {
      const v = optimised[i]!
      const distFromPrev = haversine(prevLat, prevLng, v.lat, v.lng)
      const walkMins = i === 0 ? 0 : walkingMinutes(distFromPrev)
      if (i > 0) currentTime = addMinutes(currentTime, walkMins)

      const stayMins = DURATION_MAP[v.type] ?? 60
      const arrival   = currentTime
      const departure = addMinutes(currentTime, stayMins)

      route.push({
        order: i + 1,
        venueId: v.id, name: v.name, address: v.address, city: v.city,
        lat: v.lat, lng: v.lng, type: v.type,
        photoUrl: v.photoUrl, vibeTags: v.vibeTags, rating: v.rating, isClaimed: v.isClaimed,
        distanceFromPrevKm: Math.round(distFromPrev * 100) / 100,
        walkingMins: walkMins,
        arrivalTime: arrival,
        departureTime: departure,
        durationMins: stayMins,
        description: '', // filled by AI below
      })

      currentTime = departure
      prevLat = v.lat; prevLng = v.lng
    }

    // ── 6. AI narrative ───────────────────────────────────────────────────────
    const theme = `${groupSize}-Person Crawl · ${route[0]?.city ?? 'Local'}`
    const aiStops = route.map((r) => ({
      name: r.name, type: r.type, vibeTags: r.vibeTags,
      arrivalTime: r.arrivalTime, duration: r.durationMins, order: r.order,
    }))
    const { crawlTitle, openingLine, stopDescriptions } = await enrichWithAI(aiStops, groupSize, vibes, theme)

    // Attach AI descriptions
    route.forEach((stop, i) => {
      stop.description = stopDescriptions?.[i] ?? ''
    })

    // ── 7. Compute totals ─────────────────────────────────────────────────────
    const totalDistanceKm = route.reduce((acc, s) => acc + s.distanceFromPrevKm, 0)
    const totalDurationMins =
      route.reduce((acc, s) => acc + s.durationMins + s.walkingMins, 0)
    const endTime = addMinutes(startTime, totalDurationMins)

    res.json({
      data: {
        crawlTitle,
        openingLine,
        groupSize,
        startTime,
        endTime,
        totalStops: route.length,
        totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
        totalDurationMins,
        route,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
