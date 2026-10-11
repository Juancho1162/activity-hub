import { createAuthClient, AuthError, type AuthClient } from './auth'
import { deriveCredentials, generateCode, encryptVault, type Ciphertext } from './privacy-crypto'
import { createPrivateApi, createInitialPrivateDocument } from './private-vault'
import { signupToken } from './turnstile'
import type { FrontDraft } from './api'

type PrivateAuthOptions = { initialFronts?: () => readonly FrontDraft[] }

/** Neither secret goes to the server or app storage; users may save their code in a native password manager. */
export function createPrivateAuthClient(fetcher: typeof fetch = fetch, options: PrivateAuthOptions = {}): AuthClient {
  const sessions = createAuthClient(fetcher)
  let unlocked: { account: string; key: CryptoKey } | null = null
  return {
    session: signal => sessions.session(signal),
    async signup() {
      const initialFronts = options.initialFronts ? structuredClone([...options.initialFronts()]) : undefined
      const turnstile_token = await signupToken(fetcher)
      const code = generateCode()
      const { credential, key } = await deriveCredentials(code)
      let initial_vault: (Ciphertext & { account_id: string }) | undefined
      if (initialFronts?.length) {
        const account_id = crypto.randomUUID()
        const content = createInitialPrivateDocument(initialFronts, new Date().toISOString())
        initial_vault = { account_id, ...await encryptVault(key, account_id, 1, content) }
      }
      const client = createAuthClient(async (url, init) => {
        const response = await fetcher(url, { ...init, body: JSON.stringify({ credential, ...(turnstile_token ? { turnstile_token } : {}), ...(initial_vault ? { initial_vault } : {}) }) })
        if (response.status !== 201) return response
        const result = await response.json()
        // The initial ciphertext is bound to this exact UUID, including its
        // canonical spelling. A different acknowledgement remains uncertain.
        const account_id = initial_vault && result?.account_id !== initial_vault.account_id ? null : result?.account_id
        return Response.json({ account_id, code }, { status: 201 })
      })
      return client.signup()
    },
    async login(code) {
      let derived: Awaited<ReturnType<typeof deriveCredentials>>
      try { derived = await deriveCredentials(code) } catch { throw new AuthError('invalid-code', 'Código incorrecto. Comprueba tu código privado y vuelve a intentarlo.') }
      const client = createAuthClient((url, init) => fetcher(url, { ...init, body: JSON.stringify({ credential: derived.credential }) }))
      const session = await client.login(code)
      unlocked = { account: session.account_id, key: derived.key }
      return session
    },
    async logout(csrf, account) { await sessions.logout(csrf, account) },
    canRead: account => unlocked?.account === account,
    lock() { unlocked = null },
    createApi: access => createPrivateApi(fetcher, access, unlocked?.account === access.accountId ? unlocked.key : null),
  }
}
