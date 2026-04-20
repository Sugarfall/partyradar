import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

/** POST /api/go-out/suggest
 *  Suggests nearby bars/clubs + meeting time using AI based on the user's
 *  location, current time, and available venues/events in the area.
 */
router.post('/suggest', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.dbUser.id
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, lastKnownLat: true, lastKnownLng: true, interests: true },
    })
    if (!user) { res.status(404).json({ error: 'User not found' }); return }

    // Accept lat/lng from request body (client passes current GPS) or fall back to DB
    const lat: number = req.body.lat ?? user.lastKnownLat
    const lng: number = req.body.lng ?? user.lastKnownLng
    const city: string = req.body.city ?? 'your city'

    // Fetch nearby venues from DB (within ~15 km)
    const latDelta = 0.135  // ~15 km
    const lngDelta = 0.18
    // Bug 15 fix: use explicit null check — lat/lng of 0 are valid coordinates
    const hasLocation = lat != null && lng != null
    const venues = await prisma.venue.findMany({
      where: {
        lat: hasLocation ? { gte: lat - latDelta, lte: lat + latDelta } : undefined,
        lng: hasLocation ? { gte: lng - lngDelta, lte: lng + lngDelta } : undefined,
      },
      select: { name: true, type: true, vibeTags: true, rating: true },
      take: 20,
    })

    // Fetch tonight's events
    const now = new Date()
    const midnight = new Date(now)
    midnight.setHours(23, 59, 59, 999)

    const events = await prisma.event.findMany({
      where: {
        isPublished: true,
        isCancelled: false,
        startsAt: { gte: now, lte: midnight },
        ...(hasLocation ? {
          venue: {
            lat: { gte: lat - latDelta, lte: lat + latDelta },
            lng: { gte: lng - lngDelta, lte: lng + lngDelta },
          },
        } : {}),
      },
      select: { name: true, type: true, neighbourhood: true, startsAt: true, price: true },
      take: 10,
    })

    const dayOfWeek = now.toLocaleDateString('en-GB', { weekday: 'long' })
    const timeNow = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const interests = user.interests.length ? user.interests.join(', ') : 'music, socialising'

    const apiKey = process.env['PERPLEXITY_API_KEY']

    let suggestions: Array<{ name: string; type: string; reason: string }> = []
    let meetingTime = ''
    let aiSummary = ''

    if (apiKey) {
      const venueList = venues.length
        ? venues.map(v => `${v.name} (${v.type}${v.rating ? `, rated ${v.rating}` : ''})`).join(', ')
        : 'none found nearby in database'

      const eventList = events.length
        ? events.map(e => `${e.name} at ${new Date(e.startsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} (${e.type})`).join(', ')
        : 'none tonight'

      const prompt = `You are a nightlife AI for PartyRadar, a social party app.

Context:
- User: ${user.displayName}, interests: ${interests}
- City: ${city}
- Day/Time: ${dayOfWeek}, ${timeNow}
- Venues in database: ${venueList}
- Tonight's events: ${eventList}

Task: Suggest 3 great places to go out tonight in ${city} with a recommended meeting time.
If there are relevant events or venues in the database list above, prioritise those.
Otherwise, suggest well-known bars/clubs in ${city} for tonight.

Return ONLY valid JSON (no markdown, no explanation), in exactly this format:
{
  "suggestions": [
    { "name": "Venue Name", "type": "bar/club/pub", "reason": "short fun reason" },
    { "name": "Venue Name", "type": "bar/club/pub", "reason": "short fun reason" },
    { "name": "Venue Name", "type": "bar/club/pub", "reason": "short fun reason" }
  ],
  "meetingTime": "e.g. 9:30 PM",
  "summary": "One fun, punchy sentence about tonight's vibe"
}`

      const aiRes = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 400,
          temperature: 0.7,
        }),
      })

      if (aiRes.ok) {
        const aiData = await aiRes.json() as { choices?: Array<{ message?: { content?: string } }> }
        const raw = aiData.choices?.[0]?.message?.content ?? ''
        try {
          // Strip markdown fences if present
          const jsonStr = raw.replace(/```(?:json)?\n?/g, '').replace(/```$/g, '').trim()
          const parsed = JSON.parse(jsonStr) as {
            suggestions: Array<{ name: string; type: string; reason: string }>
            meetingTime: string
            summary: string
          }
          suggestions = parsed.suggestions ?? []
          meetingTime = parsed.meetingTime ?? ''
          aiSummary = parsed.summary ?? ''
        } catch {
          // Fallback if JSON parse fails
          suggestions = venues.slice(0, 3).map(v => ({ name: v.name, type: v.type, reason: '📍 Near you' }))
          meetingTime = now.getHours() < 20 ? '9:00 PM' : '10:30 PM'
          aiSummary = `Let's make tonight one to remember in ${city}!`
        }
      }
    } else {
      // No API key — use DB venues as fallback
      suggestions = venues.slice(0, 3).map(v => ({ name: v.name, type: v.type, reason: v.vibeTags?.[0] ? `#${v.vibeTags[0]}` : '📍 Near you' }))
      meetingTime = now.getHours() < 20 ? '9:00 PM' : '10:30 PM'
      aiSummary = `Great options waiting in ${city} tonight!`
    }

    res.json({
      data: {
        suggestions,
        meetingTime,
        summary: aiSummary,
        city,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
