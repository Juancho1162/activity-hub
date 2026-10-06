import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { LockKeyhole } from "lucide-react"
import App from "./App"
import { Button } from "@/components/ui/8bit/button"
import { ThemeToggle } from "@/components/Theme"
import { Card, CardContent } from "@/components/ui/8bit/card"
import { Checkbox } from "@/components/ui/8bit/checkbox"
import { Input } from "@/components/ui/8bit/input"
import { createApi, type AccessContext } from "@/lib/api"
import { AuthError, type AuthClient, type AuthSession, type SignupOut } from "@/lib/auth"
import { createPrivateAuthClient } from "@/lib/private-auth"

type Mode = "checking" | "login" | "signing-in" | "active" | "error" | "logging-out" | "logout-error"
  | "signing-up" | "signup-code" | "signup-login" | "signup-error" | "account-changed" | "account-blocked"
type SessionContext = { proof: AuthSession; generation: number }
const asAuthError = (error: unknown) => error instanceof AuthError ? error : new AuthError("network", "No se ha podido conectar con el servidor. Reintenta la conexión.")
const expiryNotice = "La sesión ha caducado o se ha revocado. Vuelve a entrar; las solicitudes pendientes siguen en memoria."

export default function AuthenticatedApp({ fetcher = fetch, clock, authFactory = createPrivateAuthClient }: { fetcher?: typeof fetch; clock?: () => Date; authFactory?: (fetcher: typeof fetch) => AuthClient }) {
  const auth = useMemo(() => authFactory(fetcher), [fetcher, authFactory])
  const [mode, setMode] = useState<Mode>("checking")
  const [context, setContext] = useState<SessionContext | null>(null)
  // This is the identity of the mounted editor/intent, NOT necessarily the cookie.
  const [mountedAppAccountId, setMountedAppAccountId] = useState<string | null>(null)
  const appAccountRef = useRef<string | null>(null)
  const [error, setError] = useState<AuthError | null>(null)
  const [notice, setNotice] = useState("")
  const [code, setCode] = useState("")
  const [created, setCreated] = useState<SignupOut | null>(null)
  const [saved, setSaved] = useState(false)
  const [copyNotice, setCopyNotice] = useState("")
  const [retryAt, setRetryAt] = useState({ login: 0, signup: 0 })
  const loginCooling = retryAt.login > Date.now()
  const signupCooling = retryAt.signup > Date.now()
  const [writeLocked, setWriteLocked] = useState(false)
  const mounted = useRef(true)
  const modeRef = useRef<Mode>("checking")
  const contextRef = useRef<SessionContext | null>(null)
  const writeLockedRef = useRef(false)
  const sessionGeneration = useRef(0)
  const authEpoch = useRef(0)
  const readController = useRef<AbortController | null>(null)
  const logoutTarget = useRef<AuthSession | null>(null)

  const transition = useCallback((next: Mode) => { modeRef.current = next; setMode(next) }, [])
  const cancelRead = useCallback(() => {
    authEpoch.current++
    readController.current?.abort()
    readController.current = null
  }, [])
  const rememberSession = useCallback((proof: AuthSession, forceNew = false) => {
    const previous = contextRef.current
    if (forceNew || !previous || previous.proof.account_id !== proof.account_id
      || previous.proof.csrf_token !== proof.csrf_token || previous.proof.expires_at !== proof.expires_at) {
      const next = { proof, generation: ++sessionGeneration.current }
      contextRef.current = next; setContext(next)
    }
  }, [])
  const gateChanged = useCallback((proof: AuthSession) => {
    rememberSession(proof)
    setError(null)
    if (writeLockedRef.current) {
      setNotice(`La cuenta activa ha cambiado. Vuelve a entrar en la cuenta original ${appAccountRef.current?.slice(0, 8)} para confirmar su solicitud. No recargues ni cierres esta pestaña.`)
      transition("account-blocked")
    } else {
      setNotice(`La cuenta activa ha cambiado. Cuenta ${proof.account_id.slice(0, 8)}. Confirma antes de continuar; los borradores de otra cuenta no se trasladan.`)
      transition("account-changed")
    }
  }, [rememberSession, transition])
  const activate = useCallback((proof: AuthSession, explicit = false) => {
    if (auth.canRead && !auth.canRead(proof.account_id)) {
      rememberSession(proof)
      setError(null); setCode("")
      setNotice("Introduce tu código para descifrar el registro en esta pestaña. La clave no se guarda en el dispositivo.")
      transition(writeLockedRef.current ? "account-blocked" : "login")
      return
    }
    if (appAccountRef.current && appAccountRef.current !== proof.account_id
      && (writeLockedRef.current || !explicit)) { gateChanged(proof); return }
    rememberSession(proof, explicit)
    appAccountRef.current = proof.account_id; setMountedAppAccountId(proof.account_id)
    setError(null); setNotice(""); setCode("")
    transition("active")
  }, [auth, rememberSession, gateChanged, transition])
  const requireLogin = useCallback((message: string) => {
    sessionGeneration.current++
    contextRef.current = null; setContext(null)
    setError(null); setNotice(message); setCode("")
    transition("login")
  }, [transition])
  const checkSession = useCallback(async (hide = false) => {
    // Never bypass ACK, a different-account gate, or an explicit uncertain logout.
    if (["signing-in", "logging-out", "logout-error", "signing-up", "signup-code", "signup-login", "signup-error", "account-blocked", "account-changed"].includes(modeRef.current)) return
    cancelRead()
    const epoch = authEpoch.current
    const controller = new AbortController()
    readController.current = controller
    if (hide) { setError(null); transition("checking") }
    try {
      const proof = await auth.session(controller.signal)
      if (!mounted.current || controller.signal.aborted || epoch !== authEpoch.current) return
      if (proof) activate(proof)
      else if (modeRef.current !== "login") requireLogin(appAccountRef.current ? expiryNotice : "")
    } catch (error) {
      if (!mounted.current || controller.signal.aborted || epoch !== authEpoch.current) return
      setError(asAuthError(error)); transition("error")
    } finally {
      if (readController.current === controller) readController.current = null
    }
  }, [auth, cancelRead, activate, requireLogin, transition])

  useEffect(() => {
    mounted.current = true
    void checkSession(true)
    const check = () => { void checkSession() }
    const visible = () => { if (document.visibilityState === "visible") check() }
    const timer = window.setInterval(check, 60000)
    window.addEventListener("focus", check); window.addEventListener("pageshow", check)
    document.addEventListener("visibilitychange", visible)
    return () => {
      mounted.current = false; cancelRead(); window.clearInterval(timer)
      window.removeEventListener("focus", check); window.removeEventListener("pageshow", check)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [checkSession, cancelRead])
  useEffect(() => {
    if (mode === "login" || mode === "account-blocked") document.getElementById("access-code")?.focus()
    if (mode === "signup-code") document.getElementById("signup-code")?.focus()
    if (mode === "account-changed") document.getElementById("continue-account")?.focus()
  }, [mode])
  useEffect(() => {
    const uncertainSignup = mode === "signup-error" && (error?.kind === "network" || error?.kind === "invalid-response")
    if (!created && mode !== "signing-up" && !uncertainSignup) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [created, mode, error])
  useEffect(() => {
    const deadlines = Object.values(retryAt).filter((deadline) => deadline > Date.now())
    if (!deadlines.length) return
    const timer = window.setTimeout(() => setRetryAt((current) => ({
      login: current.login > Date.now() ? current.login : 0,
      signup: current.signup > Date.now() ? current.signup : 0,
    })), Math.max(1, Math.min(...deadlines) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [retryAt])
  function reportAuthFailure(action: "login" | "signup", failure: AuthError) {
    setError(failure)
    if (failure.kind === "rate-limit") setRetryAt((current) => ({ ...current, [action]: Date.now() + (failure.retryAfter ?? 60) * 1000 }))
  }
  const reportWriteLock = useCallback((locked: boolean) => {
    writeLockedRef.current = locked; setWriteLocked(locked)
  }, [])

  const api = useMemo(() => {
    const captured = context
    const expectedAccount = mountedAppAccountId ?? captured?.proof.account_id ?? ""
    const access: AccessContext = {
      accountId: expectedAccount,
      csrfToken: captured?.proof.account_id === expectedAccount ? captured.proof.csrf_token : "",
      onAccessDenied(status) {
        if (!mounted.current || modeRef.current !== "active" || !captured
          || contextRef.current?.generation !== captured.generation
          || contextRef.current.proof.account_id !== expectedAccount) return
        if (status === 401) { cancelRead(); requireLogin(expiryNotice) }
        else void checkSession(true) // Refresh context/CSRF, never replay a write.
      },
    }
    return auth.createApi ? auth.createApi(access) : createApi(fetcher, access)
  }, [auth, fetcher, context, mountedAppAccountId, cancelRead, requireLogin, checkSession])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!["login", "account-blocked"].includes(modeRef.current) || !code.trim() || loginCooling) return
    const previousMode = modeRef.current
    const submitted = code
    setCode("")
    cancelRead()
    const epoch = authEpoch.current
    setError(null); transition("signing-in")
    try {
      const proof = await auth.login(submitted)
      if (mounted.current && epoch === authEpoch.current) activate(proof, true)
    } catch (error) {
      if (!mounted.current || epoch !== authEpoch.current) return
      reportAuthFailure("login", asAuthError(error)); transition(previousMode)
    }
  }
  async function signup() {
    if (writeLockedRef.current || !["login", "signup-error"].includes(modeRef.current) || signupCooling) return
    cancelRead()
    const epoch = authEpoch.current
    setError(null); setNotice(""); setCode(""); setSaved(false); setCopyNotice("")
    transition("signing-up")
    try {
      const result = await auth.signup()
      if (!mounted.current || epoch !== authEpoch.current) return
      setCreated(result); transition("signup-code")
    } catch (error) {
      if (!mounted.current || epoch !== authEpoch.current) return
      reportAuthFailure("signup", asAuthError(error)); transition("signup-error")
    }
  }
  async function enterCreatedAccount() {
    if (modeRef.current !== "signup-code" || !created || !saved || loginCooling) return
    cancelRead()
    const epoch = authEpoch.current
    setError(null); transition("signup-login")
    try {
      const proof = await auth.login(created.code)
      if (!mounted.current || epoch !== authEpoch.current) return
      if (proof.account_id !== created.account_id) throw new AuthError("invalid-response", "La respuesta de entrada no corresponde a la cuenta creada. Conserva tu código; no se ha confirmado el acceso a tu cuenta.")
      activate(proof, true)
      setCreated(null); setSaved(false); setCopyNotice("")
    } catch (error) {
      if (!mounted.current || epoch !== authEpoch.current) return
      reportAuthFailure("login", asAuthError(error)); transition("signup-code")
    }
  }
  async function copyCode() {
    if (!created) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable")
      await navigator.clipboard.writeText(created.code)
      if (mounted.current) setCopyNotice("Código copiado. Guárdalo en un lugar seguro.")
    } catch {
      if (mounted.current) setCopyNotice("No se pudo copiar. Selecciona el código y cópialo manualmente.")
    }
  }
  function leaveSignup() {
    if (created && !window.confirm("Al salir se borrará el código de esta pantalla. No hay recuperación. ¿Lo has guardado y quieres salir?")) return
    setCreated(null); setSaved(false); setCopyNotice(""); setError(null); setCode("")
    transition("login")
  }
  function confirmLogout() {
    auth.lock?.()
    sessionGeneration.current++
    contextRef.current = null; setContext(null)
    appAccountRef.current = null; setMountedAppAccountId(null)
    logoutTarget.current = null
    setError(null); setCode(""); setNotice("Sesión cerrada en este dispositivo.")
    transition("login")
  }
  async function logout() {
    if (writeLockedRef.current || !["active", "login", "logout-error"].includes(modeRef.current)) return
    const retry = modeRef.current === "logout-error"
    if (!retry) logoutTarget.current = contextRef.current?.proof ?? null
    let target = logoutTarget.current
    if (!target) return
    cancelRead()
    const epoch = authEpoch.current
    const controller = new AbortController()
    readController.current = controller
    const current = () => mounted.current && !controller.signal.aborted && epoch === authEpoch.current
    const finish = (proof: AuthSession | null) => {
      if (!current()) return
      if (!proof) confirmLogout()
      else { logoutTarget.current = null; gateChanged(proof) }
    }
    setError(null); transition("logging-out")
    try {
      if (retry) {
        const proof = await auth.session(controller.signal)
        if (!current()) return
        if (!proof) { confirmLogout(); return }
        if (proof.account_id !== target.account_id) { finish(proof); return }
        target = proof; logoutTarget.current = proof; rememberSession(proof)
      }
      await auth.logout(target.csrf_token, target.account_id)
      if (!current()) return
      // A late 204/401 only confirms the old request, not the current cookie.
      finish(await auth.session(controller.signal))
    } catch (error) {
      if (!current()) return
      const failure = asAuthError(error)
      if (failure.kind === "account-changed") {
        try { finish(await auth.session(controller.signal)); return }
        catch (readError) { if (!current()) return; setError(asAuthError(readError)) }
      } else setError(failure)
      transition("logout-error")
    } finally {
      if (readController.current === controller) readController.current = null
    }
  }

  const active = mode === "active" && context !== null && context.proof.account_id === mountedAppAccountId
  const loginForm = mode === "login" || mode === "signing-in" || mode === "account-blocked"
  const codeView = created !== null && (mode === "signup-code" || mode === "signup-login")
  return <>
    <div className="app-controls">
    {(active || (mode === "login" && context !== null)) && <nav className="session-controls" aria-label="Sesión privada">
      <p className="muted">Cuenta {context?.proof.account_id.slice(0, 8)}{writeLocked && <span className="sr-only"> · Confirma la solicitud pendiente antes de cerrar.</span>}</p>
      <Button type="button" variant="outline" font="normal" className="text-button" disabled={writeLocked} onClick={() => { void logout() }}>Cerrar sesión</Button>
    </nav>}<ThemeToggle /></div>
    {!active && <main className="auth-shell">
      <Card font="normal" className="message-card auth-card"><CardContent font="normal" className="card-body">
        <span className="message-icon" aria-hidden="true"><LockKeyhole /></span>
        <p className="eyebrow">ACTIVITY HUB · ESPACIO PRIVADO</p>
        <h1 className="retro">{codeView ? "Guarda tu código" : mode === "logging-out" || mode === "logout-error" ? "Cerrar sesión" : "Tu registro personal"}</h1>
        {notice && <p role="status">{notice}</p>}
        {mode === "checking" && <p role="status" className="loading-message"><span className="loading-pixel" aria-hidden="true" />Comprobando la sesión de este dispositivo…</p>}
        {mode === "logging-out" && <p role="status">Cerrando la sesión… Espera la confirmación del servidor.</p>}
        {mode === "signing-up" && <p role="status">Creando una cuenta vacía… No recargues; espera el resultado.</p>}
        <div id="signup-challenge" aria-label="Verificación de acceso" />
        {error && <div role="alert" id="auth-error">
          {mode === "logout-error" && <p>No se ha podido confirmar el cierre. Los datos permanecen ocultos. Reintenta el cierre explícitamente.</p>}
          <p>{error.message}</p>
        </div>}
        {loginForm && <>
          <p className="muted">Entra con tu código privado. La sesión se recuerda solo en este dispositivo mediante una cookie protegida.</p>
          {writeLocked && mode !== "account-blocked" && <p>Vuelve a la cuenta original {mountedAppAccountId?.slice(0, 8)} para confirmar la solicitud pendiente.</p>}
          <form className="auth-form" onSubmit={(event) => { void login(event) }}>
            <div className="field"><label htmlFor="access-code">Código de acceso</label><Input id="access-code" type="password" font="normal" className="field-input" autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={128} required value={code} disabled={mode === "signing-in"} aria-invalid={error?.kind === "invalid-code"} aria-describedby={error ? "auth-error" : "code-help"} onChange={(event) => setCode(event.target.value)} /><p id="code-help" className="field-help">Un único código permanente por cuenta. Sin usuario ni correo.</p></div>
            <Button type="submit" disabled={mode === "signing-in" || loginCooling}>Entrar</Button>
            {mode === "signing-in" && <p role="status">Comprobando el código…</p>}
          </form>
          {signupCooling && <p role="status">Espera antes de crear otra cuenta; el límite de altas sigue activo.</p>}
          {!writeLocked && mode === "login" && context === null && <Button type="button" variant="outline" font="normal" className="text-button" disabled={signupCooling} onClick={() => { void signup() }}>Crear cuenta</Button>}
        </>}
        {codeView && <div className="auth-form signup-code-view">
          <p>Tu cuenta empieza vacía. Este es su único código permanente y solo se muestra ahora.</p>
          <div className="field"><label htmlFor="signup-code">Tu código permanente</label><textarea id="signup-code" className="permanent-code" readOnly value={created.code} rows={3} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="permanent-code-warning" onFocus={(event) => event.currentTarget.select()} /></div>
          <Button type="button" variant="outline" font="normal" className="text-button" onClick={() => { void copyCode() }}>Copiar</Button>
          {copyNotice && <p role="status">{copyNotice}</p>}
          <p id="permanent-code-warning" className="code-warning"><strong>No hay recuperación.</strong> Guárdalo en un lugar seguro. No se puede cambiar, regenerar ni recuperar, ni siquiera desde una sesión abierta. Si lo pierdes, perderás el acceso a esta cuenta.</p>
          <label className="saved-code" htmlFor="saved-code"><Checkbox id="saved-code" checked={saved} disabled={mode === "signup-login"} onCheckedChange={(checked) => setSaved(checked === true)} />He guardado mi código</label>
          <Button type="button" disabled={!saved || mode === "signup-login" || loginCooling} onClick={() => { void enterCreatedAccount() }}>Entrar en mi cuenta</Button>
          {mode === "signup-login" && <p role="status">Comprobando el código guardado…</p>}
          <Button type="button" variant="outline" font="normal" className="text-button" disabled={mode === "signup-login"} onClick={leaveSignup}>Volver a entrar</Button>
        </div>}
        {mode === "signup-error" && <div className="auth-form">
          <p>No se ha confirmado una cuenta con un código utilizable. No reintentamos la creación automáticamente. Una nueva creación sería otra cuenta, no un código nuevo para la anterior.</p>
          <Button type="button" variant="outline" font="normal" className="text-button" disabled={signupCooling} onClick={() => { void signup() }}>Crear otra cuenta</Button>
          <Button type="button" variant="outline" font="normal" className="text-button" onClick={leaveSignup}>Volver a entrar</Button>
        </div>}
        {mode === "account-changed" && <div className="auth-form">
          <Button id="continue-account" type="button" disabled={writeLocked} onClick={() => { const proof = contextRef.current?.proof; if (proof && !writeLockedRef.current) activate(proof, true) }}>Continuar con esta cuenta</Button>
          <Button type="button" variant="outline" font="normal" className="text-button" onClick={() => { setCode(""); setError(null); transition("login") }}>Entrar con otro código</Button>
        </div>}
        {mode === "error" && <Button type="button" variant="outline" font="normal" className="text-button" onClick={() => { void checkSession(true) }}>Reintentar conexión</Button>}
        {mode === "logout-error" && <Button type="button" variant="outline" font="normal" className="text-button" onClick={() => { void logout() }}>Reintentar cierre</Button>}
      </CardContent></Card>
    </main>}
    {mountedAppAccountId && <App key={mountedAppAccountId} api={api} clock={clock} enabled={active} onWriteLockChange={reportWriteLock} />}
  </>
}
