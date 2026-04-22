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

// Common UK/IE city/region names that sources append to event/venue names
// or dump into `neighbourhood`. We strip these from match keys because a
// city is way too coarse to be a venue identifier — two unrelated events in
// Glasgow would collide if "glasgow" counted as their venue.
const CITY_SUFFIXES = [
  'glasgow', 'edinburgh', 'london', 'manchester', 'dundee', 'aberdeen',
  'birmingham', 'liverpool', 'leeds', 'sheffield', 'bristol', 'cardiff',
  'belfast', 'dublin', 'newcastle', 'nottingham', 'brighton', 'oxford',
  'cambridge', 'uk', 'scotland', 'england', 'wales', 'ireland',
  'city centre', 'city center', 'town centre', 'town center',
]
const CITY_SUFFIX_SET = new Set(CITY_SUFFIXES)
// Match city names that appear as a whole token (start-of-string, after a
// space, or at end-of-string). Used to scrub "Tyketto Glasgow" → "Tyketto".
const CITY_SUFFIX_RE = new RegExp(`(^|\\s+)(${CITY_SUFFIXES.join('|')})\\b`, 'gi')

// Activity tags: lower-cased keyword patterns that identify the TYPE of
// recurring event (quiz night, open mic, etc). Different sources describe
// the same weekly pub event with varying wording — e.g. "Nice N Sleazy
// Open Mic", "Weekly Open Mic at Nice N Sleazy", "Open Mic at Nice N
// Sleazy" — so nameKey's first-word heuristic splits them. Detecting a
// shared activity tag + venue + day collapses them reliably.
//
// `keyword` is the canonical tag. `patterns` are the substrings (already
// lower-cased, whitespace-collapsed) that map to it. Order matters —
// longer/more-specific patterns first so "drag quiz" wins over plain
// "quiz".
const ACTIVITY_TAGS: Array<{ tag: string; patterns: RegExp[] }> = [
  { tag: 'drag-quiz',  patterns: [/\bdrag\s+quiz\b/] },
  { tag: 'pub-quiz',   patterns: [/\bpub\s+quiz\b/, /\bquiz\s+night\b/, /\bquizzz?\b/, /\btrivia\b/] },
  { tag: 'open-mic',   patterns: [/\bopen\s+mic\b/, /\bopenmic\b/, /\bjam\s+night\b/] },
  { tag: 'karaoke',    patterns: [/\bkaraoke\b/, /\bguitaraoke\b/] },
  { tag: 'comedy',     patterns: [/\bcomedy\s+night\b/, /\bstand[- ]?up\b/, /\bcomedy\s+club\b/, /\bcomedy\s+quiz\b/] },
  { tag: 'drag',       patterns: [/\bdrag\s+(show|night|brunch|bingo)\b/, /\bdrag\s+race\b/] },
  { tag: 'bingo',      patterns: [/\bbingo\b/, /\bdrag\s+bingo\b/] },
  { tag: 'live-music', patterns: [/\blive\s+music\b/, /\blive\s+band\b/, /\blive\s+gig\b/] },
  { tag: 'dj-night',   patterns: [/\bdj\s+set\b/, /\bclub\s+night\b/, /\bclubnight\b/] },
]

function extractActivityTags(name: string): string[] {
  const lower = name.toLowerCase()
  const found = new Set<string>()
  for (const { tag, patterns } of ACTIVITY_TAGS) {
    if (patterns.some((re) => re.test(lower))) found.add(tag)
  }
  return [...found]
}

// Words that describe how-often/when an event runs rather than what it is.
// Stripped from the name before fingerprinting so "Weekly Quiz Night" and
// "Quiz Night" produce the same nameKey.
const FREQUENCY_MODIFIERS = new Set([
  'weekly', 'nightly', 'monthly', 'daily', 'biweekly', 'bi-weekly',
  'fortnightly', 'every', 'recurring', 'regular',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
])

/** Strip venue/city suffixes, punctuation, and leading articles so
 *  "The Tyketto", "Tyketto Glasgow", and "Tyketto at The Garage" all
 *  normalize to "tyketto". Pass `venueName` so we can also scrub the
 *  event's own venue out of the title — sources often bake it in
 *  ("Nice N Sleazy Open Mic") which otherwise changes the nameKey. */
function normalizeName(name: string, venueName?: string | null): string {
  let s = name.toLowerCase()
  s = s.replace(/\s+at\s+.+$/i, '')      // "Tyketto at The Garage" → "tyketto"
  s = s.replace(/\s+[-|–—]\s+.+$/i, '')  // "Tyketto - Live in Glasgow" → "tyketto"
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ') // drop parentheticals "(Live)"

  // Strip the venue name itself if it appears in the title — handles the
  // common pattern where an aggregator titles the event "<venue> <activity>"
  // while another source has "<activity> at <venue>".
  if (venueName) {
    const v = venueName.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim()
    if (v && v.length >= 3) {
      const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
      s = s.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ')
    }
  }

  s = s.replace(/[^\p{L}\p{N}\s]/gu, '') // strip punctuation, keep letters + digits
  s = s.replace(CITY_SUFFIX_RE, ' ')     // drop trailing city names
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/^(the|a|an)\s+/, '')    // strip leading articles

  // Drop frequency-modifier tokens ("weekly", "monday", ...). They're
  // descriptive of cadence, not identity.
  if (s) {
    const kept = s.split(' ').filter((w) => w && !FREQUENCY_MODIFIERS.has(w))
    s = kept.join(' ')
  }
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
  /** `neighbourhood` is often where external sync stashed the venue name
   *  (Perplexity, SerpAPI). We treat it as a secondary venue signal. */
  neighbourhood?: string | null
  externalSource?: Source
}

/** Produce one or more fingerprints for an event. Two events that share
 *  ANY fingerprint are treated as the same real event. */
function makeDedupKeys(event: DedupableEvent): string[] {
  const d = event.startsAt instanceof Date ? event.startsAt : new Date(event.startsAt)
  const day = Number.isNaN(d.getTime()) ? 'nodate' : d.toISOString().slice(0, 10)

  const normalized = normalizeName(event.name, event.venueName)
  const words = normalized.split(' ').filter(Boolean)
  const firstWord = words[0] ?? ''

  // If the first word is too short to be distinctive (e.g. "go", "uv"), fall
  // back to the first two words — "Go Dance" and "Go Dance Festival" then
  // both hash as "go dance".
  const nameKey = firstWord.length >= 3
    ? firstWord
    : words.slice(0, 2).join(' ') || normalized

  const keys: string[] = []

  const activityTags = extractActivityTags(event.name)

  // Primary venue key: official venueName if set. Secondary: neighbourhood
  // (some sync paths stash venue name there). Both are discarded if they
  // normalize to a bare city name ("glasgow") — that's too coarse to be a
  // venue identifier and would falsely collapse unrelated events.
  const venueSignals = [event.venueName, event.neighbourhood]
  const venueKeysSeen: string[] = []
  for (const raw of venueSignals) {
    const v = normalizeVenue(raw)
    if (!v) continue
    if (CITY_SUFFIX_SET.has(v)) continue      // reject bare city names
    venueKeysSeen.push(v)
    keys.push(`${nameKey}|${day}|venue:${v}`)

    // Activity-tag keys catch the "same recurring event, different titles"
    // case: three sources describing the same weekly Open Mic at Nice N
    // Sleazy all emit `activity:open-mic|YYYY-MM-DD|venue:nicensleazy`
    // regardless of their individual title wording.
    for (const tag of activityTags) {
      keys.push(`activity:${tag}|${day}|venue:${v}`)
    }
  }

  if (event.lat != null && event.lng != null) {
    // 2 decimal places ≈ 1.1 km at the equator. Wide enough to absorb
    // source-to-source geocoding drift, narrow enough that genuinely
    // different venues in the same city don't collide.
    keys.push(`${nameKey}|${day}|geo:${event.lat.toFixed(2)}|${event.lng.toFixed(2)}`)
    for (const tag of activityTags) {
      keys.push(`activity:${tag}|${day}|geo:${event.lat.toFixed(2)}|${event.lng.toFixed(2)}`)
    }
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
