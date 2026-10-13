import {
  ICONS, canSelectDay, shiftDay, isDay, statuses,
  toggleDay as toggleFrontDay, undoGroup as undoFrontGroup, summarize as summarizeFronts,
} from './model.mjs'
export { todayInMadrid, shiftDay, daysInWindow, formatDay, isDay, MIN_DAY, canSelectDay, statuses } from './model.mjs'

export const GROUP_ICONS = ICONS.filter(icon => icon.id !== 'coffee')
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value, max = Infinity) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !value.includes('\0')
const validGroup = group => record(group) && text(group.id) && text(group.name, 60) && text(group.icon)
const validFront = (front, groupIds) => record(front) && text(front.id) && text(front.name, 200)
  && text(front.groupId) && groupIds.has(front.groupId)
  && typeof front.status === 'string' && Object.hasOwn(statuses, front.status)
  && Array.isArray(front.days) && front.days.every(isDay) && new Set(front.days).size === front.days.length
const withFronts = (state, fronts) => fronts === state.fronts ? state : { ...state, fronts }

export function seed(today) {
  if (!canSelectDay(today, today)) throw new Error('Invalid seed date')
  const templates = [
    ['personal', 'Personal', 'sprout', ['Ordenar mis ideas', 'Cuidar las plantas', 'Escribir en el diario']],
    ['projects', 'Proyectos', 'work', ['Mi proyecto personal', 'Pequeñas herramientas', 'La web del verano']],
    ['learning', 'Aprendizaje', 'book', ['Leer un ensayo', 'Practicar inglés', 'Curso de fotografía']],
    ['health', 'Salud', 'health', ['Salir a caminar', 'Sesión de fuerza', 'Estirar al despertar']],
    ['creativity', 'Creatividad', 'art', ['Practicar guitarra', 'Volver a dibujar', 'Escribir una historia']],
  ]
  const groups = templates.map(([id, name, icon]) => ({ id: `group-${id}`, name, icon }))
  const fronts = templates.flatMap(([id, , , names], groupIndex) => names.map((name, i) => {
    const number = groupIndex * 3 + i
    const status = i === 2 && id === 'personal' ? 'standby' : i === 2 && id === 'projects' ? 'archived' : 'open'
    const days = Array.from({ length: 60 }, (_, n) => n).filter(n => {
      // Shared blank days keep the fictional dashboard's gaps visible.
      if (n % 7 === 2 || n % 7 === 5) return false
      if (n === 0) return i === 0
      return n === 59 || (status === 'open' || n >= 7) && (n * 7 + number * 3) % 17 < 5 + number % 6
    }).map(n => shiftDay(today, -n)).sort()
    return { id: `sample-${id}-${i + 1}`, name, status, groupId: `group-${id}`, days }
  }))
  return { version: 1, groups, fronts }
}

export function groupFronts(state) {
  return state.groups.map(group => ({
    id: group.id, icon: group.icon, label: group.name,
    fronts: state.fronts.filter(front => front.groupId === group.id),
  }))
}

export function summarize(state, start, end) {
  return {
    ...summarizeFronts(state.fronts, start, end),
    groups: groupFronts(state).map(group => {
      const { activeDays, checkCount, byDay } = summarizeFronts(group.fronts, start, end)
      return { ...group, activeDays, checkCount, byDay }
    }),
  }
}

export function toggleDay(state, id, day, today) {
  return withFronts(state, toggleFrontDay(state.fronts, id, day, today))
}

export function recordGroup(state, groupId, day, today) {
  if (!canSelectDay(day, today) || !state.groups.some(group => group.id === groupId)) return { state, undo: null, added: 0 }
  const frontIds = []
  const fronts = state.fronts.map(front => {
    if (front.groupId !== groupId || front.status !== 'open' || front.days.includes(day)) return front
    frontIds.push(front.id)
    return { ...front, days: [...front.days, day].sort() }
  })
  return frontIds.length
    ? { state: withFronts(state, fronts), undo: { day, frontIds }, added: frontIds.length }
    : { state, undo: null, added: 0 }
}

export function undoGroup(state, undo) {
  return withFronts(state, undoFrontGroup(state.fronts, undo))
}

export function saveGroup(state, group) {
  if (!validGroup(group)) return state
  const saved = { ...group, name: group.name.trim() }
  const exists = state.groups.some(current => current.id === group.id)
  return { ...state, groups: exists ? state.groups.map(current => current.id === group.id ? saved : current) : [...state.groups, saved] }
}

export function saveFront(state, front) {
  if (!validFront(front, new Set(state.groups.map(group => group.id)))) return state
  const saved = { ...front, name: front.name.trim() }
  const exists = state.fronts.some(current => current.id === front.id)
  return withFronts(state, exists ? state.fronts.map(current => current.id === front.id ? saved : current) : [...state.fronts, saved])
}

export function parseSaved(raw) {
  try {
    const state = JSON.parse(raw)
    if (!record(state) || state.version !== 1 || !Array.isArray(state.groups) || !Array.isArray(state.fronts)
      || !state.groups.every(validGroup)) return null
    const groupIds = new Set(state.groups.map(group => group.id))
    if (groupIds.size !== state.groups.length || !state.fronts.every(front => validFront(front, groupIds))
      || new Set(state.fronts.map(front => front.id)).size !== state.fronts.length) return null
    return state
  } catch { return null }
}
