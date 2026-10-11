import React, { useState } from 'react'
import { Icon, Modal, DayCheck, FrontIcon, FrontActions } from './ui.jsx'
import { formatDay, daysInWindow, shiftDay, frequency, monthWindow, canSelectDay, MIN_DAY, statuses } from './model.mjs'

const monthLabel = day => new Intl.DateTimeFormat('es', {month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`))

export function Garden({ fronts, day, today, onToggle, onEdit, onNew, onHistory, status }) {
  const historyDays = daysInWindow(shiftDay(day,-13),day)
  const recorded = fronts.filter(front => front.days.includes(day)).length
  return <section className="garden-section" aria-label="Tus frentes">
    <div className="garden-list-heading">
      <h2>{statuses[status]} <span>{fronts.length}</span></h2>
      <p><i />{recorded} {recorded === 1 ? 'frente con registro' : 'frentes con registro'} {day === today ? 'hoy' : `el ${formatDay(day,true)}`}</p>
    </div>
    <div className="garden-cards">
      {fronts.map(front => {
        const last = front.days.at(-1)
        return <article className={`garden-card ${front.days.includes(day) ? 'has-record' : ''}`} key={front.id}>
          <div className="card-top"><FrontIcon front={front} /><FrontActions front={front} onEdit={onEdit} /></div>
          <h3>{front.name}</h3>
          <p className="card-status">{last ? `Último registro: ${last === today ? 'hoy' : formatDay(last,true)}` : 'Tu primer registro, cuando quieras.'}</p>
          <button className="garden-history-button" aria-label={`Ver historial de ${front.name}`} onClick={() => onHistory(front.id)}>
            <span className="garden-history-dots" aria-hidden="true">{historyDays.map(date => <i key={date} className={front.days.includes(date) ? 'marked' : ''}/>)}</span>
            <span className="garden-history-caption"><span>Últimos 14 días</span><span>Ver historial <Icon name="arrow" size={12}/></span></span>
          </button>
          <div className="card-bottom"><DayCheck front={front} day={day} today={today} onToggle={onToggle}/><span className="garden-card-date">{day === today ? 'Hoy' : formatDay(day,true)}</span></div>
        </article>
      })}
      <button className="add-card" onClick={onNew}><span><Icon name="plus" size={25}/></span><strong>Un nuevo comienzo</strong><span>Haz sitio a otra de tus ideas.</span></button>
    </div>
  </section>
}

export function FrontHistory({ front, day, today, onToggle, onClose }) {
  const [viewDay,setViewDay] = useState(day)
  const window = monthWindow(viewDay,today)
  const stats = frequency(front,window.start,window.end)
  const currentMonth = viewDay.slice(0,7) === today.slice(0,7)
  return <Modal title="Los días de este frente" onClose={onClose} wide>
    <div className="front-history">
      <div className="front-history-intro"><FrontIcon front={front}/><div><h3>{front.name}</h3><p>Un registro por día. Un espacio para volver a mirar.</p></div></div>
      <div className="front-history-toolbar">
        <button className="icon-button" aria-label="Mes anterior del frente" disabled={window.first <= MIN_DAY} onClick={() => setViewDay(shiftDay(window.first,-1))}><Icon name="left"/></button>
        <h4>{monthLabel(viewDay)}</h4>
        <button className="icon-button" aria-label="Mes siguiente del frente" disabled={currentMonth} onClick={() => setViewDay(window.next)}><Icon name="right"/></button>
      </div>
      <div className="front-month-grid" aria-label={`Registros de ${monthLabel(viewDay)}`}>
        {['L','M','X','J','V','S','D'].map(label => <span className="front-weekday" key={label}>{label}</span>)}
        {Array.from({length:window.padding},(_,i) => <span key={`padding-${i}`}/>)}
        {window.days.map(date => {
          const marked = front.days.includes(date)
          return <button key={date} data-day={date} role="checkbox" aria-checked={marked}
            aria-label={`${formatDay(date)}: ${marked ? 'actividad registrada' : 'sin registro'}`}
            className={`${marked ? 'marked' : ''} ${date === today ? 'today' : ''}`}
            disabled={!canSelectDay(date,today)} onClick={() => onToggle(front.id,date)}>
            <span>{Number(date.slice(-2))}</span>{marked && <Icon name="check" size={12}/>}
          </button>
        })}
      </div>
      <div className="front-history-legend"><span><i/> Sin registro</span><span><i className="marked"/> Con registro</span><button className="quiet-button" disabled={currentMonth} onClick={() => setViewDay(today)}>Ir al mes actual</button></div>
      <div className="front-history-summary"><div><strong>{stats.count}<span> / {stats.total}</span></strong><span>días con registro</span></div><div><strong>{stats.percent}<span>%</span></strong><span>del período</span></div><Icon name="leaf" size={36}/></div>
      <p className="front-history-period">{formatDay(window.start)} — {formatDay(window.end)} · Europe/Madrid</p>
      <p className="front-history-help">Toca un día para registrar o quitar actividad. Los cambios se guardan al instante en esta demo. Los días en blanco no son una deuda.</p>
    </div>
  </Modal>
}

export function GardenLandingPreview({ fronts, day, today, onToggle, onEnter }) {
  const examples = fronts.filter(front => front.status === 'open').slice(0,3)
  return <section className="garden-live-section" aria-labelledby="garden-live-title">
    <div className="garden-live-copy"><p className="eyebrow">UN GESTO PEQUEÑO</p><h2 id="garden-live-title">Hoy guitarra.<br/>Mañana, <em>ya veremos.</em></h2><p>No hace falta convertir cada afición en un objetivo. Marca los días que le dedicas tiempo y conserva el hilo de lo que te importa.</p><span><Icon name="leaf" size={16}/> Prueba los checks. Esta vista es interactiva.</span></div>
    <div className="garden-live-window">
      <div className="garden-live-heading"><span><Icon name="calendar" size={16}/>{day === today ? 'Hoy' : formatDay(day,true)}<small>{formatDay(day)}</small></span><span className="garden-live-badge">Tu demo</span></div>
      {examples.map(front => <div className="garden-live-row" key={front.id}><FrontIcon front={front}/><span>{front.name}</span><DayCheck front={front} day={day} today={today} onToggle={onToggle} compact/></div>)}
      {!examples.length && <p className="garden-live-empty">Tu espacio está listo para un nuevo frente.</p>}
      <button className="garden-live-open" onClick={onEnter}>Entrar a mi jardín <Icon name="arrow" size={17}/></button>
    </div>
  </section>
}
