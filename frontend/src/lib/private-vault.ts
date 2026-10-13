import { ApiError, safeReference, type AccessContext, type ActivityApi, type Front, type FrontDraft, type Group, type GroupDraft, type GroupCheckResult, type CheckResult, type DeleteResult, type DashboardQuery, type DashboardPage, type Onboarding } from './api'
import { isDay } from './dates'
import { decryptVault, encryptVault, type Ciphertext } from './privacy-crypto'

type ReplayResponse = Front | CheckResult | DeleteResult | Group | GroupCheckResult
type Replay = { key: string; operation: 'create_front' | 'write_check' | 'patch_front' | 'trash_front' | 'restore_front' | 'delete_front' | 'create_group' | 'patch_group' | 'record_group' | 'undo_group'; target: string | null; payload: Record<string, unknown>; response: ReplayResponse; retired_keys?: string[] }
export type PrivateDocument = { format: 1 | 2; groups?: Group[]; fronts: Front[]; checks: { front_id: string; day: string; owner?: string }[]; replays: Replay[]; onboarding?: Onboarding }
type ReadyDocument = PrivateDocument & { format: 2; groups: Group[] }
type PrivateApiOptions = { initialFronts?: readonly FrontDraft[] }
type Snapshot = { version: number; day: string; now: string; iv: string | null; ciphertext: string | null; legacy_revision: number | null; legacy: Omit<PrivateDocument, 'format'> | null }
type Loaded = { snapshot: Snapshot; content: ReadyDocument }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
// Future catalog IDs remain readable; the UI uses a local fallback for unknown keys.
const validIcon = (value: unknown) => value == null || typeof value === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(value)
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const invalid = () => new ApiError('invalid-response', 'No se ha podido verificar o descifrar el registro. Conserva tu código; no se ha sustituido ningún dato.')
const quota = () => new ApiError('validation', 'Has alcanzado el límite de almacenamiento de esta cuenta. Tus datos existentes se conservan.')
const canonical = (value: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])))
const normalizedKey = (key: string) => key.replaceAll('-', '').toLowerCase()
const requestKey = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).sort().join(',') === expected.sort().join(',')
const stripped = (name: string) => name.replace(/^[\p{White_Space}\u001c-\u001f]+|[\p{White_Space}\u001c-\u001f]+$/gu, '')
const validGroupDraft = (value: Record<string, unknown>) => typeof value.name === 'string' && !value.name.includes('\0') && value.name === stripped(value.name)
  && [...value.name].length > 0 && [...value.name].length <= 60 && typeof value.icon === 'string' && validIcon(value.icon)
const dayBefore = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
// SQL's UTC output may omit a zero fraction; preserve legacy microseconds.
const timestampOrder = (value: string) => value.replace(/(?:\.(\d{1,6}))?Z$/, (_match, fraction: string | undefined) => `.${(fraction ?? '').padEnd(6, '0')}Z`)

function document(value: unknown): ReadyDocument {
  if (!record(value) || value.format !== 1 && value.format !== 2 || !Array.isArray(value.fronts) || !Array.isArray(value.checks) || !Array.isArray(value.replays)) throw invalid()
  if (value.onboarding !== undefined && (!record(value.onboarding) || value.onboarding.version !== 1 || typeof value.onboarding.tutorialDismissed !== 'boolean')) throw invalid()
  const groups: Group[] = value.format === 1 ? [] : value.groups as Group[]
  if (!Array.isArray(groups) || groups.some(group => !record(group) || !uuid(group.id) || !validGroupDraft(group))
    || new Set(groups.map(group => group.id)).size !== groups.length) throw invalid()
  const groupIds = new Set(groups.map(group => group.id))
  const fronts = value.fronts
  if (fronts.some(f => !record(f) || !uuid(f.id) || typeof f.name !== 'string' || !f.name || !['open', 'standby', 'archived'].includes(String(f.state))
    || !(f.reference === null || typeof f.reference === 'string') || !validIcon(f.icon) || typeof f.created_at !== 'string' || typeof f.updated_at !== 'string'
    || !(f.trashed_at == null || typeof f.trashed_at === 'string' && Number.isFinite(Date.parse(f.trashed_at)))
    || value.format === 2 && !(f.group_id == null || uuid(f.group_id) && groupIds.has(f.group_id)))) throw invalid()
  const ids = new Set(fronts.map(f => f.id))
  if (ids.size !== fronts.length || value.checks.some(ch => !record(ch) || !ids.has(ch.front_id) || !isDay(ch.day) || ch.owner !== undefined && !requestKey(ch.owner))
    || new Set(value.checks.map(ch => `${ch.front_id}:${ch.day}`)).size !== value.checks.length) throw invalid()
  const requestKeys: string[] = []
  for (const r of value.replays) {
    if (!record(r) || !requestKey(r.key)
      || !['create_front', 'write_check', 'patch_front', 'trash_front', 'restore_front', 'delete_front', ...(value.format === 2 ? ['create_group', 'patch_group', 'record_group', 'undo_group'] : [])].includes(String(r.operation))
      || !(r.target === null || typeof r.target === 'string') || !record(r.payload) || !record(r.response)) throw invalid()
    if (r.operation === 'delete_front') {
      if (!uuid(r.response.front_id) || r.response.deleted !== true || Object.keys(r.response).length !== 2
        || ids.has(r.response.front_id) || r.target !== normalizedKey(r.response.front_id) || Object.keys(r.payload).length !== 0
        || r.retired_keys !== undefined && (!Array.isArray(r.retired_keys) || r.retired_keys.some(k => typeof k !== 'string' || !/^[a-f0-9]{32}$/.test(k)))) throw invalid()
    } else if (r.retired_keys !== undefined) throw invalid()
    if (r.operation === 'create_group' || r.operation === 'patch_group') {
      if (!keys(r.payload, ['name', 'icon']) || !validGroupDraft(r.payload) || !uuid(r.response.id) || !groupIds.has(r.response.id) || !validGroupDraft(r.response)
        || r.response.name !== r.payload.name || r.response.icon !== r.payload.icon
        || r.target !== (r.operation === 'create_group' ? null : normalizedKey(r.response.id))) throw invalid()
    }
    if (r.operation === 'record_group' || r.operation === 'undo_group') {
      if (!keys(r.response, ['day', 'changed_ids']) || !isDay(r.response.day) || !Array.isArray(r.response.changed_ids)
        || r.response.changed_ids.some(id => !uuid(id) || !ids.has(id)) || new Set(r.response.changed_ids).size !== r.response.changed_ids.length) throw invalid()
      if (r.operation === 'record_group' && (!keys(r.payload, ['group_id', 'day']) || r.payload.day !== r.response.day
        || !(r.payload.group_id === null || uuid(r.payload.group_id) && groupIds.has(r.payload.group_id))
        || r.target !== (r.payload.group_id === null ? null : normalizedKey(String(r.payload.group_id))))) throw invalid()
      if (r.operation === 'undo_group' && (!keys(r.payload, ['batch_request_id']) || !requestKey(r.payload.batch_request_id) || r.target !== r.payload.batch_request_id)) throw invalid()
    }
    requestKeys.push(r.key, ...(r.retired_keys as string[] | undefined ?? []))
  }
  if (new Set(requestKeys).size !== requestKeys.length) throw invalid()
  const replays = value.replays as Replay[]
  for (const replay of replays.filter(replay => replay.operation === 'undo_group')) {
    const source = replays.find(source => source.key === replay.payload.batch_request_id && source.operation === 'record_group')
    const result = replay.response as GroupCheckResult, original = source?.response as GroupCheckResult | undefined
    if (!original || result.day !== original.day || result.changed_ids.some(id => !original.changed_ids.includes(id))) throw invalid()
  }
  for (const check of value.checks.filter(check => check.owner !== undefined)) {
    const source = replays.find(replay => replay.key === check.owner)
    if (!source || !(source.operation === 'record_group' && (source.response as GroupCheckResult).day === check.day && (source.response as GroupCheckResult).changed_ids.includes(check.front_id)
      || source.operation === 'write_check' && (source.response as CheckResult).front_id === check.front_id && (source.response as CheckResult).day === check.day && (source.response as CheckResult).marked === true)) throw invalid()
  }
  // A read of an encrypted v1 document is side-effect free. Its next successful
  // CAS upgrades the schema; a cached v1 client then refuses the new format.
  return value.format === 1 ? { ...value, format: 2, groups, fronts: fronts.map(front => ({ ...front, group_id: null })) } as ReadyDocument : value as ReadyDocument
}
function draft(value: FrontDraft): FrontDraft {
  if (typeof value.name !== 'string' || value.name.includes('\0')) throw new ApiError('validation', 'Revisa el nombre del frente.')
  const name = stripped(value.name)
  const reference = safeReference(value.reference)
  if ([...name].length < 1 || [...name].length > 200 || !['open', 'standby', 'archived'].includes(value.state)
    || (value.reference !== null && (!reference || [...reference].length > 2048))) throw new ApiError('validation', 'Revisa el nombre y el enlace del frente.')
  if (!validIcon(value.icon)) throw new ApiError('validation', 'El icono del frente no es válido.')
  if (!(value.group_id == null || uuid(value.group_id))) throw new ApiError('validation', 'El grupo del frente no es válido.')
  // Omitting the field preserves old request identities and concurrent icon edits.
  return { name, reference, state: value.state, ...(value.icon !== undefined ? { icon: value.icon } : {}), ...(value.group_id !== undefined ? { group_id: value.group_id } : {}) }
}

function groupDraft(value: GroupDraft): GroupDraft {
  const result = { name: typeof value.name === 'string' ? stripped(value.name) : value.name, icon: value.icon }
  if (!validGroupDraft(result)) throw new ApiError('validation', 'Revisa el nombre y el icono del grupo.')
  return result
}

export function createInitialPrivateDocument(fronts: readonly FrontDraft[], now: string, groups: readonly Group[] = []): ReadyDocument {
  const initialGroups = groups.map(group => {
    if (!uuid(group.id)) throw new ApiError('validation', 'El identificador del grupo no es válido.')
    return { ...groupDraft(group), id: group.id }
  })
  if (new Set(initialGroups.map(group => group.id)).size !== initialGroups.length) throw new ApiError('validation', 'Los grupos deben tener identificadores diferentes.')
  const initialFronts = fronts.map(value => {
    const front = draft(value)
    if (front.group_id && !initialGroups.some(group => group.id === front.group_id)) throw new ApiError('validation', 'El grupo del frente no está disponible.')
    return { ...front, id: crypto.randomUUID(), created_at: now, updated_at: now }
  })
  return { format: 2, groups: initialGroups, fronts: initialFronts,
    checks: [], replays: [], onboarding: { version: 1, tutorialDismissed: false } }
}

function project(content: ReadyDocument, query: DashboardQuery): DashboardPage {
  const start = query.start, end = query.end
  if (!isDay(start) || !isDay(end) || end < start || Date.parse(end) - Date.parse(start) > 365 * 86400000) throw new ApiError('validation', 'Revisa el rango de fechas.')
  if (query.group_id !== undefined && query.group_id !== null && !uuid(query.group_id)) throw new ApiError('validation', 'El grupo seleccionado no es válido.')
  const lower = (value: string) => value.replace(/[A-Z]/g, letter => letter.toLowerCase())
  const search = query.search?.trim() ? lower(query.search.trim()) : null
  const items = content.fronts.filter(f => !!f.trashed_at === !!query.trashed && (!query.state || query.state === 'all' || f.state === query.state) && (search === null || lower(f.name).includes(search))
    && (query.group_id === undefined || (f.group_id ?? null) === query.group_id)).map(front => {
    const days = content.checks.filter(ch => ch.front_id === front.id).map(ch => ch.day).sort()
    const marked_dates = days.filter(day => day >= start && day <= end)
    return { front: { ...front }, marked_dates, last_registered_day: days.at(-1) ?? null, count: marked_dates.length }
  }).sort((a, b) => (query.order === 'activity_desc' ? b.count - a.count : 0) || timestampOrder(a.front.created_at).localeCompare(timestampOrder(b.front.created_at)) || a.front.id.localeCompare(b.front.id))
  const offset = query.offset ?? 0, limit = query.limit ?? 20
  return { items: items.slice(offset, offset + limit), total: items.length, offset, limit, start, end, groups: content.groups.map(group => ({ ...group })),
    ...(content.onboarding ? { onboarding: { ...content.onboarding } } : {}) }
}

function redactFrontReplays(content: ReadyDocument, frontId: string): string[] {
  const frontKey = normalizedKey(frontId), retired: string[] = [], retiredBatches = new Set<string>()
  content.replays = content.replays.filter(replay => {
    if (replay.operation === 'record_group' || replay.operation === 'undo_group') {
      const result = replay.response as GroupCheckResult
      if (!result.changed_ids.includes(frontId)) return true
      const remaining = result.changed_ids.filter(id => id !== frontId)
      if (remaining.length) { replay.response = { ...result, changed_ids: remaining }; return true }
      retired.push(replay.key)
      if (replay.operation === 'record_group') retiredBatches.add(replay.key)
      return false
    }
    if (replay.operation === 'create_group' || replay.operation === 'patch_group') return true
    const responseTarget = 'id' in replay.response ? replay.response.id : 'front_id' in replay.response ? replay.response.front_id : null
    if (normalizedKey(replay.target ?? '') !== frontKey && !(typeof responseTarget === 'string' && normalizedKey(responseTarget) === frontKey)) return true
    retired.push(replay.key, ...(replay.retired_keys ?? []))
    return false
  })
  // An undo may already have had no effect. Once its source batch is retired,
  // neither receipt may retain that batch's activity day or be replayed.
  content.replays = content.replays.filter(replay => {
    if (replay.operation !== 'undo_group' || !retiredBatches.has(String(replay.payload.batch_request_id))) return true
    retired.push(replay.key)
    return false
  })
  return retired
}

export function createPrivateApi(fetcher: typeof fetch, access: AccessContext, key: CryptoKey | null, options: PrivateApiOptions = {}): ActivityApi {
  const accountId = access.accountId
  let latest: Loaded | null = null
  let confirmed: { requestId: string; content: ReadyDocument } | null = null
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
  async function load(signal?: AbortSignal): Promise<Loaded> {
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
  async function save(snapshot: Snapshot, content: ReadyDocument, signal?: AbortSignal): Promise<Snapshot | null> {
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
      if (options.initialFronts?.length && current.content.fronts.length === 0 && current.content.checks.length === 0
        && current.content.replays.length === 0 && current.content.onboarding === undefined) {
        current.content = { ...current.content, ...createInitialPrivateDocument(options.initialFronts, current.snapshot.now) }
      }
      // Encrypt old records (including their replays) before showing the app.
      // The server removes plaintext only with a successful encrypted commit.
      const saved = await save(current.snapshot, current.content, signal)
      if (saved) return { snapshot: saved, content: current.content }
    }
    throw new ApiError('conflict', 'Otra pestaña está actualizando el registro. Reintenta la lectura.')
  }
  async function mutate(operation: Replay['operation'], target: string | null, payload: Record<string, unknown>, requestId: string): Promise<ReplayResponse> {
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
      const frontOperation = ['create_front', 'patch_front', 'write_check', 'trash_front', 'restore_front', 'delete_front'].includes(operation)
      const front = target && frontOperation ? content.fronts.find(f => normalizedKey(f.id) === normalizedKey(target)) : null
      if (target && frontOperation && !front) throw new ApiError('not-found', 'Ese frente no está disponible. Actualiza el registro.')
      if (operation === 'delete_front' && !front?.trashed_at) throw new ApiError('conflict', 'Solo puedes eliminar para siempre un frente que siga en la Papelera. Actualiza el registro.')
      if (front?.trashed_at && operation !== 'trash_front' && operation !== 'restore_front' && operation !== 'delete_front') throw new ApiError('not-found', 'Ese frente está en la papelera. Restáuralo antes de cambiarlo.')
      if ((operation === 'create_front' || operation === 'patch_front') && payload.group_id != null && !content.groups.some(group => group.id === payload.group_id)) throw new ApiError('not-found', 'Ese grupo no está disponible. Actualiza el registro.')
      let result: ReplayResponse
      let retiredKeys: string[] | undefined
      if (operation === 'create_front') {
        if (content.fronts.length >= 200) throw quota()
        result = { ...payload as FrontDraft, id: crypto.randomUUID(), created_at: snapshot.now, updated_at: snapshot.now }
        content.fronts.push(result as Front)
      } else if (operation === 'patch_front') {
        result = { ...front!, ...payload as FrontDraft, updated_at: snapshot.now }
        content.fronts[content.fronts.indexOf(front!)] = result
      } else if (operation === 'trash_front' || operation === 'restore_front') {
        result = { ...front!, trashed_at: operation === 'trash_front' ? front!.trashed_at ?? snapshot.now : null }
        content.fronts[content.fronts.indexOf(front!)] = result
      } else if (operation === 'delete_front') {
        // Retain consumed request IDs only: an old create must never recreate
        // deleted content, even after a committed response was lost.
        retiredKeys = redactFrontReplays(content, front!.id)
        content.fronts = content.fronts.filter(f => f.id !== front!.id)
        content.checks = content.checks.filter(ch => ch.front_id !== front!.id)
        result = { front_id: front!.id, deleted: true }
      } else if (operation === 'create_group') {
        result = { ...payload as GroupDraft, id: crypto.randomUUID() }
        content.groups.push(result as Group)
      } else if (operation === 'patch_group') {
        const group = content.groups.find(group => normalizedKey(group.id) === normalizedKey(target!))
        if (!group) throw new ApiError('not-found', 'Ese grupo no está disponible. Actualiza el registro.')
        result = { ...group, ...payload as GroupDraft }
        content.groups[content.groups.indexOf(group)] = result as Group
      } else if (operation === 'record_group') {
        const day = payload.day
        if (!isDay(day) || day > snapshot.day) throw new ApiError('validation', 'No se puede registrar actividad para un día futuro.')
        if (target && !content.groups.some(group => group.id === target)) throw new ApiError('not-found', 'Ese grupo no está disponible. Actualiza el registro.')
        const marked = new Set(content.checks.filter(check => check.day === day).map(check => check.front_id))
        const pending = content.fronts.filter(front => (front.group_id ?? null) === payload.group_id && front.state === 'open' && !front.trashed_at && !marked.has(front.id))
        content.checks.push(...pending.map(front => ({ front_id: front.id, day, owner: replayKey })))
        result = { day, changed_ids: pending.map(front => front.id) }
      } else if (operation === 'undo_group') {
        if (content.replays.some(replay => replay.retired_keys?.includes(target!))) throw new ApiError('deleted-request', 'Los frentes de esta solicitud ya se han eliminado para siempre.')
        const source = content.replays.find(replay => replay.key === target && replay.operation === 'record_group')
        if (!source) throw new ApiError('not-found', 'Ese registro de grupo no está disponible. Actualiza el registro.')
        const day = (source.response as GroupCheckResult).day
        const liveIds = new Set(content.fronts.filter(front => !front.trashed_at).map(front => front.id))
        const removed = content.checks.filter(check => check.owner === target && check.day === day && liveIds.has(check.front_id))
        const changedIds = new Set(removed.map(check => check.front_id))
        content.checks = content.checks.filter(check => !(check.owner === target && check.day === day && changedIds.has(check.front_id)))
        result = { day, changed_ids: [...changedIds] }
      } else {
        const day = payload.day === 'today' ? snapshot.day : payload.day === 'yesterday' ? dayBefore(snapshot.day) : String(payload.day)
        if (!isDay(day) || day > snapshot.day || typeof payload.marked !== 'boolean') throw new ApiError('validation', 'No se puede registrar actividad para un día futuro.')
        content.checks = content.checks.filter(ch => !(ch.front_id === front!.id && ch.day === day))
        if (payload.marked) content.checks.push({ front_id: front!.id, day, owner: replayKey })
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
  async function dismissTutorial(requestId: string): Promise<void> {
    if (!/^[a-f0-9]{32}$/.test(normalizedKey(requestId))) throw new ApiError('validation', 'El identificador de solicitud no es válido.')
    const generation = memoryGeneration
    latest = null; confirmed = null
    // A monotonic preference needs no replay operation. On a conflict, load the
    // latest document and only set this flag; never replace another tab's work.
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await load()
      if (!current.content.onboarding || current.content.onboarding.tutorialDismissed) {
        confirm(current, requestId, generation)
        return
      }
      current.content.onboarding = { ...current.content.onboarding, tutorialDismissed: true }
      const saved = await save(current.snapshot, current.content)
      if (saved) {
        confirm({ snapshot: saved, content: current.content }, requestId, generation)
        return
      }
    }
    throw new ApiError('conflict', 'Otra pestaña está actualizando el registro. Reintenta con la misma solicitud.')
  }
  return {
    supportsFrontIcons: true,
    supportsGroups: true,
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
    dismissTutorial,
    async createFront(value, id) { return await mutate('create_front', null, draft(value), id) as Front },
    async patchFront(id, value, requestId = crypto.randomUUID()) { return await mutate('patch_front', id, draft(value), requestId) as Front },
    async writeCheck(id, day, marked, requestId) { return await mutate('write_check', id, { day, marked }, requestId) as CheckResult },
    async createGroup(value, requestId) { return await mutate('create_group', null, groupDraft(value), requestId) as Group },
    async patchGroup(id, value, requestId) {
      if (!uuid(id)) throw new ApiError('validation', 'El identificador del grupo no es válido.')
      return await mutate('patch_group', id, groupDraft(value), requestId) as Group
    },
    async recordGroup(groupId, day, requestId) {
      if (groupId !== null && !uuid(groupId)) throw new ApiError('validation', 'El identificador del grupo no es válido.')
      return await mutate('record_group', groupId, { group_id: groupId, day }, requestId) as GroupCheckResult
    },
    async undoGroup(batchRequestId, requestId) {
      const batchKey = normalizedKey(batchRequestId)
      if (!requestKey(batchKey)) throw new ApiError('validation', 'El identificador de solicitud no es válido.')
      return await mutate('undo_group', batchKey, { batch_request_id: batchKey }, requestId) as GroupCheckResult
    },
    async trashFront(id, requestId) { return await mutate('trash_front', id, {}, requestId) as Front },
    async restoreFront(id, requestId) { return await mutate('restore_front', id, {}, requestId) as Front },
    async deleteFront(id, requestId) { return await mutate('delete_front', id, {}, requestId) as DeleteResult },
  }
}
