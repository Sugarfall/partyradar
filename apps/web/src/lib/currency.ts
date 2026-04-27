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
  'Europe/Vilnius': 'EUR',
  'Europe/Riga': 'EUR',
  'Europe/Tallinn': 'EUR',
  'Europe/Helsinki': 'EUR',
  'Europe/Lisbon': 'EUR',
  'Europe/Athens': 'EUR',
  'Europe/Bucharest': 'RON',
  'Europe/Budapest': 'HUF',
  'Europe/Prague': 'CZK',
  'Europe/Kiev': 'UAH',
  'Europe/Moscow': 'RUB',
  'America/Mexico_City': 'MXN',
  'America/Sao_Paulo': 'BRL',
  'America/Buenos_Aires': 'ARS',
  'Asia/Kolkata': 'INR',
  'Asia/Shanghai': 'CNY',
  'Asia/Seoul': 'KRW',
  'Asia/Bangkok': 'THB',
  'Africa/Johannesburg': 'ZAR',
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
    RON: 'lei', HUF: 'Ft', CZK: 'Kč', UAH: '₴', RUB: '₽',
    MXN: 'MX$', BRL: 'R$', ARS: '$', INR: '₹', CNY: '¥',
    KRW: '₩', THB: '฿', ZAR: 'R',
  }
  return symbols[cur] ?? '£'
}
