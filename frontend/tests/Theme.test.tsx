import { StrictMode } from "react"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeProvider, ThemeSelect, ThemeToggle, THEME_STORAGE_KEY } from "../src/components/Theme"
import App from "../src/App"
import { ApiError, type ActivityApi, type Front } from "../src/lib/api"
import { deferred, front, page } from "./fixtures"

let systemDark = false
const listeners = new Set<(event: MediaQueryListEvent) => void>()
const emitSystem = (dark: boolean) => act(() => {
  systemDark = dark
  for (const listener of listeners) listener({ matches: dark } as MediaQueryListEvent)
})
const fixture = () => <StrictMode><ThemeProvider><ThemeSelect /><ThemeSelect /></ThemeProvider></StrictMode>
const current = () => document.documentElement.dataset.theme
const select = () => screen.getAllByRole("combobox", { name: "Tema" })[0]

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear()
  systemDark = false; listeners.clear()
  delete document.documentElement.dataset.theme
  document.documentElement.classList.remove("dark")
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    get matches() { return systemDark },
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  })))
  const meta = document.createElement("meta"); meta.name = "theme-color"; document.head.append(meta)
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear(); sessionStorage.clear()
  delete document.documentElement.dataset.theme
  document.documentElement.classList.remove("dark")
  document.querySelector('meta[name="theme-color"]')?.remove()
})

describe("Preferencia visual independiente de las cuentas y escrituras", () => {
  it.each([false, true])("alterna con un clic desde el tema real del sistema (oscuro=%s) y recuerda la elección", async (dark) => {
    systemDark = dark
    const view = render(<ThemeProvider><ThemeToggle /></ThemeProvider>)
    await userEvent.click(screen.getByRole("button", { name: dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro" }))
    expect(current()).toBe(dark ? "light" : "dark")
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(dark ? "light" : "dark")
    view.unmount()
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>)
    expect(current()).toBe(dark ? "light" : "dark")
    const toggle = screen.getByRole("button", { name: dark ? "Cambiar a tema oscuro" : "Cambiar a tema claro" })
    toggle.focus()
    await userEvent.keyboard(" ")
    expect(current()).toBe(dark ? "dark" : "light")
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(dark ? "dark" : "light")
  })
  it.each([false, true])("sigue el sistema inicialmente (oscuro=%s), sin persistir datos al montar", (dark) => {
    systemDark = dark
    render(fixture())
    expect((select() as HTMLSelectElement).value).toBe("system")
    expect(current()).toBe(dark ? "dark" : "light")
    expect(document.documentElement.classList.contains("dark")).toBe(dark)
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(dark ? "#252624" : "#F2ECE2")
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(listeners.size).toBe(1)
  })
  it.each(["light", "dark", "system"])("respeta la elección persistida %s", (preference) => {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
    systemDark = true
    render(fixture())
    expect((select() as HTMLSelectElement).value).toBe(preference)
    expect(current()).toBe(preference === "light" ? "light" : "dark")
  })
  it("guarda solo una elección válida, sincroniza selectores y la restaura al volver", async () => {
    localStorage.setItem("unrelated", "keep")
    const reads = vi.spyOn(Storage.prototype, "getItem")
    const writes = vi.spyOn(Storage.prototype, "setItem")
    const first = render(fixture())
    await userEvent.selectOptions(select(), "dark")
    expect(current()).toBe("dark")
    expect(screen.getAllByRole("combobox", { name: "Tema" }).every((node) => (node as HTMLSelectElement).value === "dark")).toBe(true)
    expect(writes.mock.calls).toEqual([[THEME_STORAGE_KEY, "dark"]])
    expect(reads.mock.calls.every(([key]) => key === THEME_STORAGE_KEY)).toBe(true)
    first.unmount()
    expect(listeners.size).toBe(0)
    render(fixture())
    expect((select() as HTMLSelectElement).value).toBe("dark")
    expect(localStorage.getItem("unrelated")).toBe("keep")
    expect(localStorage.length).toBe(2)
    expect(sessionStorage.length).toBe(0)
  })
  it("los cambios del sistema afectan solo a Sistema y limpia la suscripción", async () => {
    const { unmount } = render(fixture())
    emitSystem(true)
    expect(current()).toBe("dark")
    await userEvent.selectOptions(select(), "light")
    emitSystem(false); emitSystem(true)
    expect(current()).toBe("light")
    await userEvent.selectOptions(select(), "system")
    expect(current()).toBe("dark")
    emitSystem(false)
    expect(current()).toBe("light")
    unmount()
    expect(listeners.size).toBe(0)
  })
  it("un valor desconocido no se aplica como tema ni se reescribe automáticamente", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "untrusted-value")
    render(fixture())
    expect(current()).toBe("light")
    expect((select() as HTMLSelectElement).value).toBe("system")
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("untrusted-value")
  })
  it("actualiza la preferencia desde otra pestaña e ignora otras claves", async () => {
    render(fixture())
    await userEvent.selectOptions(select(), "light")
    fireEvent(window, new StorageEvent("storage", { key: "unrelated", newValue: "dark", storageArea: localStorage }))
    expect(current()).toBe("light")
    fireEvent(window, new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark", storageArea: localStorage }))
    expect(current()).toBe("dark")
    fireEvent(window, new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: null, storageArea: localStorage }))
    expect((select() as HTMLSelectElement).value).toBe("system")
    expect(current()).toBe("light")
  })
  it.each(["get", "set"])("sigue funcionando si el almacenamiento bloquea %s", async (operation) => {
    if (operation === "get") vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError") })
    else vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError") })
    render(fixture())
    expect(current()).toBe("light")
    await userEvent.selectOptions(select(), "dark")
    expect(current()).toBe("dark")
    expect((select() as HTMLSelectElement).value).toBe("dark")
  })
  it("tolera un entorno sin matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined)
    render(fixture())
    expect(current()).toBe("light")
  })
  it("el editor no ofrece cambiar tema y conserva borrador e intención si cambia desde otra pestaña", async () => {
    const write = deferred<Front>()
    const api: ActivityApi = {
      dashboard: vi.fn(async (q) => page(q.start, q.end)),
      createFront: vi.fn().mockReturnValueOnce(write.promise).mockResolvedValueOnce({ ...front, name: "Borrador conservado", reference: null }),
      patchFront: vi.fn(), writeCheck: vi.fn(),
    }
    render(<ThemeProvider><ThemeToggle /><App api={api} clock={() => new Date("2026-10-03T12:00:00Z")} /></ThemeProvider>)
    await screen.findByText("Guitarra")
    await userEvent.click(screen.getByRole("button", { name: "Nuevo frente" }))
    const dialog = await screen.findByRole("dialog")
    const name = within(dialog).getByLabelText("Nombre") as HTMLInputElement
    await userEvent.type(name, "Borrador conservado")
    expect(within(dialog).queryByRole("button", { name: /Cambiar a tema/ })).toBeNull()
    const changeInAnotherTab = (value: "light" | "dark") => {
      localStorage.setItem(THEME_STORAGE_KEY, value)
      fireEvent(window, new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: value, storageArea: localStorage }))
    }
    changeInAnotherTab("dark")
    expect(screen.getByRole("dialog")).toBe(dialog)
    expect(name.value).toBe("Borrador conservado")
    expect(api.dashboard).toHaveBeenCalledTimes(1)
    expect(api.createFront).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole("button", { name: "Crear frente" }))
    changeInAnotherTab("light")
    expect(name.disabled).toBe(true)
    expect(name.value).toBe("Borrador conservado")
    await act(async () => { write.reject(new ApiError("network", "Respuesta perdida", true)) })
    changeInAnotherTab("dark")
    expect(within(dialog).getByText("Solicitud sin confirmar")).toBeTruthy()
    expect(api.createFront).toHaveBeenCalledTimes(1)
    await userEvent.click(within(dialog).getByRole("button", { name: "Reintentar solicitud" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    const calls = vi.mocked(api.createFront).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
    expect(calls[0][0]).toEqual({ name: "Borrador conservado", reference: null, state: "open" })
    expect(current()).toBe("dark")
    expect(api.writeCheck).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(1)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")
  })
})
