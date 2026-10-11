import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import PublicApp from "./PublicApp"
import { ThemeProvider } from "./components/Theme"
import { LanguageProvider } from "./components/Language"
import "./index.css"
import "./charm.css"
import "./garden.css"
import "./garden-landing.css"

document.documentElement.dataset.presentation = "garden"

createRoot(document.getElementById("root")!).render(<StrictMode><LanguageProvider><ThemeProvider><PublicApp /></ThemeProvider></LanguageProvider></StrictMode>)
