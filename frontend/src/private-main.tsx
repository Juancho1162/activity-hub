import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import AuthenticatedApp from "./AuthenticatedApp"
import { ThemeProvider } from "./components/Theme"
import { LanguageProvider } from "./components/Language"
import "./index.css"
import "./charm.css"

createRoot(document.getElementById("root")!).render(<StrictMode><LanguageProvider><ThemeProvider><AuthenticatedApp /></ThemeProvider></LanguageProvider></StrictMode>)
