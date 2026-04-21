/**
 * Cross-source event deduplication.
 *
 * Each external source (Ticketmaster, Skiddle, Eventbrite, SerpAPI, Perplexity)
 * dedupes against itself via `@unique` on its respective ID column — but the
 * same real-world event (e.g. "Tyketto at The Garage, Glasgow") shows up in
 * several of them with slightly different names, so the DB can hold 3–5 rows
 * for one concert.
 *
 * This helper collapses those rows at query time. For each event we derive
 * one or more dedup KEYS:
 *
 *     {nameKey} | {YYYY-MM-DD} | venue:{normalized venue name}
 *     {nameKey} | {YYYY-MM-DD} | geo:{lat.toFixed(2)}|{lng.toFixed(2)}  (~1.1km)
 *
 * Events that share ANY key are the same event. We emit both a venue-based
 * and a geo-based key per event because:
 *   - Different sources sometimes mis-geocode the same venue to coordinates
 *     hundreds of metres apart (e.g. "Nice N Sleazy" at its real address vs
 *     mis-geocoded to a nearby street). venueName is stable across them.
 *   - Some sources populate venueName, others don't. The geo key catches
 *     events where venueName is missing on one side but the lat/lng agree.
 *
 * When multiple events share a key, we keep the one from the highest-
 * priority source (better metadata, ticket links, images).
 *
 * User-created events are NEVER deduped against externals.
 */

type Source = string | null | undefined

// Lower number = higher priority (kept when duplicates collide).
const SOURCE_PRIORITY: Record<string, number> = {
  ticketmaster: 1,
  skiddle:      2,
  eventbrite:   3,
  serpapi:      4,
  perplexity:   5,
}

function priority(source: Source): number {
  if (!source) return 0 // user-created events always beat externals
  return SOURCE_PRIORITY[source] ?? 99
}

// Common UK/IE city names that sources append to event/venue names.
// "The Garage Glasgow", "Nice N Sleazy Glasgow", "Tyketto Edinburgh" etc.
const CITY_SUFFIXES = [
  'glasgow', 'edinburgh', 'london', 'manchester', 'dundee', 'aberdeen',
  'birmingham', 'liverpool', 'leeds', 'sheffield', 'bristol', 'cardiff',
  'belfast', 'dublin', 'newcastle', 'nottingham', 'brighton', 'oxford',
  'cambridge', 'uk', 'scotland', 'england', 'wales', 'ireland',
]
const CITY_SUFFIX_RE = new RegExp(`\\s+(${CITY_SUFFIXES.join('|')})\\b`, 'gi')

/** Strip venue/city suffixes, punctuation, and leading articles so
 *  "The Tyketto", "Tyketto Glasgow", and "Tyketto at The Garage" all
 *  normalize to "tyketto". */
function normalizeName(name: string): string {
  let s = name.toLowerCase()
  s = s.replace(/\s+at\s+.+$/i, '')      // "Tyketto at The Garage" → "tyketto"
  s = s.replace(/\s+[-|–—]\s+.+$/i, '')  // "Tyketto - Live in Glasgow" → "tyketto"
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ') // drop parentheticals "(Live)"
  s = s.replace(/[^\p{L}\p{N}\s]/gu, '') // strip punctuation, keep letters + digits
  s = s.replace(CITY_SUFFIX_RE, ' ')     // drop trailing city names
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/^(the|a|an)\s+/, '')    // strip leading articles
  return s
}

/** Normalize a venue name to something stable across sources:
 *  "The Garage Glasgow" and "The Garage" both become "garage". */
function normalizeVenue(venueName: string | null | undefined): string {
  if (!venueName) return ''
  let s = venueName.toLowerCase()
  s = s.replace(/[^\p{L}\p{N}\s]/gu, '')
  s = s.replace(CITY_SUFFIX_RE, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/^(the|a|an)\s+/, '')
  return s
}

interface DedupableEvent {
  name: string
  startsAt: Date | string
  lat?: number | null
  lng?: number | null
  venueName?: string | null
  externalSource?: Source
}

/** Produce one or more fingerprints for an event. Two events that share
 *  ANY fingerprint are treated as the same real event. */
function makeDedupKeys(event: DedupableEvent): string[] {
  const d = event.startsAt instanceof Date ? event.startsAt : new Date(event.startsAt)
  const day = Number.isNaN(d.getTime()) ? 'nodate' : d.toISOString().slice(0, 10)

  const normalized = normalizeName(event.name)
  const words = normalized.split(' ').filter(Boolean)
  const firstWord = words[0] ?? ''

  // If the first word is too short to be distinctive (e.g. "go", "uv"), fall
  // back to the first two words — "Go Dance" and "Go Dance Festival" then
  // both hash as "go dance".
  const nameKey = firstWord.length >= 3
    ? firstWord
    : words.slice(0, 2).join(' ') || normalized

  const keys: string[] = []

  const venueKey = normalizeVenue(event.venueName)
  if (venueKey) {
    keys.push(`${nameKey}|${day}|venue:${venueKey}`)
  }

  if (event.lat != null && event.lng != null) {
    // 2 decimal places ≈ 1.1 km at the equator. Wide enough to absorb
    // source-to-source geocoding drift, narrow enough that genuinely
    // different venues in the same city don't collide.
    keys.push(`${nameKey}|${day}|geo:${event.lat.toFixed(2)}|${event.lng.toFixed(2)}`)
  }

  if (keys.length === 0) {
    keys.push(`${nameKey}|${day}|nogeo`)
  }

  return keys
}

export { makeDedupKeys }

/** Back-compat: a single deterministic key per event. Use the first key from
 *  makeDedupKeys — good enough for anyone asking for just one. */
export function makeDedupKey(event: DedupableEvent): string {
  return makeDedupKeys(event)[0]!
}

/**
 * Collapse cross-source duplicates.
 *
 * Algorithm:
 * 1. Sort by source priority (user-created first, then ticketmaster, etc.)
 * 2. Walk the sorted list. For each event compute its set of keys.
 *    - If ANY of those keys has already been claimed by a higher-priority
 *      event, this event is a duplicate → drop it.
 *    - Otherwise keep it and mark ALL of its keys as claimed.
 * 3. Return survivors in original input order (preserves orderBy from DB).
 */
export function dedupeEvents<T extends DedupableEvent>(events: T[]): T[] {
  const byPriority = [...events].sort(
    (a, b) => priority(a.externalSource) - priority(b.externalSource),
  )

  const claimed = new Set<string>()
  const winners = new Set<T>()

  for (const e of byPriority) {
    // User-created events bypass dedup entirely — they're independent data.
    if (!e.externalSource) {
      winners.add(e)
      continue
    }

    const keys = makeDedupKeys(e)
    const alreadyClaimed = keys.some((k) => claimed.has(k))
    if (alreadyClaimed) continue // lower-priority dupe, drop silently

    for (const k of keys) claimed.add(k)
    winners.add(e)
  }

  return events.filter((e) => winners.has(e))
}
