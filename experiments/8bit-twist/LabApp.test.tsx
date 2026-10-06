import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { THEME_STORAGE_KEY } from "@/components/Theme"
import type { ActivityApi } from "@/lib/api"
import { LabApp } from "./LabApp"
import { createMemoryApi } from "./memoryApi"
import { MIN_DAY, SIMULATED_TODAY, freshSample } from "./sample.mjs"

const names = freshSample().map((front) => front.name)
const confirmed = "Solo en esta maqueta; no guardado en la app"
const ready = () => screen.findByRole("checkbox", { name: `Actividad en ${names[4]}` })
function client() {
  const api = createMemoryApi()
  return { ...api, dashboard: vi.fn(api.dashboard), writeCheck: vi.fn(api.writeCheck), createFront: vi.fn(api.createFront), patchFront: vi.fn(api.patchFront) }
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
function selectVisual(dialog: HTMLElement | null, label: "Tema" | "Aspecto", value: string) {
  return userEvent.selectOptions((dialog ? within(dialog) : screen).getByLabelText(label), value)
}

describe("Comparación real sobre la misma UI 8-bit", () => {
  it("identifica el laboratorio, arranca Con encanto y nunca llama fetch ni almacena datos", async () => {
    const fetcher = vi.fn(() => { throw new Error("La maqueta no permite red") })
    vi.stubGlobal("fetch", fetcher)
    const writeStorage = vi.spyOn(Storage.prototype, "setItem")
    const api = client()
    render(<LabApp apiFactory={() => api} />)
    await ready()
    expect(screen.getByText(/LABORATORIO.*DATOS FICTICIOS/)).toBeTruthy()
    expect(screen.getByText(/HOY SIMULADO.*04\/10\/2026.*Europe\/Madrid/)).toBeTruthy()
    expect((screen.getByLabelText("Aspecto") as HTMLSelectElement).value).toBe("charm")
    expect(document.documentElement.dataset.look).toBe("charm")
    expect(screen.queryByText("Espacio privado")).toBeNull()
    expect(screen.queryByRole("button", { name: /sesión|cuenta|login/i })).toBeNull()
    expect(document.querySelector('a[href]:not([href^="#"])')).toBeNull()
    await selectVisual(null, "Tema", "dark")
    await selectVisual(null, "Aspecto", "base")
    expect(document.documentElement.dataset.look).toBe("base")
    expect(writeStorage.mock.calls).toEqual([[THEME_STORAGE_KEY, "dark"]])
    expect(window.localStorage.length).toBe(1)
    expect(fetcher).not.toHaveBeenCalled()
    expect(api.createFront).not.toHaveBeenCalled()
    expect(api.patchFront).not.toHaveBeenCalled()
    expect(api.writeCheck).not.toHaveBeenCalled()
  })

  it("marca en memoria, da un aviso honesto y mantiene el mismo check al cambiar aspecto/tema", async () => {
    const api = client()
    render(<LabApp apiFactory={() => api} />)
    const check = await ready()
    const list = screen.getByRole("list", { name: "Frentes del registro diario" })
    await userEvent.click(check)
    await waitFor(() => expect(check.getAttribute("aria-checked")).toBe("true"))
    expect(screen.getByText(confirmed)).toBeTruthy()
    expect(screen.queryByText("Cambio confirmado por el servidor.")).toBeNull()
    const reads = api.dashboard.mock.calls.length
    for (const look of ["base", "charm"]) {
      await selectVisual(null, "Aspecto", look)
      await selectVisual(null, "Tema", look === "base" ? "light" : "dark")
      expect(screen.getByRole("checkbox", { name: `Actividad en ${names[4]}` })).toBe(check)
      expect(screen.getByRole("list", { name: "Frentes del registro diario" })).toBe(list)
      expect(check.getAttribute("aria-checked")).toBe("true")
    }
    expect(api.dashboard).toHaveBeenCalledTimes(reads)
    expect(api.writeCheck).toHaveBeenCalledTimes(1)
    const marked = await api.dashboard({ start: SIMULATED_TODAY, end: SIMULATED_TODAY, state: "open" })
    expect(marked.items[4].marked_dates).toEqual([SIMULATED_TODAY])
  })

  it("conserva borrador y diálogo portallado al cambiar controles visuales internos; Escape devuelve foco", async () => {
    const api = client()
    render(<LabApp apiFactory={() => api} />)
    await ready()
    const opener = screen.getByRole("button", { name: "Nuevo frente" })
    await userEvent.click(opener)
    const dialog = await screen.findByRole("dialog")
    const name = within(dialog).getByLabelText("Nombre") as HTMLInputElement
    await userEvent.type(name, "Borrador del pequeño escritorio")
    await selectVisual(dialog, "Aspecto", "base")
    await selectVisual(dialog, "Tema", "dark")
    expect(screen.getByRole("dialog")).toBe(dialog)
    expect(within(dialog).getByLabelText("Nombre")).toBe(name)
    expect(name.value).toBe("Borrador del pequeño escritorio")
    expect(document.documentElement.dataset.look).toBe("base")
    expect(document.documentElement.dataset.theme).toBe("dark")
    await selectVisual(dialog, "Aspecto", "charm")
    await selectVisual(dialog, "Tema", "system")
    expect(name.value).toBe("Borrador del pequeño escritorio")
    expect(api.createFront).not.toHaveBeenCalled()
    expect(api.patchFront).not.toHaveBeenCalled()
    expect(api.writeCheck).not.toHaveBeenCalled()
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it("las referencias son botones solo-texto en ranuras independientes, con teclado/Escape/retorno foco", async () => {
    const api = client()
    render(<LabApp apiFactory={() => api} />)
    const check = await screen.findByRole("checkbox", { name: `Actividad en ${names[0]}` })
    const trigger = screen.getByRole("button", { name: `Referencia de ${names[0]} (solo texto)` })
    expect(document.querySelectorAll(".reference-slot")).toHaveLength(5)
    expect(trigger.getAttribute("href")).toBeNull()
    expect(trigger.getAttribute("target")).toBeNull()
    check.focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(trigger)
    await userEvent.keyboard("{Enter}")
    const dialog = await screen.findByRole("dialog", { name: "Referencia de muestra" })
    expect(within(dialog).getByText("https://example.invalid/cartografia", { exact: true })).toBeTruthy()
    expect(within(dialog).queryByRole("link")).toBeNull()
    await selectVisual(dialog, "Tema", "dark")
    await selectVisual(dialog, "Aspecto", "base")
    expect(screen.getByRole("dialog")).toBe(dialog)
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(api.writeCheck).not.toHaveBeenCalled()
    expect(api.patchFront).not.toHaveBeenCalled()
    expect(api.createFront).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "Dashboard" }))
    await userEvent.click(await screen.findByRole("button", { name: `Referencia de ${names[0]} (solo texto)` }))
    expect(await screen.findByRole("dialog", { name: "Referencia de muestra" })).toBeTruthy()
    expect(document.querySelector('a[href]:not([href^="#"])')).toBeNull()
  })

  it("acota ambas vistas a la muestra y conserva período/filtros/calendario abierto al comparar", async () => {
    const api = client()
    render(<LabApp apiFactory={() => api} />)
    await ready()
    const daily = screen.getByLabelText("Fecha de registro") as HTMLInputElement
    expect(daily.min).toBe(MIN_DAY)
    expect(daily.max).toBe(SIMULATED_TODAY)
    fireEvent.change(daily, { target: { value: MIN_DAY } })
    await ready()
    expect((screen.getByRole("button", { name: "Día anterior" }) as HTMLButtonElement).disabled).toBe(true)
    const reads = api.dashboard.mock.calls.length
    fireEvent.change(daily, { target: { value: "2026-09-06" } })
    expect(screen.getByRole("alert").textContent).toContain("07/09–04/10/2026")
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(api.dashboard).toHaveBeenCalledTimes(reads)
    await userEvent.click(screen.getByRole("button", { name: "Dashboard" }))
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "all")
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-09-10" } })
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-09-14" } })
    fireEvent.change(screen.getByLabelText("Buscar por nombre"), { target: { value: "Cartografía" } })
    await screen.findByText("2 de 5 días registrados")
    const details = document.querySelector(".calendar-details") as HTMLDetailsElement
    await userEvent.click(within(details).getByText("Ver días del período"))
    // jsdom has no native summary toggle. Also set the property to characterize
    // that React preserves it on visual rerenders; real geometry is parent-owned.
    details.open = true
    const readsAfterFilter = api.dashboard.mock.calls.length
    await selectVisual(null, "Aspecto", "base")
    await selectVisual(null, "Tema", "dark")
    expect(document.querySelector(".calendar-details")).toBe(details)
    expect(details.open).toBe(true)
    expect(within(details).getAllByRole("img")).toHaveLength(5)
    expect((screen.getByLabelText("Desde") as HTMLInputElement).value).toBe("2026-09-10")
    expect((screen.getByLabelText("Buscar por nombre") as HTMLInputElement).value).toBe("Cartografía")
    expect((screen.getByLabelText("Estado") as HTMLSelectElement).value).toBe("all")
    expect(api.dashboard).toHaveBeenCalledTimes(readsAfterFilter)
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-09-06" } })
    expect(screen.getByRole("alert").textContent).toContain("07/09–04/10/2026")
    expect(api.dashboard).toHaveBeenCalledTimes(readsAfterFilter)
    expect(api.writeCheck).not.toHaveBeenCalled()
  })

  it("bloquea Reiniciar durante la escritura; cambiar look no remonta ni marca optimísticamente", async () => {
    const api = client()
    const write = deferred()
    const originalWrite = api.writeCheck.getMockImplementation()!
    api.writeCheck.mockImplementation(async (...args) => { await write.promise; return originalWrite(...args) })
    render(<LabApp apiFactory={() => api} />)
    const check = await ready()
    await userEvent.click(check)
    const reset = screen.getByRole("button", { name: "Reiniciar muestra" }) as HTMLButtonElement
    expect(reset.disabled).toBe(true)
    expect(check.getAttribute("aria-checked")).toBe("false")
    expect(check.getAttribute("aria-disabled")).toBe("true")
    expect(screen.queryByText(/confirmación del servidor/)).toBeNull()
    await selectVisual(null, "Aspecto", "base")
    await selectVisual(null, "Tema", "dark")
    expect(screen.getByRole("checkbox", { name: `Actividad en ${names[4]}` })).toBe(check)
    expect(reset.disabled).toBe(true)
    await userEvent.click(reset)
    expect(check.isConnected).toBe(true)
    await act(async () => { write.resolve(); await write.promise })
    await waitFor(() => expect(check.getAttribute("aria-checked")).toBe("true"))
    expect(reset.disabled).toBe(false)
    expect(screen.getByText(confirmed)).toBeTruthy()
    expect(api.writeCheck).toHaveBeenCalledTimes(1)
  })

  it("mantiene el editor congelado al guardar y los controles visuales no cierran la escritura", async () => {
    const api = client(); const write = deferred()
    const create = api.createFront.getMockImplementation()!
    api.createFront.mockImplementation(async (...args) => { await write.promise; return create(...args) })
    render(<LabApp apiFactory={() => api} />)
    await ready()
    await userEvent.click(screen.getByRole("button", { name: "Nuevo frente" }))
    const dialog = await screen.findByRole("dialog")
    const name = within(dialog).getByLabelText("Nombre") as HTMLInputElement
    await userEvent.type(name, "Alta explícita de muestra")
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear frente" }))
    expect(name.disabled).toBe(true)
    await userEvent.keyboard("{Escape}")
    await selectVisual(dialog, "Aspecto", "base")
    await selectVisual(dialog, "Tema", "dark")
    expect(screen.getByRole("dialog")).toBe(dialog)
    expect(name.value).toBe("Alta explícita de muestra")
    expect(name.disabled).toBe(true)
    expect(api.createFront).toHaveBeenCalledTimes(1)
    await act(async () => { write.resolve(); await write.promise })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    const check = await screen.findByRole("checkbox", { name: "Actividad en Alta explícita de muestra" })
    expect(check.getAttribute("aria-checked")).toBe("false")
    expect(api.writeCheck).not.toHaveBeenCalled()
  })

  it("valida referencias antes de guardar y renderiza nombre/URL literalmente, sin HTML ni navegación", async () => {
    const api = client()
    const name = '<img src=x onerror="alert(1)">'
    await api.createFront({ name, reference: "https://example.invalid/?text=%3Cscript%3E", state: "open" }, "text")
    api.createFront.mockClear()
    render(<LabApp apiFactory={() => api} />)
    expect(await screen.findByRole("heading", { name })).toBeTruthy()
    expect(document.querySelector(".front-title img")).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: `Referencia de ${name} (solo texto)` }))
    const reference = await screen.findByRole("dialog")
    expect(within(reference).getByText(name, { exact: true })).toBeTruthy()
    expect(within(reference).getByText("https://example.invalid/?text=%3Cscript%3E", { exact: true })).toBeTruthy()
    expect(reference.querySelector("script, img, a[href]")).toBeNull()
    await userEvent.keyboard("{Escape}")
    await userEvent.click(screen.getByRole("button", { name: "Nuevo frente" }))
    const dialog = screen.getByRole("dialog")
    await userEvent.type(within(dialog).getByLabelText("Nombre"), "Validación ficticia")
    fireEvent.change(within(dialog).getByLabelText("Enlace (opcional)"), { target: { value: "https://user:secret@example.invalid/" } })
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear frente" }))
    expect(within(dialog).getByRole("alert").textContent).toContain("sin usuario ni contraseña")
    expect(api.createFront).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText("Enlace (opcional)"), { target: { value: `https://example.invalid/${"ñ".repeat(400)}` } })
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear frente" }))
    expect(within(dialog).getByRole("alert").textContent).toContain("normalizada")
    expect(api.createFront).not.toHaveBeenCalled()
  })

  it("solo Reiniciar muestra explícito sustituye el árbol y recupera los datos; no cambia tema/aspecto", async () => {
    let latest: ActivityApi | undefined
    const factory = vi.fn(() => { latest = createMemoryApi(); return latest })
    render(<LabApp apiFactory={factory} />)
    const check = await ready()
    await userEvent.click(check)
    await waitFor(() => expect(check.getAttribute("aria-checked")).toBe("true"))
    await selectVisual(null, "Tema", "dark")
    await selectVisual(null, "Aspecto", "base")
    const oldApi = latest
    await userEvent.click(screen.getByRole("button", { name: "Reiniciar muestra" }))
    const resetCheck = await ready()
    expect(resetCheck).not.toBe(check)
    expect(resetCheck.getAttribute("aria-checked")).toBe("false")
    expect(check.isConnected).toBe(false)
    expect(latest).not.toBe(oldApi)
    expect(factory).toHaveBeenCalledTimes(2)
    expect(document.documentElement.dataset.look).toBe("base")
    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(window.localStorage.length).toBe(1)
  })
})
