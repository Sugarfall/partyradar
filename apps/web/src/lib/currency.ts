/**
 * Currency formatting utilities.
 * Prices are stored in GBP pounds (e.g. 15 = £15, 9.99 = £9.99).
 */

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/**
 * Format a price in pounds to a display string.
 * Returns "Free" for zero, otherwise e.g. "£15" or "£9.99".
 */
export function formatPrice(pounds: number): string {
  if (!pounds || pounds === 0) return 'Free'
  return GBP.format(pounds)
}
