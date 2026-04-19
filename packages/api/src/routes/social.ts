/**
 * Social media → event parsing routes (powered by OpenAI)
 *
 * POST /api/social/parse   — parse raw social media post text into structured event data
 * POST /api/social/create  — parse + immediately create the event in the DB
 */
import { Router } from 'express'
import { prisma } from '@partyradar/db'
import { requireAuth } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { z } from 'zod'

const router = Router()

const OPENAI_API_KEY = process.env['OPENAI_API_KEY']

// ── helpers ────────────────────────────────────────────────────────────────────

async function callOpenAI(systemPrompt: string, userContent: string): Promise<string> {
  if (!OPENAI_API_KEY) throw new AppError('OpenAI not configured', 503)

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new AppError(`OpenAI error: ${err}`, 502)
  }

  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  return data.choices[0]?.message?.content ?? ''
}

const PARSE_SYSTEM_PROMPT = `You are an AI that extracts structured event information from social media posts by bars, venues, and party organisers in Glasgow, Scotland.

Given a social media post, extract the following fields and return ONLY valid JSON with no markdown or explanation:
{
  "name": "Event name (string)",
  "description": "Full description of the event (string)",
  "type": "HOME_PARTY | CLUB_NIGHT | CONCERT",
  "startsAt": "ISO 8601 datetime — if no year assume current year, if no time assume 21:00",
  "endsAt": "ISO 8601 datetime or null",
  "address": "Full venue address in Glasgow (string) — if unknown use venue name + ', Glasgow'",
  "neighbourhood": "Neighbourhood or area within Glasgow (string)",
  "price": number (0 if free),
  "alcoholPolicy": "NONE | PROVIDED | BYOB",
  "ageRestriction": "ALL_AGES | AGE_18 | AGE_21",
  "dressCode": "Dress code description or null",
  "vibeTags": ["array", "of", "up", "to", "6", "vibe", "tags"],
  "capacity": number or null,
  "coverImageUrl": "Image URL from post or null",
  "confidence": "number 0-100 indicating how confident you are about the extracted data overall"
}

Rules:
- vibeTags should be short descriptive words: e.g. "techno", "hip-hop", "free-entry", "18+", "student-night", "live-band"
- type: use CONCERT for live music/festivals, CLUB_NIGHT for club/bar nights/DJ sets, HOME_PARTY for house parties
- If you cannot determine a field, use null
- Always return valid JSON only`

// ── POST /api/social/parse ─────────────────────────────────────────────────────

const parseSchema = z.object({
  text: z.string().min(10).max(5000),
  imageUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
})

router.post('/parse', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { text, imageUrl, sourceUrl } = parseSchema.parse(req.body)

    const userContent = [
      `Social media post:\n${text}`,
      imageUrl ? `\nImage URL: ${imageUrl}` : '',
      sourceUrl ? `\nSource URL: ${sourceUrl}` : '',
      `\nToday's date: ${new Date().toISOString().split('T')[0]}`,
    ].join('')

    const raw = await callOpenAI(PARSE_SYSTEM_PROMPT, userContent)

    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>
    } catch {
      throw new AppError('Failed to parse OpenAI response as JSON', 502)
    }

    res.json({ data: { event: parsed, raw: cleaned } })
  } catch (err) {
    next(err)
  }
})

// ── POST /api/social/create ────────────────────────────────────────────────────
// Parse post AND create the event in the DB in one step

const createSchema = z.object({
  text: z.string().min(10).max(5000),
  imageUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  // Allow user to override specific fields after AI parse
  overrides: z.record(z.unknown()).optional(),
})

router.post('/create', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { text, imageUrl, sourceUrl, overrides } = createSchema.parse(req.body)

    const userContent = [
      `Social media post:\n${text}`,
      imageUrl ? `\nImage URL: ${imageUrl}` : '',
      sourceUrl ? `\nSource URL: ${sourceUrl}` : '',
      `\nToday's date: ${new Date().toISOString().split('T')[0]}`,
    ].join('')

    const raw = await callOpenAI(PARSE_SYSTEM_PROMPT, userContent)
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>
    } catch {
      throw new AppError('Failed to parse OpenAI response as JSON', 502)
    }

    // Merge overrides
    const merged = { ...parsed, ...(overrides ?? {}) }

    // Check confidence score
    const confidence = typeof merged['confidence'] === 'number' ? merged['confidence'] : 0
    if (confidence < 70) {
      throw new AppError('Event data could not be verified with sufficient confidence', 422)
    }

    // Validate required fields
    const name = (merged['name'] as string | undefined)?.trim()
    const startsAt = merged['startsAt'] ? new Date(merged['startsAt'] as string) : null
    if (!name || !startsAt || isNaN(startsAt.getTime())) {
      throw new AppError('Insufficient event data extracted', 422)
    }

    const address = (merged['address'] as string | undefined) ?? 'Glasgow'
    const neighbourhood = (merged['neighbourhood'] as string | undefined) ?? address.split(',')[0] ?? 'Glasgow'

    // Default coordinates to Glasgow city centre if not geocoded
    // In production you'd call a geocoding API here
    const lat = (merged['lat'] as number | undefined) ?? 55.8642
    const lng = (merged['lng'] as number | undefined) ?? -4.2518

    const event = await prisma.event.create({
      data: {
        hostId: req.user!.dbUser.id,
        name,
        type: (['HOME_PARTY', 'CLUB_NIGHT', 'CONCERT'].includes(merged['type'] as string)
          ? merged['type']
          : 'CLUB_NIGHT') as 'HOME_PARTY' | 'CLUB_NIGHT' | 'CONCERT',
        description: ((merged['description'] as string | undefined) ?? name).slice(0, 2000),
        startsAt,
        endsAt: merged['endsAt'] ? new Date(merged['endsAt'] as string) : undefined,
        lat,
        lng,
        address,
        neighbourhood,
        showNeighbourhoodOnly: false,
        capacity: (merged['capacity'] as number | undefined) ?? 200,
        price: (merged['price'] as number | undefined) ?? 0,
        ticketQuantity: 0,
        ticketsRemaining: 0,
        alcoholPolicy: (['NONE', 'PROVIDED', 'BYOB'].includes(merged['alcoholPolicy'] as string)
          ? merged['alcoholPolicy']
          : 'NONE') as 'NONE' | 'PROVIDED' | 'BYOB',
        ageRestriction: (['ALL_AGES', 'AGE_18', 'AGE_21'].includes(merged['ageRestriction'] as string)
          ? merged['ageRestriction']
          : 'ALL_AGES') as 'ALL_AGES' | 'AGE_18' | 'AGE_21',
        dressCode: (merged['dressCode'] as string | undefined) ?? undefined,
        vibeTags: Array.isArray(merged['vibeTags']) ? (merged['vibeTags'] as string[]).slice(0, 8) : [],
        whatToBring: [],
        isPublished: false,
        isCancelled: false,
        coverImageUrl: (imageUrl ?? (merged['coverImageUrl'] as string | undefined)) ?? undefined,
        socialSourceUrl: sourceUrl ?? undefined,
      },
    })

    res.status(201).json({ event, parsed: merged })
  } catch (err) {
    next(err)
  }
})

export default router
