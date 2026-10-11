import { StrictMode, useLayoutEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import OriginalLanding from "../../../frontend/src/Landing"
import { LanguageProvider, useLanguage } from "../../../frontend/src/components/Language"
import { ThemeProvider } from "../../../frontend/src/components/Theme"
import GardenLanding from "./Landing"
import "../../../frontend/src/index.css"
import "../../../frontend/src/charm.css"
import "../../../frontend/src/landing.css"
import "./garden.css"
import "./landing.css"

function LocalLanding() {
  const { language } = useLanguage()
  const en = language === "en"
  const [presentation, setPresentation] = useState(() => new URL(location.href).searchParams.get("appearance") === "classic" ? "classic" : "garden")
  useLayoutEffect(() => {
    document.documentElement.dataset.presentation = presentation
    const url = new URL(location.href)
    url.searchParams.set("appearance", presentation)
    history.replaceState(history.state, "", url)
  }, [presentation])
  return <>
    <div className="local-previewbar">
      <span className="local-preview-label">{en ? "Local preview · landing" : "Prueba local · portada"}</span>
      <label htmlFor="local-appearance">{en ? "Appearance" : "Diseño"}</label>
      <select id="local-appearance" value={presentation} onChange={event => setPresentation(event.target.value)}><option value="garden">{en ? "Garden" : "Jardín"}</option><option value="classic">{en ? "Previous interface" : "Anterior"}</option></select>
    </div>
    {presentation === "garden" ? <GardenLanding /> : <OriginalLanding />}
  </>
}
createRoot(document.getElementById("root")).render(<StrictMode><LanguageProvider><ThemeProvider><LocalLanding /></ThemeProvider></LanguageProvider></StrictMode>)
