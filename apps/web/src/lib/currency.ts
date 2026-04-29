// Currency detection and formatting utility
// Primary source of truth: ISO 3166-1 alpha-2 country code → ISO 4217 currency code
// This map is used after GPS reverse-geocoding returns a country code.
// No per-city or per-timezone hardcoding — it works for every country automatically.

export const COUNTRY_CURRENCY: Record<string, string> = {
  // Eurozone
  AT: 'EUR', BE: 'EUR', CY: 'EUR', EE: 'EUR', FI: 'EUR', FR: 'EUR',
  DE: 'EUR', GR: 'EUR', IE: 'EUR', IT: 'EUR', LV: 'EUR', LT: 'EUR',
  LU: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SK: 'EUR', SI: 'EUR',
  ES: 'EUR', HR: 'EUR', AD: 'EUR', MC: 'EUR', SM: 'EUR', VA: 'EUR',

  // Rest of Europe
  GB: 'GBP', CH: 'CHF', NO: 'NOK', SE: 'SEK', DK: 'DKK',
  PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN',
  RS: 'RSD', BA: 'BAM', AL: 'ALL', MK: 'MKD', ME: 'EUR',
  UA: 'UAH', BY: 'BYN', RU: 'RUB', MD: 'MDL', GE: 'GEL',
  AM: 'AMD', AZ: 'AZN', IS: 'ISK',

  // Americas
  US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS',
  CL: 'CLP', CO: 'COP', PE: 'PEN', VE: 'VES', UY: 'UYU',
  PY: 'PYG', BO: 'BOB', EC: 'USD', PA: 'USD', CR: 'CRC',
  GT: 'GTQ', HN: 'HNL', SV: 'USD', NI: 'NIO', CU: 'CUP',
  DO: 'DOP', JM: 'JMD', TT: 'TTD', BB: 'BBD',

  // Asia-Pacific
  JP: 'JPY', CN: 'CNY', KR: 'KRW', IN: 'INR', AU: 'AUD',
  NZ: 'NZD', SG: 'SGD', HK: 'HKD', TW: 'TWD', TH: 'THB',
  MY: 'MYR', ID: 'IDR', PH: 'PHP', VN: 'VND', MM: 'MMK',
  KH: 'KHR', LA: 'LAK', MN: 'MNT', BD: 'BDT', PK: 'PKR',
  LK: 'LKR', NP: 'NPR', AF: 'AFN', KZ: 'KZT', UZ: 'UZS',

  // Middle East
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD',
  OM: 'OMR', IL: 'ILS', TR: 'TRY', IR: 'IRR', IQ: 'IQD',
  JO: 'JOD', LB: 'LBP', SY: 'SYP', YE: 'YER',

  // Africa
  ZA: 'ZAR', NG: 'NGN', KE: 'KES', EG: 'EGP', GH: 'GHS',
  ET: 'ETB', TZ: 'TZS', UG: 'UGX', SD: 'SDG', MA: 'MAD',
  DZ: 'DZD', TN: 'TND', LY: 'LYD', SN: 'XOF', CI: 'XOF',
  CM: 'XAF', MZ: 'MZN', ZW: 'ZWL', ZM: 'ZMW', BW: 'BWP',
}

/** ISO 4217 currency code → display symbol */
const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£',    USD: '$',    EUR: '€',    CAD: 'CA$',  AUD: 'A$',
  NZD: 'NZ$',  JPY: '¥',   CNY: '¥',   KRW: '₩',   INR: '₹',
  CHF: 'Fr',   SEK: 'kr',  NOK: 'kr',  DKK: 'kr',  ISK: 'kr',
  PLN: 'zł',   CZK: 'Kč',  HUF: 'Ft',  RON: 'lei',  BGN: 'лв',
  RSD: 'din',  HRK: 'kn',  UAH: '₴',   RUB: '₽',   GEL: '₾',
  TRY: '₺',   AED: 'د.إ', SAR: '﷼',   ILS: '₪',   QAR: 'QR',
  KWD: 'KD',   BHD: 'BD',  OMR: '﷼',   JOD: 'JD',
  SGD: 'S$',   HKD: 'HK$', TWD: 'NT$', THB: '฿',   MYR: 'RM',
  IDR: 'Rp',   PHP: '₱',   VND: '₫',   PKR: '₨',   BDT: '৳',
  MXN: 'MX$',  BRL: 'R$',  ARS: '$',   CLP: '$',   COP: '$',
  PEN: 'S/',   UYU: '$',
  ZAR: 'R',    NGN: '₦',   KES: 'KSh', EGP: 'E£',  GHS: 'GH₵',
}

/** Look up currency from an ISO 3166-1 alpha-2 country code (e.g. "LT", "GB"). */
export function getCurrencyFromCountryCode(countryCode: string): string {
  return COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? 'GBP'
}

/** Sync timezone-based fallback — used only before GPS resolves.
 *  Intentionally kept small — the GPS path handles everything else. */
export function detectCurrency(): string {
  if (typeof Intl === 'undefined') return 'GBP'
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    // Map a handful of the most common timezones so the initial render
    // is already correct for most users, before the async GPS kicks in.
    const quick: Record<string, string> = {
      'Europe/London': 'GBP', 'Europe/Dublin': 'EUR',
      'America/New_York': 'USD', 'America/Chicago': 'USD',
      'America/Denver': 'USD', 'America/Los_Angeles': 'USD',
      'America/Toronto': 'CAD', 'America/Vancouver': 'CAD',
      'Australia/Sydney': 'AUD', 'Australia/Melbourne': 'AUD',
      'Asia/Tokyo': 'JPY', 'Asia/Dubai': 'AED',
      'Asia/Singapore': 'SGD', 'Asia/Hong_Kong': 'HKD',
    }
    // For any other timezone, try to derive the country from the tz string
    // e.g. "Europe/Vilnius" → region prefix can't give country, so fall through
    if (quick[tz]) return quick[tz]
    // Intl can sometimes tell us the region
    const region = new Intl.Locale(navigator.language ?? 'en').region
    if (region) return getCurrencyFromCountryCode(region)
    return 'GBP'
  } catch {
    return 'GBP'
  }
}

export function getCurrencySymbol(currency?: string | null): string {
  const cur = currency || detectCurrency()
  return CURRENCY_SYMBOLS[cur] ?? cur
}

export function formatPrice(amount: number, currency?: string | null, showFree = true): string {
  const cur = currency || detectCurrency()
  if (amount === 0 && showFree) return 'FREE'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${getCurrencySymbol(cur)}${amount.toFixed(2)}`
  }
}
