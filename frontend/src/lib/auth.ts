import type { AccessContext, ActivityApi } from './api'
export type AuthSession = { authenticated: true; account_id: string; csrf_token: string; expires_at: string }
export type SignupOut = { account_id: string; code: string }
export type AuthErrorKind = "invalid-code" | "rate-limit" | "account-changed" | "signup-conflict" | "forbidden" | "network" | "unavailable" | "invalid-response"
export class AuthError extends Error {
  constructor(public kind: AuthErrorKind, message: string, public retryAfter: number | null = null) { super(message) }
}
export interface AuthClient {
  session(signal?: AbortSignal): Promise<AuthSession | null>
  signup(): Promise<SignupOut>
  login(code: string): Promise<AuthSession>
  logout(csrfToken: string, accountId: string): Promise<void>
  canRead?(accountId: string): boolean
  lock?(): void
  createApi?(access: AccessContext): ActivityApi
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null
const accountId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
function validSession(value: unknown): value is AuthSession {
  return record(value) && value.authenticated === true && accountId(value.account_id)
    && typeof value.csrf_token === "string" && /^[A-Za-z0-9_-]{43}$/.test(value.csrf_token)
    && typeof value.expires_at === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.expires_at)
    && Number.isFinite(Date.parse(value.expires_at))
}
function validSignup(value: unknown): value is SignupOut {
  return record(value) && accountId(value.account_id) && typeof value.code === "string"
    && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}(?:-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}){7}$/.test(value.code)
}
const uncertainSignup = "No se ha podido confirmar la creación. Puede haberse creado una cuenta cuyo código no conocemos. Crear de nuevo sería otra cuenta; no reintentamos automáticamente."
const invalid = (signup = false) => new AuthError("invalid-response", signup ? uncertainSignup : "La respuesta de acceso no es válida. Reintenta la conexión; no se ha confirmado la sesión.")

/** Only same-origin HttpOnly cookies authenticate. Codes and CSRF live in memory. */
export function createAuthClient(fetcher: typeof fetch = fetch): AuthClient {
  async function request(action: "session" | "signup" | "login" | "logout", options: { code?: string; csrfToken?: string; accountId?: string; signal?: AbortSignal } = {}): Promise<AuthSession | SignupOut | null> {
    const { signal, code, csrfToken } = options
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) abort()
    const timer = setTimeout(abort, 15000)
    const json = action === "login" || action === "signup"
    try {
      const response = await fetcher(`/auth/${action}`, {
        method: action === "session" ? "GET" : "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
        headers: { Accept: "application/json", ...(json ? { "Content-Type": "application/json" } : {}), ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}), ...(action === "logout" ? { "X-Activity-Account": options.accountId! } : {}) },
        ...(json ? { body: JSON.stringify(action === "signup" ? {} : { code }) } : {}),
      })
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError")
      if (response.status === 401 && (action === "session" || action === "logout")) return null
      if (response.status === 204 && action === "logout") return null
      let data: unknown
      try { data = await response.json() } catch { data = null }
      if (!response.ok) {
        if (response.status === 401 && action === "login") throw new AuthError("invalid-code", "Código incorrecto. Comprueba tu código privado y vuelve a intentarlo.")
        if (response.status === 429) {
          const header = response.headers.get("Retry-After")
          const retryAfter = header && /^\d+$/.test(header) ? Math.min(60, Math.max(1, Number(header))) : 60
          throw new AuthError("rate-limit", `Demasiados intentos. Espera ${retryAfter} segundos antes de ${action === "signup" ? "crear otra cuenta" : "volver a entrar"}.`, retryAfter)
        }
        if (response.status === 409 && action === "logout" && record(data) && data.detail === "Account context changed") throw new AuthError("account-changed", "La cuenta activa ha cambiado. No se ha cerrado la otra cuenta.")
        if (response.status === 409 && action === "signup") throw new AuthError("signup-conflict", "Cierra la sesión antes de crear una cuenta. No se ha creado otra cuenta.")
        if (response.status === 403 && record(data) && ['Registration closed', 'Registration capacity reached'].includes(String(data.detail))) throw new AuthError("forbidden", "La creación de cuentas está cerrada o ha alcanzado su capacidad. Las cuentas existentes pueden entrar.")
        if (response.status === 403 && record(data) && data.detail === 'Verification required') throw new AuthError("forbidden", "La verificación ha caducado o no es válida. Vuelve a iniciar la creación de la cuenta.")
        if (response.status === 403) throw new AuthError("forbidden", "La solicitud de acceso fue rechazada. Comprueba el origen de la aplicación y reintenta.")
        throw new AuthError("unavailable", "El servidor o el esquema de datos no está disponible. Consulta las migraciones en el README y reintenta.")
      }
      if (action === "signup") {
        if (response.status !== 201 || !validSignup(data)) throw invalid(true)
        return { account_id: data.account_id, code: data.code }
      }
      if (response.status !== 200 || action === "logout" || !validSession(data)) throw invalid()
      return { authenticated: true, account_id: data.account_id, csrf_token: data.csrf_token, expires_at: data.expires_at }
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError")
      if (error instanceof AuthError) throw error
      throw new AuthError("network", action === "signup" ? uncertainSignup : "No se ha podido conectar con el servidor. Reintenta explícitamente; no se ha confirmado el acceso.")
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
    }
  }
  return {
    async session(signal) {
      const proof = await request("session", { signal })
      if (proof !== null && !validSession(proof)) throw invalid()
      return proof
    },
    async signup() {
      const result = await request("signup")
      if (!validSignup(result)) throw invalid(true)
      return result
    },
    async login(code) {
      const proof = await request("login", { code })
      if (!validSession(proof)) throw invalid()
      return proof
    },
    async logout(csrfToken, accountId) { await request("logout", { csrfToken, accountId }) },
  }
}
