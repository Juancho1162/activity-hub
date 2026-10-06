import { afterEach, expect, it, vi } from 'vitest'
import { signupToken } from '../src/lib/turnstile'

const config = () => vi.fn<typeof fetch>(async () => Response.json({ local: false, registration_enabled: true, sitekey: 'synthetic-public-sitekey' }))
afterEach(() => { delete window.turnstile; document.body.innerHTML = '' })

it('a challenge fits the narrow signup card and each attempt obtains its own token', async () => {
  document.body.innerHTML = '<div id="signup-challenge"></div>'
  const remove = vi.fn()
  let next = 0
  window.turnstile = { remove, render(_container, options) {
    // Published Turnstile dimensions: normal/flexible >=300px, compact=150px.
    const availableWidth = 244
    const widgetWidth = options.size === 'compact' ? 150 : 300
    if (widgetWidth > availableWidth) throw new Error('Challenge would overflow the mobile card')
    expect(options.action).toBe('signup')
    expect(options['response-field']).toBe(false)
    const id = String(++next)
    queueMicrotask(() => (options.callback as (token: string) => void)(`synthetic-token-${id}`))
    return id
  } }
  const fetcher = config()
  expect(await signupToken(fetcher)).toBe('synthetic-token-1')
  expect(await signupToken(fetcher)).toBe('synthetic-token-2')
  expect(remove.mock.calls).toEqual([['1'], ['2']])
})

it('an expired or failed challenge produces no signup token and removes the widget', async () => {
  document.body.innerHTML = '<div id="signup-challenge"></div>'
  for (const event of ['error-callback', 'expired-callback']) {
    const remove = vi.fn()
    window.turnstile = { remove, render(_container, options) {
      queueMicrotask(() => (options[event] as () => void)())
      return 'synthetic-widget'
    } }
    await expect(signupToken(config())).rejects.toMatchObject({ kind: 'forbidden' })
    expect(remove).toHaveBeenCalledExactlyOnceWith('synthetic-widget')
  }
})
