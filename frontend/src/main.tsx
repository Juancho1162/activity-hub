import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import Landing from "./Landing"
import { ThemeProvider } from "./components/Theme"
import { LanguageProvider } from "./components/Language"
import "./index.css"
import "./charm.css"
import "./landing.css"

createRoot(document.getElementById("root")!).render(<StrictMode><LanguageProvider><ThemeProvider><Landing /></ThemeProvider></LanguageProvider></StrictMode>)
