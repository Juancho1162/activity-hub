import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useState, type ReactNode } from "react"
import { Globe } from "lucide-react"
import { errorText, isLanguage, LANGUAGE_STORAGE_KEY, locales, text, type Language } from "@/lib/i18n"

function browserLanguage(): Language {
  for (const value of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const language = value?.toLowerCase().split("-")[0]
    if (isLanguage(language)) return language
  }
  return "es"
}
function savedLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (isLanguage(saved)) return saved
  } catch { /* Language selection still works without storage. */ }
  return browserLanguage()
}
function translators(language: Language) {
  return { language, locale: locales[language], t: (source: Parameters<typeof text>[1], values?: Parameters<typeof text>[2]) => text(language, source, values), message: (source: string) => errorText(language, source) }
}
const fallback = translators("es")
const LanguageContext = createContext<(ReturnType<typeof translators> & { choose: (language: Language) => void }) | null>(null)

/** Display preference only; never owns or keys accounts, drafts or writes. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState(savedLanguage)
  useLayoutEffect(() => {
    document.documentElement.lang = language
    document.title = text(language, "Activity Hub · Tu registro de actividad")
  }, [language])
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== LANGUAGE_STORAGE_KEY && event.key !== null) return
      try { if (event.storageArea !== localStorage) return } catch { return }
      setLanguage(isLanguage(event.newValue) ? event.newValue : browserLanguage())
    }
    window.addEventListener("storage", changed)
    return () => window.removeEventListener("storage", changed)
  }, [])
  const value = useMemo(() => ({ ...translators(language), choose(next: Language) {
    if (!isLanguage(next)) return
    setLanguage(next)
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next) } catch { /* Keep the choice in memory. */ }
  } }), [language])
  return <LanguageContext value={value}>{children}</LanguageContext>
}

export const useLanguage = () => useContext(LanguageContext) ?? fallback

export function LanguageSelect() {
  const context = useContext(LanguageContext)
  const id = useId()
  if (!context) return null
  const label = context.t("Idioma")
  return <label className="language-picker" htmlFor={id} title={label}><Globe aria-hidden="true" size={18} /><span className="sr-only">{label}</span><select id={id} value={context.language} onChange={event => context.choose(event.target.value as Language)}>
    <option value="es" lang="es">Español</option><option value="en" lang="en">English</option>
  </select></label>
}
