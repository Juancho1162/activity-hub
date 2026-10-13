import { BookOpen, Briefcase, Camera, Code2, Coffee, Dumbbell, Heart, Languages, Mountain, Music, Palette, Sprout, type LucideIcon } from "lucide-react"
import { useLanguage } from "./Language"
import type { MessageKey } from "@/lib/i18n"

const icons: { id: string; label: MessageKey; glyph: LucideIcon }[] = [
  { id: "sprout", label: "Planta", glyph: Sprout },
  { id: "music", label: "Música", glyph: Music },
  { id: "book", label: "Lectura", glyph: BookOpen },
  { id: "code", label: "Código", glyph: Code2 },
  { id: "camera", label: "Fotografía", glyph: Camera },
  { id: "exercise", label: "Deporte", glyph: Dumbbell },
  { id: "languages", label: "Idiomas", glyph: Languages },
  { id: "work", label: "Trabajo", glyph: Briefcase },
  { id: "art", label: "Arte", glyph: Palette },
  { id: "coffee", label: "Café", glyph: Coffee },
  { id: "health", label: "Salud", glyph: Heart },
  { id: "nature", label: "Naturaleza", glyph: Mountain },
]
const choice = (value?: string | null) => icons.find(icon => icon.id === value) ?? icons[0]

export function FrontIcon({ icon, className = "garden-front-symbol" }: { icon?: string | null; className?: string }) {
  const selected = choice(icon), Glyph = selected.glyph
  return <span className={className} data-front-icon={selected.id} aria-hidden="true"><Glyph /></span>
}

export function FrontIconPicker({ value, disabled, group = false, onChange }: { value?: string | null; disabled: boolean; group?: boolean; onChange: (icon: string) => void }) {
  const { t } = useLanguage()
  const selected = choice(value)
  return <fieldset className="front-icon-picker" disabled={disabled}>
    <legend>{t(group ? "Icono del grupo" : "Icono del frente")}</legend>
    <p className="field-help">{t(group ? "Elige un icono para reconocer este grupo." : "Elige un icono para reconocer este frente.")}</p>
    <div className="front-icon-options">{icons.filter(icon => icon.id !== "coffee").map(({ id, label, glyph: Glyph }) => <button type="button" key={id} data-icon-option={id} aria-pressed={selected.id === id} onClick={() => onChange(id)}><Glyph aria-hidden="true" /><span>{t(label)}</span></button>)}</div>
  </fieldset>
}
