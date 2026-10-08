import { ArrowRight, Check, LockKeyhole } from "lucide-react"
import { LanguageSelect, useLanguage } from "@/components/Language"
import { ThemeToggle } from "@/components/Theme"
import { PlantLogo } from "@/components/PlantLogo"
import { Button } from "@/components/ui/8bit/button"

/** Public, illustrative product page. No auth client, account state or API. */
export default function Landing() {
  const { t, language } = useLanguage()
  return <div className="landing">
    <a className="skip-link" href="#contenido">{t("Ir al contenido")}</a>
    <header className="landing-header">
      <div className="landing-brand"><PlantLogo /><span>Activity Hub</span></div>
      <nav className="landing-nav" aria-label={t("Navegación pública")}>
        <a href="/app/">{t("Ya tengo cuenta")}</a>
      </nav>
      <div className="app-controls landing-controls"><LanguageSelect /><ThemeToggle /></div>
    </header>
    <main id="contenido">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-intro">
          <p className="landing-eyebrow">{t("UN ESPACIO PARA TUS FRENTES")}</p>
          <h1 id="landing-title">{t("Tus proyectos, estudios y aficiones,")} <span>{t("en un mismo lugar.")}</span></h1>
          <p className="landing-lead">{t("Organiza lo que te importa. Marca los días que le dedicas tiempo y observa tu actividad.")}</p>
          <div className="landing-actions"><Button asChild><a href="/app/">{t("Empezar")}<ArrowRight aria-hidden="true" size={16} /></a></Button><a className="landing-secondary" href="/app/">{t("Ya tengo cuenta")}</a></div>
        </div>
        <figure className="landing-demo" aria-label={t("Ejemplo ilustrativo de un registro de actividad")}>
          <figcaption className="landing-demo-header"><span>{t("Tu registro")}</span><span className="landing-example">{t("Ejemplo")}</span></figcaption>
          <ul className="landing-demo-fronts">
            {[{ name: "Guitarra", state: "Abierto", marked: true }, { name: "Un curso", state: "Standby", marked: false }, { name: "Un proyecto", state: "Abierto", marked: true }].map(front => <li key={front.name}>
              <div><span className="landing-front-name">{t(front.name as "Guitarra" | "Un curso" | "Un proyecto")}</span><span className={`landing-state ${front.state === "Standby" ? "is-standby" : ""}`}>{t(front.state as "Abierto" | "Standby")}</span></div>
              <span className={`landing-demo-check${front.marked ? " is-marked" : ""}`} aria-hidden="true">{front.marked && <Check />}</span>
              <span className="sr-only">{t(front.marked ? "Actividad registrada" : "Sin actividad registrada")}</span>
            </li>)}
          </ul>
          <div className="landing-demo-week" aria-hidden="true">{["L", "M", "X", "J", "V", "S", "D"].map((day, index) => <span key={index} className={[0, 2, 4].includes(index) ? "is-marked" : ""}>{language === "es" ? day : ["M", "T", "W", "T", "F", "S", "S"][index]}<span>{[0, 2, 4].includes(index) ? <Check /> : <span className="landing-day-dot" />}</span></span>)}</div>
          <p className="landing-demo-caption">{t("Cada marca, un día de actividad.")}</p>
        </figure>
      </section>
      <section className="landing-how" aria-labelledby="landing-how-title">
        <div className="landing-section-heading"><p className="landing-eyebrow">{t("ASÍ DE SENCILLO")}</p><h2 id="landing-how-title">{t("Del día a día a una vista clara.")}</h2></div>
        <ol className="landing-steps">
          <li><span className="landing-step-number" aria-hidden="true">01</span><h3>{t("Organiza tus frentes")}</h3><p>{t("Un proyecto, un curso o una afición. Abierto, en standby o archivado: tú decides.")}</p></li>
          <li><span className="landing-step-number" aria-hidden="true">02</span><h3>{t("Marca los días")}</h3><p>{t("Un check cuando le dediques tiempo. También puedes corregir días pasados.")}</p></li>
          <li><span className="landing-step-number" aria-hidden="true">03</span><h3>{t("Consulta tu actividad")}</h3><p>{t("Calendarios y porcentajes para ver cuándo has dedicado tiempo a cada frente.")}</p></li>
        </ol>
      </section>
      <section className="landing-privacy" aria-labelledby="landing-privacy-title">
        <div><LockKeyhole aria-hidden="true" className="landing-lock" /><p className="landing-eyebrow">{t("SENCILLO Y PRIVADO")}</p><h2 id="landing-privacy-title">{t("Tu espacio. Tu código.")}</h2></div>
        <div className="landing-privacy-copy"><p>{t("Tu contenido se cifra en el navegador. Accedes con un único código privado, sin usuario ni correo.")}</p><p className="landing-code-warning">{t("Guarda tu código: no hay recuperación.")}</p></div>
      </section>
      <section className="landing-close" aria-labelledby="landing-close-title"><h2 id="landing-close-title">{t("Empieza por un frente.")}</h2><p>{t("Un pequeño registro para lo que te importa.")}</p><div className="landing-actions"><Button asChild><a href="/app/">{t("Empezar")}<ArrowRight aria-hidden="true" size={16} /></a></Button></div></section>
    </main>
    <footer className="landing-footer"><span>Activity Hub</span><span>{t("Tu registro de actividad, sencillo y privado.")}</span></footer>
  </div>
}
