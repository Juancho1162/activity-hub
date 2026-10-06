// @vitest-environment node
import { describe, expect, it } from "vitest"
import { ApiError, type ActivityApi, type DashboardQuery, type FrontDraft, type FrontState } from "@/lib/api"
import { todayInMadrid } from "@/lib/dates"
import { MIN_DAY, SIMULATED_TODAY, freshSample } from "./sample.mjs"
import { createMemoryApi, sampleClock } from "./memoryApi"

const full: DashboardQuery = { start: MIN_DAY, end: SIMULATED_TODAY, state: "all" }
const query = (api: ActivityApi, patch: Partial<DashboardQuery> = {}) => api.dashboard({ ...full, ...patch })

async function expectCertainValidation(operation: Promise<unknown>) {
  try { await operation; throw new Error("Expected sample validation failure") }
  catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: "validation", uncertain: false })
  }
}

describe("ActivityApi — adaptador ficticio en memoria, no protocolo de servidor", () => {
  it("usa el clock fijo de Madrid, extremos inclusivos y último registro GLOBAL", async () => {
    expect(todayInMadrid(sampleClock())).toBe(SIMULATED_TODAY)
    const api = createMemoryApi()
    const page = await query(api, { start: "2026-09-10", end: "2026-09-14" })
    expect(page).toMatchObject({ total: 8, limit: 20, offset: 0, start: "2026-09-10", end: "2026-09-14" })
    expect(page.items[0]).toMatchObject({ count: 2, marked_dates: ["2026-09-10", "2026-09-14"], last_registered_day: SIMULATED_TODAY })
    expect(page.items[4]).toMatchObject({ count: 0, marked_dates: [], last_registered_day: null })
    const oneDay = await query(api, { start: MIN_DAY, end: MIN_DAY })
    expect(oneDay.items[0].marked_dates).toEqual([MIN_DAY])
    const short = await query(api, { start: "2026-09-28" })
    expect(short.items.find((item) => item.front.id === "sample-06")).toMatchObject({ count: 0, marked_dates: [], last_registered_day: "2026-09-20" })
  })

  it("ordena GLOBALMENTE antes de paginar, también un frente creado al final; empates por creación/ID", async () => {
    const api = createMemoryApi()
    const last = await api.createFront({ name: "Último en crearse", state: "open", reference: null }, "new")
    for (const day of ["2026-09-25", "2026-09-26", "2026-09-27"]) await api.writeCheck(last.id, day, true, day)
    const firstPage = await query(api, { start: "2026-09-25", end: "2026-09-27", order: "activity_desc", limit: 2 })
    expect(firstPage.total).toBe(9)
    expect(firstPage.items.map((item) => item.front.id)).toEqual([last.id, "sample-01"])
    const secondPage = await query(api, { start: "2026-09-25", end: "2026-09-27", order: "activity_desc", limit: 2, offset: 2 })
    expect(secondPage.items.map((item) => item.front.id)).toEqual(["sample-03", "sample-02"])
    const creation = await query(api, { order: "created", limit: 2 })
    expect(creation.items.map((item) => item.front.id)).toEqual(["sample-01", "sample-02"])
    expect((await query(api, { order: "created", limit: 2, offset: 8 })).items[0].front.id).toBe(last.id)
    expect((await query(api, { offset: 99 })).items).toEqual([])
  })

  it("filtra por estado y subcadena literal ASCII; no normaliza acentos ni comodines", async () => {
    const api = createMemoryApi()
    expect((await api.dashboard({ start: MIN_DAY, end: SIMULATED_TODAY })).total).toBe(8)
    expect((await query(api, { state: "open" })).total).toBe(5)
    expect((await query(api, { state: "standby", search: "  FOTOGRAFíA  " })).items[0].front.id).toBe("sample-06")
    for (const search of ["FOTOGRAFÍA", "FOTOGRAFIA", "%", "_"]) expect((await query(api, { search })).total).toBe(0)
    await api.createFront({ name: "Literal 100%_A", state: "archived", reference: null }, "literal")
    expect((await query(api, { state: "archived", search: "%_a" })).total).toBe(1)
    expect((await query(api, { state: "open", search: "%_a" })).total).toBe(0)
  })

  it.each(["open", "standby", "archived"] as const)("checks explícitos/idempotentes en %s sin decidir estados", async (state) => {
    const api = createMemoryApi()
    const original = (await query(api, { state })).items[0]
    const day = "2026-09-26"
    const expected = { front_id: original.front.id, day, marked: true }
    expect(await api.writeCheck(original.front.id, day, true, "first")).toEqual(expected)
    expect(await api.writeCheck(original.front.id, day, true, "second")).toEqual(expected)
    const marked = (await query(api, { state })).items.find((item) => item.front.id === original.front.id)!
    expect(marked.front.state).toBe(state)
    expect(marked.count).toBe(original.count + 1)
    expect(marked.marked_dates.filter((entry) => entry === day)).toHaveLength(1)
    await api.writeCheck(original.front.id, day, false, "third")
    await api.writeCheck(original.front.id, day, false, "fourth")
    expect((await query(api, { state })).items.find((item) => item.front.id === original.front.id)).toEqual(original)
  })

  it("el alta no marca actividad; editar nombre/referencia/estado conserva la historia y creación", async () => {
    const api = createMemoryApi()
    const created = await api.createFront({ name: "  <b>Solo texto</b>  ", reference: "  https://example.invalid/ñ  ", state: "archived" }, "create")
    expect(created).toMatchObject({ name: "<b>Solo texto</b>", reference: "https://example.invalid/%C3%B1", state: "archived" })
    const newItem = (await query(api)).items.find((item) => item.front.id === created.id)!
    expect(newItem).toMatchObject({ count: 0, marked_dates: [], last_registered_day: null })
    const original = (await query(api)).items[0]
    const patched = await api.patchFront(original.front.id, { name: "Otro nombre", reference: null, state: "standby" })
    expect(patched.created_at).toBe(original.front.created_at)
    expect(patched.updated_at).toBe(sampleClock().toISOString())
    const edited = (await query(api, { state: "standby" })).items.find((item) => item.front.id === original.front.id)!
    expect(edited.marked_dates).toEqual(original.marked_dates)
    expect(edited.last_registered_day).toBe(original.last_registered_day)
    expect(edited.front).toMatchObject({ name: "Otro nombre", state: "standby", reference: null })
  })

  it("rechaza referencias ejecutables/credenciales/URLs normalizadas largas como ApiError certain; no muta", async () => {
    const api = createMemoryApi()
    const before = await query(api)
    for (const reference of ["javascript:alert(1)", "https://user:secret@example.invalid/", "//example.invalid/", "https://example.invalid/a\nb", `https://example.invalid/${"ñ".repeat(400)}`]) {
      const data: FrontDraft = { name: "Inválido", state: "open", reference }
      await expectCertainValidation(api.createFront(data, "invalid"))
      await expectCertainValidation(api.patchFront("sample-01", data))
    }
    expect(await query(api)).toEqual(before)
    const valid = `https://example.invalid/${"ñ".repeat(300)}`
    const normalized = await api.createFront({ name: "Referencia larga", state: "open", reference: valid }, "long")
    expect(normalized.reference!.length).toBeLessThanOrEqual(2048)
    await expect(api.patchFront(normalized.id, { ...normalized, name: "Otra referencia" })).resolves.toMatchObject({ reference: normalized.reference })
  })

  it("rechaza días fuera de la muestra/consultas inválidas y checks no booleanos sin incertidumbre", async () => {
    const api = createMemoryApi()
    for (const day of ["2026-09-06", "2026-10-05", "2026-09-31", "bad"]) {
      await expectCertainValidation(query(api, { start: day }))
      await expectCertainValidation(query(api, { end: day }))
      await expectCertainValidation(api.writeCheck("sample-01", day, true, "invalid"))
    }
    for (const patch of [{ start: SIMULATED_TODAY, end: MIN_DAY }, { limit: 0 }, { limit: 101 }, { offset: -1 }, { offset: 100001 }, { state: "unknown" as FrontState }, { order: "unknown" as DashboardQuery["order"] }]) {
      await expectCertainValidation(query(api, patch))
    }
    await expectCertainValidation(api.writeCheck("missing", SIMULATED_TODAY, true, "missing"))
    await expectCertainValidation(api.writeCheck("sample-01", SIMULATED_TODAY, "yes" as unknown as boolean, "invalid"))
    await expectCertainValidation(api.createFront({ name: "", reference: null, state: "open" }, "empty"))
    const controller = new AbortController(); controller.abort()
    await expect(api.dashboard(full, controller.signal)).rejects.toMatchObject({ name: "AbortError" })
  })

  it("las respuestas no son alias de la memoria; crear otro adaptador recupera exactamente el fixture", async () => {
    const api = createMemoryApi()
    const read = await query(api)
    read.items[0].front.name = "Mutado fuera del adaptador"
    read.items[0].marked_dates.length = 0
    expect((await query(api)).items[0].front.name).toBe(freshSample()[0].name)
    await api.writeCheck("sample-01", MIN_DAY, false, "change")
    expect((await query(createMemoryApi())).items[0].marked_dates).toContain(MIN_DAY)
    expect((await query(api)).items[0].marked_dates).not.toContain(MIN_DAY)
  })
})
