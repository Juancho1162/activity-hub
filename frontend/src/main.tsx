import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import AuthenticatedApp from "./AuthenticatedApp"
import { ThemeProvider } from "./components/Theme"
import "./index.css"
import "./charm.css"

createRoot(document.getElementById("root")!).render(<StrictMode><ThemeProvider><AuthenticatedApp /></ThemeProvider></StrictMode>)
