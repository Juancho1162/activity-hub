import { createContext, useContext, useId, useLayoutEffect, useState, type ReactNode } from "react"
import { useLanguage } from "./Language"
import type { Presentation } from "../App"

const AppearanceContext = createContext<{ presentation: Presentation; choose: (value: Presentation) => void } | null>(null)
const fromUrl = (): Presentation => new URL(location.href).searchParams.get("appearance") === "classic" ? "classic" : "garden"

/** Presentation only: switching never remounts the account or stores private data. */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [presentation, setPresentation] = useState(fromUrl)
  useLayoutEffect(() => {
    document.documentElement.dataset.presentation = presentation
    const url = new URL(location.href)
    url.searchParams.set("appearance", presentation)
    history.replaceState(history.state, "", url)
  }, [presentation])
  return <AppearanceContext value={{ presentation, choose: setPresentation }}>{children}</AppearanceContext>
}
export const useAppearance = () => useContext(AppearanceContext)?.presentation ?? "garden"

export function AppearanceSelect() {
  const appearance = useContext(AppearanceContext)
  const { language } = useLanguage()
  const id = useId()
  if (!appearance) return null
  const en = language === "en"
  return <label className="appearance-picker" htmlFor={id}>
    <span className="sr-only">{en ? "Design" : "Diseño"}</span>
    <select id={id} value={appearance.presentation} onChange={event => {
      if (event.target.value === "classic" || event.target.value === "garden") appearance.choose(event.target.value)
    }}>
      <option value="garden">{en ? "Garden" : "Jardín"}</option>
      <option value="classic">{en ? "Previous" : "Anterior"}</option>
    </select>
  </label>
}
