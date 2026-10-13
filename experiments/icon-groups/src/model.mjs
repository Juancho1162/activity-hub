import { isDay, todayInMadrid, shiftDay, daysInWindow, formatDay } from '../../../frontend/src/lib/dates.ts'
export { todayInMadrid, shiftDay, daysInWindow, formatDay, isDay }

// Keep the complete 60-day lookback inside the shared calendar's lower boundary.
export const MIN_DAY = '0001-03-01'
export const canSelectDay = (day, today) => isDay(day) && isDay(today) && day >= MIN_DAY && day <= today
export const ICONS = [
  { id: 'sprout', label: 'Planta' }, { id: 'music', label: 'Música' },
  { id: 'book', label: 'Lectura' }, { id: 'code', label: 'Código' },
  { id: 'camera', label: 'Fotografía' }, { id: 'exercise', label: 'Deporte' },
  { id: 'languages', label: 'Idiomas' }, { id: 'work', label: 'Trabajo' },
  { id: 'art', label: 'Arte' }, { id: 'coffee', label: 'Café' },
  { id: 'health', label: 'Salud' }, { id: 'nature', label: 'Naturaleza' },
]
export const statuses = { open: 'Abiertos', standby: 'En pausa', archived: 'Archivados' }
const labels = new Map(ICONS.map(({ id, label }) => [id, label]))
const iconOf = front => front.icon ?? 'sprout'

export function seed(today) {
  if (!canSelectDay(today, today)) throw new Error('Invalid seed date')
  const templates = [
    ['book', ['Leer al terminar el día', 'Club de lectura', 'Ensayos y curiosidades', 'Retomar aquella novela']],
    ['code', ['Mi proyecto personal', 'Aprender TypeScript', 'Pequeñas herramientas', 'La web del verano']],
    ['music', ['Practicar guitarra', 'Piano sin prisa', 'Componer una melodía', 'Volver al violín']],
    ['exercise', ['Salir a caminar', 'Sesión de fuerza', 'Estirar al despertar']],
    ['languages', ['Conversación en inglés', 'Escuchar francés', 'Vocabulario de italiano']],
  ]
  let index = 0
  return templates.flatMap(([icon, names]) => names.map((name, i) => {
    const number = index++
    const status = i < 3 ? 'open' : icon === 'code' ? 'archived' : 'standby'
    const days = Array.from({ length: 60 }, (_, n) => n)
      .filter(n => n === 0 ? i === 0 : n === 59 || (status === 'open' || n >= 7) && (n * 7 + number * 3) % 17 < 5 + number % 6)
      .map(n => shiftDay(today, -n)).sort()
    return { id: `sample-${icon}-${i + 1}`, name, icon, status, days }
  }))
}

export function groupFronts(fronts) {
  const groups = new Map()
  for (const front of fronts) {
    const icon = iconOf(front)
    if (!groups.has(icon)) groups.set(icon, { icon, label: labels.get(icon) ?? 'Otro grupo', fronts: [] })
    groups.get(icon).fronts.push(front)
  }
  // Catalog order comes first; unknown IDs keep their first appearance order.
  return [...labels.keys(), ...[...groups.keys()].filter(icon => !labels.has(icon))]
    .filter(icon => groups.has(icon)).map(icon => groups.get(icon))
}

function byDay(fronts, days) {
  return days.map(day => {
    const frontIds = fronts.filter(front => front.days.includes(day)).map(front => front.id)
    return { day, count: frontIds.length, frontIds }
  })
}

const totals = entries => ({
  activeDays: entries.filter(entry => entry.count > 0).length,
  checkCount: entries.reduce((sum, entry) => sum + entry.count, 0),
})

export function summarize(fronts, start, end) {
  const days = daysInWindow(start, end)
  const entries = byDay(fronts, days)
  return {
    days, totalDays: days.length, ...totals(entries),
    activeFronts: new Set(entries.flatMap(entry => entry.frontIds)).size,
    byDay: entries,
    groups: groupFronts(fronts).map(group => {
      const entries = byDay(group.fronts, days)
      return { ...group, ...totals(entries), byDay: entries }
    }),
  }
}

export function toggleDay(fronts, id, day, today) {
  if (!canSelectDay(day, today)) return fronts
  const index = fronts.findIndex(front => front.id === id)
  if (index < 0 || fronts[index].status !== 'open') return fronts
  return fronts.map((front, i) => i !== index ? front : {
    ...front, days: front.days.includes(day) ? front.days.filter(d => d !== day) : [...front.days, day].sort(),
  })
}

export function recordGroup(fronts, icon, day, today) {
  if (!canSelectDay(day, today)) return { fronts, undo: null, added: 0 }
  const frontIds = []
  const updated = fronts.map(front => {
    if (iconOf(front) !== (icon ?? 'sprout') || front.status !== 'open' || front.days.includes(day)) return front
    frontIds.push(front.id)
    return { ...front, days: [...front.days, day].sort() }
  })
  return frontIds.length
    ? { fronts: updated, undo: { day, frontIds }, added: frontIds.length }
    : { fronts, undo: null, added: 0 }
}

export function undoGroup(fronts, undo) {
  if (!undo || !isDay(undo.day) || !Array.isArray(undo.frontIds)) return fronts
  const ids = new Set(undo.frontIds)
  let changed = false
  const updated = fronts.map(front => {
    if (!ids.has(front.id) || !front.days.includes(undo.day)) return front
    changed = true
    return { ...front, days: front.days.filter(day => day !== undo.day) }
  })
  return changed ? updated : fronts
}

export function parseSaved(raw) {
  try {
    const fronts = JSON.parse(raw)
    if (!Array.isArray(fronts) || !fronts.every(front => front && !Array.isArray(front)
      && typeof front.id === 'string' && front.id.trim().length > 0
      && typeof front.name === 'string' && front.name.trim().length > 0 && front.name.length <= 200 && !front.name.includes('\0')
      && typeof front.status === 'string' && Object.hasOwn(statuses, front.status)
      && (front.icon == null || typeof front.icon === 'string')
      && Array.isArray(front.days) && front.days.every(isDay) && new Set(front.days).size === front.days.length)) return null
    return new Set(fronts.map(front => front.id)).size === fronts.length ? fronts : null
  } catch { return null }
}
