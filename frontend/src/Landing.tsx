import { ArrowRight, LockKeyhole } from "lucide-react"
import { LanguageSelect, useLanguage } from "@/components/Language"
import { ThemeToggle } from "@/components/Theme"
import { GitHubMark } from "@/components/GitHubMark"
import { PlantLogo } from "@/components/PlantLogo"
import { Button } from "@/components/ui/8bit/button"

/** Public, illustrative product page. No auth client, account state or API. */
export default function Landing() {
  const { t, language } = useLanguage()
  return <div className="landing">
    <a className="skip-link" href="#contenido">{t("Ir al contenido")}</a>
    <header className="landing-header">
      <div className="landing-brand"><PlantLogo /><span>Activity Hub</span></div>
      <div className="app-controls landing-controls">
        <a className="landing-source" href="https://github.com/Juancho1162/activity-hub"><GitHubMark />{t("Código fuente")}</a>
        <LanguageSelect /><ThemeToggle />
      </div>
    </header>
    <main id="contenido">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-intro">
          <p className="landing-eyebrow">{t("UN ESPACIO PARA TUS FRENTES")}</p>
          <h1 id="landing-title">{t("Tus proyectos, estudios y aficiones,")} <span>{t("en un mismo lugar.")}</span></h1>
          <p className="landing-lead">{t("Organiza lo que te importa. Marca los días que le dedicas tiempo y observa tu actividad.")}</p>
          <div className="landing-actions"><Button asChild><a href="/app/">{t("Empezar")}<ArrowRight aria-hidden="true" size={16} /></a></Button><a className="landing-secondary" href="/app/">{t("Ya tengo cuenta")}</a></div>
        </div>
        <figure className="landing-preview">
          <img className="landing-preview-light" src={`/previews/registro-${language}-light.webp`} width="1100" height="740" alt={t("Registro diario real: fecha, filtros y tarjetas de frentes con sus checks de actividad.")} />
          <img className="landing-preview-dark" src={`/previews/registro-${language}-dark.webp`} width="1100" height="740" alt={t("Registro diario real: fecha, filtros y tarjetas de frentes con sus checks de actividad.")} />
          <figcaption>{t("Captura de la aplicación con datos de ejemplo.")}</figcaption>
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
    </main>
    <footer className="landing-footer"><span>Activity Hub</span><span>{t("Tu registro de actividad, sencillo y privado.")}</span></footer>
  </div>
}
