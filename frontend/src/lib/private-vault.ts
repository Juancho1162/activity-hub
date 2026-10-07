import { ApiError, safeReference, type AccessContext, type ActivityApi, type Front, type FrontDraft, type CheckResult, type DeleteResult, type DashboardQuery, type DashboardPage } from './api'
import { isDay } from './dates'
import { decryptVault, encryptVault, type Ciphertext } from './privacy-crypto'

type Replay = { key: string; operation: 'create_front' | 'write_check' | 'patch_front' | 'trash_front' | 'restore_front' | 'delete_front'; target: string | null; payload: Record<string, unknown>; response: Front | CheckResult | DeleteResult; retired_keys?: string[] }
export type PrivateDocument = { format: 1; fronts: Front[]; checks: { front_id: string; day: string }[]; replays: Replay[] }
type Snapshot = { version: number; day: string; now: string; iv: string | null; ciphertext: string | null; legacy_revision: number | null; legacy: Omit<PrivateDocument, 'format'> | null }
type Loaded = { snapshot: Snapshot; content: PrivateDocument }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const invalid = () => new ApiError('invalid-response', 'No se ha podido verificar o descifrar el registro. Conserva tu código; no se ha sustituido ningún dato.')
const quota = () => new ApiError('validation', 'Has alcanzado el límite de almacenamiento de esta cuenta. Tus datos existentes se conservan.')
const canonical = (value: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])))
const normalizedKey = (key: string) => key.replaceAll('-', '').toLowerCase()
const dayBefore = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
// SQL's UTC output may omit a zero fraction; preserve legacy microseconds.
const timestampOrder = (value: string) => value.replace(/(?:\.(\d{1,6}))?Z$/, (_match, fraction: string | undefined) => `.${(fraction ?? '').padEnd(6, '0')}Z`)

function document(value: unknown): PrivateDocument {
  if (!record(value) || value.format !== 1 || !Array.isArray(value.fronts) || !Array.isArray(value.checks) || !Array.isArray(value.replays)) throw invalid()
  const fronts = value.fronts
  if (fronts.some(f => !record(f) || !uuid(f.id) || typeof f.name !== 'string' || !f.name || !['open', 'standby', 'archived'].includes(String(f.state))
    || !(f.reference === null || typeof f.reference === 'string') || typeof f.created_at !== 'string' || typeof f.updated_at !== 'string'
    || !(f.trashed_at == null || typeof f.trashed_at === 'string' && Number.isFinite(Date.parse(f.trashed_at))))) throw invalid()
  const ids = new Set(fronts.map(f => f.id))
  if (ids.size !== fronts.length || value.checks.some(ch => !record(ch) || !ids.has(ch.front_id) || !isDay(ch.day))
    || new Set(value.checks.map(ch => `${ch.front_id}:${ch.day}`)).size !== value.checks.length) throw invalid()
  const requestKeys: string[] = []
  for (const r of value.replays) {
    if (!record(r) || typeof r.key !== 'string' || !/^[a-f0-9]{32}$/.test(r.key)
      || !['create_front', 'write_check', 'patch_front', 'trash_front', 'restore_front', 'delete_front'].includes(String(r.operation))
      || !(r.target === null || typeof r.target === 'string') || !record(r.payload) || !record(r.response)) throw invalid()
    if (r.operation === 'delete_front') {
      if (!uuid(r.response.front_id) || r.response.deleted !== true || Object.keys(r.response).length !== 2
        || ids.has(r.response.front_id) || r.target !== normalizedKey(r.response.front_id) || Object.keys(r.payload).length !== 0
        || r.retired_keys !== undefined && (!Array.isArray(r.retired_keys) || r.retired_keys.some(k => typeof k !== 'string' || !/^[a-f0-9]{32}$/.test(k)))) throw invalid()
    } else if (r.retired_keys !== undefined) throw invalid()
    requestKeys.push(r.key, ...(r.retired_keys as string[] | undefined ?? []))
  }
  if (new Set(requestKeys).size !== requestKeys.length) throw invalid()
  return value as PrivateDocument
}
function draft(value: FrontDraft): FrontDraft {
  if (typeof value.name !== 'string' || value.name.includes('\0')) throw new ApiError('validation', 'Revisa el nombre del frente.')
  const name = value.name.replace(/^[\p{White_Space}\u001c-\u001f]+|[\p{White_Space}\u001c-\u001f]+$/gu, '')
  const reference = safeReference(value.reference)
  if ([...name].length < 1 || [...name].length > 200 || !['open', 'standby', 'archived'].includes(value.state)
    || (value.reference !== null && (!reference || [...reference].length > 2048))) throw new ApiError('validation', 'Revisa el nombre y el enlace del frente.')
  return { name, reference, state: value.state }
}

function project(content: PrivateDocument, query: DashboardQuery): DashboardPage {
  const start = query.start, end = query.end
  if (!isDay(start) || !isDay(end) || end < start || Date.parse(end) - Date.parse(start) > 365 * 86400000) throw new ApiError('validation', 'Revisa el rango de fechas.')
  const lower = (value: string) => value.replace(/[A-Z]/g, letter => letter.toLowerCase())
  const search = query.search?.trim() ? lower(query.search.trim()) : null
  const items = content.fronts.filter(f => !!f.trashed_at === !!query.trashed && (!query.state || query.state === 'all' || f.state === query.state) && (search === null || lower(f.name).includes(search))).map(front => {
    const days = content.checks.filter(ch => ch.front_id === front.id).map(ch => ch.day).sort()
    const marked_dates = days.filter(day => day >= start && day <= end)
    return { front: { ...front }, marked_dates, last_registered_day: days.at(-1) ?? null, count: marked_dates.length }
  }).sort((a, b) => (query.order === 'activity_desc' ? b.count - a.count : 0) || timestampOrder(a.front.created_at).localeCompare(timestampOrder(b.front.created_at)) || a.front.id.localeCompare(b.front.id))
  const offset = query.offset ?? 0, limit = query.limit ?? 20
  return { items: items.slice(offset, offset + limit), total: items.length, offset, limit, start, end }
}

export function createPrivateApi(fetcher: typeof fetch, access: AccessContext, key: CryptoKey | null): ActivityApi {
  const accountId = access.accountId
  let latest: Loaded | null = null
  let confirmed: { requestId: string; content: PrivateDocument } | null = null
  let memoryGeneration = 0
  const forgetSnapshot = () => { latest = null; confirmed = null; memoryGeneration++ }
  function remember(current: Loaded, generation: number) {
    if (generation === memoryGeneration && (!latest || current.snapshot.version >= latest.snapshot.version)) latest = current
  }
  function confirm(current: Loaded, requestId: string, generation: number) {
    remember(current, generation)
    if (generation === memoryGeneration) confirmed = { requestId, content: current.content }
  }
  async function send(method: 'GET' | 'PUT', body?: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!key) throw new ApiError('unauthorized', 'Introduce tu código para descifrar el registro.')
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    const timer = setTimeout(abort, 15000)
    try {
      const csrf = typeof access.csrfToken === 'function' ? access.csrfToken() : access.csrfToken
      const response = await fetcher('/api/vault', {
        method, signal: controller.signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json', 'X-Activity-Account': accountId, ...(method === 'PUT' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf || '' } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      let result: unknown
      try { result = await response.json() } catch { throw new ApiError('invalid-response', 'No se ha podido confirmar la respuesta del servidor.', method === 'PUT') }
      if (!response.ok) {
        const changed = response.status === 409 && record(result) && result.detail === 'Account context changed'
        if (response.status === 401 || response.status === 403 || changed) {
          if (!signal?.aborted) access.onAccessDenied?.(response.status as 401 | 403 | 409)
          throw new ApiError('unauthorized', 'La sesión o la cuenta activa ha cambiado. Vuelve a entrar con tu código.')
        }
        if (response.status === 409 && record(result) && result.detail === 'Vault changed') return { conflict: true }
        if (response.status === 413) throw quota()
        if (response.status === 429) throw new ApiError('unavailable', 'Has hecho demasiadas solicitudes. Espera un minuto antes de reintentar.')
        throw new ApiError('unavailable', 'El servidor no está disponible. Reintenta cuando se recupere.', method === 'PUT' && response.status >= 500)
      }
      return result
    } catch (error) {
      forgetSnapshot()
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
      if (error instanceof ApiError) throw error
      throw new ApiError('network', 'No se ha podido conectar con el servidor. No podemos confirmar el resultado.', method === 'PUT')
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  }
  async function load(signal?: AbortSignal): Promise<{ snapshot: Snapshot; content: PrivateDocument }> {
    const data = await send('GET', undefined, signal)
    if (!record(data) || !Number.isSafeInteger(data.version) || Number(data.version) < 0 || !isDay(data.day) || typeof data.now !== 'string' || !Number.isFinite(Date.parse(data.now))) throw invalid()
    const snapshot = data as Snapshot
    if (snapshot.version === 0) {
      if (snapshot.ciphertext !== null || snapshot.iv !== null || !record(snapshot.legacy) || !Number.isSafeInteger(snapshot.legacy_revision) || snapshot.legacy_revision! < 0) throw invalid()
      return { snapshot, content: document({ ...snapshot.legacy, format: 1 }) }
    }
    if (typeof snapshot.iv !== 'string' || typeof snapshot.ciphertext !== 'string' || snapshot.legacy !== null) throw invalid()
    let plain: unknown
    try { plain = await decryptVault(key!, accountId, snapshot.version, snapshot as Ciphertext) } catch { throw invalid() }
    return { snapshot, content: document(plain) }
  }
  async function save(snapshot: Snapshot, content: PrivateDocument, signal?: AbortSignal): Promise<Snapshot | null> {
    let box: Ciphertext
    try { box = await encryptVault(key!, accountId, snapshot.version + 1, content) } catch (error) {
      if (error instanceof Error && error.message === 'Vault storage limit reached') throw quota()
      throw invalid()
    }
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    const result = await send('PUT', { version: snapshot.version, legacy_revision: snapshot.legacy_revision, day: snapshot.day, ...box }, signal)
    if (record(result) && result.conflict === true) return null
    if (!record(result) || result.version !== snapshot.version + 1) throw new ApiError('invalid-response', 'No se ha podido confirmar la versión guardada.', true)
    return { ...snapshot, version: snapshot.version + 1, ...box, legacy: null, legacy_revision: null }
  }
  async function read(signal?: AbortSignal) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await load(signal)
      if (current.snapshot.version !== 0) return current
      // Encrypt old records (including their replays) before showing the app.
      // The server removes plaintext only with a successful encrypted commit.
      const saved = await save(current.snapshot, current.content, signal)
      if (saved) return { snapshot: saved, content: current.content }
    }
    throw new ApiError('conflict', 'Otra pestaña está actualizando el registro. Reintenta la lectura.')
  }
  async function mutate(operation: Replay['operation'], target: string | null, payload: Record<string, unknown>, requestId: string): Promise<Front | CheckResult | DeleteResult> {
    const replayKey = normalizedKey(requestId)
    if (!/^[a-f0-9]{32}$/.test(replayKey)) throw new ApiError('validation', 'El identificador de solicitud no es válido.')
    const generation = memoryGeneration
    const cached = operation === 'write_check' && isDay(payload.day) && latest && latest.snapshot.version > 0
      && payload.day <= latest.snapshot.day && !latest.content.replays.some(replay => replay.key === replayKey || replay.retired_keys?.includes(replayKey)) ? latest : null
    latest = null; confirmed = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = attempt === 0 && cached ? structuredClone(cached) : await load()
      const { content, snapshot } = current
      const replay = content.replays.find(r => r.key === replayKey)
      if (replay) {
        if (replay.operation !== operation || replay.target !== (target ? normalizedKey(target) : null) || canonical(replay.payload) !== canonical(payload)) throw new ApiError('conflict', 'La solicitud entra en conflicto con una anterior.')
        confirm(current, requestId, generation)
        return structuredClone(replay.response)
      }
      if (content.replays.some(r => r.retired_keys?.includes(replayKey))) throw new ApiError('deleted-request', 'El frente de esta solicitud ya se ha eliminado para siempre.')
      const front = target ? content.fronts.find(f => normalizedKey(f.id) === normalizedKey(target)) : null
      if (target && !front) throw new ApiError('not-found', 'Ese frente no está disponible. Actualiza el registro.')
      if (operation === 'delete_front' && !front?.trashed_at) throw new ApiError('conflict', 'Solo puedes eliminar para siempre un frente que siga en la Papelera. Actualiza el registro.')
      if (front?.trashed_at && operation !== 'trash_front' && operation !== 'restore_front' && operation !== 'delete_front') throw new ApiError('not-found', 'Ese frente está en la papelera. Restáuralo antes de cambiarlo.')
      let result: Front | CheckResult | DeleteResult
      let retiredKeys: string[] | undefined
      if (operation === 'create_front') {
        if (content.fronts.length >= 200) throw quota()
        result = { ...payload as FrontDraft, id: crypto.randomUUID(), created_at: snapshot.now, updated_at: snapshot.now }
        content.fronts.push(result)
      } else if (operation === 'patch_front') {
        result = { ...front!, ...payload as FrontDraft, updated_at: snapshot.now }
        content.fronts[content.fronts.indexOf(front!)] = result
      } else if (operation === 'trash_front' || operation === 'restore_front') {
        result = { ...front!, trashed_at: operation === 'trash_front' ? front!.trashed_at ?? snapshot.now : null }
        content.fronts[content.fronts.indexOf(front!)] = result
      } else if (operation === 'delete_front') {
        const frontKey = normalizedKey(front!.id)
        const related = (r: Replay) => {
          const responseTarget = 'id' in r.response ? r.response.id : r.response.front_id
          return normalizedKey(r.target ?? '') === frontKey || typeof responseTarget === 'string' && normalizedKey(responseTarget) === frontKey
        }
        // Retain consumed request IDs only: an old create must never recreate
        // deleted content, even after a committed response was lost.
        retiredKeys = content.replays.filter(related).map(r => r.key)
        content.replays = content.replays.filter(r => !related(r))
        content.fronts = content.fronts.filter(f => f.id !== front!.id)
        content.checks = content.checks.filter(ch => ch.front_id !== front!.id)
        result = { front_id: front!.id, deleted: true }
      } else {
        const day = payload.day === 'today' ? snapshot.day : payload.day === 'yesterday' ? dayBefore(snapshot.day) : String(payload.day)
        if (!isDay(day) || day > snapshot.day || typeof payload.marked !== 'boolean') throw new ApiError('validation', 'No se puede registrar actividad para un día futuro.')
        content.checks = content.checks.filter(ch => !(ch.front_id === front!.id && ch.day === day))
        if (payload.marked) content.checks.push({ front_id: front!.id, day })
        result = { front_id: front!.id, day, marked: payload.marked }
      }
      if (operation !== 'delete_front' && content.replays.filter(r => r.operation !== 'delete_front').length >= 5000) throw quota()
      content.replays.push({ key: replayKey, operation, target: target ? normalizedKey(target) : null, payload, response: result, ...(retiredKeys?.length ? { retired_keys: retiredKeys } : {}) })
      const saved = await save(snapshot, content)
      if (saved) {
        confirm({ snapshot: saved, content }, requestId, generation)
        return structuredClone(result)
      }
    }
    throw new ApiError('conflict', 'Otra pestaña está actualizando el registro. Reintenta con la misma solicitud.')
  }
  return {
    async dashboard(query: DashboardQuery, signal) {
      const generation = memoryGeneration
      try {
        const current = await read(signal)
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
        remember(current, generation)
        return project(current.content, query)
      } catch (error) { forgetSnapshot(); throw error }
    },
    confirmedDashboard(requestId, query) {
      if (!confirmed || confirmed.requestId !== requestId) return null
      const content = confirmed.content
      confirmed = null
      return project(content, query)
    },
    forgetSnapshot,
    async createFront(value, id) { return await mutate('create_front', null, draft(value), id) as Front },
    async patchFront(id, value) { return await mutate('patch_front', id, draft(value), crypto.randomUUID()) as Front },
    async writeCheck(id, day, marked, requestId) { return await mutate('write_check', id, { day, marked }, requestId) as CheckResult },
    async trashFront(id, requestId) { return await mutate('trash_front', id, {}, requestId) as Front },
    async restoreFront(id, requestId) { return await mutate('restore_front', id, {}, requestId) as Front },
    async deleteFront(id, requestId) { return await mutate('delete_front', id, {}, requestId) as DeleteResult },
  }
}
