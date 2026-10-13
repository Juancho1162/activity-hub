import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import App from "../src/App"
import { useActivity, type Intent } from "../src/hooks/useActivity"
import { ApiError, type ActivityApi, type DashboardPage, type DashboardQuery, type Front, type Group } from "../src/lib/api"
import { front } from "./fixtures"


  it("conserva el borrador de grupo al ocultar la sesión y restaura sus campos al volver", async () => {
    const { client } = fixture()
    const app = render(<App api={client} clock={clock} presentation="garden" />)
    await screen.findByRole("heading", { name: "Frente 3" })
    await userEvent.click(screen.getByRole("button", { name: "Tus grupos" }))
    await userEvent.click(screen.getByRole("button", { name: "Nuevo grupo" }))
    fireEvent.change(screen.getByLabelText("Nombre del grupo"), { target: { value: "Mi borrador" } })
    await userEvent.click(screen.getByRole("button", { name: "Música" }))
    app.rerender(<App api={client} clock={clock} presentation="garden" enabled={false} />)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.queryByDisplayValue("Mi borrador")).toBeNull()
    app.rerender(<App api={client} clock={clock} presentation="garden" enabled />)
    await screen.findByDisplayValue("Mi borrador")
    expect(screen.getByRole("button", { name: "Música" }).getAttribute("aria-pressed")).toBe("true")
    expect(client.createGroup).not.toHaveBeenCalled()
  })
  it("cambiar de grupo sale del enfoque para mostrar los frentes del destino", async () => {
    const { client } = fixture()
    render(<App api={client} clock={clock} presentation="garden" />)
    await screen.findByRole("heading", { name: "Frente 3" })
    await userEvent.click(screen.getByRole("button", { name: "Enfocar Frente 1" }))
    fireEvent.change(screen.getByLabelText("Grupo"), { target: { value: groupB.id } })
    await screen.findByRole("heading", { name: "Frente 2" })
    expect(screen.queryByRole("button", { name: "Salir del enfoque" })).toBeNull()
  })


  it("congela también la identidad de una asignación de grupo incierta", async () => {
    const client = fixture().client
    vi.mocked(client.patchFront).mockRejectedValueOnce(new ApiError("network", "Respuesta perdida", true))
    const { result } = renderHook(() => useActivity(client, { start: day, end: day }))
    await waitFor(() => expect(result.current.canWrite).toBe(true))
    const data = { name: "Frente", reference: null, state: "open" as const, group_id: groupA.id }
    await act(async () => { expect(await result.current.perform({ kind: "edit", id: front.id, data })).toBe(false) })
    data.group_id = groupB.id
    await act(async () => { expect(await result.current.retry()).toBe(true) })
    expect(vi.mocked(client.patchFront).mock.calls[0]).toEqual([front.id, expect.objectContaining({ group_id: groupA.id }), expect.any(String)])
    expect(vi.mocked(client.patchFront).mock.calls[1]).toEqual(vi.mocked(client.patchFront).mock.calls[0])
  })

const clock = () => new Date("2026-10-03T12:00:00Z")
const day = "2026-10-03", key = "00000000-0000-4000-8000-000000000099"
const groupA: Group = { id: "00000000-0000-4000-8000-000000000011", name: "Casa", icon: "book" }
const groupB: Group = { id: "00000000-0000-4000-8000-000000000012", name: "Estudio", icon: "book" }
function fixture(count = 3) {
  const fronts: Front[] = Array.from({ length: count }, (_, i) => ({ ...front, id: "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"), name: "Frente " + (i + 1), group_id: i < count - 2 ? groupA.id : i === count - 2 ? groupB.id : null }))
  const groups = [groupA, groupB]
  const marks = new Set<string>()
  const project = (q: DashboardQuery): DashboardPage => {
    const selected = fronts.filter(f => (q.group_id === undefined || (f.group_id ?? null) === q.group_id) && (!q.search?.trim() || f.name.includes(q.search.trim())))
    return { items: selected.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 20)).map(front => ({ front, marked_dates: marks.has(front.id) ? [day] : [], count: marks.has(front.id) ? 1 : 0, last_registered_day: marks.has(front.id) ? day : null })), groups: [...groups], total: selected.length, limit: q.limit ?? 20, offset: q.offset ?? 0, start: q.start, end: q.end }
  }
  const client: ActivityApi = { supportsGroups: true, supportsFrontIcons: true, dashboard: vi.fn(async q => project(q)),
    createFront: vi.fn(async () => fronts[0]), patchFront: vi.fn(async (id, draft) => { const f = fronts.find(f => f.id === id)!; Object.assign(f, draft); return f }),
    writeCheck: vi.fn(async (id, date, marked) => { if (marked) marks.add(id); else marks.delete(id); return { front_id: id, day: date, marked } }),
    createGroup: vi.fn(async draft => { const group = { ...draft, id: crypto.randomUUID() }; groups.push(group); return group }),
    patchGroup: vi.fn(async (id, draft) => { const group = groups.find(g => g.id === id)!; Object.assign(group, draft); return group }),
    recordGroup: vi.fn(async (groupId, date) => { const added = fronts.filter(f => f.group_id === groupId && f.state === "open" && !marks.has(f.id)); added.forEach(f => marks.add(f.id)); return { day: date, changed_ids: added.map(f => f.id) } }),
    undoGroup: vi.fn(async () => { const changed_ids = [...marks]; marks.clear(); return { day, changed_ids } }),
    confirmedDashboard: vi.fn((_id, q) => project(q)) }
  return { client, fronts, groups, marks }
}

describe("Jardín integrado con grupos propios", () => {
  it("muestra el grupo completo y separa iconos repetidos; lote y Deshacer comparten el hook", async () => {
    const { client } = fixture(23)
    render(<App api={client} clock={clock} presentation="garden" />)
    await screen.findByRole("heading", { name: "Frente 23" })
    expect(screen.getAllByRole("checkbox")).toHaveLength(23)
    expect(client.dashboard).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 200, offset: 0 }), expect.anything())
    expect(screen.getAllByRole("heading", { name: /^(Casa|Estudio|Sin grupo)$/ })).toHaveLength(3)
    await userEvent.click(screen.getByRole("button", { name: "Registrar grupo Casa" }))
    expect(client.recordGroup).toHaveBeenCalledExactlyOnceWith(groupA.id, day, expect.any(String))
    await screen.findByRole("button", { name: "Deshacer" })
    expect(screen.getAllByRole("checkbox").filter(e => e.getAttribute("aria-checked") === "true")).toHaveLength(21)
    await userEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    expect(client.undoGroup).toHaveBeenCalledExactlyOnceWith(vi.mocked(client.recordGroup!).mock.calls[0][2], expect.any(String))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull())
    expect(screen.getAllByRole("checkbox").every(e => e.getAttribute("aria-checked") === "false")).toBe(true)
  })
  it("normaliza la búsqueda y exige un grupo completo para registrar en bloque", async () => {
    const { client } = fixture()
    render(<App api={client} clock={clock} presentation="garden" />)
    await screen.findByRole("heading", { name: "Frente 3" })
    await userEvent.click(screen.getByRole("button", { name: "Buscar y filtrar" }))
    fireEvent.change(screen.getByLabelText("Buscar por nombre"), { target: { value: "   " } })
    await waitFor(() => expect(screen.getByRole("button", { name: "Registrar grupo Casa" }).hasAttribute("disabled")).toBe(false))
    fireEvent.change(screen.getByLabelText("Buscar por nombre"), { target: { value: "Frente 1" } })
    await screen.findByText("Borra la búsqueda para registrar un grupo completo.")
    await waitFor(() => expect(screen.getByRole("button", { name: "Registrar grupo Casa" }).hasAttribute("disabled")).toBe(true))
    expect(client.recordGroup).not.toHaveBeenCalled()
  })
  it("crea un grupo custom y editar un frente puede desagruparlo sin perder su icono", async () => {
    const { client } = fixture()
    render(<App api={client} clock={clock} presentation="garden" />)
    await screen.findByRole("heading", { name: "Frente 3" })
    await userEvent.click(screen.getByRole("button", { name: "Tus grupos" }))
    await userEvent.click(screen.getByRole("button", { name: "Nuevo grupo" }))
    expect(screen.queryByRole("button", { name: "Café" })).toBeNull()
    await userEvent.type(screen.getByLabelText("Nombre del grupo"), "Biblioteca")
    await userEvent.click(screen.getByRole("button", { name: "Lectura" }))
    await userEvent.click(screen.getByRole("button", { name: "Guardar grupo" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(client.createGroup).toHaveBeenCalledExactlyOnceWith({ name: "Biblioteca", icon: "book" }, expect.any(String))
    await userEvent.click(screen.getByRole("button", { name: "Editar Frente 1" }))
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Grupo"), { target: { value: "" } })
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(client.patchFront).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ group_id: null }), expect.any(String))
    expect(vi.mocked(client.patchFront).mock.calls[0][1]).not.toHaveProperty("icon")
  })
  it("la matriz separa grupos con el mismo icono y consultar un día no escribe", async () => {
    const { client } = fixture()
    render(<App api={client} clock={clock} presentation="garden" />)
    await screen.findByRole("heading", { name: "Frente 3" })
    await userEvent.click(screen.getByRole("button", { name: "Dashboard" }))
    await screen.findByRole("region", { name: "Matriz de actividad" })
    expect(client.dashboard).toHaveBeenLastCalledWith(expect.objectContaining({ state: "all", limit: 200 }), expect.anything())
    const casa = screen.getByRole("button", { name: "Ver frentes de Casa" }), estudio = screen.getByRole("button", { name: "Ver frentes de Estudio" })
    await userEvent.click(casa)
    expect(casa.getAttribute("aria-expanded")).toBe("true")
    expect(estudio.getAttribute("aria-expanded")).toBe("false")
    await userEvent.click(screen.getAllByRole("button", { name: /^Casa ·/ }).at(-1)!)
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("Frente 1")).toBeTruthy()
    expect(client.writeCheck).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole("button", { name: "Abrir registro del día" }))
    await screen.findByRole("heading", { name: "Hoy, grupo a grupo." })
    await waitFor(() => expect(screen.getByLabelText("Grupo").getAttribute("id")).toBe("group-filter"))
    expect((screen.getByLabelText("Grupo") as HTMLSelectElement).value).toBe(groupA.id)
  })
})

describe("Solicitudes de grupo", () => {
  it("congela fecha e identidad después de perder la respuesta y protege Deshacer entre sesiones", async () => {
    const first = fixture().client, second = fixture().client
    vi.mocked(first.recordGroup!).mockRejectedValueOnce(new ApiError("network", "Respuesta perdida", true))
    const query = { start: day, end: day }
    const { result, rerender } = renderHook(({ api, date }) => useActivity(api, { ...query, end: date }), { initialProps: { api: first, date: day } })
    await waitFor(() => expect(result.current.canWrite).toBe(true))
    const intent: Intent = { kind: "group-check", groupId: groupA.id, day, requestId: key }
    await act(async () => { expect(await result.current.perform(intent)).toBe(false) })
    intent.day = "2026-10-02"
    rerender({ api: first, date: "2026-10-04" })
    await act(async () => { expect(await result.current.retry()).toBe(true) })
    expect(vi.mocked(first.recordGroup!).mock.calls[1]).toEqual([groupA.id, day, key])
    await waitFor(() => expect(result.current.confirmedBatch?.requestId).toBe(key))
    rerender({ api: second, date: day })
    expect(result.current.confirmedBatch).toBeNull()
  })
  it("conserva un Deshacer incierto para reintentar exactamente la misma solicitud", async () => {
    const client = fixture().client
    vi.mocked(client.undoGroup!).mockRejectedValueOnce(new ApiError("network", "Respuesta perdida", true))
    const { result } = renderHook(() => useActivity(client, { start: day, end: day }))
    await waitFor(() => expect(result.current.canWrite).toBe(true))
    await act(async () => { await result.current.perform({ kind: "group-check", groupId: groupA.id, day, requestId: key }) })
    const undoKey = crypto.randomUUID()
    await act(async () => { expect(await result.current.perform({ kind: "group-undo", batchRequestId: key, requestId: undoKey })).toBe(false) })
    expect(result.current.pending?.kind).toBe("group-undo")
    await act(async () => { expect(await result.current.retry()).toBe(true) })
    expect(vi.mocked(client.undoGroup!).mock.calls).toEqual([[key, undoKey], [key, undoKey]])
    expect(result.current.confirmedBatch).toBeNull()
  })
})

