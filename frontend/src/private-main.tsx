import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import PrivateApp from "./PrivateApp"
import { AppearanceProvider } from "./components/Appearance"
import { ThemeProvider } from "./components/Theme"
import { LanguageProvider } from "./components/Language"
import "./index.css"
import "./charm.css"
import "./garden.css"

createRoot(document.getElementById("root")!).render(<StrictMode><LanguageProvider><ThemeProvider><AppearanceProvider><PrivateApp /></AppearanceProvider></ThemeProvider></LanguageProvider></StrictMode>)
