/**
 * Referral attribution helper.
 *
 * When someone lands on any page with `?ref=CODE` in the URL, we stash the
 * code in localStorage for 30 days. After they register (email, Google or
 * Apple), the register flow reads the stored code and calls
 * POST /api/referrals/apply — no manual code entry required.
 *
 * Storage persists across the OAuth redirect round-trip, the email
 * verification step, and any navigation that happens before signup.
 */

const KEY = 'partyradar_ref_code'
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

interface StoredRef {
  code: string
  at: number
}

/** Save a referral code (called from layout-level URL watcher or /invite route). */
export function captureReferral(rawCode: string | null | undefined): void {
  if (!rawCode) return
  const code = rawCode.trim().toUpperCase()
  if (!code || code.length < 4 || code.length > 40) return
  if (typeof window === 'undefined') return

  try {
    const payload: StoredRef = { code, at: Date.now() }
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    // localStorage may be disabled (private mode / storage quota) — fail silent
  }
}

/** Read the currently stored referral code, or null if absent/expired. */
export function getStoredReferral(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredRef>
    if (typeof parsed.code !== 'string') return null
    if (typeof parsed.at !== 'number') return null
    if (Date.now() - parsed.at > TTL_MS) {
      localStorage.removeItem(KEY)
      return null
    }
    return parsed.code
  } catch {
    return null
  }
}

/** Remove the stored code — call once `/api/referrals/apply` has succeeded. */
export function clearStoredReferral(): void {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(KEY) } catch {}
}
