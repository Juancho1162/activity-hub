import { createContext, useContext, useEffect, useId, useLayoutEffect, useState, type ReactNode } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/8bit/button"
import { useLanguage } from "./Language"

export type ThemePreference = "system" | "light" | "dark"
export const THEME_STORAGE_KEY = "activity-hub.theme"
const ThemeContext = createContext<{ preference: ThemePreference; resolved: "light" | "dark"; choose: (value: ThemePreference) => void } | null>(null)

const isPreference = (value: unknown): value is ThemePreference => value === "light" || value === "dark" || value === "system"
function savedPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isPreference(value) ? value : "system"
  } catch { return "system" }
}

/** Visual state only: never owns or keys authentication, editors or write intents. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(savedPreference)
  const [media] = useState(() => typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null)
  const [systemDark, setSystemDark] = useState(media?.matches ?? false)
  const resolved = preference === "system" ? (systemDark ? "dark" : "light") : preference

  useLayoutEffect(() => {
    if (!media) return
    const changed = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    setSystemDark(media.matches)
    media.addEventListener("change", changed)
    return () => media.removeEventListener("change", changed)
  }, [media])
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.documentElement.classList.toggle("dark", resolved === "dark")
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#24271F" : "#F2ECE2")
  }, [resolved])
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return
      try { if (event.storageArea !== window.localStorage) return } catch { return }
      setPreference(isPreference(event.newValue) ? event.newValue : "system")
    }
    window.addEventListener("storage", changed)
    return () => window.removeEventListener("storage", changed)
  }, [])
  function choose(value: ThemePreference) {
    if (!isPreference(value)) return
    setPreference(value)
    try { window.localStorage.setItem(THEME_STORAGE_KEY, value) } catch { /* Keep working in memory if storage is blocked/full. */ }
  }
  return <ThemeContext value={{ preference, resolved, choose }}>{children}</ThemeContext>
}

export function ThemeToggle() {
  const { t } = useLanguage()
  const theme = useContext(ThemeContext)
  if (!theme) return null
  const dark = theme.resolved === "dark"
  const label = t(dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro")
  return <Button type="button" variant="outline" size="icon" className="theme-toggle" aria-label={label} title={label} onClick={() => theme.choose(dark ? "light" : "dark")}>
    {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
  </Button>
}

export function ThemeSelect() {
  const { t } = useLanguage()
  const theme = useContext(ThemeContext)
  const id = useId()
  if (!theme) return null
  return <label className="theme-picker" htmlFor={id}><span>{t("Tema")}</span><select id={id} value={theme.preference} onChange={(event) => theme.choose(event.target.value as ThemePreference)}>
    <option value="system">{t("Sistema")}</option><option value="light">{t("Claro")}</option><option value="dark">{t("Oscuro")}</option>
  </select></label>
}
