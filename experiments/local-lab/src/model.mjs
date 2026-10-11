import { isDay, todayInMadrid, shiftDay, daysInWindow, formatDay } from '../../../frontend/src/lib/dates.ts'
export { todayInMadrid, shiftDay, daysInWindow, formatDay, isDay }
// Leave enough calendar space for the 30-day lookback at the lower Date boundary.
export const MIN_DAY = '0001-02-01'
export const canSelectDay = (day, today) => isDay(day) && day >= MIN_DAY && day <= today
export const statuses = { open: 'Abiertos', standby: 'En pausa', archived: 'Archivados' }
export const variants = {
  jardin: { name: 'Jardín', number: '01', subtitle: 'Un poco de espacio para lo que importa.', description: 'Calma visual, tarjetas de actividad y un modo para ir frente a frente.', feature: 'Registro diario + modo enfoque', color: '#49624b' },
  orbita: { name: 'Órbita', number: '02', subtitle: 'Tu actividad, con perspectiva.', description: 'Un espacio oscuro y preciso. Toda la semana en una matriz que puedes editar.', feature: 'Semana editable + resumen visual', color: '#aea0ff' },
  cuaderno: { name: 'Cuaderno', number: '03', subtitle: 'Los días también cuentan historias.', description: 'Tipografía editorial, un calendario a mano y un diario de tus registros.', feature: 'Calendario + historial por días', color: '#ae4a2a' },
}
export function weekDays(day) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  const monday = shiftDay(day, -((weekday + 6) % 7))
  return daysInWindow(monday, shiftDay(monday, 6))
}
export function monthWindow(day, today) {
  if (!canSelectDay(day, today)) throw Error('Invalid month selection')
  const first = `${day.slice(0,7)}-01`
  const next = `${shiftDay(first,32).slice(0,7)}-01`
  const last = shiftDay(next,-1)
  return {
    first, last, next, start: first < MIN_DAY ? MIN_DAY : first, end: last > today ? today : last,
    days: daysInWindow(first,last), padding: (new Date(`${first}T12:00:00Z`).getUTCDay()+6)%7,
  }
}
export function seed(today) {
  const names = ['Aprender guitarra', 'Mi proyecto personal', 'Leer sin prisa', 'Curso de fotografía', 'Practicar inglés', 'Volver a dibujar']
  const icons = ['music', 'code', 'book', 'camera', 'globe', 'pen']
  return names.map((name, i) => ({
    id: `sample-${i}`, name, icon: icons[i], color: i, status: i === 5 ? 'standby' : 'open', link: '',
    days: Array.from({ length: 35 }, (_, n) => n).filter(n => n === 0 ? i === 0 || i === 2 : (n * (i + 3) + i) % 7 < 3).map(n => shiftDay(today, -n)).sort(),
  }))
}
export function toggleDay(fronts, id, day, today) {
  if (!canSelectDay(day, today)) return fronts
  return fronts.map(front => front.id !== id ? front : {
    ...front, days: front.days.includes(day) ? front.days.filter(d => d !== day) : [...front.days, day].sort(),
  })
}
export function frequency(front, start, end) {
  const days = daysInWindow(start, end)
  const count = days.filter(day => front.days.includes(day)).length
  return { count, total: days.length, percent: days.length ? Math.round(count / days.length * 100) : 0 }
}
export function parseSaved(raw) {
  try {
    const fronts = JSON.parse(raw)
    if (!Array.isArray(fronts)) return null
    if (!fronts.every(f => f && typeof f.id === 'string' && typeof f.name === 'string' && f.name.trim() && f.name.length <= 100 && Object.hasOwn(statuses, f.status) && typeof f.link === 'string' && (!f.link || /^https?:\/\//i.test(f.link)) && ['music','code','book','camera','globe','pen'].includes(f.icon) && Number.isInteger(f.color) && f.color >= 0 && f.color < 6 && Array.isArray(f.days) && f.days.every(isDay) && new Set(f.days).size === f.days.length)) return null
    return new Set(fronts.map(f => f.id)).size === fronts.length ? fronts : null
  } catch { return null }
}
