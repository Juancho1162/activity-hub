import { createAuthClient, AuthError, type AuthClient } from './auth'
import { deriveCredentials, generateCode } from './privacy-crypto'
import { createPrivateApi } from './private-vault'
import { signupToken } from './turnstile'

/** Neither secret goes to the server or app storage; users may save their code in a native password manager. */
export function createPrivateAuthClient(fetcher: typeof fetch = fetch): AuthClient {
  const sessions = createAuthClient(fetcher)
  let unlocked: { account: string; key: CryptoKey } | null = null
  return {
    session: signal => sessions.session(signal),
    async signup() {
      const turnstile_token = await signupToken(fetcher)
      const code = generateCode()
      const { credential } = await deriveCredentials(code)
      const client = createAuthClient(async (url, init) => {
        const response = await fetcher(url, { ...init, body: JSON.stringify({ credential, ...(turnstile_token ? { turnstile_token } : {}) }) })
        if (response.status !== 201) return response
        const result = await response.json()
        return Response.json({ account_id: result.account_id, code }, { status: 201 })
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
