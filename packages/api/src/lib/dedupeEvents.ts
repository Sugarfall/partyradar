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
// Match city names that appear as a whole token (start-of-string, after a
// space, or at end-of-string). Used to scrub "Tyketto Glasgow" → "Tyketto".
const CITY_SUFFIX_RE = new RegExp(`(^|\\s+)(${CITY_SUFFIXES.join('|')})\\b`, 'gi')

// Placeholder "venues" that aggregators emit when the real location is a
// city, multiple locations, or unknown. Treat these exactly like cities —
// not a usable venue identifier. Without this set, two rows for
// "Glasgow Cocktail Festival" stored as "Various Venues" vs "Multiple
// Venues" fail to merge because their venueKeys don't match.
const GENERIC_VENUES = new Set<string>([
  ...CITY_SUFFIXES,
  'various venues', 'various', 'multiple venues', 'multiple locations',
  'multiple', 'several venues', 'several locations',
  'tba', 'tbc', 'tbd', 'to be announced', 'to be confirmed',
  'online', 'virtual', 'livestream', 'streaming',
  'unknown', 'unspecified', 'none',
  'venue', 'venues', 'location', 'locations',
])

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
  { tag: 'live-music', patterns: [/\blive\s+music\b/, /\blive\s+band\b/, /\blive\s+gig\b/, /\blive\s+bands\b/] },
  { tag: 'acoustic',   patterns: [/\bacoustic\s+(session|set|night|show)\b/, /\blive\s+acoustic\b/] },
  { tag: 'dj-night',   patterns: [/\bdj\s+set\b/, /\bclub\s+night\b/, /\bclubnight\b/] },
  // Genre-named weekly nights (e.g. "House Night at Sub Club", "Techno Night
  // at Room 2"). These are venue-specific residencies despite sharing a
  // generic title across the city — so they must match on venue, not on
  // the full-name key.
  { tag: 'genre-night', patterns: [
      /\bhouse\s+(night|party|session)\b/,
      /\btechno\s+(night|party|session)\b/,
      /\bdrum\s*(n|and|&|\+)\s*bass\s+(night|session)\b/,
      /\b(d\s*n\s*b|dnb)\s+night\b/,
      /\bdisco\s+(night|party)\b/,
      /\bhip\s*hop\s+night\b/,
  ] },
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
  // Collapse doubled consonants: "guerrilla" → "guerila", "guerilla" → "guerila".
  // Cross-source typos (single vs double letter) produce the same normalised form
  // and therefore the same dedup key — they collapse correctly.
  s = s.replace(/([bcdfghjklmnpqrstvwxz])\1+/g, '$1')
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
  /** Full street address. Used for merge-and-enrich scoring so that when
   *  dedupe picks a winner, the best available address survives regardless
   *  of which source supplied it. Some sources (Perplexity) hallucinate
   *  addresses; others (Ticketmaster) return canonical postcoded strings. */
  address?: string | null
  externalSource?: Source
}

/** Emit `{value, value±1}` grid cells at a given decimal multiplier so that
 *  two events sitting on opposite sides of a cell boundary still share at
 *  least one key. Returns 3 cell strings at `mult=10` (1dp, ~11km), 3 at
 *  `mult=100` (2dp, ~1.1km). We widen by one cell in each direction → 3
 *  cells per axis → 9 cells total when combined via caller. */
function neighborCells(v: number, mult: number): string[] {
  const base = Math.round(v * mult)
  // Using `toFixed` rounds half-to-even in some engines and half-up in
  // others; compute from the integer base so it's deterministic.
  const digits = Math.log10(mult)
  return [base - 1, base, base + 1].map((n) => (n / mult).toFixed(digits))
}

/** Produce one or more fingerprints for an event. Two events that share
 *  ANY fingerprint are treated as the same real event. */
function makeDedupKeys(event: DedupableEvent): string[] {
  const d = event.startsAt instanceof Date ? event.startsAt : new Date(event.startsAt)
  const day = Number.isNaN(d.getTime()) ? 'nodate' : d.toISOString().slice(0, 10)
  const source = event.externalSource ?? ''

  const normalized = normalizeName(event.name, event.venueName)
  const words = normalized.split(' ').filter(Boolean)
  const firstWord = words[0] ?? ''

  // If the first word is too short to be distinctive (e.g. "go", "uv"), fall
  // back to the first two words — "Go Dance" and "Go Dance Festival" then
  // both hash as "go dance".
  const nameKey = firstWord.length >= 3
    ? firstWord
    : words.slice(0, 2).join(' ') || normalized

  // If nameKey is still empty after normalization (e.g. event named only with
  // stripped tokens like "Weekly Glasgow"), bail out — an empty nameKey produces
  // degenerate fingerprints like "|date|venue:x" that falsely collapse all events
  // at the same venue on the same day regardless of their actual names.
  if (!nameKey) return []

  const keys: string[] = []

  const activityTags = extractActivityTags(event.name)

  // Primary venue key: official venueName if set. Secondary: neighbourhood
  // (some sync paths stash venue name there). Both are discarded if they
  // normalize to a bare city name ("glasgow") or a generic placeholder
  // ("various venues", "tba") — too coarse to be a venue identifier and
  // would falsely collapse unrelated events.
  const venueSignals = [event.venueName, event.neighbourhood]
  const venueKeysSeen: string[] = []
  for (const raw of venueSignals) {
    const v = normalizeVenue(raw)
    if (!v) continue
    if (GENERIC_VENUES.has(v)) continue       // reject cities + placeholders
    venueKeysSeen.push(v)
    keys.push(`${nameKey}|${day}|venue:${v}`)

    // Activity-tag keys catch the "same recurring event, different titles"
    // case: three sources describing the same weekly Open Mic at Nice N
    // Sleazy all emit `activity:open-mic|YYYY-MM-DD|venue:nicensleazy`
    // regardless of their individual title wording.
    for (const tag of activityTags) {
      keys.push(`activity:${tag}|${day}|venue:${v}`)
    }

    // Cross-day recurring collapse: Perplexity emits weekly recurring events
    // (Karaoke Night, Open Mic, Pub Quiz, Bingo, House Night, etc.) as a
    // separate record for EVERY day of its 2-week lookup window. Users see
    // "Karaoke at Admiral Bar" 3 nights in a row and rightly call it a
    // duplicate. This day-agnostic key collapses same-venue Perplexity
    // rows into one winner (the earliest-dated).
    //
    // Gated on source=perplexity so Ticketmaster two-night residencies
    // (Olivia Dean at OVO Hydro Apr 22 + Apr 23) with distinct ticket
    // listings per night stay separate.
    //
    // Gated on activity-tag match so real multi-night artist residencies
    // (Acid Mothers Temple at Mono Apr 23–25, Brokencyde at Cathouse
    // Apr 24–25) stay distinct — they have unique artist names, no
    // activity tag matches.
    if (source === 'perplexity') {
      for (const tag of activityTags) {
        keys.push(`pplx-recur:${tag}|venue:${v}`)
      }
    }
  }

  if (event.lat != null && event.lng != null) {
    // 2 decimal places ≈ 1.1 km at the equator. Wide enough to absorb
    // source-to-source geocoding drift within a venue, narrow enough that
    // genuinely different venues on the same street don't collide. We
    // intentionally do NOT widen this grid — Glasgow Merchant City alone
    // has a dozen venues inside a 1km radius all running karaoke / pub
    // quiz / open mic every night, and widening here collapses unrelated
    // pubs' weekly events onto each other.
    keys.push(`${nameKey}|${day}|geo:${event.lat.toFixed(2)}|${event.lng.toFixed(2)}`)
    for (const tag of activityTags) {
      keys.push(`activity:${tag}|${day}|geo:${event.lat.toFixed(2)}|${event.lng.toFixed(2)}`)
    }

    // Strong fingerprint: full normalized name + day + metro-level geo
    // (1dp cell + 8 neighbours ≈ 33km span). Fires only when:
    //   - `normalized` is non-empty, AND
    //   - the title does NOT match any activity tag. Generic recurring
    //     titles like "Open Mic" and "Pub Quiz" are intentionally excluded
    //     because they collide across unrelated venues — those are already
    //     covered by the activity-tag + venue keys above.
    //
    // Neighbour expansion matters HERE specifically because sources often
    // geocode the same real venue to points 1–3km apart (Ticketmaster
    // pins a city-centre default, Perplexity hits the actual postcode).
    // The 1dp cell alone misses those; the 3×3 block absorbs them. And
    // because we also require a full normalized-name match, the risk of
    // false collapse stays low: two gigs with the same distinctive title
    // on the same day within ~33km are virtually always the same event.
    //
    // With this key, Ticketmaster's `venueName=null, neighbourhood=Manchester`
    // row merges with Perplexity's `neighbourhood=AO Arena` row for the same
    // "Yungblud" gig even though neither side provides a matching venue.
    if (normalized && activityTags.length === 0) {
      const latCells1 = neighborCells(event.lat, 10)
      const lngCells1 = neighborCells(event.lng, 10)
      for (const cLat of latCells1) {
        for (const cLng of lngCells1) {
          keys.push(`fn:${normalized}|${day}|geo1:${cLat}|${cLng}`)
        }
      }
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

// ── Field-quality scoring for merge-and-enrich ────────────────────────────────

/** Score an address string for specificity. Higher = more trustworthy.
 *  Used when two duplicate rows disagree: "Manchester" loses to
 *  "Victoria Station, Hunts Bank, Manchester M3 1AR". */
function addressScore(addr: string | null | undefined): number {
  if (!addr) return -1
  const a = addr.toLowerCase().trim()
  if (!a) return -1
  if (GENERIC_VENUES.has(a)) return -1
  // "Glasgow, Glasgow" / "Manchester City Centre" / just a city
  if (/^(?:[a-z]+\s*(?:city\s+(?:centre|center))?\s*,?\s*)+$/i.test(a)) {
    // Accept if the address is actually more detailed than just city tokens
    const tokens = a.replace(/[,\s]+/g, ' ').split(' ').filter(Boolean)
    if (tokens.every((t) => CITY_SUFFIXES.includes(t) || t === 'centre' || t === 'center' || t === 'city')) {
      return 0
    }
  }
  let score = 0
  if (/\d/.test(a)) score += 3                       // has a number (street or postcode)
  if (/\b[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}\b/i.test(addr)) score += 3 // UK postcode
  if (a.split(',').length >= 2) score += 2           // comma-separated parts
  if (a.length > 20) score += 1                      // longer strings tend to be fuller
  if (a.length > 40) score += 1
  return score
}

/** Score a venue-name string. Prefer specific named venues over null or
 *  generic placeholders. */
function venueNameScore(name: string | null | undefined): number {
  if (!name) return -1
  const n = name.toLowerCase().trim()
  if (!n) return -1
  if (GENERIC_VENUES.has(n)) return -1
  let score = 0
  if (n.length >= 3) score += 1
  if (n.split(' ').length >= 2) score += 1
  return score
}

/** Pick the best value from a list by maximum score. Ties → first non-nullish. */
function pickBest<V>(values: V[], score: (v: V) => number): V | undefined {
  let best: V | undefined
  let bestScore = -Infinity
  for (const v of values) {
    if (v == null) continue
    const s = score(v)
    if (s > bestScore) {
      best = v
      bestScore = s
    }
  }
  return best
}

/** Build the enriched winner by starting from the winner and filling each
 *  address-like field with the highest-scored value found across the family.
 *  Fields NOT in the enrichable set (ids, external source, etc.) stay with
 *  the winner untouched — the winner's identity is preserved. */
function enrichWinner<T extends DedupableEvent>(winner: T, family: T[]): T {
  if (family.length <= 1) return winner
  // Prefer the winner's value when scores tie — list it first.
  const ordered = [winner, ...family.filter((e) => e !== winner)]

  const bestAddress = pickBest(
    ordered.map((e) => e.address ?? null),
    addressScore,
  )
  const bestVenueName = pickBest(
    ordered.map((e) => e.venueName ?? null),
    venueNameScore,
  )
  const bestNeighbourhood = pickBest(
    ordered.map((e) => e.neighbourhood ?? null),
    venueNameScore, // same scoring: reject cities + generic placeholders
  )

  // Only overwrite if the best non-winner value actually scores higher than
  // the winner's current value — avoids gratuitous rewrites when winner is
  // already best.
  const out: T = { ...winner }
  if (bestAddress && bestAddress !== winner.address && addressScore(bestAddress) > addressScore(winner.address)) {
    ;(out as DedupableEvent).address = bestAddress
  }
  if (
    bestVenueName &&
    bestVenueName !== winner.venueName &&
    venueNameScore(bestVenueName) > venueNameScore(winner.venueName)
  ) {
    ;(out as DedupableEvent).venueName = bestVenueName
  }
  if (
    bestNeighbourhood &&
    bestNeighbourhood !== winner.neighbourhood &&
    venueNameScore(bestNeighbourhood) > venueNameScore(winner.neighbourhood)
  ) {
    ;(out as DedupableEvent).neighbourhood = bestNeighbourhood
  }
  return out
}

/**
 * Collapse cross-source duplicates AND enrich the surviving row with the
 * best address/venue fields from all of its duplicates.
 *
 * Why enrichment matters: Ticketmaster is the highest-priority source so its
 * row wins by default, but Ticketmaster frequently stores neighbourhood
 * as just a city ("Manchester") while Perplexity's duplicate row has a
 * specific venue ("AO Arena"). Without merging, the user sees the coarser
 * of the two. With merging, the winner keeps Ticketmaster's authoritative
 * address and ticket link but also inherits Perplexity's specific venue
 * name.
 *
 * Algorithm:
 * 1. Sort by source priority (user-created first, then ticketmaster, etc.).
 * 2. Walk the sorted list. For each event compute its set of keys.
 *    - If ANY of those keys has already been claimed, this event joins
 *      that winner's "family" of duplicates and is dropped from the output.
 *    - Otherwise it becomes a new winner and its keys are claimed.
 * 3. For each winner, build an enriched version that inherits the
 *    highest-scored address / venueName / neighbourhood across its family.
 * 4. Return the enriched winners in original input order.
 */
export function dedupeEvents<T extends DedupableEvent>(events: T[]): T[] {
  const byPriority = [...events].sort(
    (a, b) => priority(a.externalSource) - priority(b.externalSource),
  )

  const claimed = new Map<string, T>()     // key -> winner event
  const families = new Map<T, T[]>()        // winner -> all members incl. itself

  for (const e of byPriority) {
    // User-created events bypass dedup entirely — they're independent data.
    if (!e.externalSource) {
      families.set(e, [e])
      continue
    }

    const keys = makeDedupKeys(e)
    const existingWinner = keys.map((k) => claimed.get(k)).find((v): v is T => v != null)
    if (existingWinner) {
      families.get(existingWinner)!.push(e)
      continue
    }

    for (const k of keys) claimed.set(k, e)
    families.set(e, [e])
  }

  // Build enriched winner objects (original remains unmodified).
  const enriched = new Map<T, T>()
  for (const [w, fam] of families) enriched.set(w, enrichWinner(w, fam))

  // Preserve input order: for each original event, emit the enriched winner
  // if this event is itself a winner. Non-winners are dropped silently.
  const result: T[] = []
  for (const e of events) {
    const w = enriched.get(e)
    if (w) result.push(w)
  }
  return result
}
