import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import App from "../src/App"
import AuthenticatedApp from "../src/AuthenticatedApp"
import { LanguageProvider, LanguageSelect } from "../src/components/Language"
import { ThemeProvider } from "../src/components/Theme"
import { LANGUAGE_STORAGE_KEY } from "../src/lib/i18n"
import { formatDay, todayInMadrid } from "../src/lib/dates"
import { ApiError, type ActivityApi } from "../src/lib/api"
import { AuthError, type AuthClient } from "../src/lib/auth"
import { deferred, front, page } from "./fixtures"

const clock = () => new Date("2026-10-03T12:00:00Z")
const account = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const code = "ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789"
const proof = { authenticated: true as const, account_id: account, csrf_token: "A".repeat(43), expires_at: "2030-11-02T12:00:00Z" }
function api(): ActivityApi {
  return {
    dashboard: vi.fn(async query => ({ ...page(query.start, query.end), offset: query.offset ?? 0 })),
    createFront: vi.fn(async data => ({ ...front, ...data })), patchFront: vi.fn(async () => front),
    writeCheck: vi.fn(async (id, day, marked) => ({ front_id: id, day, marked })),
  }
}
function auth(client = api()): AuthClient {
  return { session: vi.fn(async () => null), signup: vi.fn(async () => ({ account_id: account, code })),
    login: vi.fn(async () => proof), logout: vi.fn(async () => {}), createApi: () => client }
}
function privateView(client: AuthClient) {
  const factory = vi.fn(() => client)
  const view = render(<LanguageProvider><ThemeProvider><AuthenticatedApp authFactory={factory} clock={clock} /></ThemeProvider></LanguageProvider>)
  return { ...view, factory }
}
function activityView(client = api()) {
  render(<LanguageProvider><LanguageSelect /><App api={client} clock={clock} /></LanguageProvider>)
  return client
}
const spanish = () => screen.getByRole("combobox", { name: "Idioma" })
const english = () => screen.getByRole("combobox", { name: "Language" })
function fromOtherTab(value: string | null, area: Storage = localStorage, key: string | null = LANGUAGE_STORAGE_KEY) {
  if (area === localStorage && key === LANGUAGE_STORAGE_KEY) {
    if (value === null) localStorage.removeItem(LANGUAGE_STORAGE_KEY)
    else localStorage.setItem(LANGUAGE_STORAGE_KEY, value)
  }
  act(() => window.dispatchEvent(new StorageEvent("storage", { key, newValue: value, storageArea: area })))
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear()
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["es-ES"])
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => {
  localStorage.clear(); sessionStorage.clear()
  document.documentElement.lang = "es"
  document.title = "Activity Hub · Tu registro de actividad"
})

describe("Preferencia de idioma", () => {
  it.each([["en-US", "en"], ["es-MX", "es"], ["de-DE", "es"]])("detecta %s y declara %s sin guardar una preferencia implícita", (browser, language) => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue([browser])
    render(<LanguageProvider><LanguageSelect /></LanguageProvider>)
    expect(document.documentElement.lang).toBe(language)
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(language)
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull()
  })
  it("prefiere la elección guardada y la conserva al volver a abrir", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB"])
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "es")
    const first = render(<LanguageProvider><LanguageSelect /></LanguageProvider>)
    await userEvent.selectOptions(spanish(), "en")
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en")
    expect(document.title).toBe("Activity Hub · Your activity log")
    first.unmount()
    render(<LanguageProvider><LanguageSelect /></LanguageProvider>)
    expect((english() as HTMLSelectElement).value).toBe("en")
  })
  it("rechaza preferencias desconocidas y elige el primer idioma soportado", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr")
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE", "en-AU", "es-ES"])
    render(<LanguageProvider><LanguageSelect /></LanguageProvider>)
    expect(document.documentElement.lang).toBe("en")
  })
  it("funciona si leer o guardar localStorage está bloqueado", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
    render(<LanguageProvider><LanguageSelect /></LanguageProvider>)
    await userEvent.selectOptions(spanish(), "en")
    expect(document.documentElement.lang).toBe("en")
    expect(document.title).toBe("Activity Hub · Your activity log")
  })
  it("sincroniza pestañas, ignora otras preferencias y vuelve al navegador al borrarla", () => {
    render(<LanguageProvider><LanguageSelect /></LanguageProvider>)
    fromOtherTab("en", sessionStorage)
    fromOtherTab("dark", localStorage, "activity-hub.theme")
    expect(document.documentElement.lang).toBe("es")
    fromOtherTab("en")
    expect(document.documentElement.lang).toBe("en")
    fromOtherTab(null)
    expect(document.documentElement.lang).toBe("es")
  })
})

describe("Interfaz bilingüe sin reiniciar la aplicación", () => {
  it("entra directamente en inglés según el navegador, con acceso y tema traducidos", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"])
    const client = auth(); privateView(client)
    await screen.findByLabelText("Access code")
    expect(screen.getByRole("heading", { name: "Your activity log" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeTruthy()
    expect(client.session).toHaveBeenCalledTimes(1)
  })
  it("conserva el mismo campo autocompletado, el foco y el cliente al cambiar de idioma", async () => {
    const client = auth(); const view = privateView(client)
    const field = await screen.findByLabelText("Código de acceso") as HTMLInputElement
    field.value = code // Native autofill can update the DOM without React events.
    field.focus()
    fromOtherTab("en")
    expect(screen.getByLabelText("Access code")).toBe(field)
    expect(field.value).toBe(code)
    expect(document.activeElement).toBe(field)
    expect(client.session).toHaveBeenCalledTimes(1)
    expect(view.factory).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))
    await screen.findByRole("heading", { name: "Daily log" })
    expect(client.login).toHaveBeenCalledExactlyOnceWith(code)
    expect(screen.getByRole("navigation", { name: "Private session" }).textContent).toContain("Account aaaaaaaa")
  })
  it("traduce un error ya mostrado y conserva el límite de intentos", async () => {
    const client = auth()
    vi.mocked(client.login).mockRejectedValue(new AuthError("rate-limit", "Demasiados intentos. Espera 60 segundos antes de volver a entrar.", 60))
    privateView(client)
    await userEvent.type(await screen.findByLabelText("Código de acceso"), code)
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }))
    await screen.findByText(/Demasiados intentos/)
    await userEvent.selectOptions(spanish(), "en")
    expect(screen.getByRole("alert").textContent).toContain("Wait 60 seconds before signing in again")
    expect(screen.getByRole("button", { name: "Sign in" }).hasAttribute("disabled")).toBe(true)
    expect(client.login).toHaveBeenCalledTimes(1)
    expect(client.session).toHaveBeenCalledTimes(1)
    await userEvent.selectOptions(english(), "es")
    expect(screen.getByRole("alert").textContent).toContain("Demasiados intentos")
  })
  it("mantiene el código de alta y el ACK al cambiar y no crea otra cuenta", async () => {
    const client = auth(); privateView(client)
    await userEvent.click(await screen.findByRole("button", { name: "Crear cuenta" }))
    const field = await screen.findByLabelText("Tu código permanente") as HTMLInputElement
    await userEvent.click(screen.getByLabelText("He guardado mi código"))
    await userEvent.selectOptions(spanish(), "en")
    expect(screen.getByLabelText("Your permanent code")).toBe(field)
    expect(field.value).toBe(code)
    expect(field.type).toBe("password")
    expect(field.getAttribute("autocomplete")).toBe("new-password")
    expect(screen.getByLabelText("I have saved my code").getAttribute("aria-checked")).toBe("true")
    expect(screen.getByText("There is no recovery.")).toBeTruthy()
    expect(client.signup).toHaveBeenCalledTimes(1)
    expect(client.login).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "Sign in to my account" }))
    await screen.findByRole("heading", { name: "Daily log" })
    expect(client.login).toHaveBeenCalledExactlyOnceWith(code)
  })
  it("traduce el dashboard y sus fechas, sin modificar nombres, filtros o consultas", async () => {
    const client = activityView()
    await screen.findByText("Guitarra")
    await userEvent.click(screen.getByRole("button", { name: "Dashboard" }))
    await screen.findByText("Ver días del período")
    const reads = vi.mocked(client.dashboard).mock.calls.length
    await userEvent.selectOptions(spanish(), "en")
    expect(screen.getByText("View days in this period")).toBeTruthy()
    expect(screen.getByText("Last recorded activity overall")).toBeTruthy()
    expect(screen.getByText("Guitarra")).toBeTruthy()
    expect(screen.getByText(/3 October 2026/)).toBeTruthy()
    expect(client.dashboard).toHaveBeenCalledTimes(reads)
    expect(client.writeCheck).not.toHaveBeenCalled()
    expect(client.createFront).not.toHaveBeenCalled()
  })
  it("conserva nombre, enlace, estado, fecha y foco de un borrador al sincronizar otra pestaña", async () => {
    const client = activityView()
    await screen.findByText("Guitarra")
    await userEvent.click(screen.getByRole("button", { name: "Nuevo frente" }))
    const field = screen.getByLabelText("Nombre") as HTMLInputElement
    await userEvent.type(field, "Evaluación Matemáticas")
    await userEvent.type(screen.getByLabelText("Enlace (opcional)"), "https://example.test/evaluación")
    await userEvent.selectOptions(screen.getByLabelText("Estado del frente"), "standby")
    field.focus()
    const reads = vi.mocked(client.dashboard).mock.calls.length
    fromOtherTab("en")
    expect(screen.getByLabelText("Name")).toBe(field)
    expect(field.value).toBe("Evaluación Matemáticas")
    expect(document.activeElement).toBe(field)
    expect((screen.getByLabelText("Link (optional)") as HTMLInputElement).value).toBe("https://example.test/evaluación")
    expect((screen.getByLabelText("Focus area status") as HTMLSelectElement).value).toBe("standby")
    expect((screen.getByLabelText("Log date") as HTMLInputElement).value).toBe("2026-10-03")
    expect(client.dashboard).toHaveBeenCalledTimes(reads)
    await userEvent.click(screen.getByRole("button", { name: "Create focus area" }))
    await waitFor(() => expect(client.createFront).toHaveBeenCalledWith({ name: "Evaluación Matemáticas", reference: "https://example.test/evaluación", state: "standby" }, expect.any(String)))
  })
  it("conserva el tick inmediato y la identidad de una escritura retenida", async () => {
    const client = api(); const response = deferred<{ front_id: string; day: string; marked: boolean }>()
    vi.mocked(client.writeCheck).mockReturnValue(response.promise)
    activityView(client)
    const field = await screen.findByRole("checkbox", { name: "Actividad en Guitarra" })
    await userEvent.click(field)
    expect(field.getAttribute("aria-checked")).toBe("true")
    const original = vi.mocked(client.writeCheck).mock.calls[0]
    const reads = vi.mocked(client.dashboard).mock.calls.length
    await userEvent.selectOptions(spanish(), "en")
    expect(screen.getByRole("checkbox", { name: "Activity in Guitarra" })).toBe(field)
    expect(field.getAttribute("aria-checked")).toBe("true")
    expect(client.writeCheck).toHaveBeenCalledTimes(1)
    expect(client.dashboard).toHaveBeenCalledTimes(reads)
    await act(async () => response.resolve({ front_id: front.id, day: "2026-10-03", marked: true }))
    expect(vi.mocked(client.writeCheck).mock.calls[0]).toEqual(original)
  })
  it("traduce errores de escritura y reintenta la misma solicitud, sin reenviarla al cambiar", async () => {
    const client = api()
    vi.mocked(client.writeCheck).mockRejectedValueOnce(new ApiError("network", "No se ha podido conectar con el servidor. No podemos confirmar el resultado.", true))
    activityView(client)
    await userEvent.click(await screen.findByRole("checkbox", { name: "Actividad en Guitarra" }))
    await screen.findByRole("button", { name: "Reintentar solicitud" })
    const original = vi.mocked(client.writeCheck).mock.calls[0]
    await userEvent.selectOptions(spanish(), "en")
    expect(screen.getByRole("alert").textContent).toContain("Could not connect to the server")
    expect(client.writeCheck).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole("button", { name: "Retry request" }))
    await waitFor(() => expect(client.writeCheck).toHaveBeenCalledTimes(2))
    expect(vi.mocked(client.writeCheck).mock.calls[1]).toEqual(original)
  })
  it("traduce Papelera y la confirmación sin borrar por el cambio de idioma", async () => {
    const client = api()
    client.trashFront = vi.fn(async () => front); client.restoreFront = vi.fn(async () => front)
    client.deleteFront = vi.fn(async id => ({ front_id: id, deleted: true as const }))
    vi.mocked(client.dashboard).mockImplementation(async query => ({ ...page(query.start, query.end), items: query.trashed ? [{ ...page(query.start, query.end).items[0], front: { ...front, trashed_at: "2026-10-03T12:00:00Z" } }] : [], total: query.trashed ? 1 : 0 }))
    activityView(client)
    await userEvent.click(screen.getByRole("button", { name: "Papelera" }))
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar para siempre Guitarra" }))
    const cancel = screen.getByRole("button", { name: "Cancelar" })
    fromOtherTab("en")
    const dialog = screen.getByRole("alertdialog", { name: "Delete permanently" })
    expect(dialog.textContent).toContain("Guitarra")
    expect(dialog.textContent).toContain("You cannot recover it")
    expect(document.activeElement).toBe(cancel)
    expect(client.deleteFront).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(screen.getByRole("button", { name: "Permanently delete Guitarra" })).toBeTruthy()
  })
  it("formatea fechas en inglés conservando su día y la referencia Madrid", () => {
    expect(formatDay("2026-10-25", false, "en-GB")).toBe("25 October 2026")
    expect(formatDay("0001-01-01", false, "en-GB")).toBe("1 January 1")
    expect(formatDay("2026-10-25", true, "en-GB")).toBe("25 Oct")
    expect(todayInMadrid(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25")
  })
})
