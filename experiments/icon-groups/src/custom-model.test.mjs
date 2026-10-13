import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GROUP_ICONS, seed, groupFronts, summarize, toggleDay, recordGroup, undoGroup,
  saveGroup, saveFront, parseSaved, todayInMadrid, shiftDay, MIN_DAY, canSelectDay,
} from './custom-model.mjs'
import { ICONS } from './model.mjs'

const TODAY = '2026-10-11'
const group = (id, name = `Grupo ${id}`, icon = 'book') => ({ id, name, icon })
const front = (id, groupId = 'a', days = [], status = 'open') => ({ id, name: `Frente ${id}`, groupId, status, days })
const stateOf = (groups, fronts = []) => ({ version: 1, groups, fronts })
function freeze(state) {
  state.groups.forEach(Object.freeze)
  state.fronts.forEach(f => { Object.freeze(f.days); Object.freeze(f) })
  Object.freeze(state.groups); Object.freeze(state.fronts)
  return Object.freeze(state)
}

test('las opciones reutilizan el catálogo sin Café y las fechas compartidas', () => {
  assert.deepEqual(GROUP_ICONS, ICONS.filter(icon => icon.id !== 'coffee'))
  assert.equal(GROUP_ICONS.length, 11)
  assert.ok(GROUP_ICONS.some(icon => icon.id === 'work'))
  assert.ok(GROUP_ICONS.some(icon => icon.id === 'health'))
  assert.equal(todayInMadrid(new Date('2026-10-10T22:30:00Z')), TODAY)
  assert.equal(canSelectDay('2026-10-12', TODAY), false)
  assert.equal(canSelectDay(MIN_DAY, TODAY), true)
})

test('grupos con mismo nombre/icono son independientes, mantienen orden e incluyen vacíos', () => {
  const state = freeze(stateOf([group('b', 'Lectura'), group('empty', 'Sin frentes'), group('a', 'Lectura')], [front('one'), front('two', 'b')]))
  const groups = groupFronts(state)
  assert.deepEqual(groups, [
    { id: 'b', icon: 'book', label: 'Lectura', fronts: [state.fronts[1]] },
    { id: 'empty', icon: 'book', label: 'Sin frentes', fronts: [] },
    { id: 'a', icon: 'book', label: 'Lectura', fronts: [state.fronts[0]] },
  ])
  assert.equal(groups[2].fronts[0], state.fronts[0])
  assert.deepEqual(groupFronts(stateOf([])), [])
})

test('renombrar o cambiar icono solo cambia metadatos, conserva membresías e historial', () => {
  const state = freeze(stateOf([group('a'), group('b', 'Otro', 'code')], [front('one', 'a', [TODAY])]))
  const changed = saveGroup(state, { ...state.groups[0], name: '  Mi lectura  ', icon: 'code' })
  assert.equal(changed.groups[0].name, 'Mi lectura')
  assert.equal(changed.groups[0].icon, 'code')
  assert.equal(changed.groups[1], state.groups[1])
  assert.equal(changed.fronts, state.fronts)
  assert.deepEqual(groupFronts(changed).map(g => [g.id, g.fronts.length]), [['a', 1], ['b', 0]])
  assert.equal(summarize(changed, TODAY, TODAY).groups[0].checkCount, 1)
  assert.equal(state.groups[0].name, 'Grupo a')
})

test('crear grupo acepta nombres/iconos repetidos, conserva ID y no muta su entrada', () => {
  const state = freeze(stateOf([group('a', 'Lectura')]))
  const draft = Object.freeze(group('b', '  Lectura  '))
  const created = saveGroup(state, draft)
  assert.deepEqual(created.groups, [state.groups[0], group('b', 'Lectura')])
  assert.equal(created.fronts, state.fronts)
  assert.equal(draft.name, '  Lectura  ')
  const future = saveGroup(created, group('future', 'Otra categoría', 'future-icon'))
  assert.equal(future.groups.at(-1).icon, 'future-icon')
})

test('saveGroup rechaza metadatos inválidos sin cambiar el estado', () => {
  const state = freeze(stateOf([group('a')]))
  for (const draft of [null, [], group(''), group(' '), group('a', ''), group('a', ' '),
    group('a', 'a'.repeat(61)), group('a', 'a\0b'), group('a', 'Válido', ''),
    group('a', 'Válido', 1), group('a', 'Válido', null)]) {
    assert.equal(saveGroup(state, draft), state)
  }
})

test('mover y renombrar un frente conserva identidad, días y orden, recalcula resúmenes', () => {
  const state = freeze(stateOf([group('a'), group('b')], [front('one', 'a', ['2026-10-09', TODAY]), front('two', 'b', [TODAY])]))
  const moved = saveFront(state, { ...state.fronts[0], name: '  Nuevo nombre  ', groupId: 'b' })
  assert.equal(moved.groups, state.groups)
  assert.equal(moved.fronts[0].id, 'one')
  assert.equal(moved.fronts[0].name, 'Nuevo nombre')
  assert.equal(moved.fronts[0].days, state.fronts[0].days)
  assert.equal(moved.fronts[1], state.fronts[1])
  assert.deepEqual(summarize(moved, '2026-10-09', TODAY).groups.map(g => [g.id, g.activeDays, g.checkCount]), [['a', 0, 0], ['b', 2, 3]])
  assert.equal(state.fronts[0].groupId, 'a')
})

test('crear/editar un frente completo mantiene grupo válido, estados e historial suministrado', () => {
  const state = freeze(stateOf([group('a')]))
  const created = saveFront(state, { ...front('new', 'a', ['2024-02-29']), name: '  Leer  ' })
  assert.equal(created.fronts.length, 1)
  assert.equal(created.fronts[0].name, 'Leer')
  const closed = saveFront(created, { ...created.fronts[0], status: 'archived' })
  assert.equal(closed.fronts.length, 1)
  assert.equal(closed.fronts[0].status, 'archived')
  assert.equal(closed.fronts[0].days, created.fronts[0].days)
  assert.equal(created.fronts[0].status, 'open')
})

test('saveFront rechaza referencia ausente/desconocida y valores inválidos sin borrar historial', () => {
  const state = freeze(stateOf([group('a')], [front('one', 'a', [TODAY])]))
  const valid = state.fronts[0]
  for (const draft of [null, [], { ...valid, id: '' }, { ...valid, name: '' },
    { ...valid, name: 'a'.repeat(201) }, { ...valid, name: 'a\0b' }, { ...valid, status: 'deleted' },
    { ...valid, groupId: 'unknown' }, { ...valid, groupId: undefined }, { ...valid, days: undefined },
    { ...valid, days: [TODAY, TODAY] }, { ...valid, days: ['2026-02-30'] }]) {
    assert.equal(saveFront(state, draft), state)
  }
})

test('registro en bloque usa solo ID aunque otro grupo comparta icono, conserva checks previos', () => {
  const state = freeze(stateOf([group('a'), group('b')], [
    front('before', 'a', [TODAY]), front('pending', 'a', ['2026-10-09']), front('pending-2'),
    front('paused', 'a', [], 'standby'), front('archived', 'a', ['2026-10-08'], 'archived'), front('other', 'b'),
  ]))
  const result = recordGroup(state, 'a', TODAY, TODAY)
  assert.equal(result.added, 2)
  assert.deepEqual(result.undo, { day: TODAY, frontIds: ['pending', 'pending-2'] })
  assert.deepEqual(result.state.fronts.map(f => f.days), [[TODAY], ['2026-10-09', TODAY], [TODAY], [], ['2026-10-08'], []])
  assert.equal(result.state.groups, state.groups)
  for (const i of [0, 3, 4, 5]) assert.equal(result.state.fronts[i], state.fronts[i])
  assert.deepEqual(state.fronts[1].days, ['2026-10-09'])
})

test('repetir el bloque es idempotente; grupos vacíos/desconocidos son no-op sin undo', () => {
  const state = freeze(stateOf([group('a'), group('empty')], [front('one')]))
  const once = recordGroup(state, 'a', TODAY, TODAY)
  assert.equal(once.added, 1)
  for (const id of ['a', 'empty', 'unknown']) {
    const result = recordGroup(once.state, id, TODAY, TODAY)
    assert.equal(result.state, once.state)
    assert.equal(result.added, 0)
    assert.equal(result.undo, null)
  }
})

test('deshacer solo quita el pack exacto y conserva otros días, grupos, estados y checks previos', () => {
  const state = freeze(stateOf([group('a'), group('b')], [front('before', 'a', [TODAY]), front('added'), front('other', 'b')]))
  const packed = recordGroup(state, 'a', TODAY, TODAY)
  const later = freeze({ ...packed.state, fronts: packed.state.fronts.map(f => f.id === 'added'
    ? { ...f, groupId: 'b', status: 'standby', days: ['2026-10-10', ...f.days] }
    : f.id === 'other' ? { ...f, days: [TODAY] } : f) })
  Object.freeze(packed.undo.frontIds); Object.freeze(packed.undo)
  const restored = undoGroup(later, packed.undo)
  assert.deepEqual(restored.fronts.map(f => f.days), [[TODAY], ['2026-10-10'], [TODAY]])
  assert.equal(restored.fronts[1].groupId, 'b')
  assert.equal(restored.fronts[1].status, 'standby')
  assert.equal(restored.fronts[0], later.fronts[0])
  assert.equal(restored.fronts[2], later.fronts[2])
  assert.equal(restored.groups, later.groups)
  assert.deepEqual(later.fronts[1].days, ['2026-10-10', TODAY])
  assert.equal(undoGroup(restored, packed.undo), restored)
  assert.equal(undoGroup(state, null), state)
})

test('check individual abierto es reversible e inmutable y conserva grupos/otros frentes', () => {
  const state = freeze(stateOf([group('a')], [front('one', 'a', ['2026-10-09', TODAY]), front('other')]))
  const marked = toggleDay(state, 'one', '2026-10-10', TODAY)
  assert.deepEqual(marked.fronts[0].days, ['2026-10-09', '2026-10-10', TODAY])
  assert.equal(marked.groups, state.groups)
  assert.equal(marked.fronts[1], state.fronts[1])
  assert.deepEqual(toggleDay(marked, 'one', '2026-10-10', TODAY), state)
})

test('futuros, fechas inválidas/límite y frentes cerrados no registran ni desmarcan', () => {
  const state = freeze(stateOf([group('a')], [front('open'), front('paused', 'a', [], 'standby'), front('archived', 'a', [TODAY], 'archived')]))
  for (const day of ['2026-10-12', '2026-02-30', '0001-01-01', '', null]) {
    assert.equal(toggleDay(state, 'open', day, TODAY), state)
    assert.deepEqual(recordGroup(state, 'a', day, TODAY), { state, undo: null, added: 0 })
  }
  for (const id of ['paused', 'archived', 'unknown']) assert.equal(toggleDay(state, id, TODAY, TODAY), state)
  assert.equal(recordGroup(state, 'a', TODAY, 'invalid').state, state)
  assert.equal(toggleDay(state, 'open', MIN_DAY, TODAY).fronts[0].days.includes(MIN_DAY), true)
})

test('estadísticas unen días, cuentan pares frente/día y mantienen grupos homónimos y vacíos', () => {
  const state = freeze(stateOf([group('a', 'Lectura'), group('b', 'Lectura'), group('empty')], [
    front('one', 'a', ['2026-10-09', TODAY]), front('two', 'a', [TODAY]), front('other', 'b', [TODAY]),
  ]))
  const stats = summarize(state, '2026-10-09', TODAY)
  assert.equal(stats.totalDays, 3)
  assert.equal(stats.activeDays, 2)
  assert.equal(stats.checkCount, 4)
  assert.equal(stats.activeFronts, 3)
  assert.deepEqual(stats.byDay, [
    { day: '2026-10-09', count: 1, frontIds: ['one'] },
    { day: '2026-10-10', count: 0, frontIds: [] },
    { day: TODAY, count: 3, frontIds: ['one', 'two', 'other'] },
  ])
  assert.deepEqual(stats.groups.map(g => [g.id, g.activeDays, g.checkCount]), [['a', 2, 3], ['b', 1, 1], ['empty', 0, 0]])
  assert.deepEqual(stats.groups[2].byDay.map(d => d.count), [0, 0, 0])
  assert.equal(stats.groups[0].fronts[0], state.fronts[0])
  assert.equal(stats.groups[0].label, 'Lectura')
})

test('el resumen respeta el conjunto filtrado suministrado y conserva historial de pausa/archivo', () => {
  const state = stateOf([group('a'), group('b')], [front('paused', 'a', [TODAY], 'standby'), front('archived', 'b', [TODAY], 'archived')])
  assert.equal(summarize(state, TODAY, TODAY).checkCount, 2)
  const filtered = { ...state, groups: state.groups.filter(g => g.id === 'b'), fronts: state.fronts.filter(f => f.groupId === 'b') }
  assert.equal(summarize(filtered, TODAY, TODAY).checkCount, 1)
  assert.deepEqual(summarize(filtered, TODAY, TODAY).groups.map(g => g.id), ['b'])
})

test('intervalos inclusivos, años, febrero y límites reutilizan las reglas anteriores', () => {
  const state = stateOf([group('a')], [front('one', 'a', ['2025-12-31', '2026-01-02'])])
  assert.deepEqual(summarize(state, '2025-12-31', '2026-01-02').days, ['2025-12-31', '2026-01-01', '2026-01-02'])
  assert.equal(summarize(state, '2025-12-31', '2026-01-02').checkCount, 2)
  assert.equal(summarize(state, '2024-02-01', '2024-02-29').totalDays, 29)
  assert.equal(summarize(state, '2026-02-01', '2026-02-28').totalDays, 28)
  assert.equal(summarize(state, '2024-01-01', '2024-12-31').totalDays, 366)
  for (const [start, end] of [['invalid', TODAY], [TODAY, '2026-10-10'], ['2024-01-01', '2025-01-01']]) {
    const stats = summarize(state, start, end)
    assert.deepEqual(stats.days, [])
    assert.equal(stats.checkCount, 0)
    assert.equal(stats.activeDays, 0)
    assert.equal(stats.groups[0].checkCount, 0)
  }
})

test('estado vacío válido conserva todos los ceros del calendario', () => {
  const state = stateOf([])
  assert.deepEqual(summarize(state, TODAY, TODAY), {
    days: [TODAY], totalDays: 1, activeDays: 0, checkCount: 0, activeFronts: 0,
    byDay: [{ day: TODAY, count: 0, frontIds: [] }], groups: [],
  })
  assert.deepEqual(parseSaved(JSON.stringify(state)), state)
})

test('persistencia preserva iconos futuros, nombres repetidos e IDs únicos por colección', () => {
  const state = stateOf([group('shared', 'Mismo nombre', 'future-icon'), group('b', 'Mismo nombre', 'future-icon'), group('empty')], [
    { ...front('shared', 'shared', ['2024-02-29', '2099-01-01']), name: 'a'.repeat(200) },
  ])
  assert.deepEqual(parseSaved(JSON.stringify(state)), state)
  assert.equal(parseSaved(JSON.stringify(state)).groups[0].icon, 'future-icon')
})

test('persistencia admite 201 grupos/frentes sin imponer límites de producción', () => {
  const state = stateOf(Array.from({ length: 201 }, (_, i) => group(`group-${i}`)),
    Array.from({ length: 201 }, (_, i) => front(`front-${i}`, `group-${i}`)))
  assert.deepEqual(parseSaved(JSON.stringify(state)), state)
})

test('persistencia rechaza versión/colecciones inválidas, IDs duplicados y referencias ausentes', () => {
  const state = stateOf([group('a')], [front('one')])
  for (const value of [null, [], state.fronts, { ...state, version: 2 }, { ...state, version: undefined },
    { ...state, groups: {} }, { ...state, fronts: null }, { ...state, groups: [group('a'), group('a')] },
    { ...state, fronts: [front('one'), front('one')] }, { ...state, fronts: [front('one', 'missing')] },
    { ...state, fronts: [{ ...front('one'), groupId: undefined }] },
    ...[group(''), group('a', 'a'.repeat(61)), group('a', 'x\0y'), group('a', 'Name', null)].map(g => ({ ...state, groups: [g] })),
    ...[{ ...front('one'), name: ' ' }, { ...front('one'), name: 'a'.repeat(201) }, { ...front('one'), name: 'x\0y' },
      { ...front('one'), status: 'deleted' }, { ...front('one'), days: [TODAY, TODAY] },
      { ...front('one'), days: ['2026-02-30'] }].map(f => ({ ...state, fronts: [f] })),
  ]) assert.equal(parseSaved(JSON.stringify(value)), null, JSON.stringify(value))
  assert.equal(parseSaved('oops'), null)
})

test('seed crea los cinco grupos básicos y frentes válidos con estados y mezcla de hoy', () => {
  const state = seed(TODAY)
  assert.equal(state.version, 1)
  assert.deepEqual(state.groups.map(g => [g.name, g.icon]), [
    ['Personal', 'sprout'], ['Proyectos', 'work'], ['Aprendizaje', 'book'], ['Salud', 'health'], ['Creatividad', 'art'],
  ])
  assert.equal(state.fronts.length, 15)
  assert.deepEqual(parseSaved(JSON.stringify(state)), state)
  assert.ok(state.fronts.some(f => f.status === 'standby'))
  assert.ok(state.fronts.some(f => f.status === 'archived'))
  for (const g of groupFronts(state)) {
    const open = g.fronts.filter(f => f.status === 'open')
    assert.ok(open.some(f => f.days.includes(TODAY)))
    assert.ok(open.some(f => !f.days.includes(TODAY)))
  }
})

test('seed conserva 60 días deterministas con días completos vacíos y sin compartir objetos', () => {
  const state = seed(TODAY), other = seed(TODAY)
  assert.deepEqual(state, other)
  const earliest = shiftDay(TODAY, -59)
  const stats = summarize(state, earliest, TODAY)
  assert.equal(stats.totalDays, 60)
  assert.ok(stats.activeDays > 0 && stats.activeDays < 60)
  assert.ok(stats.byDay.filter(day => day.count === 0).length >= 10)
  assert.ok(state.fronts.some(f => f.days.includes(earliest)))
  for (const f of state.fronts) assert.ok(f.days.every(day => day >= earliest && day <= TODAY))
  state.groups[0].name = 'Editado'; state.fronts[0].days.push('2026-10-12')
  assert.notEqual(other.groups[0].name, 'Editado')
  assert.equal(other.fronts[0].days.includes('2026-10-12'), false)
  assert.doesNotThrow(() => seed(MIN_DAY))
})
