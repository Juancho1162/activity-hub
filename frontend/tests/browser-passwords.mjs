// Installed Brave/Chromium, own disposable profile and D1. Never inspect the
// personal password manager, touch the system clipboard or print fixture codes.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fixture } from "../../backend/tests/fixture.js"

const temporary = await mkdtemp(join(tmpdir(), "activity-hub-chromium-"))
const cleanup = []
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let browser, socket
async function until(check, label) {
  const deadline = Date.now() + 20000
  do { if (await check()) return; await pause(50) } while (Date.now() < deadline)
  throw new Error(`Timed out: ${label}`)
}
try {
  const { url } = await fixture({ after: callback => cleanup.push(callback) }, { assets: true, webOrigin: null, legacy: false })
  const profile = join(temporary, "profile")
  browser = spawn("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser", [
    "--headless", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-sync",
    "--password-store=basic", "--use-mock-keychain", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank",
  ], { stdio: "ignore" })
  let launchFailed = false
  browser.once("error", () => { launchFailed = true })
  let portFile
  await until(async () => {
    if (launchFailed || browser.exitCode !== null) throw new Error("The installed Brave browser could not start its test profile")
    try { portFile = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).trim().split("\n"); return true }
    catch { return false }
  }, "isolated Chromium debugging socket")
  socket = new WebSocket(`ws://127.0.0.1:${portFile[0]}${portFile[1]}`)
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }) })
  let id = 0
  const requests = new Map()
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data), pending = requests.get(message.id)
    if (!pending) return
    requests.delete(message.id); clearTimeout(pending.timer)
    if (message.error) pending.reject(new Error("Chromium command failed"))
    else pending.resolve(message.result)
  })
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const current = ++id
    const timer = setTimeout(() => { requests.delete(current); reject(new Error(`Chromium timeout: ${method}`)) }, 20000)
    requests.set(current, { resolve, reject, timer })
    socket.send(JSON.stringify({ id: current, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
  const { targetId } = await command("Target.createTarget", { url: "about:blank" })
  const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true })
  const evaluate = async (expression, targetSession = sessionId) => {
    const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, targetSession)
    if (result.exceptionDetails) throw new Error("Chromium assertion evaluation failed")
    return result.result.value
  }
  await command("Page.enable", {}, sessionId)
  // Instrument before React captures fetch; replacing it after mount resets the auth client.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    window.__offers=[];window.__credentialReads=0;window.__rawCodeSent=false;
    const store=navigator.credentials.store, get=navigator.credentials.get, request=window.fetch;
    navigator.credentials.store=function(credential){
      window.__offers.push({native:credential instanceof PasswordCredential,id:credential.id,type:credential.type,correct:credential.password===window.__fixtureCode});
      return store.call(this,credential);
    };
    navigator.credentials.get=function(...args){window.__credentialReads++;return get.apply(this,args)};
    window.fetch=function(input,init){
      if(window.__fixtureCode && typeof init?.body==='string' && init.body.includes(window.__fixtureCode)) window.__rawCodeSent=true;
      return request.call(this,input,init);
    };
    return true;
  })()` }, sessionId)
  await command("Page.navigate", { url: url.origin + "/app/" }, sessionId)
  await until(() => evaluate("!!document.getElementById('access-code')"), "private entry form")
  // Choose through the UI in this disposable profile; never assume the Mac's language.
  const chooseLanguage = async language => {
    await evaluate(`(() => {const select=document.querySelector('.language-picker select');select.value=${JSON.stringify(language)};select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    await until(() => evaluate(`document.documentElement.lang===${JSON.stringify(language)}`), `apply ${language}`)
  }
  await chooseLanguage("es")
  await evaluate("window.__logoInput=document.getElementById('access-code');window.__logoInput.value='synthetic-autofill';window.__logoInput.focus();document.querySelector('.plant-toggle').click();true")
  await until(() => evaluate("document.querySelector('.plant-toggle').getAttribute('aria-pressed')==='false'"), "pause the plant")
  assert.equal(await evaluate("document.getElementById('access-code')===window.__logoInput && window.__logoInput.value==='synthetic-autofill' && document.activeElement===window.__logoInput && new URL(document.querySelector('.brand-mark img').src).pathname==='/plant-logo-static.svg'"), true, "pausing switches to a static image without disturbing native autofill")
  await evaluate("document.querySelector('.plant-toggle').click();true")
  await until(() => evaluate("document.querySelector('.plant-toggle').getAttribute('aria-pressed')==='true'"), "resume the plant")
  await evaluate("document.querySelector('.brand-mark img').decode().then(()=>true)")
  const { targetId: plantTarget } = await command("Target.createTarget", { url: url.origin + '/plant-logo.svg' })
  const { sessionId: plantSession } = await command("Target.attachToTarget", { targetId: plantTarget, flatten: true })
  await command("Emulation.setEmulatedMedia", { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, plantSession)
  await until(() => evaluate("!!document.querySelector('.plant') && document.getAnimations().length>0", plantSession), "the served SVG animates")
  assert.equal(await evaluate(`(async()=>{
    const animations=document.getAnimations();animations.forEach(animation=>{animation.pause();animation.currentTime=0});
    await new Promise(resolve=>requestAnimationFrame(resolve));const resting=getComputedStyle(document.querySelector('.plant')).transform;
    animations.forEach(animation=>animation.currentTime=1000);await new Promise(resolve=>requestAnimationFrame(resolve));
    return getComputedStyle(document.querySelector('.plant')).transform!==resting;
  })()`, plantSession), true, "the plant actually moves between animation frames")
  await command("Emulation.setEmulatedMedia", { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, plantSession)
  await until(() => evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches && document.getAnimations().length===0", plantSession), "reduced motion stops movement and blinking")
  await command("Target.closeTarget", { targetId: plantTarget })
  await evaluate("window.__logoInput.value='';window.__logoInput.focus();true")
  assert.equal(await evaluate("isSecureContext && typeof PasswordCredential==='function' && typeof navigator.credentials.store==='function'"), true, "real Chromium password API is available")
  await evaluate("document.querySelector('.auth-signup').click();true")
  await until(() => evaluate("!!document.getElementById('signup-code')"), "native signup password")
  assert.equal(await evaluate("Array.isArray(window.__offers)"), true, "native manager instrumentation is installed before React")
  assert.equal(await evaluate(`(() => {
    const field=document.getElementById('signup-code');window.__fixtureCode=field.value;
    return field.type==='password' && field.autocomplete==='new-password' && field.readOnly && field.form.method==='post'
      && field.form.querySelector('[autocomplete=username]').value.length===36 && window.__offers.length===0;
  })()`), true, "signup presents the fixed code without offering an unverified credential")
  await evaluate("document.getElementById('saved-code').click();true")
  await until(() => evaluate("document.querySelector('#signup-code-form [type=submit]').disabled===false"), "explicit backup acknowledgment")
  await evaluate("document.querySelector('#signup-code-form [type=submit]').click();true")
  await until(() => evaluate("!!document.querySelector('.app-shell')"), "signup sign-in without waiting for the manager")
  assert.equal(await evaluate(`fetch('/auth/session').then(r=>r.json()).then(proof=>window.__offers.length===1 && window.__offers[0].native
    && window.__offers[0].correct && window.__offers[0].type==='password' && window.__offers[0].id===proof.account_id)`), true, "real PasswordCredential reaches the native store for the verified account")
  await evaluate("document.querySelector('.session-controls button').click();true")
  await until(() => evaluate("!!document.getElementById('access-code')"), "explicit logout")
  await evaluate("document.getElementById('access-code').value='wrong-test-code';document.querySelector('#login-form [type=submit]').click();true")
  await until(() => evaluate("!!document.getElementById('auth-error')"), "rejected code")
  assert.equal(await evaluate("window.__offers.length===1"), true, "rejected codes are never offered")
  await evaluate("window.__autofilled=document.getElementById('access-code');window.__autofilled.value=window.__fixtureCode;window.__autofilled.focus();true")
  await chooseLanguage("en")
  assert.equal(await evaluate("document.getElementById('access-code')===window.__autofilled && document.activeElement===window.__autofilled && window.__autofilled.value===window.__fixtureCode && document.getElementById('auth-error').textContent.includes('Incorrect code. Check your private code and try again.')"), true, "language changes retain native autofill, input identity and focus while translating errors")
  await evaluate("document.querySelector('#login-form [type=submit]').click();true")
  await until(() => evaluate("!!document.querySelector('.app-shell')"), "native autofill without React events")
  assert.equal(await evaluate("window.__offers.length===2 && window.__offers.every(c=>c.native && c.correct && c.id===window.__offers[0].id) && window.__credentialReads===0 && !window.__rawCodeSent"), true, "explicit sign-in offers the original code without automatic retrieval or plaintext requests")
  for (const view of ["daily", "dashboard"]) {
    if (view === "dashboard") {
      await evaluate("document.querySelectorAll('.view-nav button')[1].click();true")
      await until(() => evaluate("document.querySelector('h1')?.textContent==='Dashboard' && document.querySelector('main').getAttribute('aria-busy')==='false'"), "dashboard layout")
    }
    for (const language of ["es", "en"]) for (const theme of ["light", "dark"]) {
      await chooseLanguage(language)
      await evaluate(`(() => {if(document.documentElement.dataset.theme!==${JSON.stringify(theme)})document.querySelector('.theme-toggle').click();return true})()`)
      for (const width of [320, 361, 375, 390, 428, 600, 601, 640, 768, 960, 1366]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width <= 600 }, sessionId)
      await evaluate("document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(true))))")
      assert.equal(await evaluate(`(() => {
        if(document.documentElement.scrollWidth>innerWidth)return false;
        return [...document.querySelectorAll('.view-nav,.toolbar-card,.app-controls,.page-header')].every(group=>{
          const bounds=group.getBoundingClientRect();
          const controls=[...group.querySelectorAll('button,input:not([type=hidden]),select')].filter(el=>el.checkVisibility()).map(el=>el.getBoundingClientRect());
          return controls.every((a,i)=>a.height>=43.5 && a.left>=bounds.left-.5 && a.right<=bounds.right+.5
            && controls.slice(i+1).every(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)<1 || Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<1));
        });
      })()`), true, `Chromium ${view}/${language}/${theme}/${width}: controls fit without overlap and keep touch height`)
      }
    }
  }
  console.log("Chromium/Brave: real PasswordCredential and native store invoked after verified signup/login; rejected code, native autofill, no automatic credential retrieval or plaintext code requests pass")
  console.log("Plant logo: pause/resume retains the access field and autofill, local SVG decodes and changes animation frames, reduced motion disables all movement and blinking")
  console.log("Chromium layout: both languages/themes, registration/dashboard pass at 11 widths from 320 to 1366 px; actual save-dialog visibility/acceptance remains browser controlled and is not asserted in headless mode")
} finally {
  socket?.close()
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    browser.kill("SIGTERM")
    const deadline = Date.now() + 5000
    while (browser.exitCode === null && browser.signalCode === null && Date.now() < deadline) await pause(50)
    if (browser.exitCode === null && browser.signalCode === null) { browser.kill("SIGKILL"); await once(browser, "exit") }
  }
  for (const callback of cleanup.reverse()) await callback()
  await rm(temporary, { recursive: true, force: true })
}
