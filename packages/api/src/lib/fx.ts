/**
 * FX (foreign exchange) utility — converts GBP amounts to other ISO 4217 currencies.
 *
 * Rates are fetched from the free exchangerate-api.com endpoint (no API key required)
 * and cached in-memory for 1 hour so we stay well within the 1,500 req/month free tier
 * (1 req/hour × 24 × 31 = 744 requests/month).
 *
 * Graceful degradation:
 *   • If the fetch fails and we have a stale cache, we serve the stale rates rather
 *     than throwing — slightly out-of-date rates are better than breaking the payout flow.
 *   • If the cache is empty and the fetch fails, we return GBP unmodified (rate = 1).
 *   • If the target currency is unknown, we return GBP unmodified.
 */

interface RateCache {
  rates: Record<string, number>
  fetchedAt: number
}

let cache: RateCache | null = null
const TTL_MS = 60 * 60 * 1000 // 1 hour

/** Fetch (or return cached) GBP-based exchange rates. */
export async function getGBPRates(): Promise<Record<string, number>> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < TTL_MS) return cache.rates

  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/GBP', {
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as { rates?: Record<string, number> }
    if (!json?.rates || typeof json.rates !== 'object') throw new Error('Invalid FX payload')
    cache = { rates: json.rates, fetchedAt: now }
    return json.rates
  } catch {
    // Serve stale cache if available — better than failing the whole request
    if (cache) return cache.rates
    // Last resort fallback: treat everything as GBP
    return { GBP: 1 }
  }
}

/**
 * Convert a GBP amount to the given ISO 4217 target currency.
 *
 * Returns the original GBP amount (with currency = 'GBP') when:
 *   • targetCurrency is 'GBP' or falsy
 *   • the target currency is not in the rate table
 *   • the FX fetch fails with no cached fallback
 *
 * @param amountGBP    Amount in British pounds sterling
 * @param targetCurrency  ISO 4217 code, e.g. 'USD', 'EUR', 'JPY'
 */
export async function convertFromGBP(
  amountGBP: number,
  targetCurrency: string | null | undefined,
): Promise<{ amount: number; currency: string }> {
  const code = (targetCurrency ?? 'GBP').trim().toUpperCase()
  if (!code || code === 'GBP') return { amount: amountGBP, currency: 'GBP' }

  const rates = await getGBPRates()
  const rate = rates[code]
  if (!rate) return { amount: amountGBP, currency: 'GBP' } // unknown currency

  const converted = Math.round(amountGBP * rate * 100) / 100
  return { amount: converted, currency: code }
}
