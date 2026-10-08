import { useState } from "react"
import { useLanguage } from "@/components/Language"

export function PlantLogo({ welcome = false }: { welcome?: boolean }) {
  const { t } = useLanguage()
  const [animated, setAnimated] = useState(true)
  return <button type="button" className={`plant-toggle${welcome ? " plant-toggle--welcome" : ""}`} aria-label={t("Animación de la planta")} aria-pressed={animated} title={t(animated ? "Pausar la animación" : "Reanudar la animación")} onClick={() => setAnimated(value => !value)}>
    <span className="brand-mark" aria-hidden="true"><img src={animated ? "/plant-logo.svg" : "/favicon.svg"} width="32" height="32" alt="" draggable="false" /></span>
  </button>
}
