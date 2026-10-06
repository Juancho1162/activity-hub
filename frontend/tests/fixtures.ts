import type { DashboardPage, Front } from "../src/lib/api"

export const front: Front = {
  id: "00000000-0000-4000-8000-000000000001", name: "Guitarra", reference: "https://example.test/guitarra",
  state: "open", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
}
export function page(start = "2026-10-03", end = start, marked = false): DashboardPage {
  return { start, end, total: 1, offset: 0, limit: 20,
    items: [{ front: { ...front }, marked_dates: marked ? [start] : [], count: marked ? 1 : 0,
      last_registered_day: marked ? start : "2026-09-30" }],
  }
}
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
