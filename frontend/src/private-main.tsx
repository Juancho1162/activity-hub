import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import PrivateApp from "./PrivateApp"
import { ThemeProvider } from "./components/Theme"
import { LanguageProvider } from "./components/Language"
import "./index.css"
import "./charm.css"
import "./garden.css"

document.documentElement.dataset.presentation = "garden"

createRoot(document.getElementById("root")!).render(<StrictMode><LanguageProvider><ThemeProvider><PrivateApp /></ThemeProvider></LanguageProvider></StrictMode>)
