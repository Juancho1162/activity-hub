import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import PublicApp from "./PublicApp"
import { AppearanceProvider } from "./components/Appearance"
import { ThemeProvider } from "./components/Theme"
import { LanguageProvider } from "./components/Language"
import "./index.css"
import "./charm.css"
import "./garden.css"
import "./landing.css"
import "./garden-landing.css"

createRoot(document.getElementById("root")!).render(<StrictMode><LanguageProvider><ThemeProvider><AppearanceProvider><PublicApp /></AppearanceProvider></ThemeProvider></LanguageProvider></StrictMode>)
