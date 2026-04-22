/**
 * Story viewed-state tracking.
 *
 * Stories expire server-side after 25h so we don't need a DB table just to
 * track "has user X seen story Y" — localStorage is enough for the Instagram-
 * style pink-ring-vs-gray-ring UX. Each story id is stamped with a viewed-at
 * timestamp so we can trim entries older than the expiry window and keep the
 * blob small over time.
 */

const KEY = 'partyradar:story-viewed-v1'
// Keep entries for 30 days — well past the 25h story expiry. Anything older is
// definitely stale and can go.
const TTL_MS = 30 * 24 * 60 * 60 * 1000

type ViewedMap = Record<string, number>

function readMap(): ViewedMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as ViewedMap
  } catch {
    return {}
  }
}

function writeMap(map: ViewedMap): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // Quota exceeded or storage disabled — silently drop. The pink ring just
    // stays pink until the story expires server-side anyway.
  }
}

function pruneExpired(map: ViewedMap): ViewedMap {
  const cutoff = Date.now() - TTL_MS
  const next: ViewedMap = {}
  for (const [id, ts] of Object.entries(map)) {
    if (ts > cutoff) next[id] = ts
  }
  return next
}

/** Mark one or more story ids as viewed. Pruning happens on every write. */
export function markStoriesViewed(storyIds: string[]): void {
  if (storyIds.length === 0) return
  const now = Date.now()
  const next = pruneExpired(readMap())
  for (const id of storyIds) next[id] = now
  writeMap(next)
}

/** Returns true when every story id in the set has been viewed already. */
export function areAllViewed(storyIds: string[]): boolean {
  if (storyIds.length === 0) return true
  const map = readMap()
  return storyIds.every((id) => map[id] != null)
}

/** Count unseen stories in the given set. Used for the "3 new" badge UX. */
export function countUnviewed(storyIds: string[]): number {
  if (storyIds.length === 0) return 0
  const map = readMap()
  let count = 0
  for (const id of storyIds) if (map[id] == null) count++
  return count
}
