import { createContext, useContext, useId, useLayoutEffect, useState, type ReactNode } from "react"
import { ThemeSelect } from "@/components/Theme"

type Look = "base" | "charm"
const LookContext = createContext<{ look: Look; choose: (look: Look) => void } | null>(null)

/** Visual-only state. No keys, data ownership, storage or activity queries. */
export function LookProvider({ children }: { children: ReactNode }) {
  const [look, setLook] = useState<Look>("charm")
  useLayoutEffect(() => { document.documentElement.dataset.look = look }, [look])
  return <LookContext value={{ look, choose: (next) => { if (next === "base" || next === "charm") setLook(next) } }}>{children}</LookContext>
}

export function LookSelect() {
  const context = useContext(LookContext)
  const id = useId()
  if (!context) return null
  return <label className="look-picker" htmlFor={id}><span>Aspecto</span><select id={id} value={context.look} onChange={(event) => context.choose(event.target.value as Look)}>
    <option value="base">Base 8-bit</option><option value="charm">Con encanto</option>
  </select></label>
}

// Background controls are inert while a Radix modal is open. These instances
// share the providers, and root datasets style both portalled dialogs.
export function DialogVisualControls() {
  return <div className="dialog-visual-controls"><LookSelect /><ThemeSelect /></div>
}
