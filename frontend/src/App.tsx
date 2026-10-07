import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Dialog } from "radix-ui"
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, FolderOpen, LayoutDashboard, LockKeyhole, Pencil, Plus, Trash2, TriangleAlert, Undo2, X } from "lucide-react"
import { Button } from "@/components/ui/8bit/button"
import { Card, CardContent, CardHeader } from "@/components/ui/8bit/card"
import { Checkbox } from "@/components/ui/8bit/checkbox"
import { Input } from "@/components/ui/8bit/input"
import { useActivity, type Intent } from "@/hooks/useActivity"
import { createApi, safeReference, type ActivityApi, type DashboardItem, type DashboardPage, type DashboardQuery, type Front, type FrontDraft, type FrontState } from "@/lib/api"
import { daysInWindow, formatDay, isDay, shiftDay, todayInMadrid } from "@/lib/dates"

const defaultApi = createApi()
const defaultClock = () => new Date()
const PAGE_SIZE = 20
const MIN_DAY = "0001-01-01"
const stateLabels: Record<FrontState, string> = { open: "Abierto", standby: "Standby", archived: "Archivado" }
type View = "daily" | "dashboard" | "trash"
const viewLabels: Record<View, string> = { daily: "Registro diario", dashboard: "Dashboard", trash: "Papelera" }
type Navigation = { api: ActivityApi; source: View; target: View; page: DashboardPage }
type Editor = { id: string | null; name: string; reference: string; state: FrontState }
type Activity = ReturnType<typeof useActivity>
type CalendarDay = { date: string; label: string; short: string }
const percentFormat = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 })

function StateOptions({ all = false }: { all?: boolean }) {
  return <>{all && <option value="all">Todos los estados</option>}{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</>
}

function FrontInfo({ front }: { front: Front }) {
  return <div className="front-info">
    <div className="front-title"><h2>{front.name}</h2><span className={`state-badge state-${front.state}`}>{stateLabels[front.state]}</span></div>
  </div>
}

function FrontActions({ front, children }: { front: Front; children: ReactNode }) {
  const reference = safeReference(front.reference)
  const label = `Referencia de ${front.name} (nueva pestaña)`
  return <div className="front-actions">
    <span className="reference-slot" aria-hidden={reference ? undefined : true}>
      {reference && <a className="reference-link" href={reference} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}><ExternalLink aria-hidden="true" size={18} /></a>}
    </span>
    {children}
  </div>
}

function DashboardFront({ item, calendarDays, editAction }: {
  item: DashboardItem; calendarDays: CalendarDay[]; editAction: ReactNode
}) {
  const totalDays = calendarDays.length
  const percentage = percentFormat.format(totalDays ? item.count / totalDays * 100 : 0)
  return <>
    <div className="dashboard-summary">
      <FrontInfo front={item.front} />
      <div className="period-coverage">
        <output className="coverage-value retro" aria-label={`${percentage} % de los días seleccionados`}>{percentage}<span aria-hidden="true"> %</span></output>
        <p className="period-count">{item.count} de {totalDays} {totalDays === 1 ? "día registrado" : "días registrados"}</p>
      </div>
    </div>
    <div className="dashboard-meta">
      <dl><dt>Último registro global</dt><dd>{item.last_registered_day ? <time dateTime={item.last_registered_day}>{formatDay(item.last_registered_day)}</time> : "Sin registros"}</dd></dl>
      <FrontActions front={item.front}>{editAction}</FrontActions>
    </div>
    <details className="calendar-details">
      <summary><ChevronRight className="disclosure-arrow" aria-hidden="true" size={16} /><span>Ver días del período</span></summary>
      <div className="calendar-content">
        <div className="calendar-legend"><span><i className="legend-marked" aria-hidden="true" />Actividad registrada</span><span><i className="legend-empty" aria-hidden="true" />Sin actividad registrada</span></div>
        <ul className="calendar-grid" aria-label={`Días del período de ${item.front.name}`}>{calendarDays.map(({ date, label, short }) => {
          const marked = item.marked_dates.includes(date)
          const description = `${label}: ${marked ? "Actividad registrada" : "Sin actividad registrada"}`
          return <li key={date}><span role="img" aria-label={description} title={description} className={`calendar-tile ${marked ? "is-marked" : ""}`}><span aria-hidden="true">{short}</span></span></li>
        })}</ul>
      </div>
    </details>
  </>
}

function RequestFeedback({ activity, onRetry }: { activity: Activity; onRetry: () => void }) {
  if (activity.saving || (!activity.pending && !activity.mutationError)) return null
  return <div className="request-feedback">
    {activity.mutationError && <div role="alert"><h3>{activity.pending ? "Solicitud sin confirmar" : "El cambio no se ha guardado"}</h3><p>{activity.mutationError.message}</p></div>}
    {activity.pending && <>
      {activity.pending.kind === "check" && <p>Solicitud del {formatDay(activity.pending.day)}: {activity.pending.marked ? "marcar actividad" : "quitar el registro"}.</p>}
      <p className="muted">No recargues ni cierres esta pestaña. La solicitud se conserva solo en memoria para reintentarla con la misma identidad.</p>
      {!activity.saving && <Button type="button" className="text-button" font="normal" onClick={onRetry}>Reintentar solicitud</Button>}
    </>}
  </div>
}

export default function App({ api = defaultApi, clock = defaultClock, enabled = true, onWriteLockChange }: {
  api?: ActivityApi; clock?: () => Date; enabled?: boolean; onWriteLockChange?: (locked: boolean) => void
}) {
  const [today, setToday] = useState(() => todayInMadrid(clock()))
  const [requestedView, setRequestedView] = useState<View>("daily")
  const [navigation, setNavigation] = useState<Navigation | null>(null)
  const [day, setDay] = useState(today)
  const [start, setStart] = useState(() => today < "0001-01-28" ? MIN_DAY : shiftDay(today, -27))
  const [end, setEnd] = useState(today)
  const [state, setState] = useState<FrontState | "all">("open")
  const [search, setSearch] = useState("")
  const [offset, setOffset] = useState(0)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [formError, setFormError] = useState<{ field: "name" | "reference"; message: string } | null>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const newButton = useRef<HTMLButtonElement | null>(null)
  const trashButton = useRef<HTMLButtonElement | null>(null)
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
  const calendarDays = useMemo(() => days.map((date) => ({ date, label: formatDay(date), short: formatDay(date, true) })), [days])

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
    if (await activity.retry() && editorRequest) setEditor(null)
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
  function checkPreview(id: string) {
    const preview = activity.optimisticCheck
    return preview?.id === id && preview.day === day ? preview : null
  }
  function checkStatus(item: DashboardItem) {
    const preview = checkPreview(item.front.id)
    if (preview) return `${preview.marked ? "Actividad marcada" : "Actividad desmarcada"}; ${saving ? "guardando…" : "actualizando registro…"}`
    return item.marked_dates.includes(day) ? "Actividad registrada" : "Sin actividad registrada"
  }
  function check(id: string, marked: boolean | "indeterminate") {
    const boundary = todayInMadrid(clock())
    if (typeof marked !== "boolean" || !canWrite || !dailyValid || !isDay(day) || day > boundary) { setToday(boundary); return }
    void activity.perform({ kind: "check", id, day, marked, requestId: crypto.randomUUID() })
  }
  const editButton = (front: Front) => <Button type="button" font="normal" variant="ghost" className="edit-front text-button" disabled={locked} aria-label={`Editar ${front.name}`} title={`Editar ${front.name}`} onClick={(event) => openEditor(front, event.currentTarget)}><Pencil aria-hidden="true" size={18} /><span className="edit-label sr-only">Editar</span></Button>

  // Keep every hook/editor/intent mounted during reauthentication, but remove
  // private reads and the dialog portal from the DOM while the session is inactive.
  if (!enabled) return null

  return <div className="app-shell">
    <a className="skip-link" href="#contenido">Ir al contenido</a>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span><span className="brand-name retro">Activity Hub</span></div>
      <nav className="view-nav" aria-label="Vistas">
        <Button type="button" variant="ghost" className="nav-button" aria-label="Registro diario" aria-current={requestedView === "daily" ? "page" : undefined} aria-busy={navigating && requestedView === "daily"} onClick={() => chooseView("daily")}><CalendarDays aria-hidden="true" /> Registro</Button>
        <Button type="button" variant="ghost" className="nav-button" aria-current={requestedView === "dashboard" ? "page" : undefined} aria-busy={navigating && requestedView === "dashboard"} onClick={() => chooseView("dashboard")}><LayoutDashboard aria-hidden="true" /> Dashboard</Button>
        {hasTrash && <Button type="button" ref={trashButton} variant="ghost" className="nav-button trash-nav" aria-label="Papelera" title="Papelera" aria-current={requestedView === "trash" ? "page" : undefined} aria-busy={navigating && requestedView === "trash"} onClick={() => chooseView("trash")}><Trash2 aria-hidden="true" /><span className="trash-nav-label">Papelera</span></Button>}
      </nav>
      <div className="sidebar-note"><LockKeyhole aria-hidden="true" size={18} /><span>Espacio privado</span></div>
    </aside>

    <p className="sr-only" role="status">{navigating ? `Abriendo ${viewLabels[requestedView]}…` : ""}</p>
    <main id="contenido" className="main-content" tabIndex={-1} inert={navigating} aria-busy={navigating}>
      {!editor && <div className="main-feedback">
        <RequestFeedback activity={activity} onRetry={() => { void retryPending() }} />
      </div>}
      <div key={view} className="view-panel">
        <header className="page-header">
          <div><p className="eyebrow">REGISTRO PERSONAL</p><h1 className="retro">{viewLabels[view]}</h1></div>
          {view !== "trash" && <Button type="button" ref={newButton} className="new-front" aria-label="Nuevo frente" title="Nuevo frente" disabled={locked || navigating} onClick={(event) => openEditor(null, event.currentTarget)}><Plus aria-hidden="true" /><span className="new-front-label">Nuevo frente</span></Button>}
        </header>

        <Card font="normal" className="toolbar-card"><CardContent font="normal" className="card-body">
          {view === "trash" ? <div className="trash-help"><p>Recupera un frente con su estado y todos sus checks.</p><p className="muted">El contenido de la papelera se conserva y sigue ocupando espacio en tu cuenta.</p></div> : view === "daily" ? <div className="daily-controls">
            <div className="field date-field"><label htmlFor="registration-day">Fecha de registro</label><Input id="registration-day" type="date" font="normal" className="field-input" min={MIN_DAY} max={today} value={day} aria-invalid={!dailyValid} aria-describedby="date-help" onChange={(event) => chooseDay(event.target.value)} /></div>
            <div className="day-actions"><Button type="button" variant="outline" size="icon" aria-label="Día anterior" disabled={!dailyValid || day === MIN_DAY} onClick={() => chooseDay(shiftDay(day, -1))}><ChevronLeft aria-hidden="true" /></Button><Button type="button" variant="outline" size="icon" aria-label="Día siguiente" disabled={!dailyValid || day >= today} onClick={() => chooseDay(shiftDay(day, 1))}><ChevronRight aria-hidden="true" /></Button><Button type="button" variant="outline" onClick={() => { const currentToday = todayInMadrid(clock()); setToday(currentToday); chooseDay(currentToday) }}>Hoy</Button></div>
            <p id="date-help" className="date-help">Hoy, {formatDay(today, true)}</p>
          </div> : <div className="period-controls">
            <div className="field"><label htmlFor="period-start">Desde</label><Input id="period-start" type="date" font="normal" className="field-input" min={MIN_DAY} max={today} value={start} aria-invalid={!!windowError} aria-describedby="period-help" onChange={(event) => { setStart(event.target.value); setOffset(0) }} /></div>
            <div className="field"><label htmlFor="period-end">Hasta</label><Input id="period-end" type="date" font="normal" className="field-input" min={MIN_DAY} max={today} value={end} aria-invalid={!!windowError} aria-describedby="period-help" onChange={(event) => { setEnd(event.target.value); setOffset(0) }} /></div>
            <p id="period-help" className="date-help">Ambas fechas incluidas</p>
          </div>}
          <div className="filter-controls">{view !== "trash" && <div className="field"><label htmlFor="state-filter">Estado</label><select id="state-filter" value={state} onChange={(event) => { setState(event.target.value as FrontState | "all"); setOffset(0) }}><StateOptions all /></select></div>}<div className="field"><label htmlFor="name-search">Buscar por nombre</label><Input id="name-search" type="search" font="normal" className="field-input" placeholder="Nombre del frente…" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0) }} /></div></div>
        </CardContent></Card>

        {invalid ? <p className="validation-message" role="alert">{view === "daily" ? "Selecciona hoy o una fecha pasada." : windowError}</p>
          : loading && !navigating ? <Card font="normal" className="message-card"><CardContent font="normal" className="card-body"><p role="status" className="loading-message"><span className="loading-pixel" aria-hidden="true" />Cargando tus frentes…</p></CardContent></Card>
            : error ? <Card font="normal" className="message-card access-card" role="alert"><CardContent font="normal" className="card-body">
              <span className="message-icon" aria-hidden="true">{error.kind === "access-pending" || error.kind === "unauthorized" ? <LockKeyhole /> : <TriangleAlert />}</span>
              <p className="eyebrow">{error.kind === "access-pending" ? "DATOS PROTEGIDOS" : "LECTURA NO DISPONIBLE"}</p>
              <h2 className="retro">{error.kind === "access-pending" ? "Acceso privado pendiente" : error.kind === "unauthorized" ? "Acceso restringido" : "No se pudo cargar el registro"}</h2>
              <p>{error.message}</p>
              {error.kind === "access-pending" && <p className="muted">El esquema de datos no está disponible. Consulta las migraciones en el README.</p>}
              <Button type="button" variant="outline" font="normal" className="text-button" onClick={activity.refresh}>Reintentar carga</Button>
            </CardContent></Card>
              : page && <>
                <div className="results-heading"><p>{page.total} {page.total === 1 ? "frente en esta vista" : "frentes en esta vista"}</p><span>{view === "daily" ? formatDay(day) : view === "trash" ? "Todos los estados" : "Mayor porcentaje primero"}</span></div>
                {page.total === 0 ? <Card font="normal" className="message-card"><CardContent font="normal" className="card-body"><FolderOpen className="empty-icon" aria-hidden="true" /><h2>{view === "trash" ? (search.trim() ? "No hay frentes en la papelera con ese nombre" : "La papelera está vacía") : "No hay frentes en esta vista"}</h2><p className="muted">{view === "trash" ? "Los frentes que elimines aparecerán aquí para que puedas recuperarlos." : "Prueba otro estado o nombre, o crea un nuevo frente. Crear un frente no marca actividad."}</p></CardContent></Card> : <ul className={`front-list ${view === "dashboard" ? "dashboard-list" : view === "trash" ? "trash-list" : "daily-list"}`} aria-busy={saving || activity.refreshing || navigating} aria-label={view === "daily" ? "Frentes del registro diario" : view === "trash" ? "Frentes de la papelera" : "Frentes del dashboard"}>
                  {page.items.map((item) => <li key={`${item.front.id}:${view}:${page.start}:${page.end}`}><Card font="normal" className="front-card"><CardContent font="normal" className="card-body">
                    {view === "daily" ? <div className="daily-row"><Checkbox className="min-h-11 min-w-11 activity-check" aria-label={`Actividad en ${item.front.name}`} aria-describedby={`check-status-${item.front.id}`} aria-busy={!!checkPreview(item.front.id)} checked={checkPreview(item.front.id)?.marked ?? item.marked_dates.includes(day)} aria-disabled={!canWrite || !dailyValid} onClick={(event) => { if (!canWrite || !dailyValid) event.preventDefault() }} onCheckedChange={(marked) => check(item.front.id, marked)} /><div><FrontInfo front={item.front} /><p id={`check-status-${item.front.id}`} className="sr-only" aria-live="polite">{checkStatus(item)}</p></div><FrontActions front={item.front}>{editButton(item.front)}</FrontActions></div> : view === "trash" ? <div className="trash-row"><FrontInfo front={item.front} /><Button type="button" variant="outline" font="normal" className="restore-front text-button" aria-label={`Restaurar ${item.front.name}`} title={`Restaurar ${item.front.name}`} disabled={!canWrite || locked} onClick={(event) => { void restore(item.front, event.currentTarget) }}><Undo2 aria-hidden="true" size={18} /><span className="restore-label">Restaurar</span></Button></div> : <DashboardFront item={item} calendarDays={calendarDays} editAction={editButton(item.front)} />}
                  </CardContent></Card></li>)}
                </ul>}
              </>}

        <nav className="pagination" aria-label="Paginación de frentes"><Button type="button" variant="outline" font="normal" className="text-button" aria-label="Página anterior" disabled={navigating || !page || offset === 0} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}><ChevronLeft aria-hidden="true" /> Anterior</Button><span>{page ? `Página ${Math.floor(page.offset / PAGE_SIZE) + 1} de ${Math.max(1, Math.ceil(page.total / PAGE_SIZE))}` : "Página —"}</span><Button type="button" variant="outline" font="normal" className="text-button" aria-label="Página siguiente" disabled={navigating || !page || offset + PAGE_SIZE >= page.total || offset + PAGE_SIZE > 100000} onClick={() => setOffset((current) => current + PAGE_SIZE)}>Siguiente <ChevronRight aria-hidden="true" /></Button></nav>
        <footer className="page-footer">{view === "trash" ? "Restaurar conserva el estado y todos los checks del frente." : "Los estados los decides tú. Los checks se pueden corregir también en standby y archivados."}</footer>
      </div>
    </main>

    <Dialog.Root open={editor !== null} onOpenChange={(open) => { if (!open && !locked) setEditor(null) }}>
      {editor && <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="editor-panel" onOpenAutoFocus={(event) => { event.preventDefault(); document.getElementById("front-name")?.focus() }} onEscapeKeyDown={(event) => { if (locked) event.preventDefault() }} onPointerDownOutside={(event) => { if (locked) event.preventDefault() }} onCloseAutoFocus={(event) => { event.preventDefault(); const target = opener.current; (target?.isConnected && !target.disabled ? target : newButton.current)?.focus({ preventScroll: true }) }}>
        <Card font="normal" className="editor-card"><CardHeader font="normal" className="editor-header"><div><Dialog.Title asChild><h2 className="retro">{editor.id ? "Editar frente" : "Nuevo frente"}</h2></Dialog.Title><Dialog.Description asChild><p className="muted">Nombre, referencia y estado. El historial se conserva.</p></Dialog.Description></div><Button type="button" variant="ghost" size="icon" aria-label="Cerrar editor" disabled={locked} onClick={() => setEditor(null)}><X aria-hidden="true" /></Button></CardHeader><CardContent font="normal" className="editor-body">
          <form onSubmit={(event) => { void submit(event) }} noValidate>
            <div className="field"><label htmlFor="front-name">Nombre</label><Input id="front-name" font="normal" className="field-input" value={editor.name} disabled={locked} aria-invalid={formError?.field === "name"} aria-describedby={formError?.field === "name" ? "form-error" : "name-help"} onChange={(event) => updateEditor({ name: event.target.value })} /><p id="name-help" className="field-help">De 1 a 200 caracteres. No tiene que ser único.</p></div>
            <div className="field"><label htmlFor="front-reference">Enlace (opcional)</label><Input id="front-reference" type="url" font="normal" className="field-input" placeholder="https://…" value={editor.reference} disabled={locked} aria-invalid={formError?.field === "reference"} aria-describedby={formError?.field === "reference" ? "form-error" : "reference-help"} onChange={(event) => updateEditor({ reference: event.target.value })} /><p id="reference-help" className="field-help">Solo HTTP o HTTPS. Déjalo vacío para quitar el enlace.</p></div>
            <div className="field"><label htmlFor="front-state">Estado del frente</label><select id="front-state" value={editor.state} disabled={locked} onChange={(event) => updateEditor({ state: event.target.value as FrontState })}><StateOptions /></select></div>
            {formError && <p id="form-error" role="alert" className="validation-message">{formError.message}</p>}
            {!canWrite && !pending && <p className="preview-note">Guardar requiere acceso privado y una carga válida de los frentes.</p>}
            <RequestFeedback activity={activity} onRetry={() => { void retryPending() }} />
            {editor.id && hasTrash && <div className="editor-trash"><Button type="button" variant="ghost" font="normal" className="delete-front text-button" disabled={!canWrite || locked} onClick={() => { void trashEditor() }}><Trash2 aria-hidden="true" size={18} />Eliminar frente</Button><p className="field-help">Se moverá a la Papelera. Podrás recuperarlo con todo su historial.</p></div>}
            <div className="editor-actions"><Button type="button" variant="outline" font="normal" className="text-button" disabled={locked} onClick={() => setEditor(null)}>Cancelar</Button><Button type="submit" disabled={!canWrite || locked}>{editor.id ? "Guardar cambios" : "Crear frente"}</Button></div>
          </form>
        </CardContent></Card>
      </Dialog.Content></Dialog.Portal>}
    </Dialog.Root>
  </div>
}
