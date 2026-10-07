import { useEffect, useRef, useState } from "react"
import { type ActivityApi, ApiError, type DashboardPage, type DashboardQuery, type FrontDraft } from "../lib/api"

export type Intent =
  | { kind: "create"; data: FrontDraft; requestId: string }
  | { kind: "edit"; id: string; data: FrontDraft }
  | { kind: "check"; id: string; day: string; marked: boolean; requestId: string }
  | { kind: "trash" | "restore" | "delete"; id: string; requestId: string }
type ReadState = { context: number; token: string; page: DashboardPage | null; error: ApiError | null }

/** Confirmed data stays separate from the immediate checkbox preview. No automatic retries or browser persistence. */
export function useActivity(api: ActivityApi, query: DashboardQuery | null, onWriteLockChange?: (locked: boolean) => void) {
  const [version, setVersion] = useState(0)
  const [read, setRead] = useState<ReadState | null>(null)
  const [pending, setPending] = useState<Intent | null>(null)
  const [saving, setSaving] = useState(false)
  const [writeClient, setWriteClient] = useState<{ generation: number; context: number; check: Extract<Intent, { kind: "check" }> | null } | null>(null)
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
  const clearCheckPreview = () => setWriteClient(previous => previous?.generation === clientGeneration
    && previous.context === context && previous.check ? { ...previous, check: null } : previous)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; api.forgetSnapshot?.() } }, [api])
  useEffect(() => {
    const currentQuery = JSON.parse(serialized) as DashboardQuery | null
    if (!currentQuery) { setRead(null); readController.current = null; api.forgetSnapshot?.(); return }
    const controller = new AbortController()
    readController.current = controller
    let active = true
    api.dashboard(currentQuery, controller.signal).then((page) => {
      if (active && !controller.signal.aborted) {
        setRead({ context, token, page, error: null })
        if (!runningRef.current) clearCheckPreview()
      }
    }).catch((error: unknown) => {
      if (active && !controller.signal.aborted) setRead({ context, token, page: null,
        error: error instanceof ApiError ? error : new ApiError("network", "No se ha podido cargar el registro.") })
    })
    return () => { active = false; controller.abort(); api.forgetSnapshot?.() }
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
    setPending(intent); setSaving(true); setWriteClient({ generation: clientGeneration, context, check: intent.kind === "check" ? intent : null }); setMutationError(null); setNotice("")
    try {
      if (intent.kind === "create") await api.createFront(intent.data, intent.requestId)
      else if (intent.kind === "edit") await api.patchFront(intent.id, intent.data)
      else if (intent.kind === "check") await api.writeCheck(intent.id, intent.day, intent.marked, intent.requestId)
      else if (intent.kind === "trash" && api.trashFront) await api.trashFront(intent.id, intent.requestId)
      else if (intent.kind === "restore" && api.restoreFront) await api.restoreFront(intent.id, intent.requestId)
      else if (intent.kind === "delete" && api.deleteFront) await api.deleteFront(intent.id, intent.requestId)
      else throw new ApiError("unavailable", "La papelera no está disponible en este cliente.")
      pendingRef.current = null
      if (mounted.current) {
        setPending(null)
        setNotice("Cambio confirmado por el servidor.")
        let confirmedPage: DashboardPage | null = null
        if ((intent.kind === "check" || intent.kind === "trash" || intent.kind === "restore" || intent.kind === "delete") && query
          && client.current.generation === clientGeneration && scope.current.generation === context) {
          // This projects the complete document acknowledged by this exact
          // commit/replay. It never guesses a checkbox value from the intent.
          try { confirmedPage = api.confirmedDashboard?.(intent.requestId, query) ?? null } catch { /* Reload a confirmed write; never resend it. */ }
        }
        if (confirmedPage) {
          readController.current?.abort()
          setRead({ context, token: currentToken.current, page: confirmedPage, error: null })
          clearCheckPreview()
        } else {
          api.forgetSnapshot?.()
          refresh() // Changed query/client or a transport without a confirmed snapshot.
        }
      }
      return true
    } catch (error: unknown) {
      const attemptError = error instanceof ApiError ? error : new ApiError("network", "No podemos confirmar el resultado. Reintenta la misma solicitud.", true)
      // A denied retry says nothing about whether the original attempt committed.
      const failure = previouslyUncertain && !attemptError.uncertain && attemptError.kind !== "deleted-request"
        ? new ApiError(attemptError.kind, `${attemptError.message} La solicitud original sigue sin confirmar.`, true)
        : attemptError
      if (!failure.uncertain) pendingRef.current = null
      if (mounted.current) {
        setMutationError(failure)
        if (!failure.uncertain) setPending(null)
        if (failure.kind === "deleted-request") { api.forgetSnapshot?.(); refresh() }
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
  const savingCheck = saving && writeClient?.generation === clientGeneration && pending?.kind === "check" ? pending : null
  // Preview only this client's exact query while saving or refreshing its ACK.
  // Errors revert to confirmed data; uncertain intents still require explicit retry.
  const optimisticCheck = !mutationError && (saving || refreshing) && writeClient?.generation === clientGeneration
    && writeClient.context === context ? writeClient.check : null
  return { page, loading: !!query && !current && !page, refreshing, error, mutationError, notice, pending, saving, savingCheck, optimisticCheck, canWrite, refresh, perform, retry }
}
