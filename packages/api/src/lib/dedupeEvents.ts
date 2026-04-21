/**
 * Cross-source event deduplication.
 *
 * Each external source (Ticketmaster, Skiddle, Eventbrite, SerpAPI, Perplexity)
 * dedupes against itself via `@unique` on its respective ID column — but the
 * same real-world event (e.g. "Tyketto at The Garage, Glasgow") shows up in
 * several of them with slightly different names, so the DB can hold 3–5 rows
 * for one concert.
 *
 * This helper collapses those rows at query time using a coarse identity
 * fingerprint: (first significant word of the name, YYYY-MM-DD of startsAt,
 * lat/lng rounded to ~100m). When multiple events share a fingerprint, we keep
 * the one from the highest-priority source (better metadata/ticket links).
 *
 * User-created events are NEVER deduped against externals — a user hosting
 * their own party on the same night at the same venue as a concert is
 * independent data and must be preserved.
 */

type Source = string | null | undefined

// Lower number = higher priority (kept when duplicates collide).
// Ticketmaster has the most reliable metadata, ticket links, and images.
// Perplexity is AI-scraped text and the most error-prone, so it loses ties.
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

/** Strip venue/city suffixes and punctuation so "Tyketto", "Tyketto Glasgow",
 *  and "Tyketto at The Garage" all normalize to something matchable. */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+at\s+.+$/i, '')      // "Tyketto at The Garage" → "tyketto"
    .replace(/\s+[-|–—]\s+.+$/i, '')  // "Tyketto - Live in Glasgow" → "tyketto"
    .replace(/\s*\([^)]*\)\s*/g, ' ') // drop parentheticals "(Live)"
    .replace(/[^\p{L}\p{N}\s]/gu, '') // strip punctuation, keep letters + digits
    .replace(/\s+/g, ' ')
    .trim()
}

interface DedupableEvent {
  name: string
  startsAt: Date | string
  lat?: number | null
  lng?: number | null
  externalSource?: Source
}

/** Fingerprint: first significant word + day + ~100m-rounded geo.
 *  Two events with the same fingerprint are considered the same real event. */
export function makeDedupKey(event: DedupableEvent): string {
  const d = event.startsAt instanceof Date ? event.startsAt : new Date(event.startsAt)
  const day = Number.isNaN(d.getTime()) ? 'nodate' : d.toISOString().slice(0, 10)

  const normalized = normalizeName(event.name)
  const firstWord = normalized.split(' ')[0] ?? ''

  // Very short first words (e.g. "dj", "uv") are too generic to dedupe on
  // alone — fall back to the full normalized name to avoid false matches.
  const nameKey = firstWord.length >= 3 ? firstWord : normalized

  // 3 decimal places ≈ 111 m at the equator → effectively "same venue".
  // Null geo is rare for externals but we handle it gracefully.
  const geo = event.lat != null && event.lng != null
    ? `${event.lat.toFixed(3)}|${event.lng.toFixed(3)}`
    : 'nogeo'

  return `${nameKey}|${day}|${geo}`
}

/**
 * Collapse cross-source duplicates, keeping one representative per fingerprint.
 *
 * Algorithm:
 * 1. Sort by source priority (user-created → ticketmaster → ... → perplexity).
 * 2. Walk the sorted list; for each event, compute its fingerprint.
 * 3. First event to claim a fingerprint wins; later events with the same
 *    fingerprint are dropped.
 *
 * Order-preserving: the returned array preserves the input order except
 * that duplicates are removed. The relative order of surviving events is
 * the same as the input (we only skip dupes, we don't reshuffle winners).
 */
export function dedupeEvents<T extends DedupableEvent>(events: T[]): T[] {
  // Build a winners set by walking in priority order.
  const byPriority = [...events].sort((a, b) => priority(a.externalSource) - priority(b.externalSource))
  const winners = new Set<T>()
  const seen = new Map<string, T>()
  for (const e of byPriority) {
    const key = makeDedupKey(e)
    // Never dedupe user-created events — they're independent of external feeds.
    if (!e.externalSource) {
      winners.add(e)
      continue
    }
    if (!seen.has(key)) {
      seen.set(key, e)
      winners.add(e)
    }
    // else: lower-priority duplicate, drop silently
  }

  // Return in original input order so existing orderBy (featured, startsAt)
  // is respected.
  return events.filter((e) => winners.has(e))
}
