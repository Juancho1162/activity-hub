import { describe, expect, it, vi } from "vitest"
import { createApi, safeReference } from "../src/lib/api"
import { front, page } from "./fixtures"

const key = "00000000-0000-4000-8000-000000000099"
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

describe("Cliente de la API privada", () => {
  it("envía la cuenta capturada en lecturas y todas las escrituras", async () => {
    const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).startsWith("/api/dashboard")) return response(page())
      if (init?.method === "PUT") return response({ front_id: front.id, day: "2026-10-03", marked: true })
      return response({ ...front, reference: null })
    })
    const client = createApi(fetcher, { accountId, csrfToken: "A".repeat(43) })
    await client.dashboard({ start: "2026-10-03", end: "2026-10-03" })
    await client.createFront({ ...front, reference: null }, key)
    await client.patchFront(front.id, { ...front, reference: null })
    await client.writeCheck(front.id, "2026-10-03", true, key)
    expect(fetcher.mock.calls.map(([, init]) => new Headers(init?.headers).get("X-Activity-Account"))).toEqual(Array(4).fill(accountId))
  })
  it("409 de contexto invalida acceso sin confundir un conflicto de idempotencia", async () => {
    const denied = vi.fn()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ detail: "Account context changed" }, 409))
      .mockResolvedValueOnce(response({ detail: "Idempotency conflict" }, 409))
    const client = createApi(fetcher, { accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", csrfToken: "A".repeat(43), onAccessDenied: denied })
    await expect(client.createFront(front, key)).rejects.toMatchObject({ kind: "unauthorized", uncertain: false })
    expect(denied).toHaveBeenCalledExactlyOnceWith(409)
    await expect(client.createFront(front, key)).rejects.toMatchObject({ kind: "conflict", uncertain: false })
    expect(denied).toHaveBeenCalledTimes(1)
  })
  it("consulta por fechas/estado/página usando únicamente la API del mismo origen", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(page()))
    const result = await createApi(fetcher).dashboard({ start: "2026-10-03", end: "2026-10-03", state: "open", search: "Guitarra" })
    expect(result).toEqual(page())
    const url = new URL(String(fetcher.mock.calls[0][0]), "http://localhost")
    expect(url.pathname).toBe("/api/dashboard")
    expect(url.searchParams.get("states")).toBe("open")
    expect(url.searchParams.get("search")).toBe("Guitarra")
    expect(url.searchParams.get("limit")).toBe("20")
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store", redirect: "error" })
  })
  it.each(["created", "activity_desc"] as const)("envía el orden %s al servidor sin ordenar una página en el cliente", async (order) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(page()))
    await createApi(fetcher).dashboard({ start: "2026-10-03", end: "2026-10-03", order })
    const url = new URL(String(fetcher.mock.calls[0][0]), "http://localhost")
    expect(url.searchParams.get("order")).toBe(order)
  })
  it("envía fecha absoluta, valor deseado y la misma clave en el reintento", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response({ front_id: front.id, day: "2026-10-03", marked: true }))
    const api = createApi(fetcher)
    await api.writeCheck(front.id, "2026-10-03", true, key)
    await api.writeCheck(front.id, "2026-10-03", true, key)
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.method).toBe("PUT")
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(key)
      expect(JSON.parse(String(init?.body))).toEqual({ day: "2026-10-03", marked: true })
      expect(new Headers(init?.headers).has("Authorization")).toBe(false)
    }
  })
  it("crea y edita sin campos extra, permite borrar la referencia", async () => {
    const draft = { name: "Guitarra", reference: null, state: "open" as const }
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response({ ...front, reference: null }))
    const api = createApi(fetcher)
    await api.createFront(draft, key)
    await api.patchFront(front.id, draft)
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/fronts", `/api/fronts/${front.id}`])
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual(draft)
  })
  it.each([
    [503, "Private access is not configured", "unavailable", true],
    [503, "Service unavailable", "unavailable", true],
    [403, "private-marker", "unauthorized", false],
    [422, "private-marker", "validation", false],
    [409, "private-marker", "conflict", false],
    [404, "private-marker", "not-found", false],
  ])("clasifica HTTP %s sin devolver valores privados", async (status, detail, kind, uncertain) => {
    const api = createApi(vi.fn<typeof fetch>().mockResolvedValue(response({ detail }, status)))
    const error = await api.createFront(front, key).catch((error: Error) => error)
    expect(error).toMatchObject({ kind, uncertain })
    expect(String(error)).not.toContain("private-marker")
  })
  it("un error de red en escritura es incierto, nunca éxito", async () => {
    const api = createApi(vi.fn<typeof fetch>().mockRejectedValue(new TypeError("private-marker")))
    await expect(api.createFront(front, key)).rejects.toMatchObject({ kind: "network", uncertain: true })
  })
  it("rechaza respuestas incoherentes en vez de confirmar el check", async () => {
    const api = createApi(vi.fn<typeof fetch>().mockResolvedValue(response({ front_id: front.id, day: "2026-10-04", marked: false })))
    await expect(api.writeCheck(front.id, "2026-10-03", true, key)).rejects.toMatchObject({ kind: "invalid-response", uncertain: true })
  })
  it.each([
    { ...front, id: "00000000-0000-4000-8000-000000000002", reference: null, state: "archived" },
    { ...front, reference: null, state: "open" },
    { ...front, reference: "https://example.test/old", state: "archived" },
    { ...front, name: "Otro frente", reference: null, state: "archived" },
  ])("no confirma una edición cuya respuesta no corresponde al ID o contenido: %j", async (body) => {
    const client = createApi(vi.fn<typeof fetch>().mockResolvedValue(response(body)))
    await expect(client.patchFront(front.id, { name: "Guitarra", reference: null, state: "archived" }))
      .rejects.toMatchObject({ kind: "invalid-response", uncertain: true })
  })
  it("no confirma un alta con contenido distinto al solicitado", async () => {
    const client = createApi(vi.fn<typeof fetch>().mockResolvedValue(response(front, 201)))
    await expect(client.createFront({ name: "Lectura", reference: null, state: "standby" }, key))
      .rejects.toMatchObject({ kind: "invalid-response", uncertain: true })
  })
  it("admite normalización de nombre y URL documentada por el backend", async () => {
    const normalized = { ...front, name: "Guitarra", reference: "https://example.test/" }
    const client = createApi(vi.fn<typeof fetch>().mockImplementation(async () => response(normalized)))
    const draft = { name: "\u0085 \tGuitarra \n", reference: "https://EXAMPLE.test:443", state: "open" as const }
    await expect(client.createFront(draft, key)).resolves.toEqual(normalized)
    await expect(client.patchFront(front.id, draft)).resolves.toEqual(normalized)
  })
  it("no interpreta una respuesta malformada o de otro período como lista vacía", async () => {
    for (const body of [{}, page("2026-10-02"), { ...page(), items: [{ ...page().items[0], count: 8 }] }]) {
      const api = createApi(vi.fn<typeof fetch>().mockResolvedValue(response(body)))
      await expect(api.dashboard({ start: "2026-10-03", end: "2026-10-03" })).rejects.toMatchObject({ kind: "invalid-response" })
    }
  })
  it("añade el CSRF actual a cada escritura, conserva la identidad y no lo envía en lecturas", async () => {
    let csrf = "A".repeat(43)
    const denied = vi.fn()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).startsWith("/api/dashboard")) return response(page())
      if (init?.method === "PUT") return response({ front_id: front.id, day: "2026-10-03", marked: true })
      return response({ ...front, reference: null })
    })
    const client = createApi(fetcher, { accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", csrfToken: () => csrf, onAccessDenied: denied })
    await client.dashboard({ start: "2026-10-03", end: "2026-10-03" })
    await client.createFront({ ...front, reference: null }, key)
    csrf = "B".repeat(43)
    await client.patchFront(front.id, { ...front, reference: null })
    await client.writeCheck(front.id, "2026-10-03", true, key)
    expect(fetcher.mock.calls.map(([, init]) => new Headers(init?.headers).get("X-CSRF-Token")))
      .toEqual([null, "A".repeat(43), "B".repeat(43), "B".repeat(43)])
    expect(new Headers(fetcher.mock.calls[3][1]?.headers).get("Idempotency-Key")).toBe(key)
    expect(denied).not.toHaveBeenCalled()
  })
  it.each([401, 403] as const)("notifica el rechazo %s sin reintentar una mutación", async (status) => {
    const denied = vi.fn()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ detail: "private-marker" }, status))
    const client = createApi(fetcher, { accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", csrfToken: "A".repeat(43), onAccessDenied: denied })
    await expect(client.createFront(front, key)).rejects.toMatchObject({ kind: "unauthorized", uncertain: false })
    expect(denied).toHaveBeenCalledExactlyOnceWith(status)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it("no construye enlaces ejecutables desde referencias", () => {
    for (const url of [null, "javascript:alert(1)", "data:text/html,x", "/path", "not-url"]) expect(safeReference(url)).toBeNull()
    expect(safeReference("https://example.test")).toBe("https://example.test/")
  })
})
