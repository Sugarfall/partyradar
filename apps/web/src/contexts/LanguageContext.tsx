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

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('en')

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Language | null
      if (stored === 'en' || stored === 'pl') setLangState(stored)
    } catch {}
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
