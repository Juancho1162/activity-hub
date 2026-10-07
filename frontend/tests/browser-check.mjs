// Existing Firefox, own profile/ports and temporary D1; no personal data.
// React -> real workerd/D1, with normal signup, cookies, CSRF and commits.
// Random fixture codes remain in memory and are hidden in screenshots.
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { once } from "node:events"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { fixture as workerFixture } from "../../backend/tests/fixture.js"
import { browserVault } from "../../backend/tests/browser-vault.js"

const root = fileURLToPath(new URL("../../", import.meta.url))
const frontend = join(root, "frontend")
const firefox = "/Applications/Firefox.app/Contents/MacOS/firefox"
const temporary = await mkdtemp(join(tmpdir(), "activity-hub-browser-"))
const output = join(frontend, "test-results")
const profile = join(temporary, "firefox-profile")
const cleanup = []
const children = []
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function freePort() {
  const server = createServer().listen(0, "127.0.0.1")
  await once(server, "listening")
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}
function launch(command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, { cwd, env: { PATH: "/usr/bin:/bin:/opt/homebrew/bin", HOME: temporary, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] })
  child.output = ""
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { child.output = (child.output + chunk).slice(-12000) })
  children.push(child)
  return child
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill("SIGTERM")
  const deadline = Date.now() + 5000
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) await pause(50)
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await once(child, "exit") }
}
async function waitFor(check, description) {
  const deadline = Date.now() + 20000
  do { if (await check()) return; await pause(100) } while (Date.now() < deadline)
  throw new Error(`Timed out: ${description}`)
}
let socket
try {
  await mkdir(output, { recursive: true })
  await mkdir(profile)
  await writeFile(join(profile, "user.js"), [
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("browser.startup.homepage", "about:blank");',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("datareporting.healthreport.uploadEnabled", false);',
    'user_pref("toolkit.telemetry.enabled", false);',
    'user_pref("app.normandy.enabled", false);',
    'user_pref("network.captive-portal-service.enabled", false);',
  ].join("\n"))
  const bidiPort = await freePort()
  const { url } = await workerFixture({ after: callback => cleanup.push(callback) }, { assets: true, webOrigin: null, legacy: false })
  const origin = url.origin
  assert.equal((await fetch(`${origin}/health`)).status, 200, "real primary Worker/D1 ready")
  assert.equal((await fetch(`${origin}/api/fronts`)).status, 401)
  const browser = launch(firefox, ["--headless", "--no-remote", "--new-instance", "--profile", profile, "--remote-debugging-port", String(bidiPort)], root)
  await waitFor(async () => {
    try { return (await fetch(`http://127.0.0.1:${bidiPort}/`)).status > 0 } catch {
      // macOS may relaunch Firefox and exit the original launcher successfully.
      if (browser.exitCode !== null && browser.exitCode !== 0) throw new Error(`Firefox exited: ${browser.output}`)
      return false
    }
  }, "Firefox BiDi socket")
  socket = new WebSocket(`ws://127.0.0.1:${bidiPort}/session`)
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }) })
  let nextId = 0
  const requests = new Map()
  let onEvent = () => {}
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data)
    if (message.type === "event") { onEvent(message); return }
    if (!requests.has(message.id)) return
    const { resolve, reject, timer } = requests.get(message.id)
    requests.delete(message.id); clearTimeout(timer)
    if (message.type === "error") reject(new Error(`BiDi command failed: ${message.error}`))
    else resolve(message.result)
  })
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { requests.delete(id); reject(new Error(`BiDi timeout: ${method}`)) }, 20000)
    requests.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }))
  })
  await command("session.new", { capabilities: { alwaysMatch: {} } })
  await command("session.subscribe", { events: ["network.responseStarted"] })
  const { context } = await command("browsingContext.create", { type: "tab" })
  async function evaluate(expression, targetContext = context) {
    const result = await command("script.evaluate", { expression, target: { context: targetContext }, awaitPromise: true })
    if (result.type !== "success") throw new Error("Browser assertion evaluation failed")
    return result.result.value
  }
  const navigate = (targetContext = context) => command("browsingContext.navigate", { context: targetContext, url: origin, wait: "complete" })
  async function screenshot(name, width, height) {
    await command("browsingContext.activate", { context })
    await command("browsingContext.setViewport", { context, viewport: { width, height }, devicePixelRatio: 1 })
    await evaluate("document.fonts.ready.then(() => true)")
    await evaluate("Promise.all(document.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{}))).then(()=>true)")
    await pause(100)
    assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false, `${name}: horizontal overflow`)
    assert.equal(await evaluate(`(() => {
      const controls=document.querySelector('.app-controls'), toggle=controls.querySelector('.theme-toggle');
      const bounds=controls.getBoundingClientRect(), button=toggle.getBoundingClientRect();
      const rightInset=parseFloat(getComputedStyle(controls).paddingRight)+parseFloat(getComputedStyle(toggle).marginRight);
      return document.querySelectorAll('.theme-toggle').length===1 && controls.lastElementChild===toggle && Math.abs(button.right+rightInset-bounds.right)<1;
    })()`), true, `${name}: the only theme toggle stays at the top right, outside the editor`)
    assert.equal(await evaluate(`(() => {
      const brand=document.querySelector('.brand');if(!brand)return true;
      const mark=brand.querySelector('.brand-mark').getBoundingClientRect(), title=brand.querySelector('.brand-name').getBoundingClientRect();
      return Math.abs(mark.top+mark.height/2-title.top-title.height/2)<1 && title.left>=mark.right && title.right<=brand.getBoundingClientRect().right+.5
        && document.querySelector('.desk-decoration')===null && getComputedStyle(brand,'::after').backgroundImage==='none';
    })()`), true, `${name}: brand title aligns with its mark, with no desk illustration`)
    assert.equal(await evaluate(`([...document.querySelectorAll('[data-slot="bit-card"]')].filter(el=>el.checkVisibility()).every(el=>{
      const outer=el.getBoundingClientRect(), inner=el.querySelector('[data-slot="card"]').getBoundingClientRect();
      return inner.top>=outer.top-.5 && inner.bottom<=outer.bottom+.5;
    }))`), true, `${name}: card content must stay inside its pixel frame`)
    assert.equal(await evaluate(`([...document.querySelectorAll('.view-nav')].every(nav=>{
      const bounds=nav.getBoundingClientRect();
      return [...nav.querySelectorAll('button')].every(button=>{
        const rect=button.getBoundingClientRect();return rect.left>=bounds.left-.5 && rect.right<=bounds.right+.5;
      });
    }))`), true, `${name}: navigation buttons must fit their container`)
    assert.equal(await evaluate(`([...document.querySelectorAll('.app-controls,.toolbar-card,.page-header,.daily-row,.front-actions,.pagination,.editor-actions')].filter(el=>el.checkVisibility()).every(group=>{
      const bounds=group.getBoundingClientRect();
      return [...group.querySelectorAll('button,input,select,a')].filter(el=>el.checkVisibility()).every(el=>{
        const rect=el.getBoundingClientRect();return rect.left>=bounds.left-.5 && rect.right<=bounds.right+.5 && rect.height>=43.5;
      });
    }))`), true, `${name}: controls must fit their container and retain 44px touch height`)
    const signupStyle = await evaluate("document.querySelector('#signup-code')?.getAttribute('style') ?? null")
    await evaluate("(() => { const el=document.querySelector('#signup-code'); if(el){el.style.setProperty('visibility','hidden','important');el.style.setProperty('color','transparent','important');el.style.setProperty('text-shadow','none','important');el.style.setProperty('caret-color','transparent','important')} return true })()")
    try {
      const image = await command("browsingContext.captureScreenshot", { context, origin: "viewport" })
      await writeFile(join(output, `${name}.png`), Buffer.from(image.data, "base64"))
    } finally {
      await evaluate(`(() => {const el=document.querySelector('#signup-code');if(el){const previous=${JSON.stringify(signupStyle)};if(previous===null)el.removeAttribute('style');else el.setAttribute('style',previous)}return true})()`)
    }
  }
  let contrastChecks = 0
  const rowGeometryChecks = []
  const dailyGeometryChecks = []
  async function assertTextContrast(pairs) {
    const ratios = JSON.parse(await evaluate(`(() => {
      const luminance = color => {
        if (!/^rgba?\\(/.test(color)) throw new Error('Expected resolved RGB color');
        const channels=color.match(/[0-9.]+/g).map(Number);
        if (channels.length>3 && channels[3]!==1) throw new Error('Contrast fixture must be opaque');
        const linear=channels.slice(0,3).map(n=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4});
        return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
      };
      return JSON.stringify(${JSON.stringify(pairs)}.map(([text,surface])=>{
        const fg=luminance(getComputedStyle(document.querySelector(text)).color);
        const bg=luminance(getComputedStyle(document.querySelector(surface??text)).backgroundColor);
        return {text,ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)};
      }));
    })()`))
    for (const { text, ratio } of ratios) assert.ok(ratio >= 4.5, `${text}: text contrast ${ratio.toFixed(2)}:1 below 4.5:1`)
    contrastChecks += ratios.length
  }
  async function chooseTheme(value, ctx = context) {
    assert.ok(value === "light" || value === "dark")
    await evaluate(`(() => {
      if(document.querySelector('[role=dialog]')) throw new Error('Theme control is unavailable behind an open dialog');
      const toggle=document.querySelector('.app-controls .theme-toggle');
      if(document.documentElement.dataset.theme!==${JSON.stringify(value)}) toggle.click();
      return true;
    })()`, ctx)
    await waitFor(() => evaluate(`document.documentElement.dataset.theme === ${JSON.stringify(value)}`, ctx), `apply ${value} theme with one click`)
  }
  const click = (text, ctx = context) => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button) throw new Error('Button missing'); button.click(); return true })()`, ctx)
  const inputValue = (id, value, ctx = context) => evaluate(`(() => { const input = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', {bubbles:true})); return true })()`, ctx)
  const selectValue = (id, value) => evaluate(`(() => { const input = document.getElementById(${JSON.stringify(id)}); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('change', {bubbles:true})); return true })()`)
  const login = async (code, ctx = context) => { await inputValue("access-code", code, ctx); await click("Entrar", ctx) }
  const account = (ctx = context) => evaluate("fetch('/auth/session').then(r=>r.json()).then(p=>p.account_id)", ctx)
  const encrypted = browserVault({evaluate, account, origin, defaultContext:context})
  const pendingCodes = new Map()
  const api = (path, ctx = context) => encrypted.query(path, ctx)
  async function createAccount(ctx = context) {
    await click("Crear cuenta", ctx)
    await waitFor(() => evaluate("document.getElementById('signup-code') !== null", ctx), "one-time signup code")
    const code = await evaluate("document.getElementById('signup-code').value", ctx)
    assert.ok(typeof code === "string" && code.length === 39, "generated account code format")
    assert.equal(await evaluate("fetch('/auth/session').then(r => r.status)", ctx), 401, "Signup must not authenticate before saving the code")
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Entrar en mi cuenta').disabled", ctx), true)
    pendingCodes.set(ctx, code)
    return code
  }
  async function acknowledge(ctx = context) {
    await evaluate("document.getElementById('saved-code').click()", ctx)
    await click("Entrar en mi cuenta", ctx)
    await waitFor(() => evaluate("document.body.textContent.includes('No hay frentes en esta vista')", ctx), "new account starts empty")
    assert.equal(await evaluate("document.querySelector('#signup-code') === null", ctx), true)
    encrypted.remember(await account(ctx), pendingCodes.get(ctx))
  }

  async function assertDashboardRowGeometry(label) {
    const geometry = JSON.parse(await evaluate(`(() => {
      const rows=[];
      for (const card of document.querySelectorAll('.dashboard-list .front-card')) {
        const box=card.getBoundingClientRect(), title=card.querySelector('h2'), heading=title.getBoundingClientRect();
        const summary=card.querySelector('.calendar-details summary').getBoundingClientRect();
        let row=rows.find(row=>Math.abs(row.top-box.top)<.5);
        if(!row){row={top:box.top,cards:[]};rows.push(row)}
        row.cards.push({name:title.textContent,height:box.height,summary:summary.top,
          unclipped:title.scrollHeight<=title.clientHeight+1 && title.scrollWidth<=title.clientWidth+1 && heading.bottom<=box.bottom});
      }
      return JSON.stringify(rows);
    })()`))
    assert.ok(geometry.length>0, `${label}: dashboard must contain cards`)
    for (const [index, row] of geometry.entries()) {
      const heights=row.cards.map(card=>card.height), summaries=row.cards.map(card=>card.summary)
      assert.ok(Math.max(...heights)-Math.min(...heights)<.5, `${label}: row ${index+1} card heights differ: ${heights.join(', ')}px`)
      assert.ok(Math.max(...summaries)-Math.min(...summaries)<.5, `${label}: row ${index+1} collapsed calendar actions must align`)
      assert.ok(row.cards.every(card=>card.unclipped), `${label}: complete names must remain visible`)
    }
    rowGeometryChecks.push({ label, rows: geometry })
  }

  async function assertDailyGeometry(label) {
    const geometry = JSON.parse(await evaluate(`(() => {
      const cards=[...document.querySelectorAll('.daily-list .front-card')].map(card=>{
        const box=card.getBoundingClientRect(), title=card.querySelector('h2'), heading=title.getBoundingClientRect();
        const controls=[...card.querySelectorAll('button,a')].map(control=>control.getBoundingClientRect());
        return {name:title.textContent,left:box.left,right:box.right,top:box.top,width:box.width,height:box.height,
          unclipped:title.scrollHeight<=title.clientHeight+1 && title.scrollWidth<=title.clientWidth+1 && heading.bottom<=box.bottom && heading.right<=box.right,
          accessibleControls:controls.every(rect=>rect.width>=43.5 && rect.height>=43.5 && rect.left>=box.left-.5 && rect.right<=box.right+.5 && rect.top>=box.top && rect.bottom<=box.bottom)};
      });
      return JSON.stringify({viewport:innerWidth,cards});
    })()`))
    assert.ok(geometry.cards.length>0, `${label}: daily view must contain cards`)
    const rows = []
    for (const [index, card] of geometry.cards.entries()) {
      assert.ok(card.unclipped, `${label}: full name must remain visible: ${card.name}`)
      assert.ok(card.accessibleControls, `${label}: check, reference and edit must remain contained and at least 44px`)
      if (geometry.viewport>=1024) assert.ok(card.width<=600, `${label}: daily cards must not stretch across the desktop (${card.width}px)`)
      const previous=geometry.cards[index-1]
      if (previous) assert.ok(card.top>previous.top+.5 || (Math.abs(card.top-previous.top)<.5 && card.left>=previous.right), `${label}: visual order must follow DOM/keyboard order, left to right then down`)
      let row=rows.find(row=>Math.abs(row.top-card.top)<.5)
      if (!row) { row={top:card.top,cards:[]}; rows.push(row) }
      row.cards.push(card)
    }
    for (const row of rows) {
      const heights=row.cards.map(card=>card.height)
      assert.ok(Math.max(...heights)-Math.min(...heights)<.5, `${label}: cards in the same daily row must have equal heights`)
    }
    if (geometry.viewport>=1024 && geometry.cards.length>1) assert.ok(rows[0].cards.length>=2, `${label}: desktop must use multiple columns`)
    if (geometry.viewport<=600) assert.ok(rows.every(row=>row.cards.length===1), `${label}: mobile keeps a single column`)
    dailyGeometryChecks.push({label,...geometry})
  }

  async function referenceGeometry() {
    const result = {}
    for (const [view, button, selector] of [["daily", "Registro", ".activity-check[role=checkbox]"], ["dashboard", "Dashboard", ".coverage-value"]]) {
      await click(button)
      await waitFor(() => evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length===2`), `${view} reference comparison`)
      for (const theme of ["light", "dark"]) {
        await chooseTheme(theme)
        for (const width of [1366, 390, 320]) {
          await command("browsingContext.setViewport", { context, viewport: { width, height: 900 }, devicePixelRatio: 1 })
          await evaluate("document.fonts.ready.then(()=>true)")
          result[`${view}/${theme}/${width}`] = JSON.parse(await evaluate(`(() => {
            const card=[...document.querySelectorAll('.front-card')].find(el=>el.querySelector('h2').textContent==='Guitarra');
            const rect=card.getBoundingClientRect(), check=card.querySelector('[role=checkbox]')?.getBoundingClientRect(), link=card.querySelector('.reference-link')?.getBoundingClientRect();
            return JSON.stringify({height:rect.height,width:rect.width,checkWidth:check?.width,checkHeight:check?.height,linkWidth:link?.width,linkHeight:link?.height});
          })()`))
        }
      }
    }
    return result
  }

  await navigate()
  await waitFor(() => evaluate("document.activeElement?.id === 'access-code'"), "login focus")
  assert.equal(await evaluate("localStorage.getItem('activity-hub.theme')===null && document.documentElement.dataset.theme===(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')"), true, "Default follows the actual browser color preference")
  await evaluate("window.__authInput=document.getElementById('access-code')")
  for (const theme of ["light", "dark"]) {
    await chooseTheme(theme)
    assert.equal(await evaluate("document.getElementById('access-code')===window.__authInput"), true, "Theme never remounts access state")
    await screenshot(`login-${theme}-desktop`, 1366, 1000)
    await screenshot(`login-${theme}-mobile`, 390, 844)
    await assertTextContrast([[".auth-card .muted", ".auth-card [data-slot=card]"], [".auth-form [type=submit]"], ["#access-code"], [".field-help", ".auth-card [data-slot=card]"], [".theme-toggle"]])
  }
  await navigate()
  await waitFor(() => evaluate("document.querySelector('#access-code') !== null"), "reload access after visual preference")
  assert.equal(await evaluate("localStorage.getItem('activity-hub.theme')==='dark' && document.documentElement.dataset.theme==='dark'"), true, "Visual preference survives reload")
  await chooseTheme("light")
  const remoteResources = JSON.parse(await evaluate("JSON.stringify(performance.getEntriesByType('resource').map(e=>e.name).filter(url=>new URL(url).origin !== location.origin))"))
  assert.deepEqual(remoteResources, [], "No external app assets")
  await login("wrong-test-code")
  await waitFor(() => evaluate("document.body.textContent.includes('Código incorrecto')"), "wrong code denied")
  assert.equal(await evaluate("document.getElementById('access-code').value"), "")
  const codeA = await createAccount()
  for (const theme of ["light", "dark"]) {
    await chooseTheme(theme)
    assert.equal(await evaluate(`document.getElementById('signup-code').value===${JSON.stringify(codeA)}`), true, "Theme preserves the only displayed signup code")
    await screenshot(`signup-${theme}-desktop`, 1366, 1000)
    await screenshot(`signup-${theme}-mobile`, 390, 844)
    await assertTextContrast([[".code-warning"], [".permanent-code"]])
  }
  await chooseTheme("light")
  // Do not touch the user's system clipboard: exercise the failure fallback only.
  await evaluate("Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async()=>{throw new Error('Test clipboard unavailable')}}})")
  await click("Copiar")
  await waitFor(() => evaluate("document.body.textContent.includes('cópialo manualmente')"), "clipboard fallback")
  await acknowledge()
  assert.equal(await evaluate(`(async()=>{
    const icon=document.querySelector('link[rel="icon"]');
    if(!icon || icon.type!=='image/svg+xml' || new URL(icon.href).pathname!=='/favicon.svg')return false;
    const response=await fetch(icon.href);
    if(!response.ok || !response.headers.get('content-type')?.includes('image/svg+xml'))return false;
    const svg=new DOMParser().parseFromString(await response.text(),'image/svg+xml').documentElement;
    if(svg.localName!=='svg' || svg.getAttribute('viewBox')!=='0 0 32 32')return false;
    const image=new Image();image.src=icon.href;await image.decode();return image.naturalWidth===32 && image.naturalHeight===32;
  })()`), true, "The local four-square brand favicon is linked, served and decodable")
  assert.equal(await evaluate("document.querySelector('.lab-controls,.look-picker') === null && !document.body.textContent.includes('HOY SIMULADO')"), true, "No trial UI or clock was promoted")
  const accountA = await account()
  assert.equal(await evaluate("document.querySelector('.session-controls p').textContent.trim()"), `Cuenta ${accountA.slice(0, 8)}`, "Session caption only identifies the account")
  assert.equal(await evaluate("document.cookie.includes('activity_hub_session')"), false, "HttpOnly cookie")
  assert.equal(await evaluate("(async()=>{const p=await(await fetch('/auth/session')).json();return (await fetch('/api/fronts',{method:'POST',headers:{'Content-Type':'application/json','X-Activity-Account':p.account_id},body:'{}'})).status})()"), 403)
  // Seed synthetic encrypted records through the normal authenticated vault.
  const fixtureDay = await evaluate("document.getElementById('registration-day').value")
  const offsetDay = (day, offset) => new Date(Date.parse(day+'T12:00:00Z')-offset*86400000).toISOString().slice(0,10)
  await encrypted.seed([['Guitarra','open'],['Curso de arquitectura','open'],['Lectura','standby'],['Proyecto terminado','archived']].map(([name,state])=>({name,state,reference:'https://example.test/material',days:[1,3,6].map(offset=>offsetDay(fixtureDay,offset))})))
  await navigate()
  await waitFor(() => evaluate("document.querySelector('#access-code') !== null"), "reload requires decryption code")
  await login(codeA)
  await waitFor(() => evaluate("document.querySelectorAll('[role=checkbox].activity-check').length === 2"), "decrypted account A rows")
  const withReference = await referenceGeometry()
  await evaluate("document.querySelector('[aria-label=\"Editar Guitarra\"]').click()")
  await waitFor(() => evaluate("document.getElementById('front-reference')!==null"), "edit fixture reference")
  await inputValue("front-reference", "")
  await click("Guardar cambios")
  await waitFor(() => evaluate("document.querySelector('[role=dialog]')===null && document.querySelectorAll('.front-card .reference-link').length===1"), "reference removal confirmed")
  const withoutReference = await referenceGeometry()
  for (const [name, before] of Object.entries(withReference)) {
    const after = withoutReference[name]
    assert.ok(Math.abs(before.height-after.height)<.5, `${name}: reference must not enlarge card (${before.height} vs ${after.height}px)`)
    assert.equal(before.width, after.width, `${name}: reference preserves width`)
    assert.ok(before.linkWidth>=44 && before.linkHeight>=44, `${name}: reference retains its touch area`)
    if (name.startsWith("daily/")) {
      assert.equal(before.checkWidth, after.checkWidth)
      assert.equal(before.checkHeight, after.checkHeight)
      assert.ok(after.checkWidth>=44 && after.checkHeight>=44, `${name}: check retains its touch area`)
      assert.ok(after.height<=80, `${name}: a short-name daily row stays compact (${after.height}px)`)
    }
  }
  // Restoring even a long URL must not introduce a new text line or a fake check.
  await evaluate("document.querySelector('[aria-label=\"Editar Guitarra\"]').click()")
  await waitFor(() => evaluate("document.getElementById('front-reference')!==null"), "restore reference")
  await inputValue("front-reference", `https://example.test/${"material".repeat(100)}`)
  await click("Guardar cambios")
  await waitFor(() => evaluate("document.querySelector('[role=dialog]')===null && document.querySelectorAll('.front-card .reference-link').length===2"), "long reference confirmed")
  assert.equal(await evaluate("document.querySelector('.main-feedback').textContent.trim()"), "", "Successful edit does not show a confirmation popup")
  const restoredReference = await referenceGeometry()
  for (const [name, dimensions] of Object.entries(restoredReference)) assert.ok(Math.abs(dimensions.height-withoutReference[name].height)<.5, `${name}: long reference preserves card height`)
  await click("Registro")
  await waitFor(() => evaluate("document.querySelectorAll('[role=checkbox].activity-check').length===2"), "daily view after reference comparisons")
  assert.equal(await evaluate("[...document.querySelectorAll('[role=checkbox].activity-check')].every(el=>el.getAttribute('aria-checked')==='false')"), true, "Reference edits never register activity")
  for (const theme of ["dark", "light"]) {
    await chooseTheme(theme)
    for (const width of [1920, 1684, 1366, 1024, 768, 390, 320]) {
      await evaluate("window.scrollTo(0,0)")
      await screenshot(`daily-compact-${theme}-${width}`, width, 900)
      await assertDailyGeometry(`two/${theme}/${width}`)
    }
  }
  // A single search result keeps the same card scale instead of filling the row.
  await inputValue("name-search", "Guitarra")
  await waitFor(() => evaluate("document.querySelectorAll('.daily-list .front-card').length===1"), "single daily result")
  for (const width of [1920, 1366, 390]) {
    await screenshot(`daily-single-${width}`, width, 900)
    await assertDailyGeometry(`single/${width}`)
  }
  await inputValue("name-search", "")
  await waitFor(() => evaluate("document.querySelectorAll('.daily-list .front-card').length===2"), "restore daily results")
  await screenshot("daily-desktop", 1366, 1000)
  await screenshot("daily-mobile", 390, 844)
  await evaluate("document.querySelector('.front-card').scrollIntoView({block:'start'})")
  await screenshot("daily-mobile-rows", 390, 844)
  // Hold the re-read after a REAL check commit: the list must not collapse and
  // reset the browser scroll/focus while it waits for the refreshed snapshot.
  const dailyReadUrl = `${origin}/api/vault`
  const checkUrl = dailyReadUrl
  let heldRefreshRequest = null
  let heldCheckRequest = null
  let holdPostWriteRead = false
  onEvent = ({ method, params }) => {
    if (method === "network.responseStarted" && params.context === context && params.request.method === "GET" && params.request.url === dailyReadUrl && params.isBlocked) {
      if (holdPostWriteRead) heldRefreshRequest = params.request.request
      else void command("network.continueResponse", {request:params.request.request})
    }
    if (method === "network.responseStarted" && params.context === context && params.request.method === "PUT" && params.request.url === checkUrl && params.isBlocked) heldCheckRequest = params.request.request
  }
  const heldRefresh = await command("network.addIntercept", { contexts: [context], phases: ["responseStarted"], urlPatterns: [{ type: "string", pattern: dailyReadUrl }] })
  const beforeCheck = JSON.parse(await evaluate(`(() => {
    window.__checkTarget=document.querySelector('[role=checkbox].activity-check');
    window.__checkTarget.focus({preventScroll:true});
    return JSON.stringify({scroll:scrollY,top:window.__checkTarget.getBoundingClientRect().top});
  })()`))
  const otherControlAppearance = async () => JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.activity-check[role=checkbox], .edit-front, .new-front, .session-controls button')].filter(el=>el!==window.__checkTarget).map(el=>{
    const style=getComputedStyle(el);return {label:el.getAttribute('aria-label')??el.textContent.trim(),opacity:style.opacity,color:style.color,background:style.backgroundColor};
  }))`))
  const stableControls = await otherControlAppearance()
  assert.equal(await evaluate("getComputedStyle(window.__checkTarget).cursor"), "pointer")
  await evaluate("window.__checkTarget.click()")
  await waitFor(async () => heldCheckRequest !== null, "hold real check response")
  assert.equal(await evaluate("getComputedStyle(window.__checkTarget).cursor"), "pointer", "Check cursor remains stable while sending")
  assert.deepEqual(await otherControlAppearance(), stableControls, "Sending one check must not flash unrelated controls")
  assert.equal(await evaluate("document.querySelector('.main-feedback').textContent.trim()"), "", "Sending a check must not show a progress popup")
  assert.equal(await evaluate("window.__checkTarget.getAttribute('aria-checked')"), "false", "No optimistic check before the response")
  holdPostWriteRead = true
  await command("network.continueResponse", { request: heldCheckRequest })
  await waitFor(async () => heldRefreshRequest !== null, "hold read after confirmed check")
  assert.equal(await evaluate("getComputedStyle(window.__checkTarget).cursor"), "pointer", "Check cursor remains stable during the confirmed refresh")
  assert.deepEqual(await otherControlAppearance(), stableControls, "Refreshing after a check must not flash unrelated controls")
  const duringCheck = JSON.parse(await evaluate("JSON.stringify({connected:window.__checkTarget.isConnected,scroll:scrollY,top:window.__checkTarget.getBoundingClientRect().top})"))
  assert.equal(duringCheck.connected, true, `Check refresh removed its DOM node; scroll ${beforeCheck.scroll} -> ${duringCheck.scroll}`)
  assert.ok(Math.abs(duringCheck.top-beforeCheck.top)<8, `A confirmed refresh must keep the clicked front in place: top ${beforeCheck.top} -> ${duringCheck.top}, scroll ${beforeCheck.scroll} -> ${duringCheck.scroll}`)
  await command("network.continueResponse", { request: heldRefreshRequest })
  await command("network.removeIntercept", { intercept: heldRefresh.intercept })
  onEvent = () => {}
  await waitFor(() => evaluate("document.querySelector('[role=checkbox].activity-check')?.getAttribute('aria-checked') === 'true'"), "HTTP check confirmation")
  assert.deepEqual(await otherControlAppearance(), stableControls, "Confirmed check leaves unrelated controls unchanged")
  assert.equal(await evaluate("document.querySelector('.main-feedback').textContent.trim()"), "", "Confirmed check updates the row without a confirmation popup")
  assert.equal(await evaluate("window.__checkTarget===document.querySelector('[role=checkbox].activity-check') && document.activeElement===window.__checkTarget"), true, "Confirmed check preserves its DOM node and keyboard focus")
  assert.ok(Math.abs(await evaluate("window.__checkTarget.getBoundingClientRect().top")-beforeCheck.top)<8, "Confirmed read must not scroll back to the header")
  await click("Dashboard")
  await waitFor(() => evaluate("document.querySelectorAll('.coverage-value').length === 2"), "compact dashboard")
  assert.deepEqual(JSON.parse(await evaluate("JSON.stringify([...document.querySelectorAll('.coverage-value')].map(el=>el.getAttribute('aria-label')))")), ["14,3 % de los días seleccionados", "10,7 % de los días seleccionados"])
  assert.equal(await evaluate("[...document.querySelectorAll('.calendar-details')].every(el=>!el.open)"), true, "Calendars start collapsed")
  assert.equal(await evaluate("document.querySelector('.calendar-grid').checkVisibility()"), false, "Closed calendar is not rendered")
  await evaluate("window.scrollTo(0,0)")
  await screenshot("dashboard-desktop", 1366, 1000)
  await screenshot("dashboard-mobile", 390, 844)
  await evaluate("document.querySelector('.front-card').scrollIntoView({block:'start'})")
  await screenshot("dashboard-mobile-rows", 390, 844)
  // Native summary supports keyboard activation, visible focus and independent cards.
  await evaluate("document.querySelector('.calendar-details summary').focus()")
  const key = (value) => command("input.performActions", { context, actions: [{ type: "key", id: "dashboard-keys", actions: [{ type: "keyDown", value }, { type: "keyUp", value }] }] })
  await key("\uE007")
  assert.equal(await evaluate("document.querySelector('.calendar-details').open"), true, "Enter expands the focused calendar")
  assert.equal(await evaluate("document.querySelectorAll('.calendar-details')[1].open"), false, "Only the chosen front expands")
  assert.equal(await evaluate("document.querySelector('.calendar-grid').checkVisibility() && document.querySelectorAll('.calendar-details')[0].querySelectorAll('.calendar-tile').length === 28"), true)
  assert.notEqual(await evaluate("getComputedStyle(document.activeElement).outlineStyle"), "none", "Keyboard focus remains visible")
  await command("browsingContext.setViewport", { context, viewport: { width: 1366, height: 1000 }, devicePixelRatio: 1 })
  await assertTextContrast([
    [".brand-name", ".sidebar"], [".sidebar-note", ".sidebar"], [".nav-button[aria-current]"], [".new-front"],
    [".coverage-value", ".front-card [data-slot=card]"], [".coverage-value > span", ".front-card [data-slot=card]"],
    [".period-count", ".front-card [data-slot=card]"], [".reference-link", ".front-card [data-slot=card]"],
    [".calendar-details summary", ".front-card [data-slot=card]"], [".calendar-tile.is-marked"], [".calendar-tile:not(.is-marked)"],
  ])
  await evaluate("window.scrollTo(0,0)")
  await screenshot("dashboard-expanded-desktop", 1366, 1000)
  await screenshot("dashboard-tablet", 1024, 900)
  await evaluate("document.querySelector('.front-card').scrollIntoView({block:'start'})")
  await screenshot("dashboard-expanded-mobile", 390, 844)
  await screenshot("dashboard-narrow", 320, 780)
  await evaluate("document.querySelector('.calendar-details summary').focus()")
  await key(" ")
  assert.equal(await evaluate("document.querySelector('.calendar-details').open"), false, "Space collapses the same calendar")
  const periodStart = await evaluate("document.getElementById('period-start').value")
  const periodEnd = await evaluate("document.getElementById('period-end').value")
  await inputValue("period-start", periodEnd)
  await waitFor(() => evaluate("document.querySelector('.coverage-value')?.getAttribute('aria-label') === '100 % de los días seleccionados'"), "single-day percentage uses an inclusive denominator")
  assert.equal(await evaluate("document.querySelectorAll('.coverage-value')[1].getAttribute('aria-label')"), "0 % de los días seleccionados")
  assert.equal(await evaluate("[...document.querySelectorAll('.calendar-details')].every(el=>!el.open)"), true)
  await inputValue("period-start", periodStart)
  await waitFor(() => evaluate("document.querySelector('.coverage-value')?.getAttribute('aria-label') === '14,3 % de los días seleccionados'"), "period restored")
  await evaluate("window.scrollTo(0,0)")
  await screenshot("dashboard-narrow-collapsed", 320, 780)
  const { context: otherTab } = await command("browsingContext.create", { type: "tab" })
  await navigate(otherTab)
  await waitFor(() => evaluate("document.querySelector('#access-code') !== null", otherTab), "new tab requires decryption code")
  await login(codeA, otherTab)
  await waitFor(() => evaluate("document.querySelector('.app-shell') !== null", otherTab), "second tab resumes A for theme changes")
  await click("Nuevo frente")
  await waitFor(() => evaluate("document.activeElement?.id === 'front-name'"), "editor focus")
  await inputValue("front-name", "Frente de prueba del navegador")
  for (const theme of ["dark", "light"]) {
    await chooseTheme(theme, otherTab)
    await waitFor(() => evaluate(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`), "open editor follows the other tab's theme")
    assert.equal(await evaluate("document.getElementById('front-name').value"), "Frente de prueba del navegador")
    await screenshot(`editor-${theme}-mobile`, 390, 844)
    await assertTextContrast([[".editor-header .muted", ".editor-card [data-slot=card]"], ["#front-name"], [".editor-actions [type=submit]"]])
  }
  await inputValue("front-reference", "https://EXAMPLE.test:443")
  await click("Crear frente")
  await waitFor(() => evaluate("document.querySelector('[role=dialog]') === null && document.body.textContent.includes('Frente de prueba del navegador')"), "confirmed creation")
  await evaluate(`document.querySelector('[aria-label="Editar Frente de prueba del navegador"]').click()`)
  await waitFor(() => evaluate("document.activeElement?.id === 'front-name'"), "edit focus")
  await inputValue("front-name", "Frente editado del navegador")
  await inputValue("front-reference", "")
  await selectValue("front-state", "archived")
  await click("Guardar cambios")
  await waitFor(() => evaluate("document.querySelector('[role=dialog]') === null && document.querySelector('.front-card') !== null && !document.body.textContent.includes('Frente de prueba del navegador')"), "confirmed edit")
  await selectValue("state-filter", "archived")
  await waitFor(() => evaluate("document.body.textContent.includes('Frente editado del navegador')"), "archived edited front")
  const stored = (await api("/api/fronts?states=archived&search=Frente%20editado%20del%20navegador")).body
  assert.equal(stored.items.length, 1)
  assert.equal(stored.items[0].reference, null)
  assert.equal(stored.items[0].state, "archived")

  // A later-created leader must move ahead of the FIRST page, not just sort
  // within page two. Standby fixtures keep the existing daily/open checks intact.
  const topics=['Guitarra','Lectura técnica','Inglés','Diseño de interfaces','Fotografía','Estadística','Python','Escritura','Arquitectura','Bases de datos','Piano','Dibujo','Francés','Matemáticas','Historia','React','Cocina','Edición de vídeo','Redes','Tipografía','Electrónica','Documentación de '+ 'X'.repeat(160),'Laboratorio de interfaces y tipografía']
  const orderedNames = topics.map((topic,index)=>'Orden '+String(index+1).padStart(2,'0')+' · '+topic)
  await encrypted.seed(orderedNames.map((name,index)=>({name,state:'standby',reference:null,days:(index===0?[0]:index===22?[1,2,3,4,5,6]:Array.from({length:(index+1)%5},(_,j)=>8+j)).map(offset=>offsetDay(periodEnd,offset))})))
  await selectValue("state-filter", "standby")
  await inputValue("name-search", "Orden ")
  await waitFor(() => evaluate(`document.querySelectorAll('.front-card h2').length===20 && document.querySelector('.front-card h2').textContent===${JSON.stringify(orderedNames[22])}`), "later-created highest percentage reaches first filtered page")
  await evaluate("document.querySelector('[aria-label=\"Página siguiente\"]').click()")
  await waitFor(() => evaluate("document.querySelectorAll('.front-card h2').length===3 && document.body.textContent.includes('Página 2 de 2')"), "remaining ordered fronts on second page")
  assert.equal(await evaluate(`document.querySelector('.front-list').textContent.includes(${JSON.stringify(orderedNames[22])})`), false)
  await inputValue("period-start", periodEnd)
  await waitFor(() => evaluate(`document.querySelector('.front-card h2')?.textContent===${JSON.stringify(orderedNames[0])} && document.querySelector('.coverage-value').getAttribute('aria-label')==='100 % de los días seleccionados' && document.body.textContent.includes('Página 1 de 2')`), "period change recomputes global order and resets page")
  await inputValue("period-start", periodStart)
  await selectValue("state-filter", "all")
  await inputValue("name-search", "")
  await waitFor(() => evaluate("document.querySelectorAll('.front-card h2').length===20 && document.querySelector('.state-open')!==null && document.querySelector('.state-archived')!==null"), "all filtered states for theme/layout checks")
  await evaluate("window.__themeFirstCard=document.querySelector('.front-card');performance.clearResourceTimings()")
  for (const theme of ["light", "dark"]) {
    await chooseTheme(theme)
    assert.equal(await evaluate("document.querySelector('.front-card')===window.__themeFirstCard"), true, "Theme preserves mounted rows")
    for (const [width, height] of [[1920,1080],[1684,1000],[1366,1000],[1024,900],[768,900],[390,844],[320,780]]) {
      await evaluate("window.scrollTo(0,0)")
      await screenshot(`dashboard-${theme}-${width}`, width, height)
      await assertDashboardRowGeometry(`${theme}/${width}`)
      const columns = await evaluate("getComputedStyle(document.querySelector('.dashboard-list')).gridTemplateColumns.split(' ').length")
      if (width === 1920) {
        assert.ok(columns>=4, "Wide desktop uses at least four dashboard columns when fronts exist")
        assert.equal(await evaluate("document.querySelector('.app-shell').getBoundingClientRect().width >= innerWidth*.97"), true, "Desktop is not constrained to the old 1440px cap")
      }
      if (width === 1024 || width === 768) assert.ok(columns>=2, "Intermediate widths retain two useful columns")
      if (width<=390) assert.equal(columns, 1)
    }
    await command("browsingContext.setViewport", { context, viewport: { width: 1366, height: 1000 }, devicePixelRatio: 1 })
    await evaluate("document.querySelector('.calendar-details summary').focus()")
    await key("\uE007")
    assert.equal(await evaluate("document.querySelector('.calendar-details').open"), true)
    assert.notEqual(await evaluate("getComputedStyle(document.activeElement).outlineStyle"), "none")
    await assertTextContrast([
      [".brand-name", ".sidebar"], [".sidebar-note", ".sidebar"], [".nav-button[aria-current]"], [".new-front"],
      [".front-title h2", ".front-card [data-slot=card]"], [".coverage-value", ".front-card [data-slot=card]"], [".coverage-value > span", ".front-card [data-slot=card]"],
      [".period-count", ".front-card [data-slot=card]"], [".reference-link", ".front-card [data-slot=card]"],
      [".calendar-details summary", ".front-card [data-slot=card]"], [".calendar-tile.is-marked"], [".calendar-tile:not(.is-marked)"],
      [".state-open"], [".state-standby"], [".state-archived"], ["#period-start"], ["#state-filter"], [".app-controls .theme-toggle"],
      [".session-controls p", ".app-controls"],
    ])
    await evaluate("document.querySelector('.front-card').scrollIntoView({block:'start'})")
    await screenshot(`calendar-${theme}-390`, 390, 844)
    await evaluate("document.querySelector('.calendar-details summary').focus()")
    await key(" ")
    assert.equal(await evaluate("document.querySelector('.calendar-details').open"), false)
  }
  assert.equal(await evaluate("performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname.startsWith('/api/')).length"), 0, "Theme/layout/calendar changes make no activity reads or writes")
  await chooseTheme("light")

  // Exercise the responsive daily grid with full pages, then long names on page two.
  await click("Registro")
  await waitFor(() => evaluate("document.querySelectorAll('.daily-list .front-card').length===20"), "full daily page")
  const dailyOrder=JSON.parse(await evaluate("JSON.stringify([...document.querySelectorAll('.daily-list h2')].map(el=>el.textContent))"))
  await evaluate("window.__dailyFirst=document.querySelector('.daily-list .front-card');performance.clearResourceTimings()")
  for (const theme of ["light", "dark"]) {
    await chooseTheme(theme)
    for (const width of [1920, 1684, 1366, 1024, 768, 390, 320]) {
      await evaluate("window.scrollTo(0,0)")
      await screenshot(`daily-grid-${theme}-${width}`, width, 900)
      await assertDailyGeometry(`many/${theme}/${width}`)
      assert.equal(await evaluate("document.querySelector('.daily-list .front-card')===window.__dailyFirst"), true, "Resizing and themes preserve daily card DOM")
      assert.deepEqual(JSON.parse(await evaluate("JSON.stringify([...document.querySelectorAll('.daily-list h2')].map(el=>el.textContent))")), dailyOrder)
    }
  }
  assert.equal(await evaluate("performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname.startsWith('/api/')).length"), 0, "Daily resizing and themes do not request activity")
  await command("browsingContext.setViewport", { context, viewport: { width: 1366, height: 1000 }, devicePixelRatio: 1 })
  await evaluate("window.__gridCheck=document.querySelectorAll('.daily-list .activity-check')[3];window.__gridCheck.scrollIntoView({block:'center'});window.__gridCheck.focus({preventScroll:true})")
  const gridPosition=JSON.parse(await evaluate("JSON.stringify({top:window.__gridCheck.getBoundingClientRect().top,left:window.__gridCheck.getBoundingClientRect().left,marked:window.__gridCheck.getAttribute('aria-checked')})"))
  for (const marked of [gridPosition.marked==="true"?"false":"true", gridPosition.marked]) {
    await key(" ")
    await waitFor(() => evaluate(`window.__gridCheck.getAttribute('aria-checked')===${JSON.stringify(marked)} && window.__gridCheck.getAttribute('aria-disabled')==='false'`), "keyboard check confirmed in desktop grid")
    assert.equal(await evaluate("document.querySelectorAll('.daily-list .activity-check')[3]===window.__gridCheck && document.activeElement===window.__gridCheck"), true, "Grid writes preserve node and keyboard focus")
    const position=JSON.parse(await evaluate("JSON.stringify({top:window.__gridCheck.getBoundingClientRect().top,left:window.__gridCheck.getBoundingClientRect().left})"))
    assert.ok(Math.abs(position.top-gridPosition.top)<1 && Math.abs(position.left-gridPosition.left)<1, "Grid writes preserve the check position")
    assert.deepEqual(JSON.parse(await evaluate("JSON.stringify([...document.querySelectorAll('.daily-list h2')].map(el=>el.textContent))")), dailyOrder, "Marking never reorders daily cards")
  }
  await evaluate("document.querySelector('[aria-label=\"Página siguiente\"]').click()")
  await waitFor(() => evaluate(`document.querySelector('.daily-list')?.textContent.includes(${JSON.stringify(orderedNames[21])})`), "second daily page includes the unbroken long name")
  for (const theme of ["light", "dark"]) {
    await chooseTheme(theme)
    for (const width of [1366, 390, 320]) {
      await evaluate("window.scrollTo(0,0)")
      await screenshot(`daily-long-${theme}-${width}`, width, 900)
      await assertDailyGeometry(`long/${theme}/${width}`)
    }
  }
  await click("Dashboard")
  await waitFor(() => evaluate("document.querySelectorAll('.coverage-value').length===20"), "restore dashboard after daily layout checks")
  await chooseTheme("light")

  // A held destination read must retain the entire source view and viewport,
  // then replace it atomically. Exercise real encryption/D1 in both directions.
  let heldNavigation = null
  onEvent = ({method,params}) => {
    if (method === "network.responseStarted" && params.context === context && params.isBlocked) {
      if (params.request.method === "GET") heldNavigation = params.request.request
      else void command("network.continueResponse", {request:params.request.request})
    }
  }
  const navigationIntercept = await command("network.addIntercept", {contexts:[context],phases:["responseStarted"],urlPatterns:[{type:"string",pattern:`${origin}/api/vault`}]})
  for (const theme of ["light","dark"]) {
    await chooseTheme(theme)
    for (const width of [1366,390,320]) {
      await command("browsingContext.setViewport", {context,viewport:{width,height:900},devicePixelRatio:1})
      for (const [button,heading,selector,index] of [["Registro","Registro diario",".daily-list",0],["Dashboard","Dashboard",".dashboard-list",1]]) {
        await evaluate(`document.querySelectorAll('.view-nav button')[${index}].focus({preventScroll:true});window.scrollTo(0,350);window.__navigationCard=document.querySelector('.front-card')`)
        const before = JSON.parse(await evaluate("JSON.stringify({scroll:scrollY,height:document.documentElement.scrollHeight,heading:document.querySelector('h1').textContent})"))
        heldNavigation = null
        await click(button)
        await waitFor(() => heldNavigation !== null, "hold navigation response")
        await pause(150)
        const during = JSON.parse(await evaluate("JSON.stringify({scroll:scrollY,height:document.documentElement.scrollHeight,heading:document.querySelector('h1').textContent})"))
        assert.deepEqual(during,before, `${theme}/${width}/${button}: destination loading preserves source geometry and dates`)
        assert.equal(await evaluate("document.querySelector('.front-card')===window.__navigationCard && window.__navigationCard.isConnected && document.querySelector('.main-content').inert && document.querySelector('.front-list').getAttribute('aria-busy')==='true' && !document.querySelector('.loading-message')"), true, "Navigation never collapses into a loading card or permits stale checks")
        assert.equal(await evaluate("document.activeElement.closest('.view-nav')!==null"), true, "Navigation retains keyboard focus")
        await screenshot(`navigation-${theme}-${width}-${button.toLowerCase()}`,width,900)
        await command("network.continueResponse", {request:heldNavigation})
        await waitFor(() => evaluate(`document.querySelector(${JSON.stringify(selector)})!==null && !document.querySelector('.main-content').inert`), "destination snapshot")
        await evaluate("Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))).then(()=>true)")
        assert.equal(await evaluate("document.querySelector('h1').textContent"), heading)
        assert.ok(Math.abs(await evaluate("scrollY")-before.scroll)<1, "Navigation avoids an intermediate scroll reset")
        assert.equal(await evaluate("document.activeElement.closest('.view-nav')!==null"), true, "Loaded view preserves navigation focus")
      }
    }
  }
  await command("network.removeIntercept", navigationIntercept)
  onEvent = () => {}
  await chooseTheme("light")

  // A second tab shares cookies; create B there and check the old A tab's gate.
  await click("Nuevo frente")
  await waitFor(() => evaluate("document.activeElement?.id === 'front-name'"), "A draft before account switch")
  await inputValue("front-name", "Borrador exclusivo de A")
  await navigate(otherTab)
  await waitFor(() => evaluate("document.querySelector('#access-code') !== null", otherTab), "reloaded tab needs its key")
  await login(codeA, otherTab)
  try {
    await waitFor(() => evaluate("document.querySelector('.app-shell') !== null", otherTab), "second tab resumes A")
  } catch (error) {
    console.log("Second-tab diagnostic", await evaluate(`(async()=>JSON.stringify({
      sessionStatus:(await fetch('/auth/session')).status,
      ready:document.readyState,login:!!document.querySelector('#access-code'),
      change:!!document.querySelector('#continue-account'),
      scripts:document.scripts.length,bodyLength:document.body.textContent.length,
      rootChildren:document.querySelector('#root')?.childElementCount,
      resourceErrors:performance.getEntriesByType('resource').filter(e=>e.responseStatus>=400).map(e=>({path:new URL(e.name).pathname,status:e.responseStatus}))
    }))()`, otherTab))
    throw error
  }
  await chooseTheme("dark", otherTab)
  await waitFor(() => evaluate("document.documentElement.dataset.theme==='dark' && document.querySelector('#front-name')?.value==='Borrador exclusivo de A'"), "cross-tab visual preference preserves the open draft")
  await chooseTheme("light", otherTab)
  await waitFor(() => evaluate("document.documentElement.dataset.theme==='light'"), "cross-tab visual preference restores light")
  await click("Cerrar sesión", otherTab)
  await waitFor(() => evaluate("document.querySelector('#access-code') !== null", otherTab), "other tab logout")
  const codeB = await createAccount(otherTab)
  await acknowledge(otherTab)
  const accountB = await account(otherTab)
  assert.notEqual(accountA, accountB)
  assert.equal((await api(`/api/fronts/${stored.items[0].id}`, otherTab)).status, 404)
  await evaluate("window.dispatchEvent(new Event('focus'))")
  await waitFor(() => evaluate("document.querySelector('#access-code') !== null && document.querySelector('[role=dialog]') === null"), "A tab hides its draft and requires B key")
  await login(codeB)
  await waitFor(() => evaluate("document.body.textContent.includes('No hay frentes en esta vista')"), "explicitly continue into B, without A data")
  assert.equal(await evaluate("document.body.textContent.includes('Borrador exclusivo de A')"), false)
  await click("Cerrar sesión")
  await waitFor(() => evaluate("document.querySelector('#access-code') !== null"), "leave B")
  await login(codeA)
  await waitFor(() => evaluate("document.querySelectorAll('[role=checkbox].activity-check').length === 2"), "return to A with the SAME permanent code")
  assert.equal(await account(), accountA)

  // Fail exactly the HTTP response AFTER the server committed a real creation.
  const encryptedWrites = []
  let blockedRequest = null
  onEvent = ({ method, params }) => {
    if (method === "network.responseStarted" && params.context === context && params.isBlocked && params.request.method === "GET") { void command("network.continueResponse", {request:params.request.request}); return }
    if (method !== "network.responseStarted" || params.context !== context || params.request.method !== "PUT" || params.request.url !== `${origin}/api/vault`) return
    encryptedWrites.push(params.request.request)
    if (params.isBlocked) blockedRequest = params.request.request
  }
  const { intercept } = await command("network.addIntercept", { contexts: [context], phases: ["responseStarted"], urlPatterns: [{ type: "string", pattern: `${origin}/api/vault` }] })
  await click("Nuevo frente")
  await waitFor(() => evaluate("document.activeElement?.id === 'front-name'"), "pending create editor")
  await inputValue("front-name", "Solicitud pendiente de A")
  await click("Crear frente")
  await waitFor(async () => blockedRequest !== null, "intercept committed response")
  await command("network.failRequest", { request: blockedRequest })
  await command("network.removeIntercept", { intercept })
  await waitFor(() => evaluate("document.body.textContent.includes('Solicitud sin confirmar')"), "real network uncertainty")
  assert.equal((await api("/api/fronts?search=Solicitud%20pendiente%20de%20A")).body.total, 1, "The first attempt already committed")
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Cerrar sesión').disabled"), true)
  for (const theme of ["dark", "light"]) {
    await chooseTheme(theme, otherTab)
    await waitFor(() => evaluate(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`), "pending editor follows the other tab's theme")
    assert.equal(await evaluate("document.getElementById('front-name').value==='Solicitud pendiente de A' && document.getElementById('front-name').disabled && document.body.textContent.includes('Solicitud sin confirmar')"), true, "Theme cannot discard or unlock an uncertain request")
    assert.equal(encryptedWrites.length, 1, "Theme never retries a mutation")
    await screenshot(`pending-${theme}-mobile`, 390, 844)
  }
  await navigate(otherTab)
  await waitFor(() => evaluate("document.querySelector('#access-code') !== null", otherTab), "new tab requires decryption code")
  await login(codeA, otherTab)
  await waitFor(() => evaluate("document.querySelector('.app-shell') !== null", otherTab), "other tab resumes current A")
  await click("Cerrar sesión", otherTab)
  await waitFor(() => evaluate("document.querySelector('#access-code') !== null", otherTab), "invalidate A session from another tab")
  await login(codeB, otherTab)
  await waitFor(() => evaluate("document.body.textContent.includes('No hay frentes en esta vista')", otherTab), "B still empty")
  await evaluate("window.dispatchEvent(new Event('focus'))")
  await waitFor(() => evaluate("document.querySelector('#access-code') !== null && document.querySelector('[role=dialog]') === null"), "pending A stays locked under B cookie")
  await login(codeB) // Valid B login must still NOT consume A's pending intent.
  await waitFor(() => evaluate("document.querySelector('#access-code')?.disabled === false && document.body.textContent.includes('cuenta original')"), "wrong account cannot unlock pending A after login completes")
  const bPage = await api("/api/fronts")
  assert.equal(bPage.status, 200)
  assert.equal(bPage.body.total, 0)
  await login(codeA)
  await waitFor(() => evaluate("document.querySelector('#front-name')?.value === 'Solicitud pendiente de A'"), "same-account reauthentication restores frozen intent")
  await click("Reintentar solicitud")
  await waitFor(() => evaluate("document.querySelector('[role=dialog]') === null && document.body.textContent.includes('Solicitud pendiente de A')"), "explicit retry confirmed")
  assert.equal((await api("/api/fronts?search=Solicitud%20pendiente%20de%20A")).body.total, 1, "Retry must not duplicate the committed front")
  assert.equal(encryptedWrites.length, 1, "Encrypted original replay survives B and reauthentication without a duplicate write")
  assert.equal(await account(), accountA)
  assert.equal(await evaluate("sessionStorage.length===0 && localStorage.length===1 && ['light','dark','system'].includes(localStorage.getItem('activity-hub.theme'))"), true, "Only a whitelisted visual preference is persisted; never codes, drafts or activity")
  for (const path of ["/auth/reset", "/auth/recover", "/auth/rotate"]) {
    assert.equal(await evaluate(`fetch(${JSON.stringify(path)},{method:'POST'}).then(r=>r.status)`), 404)
  }
  // Hold A's logout headers, replace the cookie with B, then deliver old A's
  // response. It must not erase B's replacement cookie or revoke B's session.
  let delayedLogout = null
  onEvent = ({ method, params }) => {
    if (method === "network.responseStarted" && params.context === context
      && params.request.url === `${origin}/auth/logout` && params.isBlocked) delayedLogout = params.request.request
  }
  const heldLogout = await command("network.addIntercept", { contexts: [context], phases: ["responseStarted"], urlPatterns: [{ type: "string", pattern: `${origin}/auth/logout` }] })
  await click("Cerrar sesión")
  await waitFor(async () => delayedLogout !== null, "hold A logout before header delivery")
  assert.equal(await evaluate("fetch('/auth/session').then(r=>r.status)", otherTab), 401, "A's captured session is already revoked")
  await navigate(otherTab)
  await waitFor(() => evaluate("document.querySelector('#access-code') !== null", otherTab), "B tab can log in while A logout is delayed")
  await login(codeB, otherTab)
  await waitFor(() => evaluate("document.body.textContent.includes('No hay frentes en esta vista')", otherTab), "B replacement cookie established")
  assert.equal(await account(otherTab), accountB)
  await command("network.continueResponse", { request: delayedLogout })
  await command("network.removeIntercept", { intercept: heldLogout.intercept })
  await waitFor(() => evaluate("document.querySelector('#continue-account') !== null || document.body.textContent.includes('Sesión cerrada en este dispositivo.')"), "late A logout response processed")
  assert.equal(await evaluate("fetch('/auth/session').then(r=>r.status)", otherTab), 200, "Delayed A logout must not remove B's replacement cookie")
  assert.equal(await account(otherTab), accountB)
  assert.equal(await evaluate("document.querySelector('#continue-account') !== null"), true, "Old A tab reports the changed account")
  await click("Continuar con esta cuenta")
  await waitFor(() => evaluate("document.querySelector('#access-code') !== null"), "late logout requires B decryption key")
  await login(codeB)
  await waitFor(() => evaluate("document.body.textContent.includes('No hay frentes en esta vista')"), "continue explicitly with B after delayed A logout")
  await click("Cerrar sesión")
  await waitFor(() => evaluate("document.body.textContent.includes('Sesión cerrada en este dispositivo.')"), "logout confirmed")
  assert.equal(await evaluate("fetch('/api/fronts').then(r=>r.status)"), 401)
  await navigate()
  await waitFor(() => evaluate("document.querySelector('#access-code') !== null"), "logout survives reload")
  await writeFile(join(output, "row-geometry.json"), JSON.stringify(rowGeometryChecks, null, 2))
  await writeFile(join(output, "daily-geometry.json"), JSON.stringify(dailyGeometryChecks, null, 2))
  console.log("Primary JavaScript/workerd/D1. Real signup: two empty private accounts, code ACK before login, permanent-code reuse, no recovery; local assets and responsive 1366/390px")
  console.log("Real HTTP: HttpOnly cookie/resume, CSRF and foreign-account rejection, check/create/edit/archive/link clearing")
  console.log("Dashboard: global descending order across 23 filtered fronts/two pages, changed period reorders and resets page; daily order unchanged")
  console.log("Layout: both themes at 1920/1684/1366/1024/768/390/320px, four wide/two intermediate/one mobile columns; contained controls and 44px touch height")
  console.log("Dashboard cards: equal heights/calendar actions per row across themes and widths, complete multiline/unbroken long names; no fixed height or truncation")
  console.log("Daily cards: responsive columns, bounded desktop widths even for one result, single-column mobile, equal row heights, complete names, 44px controls, stable reading order and keyboard focus after real writes")
  console.log("Calendars: inclusive percentages, independent disclosures, Enter/Space and visible focus, no activity requests for themes/layout/disclosure")
  console.log(`Palettes: ${contrastChecks} checked text/icon/surface pairs at least 4.5:1; no horizontal overflow or card-frame overflow in captured views`)
  console.log("Themes: one-click light/dark, system default, reload persistence, login/signup/editor/pending intent retained; preference-only storage")
  console.log("Confirmed check: held REAL post-commit re-read preserves row DOM, viewport position and keyboard focus without optimistic success")
  console.log("View navigation: held real destination reads preserve source content, scroll and focus in both directions, both themes and desktop/mobile; stale controls stay inert")
  console.log("Compact rows/references: unchanged card dimensions with/without/restored long URL in both views/themes at1366/390/320px; short-name daily rows<=80px, checks>=44px; real reference edits never mark activity")
  console.log("Two tabs + failed committed HTTP response: A intent never applied to B, same A code restores it, same key retry produces exactly one front")
  console.log("Delayed A logout headers cannot erase B's replacement cookie; A revoked, B still authenticated, old tab detects account change")
  console.log("Clipboard fallback tested without touching system clipboard; no authorization overrides; own temporary data/profile cleaned up")
  console.log(`Screenshots: ${output}`)
  await command("session.end")
} finally {
  socket?.close()
  const ownBrowser = spawnSync("/usr/sbin/lsof", ["-t", join(profile, ".parentlock")], { encoding: "utf8" })
  for (const text of (ownBrowser.stdout ?? "").trim().split(/\s+/)) {
    if (!/^[0-9]+$/.test(text)) continue
    try { process.kill(Number(text), "SIGTERM") } catch (error) { if (error.code !== "ESRCH") throw error }
  }
  for (const child of children.reverse()) await stop(child)
  await waitFor(async () => spawnSync("/usr/sbin/lsof", ["-t", join(profile, ".parentlock")], { encoding: "utf8" }).status !== 0, "temporary profile released")
  for (const callback of cleanup.reverse()) await callback()
  await rm(temporary, { recursive: true, force: true })
}
