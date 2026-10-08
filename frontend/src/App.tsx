import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react"
import { Dialog } from "radix-ui"
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, FolderOpen, LayoutDashboard, LockKeyhole, Pencil, Plus, Trash2, TriangleAlert, Undo2, X } from "lucide-react"
import { Button } from "@/components/ui/8bit/button"
import { Card, CardContent, CardHeader } from "@/components/ui/8bit/card"
import { Checkbox } from "@/components/ui/8bit/checkbox"
import { Input } from "@/components/ui/8bit/input"
import { useActivity, type Intent } from "@/hooks/useActivity"
import { createApi, safeReference, type ActivityApi, type DashboardItem, type DashboardPage, type DashboardQuery, type Front, type FrontDraft, type FrontState } from "@/lib/api"
import { daysInWindow, formatDay, isDay, shiftDay, todayInMadrid } from "@/lib/dates"
import { useLanguage } from "@/components/Language"
import { PlantLogo } from "@/components/PlantLogo"
import { BotanicalAccent } from "@/components/BotanicalAccent"
import type { MessageKey } from "@/lib/i18n"

const defaultApi = createApi()
const defaultClock = () => new Date()
const PAGE_SIZE = 20
const MIN_DAY = "0001-01-01"
const stateLabels: Record<FrontState, MessageKey> = { open: "Abierto", standby: "Standby", archived: "Archivado" }
type View = "daily" | "dashboard" | "trash"
const viewLabels: Record<View, MessageKey> = { daily: "Registro diario", dashboard: "Dashboard", trash: "Papelera" }
type Navigation = { api: ActivityApi; source: View; target: View; page: DashboardPage }
type Editor = { id: string | null; name: string; reference: string; state: FrontState }
type Activity = ReturnType<typeof useActivity>
type CalendarDay = { date: string; label: string; short: string }

function StateOptions({ all = false }: { all?: boolean }) {
  const { t } = useLanguage()
  return <>{all && <option value="all">{t("Todos los estados")}</option>}{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</>
}

function FrontInfo({ front }: { front: Front }) {
  const { t } = useLanguage()
  return <div className="front-info">
    <div className="front-title"><h2>{front.name}</h2><span className={`state-badge state-${front.state}`}>{t(stateLabels[front.state])}</span></div>
  </div>
}

function FrontActions({ front, children }: { front: Front; children: ReactNode }) {
  const { t } = useLanguage()
  const reference = safeReference(front.reference)
  const label = t("Referencia de {name} (nueva pestaña)", { name: front.name })
  return <div className="front-actions">
    <span className="reference-slot" aria-hidden={reference ? undefined : true}>
      {reference && <a className="reference-link" href={reference} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}><ExternalLink aria-hidden="true" size={18} /></a>}
    </span>
    {children}
  </div>
}

function toggleCalendarRow(event: MouseEvent<HTMLElement>) {
  const details = event.currentTarget.closest("details")
  const item = details?.closest(".dashboard-list > li")
  if (!details || !item?.parentElement) return
  event.preventDefault()
  const top = item.getBoundingClientRect().top
  const open = !details.open
  // Capture the current visual row before any disclosure changes grid heights.
  const row = [...item.parentElement.children].filter(peer => Math.abs(peer.getBoundingClientRect().top - top) < 1)
  for (const peer of row) {
    const calendar = peer.querySelector<HTMLDetailsElement>(".calendar-details")
    if (calendar) calendar.open = open
  }
}

function DashboardFront({ item, calendarDays, editAction }: {
  item: DashboardItem; calendarDays: CalendarDay[]; editAction: ReactNode
}) {
  const { t, locale } = useLanguage()
  const percentFormat = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale])
  const totalDays = calendarDays.length
  const firstDay = calendarDays[0], lastDay = calendarDays.at(-1)
  const percentage = percentFormat.format(totalDays ? item.count / totalDays * 100 : 0)
  return <>
    <div className="dashboard-summary">
      <FrontInfo front={item.front} />
      <div className="period-coverage">
        <output className="coverage-value" aria-label={t("{percentage} % de los días seleccionados", { percentage })}>{percentage}<span aria-hidden="true"> %</span></output>
        <p className="period-count">{t(totalDays === 1 ? "{count} de {total} día registrado" : "{count} de {total} días registrados", { count: item.count, total: totalDays })}</p>
      </div>
    </div>
    <div className="dashboard-meta">
      <dl><dt>{t("Último registro global")}</dt><dd>{item.last_registered_day ? <time dateTime={item.last_registered_day}>{formatDay(item.last_registered_day, false, locale)}</time> : t("Sin registros")}</dd></dl>
      <FrontActions front={item.front}>{editAction}</FrontActions>
    </div>
    <details className="calendar-details">
      <summary onClick={toggleCalendarRow}><ChevronRight className="disclosure-arrow" aria-hidden="true" size={16} /><span>{t("Ver días del período")}</span></summary>
      <div className="calendar-content">
        {firstDay && lastDay && <p className="calendar-range"><time dateTime={firstDay.date}>{firstDay.label}</time>{totalDays > 1 && <> — <time dateTime={lastDay.date}>{lastDay.label}</time></>}</p>}
        <div className="calendar-legend"><span><i className="legend-marked" aria-hidden="true" />{t("Actividad registrada")}</span><span><i className="legend-empty" aria-hidden="true" />{t("Sin actividad registrada")}</span></div>
        <ul className="calendar-grid" aria-label={t("Días del período de {name}", { name: item.front.name })}>{calendarDays.map(({ date, label, short }) => {
          const marked = item.marked_dates.includes(date)
          const description = `${label}: ${t(marked ? "Actividad registrada" : "Sin actividad registrada")}`
          return <li key={date}><span role="img" aria-label={description} title={description} className={`calendar-tile ${marked ? "is-marked" : ""}`}><time dateTime={date} aria-hidden="true">{short}</time></span></li>
        })}</ul>
      </div>
    </details>
  </>
}

function RequestFeedback({ activity, onRetry }: { activity: Activity; onRetry: () => void }) {
  const { t, message, locale } = useLanguage()
  if (activity.saving || (!activity.pending && !activity.mutationError)) return null
  return <div className="request-feedback">
    {activity.mutationError && <div role="alert"><h3>{activity.pending ? t("Solicitud sin confirmar") : activity.mutationError.kind === "deleted-request" ? t("El frente se ha eliminado") : t("El cambio no se ha guardado")}</h3><p>{message(activity.mutationError.message)}</p></div>}
    {activity.pending && <>
      {activity.pending.kind === "check" && <p>{t("Solicitud del {date}: {action}.", { date: formatDay(activity.pending.day, false, locale), action: t(activity.pending.marked ? "marcar actividad" : "quitar el registro") })}</p>}
      <p className="muted">{t("No recargues ni cierres esta pestaña. La solicitud se conserva solo en memoria para reintentarla con la misma identidad.")}</p>
      {!activity.saving && <Button type="button" className="text-button" font="normal" onClick={onRetry}>{t("Reintentar solicitud")}</Button>}
    </>}
  </div>
}

export default function App({ api = defaultApi, clock = defaultClock, enabled = true, onWriteLockChange }: {
  api?: ActivityApi; clock?: () => Date; enabled?: boolean; onWriteLockChange?: (locked: boolean) => void
}) {
  const { t, message, locale } = useLanguage()
  const [today, setToday] = useState(() => todayInMadrid(clock()))
  const [requestedView, setRequestedView] = useState<View>("daily")
  const [navigation, setNavigation] = useState<Navigation | null>(null)
  const [day, setDay] = useState(today)
  const [start, setStart] = useState(() => today < "0001-01-28" ? MIN_DAY : shiftDay(today, -27))
  const [end, setEnd] = useState(today)
  const [state, setState] = useState<FrontState | "all">("open")
  const [search, setSearch] = useState("")
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [offset, setOffset] = useState(0)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [deletion, setDeletion] = useState<Front | null>(null)
  const [formError, setFormError] = useState<{ field: "name" | "reference"; message: MessageKey } | null>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const newButton = useRef<HTMLButtonElement | null>(null)
  const trashButton = useRef<HTMLButtonElement | null>(null)
  const deleteOpener = useRef<HTMLButtonElement | null>(null)
  const hasTrash = !!api.trashFront && !!api.restoreFront

  useEffect(() => {
    // Update the boundary, not an absolute selection or a pending request.
    const updateToday = () => setToday(todayInMadrid(clock()))
    const onVisible = () => { if (document.visibilityState === "visible") updateToday() }
    updateToday()
    const timer = window.setInterval(updateToday, 30000)
    window.addEventListener("focus", updateToday)
    document.addEventListener("visibilitychange", onVisible)
    return () => { window.clearInterval(timer); window.removeEventListener("focus", updateToday); document.removeEventListener("visibilitychange", onVisible) }
  }, [clock])

  const dailyValid = isDay(day) && day <= today
  const days = useMemo(() => daysInWindow(start, end), [start, end])
  const windowError = !isDay(start) || !isDay(end) || start > today || end > today
    ? "Selecciona fechas válidas, hasta hoy en Madrid."
    : end < start ? "La fecha «Desde» no puede ser posterior a «Hasta»."
      : days.length === 0 ? "El período no puede superar 366 días (ambos incluidos)." : ""
  const invalid = requestedView === "daily" ? !dailyValid : requestedView === "dashboard" ? !!windowError : false
  const query: DashboardQuery | null = !enabled || invalid ? null : {
    start: requestedView === "daily" ? day : requestedView === "trash" ? today : start,
    end: requestedView === "daily" ? day : requestedView === "trash" ? today : end,
    state: requestedView === "trash" ? "all" : state, search: search.trim(), limit: PAGE_SIZE, offset, order: requestedView === "dashboard" ? "activity_desc" : "created",
    ...(requestedView === "trash" ? { trashed: true } : {}),
  }
  const activity = useActivity(api, query, onWriteLockChange)
  const { page: receivedPage, error, pending, saving } = activity
  const outOfRange = receivedPage !== null && receivedPage.offset > 0 && receivedPage.offset >= receivedPage.total
  const currentPage = outOfRange ? null : receivedPage
  const loading = activity.loading || outOfRange
  // Keep the complete source view read-only while the destination loads. Its
  // heading/dates must stay with its data, and it must never cross an API/session.
  const navigating = navigation !== null && enabled && loading && !invalid
    && navigation.api === api && navigation.target === requestedView
  const view = navigating ? navigation.source : requestedView
  const page = navigating ? navigation.page : currentPage
  const canWrite = activity.canWrite && !outOfRange && !navigating
  useEffect(() => {
    if (!loading || invalid || !enabled || navigation?.api !== api) setNavigation(null)
  }, [loading, invalid, enabled, api, navigation])
  useEffect(() => {
    if (outOfRange && receivedPage) {
      const lastOffset = Math.floor(Math.max(0, receivedPage.total - 1) / PAGE_SIZE) * PAGE_SIZE
      setOffset((current) => current === receivedPage.offset ? lastOffset : current)
    }
  }, [outOfRange, receivedPage])
  const locked = pending !== null || saving
  const calendarDays = useMemo(() => days.map((date) => ({ date, label: formatDay(date, false, locale), short: formatDay(date, true, locale) })), [days, locale])

  function chooseView(next: View) {
    if (next !== requestedView && page) setNavigation({ api, source: view, target: next, page })
    setRequestedView(next); setOffset(0)
  }
  function chooseDay(next: string) { setDay(next); setOffset(0) }
  function openEditor(front: Front | null, button: HTMLButtonElement) {
    if (locked) return
    opener.current = button
    setFormError(null)
    setEditor(front ? { id: front.id, name: front.name, reference: front.reference ?? "", state: front.state } : { id: null, name: "", reference: "", state: "open" })
  }
  function updateEditor(patch: Partial<Editor>) {
    if (!locked) { setEditor((current) => current ? { ...current, ...patch } : null); setFormError(null) }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor || !canWrite || locked) return
    const name = editor.name.trim()
    const reference = editor.reference.trim()
    if (!name || [...name].length > 200 || name.includes("\0")) {
      setFormError({ field: "name", message: "Escribe un nombre de 1 a 200 caracteres, sin caracteres NUL." }); return
    }
    if (reference && ([...reference].length > 2048 || !safeReference(reference))) {
      setFormError({ field: "reference", message: "El enlace debe ser una URL HTTP o HTTPS de hasta 2048 caracteres." }); return
    }
    setFormError(null)
    const data: FrontDraft = { name, reference: reference || null, state: editor.state }
    const intent: Intent = editor.id ? { kind: "edit", id: editor.id, data } : { kind: "create", data, requestId: crypto.randomUUID() }
    if (await activity.perform(intent)) setEditor(null)
  }
  async function retryPending() {
    const editorRequest = pending?.kind === "create" || pending?.kind === "edit" || pending?.kind === "trash"
    const deleteRequest = pending?.kind === "delete"
    if (await activity.retry()) {
      if (editorRequest) setEditor(null)
      if (deleteRequest) setDeletion(null)
    }
  }
  async function trashEditor() {
    if (!editor?.id || !canWrite || locked || !hasTrash) return
    if (await activity.perform({ kind: "trash", id: editor.id, requestId: crypto.randomUUID() })) setEditor(null)
  }
  async function restore(front: Front, button: HTMLButtonElement) {
    if (!canWrite || locked || !hasTrash) return
    const ownedFocus = document.activeElement === button
    if (await activity.perform({ kind: "restore", id: front.id, requestId: crypto.randomUUID() })) {
      if (ownedFocus && trashButton.current?.getAttribute("aria-current") === "page"
        && (document.activeElement === button || document.activeElement === document.body)) trashButton.current.focus({ preventScroll: true })
    }
  }
  function confirmDeletion(front: Front, button: HTMLButtonElement) {
    if (!canWrite || locked || !api.deleteFront) return
    deleteOpener.current = button
    setDeletion(front)
  }
  async function deletePermanently() {
    if (!deletion || !canWrite || locked || !api.deleteFront) return
    if (await activity.perform({ kind: "delete", id: deletion.id, requestId: crypto.randomUUID() })) setDeletion(null)
  }
  function checkPreview(id: string) {
    const preview = activity.optimisticCheck
    return preview?.id === id && preview.day === day ? preview : null
  }
  function checkStatus(item: DashboardItem) {
    const preview = checkPreview(item.front.id)
    if (preview) return `${t(preview.marked ? "Actividad marcada" : "Actividad desmarcada")}; ${t(saving ? "guardando…" : "actualizando registro…")}`
    return t(item.marked_dates.includes(day) ? "Actividad registrada" : "Sin actividad registrada")
  }
  function check(id: string, marked: boolean | "indeterminate") {
    const boundary = todayInMadrid(clock())
    if (typeof marked !== "boolean" || !canWrite || !dailyValid || !isDay(day) || day > boundary) { setToday(boundary); return }
    void activity.perform({ kind: "check", id, day, marked, requestId: crypto.randomUUID() })
  }
  const editButton = (front: Front) => <Button type="button" font="normal" variant="ghost" className="edit-front text-button" disabled={locked} aria-label={t("Editar {name}", { name: front.name })} title={t("Editar {name}", { name: front.name })} onClick={(event) => openEditor(front, event.currentTarget)}><Pencil aria-hidden="true" size={18} /><span className="edit-label sr-only">{t("Editar")}</span></Button>

  // Keep every hook/editor/intent mounted during reauthentication, but remove
  // private reads and the dialog portal from the DOM while the session is inactive.
  if (!enabled) return null

  return <div className="app-shell">
    <a className="skip-link" href="#contenido">{t("Ir al contenido")}</a>
    <aside className="sidebar">
      <BotanicalAccent />
      <div className="brand"><PlantLogo /><span className="brand-name retro">Activity Hub</span></div>
      <nav className="view-nav" aria-label={t("Vistas")}>
        <Button type="button" variant="ghost" className="nav-button" aria-label={t("Registro diario")} aria-current={requestedView === "daily" ? "page" : undefined} aria-busy={navigating && requestedView === "daily"} onClick={() => chooseView("daily")}><CalendarDays aria-hidden="true" /><span className="nav-label">{t("Registro")}</span></Button>
        <Button type="button" variant="ghost" className="nav-button" aria-current={requestedView === "dashboard" ? "page" : undefined} aria-busy={navigating && requestedView === "dashboard"} onClick={() => chooseView("dashboard")}><LayoutDashboard aria-hidden="true" /><span className="nav-label">{t("Dashboard")}</span></Button>
        {hasTrash && <Button type="button" ref={trashButton} variant="ghost" className="nav-button trash-nav" aria-label={t("Papelera")} title={t("Papelera")} aria-current={requestedView === "trash" ? "page" : undefined} aria-busy={navigating && requestedView === "trash"} onClick={() => chooseView("trash")}><Trash2 aria-hidden="true" /><span className="trash-nav-label">{t("Papelera")}</span></Button>}
      </nav>
      <div className="sidebar-note"><LockKeyhole aria-hidden="true" size={18} /><span>{t("Espacio privado")}</span></div>
    </aside>

    <p className="sr-only" role="status">{navigating ? t("Abriendo {view}…", { view: t(viewLabels[requestedView]) }) : ""}</p>
    <main id="contenido" className="main-content" tabIndex={-1} inert={navigating} aria-busy={navigating}>
      {!editor && !deletion && <div className="main-feedback">
        <RequestFeedback activity={activity} onRetry={() => { void retryPending() }} />
      </div>}
      <div key={view} className="view-panel">
        <header className="page-header">
          <div><p className="eyebrow">{t("REGISTRO PERSONAL")}</p><h1 className="retro">{t(viewLabels[view])}</h1></div>
          {view !== "trash" && <Button type="button" ref={newButton} className="new-front" aria-label={t("Nuevo frente")} title={t("Nuevo frente")} disabled={locked || navigating} onClick={(event) => openEditor(null, event.currentTarget)}><Plus aria-hidden="true" /><span className="new-front-label">{t("Nuevo frente")}</span></Button>}
        </header>

        <Card font="normal" className="toolbar-card"><CardContent font="normal" className="card-body">
          {view === "trash" ? <div className="trash-help"><p>{t("Recupera un frente con su estado y todos sus checks.")}</p><p className="muted">{api.deleteFront ? t("Eliminar para siempre borra el frente y todo su historial. No podrás recuperarlo.") : t("El contenido de la papelera se conserva y sigue ocupando espacio en tu cuenta.")}</p></div> : view === "daily" ? <div className="daily-controls">
            <div className="field date-field"><label htmlFor="registration-day">{t("Fecha de registro")}</label><Input id="registration-day" type="date" font="normal" className="field-input" min={MIN_DAY} max={today} value={day} aria-invalid={!dailyValid} aria-describedby="date-help" onChange={(event) => chooseDay(event.target.value)} /></div>
            <div className="day-actions"><Button type="button" variant="outline" size="icon" aria-label={t("Día anterior")} disabled={!dailyValid || day === MIN_DAY} onClick={() => chooseDay(shiftDay(day, -1))}><ChevronLeft aria-hidden="true" /></Button><Button type="button" variant="outline" size="icon" aria-label={t("Día siguiente")} disabled={!dailyValid || day >= today} onClick={() => chooseDay(shiftDay(day, 1))}><ChevronRight aria-hidden="true" /></Button><Button type="button" variant="outline" onClick={() => { const currentToday = todayInMadrid(clock()); setToday(currentToday); chooseDay(currentToday) }}>{t("Hoy")}</Button></div>
            <p id="date-help" className="date-help">{t("Hoy, {date}", { date: formatDay(today, true, locale) })}</p>
          </div> : <div className="period-controls">
            <div className="field"><label htmlFor="period-start">{t("Desde")}</label><Input id="period-start" type="date" font="normal" className="field-input" min={MIN_DAY} max={today} value={start} aria-invalid={!!windowError} aria-describedby="period-help" onChange={(event) => { setStart(event.target.value); setOffset(0) }} /></div>
            <div className="field"><label htmlFor="period-end">{t("Hasta")}</label><Input id="period-end" type="date" font="normal" className="field-input" min={MIN_DAY} max={today} value={end} aria-invalid={!!windowError} aria-describedby="period-help" onChange={(event) => { setEnd(event.target.value); setOffset(0) }} /></div>
            <p id="period-help" className="date-help">{t("Ambas fechas incluidas")}</p>
          </div>}
          <div className="filter-section">
            <Button type="button" variant="outline" font="normal" className="text-button filter-toggle" aria-expanded={filtersExpanded} aria-controls="view-filters" onClick={() => setFiltersExpanded(current => !current)}>{filtersExpanded ? t("Ocultar filtros") : t("Buscar y filtrar")}{(search.trim() || (view !== "trash" && state !== "open")) ? t(" · activos") : ""}</Button>
            <div id="view-filters" className={`filter-controls${filtersExpanded ? " is-expanded" : ""}`}>{view !== "trash" && <div className="field"><label htmlFor="state-filter">{t("Estado")}</label><select id="state-filter" value={state} onChange={(event) => { setState(event.target.value as FrontState | "all"); setOffset(0) }}><StateOptions all /></select></div>}<div className="field"><label htmlFor="name-search">{t("Buscar por nombre")}</label><Input id="name-search" type="search" font="normal" className="field-input" placeholder={t("Nombre del frente…")} value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0) }} /></div></div>
          </div>
        </CardContent></Card>

        {invalid ? <p className="validation-message" role="alert">{view === "daily" ? t("Selecciona hoy o una fecha pasada.") : t(windowError)}</p>
          : loading && !navigating ? <Card font="normal" className="message-card"><CardContent font="normal" className="card-body"><p role="status" className="loading-message"><span className="loading-pixel" aria-hidden="true" />{t("Cargando tus frentes…")}</p></CardContent></Card>
            : error ? <Card font="normal" className="message-card access-card" role="alert"><CardContent font="normal" className="card-body">
              <span className="message-icon" aria-hidden="true">{error.kind === "access-pending" || error.kind === "unauthorized" ? <LockKeyhole /> : <TriangleAlert />}</span>
              <p className="eyebrow">{error.kind === "access-pending" ? t("DATOS PROTEGIDOS") : t("LECTURA NO DISPONIBLE")}</p>
              <h2>{error.kind === "access-pending" ? t("Acceso privado pendiente") : error.kind === "unauthorized" ? t("Acceso restringido") : t("No se pudo cargar el registro")}</h2>
              <p>{message(error.message)}</p>
              {error.kind === "access-pending" && <p className="muted">{t("El esquema de datos no está disponible. Consulta las migraciones en el README.")}</p>}
              <Button type="button" variant="outline" font="normal" className="text-button" onClick={activity.refresh}>{t("Reintentar carga")}</Button>
            </CardContent></Card>
              : page && <>
                <div className="results-heading"><p>{t(page.total === 1 ? "{count} frente en esta vista" : "{count} frentes en esta vista", { count: page.total })}</p><span>{view === "daily" ? formatDay(day, false, locale) : view === "trash" ? t("Todos los estados") : t("Mayor porcentaje primero")}</span></div>
                {page.total === 0 ? <Card font="normal" className="message-card"><CardContent font="normal" className="card-body"><FolderOpen className="empty-icon" aria-hidden="true" /><h2>{view === "trash" ? (search.trim() ? t("No hay frentes en la papelera con ese nombre") : t("La papelera está vacía")) : t("No hay frentes en esta vista")}</h2><p className="muted">{view === "trash" ? t("Los frentes que elimines aparecerán aquí para que puedas recuperarlos.") : t("Prueba otro estado o nombre, o crea un nuevo frente. Crear un frente no marca actividad.")}</p></CardContent></Card> : <ul className={`front-list ${view === "dashboard" ? "dashboard-list" : view === "trash" ? "trash-list" : "daily-list"}`} aria-busy={saving || activity.refreshing || navigating} aria-label={view === "daily" ? t("Frentes del registro diario") : view === "trash" ? t("Frentes de la papelera") : t("Frentes del dashboard")}>
                  {page.items.map((item) => <li key={`${item.front.id}:${view}:${page.start}:${page.end}`}><Card font="normal" className="front-card"><CardContent font="normal" className="card-body">
                    {view === "daily" ? <div className="daily-row"><Checkbox className="min-h-11 min-w-11 activity-check" aria-label={t("Actividad en {name}", { name: item.front.name })} aria-describedby={`check-status-${item.front.id}`} aria-busy={!!checkPreview(item.front.id)} checked={checkPreview(item.front.id)?.marked ?? item.marked_dates.includes(day)} aria-disabled={!canWrite || !dailyValid} onClick={(event) => { if (!canWrite || !dailyValid) event.preventDefault() }} onCheckedChange={(marked) => check(item.front.id, marked)} /><div><FrontInfo front={item.front} /><p id={`check-status-${item.front.id}`} className="sr-only" aria-live="polite">{checkStatus(item)}</p></div><FrontActions front={item.front}>{editButton(item.front)}</FrontActions></div> : view === "trash" ? <div className="trash-row"><FrontInfo front={item.front} /><div className="trash-actions"><Button type="button" variant="outline" font="normal" className="restore-front text-button" aria-label={t("Restaurar {name}", { name: item.front.name })} title={t("Restaurar {name}", { name: item.front.name })} disabled={!canWrite || locked} onClick={(event) => { void restore(item.front, event.currentTarget) }}><Undo2 aria-hidden="true" size={18} /><span className="restore-label">{t("Restaurar")}</span></Button>{api.deleteFront && <Button type="button" variant="ghost" font="normal" className="purge-front text-button" aria-label={t("Eliminar para siempre {name}", { name: item.front.name })} title={t("Eliminar para siempre {name}", { name: item.front.name })} disabled={!canWrite || locked} onClick={(event) => confirmDeletion(item.front, event.currentTarget)}><Trash2 aria-hidden="true" size={18} /><span className="purge-label">{t("Eliminar para siempre")}</span></Button>}</div></div> : <DashboardFront item={item} calendarDays={calendarDays} editAction={editButton(item.front)} />}
                  </CardContent></Card></li>)}
                </ul>}
              </>}

        <nav className="pagination" aria-label={t("Paginación de frentes")}><Button type="button" variant="outline" font="normal" className="text-button" aria-label={t("Página anterior")} disabled={navigating || !page || offset === 0} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}><ChevronLeft aria-hidden="true" />{" "}{t("Anterior")}</Button><span>{page ? t("Página {page} de {total}", { page: Math.floor(page.offset / PAGE_SIZE) + 1, total: Math.max(1, Math.ceil(page.total / PAGE_SIZE)) }) : t("Página —")}</span><Button type="button" variant="outline" font="normal" className="text-button" aria-label={t("Página siguiente")} disabled={navigating || !page || offset + PAGE_SIZE >= page.total || offset + PAGE_SIZE > 100000} onClick={() => setOffset((current) => current + PAGE_SIZE)}>{t("Siguiente")}{" "}<ChevronRight aria-hidden="true" /></Button></nav>
        <footer className="page-footer">{view === "trash" ? t("Restaurar conserva el estado y todos los checks del frente.") : t("Los estados los decides tú. Los checks se pueden corregir también en standby y archivados.")}</footer>
      </div>
    </main>

    <Dialog.Root open={editor !== null} onOpenChange={(open) => { if (!open && !locked) setEditor(null) }}>
      {editor && <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="editor-panel" onOpenAutoFocus={(event) => { event.preventDefault(); document.getElementById("front-name")?.focus() }} onEscapeKeyDown={(event) => { if (locked) event.preventDefault() }} onPointerDownOutside={(event) => { if (locked) event.preventDefault() }} onCloseAutoFocus={(event) => { event.preventDefault(); const target = opener.current; (target?.isConnected && !target.disabled ? target : newButton.current)?.focus({ preventScroll: true }) }}>
        <Card font="normal" className="editor-card"><CardHeader font="normal" className="editor-header"><div><Dialog.Title asChild><h2>{editor.id ? t("Editar frente") : t("Nuevo frente")}</h2></Dialog.Title><Dialog.Description asChild><p className="muted">{t("Nombre, referencia y estado. El historial se conserva.")}</p></Dialog.Description></div><Button type="button" variant="ghost" size="icon" aria-label={t("Cerrar editor")} disabled={locked} onClick={() => setEditor(null)}><X aria-hidden="true" /></Button></CardHeader><CardContent font="normal" className="editor-body">
          <form onSubmit={(event) => { void submit(event) }} noValidate>
            <div className="field"><label htmlFor="front-name">{t("Nombre")}</label><Input id="front-name" font="normal" className="field-input" value={editor.name} disabled={locked} aria-invalid={formError?.field === "name"} aria-describedby={formError?.field === "name" ? "form-error" : "name-help"} onChange={(event) => updateEditor({ name: event.target.value })} /><p id="name-help" className="field-help">{t("De 1 a 200 caracteres. No tiene que ser único.")}</p></div>
            <div className="field"><label htmlFor="front-reference">{t("Enlace (opcional)")}</label><Input id="front-reference" type="url" font="normal" className="field-input" placeholder="https://…" value={editor.reference} disabled={locked} aria-invalid={formError?.field === "reference"} aria-describedby={formError?.field === "reference" ? "form-error" : "reference-help"} onChange={(event) => updateEditor({ reference: event.target.value })} /><p id="reference-help" className="field-help">{t("Solo HTTP o HTTPS. Déjalo vacío para quitar el enlace.")}</p></div>
            <div className="field"><label htmlFor="front-state">{t("Estado del frente")}</label><select id="front-state" value={editor.state} disabled={locked} onChange={(event) => updateEditor({ state: event.target.value as FrontState })}><StateOptions /></select></div>
            {formError && <p id="form-error" role="alert" className="validation-message">{t(formError.message)}</p>}
            {!canWrite && !pending && <p className="preview-note">{t("Guardar requiere acceso privado y una carga válida de los frentes.")}</p>}
            <RequestFeedback activity={activity} onRetry={() => { void retryPending() }} />
            {editor.id && hasTrash && <div className="editor-trash"><Button type="button" variant="ghost" font="normal" className="delete-front text-button" disabled={!canWrite || locked} onClick={() => { void trashEditor() }}><Trash2 aria-hidden="true" size={18} />{t("Eliminar frente")}</Button><p className="field-help">{t("Se moverá a la Papelera. Podrás recuperarlo con todo su historial.")}</p></div>}
            <div className="editor-actions"><Button type="button" variant="outline" font="normal" className="text-button" disabled={locked} onClick={() => setEditor(null)}>{t("Cancelar")}</Button><Button type="submit" disabled={!canWrite || locked}>{editor.id ? t("Guardar cambios") : t("Crear frente")}</Button></div>
          </form>
        </CardContent></Card>
      </Dialog.Content></Dialog.Portal>}
    </Dialog.Root>
    <Dialog.Root open={deletion !== null} onOpenChange={(open) => { if (!open && !locked) setDeletion(null) }}>
      {deletion && <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content role="alertdialog" className="editor-panel delete-panel" onOpenAutoFocus={(event) => { event.preventDefault(); document.getElementById("cancel-permanent-delete")?.focus() }} onEscapeKeyDown={(event) => { if (locked) event.preventDefault() }} onPointerDownOutside={(event) => { if (locked) event.preventDefault() }} onCloseAutoFocus={(event) => { event.preventDefault(); const target = deleteOpener.current; (target?.isConnected && !target.disabled ? target : trashButton.current)?.focus({ preventScroll: true }) }}>
        <Card font="normal" className="editor-card"><CardHeader font="normal" className="editor-header"><div><Dialog.Title asChild><h2>{t("Eliminar para siempre")}</h2></Dialog.Title><Dialog.Description asChild><p className="muted">{t("Se borrará")}{" "}<strong>{deletion.name}</strong>{" "}{t("junto con todos sus checks y todo su historial. No podrás recuperarlo.")}</p></Dialog.Description></div></CardHeader><CardContent font="normal" className="editor-body">
          <RequestFeedback activity={activity} onRetry={() => { void retryPending() }} />
          {saving && <p role="status">{t("Eliminando… Espera la confirmación.")}</p>}
          <div className="editor-actions"><Button id="cancel-permanent-delete" type="button" variant="outline" font="normal" className="text-button" disabled={locked} onClick={() => setDeletion(null)}>{t("Cancelar")}</Button><Button type="button" variant="destructive" font="normal" className="confirm-delete text-button" disabled={!canWrite || locked} onClick={() => { void deletePermanently() }}>{t("Eliminar para siempre")}</Button></div>
        </CardContent></Card>
      </Dialog.Content></Dialog.Portal>}
    </Dialog.Root>
  </div>
}
