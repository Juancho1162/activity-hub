import { useEffect, useRef, useState } from "react"
import { type ActivityApi, ApiError, type DashboardPage, type DashboardQuery, type FrontDraft } from "../lib/api"

export type Intent =
  | { kind: "create"; data: FrontDraft; requestId: string }
  | { kind: "edit"; id: string; data: FrontDraft }
  | { kind: "check"; id: string; day: string; marked: boolean; requestId: string }
type ReadState = { context: number; token: string; page: DashboardPage | null; error: ApiError | null }

/** No optimistic writes, automatic retries, browser persistence, or auth bypass. */
export function useActivity(api: ActivityApi, query: DashboardQuery | null, onWriteLockChange?: (locked: boolean) => void) {
  const [version, setVersion] = useState(0)
  const [read, setRead] = useState<ReadState | null>(null)
  const [pending, setPending] = useState<Intent | null>(null)
  const [saving, setSaving] = useState(false)
  const [mutationError, setMutationError] = useState<ApiError | null>(null)
  const [notice, setNotice] = useState("")
  const pendingRef = useRef<Intent | null>(null)
  const runningRef = useRef(false)
  const lockCallback = useRef(onWriteLockChange)
  lockCallback.current = onWriteLockChange
  const mounted = useRef(true)
  const readController = useRef<AbortController | null>(null)
  const client = useRef({ api, generation: 0 })
  if (client.current.api !== api) client.current = { api, generation: client.current.generation + 1 }
  const clientGeneration = client.current.generation
  const serialized = JSON.stringify(query)
  const identity = `${clientGeneration}:${serialized}`
  const scope = useRef({ identity, generation: 0 })
  if (scope.current.identity !== identity) scope.current = { identity, generation: scope.current.generation + 1 }
  const context = scope.current.generation
  const token = `${context}:${version}`
  const currentToken = useRef(token)
  currentToken.current = token

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const currentQuery = JSON.parse(serialized) as DashboardQuery | null
    if (!currentQuery) { setRead(null); readController.current = null; return }
    const controller = new AbortController()
    readController.current = controller
    let active = true
    api.dashboard(currentQuery, controller.signal).then((page) => {
      if (active && !controller.signal.aborted) setRead({ context, token, page, error: null })
    }).catch((error: unknown) => {
      if (active && !controller.signal.aborted) setRead({ context, token, page: null,
        error: error instanceof ApiError ? error : new ApiError("network", "No se ha podido cargar el registro.") })
    })
    return () => { active = false; controller.abort() }
  }, [api, serialized, token])

  useEffect(() => {
    if (!notice) return
    // Only a confirmed-success message expires, never an error or frozen intent.
    const timer = window.setTimeout(() => setNotice(""), 6000)
    return () => window.clearTimeout(timer)
  }, [notice, version])

  useEffect(() => {
    if (!pending) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [pending])

  const current = query && read?.token === token ? read : null
  // Retain only the same query AND client/session while its snapshot refreshes.
  // It stays read-only; changing date/filter/account or hiding access discards it.
  const retained = query && read?.context === context ? read.page : null
  const page = current ? current.page : retained
  const refreshing = !!query && !current && page !== null
  const error = current?.error ?? null
  const canWrite = current?.page != null && pending === null && !saving
  const refresh = () => setVersion((value) => value + 1)

  async function run(intent: Intent, previouslyUncertain = false): Promise<boolean> {
    if (runningRef.current) return false
    runningRef.current = true
    pendingRef.current = intent
    lockCallback.current?.(true) // Before transport: an immediate auth callback must see the lock.
    setPending(intent); setSaving(true); setMutationError(null); setNotice("")
    try {
      if (intent.kind === "create") await api.createFront(intent.data, intent.requestId)
      else if (intent.kind === "edit") await api.patchFront(intent.id, intent.data)
      else await api.writeCheck(intent.id, intent.day, intent.marked, intent.requestId)
      pendingRef.current = null
      if (mounted.current) {
        setPending(null)
        setNotice("Cambio confirmado por el servidor.")
        refresh() // A fresh query, not a toggle of whatever date is currently on screen.
      }
      return true
    } catch (error: unknown) {
      const attemptError = error instanceof ApiError ? error : new ApiError("network", "No podemos confirmar el resultado. Reintenta la misma solicitud.", true)
      // A denied retry says nothing about whether the original attempt committed.
      const failure = previouslyUncertain && !attemptError.uncertain
        ? new ApiError(attemptError.kind, `${attemptError.message} La solicitud original sigue sin confirmar.`, true)
        : attemptError
      if (!failure.uncertain) pendingRef.current = null
      if (mounted.current) {
        setMutationError(failure)
        if (!failure.uncertain) setPending(null)
        if (client.current.generation === clientGeneration && (failure.kind === "access-pending" || failure.kind === "unauthorized")) {
          readController.current?.abort()
          setRead({ context: scope.current.generation, token: currentToken.current, page: null, error: failure })
        }
      }
      return false
    } finally {
      runningRef.current = false
      if (mounted.current) {
        lockCallback.current?.(pendingRef.current !== null)
        setSaving(false)
      }
    }
  }

  async function perform(intent: Intent): Promise<boolean> {
    if (!canWrite || pendingRef.current) return false
    // Freeze the logical request before awaiting anything. Edits to a form or
    // changing the selected day must never mutate the payload of its retry.
    return run(structuredClone(intent))
  }
  async function retry(): Promise<boolean> {
    return pendingRef.current && !runningRef.current ? run(pendingRef.current, true) : false
  }
  return { page, loading: !!query && !current && !page, refreshing, error, mutationError, notice, pending, saving, canWrite, refresh, perform, retry }
}
