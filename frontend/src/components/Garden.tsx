import { useMemo, type ReactNode } from "react"
import { Dialog } from "radix-ui"
import { ChevronLeft, ChevronRight, Focus, Sprout, X } from "lucide-react"
import { Button } from "@/components/ui/8bit/button"
import { useLanguage } from "@/components/Language"
import { FrontIcon } from "./FrontIcon"
import { daysInWindow, formatDay, isDay, shiftDay } from "@/lib/dates"
import type { DashboardItem, Front } from "@/lib/api"

const MIN_DAY = "0001-01-01"

export function gardenHistoryDays(day: string) {
  if (!isDay(day)) return []
  return daysInWindow(day < "0001-01-14" ? MIN_DAY : shiftDay(day, -13), day)
}

export function gardenMonth(month: string, today: string) {
  const year = Number(month.slice(0, 4)), number = Number(month.slice(5, 7))
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const length = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][number - 1]
  const last = `${month.slice(0, 7)}-${length}`
  return { start: month, end: last > today ? today : last, days: daysInWindow(month, last),
    padding: (new Date(`${month}T12:00:00Z`).getUTCDay() + 6) % 7,
    previous: month === MIN_DAY ? null : `${shiftDay(month, -1).slice(0, 7)}-01`,
    next: month.slice(0, 7) >= today.slice(0, 7) ? null : `${shiftDay(last, 1).slice(0, 7)}-01` }
}

export function GardenWeekStrip({ day, today, choose }: { day: string; today: string; choose: (day: string) => void }) {
  const { t, locale } = useLanguage()
  const days = useMemo(() => {
    if (!isDay(day)) return []
    const distance = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7
    const first = day < "0001-01-07" ? MIN_DAY : shiftDay(day, -distance)
    return Array.from({ length: 7 }, (_, index) => {
      try { return shiftDay(first, index) } catch { return null }
    }).filter((date): date is string => date !== null)
  }, [day])
  return <nav className="garden-week-strip" aria-label={t("Semana del registro")}>{days.map(date =>
    <Button type="button" variant="ghost" font="normal" key={date} data-day={date} aria-label={formatDay(date, false, locale)} aria-pressed={date === day} disabled={date > today} onClick={() => choose(date)}>
      <span>{new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</span><strong>{Number(date.slice(-2))}</strong><i aria-hidden="true" className={date === today ? "is-today" : ""} />
    </Button>)}</nav>
}

export function GardenFrontDetails({ item, day, focused, locked, onHistory, onFocus }: {
  item: DashboardItem; day: string; focused: boolean; locked: boolean
  onHistory: (button: HTMLButtonElement) => void; onFocus: () => void
}) {
  const { t, locale } = useLanguage()
  const days = gardenHistoryDays(day)
  return <div className="garden-front-extras">
    <p className="garden-last-record">{item.last_registered_day ? <>{t("Último registro global")}: <time dateTime={item.last_registered_day}>{formatDay(item.last_registered_day, true, locale)}</time></> : t("Tu primer registro, cuando quieras.")}</p>
    <button type="button" className="garden-front-history" aria-label={t("Ver historial de {name}", { name: item.front.name })} disabled={locked} onClick={event => onHistory(event.currentTarget)}>
      <span className="garden-history-dots" aria-hidden="true">{days.map(date => <i key={date} data-day={date} className={item.marked_dates.includes(date) ? "is-marked" : ""} />)}</span>
      <span className="garden-history-caption"><span>{t("Últimos {count} días", { count: days.length })}</span><span>{t("Ver historial")} →</span></span>
    </button>
    <Button type="button" variant="ghost" font="normal" className="garden-focus-toggle text-button" disabled={locked} aria-label={t("Enfocar {name}", { name: item.front.name })} aria-pressed={focused} onClick={onFocus}><Focus aria-hidden="true" size={15} />{t(focused ? "En enfoque" : "Enfocar")}</Button>
  </div>
}

export function GardenHistoryDialog({ front, month, today, item, canWrite, locked, loading, preview, feedback, error, onReload, onMonth, onCheck, onClose, onReturnFocus }: {
  front: Front; month: string; today: string; item: DashboardItem | undefined; canWrite: boolean; locked: boolean; loading: boolean
  preview: { day: string; marked: boolean } | null; feedback: ReactNode; error: string | null
  onReload: () => void; onMonth: (month: string) => void; onCheck: (day: string, marked: boolean) => void; onClose: () => void; onReturnFocus: () => void
}) {
  const { t, locale } = useLanguage()
  const window = gardenMonth(month, today)
  const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T12:00:00Z`))
  const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(`2026-10-${String(5 + index).padStart(2, "0")}T12:00:00Z`)))
  const total = daysInWindow(window.start, window.end).length
  const percentage = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(total && item ? item.count / total * 100 : 0)
  return <Dialog.Root open onOpenChange={open => { if (!open && !locked) onClose() }}>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="editor-panel garden-history-panel" onEscapeKeyDown={event => { if (locked) event.preventDefault() }} onPointerDownOutside={event => { if (locked) event.preventDefault() }} onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus() }}>
      <div className="garden-history-heading"><div><Dialog.Title asChild><h2>{t("Los días de este frente")}</h2></Dialog.Title><Dialog.Description asChild><p>{t("Un registro por día. Un espacio para volver a mirar.")}</p></Dialog.Description></div><Button type="button" variant="ghost" size="icon" aria-label={t("Cerrar historial")} disabled={locked} onClick={onClose}><X aria-hidden="true" /></Button></div>
      <div className="garden-history-intro"><FrontIcon icon={front.icon} /><h3>{front.name}</h3></div>
      <div className="garden-history-toolbar"><Button type="button" variant="outline" size="icon" aria-label={t("Mes anterior del frente")} disabled={locked || !window.previous} onClick={() => { if (window.previous) onMonth(window.previous) }}><ChevronLeft aria-hidden="true" /></Button><h4>{label}</h4><Button type="button" variant="outline" size="icon" aria-label={t("Mes siguiente del frente")} disabled={locked || !window.next} onClick={() => { if (window.next) onMonth(window.next) }}><ChevronRight aria-hidden="true" /></Button></div>
      {loading && <p className="garden-history-loading" role="status">{t("Cargando tus frentes…")}</p>}
      {error && <div role="alert"><p>{error}</p><Button type="button" variant="outline" font="normal" onClick={onReload}>{t("Reintentar carga")}</Button></div>}
      <div className="garden-month-grid" aria-label={t("Días del período de {name}", { name: front.name })} aria-busy={loading}>
        {weekdays.map((weekday, index) => <span className="garden-weekday" key={index}>{weekday}</span>)}
        {Array.from({ length: window.padding }, (_, index) => <span aria-hidden="true" key={`padding-${index}`} />)}
        {window.days.map(date => {
          const marked = preview?.day === date ? preview.marked : item?.marked_dates.includes(date) ?? false
          const allowed = canWrite && !locked && date <= today
          return <button type="button" role="checkbox" key={date} className={`garden-month-check${date === today ? " is-today" : ""}`} data-day={date} aria-checked={marked} disabled={date > today} aria-disabled={!allowed} aria-label={`${formatDay(date, false, locale)}: ${t(marked ? "Actividad registrada" : "Sin actividad registrada")}`} onClick={() => { if (allowed) onCheck(date, !marked) }}><span aria-hidden="true">{Number(date.slice(-2))}</span></button>
        })}
      </div>
      <div className="garden-history-legend"><span><i aria-hidden="true" />{t("Sin actividad registrada")}</span><span><i className="is-marked" aria-hidden="true" />{t("Actividad registrada")}</span><Button type="button" variant="ghost" font="normal" className="text-button" disabled={locked || month.slice(0, 7) === today.slice(0, 7)} onClick={() => onMonth(`${today.slice(0, 7)}-01`)}>{t("Ir al mes actual")}</Button></div>
      {item && <div className="garden-history-summary"><div><strong>{item.count}<small> / {total}</small></strong><span>{t("días con registro")}</span></div><div><strong>{percentage}<small> %</small></strong><span>{t("del período")}</span></div><Sprout aria-hidden="true" /></div>}
      <p className="garden-history-period"><time dateTime={window.start}>{formatDay(window.start, false, locale)}</time> — <time dateTime={window.end}>{formatDay(window.end, false, locale)}</time> · Europe/Madrid</p>
      <p className="garden-history-help">{t("Toca un día para registrar o quitar actividad. Los días en blanco no son una deuda.")}</p>
      {feedback}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>
}
