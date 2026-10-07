import { isDay } from "./dates"

export type FrontState = "open" | "standby" | "archived"
export type FrontDraft = { name: string; reference: string | null; state: FrontState }
export type Front = FrontDraft & { id: string; created_at: string; updated_at: string; trashed_at?: string | null }
export type DashboardItem = { front: Front; marked_dates: string[]; last_registered_day: string | null; count: number }
export type DashboardPage = { items: DashboardItem[]; total: number; limit: number; offset: number; start: string; end: string }
export type DashboardQuery = { start: string; end: string; state?: FrontState | "all"; search?: string; limit?: number; offset?: number; order?: "created" | "activity_desc"; trashed?: boolean }
export type CheckResult = { front_id: string; day: string; marked: boolean }
export type ErrorKind = "access-pending" | "unauthorized" | "network" | "validation" | "conflict" | "unavailable" | "invalid-response" | "not-found"
export class ApiError extends Error {
  constructor(public kind: ErrorKind, message: string, public uncertain = false) { super(message) }
}
export interface ActivityApi {
  dashboard(query: DashboardQuery, signal?: AbortSignal): Promise<DashboardPage>
  createFront(data: FrontDraft, requestId: string): Promise<Front>
  patchFront(id: string, data: FrontDraft): Promise<Front>
  writeCheck(id: string, day: string, marked: boolean, requestId: string): Promise<CheckResult>
  trashFront?(id: string, requestId: string): Promise<Front>
  restoreFront?(id: string, requestId: string): Promise<Front>
  /** Project only the authenticated snapshot confirmed by this exact request. */
  confirmedDashboard?(requestId: string, query: DashboardQuery): DashboardPage | null
  forgetSnapshot?(): void
}
export function safeReference(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ["https:", "http:"].includes(url.protocol) ? url.href : null
  } catch { return null }
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
function validFront(value: unknown): value is Front {
  return record(value) && uuid(value.id) && typeof value.name === "string" && value.name.trim().length > 0
    && (value.reference === null || typeof value.reference === "string")
    && ["open", "standby", "archived"].includes(String(value.state))
    && typeof value.created_at === "string" && typeof value.updated_at === "string"
}
function validPage(value: unknown, query: DashboardQuery): value is DashboardPage {
  if (!record(value) || !Array.isArray(value.items) || !integer(value.total) || !integer(value.offset)
    || value.offset !== (query.offset ?? 0) || value.limit !== (query.limit ?? 20)
    || value.start !== query.start || value.end !== query.end || value.items.length > value.limit
    || value.total < value.items.length || new Set(value.items.map((item) => item?.front?.id)).size !== value.items.length) return false
  return value.items.every((item: unknown) => record(item) && validFront(item.front)
    && Array.isArray(item.marked_dates) && item.count === item.marked_dates.length
    && new Set(item.marked_dates).size === item.marked_dates.length
    && (item.last_registered_day === null || isDay(item.last_registered_day))
    && item.marked_dates.every((day: unknown) => isDay(day) && day >= query.start && day <= query.end
      && typeof item.last_registered_day === "string" && day <= item.last_registered_day))
}
const invalidResponse = (write: boolean) => new ApiError("invalid-response", "La respuesta del servidor no es válida. No podemos confirmar el resultado.", write)
const draftBody = (data: FrontDraft): FrontDraft => ({ name: data.name, reference: data.reference, state: data.state })

export type AccessContext = {
  accountId: string
  csrfToken: string | (() => string | null)
  onAccessDenied?: (status: 401 | 403 | 409) => void
}

export function createApi(fetcher: typeof fetch = fetch, access?: AccessContext): ActivityApi {
  async function request(path: string, method = "GET", body?: unknown, key?: string, signal?: AbortSignal): Promise<unknown> {
    const write = method !== "GET"
    const csrf = write ? (typeof access?.csrfToken === "function" ? access.csrfToken() : access?.csrfToken) : null
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) abort()
    const timer = setTimeout(abort, 15000)
    try {
      const response = await fetcher(path, {
        method, credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
        headers: { Accept: "application/json", ...(access ? { "X-Activity-Account": access.accountId } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(key ? { "Idempotency-Key": key } : {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      let data: unknown
      try { data = await response.json() } catch { data = null }
      if (!response.ok) {
        const changedAccount = response.status === 409 && record(data) && data.detail === "Account context changed"
        if (response.status === 401 || response.status === 403 || changedAccount) {
          if (!signal?.aborted) access?.onAccessDenied?.(response.status as 401 | 403 | 409)
          throw new ApiError("unauthorized", changedAccount ? "La cuenta activa ha cambiado. Comprueba la sesión antes de continuar." : response.status === 401
            ? "La sesión ha caducado o se ha revocado. Vuelve a entrar con tu código privado."
            : "No se ha autorizado el cambio. Comprueba la sesión y vuelve a enviarlo explícitamente.")
        }
        if (response.status === 409) throw new ApiError("conflict", "La solicitud entra en conflicto con una anterior. Revisa el registro antes de continuar.")
        if ([400, 422].includes(response.status)) throw new ApiError("validation", "Revisa el nombre, el enlace y las fechas. El servidor ha rechazado la solicitud.")
        if (response.status === 404) throw new ApiError("not-found", "Ese frente no está disponible. Actualiza la lista.")
        throw new ApiError("unavailable", "El servidor no está disponible. No podemos confirmar el resultado.", write)
      }
      if (data === null) throw invalidResponse(write)
      return data
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError")
      if (error instanceof ApiError) throw error
      throw new ApiError("network", "No se ha podido conectar con el servidor. No podemos confirmar el resultado.", write)
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
    }
  }
  const pathFor = (id: string) => {
    if (!uuid(id)) throw new ApiError("validation", "El identificador del frente no es válido.")
    return `/api/fronts/${id}`
  }
  const parseFront = (data: unknown, expected: FrontDraft, id?: string): Front => {
    if (!validFront(data)) throw invalidResponse(true)
    // Python str.strip includes Unicode White_Space plus these four controls.
    const name = expected.name.replace(/^[\p{White_Space}\u001c-\u001f]+|[\p{White_Space}\u001c-\u001f]+$/gu, "")
    const reference = safeReference(expected.reference)
    if ((id !== undefined && data.id.toLowerCase() !== id.toLowerCase()) || data.name !== name || data.state !== expected.state
      || (expected.reference === null ? data.reference !== null : reference === null || safeReference(data.reference) !== reference)) {
      throw invalidResponse(true)
    }
    return data
  }
  return {
    async dashboard(query, signal) {
      const params = new URLSearchParams({ start: query.start, end: query.end, limit: String(query.limit ?? 20), offset: String(query.offset ?? 0) })
      if (query.order) params.set("order", query.order)
      if (query.state && query.state !== "all") params.set("states", query.state)
      if (query.search?.trim()) params.set("search", query.search.trim())
      const data = await request(`/api/dashboard?${params}`, "GET", undefined, undefined, signal)
      if (!validPage(data, query)) throw invalidResponse(false)
      return data
    },
    async createFront(data, key) {
      const body = draftBody(data)
      return parseFront(await request("/api/fronts", "POST", body, key), body)
    },
    async patchFront(id, data) {
      const body = draftBody(data)
      return parseFront(await request(pathFor(id), "PATCH", body), body, id)
    },
    async writeCheck(id, day, marked, key) {
      if (!isDay(day)) throw new ApiError("validation", "Selecciona una fecha de calendario válida.")
      const data = await request(`${pathFor(id)}/check`, "PUT", { day, marked }, key)
      if (!record(data) || data.front_id !== id || data.day !== day || data.marked !== marked) throw invalidResponse(true)
      return { front_id: id, day, marked }
    },
  }
}
