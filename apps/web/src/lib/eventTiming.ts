/**
 * Shared event timing logic — single source of truth for:
 *  - "is this event happening right now?"
 *  - "when does it actually end?" (type-aware when endsAt is null)
 *
 * The old implementation used a 6-hour default when endsAt was null, which
 * caused false "HAPPENING NOW" displays: a pub quiz imported from Perplexity
 * with a midnight-UTC placeholder start time was showing "4 hours remaining"
 * at 3am the following day. Fixing it in one place also fixes the same bug
 * in discover/page.tsx (LIVE NOW filter) and host/page.tsx (status pill).
 */

interface TimedEvent {
  startsAt: string | Date
  endsAt?: string | Date | null
  type?: string | null
}

// Type-aware default durations used when `endsAt` is null. Chosen to match
// typical venue closing behaviour so "HAPPENING NOW" reflects reality.
// Glasgow pubs close at 23:00; clubs run til ~03:00; concerts run ~2.5h.
// Keep these conservative — false positives ("claims to be live when the
// event ended hours ago") are far worse than missing a borderline case.
const DEFAULT_DURATION_MS: Record<string, number> = {
  CLUB_NIGHT:  5 * 3600_000, // 22:00 → 03:00
  HOME_PARTY:  5 * 3600_000,
  BEACH_PARTY: 4 * 3600_000,
  YACHT_PARTY: 4 * 3600_000,
  CONCERT:     3 * 3600_000, // 19:30 → 22:30
  PUB_NIGHT:   3 * 3600_000, // 20:00 → 23:00 (quiz / karaoke / open mic)
}
const DEFAULT_FALLBACK_MS = 3 * 3600_000

/** When was the event scheduled to end?
 *  Returns a timestamp in ms. Uses `endsAt` if present, otherwise a
 *  type-aware default capped at 5h after start. */
export function effectiveEndMs(event: TimedEvent): number {
  const start = new Date(event.startsAt).getTime()
  if (event.endsAt) {
    const end = new Date(event.endsAt).getTime()
    // Guard against bad data where endsAt < startsAt (sync bug or edit error)
    if (!Number.isNaN(end) && end > start) return end
  }
  const duration = event.type
    ? (DEFAULT_DURATION_MS[event.type] ?? DEFAULT_FALLBACK_MS)
    : DEFAULT_FALLBACK_MS
  return start + duration
}

/** True iff `now` is within [start, effectiveEnd]. Safe for "LIVE NOW" /
 *  "HAPPENING NOW" filters. */
export function isHappeningNow(event: TimedEvent, now: number = Date.now()): boolean {
  const start = new Date(event.startsAt).getTime()
  if (Number.isNaN(start)) return false
  if (now < start) return false
  return now <= effectiveEndMs(event)
}

/** True iff the event has definitely ended. */
export function isPast(event: TimedEvent, now: number = Date.now()): boolean {
  return now > effectiveEndMs(event)
}
