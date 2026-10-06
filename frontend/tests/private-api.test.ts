import { webcrypto, randomUUID } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
import { deriveCredentials, generateCode, decryptVault } from '../src/lib/privacy-crypto'
import { createPrivateApi } from '../src/lib/private-vault'
import { createPrivateAuthClient } from '../src/lib/private-auth'

beforeEach(() => vi.stubGlobal('crypto', webcrypto))
const account = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const access = { accountId: account, csrfToken: 'A'.repeat(43) }
const draft = { name: 'Guitarra privada', reference: 'https://example.test/privado', state: 'open' as const }
function vaultServer() {
  let stored: Record<string, unknown> = { version: 0, legacy_revision: 0, iv: null, ciphertext: null, legacy: { fronts: [], checks: [], replays: [] } }
  let loseNext = false
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (url !== '/api/vault') throw new Error('Unexpected network path')
    if (init?.method === 'PUT') {
      const data = JSON.parse(String(init.body))
      if (data.version !== stored.version) return Response.json({ detail: 'Vault changed' }, { status: 409 })
      stored = { version: Number(stored.version) + 1, legacy_revision: null, iv: data.iv, ciphertext: data.ciphertext, legacy: null }
      if (loseNext) { loseNext = false; throw new TypeError('Response lost after commit') }
      return Response.json({ version: stored.version })
    }
    return Response.json({ ...stored, day: '2026-10-06', now: '2026-10-06T12:00:00Z' })
  })
  return { fetcher, lose() { loseNext = true }, stored: () => stored, replace(value: Record<string, unknown>) { stored = value } }
}
it('lost encrypted response replays the original result without duplicate creates or undoing later edits/checks', async () => {
  const server = vaultServer()
  const { key } = await deriveCredentials(generateCode())
  const api = createPrivateApi(server.fetcher, access, key)
  const createKey = randomUUID()
  server.lose()
  await expect(api.createFront(draft, createKey)).rejects.toMatchObject({ kind: 'network', uncertain: true })
  const front = await api.createFront(draft, createKey)
  expect(server.stored().version).toBe(1)
  await api.patchFront(front.id, { ...draft, name: 'Nombre editado' })
  expect((await api.createFront(draft, createKey)).name).toBe(draft.name)
  const checkKey = randomUUID()
  const marked = await api.writeCheck(front.id, 'today', true, checkKey)
  await api.writeCheck(front.id, 'today', false, randomUUID())
  expect(await api.writeCheck(front.id, 'today', true, checkKey)).toEqual(marked)
  const page = await api.dashboard({ start: '2026-10-01', end: '2026-10-31' })
  expect(page.total).toBe(1)
  expect(page.items[0].front.name).toBe('Nombre editado')
  expect(page.items[0].marked_dates).toEqual([])
  const putBodies = server.fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([, init]) => String(init?.body)).join('\n')
  expect(putBodies).not.toContain(draft.name)
  expect(putBodies).not.toContain(draft.reference)
  // The synchronization day is metadata; actual activity dates live in ciphertext.
  expect(putBodies).not.toContain('marked')
  await expect(api.createFront({ ...draft, name: 'Conflict' }, createKey)).rejects.toMatchObject({ kind: 'conflict' })
  await expect(api.writeCheck(front.id, '2026-10-07', true, randomUUID())).rejects.toMatchObject({ kind: 'validation' })
})
it('concurrent tabs merge independent mutations and deduplicate an identical operation', async () => {
  const server = vaultServer()
  const { key } = await deriveCredentials(generateCode())
  const first = createPrivateApi(server.fetcher, access, key)
  const second = createPrivateApi(server.fetcher, access, key)
  const same = randomUUID()
  const [a, b] = await Promise.all([first.createFront(draft, same), second.createFront(draft, same)])
  expect(a).toEqual(b)
  await Promise.all([first.createFront({ ...draft, name: 'Segundo' }, randomUUID()), second.createFront({ ...draft, name: 'Tercero' }, randomUUID())])
  expect((await first.dashboard({ start: '2026-10-01', end: '2026-10-31' })).total).toBe(3)
})
it('creation order stays chronological across mixed legacy precision before pagination, including microseconds', async () => {
  const server = vaultServer()
  const { key } = await deriveCredentials(generateCode())
  const make = (symbol: string, created_at: string) => ({ ...draft, id: `${symbol.repeat(8)}-${symbol.repeat(4)}-4${symbol.repeat(3)}-8${symbol.repeat(3)}-${symbol.repeat(12)}`, created_at, updated_at: created_at })
  const early = make('f', '2026-10-06T12:00:00Z')
  const middle = make('b', '2026-10-06T12:00:00.000001Z')
  const late = make('a', '2026-10-06T12:00:00.000002Z')
  server.replace({ version: 0, legacy_revision: 3, iv: null, ciphertext: null, legacy: { fronts: [late, middle, early], checks: [], replays: [] } })
  const api = createPrivateApi(server.fetcher, access, key)
  for (const order of ['created', 'activity_desc'] as const) {
    const ids = []
    for (let offset = 0; offset < 3; offset++) ids.push((await api.dashboard({ start: '2026-10-01', end: '2026-10-31', limit: 1, offset, order })).items[0].front.id)
    expect(ids).toEqual([early.id, middle.id, late.id])
  }
})
it('migration encrypts content and original replays; corrupted ciphertext never becomes an empty replacement', async () => {
  const server = vaultServer()
  const { key } = await deriveCredentials(generateCode())
  const front = { ...draft, id: randomUUID(), created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' }
  server.replace({ version: 0, legacy_revision: 2, iv: null, ciphertext: null, legacy: { fronts: [front], checks: [{ front_id: front.id, day: '2026-10-02' }], replays: [] } })
  const api = createPrivateApi(server.fetcher, access, key)
  expect((await api.dashboard({ start: '2026-10-01', end: '2026-10-31' })).items[0].count).toBe(1)
  expect(server.stored().legacy).toBeNull()
  const stored = server.stored()
  const plain = await decryptVault(key, account, Number(stored.version), { iv: String(stored.iv), ciphertext: String(stored.ciphertext) })
  expect(plain).toMatchObject({ fronts: [front] })
  server.replace({ ...stored, ciphertext: 'A'.repeat(String(stored.ciphertext).length) })
  const before = server.fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT').length
  await expect(api.dashboard({ start: '2026-10-01', end: '2026-10-31' })).rejects.toMatchObject({ kind: 'invalid-response' })
  await expect(api.createFront(draft, randomUUID())).rejects.toMatchObject({ kind: 'invalid-response' })
  expect(server.fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(before)
})
it('private auth generates the code locally and sends only derived credentials; reloading loses the decryption key', async () => {
  const session = { authenticated: true, account_id: account, csrf_token: 'A'.repeat(43), expires_at: '2030-11-02T12:00:00Z' }
  const fetcher = vi.fn<typeof fetch>(async url => {
    if (url === '/auth/config') return Response.json({ local: true, registration_enabled: true, sitekey: null })
    if (url === '/auth/signup') return Response.json({ account_id: account }, { status: 201 })
    return Response.json(session)
  })
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  const auth = createPrivateAuthClient(fetcher)
  const created = await auth.signup()
  expect(auth.canRead!(account)).toBe(false)
  await auth.login(created.code)
  expect(auth.canRead!(account)).toBe(true)
  expect(JSON.stringify(fetcher.mock.calls)).not.toContain(created.code)
  expect(JSON.stringify(fetcher.mock.calls)).not.toContain(created.code.replaceAll('-', ''))
  const requests = fetcher.mock.calls.filter(([url]) => url === '/auth/signup' || url === '/auth/login').map(([, init]) => JSON.parse(String(init?.body)))
  expect(requests[0].credential).toBe(requests[1].credential)
  expect(storage).not.toHaveBeenCalled()
  const reloaded = createPrivateAuthClient(fetcher)
  expect(await reloaded.session()).toEqual(session)
  expect(reloaded.canRead!(account)).toBe(false)
  auth.lock!()
  expect(auth.canRead!(account)).toBe(false)
})
