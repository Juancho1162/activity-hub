import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ICONS, seed, groupFronts, summarize, toggleDay, recordGroup, undoGroup, parseSaved,
  todayInMadrid, shiftDay, daysInWindow, formatDay, isDay, MIN_DAY, canSelectDay,
} from './model.mjs'

const TODAY = '2026-10-11'
const front = (id, icon = 'book', days = [], status = 'open') => ({ id, name: `Frente ${id}`, icon, status, days })
function freeze(fronts) {
  fronts.forEach(f => { Object.freeze(f.days); Object.freeze(f) })
  return Object.freeze(fronts)
}

test('el catálogo coincide con los doce iconos y etiquetas de la aplicación', () => {
  assert.deepEqual(ICONS, [
    { id: 'sprout', label: 'Planta' }, { id: 'music', label: 'Música' },
    { id: 'book', label: 'Lectura' }, { id: 'code', label: 'Código' },
    { id: 'camera', label: 'Fotografía' }, { id: 'exercise', label: 'Deporte' },
    { id: 'languages', label: 'Idiomas' }, { id: 'work', label: 'Trabajo' },
    { id: 'art', label: 'Arte' }, { id: 'coffee', label: 'Café' },
    { id: 'health', label: 'Salud' }, { id: 'nature', label: 'Naturaleza' },
  ])
})

test('agrupa en orden de catálogo y conserva el orden y las referencias de los frentes', () => {
  const fronts = freeze([front('code-1', 'code'), front('book-1'), front('music-1', 'music'), front('book-2')])
  assert.deepEqual(groupFronts(fronts), [
    { icon: 'music', label: 'Música', fronts: [fronts[2]] },
    { icon: 'book', label: 'Lectura', fronts: [fronts[1], fronts[3]] },
    { icon: 'code', label: 'Código', fronts: [fronts[0]] },
  ])
  assert.equal(groupFronts(fronts)[1].fronts[0], fronts[1])
  assert.deepEqual(groupFronts([]), [])
})

test('sin icono usa planta; las claves futuras forman grupos separados y estables', () => {
  const missing = front('missing'); delete missing.icon
  const fronts = freeze([
    front('future-b', 'future-b'), front('null', null), front('plant', 'sprout'),
    front('future-a', 'future-a'), missing, front('future-b-2', 'future-b'), front('proto', '__proto__'),
  ])
  const groups = groupFronts(fronts)
  assert.deepEqual(groups.map(g => g.icon), ['sprout', 'future-b', 'future-a', '__proto__'])
  assert.deepEqual(groups.map(g => g.fronts.map(f => f.id)), [
    ['null', 'plant', 'missing'], ['future-b', 'future-b-2'], ['future-a'], ['proto'],
  ])
  assert.equal(groups[1].label, 'Otro grupo')
})

test('cambiar un icono recalcula el grupo sin alterar días ni identidad', () => {
  const original = freeze([front('reading', 'book', ['2026-10-09', TODAY]), front('project', 'code', [TODAY])])
  const edited = original.map(f => f.id === 'reading' ? { ...f, icon: 'code' } : f)
  const summary = summarize(edited, '2026-10-09', TODAY)
  assert.equal(summary.groups.length, 1)
  assert.equal(summary.groups[0].icon, 'code')
  assert.equal(summary.groups[0].activeDays, 2)
  assert.equal(summary.groups[0].checkCount, 3)
  assert.equal(edited[0].days, original[0].days)
  assert.equal(original[0].icon, 'book')
})

test('registrar grupo añade todos los abiertos pendientes y conserva los ya marcados', () => {
  const fronts = freeze([
    front('marked', 'book', [TODAY]), front('pending-1', 'book', ['2026-10-09']),
    front('pending-2'), front('paused', 'book', [], 'standby'),
    front('archived', 'book', ['2026-10-08'], 'archived'), front('other', 'code'),
  ])
  const result = recordGroup(fronts, 'book', TODAY, TODAY)
  assert.equal(result.added, 2)
  assert.deepEqual(result.undo, { day: TODAY, frontIds: ['pending-1', 'pending-2'] })
  assert.deepEqual(result.fronts.map(f => f.days), [[TODAY], ['2026-10-09', TODAY], [TODAY], [], ['2026-10-08'], []])
  assert.equal(result.fronts[0], fronts[0])
  assert.notEqual(result.fronts[1], fronts[1])
  for (const i of [3, 4, 5]) assert.equal(result.fronts[i], fronts[i])
  assert.deepEqual(fronts[1].days, ['2026-10-09'])
})

test('deshacer solo retira los checks añadidos por ese pack, conserva previos y otros días/grupos', () => {
  const fronts = freeze([front('before', 'book', [TODAY]), front('added'), front('other', 'code')])
  const packed = recordGroup(fronts, 'book', TODAY, TODAY)
  const later = freeze(packed.fronts.map(f => f.id === 'added'
    ? { ...f, icon: 'music', days: ['2026-10-10', ...f.days] }
    : f.id === 'other' ? { ...f, days: [TODAY] } : f))
  Object.freeze(packed.undo.frontIds); Object.freeze(packed.undo)
  const restored = undoGroup(later, packed.undo)
  assert.deepEqual(restored.map(f => f.days), [[TODAY], ['2026-10-10'], [TODAY]])
  assert.equal(restored[1].icon, 'music')
  assert.equal(restored[0], later[0])
  assert.equal(restored[2], later[2])
  assert.deepEqual(later[1].days, ['2026-10-10', TODAY])
  assert.equal(undoGroup(restored, packed.undo), restored)
  assert.equal(undoGroup(fronts, null), fronts)
})

test('un grupo completamente marcado es no-op y no ofrece un undo vacío', () => {
  const fronts = freeze([front('one', 'book', [TODAY]), front('two', 'book', [TODAY])])
  assert.deepEqual(recordGroup(fronts, 'book', TODAY, TODAY), { fronts, added: 0, undo: null })
  assert.equal(recordGroup(fronts, 'book', TODAY, TODAY).fronts, fronts)
  assert.equal(recordGroup(fronts, 'camera', TODAY, TODAY).fronts, fronts)
})

test('un grupo de pausados y archivados conserva sus checks sin registrar ni desmarcar', () => {
  const fronts = freeze([front('paused', 'book', [], 'standby'), front('archived', 'book', [TODAY], 'archived')])
  assert.equal(recordGroup(fronts, 'book', TODAY, TODAY).fronts, fronts)
  assert.equal(toggleDay(fronts, 'paused', TODAY, TODAY), fronts)
  assert.equal(toggleDay(fronts, 'archived', TODAY, TODAY), fronts)
})

test('registrar planta incluye iconos ausentes/null y no mezcla claves futuras', () => {
  const missing = front('missing'); delete missing.icon
  const fronts = freeze([missing, front('null', null), front('plant', 'sprout'), front('future', 'future'), front('other', 'other')])
  const plant = recordGroup(fronts, 'sprout', TODAY, TODAY)
  assert.deepEqual(plant.undo.frontIds, ['missing', 'null', 'plant'])
  const future = recordGroup(plant.fronts, 'future', TODAY, TODAY)
  assert.equal(future.added, 1)
  assert.deepEqual(future.undo.frontIds, ['future'])
  assert.deepEqual(future.fronts[4].days, [])
})

test('no registra fechas futuras, inválidas ni fuera del margen inferior', () => {
  const fronts = freeze([front('one')])
  for (const day of ['2026-10-12', '2026-02-30', '0001-01-01', '', null]) {
    assert.equal(recordGroup(fronts, 'book', day, TODAY).fronts, fronts)
    assert.equal(recordGroup(fronts, 'book', day, TODAY).undo, null)
    assert.equal(toggleDay(fronts, 'one', day, TODAY), fronts)
  }
  assert.equal(recordGroup(fronts, 'book', TODAY, 'invalid').fronts, fronts)
})

test('un check individual es único, reversible e inmutable y mantiene orden cronológico', () => {
  const fronts = freeze([front('one', 'book', ['2026-10-09', TODAY]), front('other')])
  const marked = toggleDay(fronts, 'one', '2026-10-10', TODAY)
  assert.deepEqual(marked[0].days, ['2026-10-09', '2026-10-10', TODAY])
  assert.equal(marked[1], fronts[1])
  assert.deepEqual(toggleDay(marked, 'one', '2026-10-10', TODAY), fronts)
  assert.equal(toggleDay(fronts, 'missing', TODAY, TODAY), fronts)
})

test('dos frentes en un mismo día son un día activo y dos checks', () => {
  const fronts = freeze([front('one', 'book', [TODAY]), front('two', 'book', [TODAY])])
  const stats = summarize(fronts, TODAY, TODAY)
  assert.deepEqual(stats, {
    days: [TODAY], totalDays: 1, activeDays: 1, checkCount: 2, activeFronts: 2,
    byDay: [{ day: TODAY, count: 2, frontIds: ['one', 'two'] }],
    groups: [{ icon: 'book', label: 'Lectura', fronts, activeDays: 1, checkCount: 2,
      byDay: [{ day: TODAY, count: 2, frontIds: ['one', 'two'] }] }],
  })
})

test('el resumen incluye ceros, extremos y solo checks del período en cada grupo', () => {
  const fronts = freeze([
    front('one', 'book', ['2026-10-08', '2026-10-09', TODAY, '2026-10-12']),
    front('two', 'book', [TODAY]), front('code', 'code', ['2026-10-09']), front('empty', 'music'),
  ])
  const stats = summarize(fronts, '2026-10-09', TODAY)
  assert.deepEqual(stats.days, ['2026-10-09', '2026-10-10', TODAY])
  assert.equal(stats.totalDays, 3)
  assert.equal(stats.activeDays, 2)
  assert.equal(stats.checkCount, 4)
  assert.equal(stats.activeFronts, 3)
  assert.deepEqual(stats.byDay, [
    { day: '2026-10-09', count: 2, frontIds: ['one', 'code'] },
    { day: '2026-10-10', count: 0, frontIds: [] },
    { day: TODAY, count: 2, frontIds: ['one', 'two'] },
  ])
  assert.deepEqual(stats.groups.map(g => [g.icon, g.activeDays, g.checkCount]), [['music', 0, 0], ['book', 2, 3], ['code', 1, 1]])
  assert.deepEqual(stats.groups[0].byDay.map(d => d.count), [0, 0, 0])
  assert.equal(stats.groups[1].fronts[0], fronts[0])
})

test('el resumen usa todos los frentes recibidos, incluidos pausa/archivo, sin cambiar estados', () => {
  const fronts = freeze([front('paused', 'book', [TODAY], 'standby'), front('archived', 'code', [TODAY], 'archived')])
  const stats = summarize(fronts, TODAY, TODAY)
  assert.equal(stats.activeDays, 1)
  assert.equal(stats.checkCount, 2)
  assert.equal(stats.activeFronts, 2)
})

test('sin frentes mantiene el calendario completo y sus días sin actividad', () => {
  assert.deepEqual(summarize([], '2026-10-10', TODAY), {
    days: ['2026-10-10', TODAY], totalDays: 2, activeDays: 0, checkCount: 0, activeFronts: 0,
    byDay: [{ day: '2026-10-10', count: 0, frontIds: [] }, { day: TODAY, count: 0, frontIds: [] }], groups: [],
  })
})

test('intervalos inclusivos cruzan años y febrero bisiesto/no bisiesto', () => {
  const year = summarize([front('year', 'book', ['2025-12-31', '2026-01-02'])], '2025-12-31', '2026-01-02')
  assert.deepEqual(year.days, ['2025-12-31', '2026-01-01', '2026-01-02'])
  assert.equal(year.activeDays, 2)
  assert.equal(summarize([], '2024-02-01', '2024-02-29').totalDays, 29)
  assert.equal(summarize([], '2026-02-01', '2026-02-28').totalDays, 28)
  assert.equal(summarize([front('leap', 'book', ['2024-02-29'])], '2024-02-28', '2024-03-01').activeDays, 1)
})

test('reutiliza el límite inclusivo de 366 días y rechaza intervalos inválidos', () => {
  assert.equal(summarize([], '2024-01-01', '2024-12-31').totalDays, 366)
  for (const [start, end] of [['2024-01-01', '2025-01-01'], [TODAY, '2026-10-10'], ['invalid', TODAY], ['2026-02-30', TODAY]]) {
    const stats = summarize([front('one', 'book', [TODAY])], start, end)
    assert.deepEqual(stats.days, [])
    assert.equal(stats.activeDays, 0)
    assert.equal(stats.checkCount, 0)
    assert.equal(stats.activeFronts, 0)
    assert.deepEqual(stats.byDay, [])
  }
})

test('fechas compartidas usan Madrid y calendario real, también al cambiar de horario', () => {
  assert.equal(todayInMadrid(new Date('2026-10-10T22:30:00Z')), TODAY)
  assert.equal(todayInMadrid(new Date('2026-12-31T23:30:00Z')), '2027-01-01')
  assert.equal(shiftDay('2024-03-01', -1), '2024-02-29')
  assert.deepEqual(daysInWindow('2026-10-24', '2026-10-26'), ['2026-10-24', '2026-10-25', '2026-10-26'])
  assert.equal(isDay('2026-02-29'), false)
  assert.match(formatDay('2024-02-29'), /2024/)
})

test('el selector deja margen para la ventana de 60 días y valida hoy', () => {
  assert.equal(canSelectDay(MIN_DAY, TODAY), true)
  assert.equal(isDay(shiftDay(MIN_DAY, -59)), true)
  assert.equal(canSelectDay('0001-01-01', TODAY), false)
  assert.equal(canSelectDay('2026-10-12', TODAY), false)
  assert.equal(canSelectDay('2026-02-30', TODAY), false)
  assert.equal(canSelectDay(TODAY, 'invalid'), false)
})

test('la demo ofrece 18 frentes, cinco grupos con tres abiertos y otros estados consultables', () => {
  const fronts = seed(TODAY)
  assert.equal(fronts.length, 18)
  assert.equal(new Set(fronts.map(f => f.id)).size, fronts.length)
  assert.equal(groupFronts(fronts).length, 5)
  for (const group of groupFronts(fronts)) {
    const open = group.fronts.filter(f => f.status === 'open')
    assert.equal(open.length, 3)
    assert.ok(open.some(f => f.days.includes(TODAY)))
    assert.ok(open.some(f => !f.days.includes(TODAY)))
  }
  assert.ok(fronts.some(f => f.status === 'standby'))
  assert.ok(fronts.some(f => f.status === 'archived'))
})

test('seed es determinista con 60 días de historia y objetos independientes por demo', () => {
  const fronts = seed(TODAY), other = seed(TODAY)
  assert.deepEqual(fronts, other)
  const earliest = shiftDay(TODAY, -59)
  for (const f of fronts) {
    assert.ok(f.days.length > 0)
    assert.ok(f.days.includes(earliest))
    assert.ok(f.days.every(d => isDay(d) && d >= earliest && d <= TODAY))
    assert.deepEqual(f.days, [...new Set(f.days)].sort())
  }
  fronts[0].days.push('2026-10-12')
  fronts[0].name = 'Cambiado'
  assert.notDeepEqual(fronts, other)
  assert.equal(other[0].days.includes('2026-10-12'), false)
  assert.notEqual(other[0].name, 'Cambiado')
  assert.doesNotThrow(() => seed(MIN_DAY))
})

test('parseSaved conserva el documento válido, claves futuras, icono opcional y nombres de 200', () => {
  const missing = front('missing'); delete missing.icon
  const fronts = [front('text-id', 'future-icon', ['2024-02-29', '2099-01-01']), front('null', null), missing,
    { ...front('long'), name: 'a'.repeat(200) }]
  assert.deepEqual(parseSaved(JSON.stringify(fronts)), fronts)
  assert.deepEqual(parseSaved(JSON.stringify(seed(TODAY))), seed(TODAY))
  assert.deepEqual(parseSaved('[]'), [])
})

test('parseSaved admite 201 frentes sin imponer el límite de producción', () => {
  const fronts = Array.from({ length: 201 }, (_, i) => front(`front-${i}`))
  assert.deepEqual(parseSaved(JSON.stringify(fronts)), fronts)
})

test('parseSaved rechaza identificadores/fechas duplicados y campos malformados', () => {
  const valid = front('valid')
  const invalid = [
    [valid, { ...valid }], [{ ...valid, id: '' }], [{ ...valid, id: ' ' }], [{ ...valid, id: 1 }],
    [{ ...valid, name: '' }], [{ ...valid, name: ' ' }], [{ ...valid, name: 'a'.repeat(201) }],
    [{ ...valid, name: 'a\0b' }], [{ ...valid, name: 1 }], [{ ...valid, status: 'deleted' }],
    [{ ...valid, status: '__proto__' }], [{ ...valid, icon: 1 }], [{ ...valid, icon: {} }],
    [{ ...valid, days: [TODAY, TODAY] }], [{ ...valid, days: ['2026-02-30'] }],
    [{ ...valid, days: [null] }], [{ ...valid, days: TODAY }], [null], [[]],
  ]
  for (const value of invalid) assert.equal(parseSaved(JSON.stringify(value)), null, JSON.stringify(value))
  for (const raw of ['oops', '{}', 'null', '123', '"text"']) assert.equal(parseSaved(raw), null)
})
