import { AuthError } from './auth'
type Widget = { render(element: HTMLElement, options: Record<string, unknown>): string; remove(id: string): void }
declare global { interface Window { turnstile?: Widget } }
let loading: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    const timer = setTimeout(() => { script.remove(); loading = null; reject(new Error('Verification unavailable')) }, 15000)
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => { clearTimeout(timer); resolve() }
    script.onerror = () => { clearTimeout(timer); script.remove(); loading = null; reject(new Error('Verification unavailable')) }
    document.head.append(script)
  })
  return loading
}
export async function signupToken(fetcher: typeof fetch): Promise<string | undefined> {
  try {
    const response = await fetcher('/auth/config', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error()
    const config = await response.json()
    if (config.registration_enabled !== true) throw new AuthError('forbidden', 'La creación de cuentas está cerrada temporalmente. Las cuentas existentes pueden entrar.')
    if (config.local === true && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return undefined
    if (typeof config.sitekey !== 'string' || !config.sitekey) throw new Error()
    await loadScript()
    const container = document.getElementById('signup-challenge')
    if (!container || !window.turnstile) throw new Error()
    const widget = window.turnstile
    return await new Promise<string>((resolve, reject) => {
      let id: string | undefined
      const timer = setTimeout(() => finish(), 120000)
      const finish = (token?: string) => {
        clearTimeout(timer)
        if (id !== undefined) widget.remove(id)
        if (token) resolve(token)
        else reject(new AuthError('forbidden', 'No se ha completado la verificación. Vuelve a intentarlo.'))
      }
      // Compact remains usable if the screen narrows while verification runs.
      try {
        id = widget.render(container, { sitekey: config.sitekey, action: 'signup', size: 'compact', callback: (token: string) => finish(token), 'error-callback': () => finish(), 'expired-callback': () => finish(), 'response-field': false })
      } catch { finish() }
    })
  } catch (error) {
    if (error instanceof AuthError) throw error
    throw new AuthError('unavailable', 'No se ha podido cargar la verificación de acceso. Reintenta la creación.')
  }
}
