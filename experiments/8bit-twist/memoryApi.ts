import { ApiError, type ActivityApi, type DashboardItem, type Front } from "@/lib/api"
import { MIN_DAY, SampleError, freshSample, inclusiveDays, saveFront, selectFronts, setCheck, summarize, type SampleFront } from "./sample.mjs"

export const sampleClock = () => new Date("2026-10-04T10:00:00Z")

function asFront(front: SampleFront): Front {
  return {
    id: front.id, name: front.name, reference: front.reference, state: front.state,
    // The fixture's ordinal is its creation order, not a real user's metadata.
    created_at: new Date(Date.parse(`${MIN_DAY}T12:00:00Z`) + front.created * 1000).toISOString(),
    updated_at: sampleClock().toISOString(),
  }
}

function sampleOperation<T>(operation: () => T): T {
  try { return operation() }
  catch (error) {
    // Predictable local validation cannot imply a lost server response/retry.
    if (error instanceof SampleError) throw new ApiError("validation", error.message, false)
    throw error
  }
}

/** Finite fictional data only. No fetch/storage/auth/CSRF or server replay protocol.
 * Request IDs are accepted for useActivity compatibility, not sent or persisted.
 * The existing hook still owns its synchronous locks and confirmation refreshes.
 */
export function createMemoryApi(): ActivityApi {
  let fronts = freshSample()
  return {
    async dashboard(query, signal) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError")
      return sampleOperation(() => {
        const days = inclusiveDays(query.start, query.end)
        const limit = query.limit ?? 20
        const offset = query.offset ?? 0
        const order = query.order ?? "created"
        if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000
          || !["created", "activity_desc"].includes(order)) {
          throw new ApiError("validation", "Revisa el orden y la página de la muestra.", false)
        }
        const selected = selectFronts(fronts, { state: query.state ?? "all", search: query.search ?? "", view: "daily" })
        // selectFronts supplies the stable creation/ID tie order. Sorting the
        // ENTIRE selection by unrounded count must precede slicing any page.
        const items: DashboardItem[] = selected.map((front) => {
          const summary = summarize(front, days)
          return { front: asFront(front), count: summary.count, marked_dates: days.filter((day) => front.marks.includes(day)), last_registered_day: summary.last }
        })
        if (order === "activity_desc") items.sort((a, b) => b.count - a.count)
        return { items: items.slice(offset, offset + limit), total: items.length, limit, offset, start: query.start, end: query.end }
      })
    },
    async createFront(data, _requestId) {
      return sampleOperation(() => {
        fronts = saveFront(fronts, null, data)
        return asFront(fronts[fronts.length - 1])
      })
    },
    async patchFront(id, data) {
      return sampleOperation(() => {
        fronts = saveFront(fronts, id, data)
        return asFront(fronts.find((front) => front.id === id)!)
      })
    },
    async writeCheck(id, day, marked, _requestId) {
      return sampleOperation(() => {
        fronts = setCheck(fronts, id, day, marked)
        return { front_id: id, day, marked }
      })
    },
  }
}
