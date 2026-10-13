import { webcrypto, randomUUID } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
import { createPrivateApi, createInitialPrivateDocument, type PrivateDocument } from '../src/lib/private-vault'
import { createPrivateAuthClient } from '../src/lib/private-auth'
import { decryptVault, deriveCredentials, encryptVault, generateCode } from '../src/lib/privacy-crypto'
import type { Front, FrontDraft, Group } from '../src/lib/api'
import { deferred } from './fixtures'

beforeEach(() => vi.stubGlobal('crypto', webcrypto))
const account = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const access = { accountId: account, csrfToken: 'A'.repeat(43) }
const day = '2026-10-06'
const period = { start: '2026-10-01', end: day }
const normalize = (value: string) => value.replaceAll('-', '').toLowerCase()
const frontDraft = (name = 'Leer'): FrontDraft => ({ name, reference: null, state: 'open', icon: 'book' })
const makeFront = (name: string, group_id: string | null = null): Front => ({ ...frontDraft(name), id: randomUUID(), group_id, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })

async function fixture(initial: unknown = { format: 2, groups: [], fronts: [], checks: [], replays: [] }) {
  const { key } = await deriveCredentials(generateCode())
  let stored = { version: 1, ...await encryptVault(key, account, 1, initial) }
  let loseNext = false
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (url !== '/api/vault') throw new Error('Unexpected network path')
    if (init?.method === 'PUT') {
      const data = JSON.parse(String(init.body))
      if (data.version !== stored.version || data.day !== day) return Response.json({ detail: 'Vault changed' }, { status: 409 })
      stored = { version: stored.version + 1, iv: data.iv, ciphertext: data.ciphertext }
      if (loseNext) { loseNext = false; throw new TypeError('Acknowledgement lost after commit') }
      return Response.json({ version: stored.version })
    }
    return Response.json({ ...stored, legacy: null, legacy_revision: null, day, now: `${day}T12:00:00Z` })
  })
  return {
    key, fetcher, api: createPrivateApi(fetcher, access, key),
    stored: () => stored, lose: () => { loseNext = true },
    content: async () => await decryptVault(key, account, stored.version, stored) as PrivateDocument,
  }
}

it('reads old accounts as Sin grupo without rewriting or changing their content, then saves format 2 losslessly', async () => {
  const front = makeFront('Antes'); delete front.group_id
  const trashed = { ...makeFront('Papelera'), trashed_at: '2026-10-04T10:00:00Z', icon: 'coffee' }; delete trashed.group_id
  const oldRequest = randomUUID()
  const replay = { key: normalize(oldRequest), operation: 'create_front', target: null, payload: frontDraft('Antes'), response: front }
  const old = { format: 1, fronts: [front, trashed], checks: [{ front_id: front.id, day: '2026-10-02' }], replays: [replay], onboarding: { version: 1, tutorialDismissed: true } }
  const f = await fixture(old)
  const page = await f.api.dashboard({ ...period, group_id: null })
  expect(page.groups).toEqual([])
  expect(page.items).toEqual([{ front: { ...front, group_id: null }, marked_dates: ['2026-10-02'], last_registered_day: '2026-10-02', count: 1 }])
  expect((await f.api.dashboard({ ...period, trashed: true })).items[0].front).toEqual({ ...trashed, group_id: null })
  expect(f.stored().version).toBe(1)
  expect(await f.content()).toEqual(old)
  await f.api.createGroup!({ name: 'Personal', icon: 'health' }, randomUUID())
  const saved = await f.content()
  expect(saved.format).toBe(2)
  expect(saved.fronts).toEqual(old.fronts.map(value => ({ ...value, group_id: null })))
  expect(saved.checks).toEqual(old.checks)
  expect(saved.replays[0]).toEqual(replay)
  expect(saved.onboarding).toEqual(old.onboarding)
})

it('replays a lost front assignment without reverting a newer group chosen by another tab', async () => {
  const f = await fixture()
  const first = await f.api.createGroup!({ name: 'Primero', icon: 'book' }, randomUUID())
  const second = await f.api.createGroup!({ name: 'Segundo', icon: 'book' }, randomUUID())
  const front = await f.api.createFront(frontDraft(), randomUUID())
  const requestId = randomUUID()
  const assignment = { ...frontDraft(), group_id: first.id }
  f.lose()
  await expect(f.api.patchFront(front.id, assignment, requestId)).rejects.toMatchObject({ uncertain: true })
  const otherTab = createPrivateApi(f.fetcher, access, f.key)
  await otherTab.patchFront(front.id, { ...frontDraft(), group_id: second.id }, randomUUID())
  const version = f.stored().version
  expect((await f.api.patchFront(front.id, assignment, requestId)).group_id).toBe(first.id)
  expect(f.stored().version).toBe(version)
  expect(f.api.confirmedDashboard!(requestId, period)?.items[0].front.group_id).toBe(second.id)
  expect((await f.content()).fronts[0].group_id).toBe(second.id)
})


it('fences a cached v1 writer with CAS, then its v1 reader rejects format 2 before another PUT', async () => {
  const front = makeFront('Old tab'); delete front.group_id
  const old = { format: 1, fronts: [front], checks: [] as { front_id: string; day: string }[], replays: [] }
  const f = await fixture(old)
  const cached = await (await f.fetcher('/api/vault', { method: 'GET' })).json()
  // This small legacy fixture characterizes the original client's exact schema
  // guard and GET/PUT retry boundary; it does not duplicate its full API module.
  async function oldTabWrite() {
    for (let attempt = 0; attempt < 5; attempt++) {
      const snapshot = attempt === 0 ? cached : await (await f.fetcher('/api/vault', { method: 'GET' })).json()
      const content = await decryptVault(f.key, account, snapshot.version, snapshot) as typeof old
      if (content.format !== 1) throw new Error('Unsupported legacy vault format')
      content.checks = [{ front_id: front.id, day }]
      const box = await encryptVault(f.key, account, snapshot.version + 1, content)
      const response = await f.fetcher('/api/vault', { method: 'PUT', body: JSON.stringify({ version: snapshot.version, day, ...box }) })
      if (response.status !== 409) return
    }
  }
  const group = await f.api.createGroup!({ name: 'New tab group', icon: 'work' }, randomUUID())
  const version = f.stored().version; f.fetcher.mockClear()
  await expect(oldTabWrite()).rejects.toThrow('Unsupported legacy vault format')
  expect(f.fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(['PUT', 'GET'])
  expect((await f.fetcher.mock.results[0].value).status).toBe(409)
  expect(f.stored().version).toBe(version)
  expect(await f.content()).toMatchObject({ format: 2, groups: [group], checks: [] })
})

it('keeps same-icon groups independent, projects complete metadata with pagination and preserves omitted assignments', async () => {
  const f = await fixture()
  expect(f.api.supportsGroups).toBe(true)
  const first = await f.api.createGroup!({ name: 'Proyecto', icon: 'work' }, randomUUID())
  const second = await f.api.createGroup!({ name: 'Proyecto', icon: 'work' }, randomUUID())
  expect(first.id).not.toBe(second.id)
  const one = await f.api.createFront({ ...frontDraft('Uno'), group_id: first.id }, randomUUID())
  const two = await f.api.createFront({ ...frontDraft('Dos'), group_id: second.id }, randomUUID())
  await f.api.createFront(frontDraft('Suelto'), randomUUID())
  await f.api.patchFront(one.id, { ...frontDraft('Uno editado'), icon: 'music' })
  expect((await f.api.dashboard({ ...period, group_id: first.id })).items.map(item => item.front)).toEqual([{ ...one, name: 'Uno editado', icon: 'music' }])
  const request = randomUUID()
  expect(await f.api.patchGroup!(first.id, { name: 'Trabajo A', icon: 'work' }, request)).toEqual({ ...first, name: 'Trabajo A' })
  const page = await f.api.dashboard({ ...period, limit: 1, offset: 1 })
  expect(page.items).toHaveLength(1)
  expect(page.total).toBe(3)
  expect(page.groups).toEqual([{ ...first, name: 'Trabajo A' }, second])
  page.groups![0].name = 'Caller mutation'
  expect((await f.api.dashboard({ ...period, group_id: second.id })).items.map(item => item.front.id)).toEqual([two.id])
  expect((await f.api.dashboard({ ...period, group_id: null })).total).toBe(1)
  await f.api.patchFront(one.id, { ...frontDraft('Uno editado'), group_id: null })
  expect((await f.api.dashboard({ ...period, group_id: first.id })).total).toBe(0)
  expect((await f.content()).groups![0].name).toBe('Trabajo A')
})

it('replays group create/edit lost responses without duplication or undoing later group edits', async () => {
  const f = await fixture()
  const request = randomUUID(); f.lose()
  await expect(f.api.createGroup!({ name: 'Inicial', icon: 'work' }, request)).rejects.toMatchObject({ uncertain: true })
  const group = (await f.content()).groups![0]
  const edit = randomUUID(); f.lose()
  await expect(f.api.patchGroup!(group.id, { name: 'Elegido', icon: 'code' }, edit)).rejects.toMatchObject({ uncertain: true })
  await f.api.patchGroup!(group.id, { name: 'Más reciente', icon: 'art' }, randomUUID())
  const version = f.stored().version
  expect(await f.api.createGroup!({ name: 'Inicial', icon: 'work' }, request)).toEqual(group)
  expect(await f.api.patchGroup!(group.id, { name: 'Elegido', icon: 'code' }, edit)).toEqual({ ...group, name: 'Elegido', icon: 'code' })
  expect(f.api.confirmedDashboard!(edit, period)?.groups).toEqual([{ ...group, name: 'Más reciente', icon: 'art' }])
  expect(f.stored().version).toBe(version)
  await expect(f.api.createGroup!({ name: 'Different', icon: 'work' }, request)).rejects.toMatchObject({ kind: 'conflict' })
})

it('records an entire group in one CAS beyond the visible page and excludes marked, paused, archived and trashed fronts', async () => {
  const group: Group = { id: randomUUID(), name: 'Proyectos', icon: 'work' }
  const other: Group = { id: randomUUID(), name: 'Otro', icon: 'work' }
  const fronts = Array.from({ length: 26 }, (_, i) => makeFront(`Frente ${i}`, group.id))
  fronts[1].state = 'standby'; fronts[2].state = 'archived'; fronts[3].trashed_at = `${day}T09:00:00Z`; fronts[4].group_id = other.id
  const checked = { front_id: fronts[0].id, day }
  const f = await fixture({ format: 2, groups: [group, other], fronts, checks: [checked], replays: [] })
  expect((await f.api.dashboard(period)).items).toHaveLength(20)
  f.fetcher.mockClear()
  const request = randomUUID()
  const result = await f.api.recordGroup!(group.id, day, request)
  expect(result).toEqual({ day, changed_ids: fronts.slice(5).map(front => front.id) })
  expect(f.fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(['GET', 'PUT'])
  const content = await f.content()
  expect(content.checks[0]).toEqual(checked)
  expect(content.checks.slice(1)).toEqual(fronts.slice(5).map(front => ({ front_id: front.id, day, owner: normalize(request) })))
  expect(f.api.confirmedDashboard!(request, { ...period, limit: 200 })?.items.filter(item => item.marked_dates.includes(day))).toHaveLength(22)
})

it('recomputes current group membership and state after CAS conflict and keeps concurrent work', async () => {
  const group: Group = { id: randomUUID(), name: 'Proyectos', icon: 'work' }
  const removed = makeFront('Sale', group.id), paused = makeFront('Pausa', group.id), stays = makeFront('Sigue', group.id)
  const f = await fixture({ format: 2, groups: [group], fronts: [removed, paused, stays], checks: [], replays: [] })
  const ready = deferred<void>(), release = deferred<void>(); let hold = true
  const first = createPrivateApi(async (url, init) => {
    if (init?.method === 'PUT' && hold) { hold = false; ready.resolve(); await release.promise }
    return f.fetcher(url, init)
  }, access, f.key)
  const pending = first.recordGroup!(group.id, day, randomUUID())
  await ready.promise
  await f.api.patchFront(removed.id, { ...frontDraft('Sale'), group_id: null })
  await f.api.patchFront(paused.id, { ...frontDraft('Pausa'), state: 'standby' })
  const added = await f.api.createFront({ ...frontDraft('Entra'), group_id: group.id }, randomUUID())
  await f.api.writeCheck(stays.id, day, true, randomUUID())
  release.resolve()
  expect(await pending).toEqual({ day, changed_ids: [added.id] })
  expect((await f.content()).checks.map(check => check.front_id).sort()).toEqual([stays.id, added.id].sort())
})

it('records Sin grupo without merging other groups and retries a lost batch acknowledgement against current data', async () => {
  const group: Group = { id: randomUUID(), name: 'Otros', icon: 'book' }
  const loose = makeFront('Suelto'), grouped = makeFront('Agrupado', group.id)
  const f = await fixture({ format: 2, groups: [group], fronts: [loose, grouped], checks: [], replays: [] })
  const request = randomUUID(); f.lose()
  await expect(f.api.recordGroup!(null, day, request)).rejects.toMatchObject({ uncertain: true })
  expect(f.api.confirmedDashboard!(request, period)).toBeNull()
  await f.api.writeCheck(loose.id, day, false, randomUUID())
  const version = f.stored().version; f.fetcher.mockClear()
  expect(await f.api.recordGroup!(null, day, request)).toEqual({ day, changed_ids: [loose.id] })
  expect(f.stored().version).toBe(version)
  expect(f.fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(['GET'])
  expect(f.api.confirmedDashboard!(request, period)?.items.every(item => item.count === 0)).toBe(true)
  await expect(f.api.recordGroup!(group.id, day, request)).rejects.toMatchObject({ kind: 'conflict' })
})

it('undo removes only owned checks, preserving unmark/remark, true reassertions, old checks and trashed fronts', async () => {
  const group: Group = { id: randomUUID(), name: 'Personal', icon: 'health' }
  const fronts = ['Old', 'Remove', 'Remark', 'Reassert', 'Trash'].map(name => makeFront(name, group.id))
  const f = await fixture({ format: 2, groups: [group], fronts, checks: [{ front_id: fronts[0].id, day }], replays: [] })
  const batch = randomUUID()
  await f.api.recordGroup!(group.id, day, batch)
  const other = createPrivateApi(f.fetcher, access, f.key)
  await other.writeCheck(fronts[2].id, day, false, randomUUID())
  await other.writeCheck(fronts[2].id, day, true, randomUUID())
  await other.writeCheck(fronts[3].id, day, true, randomUUID())
  await other.trashFront!(fronts[4].id, randomUUID())
  f.fetcher.mockClear()
  expect(await f.api.undoGroup!(batch, randomUUID())).toEqual({ day, changed_ids: [fronts[1].id] })
  expect(f.fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(['GET', 'PUT'])
  expect((await f.content()).checks.map(check => check.front_id).sort()).toEqual([fronts[0].id, fronts[2].id, fronts[3].id, fronts[4].id].sort())
})

it('recomputes selective undo after CAS conflict, then retries a lost undo acknowledgement without removing later activity', async () => {
  const group: Group = { id: randomUUID(), name: 'Personal', icon: 'health' }
  const fronts = ['Concurrent', 'Undo'].map(name => makeFront(name, group.id))
  const f = await fixture({ format: 2, groups: [group], fronts, checks: [], replays: [] })
  const batch = randomUUID(); await f.api.recordGroup!(group.id, day, batch)
  const ready = deferred<void>(), release = deferred<void>(); let hold = true
  const first = createPrivateApi(async (url, init) => {
    if (init?.method === 'PUT' && hold) { hold = false; ready.resolve(); await release.promise }
    return f.fetcher(url, init)
  }, access, f.key)
  const request = randomUUID(), pending = first.undoGroup!(batch, request)
  await ready.promise
  await f.api.writeCheck(fronts[0].id, day, true, randomUUID())
  f.lose(); release.resolve()
  await expect(pending).rejects.toMatchObject({ uncertain: true })
  await f.api.writeCheck(fronts[1].id, day, true, randomUUID())
  const version = f.stored().version
  expect(await first.undoGroup!(batch, request)).toEqual({ day, changed_ids: [fronts[1].id] })
  expect(first.confirmedDashboard!(request, period)?.items.every(item => item.marked_dates.includes(day))).toBe(true)
  expect(f.stored().version).toBe(version)
})

it('redacts deleted members from shared batch/undo receipts, retiring empty operations and their zero-effect undo', async () => {
  const group: Group = { id: randomUUID(), name: 'Personal', icon: 'health' }
  const one = makeFront('Private deleted name', group.id), two = makeFront('Keep', group.id)
  const f = await fixture({ format: 2, groups: [group], fronts: [one, two], checks: [], replays: [] })
  const batch = randomUUID(), undo = randomUUID(), emptyUndo = randomUUID()
  await f.api.recordGroup!(group.id, day, batch)
  await f.api.undoGroup!(batch, undo)
  await f.api.undoGroup!(batch, emptyUndo)
  await f.api.trashFront!(one.id, randomUUID()); await f.api.deleteFront!(one.id, randomUUID())
  expect(await f.api.recordGroup!(group.id, day, batch)).toEqual({ day, changed_ids: [two.id] })
  expect(await f.api.undoGroup!(batch, undo)).toEqual({ day, changed_ids: [two.id] })
  expect(JSON.stringify(await f.content())).not.toContain(one.name)
  await f.api.trashFront!(two.id, randomUUID()); await f.api.deleteFront!(two.id, randomUUID())
  const saved = await f.content()
  expect(saved.fronts).toEqual([])
  expect(saved.checks).toEqual([])
  expect(JSON.stringify(saved.replays)).not.toContain(day)
  for (const request of [batch, undo, emptyUndo]) expect(saved.replays.flatMap(replay => replay.retired_keys ?? [])).toContain(normalize(request))
  const version = f.stored().version
  await expect(f.api.recordGroup!(group.id, day, batch)).rejects.toMatchObject({ kind: 'deleted-request' })
  await expect(f.api.undoGroup!(batch, undo)).rejects.toMatchObject({ kind: 'deleted-request' })
  await expect(f.api.undoGroup!(batch, randomUUID())).rejects.toMatchObject({ kind: 'deleted-request' })
  expect(f.stored().version).toBe(version)
})

it('captures custom initial groups and assignments before asynchronous signup and keeps them after reload', async () => {
  const groups = [{ id: randomUUID(), name: 'Aprendizaje', icon: 'book' }]
  const fronts = [{ ...frontDraft('Leer'), group_id: groups[0].id }]
  let initial = { groups, fronts }
  const choose = vi.fn(() => initial)
  let box: Record<string, unknown> | undefined
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (url === '/auth/config') return Response.json({ local: true, registration_enabled: true, sitekey: null })
    if (url === '/auth/signup') { box = JSON.parse(String(init?.body)).initial_vault; return Response.json({ account_id: box!.account_id }, { status: 201 }) }
    if (url === '/auth/login') return Response.json({ authenticated: true, account_id: box!.account_id, csrf_token: access.csrfToken, expires_at: '2030-11-02T12:00:00Z' })
    if (url === '/api/vault') return Response.json({ ...box, version: 1, legacy: null, legacy_revision: null, day, now: `${day}T12:00:00Z` })
    throw new Error('Unexpected path')
  })
  const auth = createPrivateAuthClient(fetcher, { initialData: choose })
  const signingUp = auth.signup()
  initial = { groups: [{ ...groups[0], name: 'Later language' }], fronts: [{ ...fronts[0], name: 'Later name' }] }
  const created = await signingUp
  const reloaded = createPrivateAuthClient(fetcher), session = await reloaded.login(created.code)
  const page = await reloaded.createApi!({ ...access, accountId: session.account_id }).dashboard(period)
  expect(page.groups).toEqual(groups)
  expect(page.items[0]).toMatchObject({ front: fronts[0], marked_dates: [], count: 0 })
  expect(choose).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(fetcher.mock.calls)).not.toContain('Aprendizaje')
  expect(JSON.stringify(fetcher.mock.calls)).not.toContain(created.code)
})

it('creates new initial format 2 documents while retaining the old optional initialFronts signature', () => {
  const group: Group = { id: randomUUID(), name: 'Proyectos', icon: 'work' }
  expect(createInitialPrivateDocument([frontDraft()], `${day}T12:00:00Z`)).toMatchObject({ format: 2, groups: [], checks: [], replays: [] })
  const content = createInitialPrivateDocument([{ ...frontDraft(), group_id: group.id }], `${day}T12:00:00Z`, [group])
  expect(content).toMatchObject({ format: 2, groups: [group], fronts: [{ group_id: group.id }], checks: [] })
})

it.each(['missing-groups', 'duplicate-groups', 'invalid-group-name', 'dangling-assignment', 'bad-owner', 'invalid-batch-day', 'duplicate-effect', 'unknown-effect', 'wrong-group-target', 'missing-undo-source', 'future-format'])('rejects inconsistent encrypted group data (%s) without a PUT', async defect => {
  const group: Group = { id: randomUUID(), name: 'Personal', icon: 'health' }, front = makeFront('One')
  const request = normalize(randomUUID())
  const content: Record<string, unknown> = { format: 2, groups: [group], fronts: [front], checks: [], replays: [] }
  const batch = { key: request, operation: 'record_group', target: normalize(group.id), payload: { group_id: group.id, day }, response: { day, changed_ids: [front.id] } }
  if (defect === 'missing-groups') delete content.groups
  if (defect === 'duplicate-groups') content.groups = [group, group]
  if (defect === 'invalid-group-name') content.groups = [{ ...group, name: '' }]
  if (defect === 'dangling-assignment') front.group_id = randomUUID()
  if (defect === 'bad-owner') content.checks = [{ front_id: front.id, day, owner: 'invalid' }]
  if (defect === 'invalid-batch-day') { batch.response.day = 'bad'; content.replays = [batch] }
  if (defect === 'duplicate-effect') { batch.response.changed_ids.push(front.id); content.replays = [batch] }
  if (defect === 'unknown-effect') { batch.response.changed_ids.push(randomUUID()); content.replays = [batch] }
  if (defect === 'wrong-group-target') { batch.target = normalize(randomUUID()); content.replays = [batch] }
  if (defect === 'missing-undo-source') content.replays = [{ key: request, operation: 'undo_group', target: normalize(randomUUID()), payload: { batch_request_id: normalize(randomUUID()) }, response: { day, changed_ids: [] } }]
  if (defect === 'future-format') content.format = 3
  const f = await fixture(content)
  await expect(f.api.dashboard(period)).rejects.toMatchObject({ kind: 'invalid-response' })
  await expect(f.api.createFront(frontDraft(), randomUUID())).rejects.toMatchObject({ kind: 'invalid-response' })
  expect(f.fetcher.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true)
})

it('rejects invalid group input, missing membership and future bulk dates without changing the vault', async () => {
  const f = await fixture()
  for (const value of [{ name: '', icon: 'book' }, { name: 'X'.repeat(61), icon: 'book' }, { name: 'Good', icon: '' }, { name: 'Good', icon: 'https://example.test/icon' }]) {
    await expect(f.api.createGroup!(value, randomUUID())).rejects.toMatchObject({ kind: 'validation' })
  }
  await expect(f.api.createFront({ ...frontDraft(), group_id: randomUUID() }, randomUUID())).rejects.toMatchObject({ kind: 'not-found' })
  await expect(f.api.recordGroup!(null, '2026-10-07', randomUUID())).rejects.toMatchObject({ kind: 'validation' })
  await expect(f.api.recordGroup!('bad', day, randomUUID())).rejects.toMatchObject({ kind: 'validation' })
  await expect(f.api.undoGroup!(randomUUID(), randomUUID())).rejects.toMatchObject({ kind: 'not-found' })
  expect(f.stored().version).toBe(1)
  expect(f.fetcher.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true)
})
