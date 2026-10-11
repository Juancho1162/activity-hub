import React, { useEffect, useRef, useId } from 'react'
import { formatDay, canSelectDay } from './model.mjs'

const paths = {
  arrow: 'M4 12h16m-6-6 6 6-6 6', left: 'm14 6-6 6 6 6', right: 'm10 6 6 6-6 6',
  plus: 'M12 5v14M5 12h14', check: 'm5 12 4 4L19 6', close: 'm6 6 12 12M6 18 18 6',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  chart: 'M4 19V9m8 10V4m8 15v-7', leaf: 'M4 20c0-11 7-17 17-17 0 10-5 17-13 15M4 20 15 9',
  calendar: 'M4 5h16v16H4zM8 3v5m8-5v5M4 11h16', reset: 'M3 10a9 9 0 1 1 1 8M3 3v7h7',
  music: 'M9 18V5l11-2v13M9 7l11-2M9 18a3 2 0 1 1-6 0 3 2 0 0 1 6 0M20 16a3 2 0 1 1-6 0 3 2 0 0 1 6 0',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18', book: 'M12 6c-4-3-7-3-10-2v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-6-1-10 2v15',
  camera: 'M3 7h4l2-3h6l2 3h4v14H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  pen: 'm4 16 12-12 4 4L8 20H4zm10-10 4 4', focus: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M9 12h6m-3-3v6',
  link: 'M10 7l3-3a5 5 0 0 1 7 7l-3 3M14 17l-3 3a5 5 0 0 1-7-7l3-3m1 9 8-8',
  lock: 'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4', dots: 'M5 12h.01M12 12h.01M19 12h.01',
}
export function Icon({ name, size = 20, ...props }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.leaf} /></svg> }
export function Modal({ title, children, onClose, wide = false }) {
  const titleId = useId()
  const ref = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const dialog = ref.current
    dialog.showModal()
    return () => { dialog.close(); previous?.focus() }
  }, [])
  return <dialog ref={ref} aria-labelledby={titleId} className={`modal ${wide ? 'wide' : ''}`} onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === ref.current) { const r = ref.current.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose() } }}><div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button></div>{children}</dialog>
}
export function DayCheck({ front, day, today, onToggle, compact = false }) {
  const checked = front.days.includes(day)
  return <button className={`day-check ${checked ? 'checked' : ''} ${compact ? 'compact' : ''}`} role="checkbox" aria-checked={checked} aria-label={`${front.name}, ${formatDay(day)}: ${checked ? 'actividad registrada' : 'sin registro'}`} disabled={!canSelectDay(day,today)} onClick={() => onToggle(front.id, day)} title={`${formatDay(day)} · ${checked ? 'Quitar registro' : 'Registrar actividad'}`}><span className="check-box">{checked && <Icon name="check" size={17} />}</span>{!compact && <span>{checked ? 'Registrado' : 'Registrar día'}</span>}</button>
}
export function FrontIcon({ front }) { return <span className={`front-icon color-${front.color}`}><Icon name={front.icon} size={23} /></span> }
export function FrontActions({ front, onEdit }) { return <div className="front-actions">{front.link && <a href={front.link} target="_blank" rel="noreferrer" className="icon-button" aria-label={`Abrir enlace de ${front.name}`}><Icon name="link" size={17} /></a>}<button className="icon-button" onClick={() => onEdit(front)} aria-label={`Editar ${front.name}`}><Icon name="dots" /></button></div> }
