type PasswordConstructor = new (data: { id: string; password: string; name: string }) => Credential

/** Offer the verified code to the browser's own password manager, never app storage. */
export function offerBrowserPassword(accountId: string, code: string) {
  const browser = window as Window & { PasswordCredential?: PasswordConstructor }
  if (!window.isSecureContext || typeof browser.PasswordCredential !== "function"
    || typeof navigator.credentials?.store !== "function") return
  try {
    const credential = new browser.PasswordCredential({
      id: accountId,
      password: code,
      name: `Activity Hub · Cuenta ${accountId.slice(0, 8)}`,
    })
    // Browser policy, dismissal or an unavailable manager cannot block sign-in.
    void navigator.credentials.store(credential).catch(() => {})
  } catch { /* No secret-bearing logs or change to the authentication result. */ }
}

/** Signal SPA sign-in after the password form has been removed from the DOM. */
export function signalBrowserSignIn() {
  try { window.history.replaceState(window.history.state, "", window.location.href) }
  catch { /* Sign-in still works when the browser restricts history access. */ }
}
