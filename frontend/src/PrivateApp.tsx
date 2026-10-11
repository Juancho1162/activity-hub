import { useRef, useState } from "react"
import AuthenticatedApp from "./AuthenticatedApp"
import { useLanguage } from "./components/Language"
import { useAppearance } from "./components/Appearance"
import { createPrivateAuthClient } from "./lib/private-auth"
import type { AuthClient } from "./lib/auth"

export default function PrivateApp() {
  const { language } = useLanguage()
  const presentation = useAppearance()
  const signupLanguage = useRef(language)
  signupLanguage.current = language
  const [authFactory] = useState<(fetcher: typeof fetch) => AuthClient>(() => (fetcher: typeof fetch) => createPrivateAuthClient(fetcher, {
    initialFronts: () => [
      { name: signupLanguage.current === "en" ? "Read" : "Leer", reference: null, state: "open", icon: "book" },
      { name: signupLanguage.current === "en" ? "Project A" : "Proyecto A", reference: null, state: "open", icon: "work" },
      { name: signupLanguage.current === "en" ? "Project B" : "Proyecto B", reference: null, state: "open", icon: "code" },
      { name: signupLanguage.current === "en" ? "Learn something" : "Aprender algo", reference: null, state: "open", icon: "sprout" },
    ],
  }))
  return <AuthenticatedApp presentation={presentation} authFactory={authFactory} signupWithExamples />
}
