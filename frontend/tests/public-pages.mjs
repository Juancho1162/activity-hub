// Public routes under the real Worker headers, using a disposable Brave profile
// and D1. Only illustrative content is captured; no credentials leave memory.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fixture } from "../../backend/tests/fixture.js"

const temporary = await mkdtemp(join(tmpdir(), "activity-hub-public-pages-"))
const output = new URL("../test-results/", import.meta.url)
const cleanup = []
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let browser, socket
async function until(check, label) {
  const deadline = Date.now() + 15000
  do { if (await check()) return; await pause(60) } while (Date.now() < deadline)
  throw new Error(`Timed out: ${label}`)
}
try {
  const { url, DB } = await fixture({ after: callback => cleanup.push(callback) }, { assets: true, webOrigin: null, legacy: false })
  const origin = url.origin
  const profile = join(temporary, "profile")
  browser = spawn("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser", [
    "--headless", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-sync",
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
  const pending = new Map(), privateRequests = [], errors = []
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data)
    if (message.sessionId === sessionId && message.method === "Network.requestWillBeSent") {
      const route = new URL(message.params.request.url).pathname
      if (/^\/(auth|api)(\/|$)/.test(route)) privateRequests.push(route)
    }
    if (message.sessionId === sessionId && (message.method === "Runtime.exceptionThrown" || (message.method === "Log.entryAdded" && message.params.entry.level === "error"))) errors.push(message.method)
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
  await command("Network.setCookie", { name: "activity_hub_session", value: "synthetic-remembered-session", url: origin, httpOnly: true }, sessionId)
  await navigate("/")
  await until(() => evaluate("!!document.querySelector('.landing')"), "public landing even with a remembered session cookie")
  await evaluate("document.fonts.ready.then(()=>true)")
  assert.equal(await evaluate("document.querySelector('#access-code,.app-shell')===null && location.pathname==='/'"), true)
  assert.equal(await evaluate("[...document.querySelectorAll('a[href=\"/app/\"]')].length===2 && !document.querySelector('a[href^=\"/presentacion\"]')"), true)
  const chooseLanguage = async value => {
    await evaluate(`(()=>{const el=document.querySelector('.language-picker select');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    await until(() => evaluate(`document.documentElement.lang===${JSON.stringify(value)}`), `landing language ${value}`)
  }
  assert.equal(await evaluate("document.querySelector('.landing-header a[href=\"/app/\"],.landing-close,.landing-demo-week')===null"), true, "no duplicate entry links, final CTA or invented weekly view")
  await chooseLanguage("es")
  await mkdir(output, { recursive: true })
  for (const theme of ["light", "dark"]) {
    await evaluate(`(()=>{if(document.documentElement.dataset.theme!==${JSON.stringify(theme)})document.querySelector('.theme-toggle').click();return true})()`)
    for (const width of [1366, 390, 320]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)
      await pause(80)
      assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, `${theme}/${width}: no horizontal overflow`)
      assert.equal(await evaluate(`([...document.querySelectorAll('.landing a[data-slot=button]')].every(el=>{const r=el.getBoundingClientRect();return r.height>=44 && r.left>=0 && r.right<=innerWidth}))`), true, `${theme}/${width}: usable CTA targets`)
      assert.equal(await evaluate(`(async()=>{
        const images=[...document.querySelectorAll('.landing-preview img')].filter(el=>el.checkVisibility());
        if(images.length!==1)return false;
        await images[0].decode();
        return images[0].naturalWidth===1100 && images[0].src.endsWith('registro-es-${theme}.webp');
      })()`), true, `${theme}/${width}: actual app capture matches theme`)
      const shot = await command("Page.captureScreenshot", { captureBeyondViewport: true }, sessionId)
      await writeFile(new URL(`landing-${theme}-${width}.png`, output), Buffer.from(shot.data, "base64"))
    }
  }
  await chooseLanguage("en")
  assert.equal(await evaluate("document.querySelector('h1').textContent.includes('projects') && document.body.textContent.includes('no recovery')"), true, "English product and privacy copy")
  assert.equal(await evaluate("(async()=>{const img=[...document.querySelectorAll('.landing-preview img')].find(el=>el.checkVisibility());await img.decode();return img.src.endsWith('registro-en-dark.webp') && img.alt.includes('Actual daily log')})()"), true, "capture and accessible description follow English")
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId)
  assert.equal(await evaluate("document.getAnimations().length===0"), true, "reduced motion")
  await evaluate("document.querySelector('.plant-toggle').click();true")
  assert.equal(await evaluate("document.querySelector('.plant-toggle').getAttribute('aria-pressed')==='false'"), true, "existing plant pause control")
  await command("Page.reload", {}, sessionId)
  await until(() => evaluate("document.documentElement.lang==='en' && document.documentElement.dataset.theme==='dark' && !!document.querySelector('.landing')"), "landing preferences survive reload")
  assert.deepEqual(privateRequests, [], "landing makes no auth or API requests")
  for (const table of ["accounts", "encrypted_vaults"]) assert.equal((await DB.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n, 0, "public navigation creates no account or content")
  await navigate("/presentacion/#3.2")
  await until(() => evaluate("location.pathname==='/' && !!document.querySelector('.landing') && !document.querySelector('.stage')"), "old presentation URL returns to landing")
  assert.deepEqual(errors, [], "landing runs without CSP or console errors")
  assert.deepEqual(privateRequests, [], "retired presentation redirect makes no auth or API requests")
  await navigate("/")
  await until(() => evaluate("!!document.querySelector('.landing')"), "return to landing")
  await evaluate("document.querySelector('a[href=\"/app/\"]').click();true")
  await until(() => evaluate("location.pathname==='/app/' && !!document.getElementById('access-code')"), "CTA opens existing private access")
  assert.equal((await DB.prepare("SELECT count(*) AS n FROM accounts").first()).n, 0, "CTA does not sign up")
  console.log("PASS public landing with cookie, no private requests/writes, 1366/390/320 px light/dark, ES/EN/preferences, plant/reduced motion, app CTA, no presentation links, old presentation redirect under Worker CSP.")
} finally {
  socket?.close()
  if (browser?.exitCode === null) browser.kill("SIGTERM")
  if (browser) await until(() => browser.exitCode !== null || browser.signalCode !== null, "public browser exits")
  for (const callback of cleanup.reverse()) await callback()
  await rm(temporary, { recursive: true, force: true })
}
