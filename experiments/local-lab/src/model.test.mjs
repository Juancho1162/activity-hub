import test from 'node:test'
import assert from 'node:assert/strict'
import { seed, toggleDay, frequency, parseSaved, weekDays, todayInMadrid, canSelectDay, MIN_DAY, shiftDay, monthWindow } from './model.mjs'

test('un único registro por frente y día, reversible y sin mutar otros frentes', () => {
  const original = seed('2026-10-11')
  const front = original[0]
  const marked = toggleDay(original, front.id, '2026-10-10', '2026-10-11')
  assert.notEqual(marked[0].days.includes('2026-10-10'), front.days.includes('2026-10-10'))
  assert.deepEqual(toggleDay(marked, front.id, '2026-10-10', '2026-10-11'), original)
  assert.equal(marked[1], original[1])
})
test('rechaza fechas futuras e inválidas; archivar conserva el historial', () => {
  const fronts = seed('2026-10-11')
  assert.equal(toggleDay(fronts, fronts[0].id, '2026-10-12', '2026-10-11'), fronts)
  assert.equal(toggleDay(fronts, fronts[0].id, '2026-02-30', '2026-10-11'), fronts)
  const archived = { ...fronts[0], status: 'archived' }
  assert.deepEqual(archived.days, fronts[0].days)
})
test('frecuencia usa todos los días del período, incluidos los extremos', () => {
  const front = { days: ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-10', '2026-09-30'] }
  assert.deepEqual(frequency(front, '2026-10-01', '2026-10-10'), { count: 4, total: 10, percent: 40 })
  assert.deepEqual(frequency(front, '2026-10-10', '2026-10-10'), { count: 1, total: 1, percent: 100 })
})
test('semana lunes-domingo y hoy en Madrid, también alrededor de medianoche', () => {
  assert.deepEqual(weekDays('2026-10-11'), ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11'])
  assert.equal(todayInMadrid(new Date('2026-10-10T22:30:00Z')), '2026-10-11')
})
test('carga local validada, admite lista vacía y rechaza contenido malformado', () => {
  const fronts = seed('2026-10-11')
  assert.deepEqual(parseSaved(JSON.stringify(fronts)), fronts)
  assert.deepEqual(parseSaved('[]'), [])
  for (const value of ['oops', '{}', '[null]', JSON.stringify([{ ...fronts[0], days: ['invalid'] }]), JSON.stringify([{ ...fronts[0], status: 'deleted' }])]) {
    assert.equal(parseSaved(value), null)
  }
})

test('el selector deja espacio para las ventanas históricas en el límite inferior', () => {
  assert.equal(canSelectDay('0001-01-01', '2026-10-11'), false)
  assert.equal(canSelectDay(MIN_DAY, '2026-10-11'), true)
  assert.equal(canSelectDay('2026-10-12', '2026-10-11'), false)
  assert.equal(canSelectDay('2026-02-30', '2026-10-11'), false)
  assert.equal(shiftDay(MIN_DAY, -29), '0001-01-03')
  const fronts = seed('2026-10-11')
  assert.equal(toggleDay(fronts, fronts[0].id, '0001-01-01', '2026-10-11'), fronts)
})

test('los 201 frentes creados siguen siendo cargables al recargar', () => {
  const template = seed('2026-10-11')[0]
  const fronts = Array.from({length:201}, (_,i) => ({...template,id:`front-${i}`}))
  assert.deepEqual(parseSaved(JSON.stringify(fronts)), fronts)
})

test('el detalle mensual incluye todos los días y limita el período estadístico a hoy', () => {
  const current = monthWindow('2026-10-11', '2026-10-11')
  assert.equal(current.days.length, 31)
  assert.equal(current.start, '2026-10-01')
  assert.equal(current.end, '2026-10-11')
  assert.equal(current.padding, 3)
  assert.deepEqual(frequency({days:['2026-10-01','2026-10-11']},current.start,current.end),{count:2,total:11,percent:18})
  const leap = monthWindow('2024-02-01','2026-10-11')
  assert.equal(leap.days.length,29)
  assert.equal(leap.end,'2024-02-29')
  assert.equal(monthWindow(MIN_DAY,'2026-10-11').start,MIN_DAY)
})
