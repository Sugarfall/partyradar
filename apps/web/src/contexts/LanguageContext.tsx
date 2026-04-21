'use client'

import { createContext, useContext, useState, useEffect, createElement } from 'react'
import type { ReactNode } from 'react'
import type { Language } from '@/lib/i18n'
import { t as translate } from '@/lib/i18n'

const STORAGE_KEY = 'partyradar_language'

interface LanguageContextValue {
  lang: Language
  setLang: (l: Language) => void
  t: (key: string, replacements?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
})

/** Best-effort locale detection from the browser.
 *
 *  We check `navigator.languages` (ordered preference list) and the timezone,
 *  so a Polish user with an English OS gets English, and an English user
 *  travelling through Warsaw doesn't get silently switched. Only Polish is
 *  currently offered — anything else falls through to English.
 */
function detectBrowserLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en'
  const prefs = (navigator.languages?.length ? navigator.languages : [navigator.language])
    .filter(Boolean)
    .map((l) => l.toLowerCase())
  if (prefs.some((l) => l.startsWith('pl'))) return 'pl'

  // Secondary signal — timezone. Only used if the browser locale didn't help.
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
    if (tz === 'Europe/Warsaw') return 'pl'
  } catch {
    /* noop */
  }
  return 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('en')

  // Hydrate from localStorage (user preference) — else detect from browser.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Language | null
      if (stored === 'en' || stored === 'pl') {
        setLangState(stored)
        return
      }
      const detected = detectBrowserLanguage()
      setLangState(detected)
      try { localStorage.setItem(STORAGE_KEY, detected) } catch { /* noop */ }
    } catch {
      /* noop — default 'en' already applied */
    }
  }, [])

  function setLang(l: Language) {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch {}
  }

  const tFn = (key: string, replacements?: Record<string, string | number>) =>
    translate(key, lang, replacements)

  return createElement(
    LanguageContext.Provider,
    { value: { lang, setLang, t: tFn } },
    children,
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
