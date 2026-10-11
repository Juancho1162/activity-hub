import { StrictMode, useLayoutEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import AuthenticatedApp from "../../../frontend/src/AuthenticatedApp"
import { LanguageProvider, useLanguage } from "../../../frontend/src/components/Language"
import { ThemeProvider } from "../../../frontend/src/components/Theme"
import { createPrivateAuthClient } from "../../../frontend/src/lib/private-auth"
import "../../../frontend/src/index.css"
import "../../../frontend/src/charm.css"
import "./garden.css"

function LocalGarden() {
  const { language } = useLanguage()
  const en = language === "en"
  const signupLanguage = useRef(language)
  signupLanguage.current = language
  const [authFactory] = useState(() => fetcher => createPrivateAuthClient(fetcher, {
    initialFronts: () => [
      { name: signupLanguage.current === "en" ? "Read" : "Leer", reference: null, state: "open", icon: "book" },
      { name: signupLanguage.current === "en" ? "Project A" : "Proyecto A", reference: null, state: "open", icon: "work" },
      { name: signupLanguage.current === "en" ? "Project B" : "Proyecto B", reference: null, state: "open", icon: "code" },
      { name: signupLanguage.current === "en" ? "Learn something" : "Aprender algo", reference: null, state: "open", icon: "sprout" },
    ],
  }))
  const [presentation, setPresentation] = useState(() => new URL(location.href).searchParams.get("appearance") === "classic" ? "classic" : "garden")
  useLayoutEffect(() => {
    document.documentElement.dataset.presentation = presentation
    const url = new URL(location.href)
    url.searchParams.set("appearance", presentation)
    history.replaceState(history.state, "", url)
  }, [presentation])
  return <>
    <div className="local-previewbar">
      <span className="local-preview-label">{en ? "Local preview · same account" : "Prueba local · misma cuenta"}</span>
      <label htmlFor="local-appearance">{en ? "Appearance" : "Diseño"}</label>
      <select id="local-appearance" value={presentation} onChange={event => setPresentation(event.target.value)}>
        <option value="garden">{en ? "Garden" : "Jardín"}</option>
        <option value="classic">{en ? "Previous interface" : "Anterior"}</option>
      </select>
      <a href="http://127.0.0.1:5174/?v=jardin">{en ? "Design demo" : "Demo visual"}</a>
    </div>
    <AuthenticatedApp presentation={presentation} authFactory={authFactory} signupWithExamples />
  </>
}
createRoot(document.getElementById("root")).render(<StrictMode><LanguageProvider><ThemeProvider><LocalGarden /></ThemeProvider></LanguageProvider></StrictMode>)
