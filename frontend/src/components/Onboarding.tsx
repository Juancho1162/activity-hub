import type { ReactNode } from "react"
import { Dialog } from "radix-ui"
import { BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, LayoutDashboard, Pencil, Sprout, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/8bit/button"
import { useLanguage } from "@/components/Language"
import type { MessageKey } from "@/lib/i18n"

const steps: { title: MessageKey; copy: MessageKey }[] = [
  { title: "Un espacio para cada frente", copy: "Un libro, un proyecto o una afición. Puedes cambiar el nombre y el icono, crear otros frentes o dejarlos en standby. Tú decides qué sigue abierto." },
  { title: "Un gesto, cuando ocurra", copy: "Marca el día cuando le dediques tiempo a un frente. También puedes elegir una fecha pasada y corregirla. Un día en blanco solo significa que no hay registro." },
  { title: "Vuelve a mirar cuando quieras", copy: "Abre el historial de un frente o el Dashboard para consultar tus días. Si eliminas un frente, podrás restaurarlo desde la Papelera con todos sus registros." },
]

function Example({ step }: { step: number }) {
  const { t } = useLanguage()
  return <div className={`onboarding-preview onboarding-preview-${step}`} aria-hidden="true">
    <span className="onboarding-example-label">{t("Ejemplo ilustrativo")}</span>
    {step === 0 ? <>
      <div className="onboarding-example-front"><span className="onboarding-example-icon"><BookOpen /></span><span><strong>{t("Leer")}</strong><small>{t("Abierto")}</small></span><Pencil /></div>
      <div className="onboarding-example-front"><span className="onboarding-example-icon"><Sprout /></span><span><strong>{t("Aprender algo")}</strong><small>{t("Standby")}</small></span><Pencil /></div>
    </> : step === 1 ? <>
      <div className="onboarding-example-date"><CalendarDays /><span>{t("Elige el día")}</span></div>
      <div className="onboarding-example-check"><span><Check /></span><strong>{t("Registrar día")}</strong><small>{t("Un registro manual")}</small></div>
      <div className="onboarding-example-dots">{Array.from({ length: 14 }, (_, index) => <i key={index} />)}</div>
    </> : <>
      <div className="onboarding-example-calendar">{Array.from({ length: 21 }, (_, index) => <i key={index} />)}</div>
      <div className="onboarding-example-tools"><span><LayoutDashboard />{t("Dashboard")}</span><span><Trash2 />{t("Papelera")}</span></div>
    </>}
  </div>
}

export function Onboarding({ step, locked, saving, canClose, feedback, onStep, onClose, onReturnFocus }: {
  step: number; locked: boolean; saving: boolean; canClose: boolean; feedback: ReactNode
  onStep: (step: number) => void; onClose: () => void; onReturnFocus: () => void
}) {
  const { t } = useLanguage()
  const current = steps[step]
  return <Dialog.Root open onOpenChange={open => { if (!open && !locked && canClose) onClose() }}>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="editor-panel onboarding-panel" onEscapeKeyDown={event => { if (locked || !canClose) event.preventDefault() }} onPointerDownOutside={event => { if (locked || !canClose) event.preventDefault() }} onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus() }}>
      <header className="onboarding-heading"><div><p className="eyebrow">{t("A TU RITMO")}</p><Dialog.Title asChild><h2>{t("Guía rápida")}</h2></Dialog.Title></div><Button type="button" variant="ghost" size="icon" aria-label={t("Cerrar guía")} disabled={locked || !canClose} onClick={onClose}><X aria-hidden="true" /></Button></header>
      <p className="onboarding-progress" role="status">{t("Paso {step} de {total}", { step: step + 1, total: steps.length })}<span aria-hidden="true">{steps.map((_, index) => <i key={index} className={index === step ? "is-current" : ""} />)}</span></p>
      <section className="onboarding-step"><h3>{t(current.title)}</h3><Dialog.Description asChild><p>{t(current.copy)}</p></Dialog.Description><Example step={step} /></section>
      {saving && <p role="status" className="onboarding-saving">{t("Guardando tu preferencia…")}</p>}
      {feedback}
      <footer className="onboarding-actions"><Button type="button" variant="ghost" font="normal" className="text-button onboarding-skip" disabled={locked || !canClose} onClick={onClose}>{t("No volver a mostrar")}</Button><div><Button type="button" variant="outline" font="normal" className="text-button" disabled={locked || step === 0} onClick={() => onStep(step - 1)}><ChevronLeft aria-hidden="true" />{t("Anterior")}</Button>{step < steps.length - 1 ? <Button type="button" font="normal" disabled={locked} onClick={() => onStep(step + 1)}>{t("Siguiente")}<ChevronRight aria-hidden="true" /></Button> : <Button type="button" font="normal" disabled={locked || !canClose} onClick={onClose}>{t("Empezar mi jardín")}</Button>}</div></footer>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>
}
