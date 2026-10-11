// Real Worker + encrypted D1 in a disposable fixture, and a separate Brave profile.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { fixture } from "../../backend/tests/fixture.js"
import { decryptVault, deriveCredentials } from "../../frontend/src/lib/privacy-crypto.ts"

const temporary = await mkdtemp(join(tmpdir(), "activity-garden-browser-"))
const screenshots = fileURLToPath(new URL("../test-results/", import.meta.url))
await mkdir(screenshots, { recursive: true })
const cleanup = []
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let browser, socket
async function until(check, label) {
  const deadline = Date.now() + 20000
  do { if (await check()) return; await pause(50) } while (Date.now() < deadline)
  throw new Error("Timed out: " + label)
}
try {
  const f = await fixture({ after: callback => cleanup.push(callback) }, { webOrigin: null, legacy: false })
  const assets = join(f.directory, "assets")
  await cp(process.env.GARDEN_TEST_ASSETS ?? fileURLToPath(new URL("../dist/", import.meta.url)), assets, { recursive: true })
  const base = JSON.parse(await readFile(new URL("../../backend/wrangler.jsonc", import.meta.url), "utf8"))
  f.config.assets = { ...base.assets, directory: assets }
  await f.server.update({ ...f.options, workers: [{ config: f.config }] })
  const { DB } = await f.server.getWorker().getEnv()
  const profile = join(temporary, "profile")
  browser = spawn("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser", [
    "--headless", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-sync",
    "--password-store=basic", "--use-mock-keychain", "--user-data-dir=" + profile, "--remote-debugging-port=0", "about:blank",
  ], { stdio: "ignore" })
  let failed = false, portFile
  browser.once("error", () => { failed = true })
  await until(async () => {
    if (failed || browser.exitCode !== null) throw new Error("Brave did not start")
    try { portFile = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).trim().split("\n"); return true } catch { return false }
  }, "isolated browser")
  socket = new WebSocket("ws://127.0.0.1:" + portFile[0] + portFile[1])
  await once(socket, "open")
  let id = 0, acceptReloadWarning = false
  const requests = new Map(), errors = []
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === "Runtime.exceptionThrown") errors.push("Browser exception")
    if (message.method === "Page.javascriptDialogOpening" && message.params.type === "beforeunload" && acceptReloadWarning) {
      void command("Page.handleJavaScriptDialog", { accept: true }, message.sessionId).catch(() => errors.push("Reload warning could not be accepted"))
    }
    const pending = requests.get(message.id)
    if (!pending) return
    requests.delete(message.id); clearTimeout(pending.timer)
    message.error ? pending.reject(new Error("Browser command failed")) : pending.resolve(message.result)
  })
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const current = ++id
    const timer = setTimeout(() => { requests.delete(current); reject(new Error("Browser timeout: " + method)) }, 20000)
    requests.set(current, { resolve, reject, timer })
    socket.send(JSON.stringify({ id: current, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
  const { targetId } = await command("Target.createTarget", { url: "about:blank" })
  const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true })
  const evaluate = async expression => {
    const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId)
    if (result.exceptionDetails) throw new Error("Browser evaluation failed")
    return result.result.value
  }
  await command("Runtime.enable", {}, sessionId)
  await command("Page.enable", {}, sessionId)
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    window.__signIns=0; window.__rawCodeSent=false; window.__plainNameSent=false; window.__vaultWrites=0; window.__privateRequests=0;
    const request=window.fetch;
    window.fetch=function(input,init){
      const path=new URL(input instanceof Request ? input.url : String(input),location.href).pathname;
      if(path==='/api'||path.startsWith('/api/')||path==='/auth'||path.startsWith('/auth/')) window.__privateRequests++;
      if(String(input).endsWith('/auth/login')) window.__signIns++;
      if(window.__fixtureCode && typeof init?.body==='string' && init.body.includes(window.__fixtureCode)) window.__rawCodeSent=true;
      if(typeof init?.body==='string' && init.body.includes('Aprender guitarra')) window.__plainNameSent=true;
      if(String(input)==='/api/vault' && init?.method==='GET' && window.__failNextVaultRead) {
        window.__failNextVaultRead=false;
        return Promise.resolve(Response.json({detail:'Fixture read failure'},{status:503}));
      }
      const writing=String(input)==='/api/vault' && init?.method==='PUT';
      if(writing) window.__vaultWrites++;
      const response=request.call(this,input,init);
      if(writing && window.__loseNextVaultResponse) {
        window.__loseNextVaultResponse=false;
        return response.then(result=>{if(result.ok) throw new TypeError('Fixture lost commit response');return result});
      }
      return response;
    };
  })()` }, sessionId)
  const click = selector => evaluate("(() => { const e=document.querySelector(" + JSON.stringify(selector) + "); if(!e || e.disabled) throw Error('Unavailable control'); e.click(); return true })()")
  const choose = (selector, value) => evaluate("(() => {const e=document.querySelector(" + JSON.stringify(selector) + "); if(e instanceof HTMLInputElement) Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e," + JSON.stringify(value) + "); else e.value=" + JSON.stringify(value) + "; e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
  const ready = () => until(() => evaluate("!!document.querySelector('.new-front') && !document.querySelector('.new-front').disabled && !document.querySelector('.loading-message')"), "loaded writable app")
  const screenshot = async (name, width = 1440, section = null) => {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 1050, deviceScaleFactor: 1, mobile: false }, sessionId)
    await evaluate("window.scrollTo(0,0);true")
    await evaluate("document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))")
    if(section) await evaluate("document.querySelector("+JSON.stringify(section)+").scrollIntoView();true")
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, name + " has no horizontal overflow")
    const shot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId)
    await writeFile(join(screenshots, name + ".png"), Buffer.from(shot.data, "base64"))
  }
  await command("Page.navigate", { url: f.url.origin + "/" }, sessionId)
  await until(() => evaluate("!!document.querySelector('.garden-landing')"), "Garden landing is the local home")
  assert.equal(await evaluate("!!document.querySelector('.local-previewbar') || [...document.links].some(a=>a.href.includes('127.0.0.1:5174'))"), false, "production has no local preview controls");
  await choose(".language-picker select", "es")
  if (await evaluate("document.documentElement.dataset.theme==='dark'")) await click(".theme-toggle")
  assert.equal(await evaluate("document.querySelector('h1').textContent.includes('Dale espacio')"), true, "selected prototype hero")
  assert.equal(await evaluate("[...document.querySelectorAll('.garden-landing-actions a')].every(e=>new URL(e.href).pathname==='/app/' && new URL(e.href).searchParams.get('appearance')==='garden')"), true, "both CTAs reach the real Garden app")
  const storageBeforeDemo = await evaluate("JSON.stringify(Object.entries(localStorage).sort())")
  await evaluate("document.querySelector('.garden-demo-check').focus();true")
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 }, sessionId)
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 }, sessionId)
  await until(() => evaluate("document.querySelector('.garden-demo-check').getAttribute('aria-checked')==='false'"), "demo keyboard toggle")
  await click(".garden-demo-reset")
  assert.equal(await evaluate("document.querySelector('.garden-demo-check').getAttribute('aria-checked')"), "true", "demo reset")
  assert.equal(await evaluate("JSON.stringify(Object.entries(localStorage).sort())"), storageBeforeDemo, "demo never persists activity")
  for (const language of ["es", "en"]) {
    await choose(".language-picker select", language)
    for (const theme of ["light", "dark"]) {
      if (await evaluate("document.documentElement.dataset.theme") !== theme) await click(".theme-toggle")
      for (const width of [1440, 768, 390, 320]) {
        await screenshot(`garden-landing-${language}-${theme}-${width}`, width)
        assert.equal(await evaluate("[...document.querySelectorAll('.garden-demo-check')].every(e=>e.getBoundingClientRect().width>=44 && e.getBoundingClientRect().height>=44)"), true, "demo targets at " + width)
        assert.equal(await evaluate("[...document.querySelectorAll('.garden-landing [href],.garden-landing button,.garden-landing select')].every(e=>{const r=e.getBoundingClientRect();return r.left>=-1 && r.right<=innerWidth+1})"), true, "landing controls stay within viewport at " + width)
      }
    }
  }
  await choose(".language-picker select", "es")
  await click(".theme-toggle")
  await screenshot("garden-landing-live", 1440, ".garden-landing-live")
  await screenshot("garden-landing-live-mobile", 390, ".garden-landing-live")
  await choose(".appearance-picker select", "classic")
  await until(() => evaluate("!!document.querySelector('.landing') && !document.querySelector('.garden-landing')"), "original landing preserved")
  assert.equal(await evaluate("document.querySelector('.landing-actions a').getAttribute('href')"), "/app/", "original CTA remains available")
  await choose(".appearance-picker select", "garden")
  await until(() => evaluate("!!document.querySelector('.garden-landing')"), "return to garden landing")
  assert.equal(await evaluate("window.__privateRequests"), 0, "public landing never accesses an account")
  await click(".garden-landing-actions a")
  await until(() => evaluate("!!document.querySelector('#access-code')"), "access form")
  assert.equal(await evaluate("document.documentElement.dataset.presentation"), "garden", "landing opens the real Garden access")
  assert.equal((await DB.prepare("SELECT count(*) AS n FROM accounts").first()).n, 0, "following CTA never signs up automatically")
  await choose(".language-picker select", "es")
  if (await evaluate("document.documentElement.dataset.theme==='dark'")) await click(".theme-toggle")
  await click(".auth-signup")
  await until(() => evaluate("!!document.querySelector('#signup-code')"), "local account")
  await evaluate("window.__fixtureCode=document.getElementById('signup-code').value;true")
  const fixtureCode = await evaluate("window.__fixtureCode")
  const fixtureAccount = await evaluate("document.querySelector('#signup-code-form [autocomplete=username]').value")
  const { key } = await deriveCredentials(fixtureCode)
  const contents = async () => {
    const row = await DB.prepare("SELECT version, iv, ciphertext FROM encrypted_vaults").first()
    assert.ok(row, "encrypted account initialized")
    return decryptVault(key, fixtureAccount, row.version, row)
  }
  assert.equal((await DB.prepare("SELECT count(*) AS n FROM encrypted_vaults").first()).n, 1, "signup already has its encrypted examples before login")
  // The code screen correctly warns before leaving; this test deliberately
  // accepts that warning after retaining only its disposable fixture code.
  acceptReloadWarning = true
  await command("Page.reload", {}, sessionId)
  await until(() => evaluate("!!document.querySelector('#access-code')"), "reload before the first login")
  acceptReloadWarning = false
  await evaluate("window.__fixtureCode="+JSON.stringify(fixtureCode)+";true")
  await choose("#access-code", fixtureCode)
  await click("#login-form [type=submit]")
  await ready()
  await until(() => evaluate("!!document.querySelector('.onboarding-panel')"), "automatic welcome for new account")
  const initial = await contents()
  assert.deepEqual(initial.fronts.map(front => front.name).sort(), ["Leer", "Proyecto A", "Proyecto B", "Aprender algo"].sort(), "chosen starter fronts")
  assert.equal(initial.fronts.every(front => front.state === "open" && front.reference === null && !!front.icon), true, "editable open starters with icons")
  assert.deepEqual(initial.checks, [], "no invented activity")
  assert.equal(initial.onboarding.tutorialDismissed, false)
  const initializationWrites = await evaluate("window.__vaultWrites")
  const guideButton = text => evaluate("[...document.querySelectorAll('.onboarding-panel button')].find(e=>e.textContent.trim()===" + JSON.stringify(text) + ").click();true")
  await screenshot("garden-welcome")
  await screenshot("garden-welcome-mobile", 390)
  await screenshot("garden-welcome-small", 320)
  assert.equal(await evaluate("[...document.querySelectorAll('.onboarding-panel button')].every(e=>e.getBoundingClientRect().width>=44 && e.getBoundingClientRect().height>=44)"), true, "tutorial controls remain tappable")
  // Expire only the disposable fixture session while its welcome is open.
  await DB.prepare("DELETE FROM web_sessions WHERE account_id = (SELECT account_id FROM encrypted_vaults LIMIT 1)").run()
  await evaluate("window.dispatchEvent(new Event('focus'));true")
  await until(() => evaluate("!!document.querySelector('#access-code') && !document.querySelector('.onboarding-panel')"), "expiry hides guide")
  await choose("#access-code", fixtureCode)
  await evaluate("window.__failNextVaultRead=true;true")
  await click("#login-form [type=submit]")
  await until(() => evaluate("!!document.querySelector('.onboarding-panel .request-feedback button')"), "read recovery stays inside guide")
  assert.equal(await evaluate("document.querySelector('.onboarding-panel .request-feedback button').textContent.trim()"), "Reintentar carga")
  assert.equal(await evaluate("document.querySelector('.onboarding-skip').disabled"), true, "dismissal waits for restored snapshot")
  await click(".onboarding-panel .request-feedback button")
  await until(() => evaluate("!!document.querySelector('.onboarding-skip') && !document.querySelector('.onboarding-skip').disabled"), "guide recovers without reload")
  await guideButton("Siguiente")
  await screenshot("garden-guide-check", 390)
  await guideButton("Siguiente")
  await screenshot("garden-guide-history", 390)
  await guideButton("Anterior")
  await guideButton("Siguiente")
  assert.equal(await evaluate("window.__vaultWrites"), initializationWrites, "reading the tutorial never writes activity")
  await evaluate("window.__loseNextVaultResponse=true;true")
  await guideButton("Empezar mi jardín")
  await until(() => evaluate("!!document.querySelector('.onboarding-panel .request-feedback button')"), "lost dismissal remains retryable")
  assert.equal(await evaluate("document.querySelector('.onboarding-skip').disabled && document.querySelector('.session-controls button').disabled"), true, "uncertain dismissal shares account write lock")
  await click(".onboarding-panel .request-feedback button")
  await until(() => evaluate("!document.querySelector('.onboarding-panel')"), "dismissal confirmed by explicit retry")
  await ready()
  assert.equal(await evaluate("window.__vaultWrites"), initializationWrites + 1, "retry confirms monotonic preference without a second write")
  const dismissed = await contents()
  assert.equal(dismissed.onboarding.tutorialDismissed, true)
  for (const field of ["fronts", "checks", "replays"]) assert.deepEqual(dismissed[field], initial[field], "tutorial preserves " + field)
  await screenshot("garden-starters")
  // A new document/client proves the preference survives beyond React memory.
  await command("Page.navigate", { url: f.url.origin + "/app/?appearance=garden" }, sessionId)
  await until(() => evaluate("!!document.querySelector('#access-code')"), "reload requires explicit code")
  await evaluate("window.__fixtureCode=" + JSON.stringify(fixtureCode) + ";true")
  await choose("#access-code", fixtureCode)
  await click("#login-form [type=submit]")
  await ready()
  assert.equal(await evaluate("!!document.querySelector('.onboarding-panel')"), false, "completed guide does not return after reload/login")
  assert.deepEqual((await contents()).fronts, initial.fronts, "starters retain IDs after re-login")
  await choose(".language-picker select", "en")
  await click(".theme-toggle")
  await click(".garden-guide-open")
  await until(() => evaluate("document.querySelector('.onboarding-panel')?.textContent.includes('Quick guide')"), "manual English guide")
  await screenshot("garden-guide-dark-english")
  await screenshot("garden-guide-dark-small", 320)
  await guideButton("Next")
  await guideButton("Next")
  await screenshot("garden-guide-dark-history", 390)
  await click('[aria-label="Close guide"]')
  await until(() => evaluate("!document.querySelector('.onboarding-panel')"), "manual close")
  await choose(".language-picker select", "es")
  await click(".theme-toggle")
  await click(".garden-guide-open")
  await click(".onboarding-skip")
  await until(() => evaluate("!document.querySelector('.onboarding-panel')"), "manual skip")
  await click(".garden-guide-open")
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId)
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId)
  await until(() => evaluate("!document.querySelector('.onboarding-panel')"), "keyboard dismissal")
  assert.equal(await evaluate("window.__vaultWrites"), 0, "manual guide does not reset or rewrite saved preference")
  await until(() => evaluate("document.activeElement===document.querySelector('.garden-guide-open')"), "guide returns keyboard focus")
  // Remove only this disposable account's examples through the real UI.
  for (let remaining = initial.fronts.length; remaining > 0; remaining--) {
    await click(".daily-list .edit-front")
    await click(".delete-front")
    await until(() => evaluate("!document.querySelector('#front-name') && document.querySelectorAll('.daily-list > li').length===" + (remaining - 1)), "starter moved to trash")
    await ready()
  }
  await click(".trash-nav")
  for (let remaining = initial.fronts.length; remaining > 0; remaining--) {
    await until(() => evaluate("!!document.querySelector('.purge-front') && !document.querySelector('.purge-front').disabled"), "starter in trash")
    await click(".purge-front")
    await click(".confirm-delete")
    await until(() => evaluate("!document.querySelector('.delete-panel') && document.querySelectorAll('.purge-front').length===" + (remaining - 1)), "starter permanently deleted")
  }
  await click('[aria-label="Registro diario"]')
  await ready()
  assert.equal((await contents()).fronts.length, 0, "examples can be removed completely")
  await choose(".appearance-picker select", "classic")
  await ready()
  const create = async (name, icon) => {
    await click(".new-front")
    await until(() => evaluate("!!document.querySelector('#front-name')"), "front editor")
    await choose("#front-name", name)
    if (icon) await click('[data-icon-option="' + icon + '"]')
    await click(".editor-panel [type=submit]")
    await until(() => evaluate("!document.querySelector('#front-name')"), "saved front")
    await ready()
  }
  for (const name of ["Aprender guitarra", "Leer sin prisa", "Proyecto personal", "Curso de fotografía", "Practicar inglés"]) await create(name)
  await click(".daily-list [role=checkbox]")
  await until(() => evaluate("document.querySelector('.daily-list [role=checkbox]').getAttribute('aria-checked')==='true' && document.querySelector('.daily-list [role=checkbox]').getAttribute('aria-busy')==='false'"), "confirmed original check")
  await evaluate("window.__originalIds=[...document.querySelectorAll('.daily-list [role=checkbox]')].map(e=>e.getAttribute('aria-describedby'));window.__originalCheck=document.querySelector('.daily-list [role=checkbox]');true")
  await screenshot("classic")
  await choose(".appearance-picker select", "garden")
  await ready()
  await until(() => evaluate("!!document.querySelector('.garden-week-strip') && document.querySelectorAll('.garden-front-history').length===5"), "real garden")
  assert.equal(await evaluate("window.__signIns===1 && document.querySelector('.daily-list [role=checkbox]').getAttribute('aria-checked')==='true' && JSON.stringify(window.__originalIds)===JSON.stringify([...document.querySelectorAll('.daily-list [role=checkbox]')].map(e=>e.getAttribute('aria-describedby')))"), true, "switch retains account, front IDs and previous checks")
  for (const [name, icon] of [["Aprender guitarra", "music"], ["Leer sin prisa", "book"], ["Proyecto personal", "code"], ["Curso de fotografía", "camera"], ["Practicar inglés", "languages"]]) {
    await evaluate("[...document.querySelectorAll('.daily-list > li')].find(e=>e.querySelector('h2').textContent===" + JSON.stringify(name) + ").querySelector('.edit-front').click();true")
    await until(() => evaluate("!!document.querySelector('.front-icon-picker')"), "icon picker")
    await click('[data-icon-option="' + icon + '"]')
    if (icon === "music") {
      await screenshot("garden-icon-picker")
      await screenshot("garden-icon-picker-mobile", 390)
      await screenshot("garden-icon-picker-small", 320)
      assert.equal(await evaluate("[...document.querySelectorAll('[data-icon-option]')].every(e=>e.getBoundingClientRect().width>=44 && e.getBoundingClientRect().height>=44)"), true, "icon choices remain tappable on small screens")
    }
    await click(".editor-panel [type=submit]")
    await until(() => evaluate("!document.querySelector('#front-name')"), "icon saved")
    await ready()
    assert.equal(await evaluate("[...document.querySelectorAll('.daily-list > li')].find(e=>e.querySelector('h2').textContent===" + JSON.stringify(name) + ").querySelector('[data-front-icon]').dataset.frontIcon"), icon, "chosen icon displayed")
  }
  await screenshot("garden-desktop")

  await click(".garden-front-history")
  await until(() => evaluate("!!document.querySelector('.garden-history-panel') && document.querySelector('.garden-month-grid').getAttribute('aria-busy')==='false' && !!document.querySelector('.garden-month-grid [role=checkbox][aria-disabled=false]')"), "monthly history loaded")
  assert.equal(await evaluate("[...document.querySelectorAll('.garden-month-grid [role=checkbox]')].every(e=>/^[0-9]+$/.test(e.textContent.trim()))"), true, "calendar displays day numbers")
  if (await evaluate("!document.querySelector('.garden-month-grid [role=checkbox][aria-checked=false][aria-disabled=false]')")) {
    await click('[aria-label="Mes anterior del frente"]')
    await until(() => evaluate("!!document.querySelector('.garden-month-grid [role=checkbox][aria-checked=false][aria-disabled=false]')"), "previous month loaded")
  }
  await evaluate("window.__historyDay=[...document.querySelectorAll('.garden-month-grid [role=checkbox][aria-checked=false][aria-disabled=false]')].at(-1).dataset.day;true")
  await evaluate("[...document.querySelectorAll('.garden-month-grid [role=checkbox]')].find(e=>e.dataset.day===window.__historyDay).click();true")
  await until(() => evaluate("(() => {const e=[...document.querySelectorAll('.garden-month-grid [role=checkbox]')].find(e=>e.dataset.day===window.__historyDay);return e.getAttribute('aria-checked')==='true' && e.getAttribute('aria-disabled')==='false'})()"), "monthly correction committed")
  await screenshot("garden-calendar")
  await screenshot("garden-calendar-mobile", 390)
  await click('[aria-label="Cerrar historial"]')
  await ready()
  await screenshot("garden-mobile", 390)
  await screenshot("garden-small", 320)
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false }, sessionId)
  await evaluate("window.__focusCheck=document.querySelector('.daily-list [role=checkbox]');true")
  await click(".garden-focus-toggle")
  assert.equal(await evaluate("document.querySelector('.daily-list [role=checkbox]')===window.__focusCheck"), true, "focus keeps the existing check")
  assert.equal(await evaluate("[...document.querySelectorAll('.daily-list > li')].filter(e=>e.getClientRects().length).length"), 1, "focus really hides the other cards")
  await click(".garden-focus-bar button")
  await choose(".appearance-picker select", "classic")
  await ready()
  await click(".daily-list .edit-front")
  await choose("#front-reference", "https://example.com/guitarra")
  await click(".editor-panel [type=submit]")
  await until(() => evaluate("!document.querySelector('#front-name')"), "classic edit preserves the invisible icon")
  await ready()
  await evaluate("document.querySelectorAll('.view-nav button')[1].click();true")
  await until(() => evaluate("!!document.querySelector('.dashboard-list')"), "original dashboard")
  assert.equal(await evaluate("document.querySelector('.dashboard-list .front-title h2').textContent==='Aprender guitarra' && document.querySelector('.dashboard-list .period-count').textContent.startsWith('2 de')"), true, "original dashboard reads monthly correction from same vault")
  await choose(".appearance-picker select", "garden")
  assert.equal(await evaluate("document.querySelector('.dashboard-list [data-front-icon]').dataset.frontIcon"), "music", "classic edits preserve the chosen icon in garden dashboard")
  await screenshot("garden-dashboard")
  await click('[aria-label="Registro diario"]')
  await ready()
  await click(".daily-list .edit-front")
  await until(() => evaluate("!!document.querySelector('#front-name')"), "edit original front in garden")
  await choose("#front-reference", "https://example.com/guitarra")
  await click(".editor-panel [type=submit]")
  await until(() => evaluate("!document.querySelector('#front-name')"), "reference saved")
  await ready()
  assert.equal(await evaluate("document.querySelector('.daily-list .reference-link').href==='https://example.com/guitarra'"), true, "reference kept")
  await click(".daily-list .edit-front")
  await click(".delete-front")
  await until(() => evaluate("!document.querySelector('#front-name') && document.querySelectorAll('.daily-list > li').length===4"), "front in trash")
  await click(".trash-nav")
  await until(() => evaluate("!!document.querySelector('.restore-front')"), "recoverable trash")
  await screenshot("garden-trash")
  assert.equal(await evaluate("document.querySelector('.trash-list [data-front-icon]').dataset.frontIcon"), "music", "trash preserves the icon")
  await click(".restore-front")
  await until(() => evaluate("!document.querySelector('.restore-front')"), "restored")
  await click('[aria-label="Registro diario"]')
  await ready()
  await until(() => evaluate("document.querySelectorAll('.daily-list > li').length===5"), "all fronts returned")
  assert.equal(await evaluate("document.querySelector('.daily-list [role=checkbox]').getAttribute('aria-checked')==='true'"), true, "restore retained daily history")
  assert.equal(await evaluate("document.querySelector('.daily-list [data-front-icon]').dataset.frontIcon"), "music", "restore retained the icon")
  await create("Frente temporal para borrar", "nature")
  await evaluate("[...document.querySelectorAll('.daily-list > li')].find(e=>e.textContent.includes('Frente temporal para borrar')).querySelector('.edit-front').click();true")
  await click(".delete-front")
  await until(() => evaluate("!document.querySelector('#front-name')"), "temporary front trashed")
  await click(".trash-nav")
  await until(() => evaluate("!!document.querySelector('.purge-front')"), "permanent delete available only in trash")
  await click(".purge-front")
  await until(() => evaluate("!!document.querySelector('.delete-panel')"), "explicit deletion confirmation")
  await click(".confirm-delete")
  await until(() => evaluate("!document.querySelector('.delete-panel') && !document.querySelector('.purge-front')"), "temporary front permanently deleted")
  await click('[aria-label="Registro diario"]')
  await ready()
  await choose(".language-picker select", "en")
  await until(() => evaluate("document.documentElement.lang==='en'"), "English")
  await click(".theme-toggle")
  await until(() => evaluate("document.documentElement.dataset.theme==='dark'"), "dark theme")
  await screenshot("garden-dark-english")
  await screenshot("garden-dark-mobile", 390)
  await choose(".language-picker select", "es")
  await click(".theme-toggle")
  await click(".session-controls button")
  await until(() => evaluate("!!document.querySelector('#access-code') && !document.querySelector('.app-shell')"), "logout hides private content")
  await evaluate("Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(document.getElementById('access-code'),window.__fixtureCode);document.getElementById('access-code').dispatchEvent(new Event('input',{bubbles:true}));true")
  await click("#login-form [type=submit]")
  await ready()
  await until(() => evaluate("document.querySelectorAll('.daily-list > li').length===5"), "stored fronts survive logout")
  assert.equal(await evaluate("document.querySelector('.daily-list [role=checkbox]').getAttribute('aria-checked')==='true'"), true, "encrypted checks survive re-login")
  assert.equal(await evaluate("document.querySelector('.daily-list [data-front-icon]').dataset.frontIcon"), "music", "encrypted icons survive re-login")

  assert.equal(await evaluate("window.__rawCodeSent || window.__plainNameSent"), false, "raw code and front names never sent to Worker")
  const encrypted = await DB.prepare("SELECT ciphertext FROM encrypted_vaults").all()
  assert.equal(encrypted.results.length, 1, "one encrypted vault shared by both designs")
  assert.equal(encrypted.results.some(row => row.ciphertext.includes("Aprender guitarra")), false, "database stores ciphertext")
  assert.equal((await DB.prepare("SELECT count(*) AS n FROM fronts").first()).n, 0, "no plaintext fronts created")
  assert.deepEqual(errors, [], "no unhandled browser exceptions")
  assert.equal(await evaluate("!!document.querySelector('.onboarding-panel')"), false, "dismissed guide stays off after subsequent use")
  const beforePublic = await DB.prepare("SELECT version, ciphertext FROM encrypted_vaults").first()
  await command("Page.navigate", { url: f.url.origin + "/" }, sessionId)
  await until(() => evaluate("!!document.querySelector('.garden-landing')"), "landing stays public with a session cookie")
  await click(".garden-demo-check")
  assert.equal(await evaluate("window.__privateRequests"), 0, "remembered cookie does not trigger private reads/writes on landing")
  assert.deepEqual(await DB.prepare("SELECT version, ciphertext FROM encrypted_vaults").first(), beforePublic, "landing leaves encrypted account untouched")
  assert.deepEqual(errors, [], "no unhandled browser exceptions")
  console.log("PASS: Garden landing/default+classic, memory-only demo, real CTA, no private access with/without cookie, ES/EN/light/dark/1440/768/390/320; starter fronts, tutorial, encrypted app and previous flows. Disposable fixture only.")
} finally {
  socket?.close()
  if (browser?.exitCode === null) { browser.kill("SIGTERM"); await Promise.race([once(browser, "exit"), pause(3000)]); if (browser.exitCode === null) browser.kill("SIGKILL") }
  for (const close of cleanup.reverse()) await close()
  await rm(temporary, { recursive: true, force: true })
}
