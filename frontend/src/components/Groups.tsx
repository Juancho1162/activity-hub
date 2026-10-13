import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import { Dialog } from "radix-ui"
import { Check, ChevronDown, ChevronRight, Layers, Pencil, Plus, Undo2, X } from "lucide-react"
import { Button } from "@/components/ui/8bit/button"
import { Input } from "@/components/ui/8bit/input"
import { FrontIcon, FrontIconPicker } from "./FrontIcon"
import { useLanguage } from "./Language"
import { basicGroupDrafts } from "@/lib/group-defaults"
import { formatDay } from "@/lib/dates"
import type { DashboardItem, Group, GroupDraft } from "@/lib/api"

export type GroupSection = { id: string | null; name: string; icon: string; items: DashboardItem[] }
export type GroupEditor = (GroupDraft & { id: string | null }) | null
export function groupSections(groups: Group[], items: DashboardItem[], filter: string, searching: boolean, ungrouped: string): GroupSection[] {
  const sections = [...groups, { id: null, name: ungrouped, icon: "sprout" }]
    .filter(group => !filter || (group.id ?? "none") === filter)
    .map(group => ({ ...group, items: items.filter(item => (item.front.group_id ?? null) === group.id) }))
  return sections.filter(group => group.items.length > 0 || (!searching && !!filter))
}

export function GroupToolbar({ groups, value, locked, children, onChange, onManage }: {
  groups: Group[]; value: string; locked: boolean; children?: ReactNode; onChange: (value: string) => void; onManage: () => void
}) {
  const { t } = useLanguage()
  return <div className="group-toolbar"><div className="field"><label htmlFor="group-filter">{t("Grupo")}</label>
    <select id="group-filter" value={value} onChange={event => onChange(event.target.value)}>
      <option value="">{t("Todos los grupos")}</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}<option value="none">{t("Sin grupo")}</option>
    </select></div><Button type="button" variant="outline" font="normal" className="text-button manage-groups" disabled={locked} onClick={onManage}><Layers aria-hidden="true" size={18} />{t("Tus grupos")}</Button>{children}</div>
}

export function GroupLog({ sections, day, canRecord, searching, focused, busy, renderItem, onRecord, onNew }: {
  sections: GroupSection[]; day: string; canRecord: boolean; searching: boolean; focused: string | null; busy: boolean
  renderItem: (item: DashboardItem) => ReactNode; onRecord: (id: string | null) => void; onNew: (id: string | null, button: HTMLButtonElement) => void
}) {
  const { t } = useLanguage()
  return <div className="grouped-log" aria-busy={busy}>
    <p className="group-help">{t(searching ? "Borra la búsqueda para registrar un grupo completo." : "Registrar grupo añade solo los frentes abiertos pendientes. Los registros anteriores se mantienen.")}</p>
    {sections.filter(group => !focused || group.items.some(item => item.front.id === focused)).map(group => {
      const pending = group.items.filter(item => item.front.state === "open" && !item.marked_dates.includes(day)).length
      const marked = group.items.filter(item => item.marked_dates.includes(day)).length
      return <section className="log-group" data-group={group.id ?? "none"} key={group.id ?? "none"}>
        <header className="log-group-header"><FrontIcon icon={group.icon} /><div><h2>{group.name}</h2><p>{t("{marked} de {total} con registro", { marked, total: group.items.length })}</p></div>
          <Button type="button" variant="outline" font="normal" className="record-group text-button" disabled={!canRecord || searching || !pending || !!focused}
            aria-label={t("Registrar grupo {name}", { name: group.name })} onClick={() => onRecord(group.id)}>
            {pending ? <Plus aria-hidden="true" size={17} /> : <Check aria-hidden="true" size={17} />}
            <span>{t(pending ? "Registrar grupo" : "Sin pendientes")}<small>{t("{count} pendientes", { count: pending })}</small></span>
          </Button>
        </header>
        {group.items.length ? <ul className="front-list daily-list grouped-members" aria-label={t("Frentes de {name}", { name: group.name })}>{group.items.map(renderItem)}</ul>
          : <div className="empty-group"><p>{t("No hay frentes en este grupo con los filtros actuales.")}</p><Button type="button" font="normal" variant="ghost" className="text-button" disabled={busy} onClick={event => onNew(group.id, event.currentTarget)}><Plus aria-hidden="true" size={16} />{t("Añadir frente")}</Button></div>}
      </section>
    })}
    {!sections.length && <p className="empty-group">{t("No hay frentes en esta vista")}</p>}
  </div>
}

export function GroupUndo({ day, count, disabled, onUndo }: { day: string; count: number; disabled: boolean; onUndo: () => void }) {
  const { t, locale } = useLanguage()
  return <div className="group-notice"><p role="status">{t("{count} registros añadidos · {date}", { count, date: formatDay(day, false, locale) })}</p>
    {count > 0 && <Button type="button" variant="ghost" font="normal" className="text-button undo-group" disabled={disabled} onClick={onUndo}><Undo2 aria-hidden="true" size={17} />{t("Deshacer")}</Button>}
  </div>
}

function GroupDialog({ title, description, locked = false, children, onClose, onReturnFocus }: {
  title: string; description: string; locked?: boolean; children: ReactNode; onClose: () => void; onReturnFocus?: () => void
}) {
  const { t } = useLanguage()
  return <Dialog.Root open onOpenChange={open => { if (!open && !locked) onClose() }}><Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="editor-panel group-panel"
      onEscapeKeyDown={event => { if (locked) event.preventDefault() }} onPointerDownOutside={event => { if (locked) event.preventDefault() }}
      onCloseAutoFocus={event => { if (onReturnFocus) { event.preventDefault(); onReturnFocus() } }}>
      <header className="group-panel-heading"><div><Dialog.Title asChild><h2>{title}</h2></Dialog.Title><Dialog.Description asChild><p>{description}</p></Dialog.Description></div>
        <Button type="button" variant="ghost" size="icon" aria-label={t("Cerrar")} disabled={locked} onClick={onClose}><X aria-hidden="true" /></Button></header>{children}
    </Dialog.Content></Dialog.Portal></Dialog.Root>
}

export function GroupManager({ groups, editing, setEditing, locked, canWrite, feedback, onSave, onClose, onReturnFocus }: {
  groups: Group[]; locked: boolean; canWrite: boolean; feedback: ReactNode
  editing: GroupEditor; setEditing: (value: GroupEditor) => void
  onSave: (id: string | null, draft: GroupDraft) => void; onClose: () => void; onReturnFocus: () => void
}) {
  const { t, language } = useLanguage()
  const valid = !!editing?.name.trim() && [...editing.name.trim()].length <= 60 && !editing.name.includes("\0")
  return <GroupDialog title={t(editing ? editing.id ? "Editar grupo" : "Nuevo grupo" : "Tus grupos")}
    description={t("Cada grupo tiene nombre propio. Puedes repetir un icono: sus frentes y registros seguirán separados.")}
    locked={locked} onClose={onClose} onReturnFocus={onReturnFocus}>
    {editing ? <form className="group-form" onSubmit={event => { event.preventDefault(); if (valid && canWrite && !locked) onSave(editing.id, { name: editing.name.trim(), icon: editing.icon }) }}>
      <div className="field"><label htmlFor="group-name">{t("Nombre del grupo")}</label><Input id="group-name" autoFocus font="normal" className="field-input" value={editing.name} disabled={locked} maxLength={120} aria-describedby="group-name-help" onChange={event => setEditing({ ...editing, name: event.target.value })} /><p id="group-name-help" className="field-help">{t("De 1 a 60 caracteres. Puedes repetir nombres e iconos.")}</p></div>
      <FrontIconPicker group value={editing.icon} disabled={locked} onChange={icon => setEditing({ ...editing, icon })} />
      {feedback}<div className="editor-actions"><Button type="button" variant="outline" font="normal" disabled={locked} onClick={() => setEditing(null)}>{t("Volver a grupos")}</Button><Button type="submit" disabled={!canWrite || locked || !valid}>{t("Guardar grupo")}</Button></div>
    </form> : <>
      <div className="group-manager-list">{groups.map(group => <div key={group.id} data-managed-group={group.id}><FrontIcon icon={group.icon} /><strong>{group.name}</strong><Button type="button" variant="ghost" size="icon" disabled={locked || !canWrite} aria-label={t("Editar grupo {name}", { name: group.name })} onClick={() => setEditing(group)}><Pencil aria-hidden="true" size={18} /></Button></div>)}</div>
      <Button type="button" className="create-group" disabled={locked || !canWrite} onClick={() => setEditing({ id: null, name: "", icon: "sprout" })}><Plus aria-hidden="true" size={18} />{t("Nuevo grupo")}</Button>
      <p className="group-suggestions-label">{t("Ideas para empezar")}</p><div className="group-suggestions">{basicGroupDrafts(language).map(draft => <Button key={draft.name} type="button" font="normal" variant="outline" disabled={locked || !canWrite} onClick={() => setEditing({ ...draft, id: null })}><FrontIcon icon={draft.icon} />{draft.name}</Button>)}</div>
      {feedback}
    </>}
  </GroupDialog>
}

export function GroupMatrix({ sections, days, locked, renderActions, onLog }: {
  sections: GroupSection[]; days: string[]; locked: boolean; renderActions: (item: DashboardItem) => ReactNode
  onLog: (day: string, group: string | null) => void
}) {
  const { t, locale } = useLanguage()
  const [expanded, setExpanded] = useState<Set<string | null>>(() => new Set())
  const [detail, setDetail] = useState<{ day: string; group: string | null; front?: string } | null>(null)
  const [detailOpener, setDetailOpener] = useState<HTMLButtonElement | null>(null)
  const scroll = useRef<HTMLDivElement | null>(null)
  const firstDay = days[0], lastDay = days.at(-1)
  useEffect(() => { if (scroll.current) scroll.current.scrollLeft = scroll.current.scrollWidth }, [firstDay, lastDay])
  const items = sections.flatMap(section => section.items)
  const registrations = items.reduce((total, item) => total + item.count, 0)
  const activeDays = new Set(items.flatMap(item => item.marked_dates)).size
  const activeFronts = items.filter(item => item.count > 0).length
  const detailGroup = detail && sections.find(group => group.id === detail.group)
  const detailItems = detailGroup?.items.filter(item => !detail?.front || item.front.id === detail.front) ?? []
  function cell(group: GroupSection, date: string, members = group.items, front?: string) {
    const count = members.filter(item => item.marked_dates.includes(date)).length
    const name = front ? members[0].front.name : group.name
    const level = !count ? 0 : count === members.length ? 3 : count / members.length >= .5 ? 2 : 1
    const label = t("{name} · {date}: {marked} de {total} con registro", { name, date: formatDay(date, false, locale), marked: count, total: members.length })
    return <td key={date}><button type="button" className={"matrix-cell level-" + level} title={label} aria-label={label} disabled={locked}
      onClick={event => { setDetail({ day: date, group: group.id, front }); setDetailOpener(event.currentTarget) }}>{count || <span aria-hidden="true">·</span>}</button></td>
  }
  return <div className="matrix-dashboard">
    <div className="matrix-stats"><div><strong>{registrations}</strong><span>{t("Registros en el período")}</span></div><div><strong>{activeDays}<small> / {days.length}</small></strong><span>{t("Días con actividad")}</span></div><div><strong>{activeFronts}<small> / {items.length}</small></strong><span>{t("Frentes con actividad")}</span></div></div>
    <p className="group-help">{t("Despliega un grupo para ver sus frentes. Pulsa un día para consultar el detalle.")}</p>
    <div ref={scroll} className="matrix-scroll" role="region" tabIndex={0} aria-label={t("Matriz de actividad")}>
      <table className="activity-matrix"><caption className="sr-only">{t("Grupos y frentes por día. Cada número cuenta los frentes con registro.")}</caption>
        <thead><tr><th scope="col">{t("Grupo / frente")}</th>{days.map(date => <th key={date} scope="col"><time dateTime={date} title={formatDay(date, false, locale)}><span>{formatDay(date, true, locale)}</span></time></th>)}<th scope="col">{t("Total")}</th></tr></thead>
        <tbody>{sections.map(group => <Fragment key={group.id ?? "none"}>
          <tr className="matrix-group" data-group={group.id ?? "none"}><th scope="row"><button type="button" className="matrix-disclosure" aria-expanded={expanded.has(group.id)} aria-label={t("Ver frentes de {name}", { name: group.name })} onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next })}>{expanded.has(group.id) ? <ChevronDown aria-hidden="true" size={15} /> : <ChevronRight aria-hidden="true" size={15} />}<FrontIcon icon={group.icon} /><span>{group.name}<small>{t("{count} frentes", { count: group.items.length })}</small></span></button></th>{days.map(date => cell(group, date))}<td className="matrix-total">{group.items.reduce((total, item) => total + item.count, 0)}</td></tr>
          {expanded.has(group.id) && group.items.map(item => <tr key={item.front.id} className="matrix-front" data-front={item.front.id}><th scope="row"><div className="matrix-front-info"><FrontIcon icon={item.front.icon} /><span>{item.front.name}<small>{t(item.front.state === "open" ? "Abierto" : item.front.state === "standby" ? "Standby" : "Archivado")}</small></span>{renderActions(item)}</div><small className="matrix-last">{t("Último registro global")}: {item.last_registered_day ? formatDay(item.last_registered_day, true, locale) : t("Sin registros")}</small></th>{days.map(date => cell(group, date, [item], item.front.id))}<td className="matrix-total">{item.count}</td></tr>)}
        </Fragment>)}</tbody>
      </table>
    </div>
    <div className="matrix-legend"><span><i className="level-0" />{t("Sin registro")}</span><span><i className="level-1" />{t("Parte del grupo")}</span><span><i className="level-3" />{t("Todo el grupo")}</span><span>{t("Los grupos reflejan su composición actual.")}</span></div>
    {detail && detailGroup && <GroupDialog title={formatDay(detail.day, false, locale)} description={detailGroup.name} onClose={() => setDetail(null)} onReturnFocus={() => detailOpener?.isConnected && detailOpener.focus({ preventScroll: true })}>
      <ul className="group-day-detail">{detailItems.map(item => <li key={item.front.id}><FrontIcon icon={item.front.icon} /><span>{item.front.name}<small>{t(item.front.state === "open" ? "Abierto" : item.front.state === "standby" ? "Standby" : "Archivado")}</small></span><span className={item.marked_dates.includes(detail.day) ? "recorded" : ""}>{t(item.marked_dates.includes(detail.day) ? "Registrado" : "Sin registro")}</span></li>)}</ul>
      {!detailItems.length && <p>{t("Este grupo todavía no tiene frentes.")}</p>}<p className="field-help">{t("Consultar el detalle no cambia tus registros.")}</p>
      <div className="editor-actions"><Button type="button" onClick={() => { onLog(detail.day, detail.group); setDetail(null) }}>{t("Abrir registro del día")}</Button></div>
    </GroupDialog>}
  </div>
}

