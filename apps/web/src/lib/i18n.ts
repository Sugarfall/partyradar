// PartyRadar — bilingual translation dictionary
// Supported languages: English (en) · Polish (pl)
// To add more languages: extend the Language type and add entries below.

export type Language = 'en' | 'pl'

export const LANGUAGE_META: Record<Language, { name: string; nativeName: string; flag: string }> = {
  en: { name: 'English',  nativeName: 'English', flag: '🇬🇧' },
  pl: { name: 'Polish',   nativeName: 'Polski',  flag: '🇵🇱' },
}

// Translation map — add new strings here as the app grows
export const T: Record<string, Record<Language, string>> = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  'register.title':              { en: 'CREATE ACCOUNT',        pl: 'UTWÓRZ KONTO' },
  'register.google':             { en: 'CONTINUE WITH GOOGLE',  pl: 'KONTYNUUJ Z GOOGLE' },
  'register.apple':              { en: 'CONTINUE WITH APPLE',   pl: 'KONTYNUUJ Z APPLE' },
  'register.email':              { en: 'EMAIL',                  pl: 'EMAIL' },
  'register.password':           { en: 'PASSWORD',               pl: 'HASŁO' },
  'register.password.min':       { en: 'Min. 6 characters',      pl: 'Min. 6 znaków' },
  'register.continue':           { en: 'CONTINUE',               pl: 'DALEJ' },
  'register.creating':           { en: 'CREATING...',            pl: 'TWORZENIE...' },
  'register.has_account':        { en: 'Already have an account?', pl: 'Masz już konto?' },
  'register.login':              { en: 'LOG IN',                 pl: 'ZALOGUJ SIĘ' },
  'register.verify.title':       { en: 'CHECK YOUR INBOX',       pl: 'SPRAWDŹ SKRZYNKĘ' },
  'register.verify.subtitle':    { en: 'ALMOST THERE',           pl: 'PRAWIE GOTOWE' },
  'register.verify.body':        { en: 'Click the link, then come back here.', pl: 'Kliknij link, a potem wróć tutaj.' },
  'register.verified':           { en: "I'VE VERIFIED MY EMAIL", pl: 'ZWERYFIKOWAŁEM EMAIL' },
  'register.checking':           { en: 'CHECKING...',            pl: 'SPRAWDZANIE...' },
  'register.resend':             { en: 'RESEND VERIFICATION EMAIL', pl: 'WYŚLIJ LINK PONOWNIE' },
  'register.resend.wait':        { en: 'RESEND IN {n}s',         pl: 'WYŚLIJ ZA {n}s' },
  'register.gender.title':       { en: 'ONE MORE THING',         pl: 'JESZCZE JEDNA RZECZ' },
  'register.gender.subtitle':    { en: 'This helps hosts see who\'s coming', pl: 'To pomaga organizatorom wiedzieć kto przychodzi' },
  'register.gender.man':         { en: 'MAN',                    pl: 'MĘŻCZYZNA' },
  'register.gender.woman':       { en: 'WOMAN',                  pl: 'KOBIETA' },
  'register.gender.non_binary':  { en: 'NON-BINARY',             pl: 'NIEBINARNE' },
  'register.gender.prefer_not':  { en: 'PREFER NOT TO SAY',      pl: 'WOLĘ NIE MÓWIĆ' },
  'register.enter_radar':        { en: 'ENTER THE RADAR',        pl: 'WEJDŹ NA RADAR' },
  'register.select_continue':    { en: 'SELECT TO CONTINUE',     pl: 'WYBIERZ, ABY KONTYNUOWAĆ' },
  'register.skip':               { en: 'SKIP FOR NOW →',         pl: 'POMIŃ NA RAZIE →' },
  'register.account_created':    { en: 'ACCOUNT CREATED ✓',      pl: 'KONTO UTWORZONE ✓' },
  'register.lang.title':         { en: 'CHOOSE YOUR LANGUAGE',   pl: 'WYBIERZ JĘZYK' },
  'register.lang.subtitle':      { en: 'You can change this anytime in settings', pl: 'Możesz zmienić to w ustawieniach' },

  // ── Navigation ────────────────────────────────────────────────────────────
  'nav.home':        { en: 'Home',        pl: 'Strona główna' },
  'nav.discover':    { en: 'Discover',    pl: 'Odkryj' },
  'nav.events':      { en: 'Events',      pl: 'Imprezy' },
  'nav.messages':    { en: 'Messages',    pl: 'Wiadomości' },
  'nav.profile':     { en: 'Profile',     pl: 'Profil' },
  'nav.settings':    { en: 'Settings',    pl: 'Ustawienia' },
  'nav.wallet':      { en: 'Wallet',      pl: 'Portfel' },
  'nav.leaderboard': { en: 'Leaderboard', pl: 'Ranking' },
  'nav.tickets':     { en: 'My Tickets',  pl: 'Moje Bilety' },
  'nav.earn':        { en: 'Earn',        pl: 'Zarabiaj' },
  'nav.referrals':   { en: 'Referrals',   pl: 'Polecenia' },
  'nav.dashboard':   { en: 'Dashboard',   pl: 'Panel' },
  'nav.create':      { en: 'Create Event', pl: 'Utwórz Imprezę' },
  'nav.menu':        { en: 'Menu',        pl: 'Menu' },

  // ── Discover page ─────────────────────────────────────────────────────────
  'discover.nearby':      { en: 'Nearby',           pl: 'W pobliżu' },
  'discover.tonight':     { en: 'Tonight',          pl: 'Dziś wieczór' },
  'discover.venues':      { en: 'Venues',           pl: 'Miejsca' },
  'discover.events':      { en: 'Events',           pl: 'Imprezy' },
  'discover.free':        { en: 'FREE',             pl: 'BEZPŁATNE' },
  'discover.live':        { en: '● LIVE',           pl: '● NA ŻYWO' },
  'discover.going':       { en: '{n} going',        pl: '{n} idzie' },
  'discover.friends':     { en: '{n} friends',      pl: '{n} znajomych' },
  'discover.no_events':   { en: 'No events found',  pl: 'Brak imprez' },
  'discover.locating':    { en: 'LOCATING YOU',     pl: 'LOKALIZOWANIE' },
  'discover.search_city': { en: 'Search for a city…', pl: 'Szukaj miasta…' },

  // ── Profile ───────────────────────────────────────────────────────────────
  'profile.edit':           { en: 'EDIT',              pl: 'EDYTUJ' },
  'profile.close':          { en: 'CLOSE',             pl: 'ZAMKNIJ' },
  'profile.save':           { en: 'SAVE',              pl: 'ZAPISZ' },
  'profile.saving':         { en: 'SAVING...',         pl: 'ZAPISYWANIE...' },
  'profile.followers':      { en: 'FOLLOWERS',         pl: 'OBSERWUJĄCY' },
  'profile.following':      { en: 'FOLLOWING',         pl: 'OBSERWUJE' },
  'profile.events':         { en: 'EVENTS',            pl: 'IMPREZY' },
  'profile.score':          { en: 'SCORE',             pl: 'WYNIK' },
  'profile.bio':            { en: 'BIO',               pl: 'BIO' },
  'profile.going_out':      { en: 'Going Out Tonight?', pl: 'Wychodzisz Dziś Wieczór?' },
  'profile.wants_out':      { en: 'Wants to Go Out?',  pl: 'Chcesz Wyjść?' },
  'profile.wants_out.sub':  { en: 'AI picks the best bars & clubs + suggests a meetup time', pl: 'AI poleca najlepsze bary i kluby + sugeruje godzinę spotkania' },

  // ── Settings ──────────────────────────────────────────────────────────────
  'settings.title':         { en: 'SETTINGS',          pl: 'USTAWIENIA' },
  'settings.language':      { en: 'App Language',      pl: 'Język Aplikacji' },
  'settings.language.sub':  { en: 'Change the language used throughout the app', pl: 'Zmień język używany w aplikacji' },

  // ── Common ────────────────────────────────────────────────────────────────
  'common.rsvp':    { en: 'RSVP',           pl: 'RSVP' },
  'common.free':    { en: 'Free',           pl: 'Bezpłatnie' },
  'common.or':      { en: 'OR',             pl: 'LUB' },
  'common.cancel':  { en: 'CANCEL',         pl: 'ANULUJ' },
  'common.send':    { en: 'SEND',           pl: 'WYŚLIJ' },
  'common.follow':  { en: 'FOLLOW',         pl: 'OBSERWUJ' },
  'common.message': { en: 'MESSAGE',        pl: 'WIADOMOŚĆ' },
  'common.loading': { en: 'LOADING',        pl: 'ŁADOWANIE' },
  'common.error':   { en: 'Something went wrong', pl: 'Coś poszło nie tak' },
  'common.back':    { en: '← GO BACK',      pl: '← WRÓĆ' },
  'common.logout':  { en: 'LOG OUT',        pl: 'WYLOGUJ SIĘ' },
  'common.save':    { en: 'SAVE',           pl: 'ZAPISZ' },
  'common.score':   { en: 'SCORE',          pl: 'WYNIK' },
}

/**
 * Translate a key using the given language.
 * If the key is missing, returns the key itself as fallback.
 * Supports simple token substitution: {n}, {city}, etc.
 */
export function t(key: string, lang: Language, replacements?: Record<string, string | number>): string {
  const entry = T[key]
  let str = entry?.[lang] ?? entry?.['en'] ?? key
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      str = str.replace(`{${k}}`, String(v))
    }
  }
  return str
}
