import { describe, expect, it, vi } from "vitest"
import { createAuthClient } from "../src/lib/auth"

const csrf = "A".repeat(43)
const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const signup = { account_id: accountId, code: "ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789" }
const session = { authenticated: true, account_id: accountId, csrf_token: csrf, expires_at: "2030-11-02T12:00:00Z" }
const response = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } })

describe("Transporte de autenticación por cookie", () => {
  it("crea solo por POST JSON vacío, valida el código y no abre sesión", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(signup, 201))
    await expect(createAuthClient(fetcher).signup()).resolves.toEqual(signup)
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("/auth/signup", expect.objectContaining({ method: "POST", body: "{}", credentials: "same-origin", cache: "no-store", redirect: "error" }))
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers)
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(headers.has("X-Activity-Account")).toBe(false)
    expect(headers.has("X-CSRF-Token")).toBe(false)
  })
  it.each([{ ...signup, code: "bad" }, { ...signup, code: signup.code.toLowerCase() }, { ...signup, account_id: "not-uuid" }, { account_id: accountId }])("rechaza un alta incoherente sin reemitir: %j", async (body) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(body, 201))
    await expect(createAuthClient(fetcher).signup()).rejects.toMatchObject({ kind: "invalid-response" })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it("distingue el límite de altas del de entrada y el contexto de cierre", async () => {
    const auth = createAuthClient(vi.fn<typeof fetch>().mockImplementation(async (url) => response({ detail: "Account context changed" }, url === "/auth/logout" ? 409 : 429, { "Retry-After": "5" })))
    await expect(auth.signup()).rejects.toMatchObject({ kind: "rate-limit", retryAfter: 5, message: expect.stringMatching(/crear otra cuenta/) })
    await expect(auth.logout(csrf, accountId)).rejects.toMatchObject({ kind: "account-changed" })
  })
  it("valida y recupera la sesión sin almacenar ni enviar credenciales alternativas", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(session))
    await expect(createAuthClient(fetcher).session()).resolves.toEqual(session)
    expect(fetcher).toHaveBeenCalledWith("/auth/session", expect.objectContaining({ method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: expect.any(AbortSignal) }))
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers)
    expect(headers.get("Accept")).toBe("application/json")
    for (const name of ["Authorization", "Origin", "X-CSRF-Token", "X-Activity-Account"]) expect(headers.has(name)).toBe(false)
  })
  it("manda el código solo en JSON y el CSRF solo en la cabecera de cierre", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(session)).mockResolvedValueOnce(new Response(null, { status: 204 }))
    const auth = createAuthClient(fetcher)
    await auth.login("test-private-code")
    await auth.logout(csrf, accountId)
    const [login, logout] = fetcher.mock.calls
    expect(login[0]).toBe("/auth/login")
    expect(login[1]).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", body: JSON.stringify({ code: "test-private-code" }) })
    expect(new Headers(login[1]?.headers).get("Content-Type")).toBe("application/json")
    expect(new Headers(login[1]?.headers).has("Origin")).toBe(false)
    expect(new Headers(login[1]?.headers).has("X-Activity-Account")).toBe(false)
    expect(logout[0]).toBe("/auth/logout")
    expect(logout[1]).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error" })
    expect(new Headers(logout[1]?.headers).get("X-CSRF-Token")).toBe(csrf)
    expect(new Headers(logout[1]?.headers).get("X-Activity-Account")).toBe(accountId)
    expect(logout[1]?.body).toBeUndefined()
  })
  it("401 de estado es ausencia de sesión y 401 de cierre ya está cerrado", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response({ detail: "private-marker" }, 401))
    const auth = createAuthClient(fetcher)
    await expect(auth.session()).resolves.toBeNull()
    await expect(auth.logout(csrf, accountId)).resolves.toBeUndefined()
    await expect(auth.login("test-code")).rejects.toMatchObject({ kind: "invalid-code" })
  })
  it.each([
    [503, "Private access is not configured", "unavailable"],
    [503, "Service unavailable", "unavailable"],
    [500, "private-marker", "unavailable"],
    [403, "private-marker", "forbidden"],
  ])("clasifica %s sin mostrar el cuerpo privado", async (status, detail, kind) => {
    const auth = createAuthClient(vi.fn<typeof fetch>().mockResolvedValue(response({ detail }, status)))
    const error = await auth.login("test-code").catch((error: unknown) => error)
    expect(error).toMatchObject({ kind })
    expect(String(error)).not.toContain("private-marker")
  })
  it("limita Retry-After a 60 segundos y no reintenta automáticamente", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ detail: "private-marker" }, 429, { "Retry-After": "999" }))
    await expect(createAuthClient(fetcher).login("test-code")).rejects.toMatchObject({ kind: "rate-limit", retryAfter: 60 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([
    {}, { ...session, authenticated: false }, { ...session, account_id: undefined }, { ...session, account_id: accountId.toUpperCase() }, { ...session, csrf_token: "short" },
    { ...session, csrf_token: "/".repeat(43) }, { ...session, expires_at: "not-a-date" },
    { ...session, expires_at: "2030-11-02" },
  ])("rechaza un éxito malformado: %j", async (body) => {
    await expect(createAuthClient(vi.fn<typeof fetch>().mockResolvedValue(response(body))).session())
      .rejects.toMatchObject({ kind: "invalid-response" })
  })
  it("no interpreta errores de red ni HTML como sesiones válidas", async () => {
    await expect(createAuthClient(vi.fn<typeof fetch>().mockRejectedValue(new Error("private-marker"))).login("test-code"))
      .rejects.toMatchObject({ kind: "network" })
    await expect(createAuthClient(vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>private-marker</html>"))).session())
      .rejects.toMatchObject({ kind: "invalid-response" })
  })
  it("aborta una lectura obsoleta y acota una petición a 15 segundos", async () => {
    vi.useFakeTimers()
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
      }))
      const controller = new AbortController()
      const auth = createAuthClient(fetcher)
      const cancelled = expect(auth.session(controller.signal)).rejects.toMatchObject({ name: "AbortError" })
      controller.abort()
      await cancelled
      const timedOut = expect(auth.login("test-code")).rejects.toMatchObject({ kind: "network" })
      await vi.advanceTimersByTimeAsync(15000)
      await timedOut
    } finally { vi.useRealTimers() }
  })
})
