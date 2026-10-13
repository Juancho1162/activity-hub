import { useRef, useState } from "react"
import AuthenticatedApp from "./AuthenticatedApp"
import { useLanguage } from "./components/Language"
import { createPrivateAuthClient } from "./lib/private-auth"
import { basicGroupDrafts } from "./lib/group-defaults"
import type { AuthClient } from "./lib/auth"

export default function PrivateApp() {
  const { language } = useLanguage()
  const signupLanguage = useRef(language)
  signupLanguage.current = language
  const [authFactory] = useState<(fetcher: typeof fetch) => AuthClient>(() => (fetcher: typeof fetch) => createPrivateAuthClient(fetcher, {
    initialData: () => {
      const language = signupLanguage.current
      const groups = basicGroupDrafts(language).map(group => ({ ...group, id: crypto.randomUUID() }))
      const projects = groups[1].id, learning = groups[2].id
      return { groups, fronts: [
        { name: language === "en" ? "Read" : "Leer", reference: null, state: "open", icon: "book", group_id: learning },
        { name: language === "en" ? "Project A" : "Proyecto A", reference: null, state: "open", icon: "work", group_id: projects },
        { name: language === "en" ? "Project B" : "Proyecto B", reference: null, state: "open", icon: "code", group_id: projects },
        { name: language === "en" ? "Learn something" : "Aprender algo", reference: null, state: "open", icon: "sprout", group_id: learning },
      ] }
    },
  }))
  return <AuthenticatedApp presentation="garden" authFactory={authFactory} signupWithExamples />
}
