// Currency detection and formatting utility

const TIMEZONE_CURRENCY_MAP: Record<string, string> = {
  'Europe/London': 'GBP',
  'Europe/Dublin': 'EUR',
  'Europe/Paris': 'EUR',
  'Europe/Berlin': 'EUR',
  'Europe/Madrid': 'EUR',
  'Europe/Rome': 'EUR',
  'Europe/Amsterdam': 'EUR',
  'Europe/Brussels': 'EUR',
  'Europe/Warsaw': 'PLN',
  'Europe/Stockholm': 'SEK',
  'Europe/Oslo': 'NOK',
  'Europe/Copenhagen': 'DKK',
  'Europe/Zurich': 'CHF',
  'America/New_York': 'USD',
  'America/Chicago': 'USD',
  'America/Denver': 'USD',
  'America/Los_Angeles': 'USD',
  'America/Toronto': 'CAD',
  'America/Vancouver': 'CAD',
  'Australia/Sydney': 'AUD',
  'Australia/Melbourne': 'AUD',
  'Asia/Dubai': 'AED',
  'Asia/Singapore': 'SGD',
  'Asia/Tokyo': 'JPY',
  'Asia/Hong_Kong': 'HKD',
}

export function detectCurrency(): string {
  if (typeof Intl === 'undefined') return 'GBP'
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return TIMEZONE_CURRENCY_MAP[tz] ?? 'GBP'
  } catch {
    return 'GBP'
  }
}

export function formatPrice(amount: number, currency?: string | null): string {
  const cur = currency || detectCurrency()
  if (amount === 0) return 'FREE'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    // Fallback if currency code is invalid
    return `£${amount.toFixed(2)}`
  }
}

export function getCurrencySymbol(currency?: string | null): string {
  const cur = currency || detectCurrency()
  const symbols: Record<string, string> = {
    GBP: '£', USD: '$', EUR: '€', CAD: 'CA$', AUD: 'A$',
    JPY: '¥', CHF: 'Fr', SEK: 'kr', NOK: 'kr', DKK: 'kr',
    PLN: 'zł', AED: 'د.إ', SGD: 'S$', HKD: 'HK$',
  }
  return symbols[cur] ?? '£'
}
