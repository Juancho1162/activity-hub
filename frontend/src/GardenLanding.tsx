import { useState } from "react"
import { ArrowRight, BookOpen, CalendarDays, Check, Leaf, LockKeyhole, Music, RotateCcw } from "lucide-react"
import { LanguageSelect, useLanguage } from "@/components/Language"
import { GitHubMark } from "./components/GitHubMark"
import { ThemeToggle } from "@/components/Theme"
import { FrontIcon } from "@/components/FrontIcon"
import { Button } from "@/components/ui/8bit/button"
import { formatDay, todayInMadrid } from "@/lib/dates"

const words = {
  es: {
    edition: "ACTIVITY HUB / EDICIÓN JARDÍN", title: "Dale espacio", before: "a lo que", grows: "crece.",
    lead: "Tus proyectos, estudios y aficiones. Un lugar para registrar los días que les dedicas y volver a mirar con perspectiva.",
    how: "Cómo funciona", privacy: "Tu privacidad", fine: "Tu espacio privado, sin usuario ni correo.",
    caption: "Un poco de espacio para lo que importa.", guitar: "Aprender guitarra", project: "Mi proyecto personal", read: "Leer sin prisa",
    small: "UN GESTO PEQUEÑO", todayGuitar: "Hoy guitarra.", tomorrow: "Mañana,", see: "ya veremos.",
    copy: "No hace falta convertir cada afición en un objetivo. Marca los días que le dedicas tiempo y conserva el hilo de lo que te importa.",
    try: "Prueba los checks. Esta vista es interactiva.", sample: "Ejemplo", sampleLabel: "Registro de ejemplo", sampleCheck: "Ejemplo: actividad en",
    sampleNote: "Datos ficticios. Los cambios de esta muestra no se guardan.", reset: "Reiniciar ejemplo",
    steps: [["Haz sitio", "Organiza tus frentes. Ábrelos, déjalos en pausa o archívalos."], ["Deja una huella", "Un check por día. También puedes volver a un día pasado."], ["Mira con perspectiva", "Consulta tus registros sin objetivos ni puntuaciones."]],
    privateTitle: "Tu espacio. Tu código.", privateCopy: "Tu contenido se cifra en el navegador. Accedes con un único código privado, sin usuario ni correo.",
    code: "Guarda tu código: no hay recuperación.", footer: "Un registro sencillo, a tu ritmo.",
  },
  en: {
    edition: "ACTIVITY HUB / GARDEN EDITION", title: "Make room", before: "for what", grows: "grows.",
    lead: "Your projects, studies and hobbies. A place to record the days you spend on them and look back with perspective.",
    how: "How it works", privacy: "Your privacy", fine: "Your private space, without a username or email.",
    caption: "A little space for what matters.", guitar: "Learn guitar", project: "My personal project", read: "Read at your own pace",
    small: "A SMALL GESTURE", todayGuitar: "Guitar today.", tomorrow: "Tomorrow,", see: "we'll see.",
    copy: "Not every hobby needs to become a goal. Mark the days you spend on it and keep a thread of what matters to you.",
    try: "Try the checkboxes. This preview is interactive.", sample: "Example", sampleLabel: "Example activity log", sampleCheck: "Example: activity in",
    sampleNote: "Fictional data. Changes to this preview are not saved.", reset: "Reset example",
    steps: [["Make space", "Organise your focus areas. Keep them open, pause them or archive them."], ["Leave a trace", "One check per day. You can also return to a past day."], ["Look back", "Explore your records without targets or scores."]],
    privateTitle: "Your space. Your code.", privateCopy: "Your content is encrypted in your browser. Access it with one private code, without a username or email.",
    code: "Save your code: there is no recovery.", footer: "A simple record, at your own pace.",
  },
}
const initialMarks = () => new Set(["guitar", "read"])

/** Public demonstration only: no auth client, account reads or persisted activity. */
export default function GardenLanding() {
  const { language, locale, t } = useLanguage()
  const copy = words[language]
  const [today] = useState(todayInMadrid)
  const [marked, setMarked] = useState(initialMarks)
  const examples = [["guitar", "music", copy.guitar], ["project", "code", copy.project], ["read", "book", copy.read]]
  return <div className="garden-landing">
    <a className="skip-link" href="#contenido">{t("Ir al contenido")}</a>
    <header className="garden-landing-header">
      <a className="garden-landing-brand" href="/" aria-label="Activity Hub"><img src="/plant-logo-static.svg" width="35" height="42" alt="" /><span><strong>activity</strong>hub<span className="garden-brand-dot">.</span></span></a>
      <nav className="garden-landing-nav" aria-label={copy.how}><a href="#como-funciona">{copy.how}</a><a href="#privacidad">{copy.privacy}</a><a href="https://github.com/Juancho1162/activity-hub"><GitHubMark />{t("Código fuente")}</a></nav>
      <div className="garden-landing-controls"><LanguageSelect /><ThemeToggle /></div>
    </header>
    <main id="contenido">
      <section className="garden-landing-hero" aria-labelledby="garden-landing-title">
        <div className="garden-landing-intro">
          <p className="garden-landing-eyebrow">{copy.edition}</p>
          <h1 id="garden-landing-title">{copy.title}<br />{copy.before} <em>{copy.grows}</em></h1>
          <p className="garden-landing-description">{copy.lead}</p>
          <div className="garden-landing-actions"><Button asChild><a href="/app/?appearance=garden">{t("Empezar")}<ArrowRight aria-hidden="true" size={18} /></a></Button><a className="garden-existing-account" href="/app/?appearance=garden">{t("Ya tengo cuenta")}</a></div>
          <p className="garden-landing-fine">{copy.fine}</p>
        </div>
        <div className="garden-landing-art" aria-hidden="true">
          <div className="garden-art-orbit garden-orbit-one" /><div className="garden-art-orbit garden-orbit-two" />
          <img className="garden-art-plant" src="/plant-logo-static.svg" width="170" height="200" alt="" />
          <span className="garden-floating-note garden-note-one"><Music />{copy.guitar}<Check size={16} /></span>
          <span className="garden-floating-note garden-note-two"><BookOpen />{copy.read}<i /></span>
          <span className="garden-art-caption">{copy.caption}</span>
        </div>
      </section>
      <section className="garden-landing-live" id="como-funciona" aria-labelledby="garden-live-title">
        <div className="garden-live-copy"><p className="garden-landing-eyebrow">{copy.small}</p><h2 id="garden-live-title">{copy.todayGuitar}<br />{copy.tomorrow} <em>{copy.see}</em></h2><p>{copy.copy}</p><span><Leaf aria-hidden="true" size={16} />{copy.try}</span></div>
        <div className="garden-demo-window" role="group" aria-label={copy.sampleLabel}>
          <div className="garden-demo-heading"><span><CalendarDays aria-hidden="true" size={16} />{t("Hoy")}<time dateTime={today}>{formatDay(today, false, locale)}</time></span><span className="garden-demo-badge">{copy.sample}</span></div>
          {examples.map(([id, icon, name]) => <div className="garden-demo-row" key={id}><FrontIcon icon={icon} /><span>{name}</span><button type="button" role="checkbox" className="garden-demo-check" aria-checked={marked.has(id)} aria-label={`${copy.sampleCheck} ${name}`} onClick={() => setMarked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })}><span aria-hidden="true">{marked.has(id) && <Check size={16} />}</span></button></div>)}
          <div className="garden-demo-footer"><p>{copy.sampleNote}</p><button type="button" className="garden-demo-reset" onClick={() => setMarked(initialMarks())}><RotateCcw aria-hidden="true" size={15} />{copy.reset}</button></div>
        </div>
      </section>
      <ol className="garden-landing-pillars">{copy.steps.map(([title, description], index) => <li key={index}><span aria-hidden="true">0{index + 1}</span><h2>{title}</h2><p>{description}</p></li>)}</ol>
      <section className="garden-landing-privacy" id="privacidad" aria-labelledby="garden-privacy-title"><div><LockKeyhole aria-hidden="true" size={22} /><h2 id="garden-privacy-title">{copy.privateTitle}</h2></div><div><p>{copy.privateCopy}</p><p className="garden-code-note">{copy.code}</p></div></section>
    </main>
    <footer className="garden-landing-footer"><span>Activity Hub</span><span>{copy.footer}</span></footer>
  </div>
}
