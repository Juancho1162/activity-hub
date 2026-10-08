// Regenerate landing screenshots: npm run build && node frontend/scripts/capture-landing.mjs
// Uses the real app with synthetic accounts in disposable local D1 and Brave.
// Never connects to production or reads personal browser profiles.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fixture } from "../../backend/tests/fixture.js"

const temporary = await mkdtemp(join(tmpdir(), "activity-hub-capture-"))
const output = new URL("../public/previews/", import.meta.url)
const cleanup = []
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let browser, socket
async function until(check, label) {
  const deadline = Date.now() + 15000
  do { if (await check()) return; await pause(60) } while (Date.now() < deadline)
  throw new Error(`Timed out: ${label}`)
}
try {
  const { url } = await fixture({ after: callback => cleanup.push(callback) }, { assets: true, webOrigin: null, legacy: false })
  const origin = url.origin
  const profile = join(temporary, "profile")
  browser = spawn("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser", [
    "--headless", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-sync",
    // Hide browser chrome only in the promotional captures; the app remains scrollable.
    "--hide-scrollbars",
    "--password-store=basic", "--use-mock-keychain", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank",
  ], { stdio: "ignore" })
  let launchFailed = false, portFile
  browser.once("error", () => { launchFailed = true })
  await until(async () => {
    if (launchFailed || browser.exitCode !== null) throw new Error("The installed Brave browser could not start its test profile")
    try { portFile = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).trim().split("\n"); return true }
    catch { return false }
  }, "isolated Chromium debugging socket")
  socket = new WebSocket(`ws://127.0.0.1:${portFile[0]}${portFile[1]}`)
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }) })
  let id = 0, sessionId
  const pending = new Map(), errors = []
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data)
    if (message.sessionId === sessionId && message.method === "Runtime.exceptionThrown") errors.push(message.method)
    if (message.sessionId === sessionId && message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      const entry = message.params.entry
      // The real access screen probes the session; 401 before signup/after logout is expected.
      const loggedOut = entry.source === 'network' && entry.text.includes('401') && new URL(entry.url).pathname === '/auth/session'
      if (!loggedOut) errors.push({ source: entry.source, text: entry.text })
    }
    const item = pending.get(message.id)
    if (!item) return
    pending.delete(message.id); clearTimeout(item.timer)
    if (message.error) item.reject(new Error(`Chromium command failed: ${item.method}`))
    else item.resolve(message.result)
  })
  const command = (method, params = {}, targetSession) => new Promise((resolve, reject) => {
    const current = ++id
    const timer = setTimeout(() => { pending.delete(current); reject(new Error(`Chromium timeout: ${method}`)) }, 20000)
    pending.set(current, { resolve, reject, timer, method })
    socket.send(JSON.stringify({ id: current, method, params, ...(targetSession ? { sessionId: targetSession } : {}) }))
  })
  const { targetId } = await command("Target.createTarget", { url: "about:blank" })
  sessionId = (await command("Target.attachToTarget", { targetId, flatten: true })).sessionId
  const evaluate = async expression => {
    const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId)
    if (result.exceptionDetails) throw new Error("Public page assertion evaluation failed")
    return result.result.value
  }
  for (const domain of ["Page", "Network", "Runtime", "Log"]) await command(`${domain}.enable`, {}, sessionId)
  const navigate = route => command("Page.navigate", { url: origin + route }, sessionId)

  await command("Emulation.setDeviceMetricsOverride", { width: 1100, height: 740, deviceScaleFactor: 1, mobile: false }, sessionId)
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId)
  // Freeze only the UI date for repeatable example content, not server auth time.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `{
    const NativeDate = Date;
    window.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : ['2026-10-08T12:00:00Z'])); }
    };
  }` }, sessionId)
  await mkdir(output, { recursive: true })
  const chooseLanguage = async value => {
    await evaluate(`(()=>{const el=document.querySelector('.language-picker select');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    await until(() => evaluate(`document.documentElement.lang===${JSON.stringify(value)}`), `language ${value}`)
  }
  const input = (selector, value) => evaluate(`(()=>{
    const el=document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});
    el.dispatchEvent(new Event('input',{bubbles:true}));return true;
  })()`)
  for (const language of ["es", "en"]) {
    await navigate('/app/')
    await until(() => evaluate("!!document.getElementById('access-code')"), "local access")
    await chooseLanguage(language)
    await evaluate("document.querySelector('.auth-signup').click();true")
    await until(() => evaluate("!!document.getElementById('signup-code')"), "synthetic signup")
    await evaluate("document.getElementById('saved-code').click();true")
    await until(() => evaluate("!document.querySelector('#signup-code-form [type=submit]').disabled"), "acknowledgement")
    await evaluate("document.querySelector('#signup-code-form [type=submit]').click();true")
    await until(() => evaluate("!!document.querySelector('.app-shell') && !document.querySelector('.loading-message')"), "real application")
    const names = language === 'es' ? ['Aprender guitarra', 'Curso de fotografía', 'Mi proyecto personal', 'Practicar inglés'] : ['Learn guitar', 'Photography course', 'My personal project', 'Practise Spanish']
    for (const [index, name] of names.entries()) {
      await evaluate("document.querySelector('.new-front').click();true")
      await until(() => evaluate("!!document.getElementById('front-name')"), "new front editor")
      await input('#front-name', name)
      await until(() => evaluate("!document.querySelector('.editor-panel [type=submit]').disabled"), "create enabled")
      await evaluate("document.querySelector('.editor-panel [type=submit]').click();true")
      await until(() => evaluate(`!document.getElementById('front-name') && document.querySelectorAll('[role=checkbox].activity-check').length===${index+1}`), "front saved")
    }
    for (const index of [0, 2]) {
      await evaluate(`document.querySelectorAll('[role=checkbox].activity-check')[${index}].click();true`)
      await until(() => evaluate(`document.querySelectorAll('[role=checkbox].activity-check')[${index}].getAttribute('aria-checked')==='true' && document.querySelector('.front-list').getAttribute('aria-busy')==='false'`), "check saved")
    }
    for (const theme of ['light', 'dark']) {
      await evaluate(`(()=>{if(document.documentElement.dataset.theme!==${JSON.stringify(theme)})document.querySelector('.theme-toggle').click();document.activeElement.blur();return true})()`)
      await until(() => evaluate(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`), `theme ${theme}`)
      await evaluate("document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true)))))")
      assert.equal(await evaluate("!document.querySelector('#access-code,#signup-code,[role=dialog]') && document.querySelectorAll('[role=checkbox].activity-check').length===4 && document.querySelectorAll('[role=checkbox].activity-check[aria-checked=true]').length===2"), true)
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('.front-card')].every(el=>el.getBoundingClientRect().bottom<=innerHeight)"), true, 'all example cards fit in the real viewport')
      assert.equal(await evaluate("document.documentElement.clientWidth===innerWidth && document.documentElement.clientHeight===innerHeight"), true, 'promotional capture has no scrollbar gutter')
      const shot = await command("Page.captureScreenshot", { format: 'webp', quality: 95 }, sessionId)
      await writeFile(new URL(`registro-${language}-${theme}.webp`, output), Buffer.from(shot.data, 'base64'))
    }
    await evaluate("document.querySelector('.session-controls button').click();true")
    await until(() => evaluate("!!document.getElementById('access-code')"), 'local logout')
  }
  assert.deepEqual(errors, [], 'real app capture without console/CSP errors')
  console.log('Captured real daily log in ES/EN and light/dark with four synthetic fronts and two checks; temporary local accounts only.')
} finally {
  socket?.close()
  if (browser?.exitCode === null) browser.kill("SIGTERM")
  if (browser) await until(() => browser.exitCode !== null || browser.signalCode !== null, "public browser exits")
  for (const callback of cleanup.reverse()) await callback()
  await rm(temporary, { recursive: true, force: true })
}
