/**
 * spendToken — HMAC-signed, short-lived tokens for venue wallet spends.
 *
 * Flow:
 *  1. Venue POS calls POST /api/wallet/spend-token (INTERNAL_API_KEY auth) → token
 *  2. Token is shown as QR on POS screen (or sent to user's app)
 *  3. User's app calls POST /api/wallet/spend with { token, venueId, amount }
 *  4. Server verifies signature, TTL, and nonce (single-use) before deducting
 *
 * This prevents users from calling /spend with an arbitrary client-asserted
 * amount — the amount is now server-signed by the venue-side device.
 *
 * Note on nonce store: usedNonces is in-process memory. In a multi-replica
 * deployment, migrate it to a shared Redis SET with EX = TTL_MS/1000 so
 * cross-process replay is also blocked.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const SECRET = () => {
  const s = process.env['WALLET_SPEND_SECRET']
  if (!s && process.env.NODE_ENV === 'production') {
    throw new Error('WALLET_SPEND_SECRET env var is required in production')
  }
  return s ?? 'dev-spend-secret-change-before-prod'
}

const TTL_MS = 2 * 60 * 1000 // 2-minute window — short enough to prevent stockpiling tokens

// In-process nonce store: nonce → expiry epoch ms
const usedNonces = new Map<string, number>()

/** Remove nonces whose TTL has elapsed (called before each lookup to bound map size). */
function pruneNonces(): void {
  const now = Date.now()
  for (const [nonce, exp] of usedNonces) {
    if (exp < now) usedNonces.delete(nonce)
  }
}

function computeSig(payload: string): string {
  return createHmac('sha256', SECRET()).update(payload).digest('hex')
}

/**
 * Create a signed spend token.
 * @param venueId  The venue that will receive the spend.
 * @param amount   The exact amount in GBP (e.g. 12.50).
 */
export function signSpendToken(venueId: string, amount: number): string {
  const nonce = randomBytes(16).toString('hex')
  const expiresAt = Date.now() + TTL_MS
  // Use | separator — none of the fields contain this character
  const payload = `${venueId}|${amount.toFixed(2)}|${nonce}|${expiresAt}`
  const sig = computeSig(payload)
  return `${payload}.${sig}`
}

/**
 * Verify a spend token, assert it matches venueId + amount, and mark it as
 * consumed so it cannot be reused.
 *
 * Throws with a descriptive message on any failure — caller should convert to
 * a 400 AppError before surfacing to the client.
 */
export function verifyAndConsumeSpendToken(
  token: string,
  expectedVenueId: string,
  expectedAmount: number,
): void {
  const lastDot = token.lastIndexOf('.')
  if (lastDot === -1) throw new Error('Malformed spend token')

  const payload = token.slice(0, lastDot)
  const receivedSig = token.slice(lastDot + 1)

  // Constant-time comparison to prevent timing attacks
  const expectedSigBuf = Buffer.from(computeSig(payload), 'hex')
  const receivedSigBuf = Buffer.from(receivedSig.padEnd(expectedSigBuf.length * 2, '0').slice(0, expectedSigBuf.length * 2), 'hex')
  if (
    receivedSigBuf.length !== expectedSigBuf.length ||
    !timingSafeEqual(expectedSigBuf, receivedSigBuf)
  ) {
    throw new Error('Invalid spend token signature')
  }

  const parts = payload.split('|')
  if (parts.length !== 4) throw new Error('Malformed spend token payload')

  const [venueId, amountStr, nonce, expiresAtStr] = parts as [string, string, string, string]
  const tokenAmount = Number(amountStr)
  const expiresAt = Number(expiresAtStr)

  if (venueId !== expectedVenueId) throw new Error('Spend token venue mismatch')
  if (Math.abs(tokenAmount - expectedAmount) > 0.005) throw new Error('Spend token amount mismatch')
  if (Date.now() > expiresAt) throw new Error('Spend token has expired')

  pruneNonces()
  if (usedNonces.has(nonce)) throw new Error('Spend token already used')

  // Mark nonce as consumed for its remaining TTL
  usedNonces.set(nonce, expiresAt)
}
