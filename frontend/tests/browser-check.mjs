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
    'user_pref("intl.accept_languages", "es-ES, es");',
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
  await command("session.subscribe", { events: ["network.beforeRequestSent", "network.responseStarted"] })
  const { context } = await command("browsingContext.create", { type: "tab" })
  async function evaluate(expression, targetContext = context) {
    const result = await command("script.evaluate", { expression, target: { context: targetContext }, awaitPromise: true })
    if (result.type !== "success") throw new Error("Browser assertion evaluation failed")
    return result.result.type === "null" ? null : result.result.value
  }
  const navigate = (targetContext = context) => command("browsingContext.navigate", { context: targetContext, url: `${origin}/app/`, wait: "complete" })
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
      const bounds=brand.getBoundingClientRect();
      const aligned=Math.abs(mark.top+mark.height/2-title.top-title.height/2)<1 && title.left>=mark.right;
      return aligned && mark.width>=64 && mark.left>=bounds.left-.5 && mark.right<=bounds.right+.5 && title.left>=bounds.left-.5 && title.right<=bounds.right+.5
        && document.querySelector('.desk-decoration')===null && getComputedStyle(brand,'::after').backgroundImage==='none';
    })()`), true, `${name}: larger plant and title stay aligned inside the brand`)
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
    if (width <= 600) {
      assert.equal(await evaluate(`([...document.querySelectorAll('.nav-label,.trash-nav-label,.new-front-label')].every(label=>{
        const bounds=label.getBoundingClientRect(), button=label.closest('button').getBoundingClientRect();
        return label.checkVisibility() && bounds.left>=button.left && bounds.right<=button.right+.5 && bounds.top>=button.top && bounds.bottom<=button.bottom+.5;
      }))`), true, `${name}: mobile keeps the main action labels visible inside their buttons`)
      assert.equal(await evaluate(`(() => {
        const button=document.querySelector('.filter-toggle');if(!button)return true;
        return button.checkVisibility() && (button.getAttribute('aria-expanded')==='true')===document.getElementById('name-search').checkVisibility();
      })()`), true, `${name}: mobile filters match the disclosure state`)
    }
    assert.equal(await evaluate(`([...document.querySelectorAll('.app-controls,.toolbar-card,.page-header,.daily-row,.trash-row,.trash-actions,.front-actions,.pagination,.editor-trash,.editor-actions')].filter(el=>el.checkVisibility()).every(group=>{
      const bounds=group.getBoundingClientRect();
      return [...group.querySelectorAll('button,input,select,a')].filter(el=>el.checkVisibility()).every(el=>{
        const rect=el.getBoundingClientRect();return rect.left>=bounds.left-.5 && rect.right<=bounds.right+.5 && rect.height>=43.5;
      });
    }))`), true, `${name}: controls must fit their container and retain 44px touch height`)
    assert.equal(await evaluate(`([...document.querySelectorAll('.app-controls,.view-nav,.toolbar-card,.page-header,.daily-row,.trash-row,.pagination,.editor-actions')].filter(el=>el.checkVisibility()).every(group=>{
      const controls=[...group.querySelectorAll('button,input:not([type=hidden]),select,a')].filter(el=>el.checkVisibility()).map(el=>el.getBoundingClientRect());
      return controls.every((a,index)=>controls.slice(index+1).every(b=>
        Math.min(a.right,b.right)-Math.max(a.left,b.left)<1 || Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<1));
    }))`), true, `${name}: interactive controls must not overlap`)
    const signupStyle = await evaluate("document.querySelector('#signup-code')?.getAttribute('style') ?? null")
    await evaluate("(() => { const el=document.querySelector('#signup-code'); if(el){el.style.setProperty('visibility','hidden','important');el.style.setProperty('color','transparent','important');el.style.setProperty('text-shadow','none','important');el.style.setProperty('caret-color','transparent','important')} return true })()")
    try {
      const image = await command("browsingContext.captureScreenshot", { context, origin: "viewport" })
      await writeFile(join(output, `${name}.png`), Buffer.from(image.data, "base64"))
    } finally {
      await evaluate(`(() => {const el=document.querySelector('#signup-code');if(el){const previous=${JSON.stringify(signupStyle)};if(previous===null)el.removeAttribute('style');else el.setAttribute('style',previous)}return true})()`)
      await evaluate("Promise.all(document.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{}))).then(()=>true)")
    }
  }
  let contrastChecks = 0
  let controlContrastChecks = 0
  const rowGeometryChecks = []
  const dailyGeometryChecks = []
  async function assertTextContrast(pairs, minimum = 4.5) {
    const ratios = JSON.parse(await evaluate(`(() => {
      const luminance = color => {
        if (!/^rgba?\\(/.test(color)) throw new Error('Expected resolved RGB color');
        const channels=color.match(/[0-9.]+/g).map(Number);
        if (channels.length>3 && channels[3]!==1) throw new Error('Contrast fixture must be opaque');
        const linear=channels.slice(0,3).map(n=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4});
        return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
      };
      return JSON.stringify(${JSON.stringify(pairs)}.map(([text,surface,property='color'])=>{
        const fg=luminance(getComputedStyle(document.querySelector(text))[property]);
        const bg=luminance(getComputedStyle(document.querySelector(surface??text)).backgroundColor);
        return {text,ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)};
      }));
    })()`))
    for (const { text, ratio } of ratios) assert.ok(ratio >= minimum, `${text}: contrast ${ratio.toFixed(2)}:1 below ${minimum}:1`)
    if (minimum === 3) controlContrastChecks += ratios.length
    else contrastChecks += ratios.length
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
  async function showFilters(ctx = context) {
    await evaluate("(() => {const button=document.querySelector('.filter-toggle');if(button?.checkVisibility() && button.getAttribute('aria-expanded')==='false')button.click();return true})()", ctx)
    await waitFor(() => evaluate("document.querySelector('#name-search')?.checkVisibility() === true", ctx), "visible filter controls")
  }
  const inputValue = async (id, value, ctx = context) => {
    if (id === "name-search") await showFilters(ctx)
    return evaluate(`(() => { const input = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', {bubbles:true})); return true })()`, ctx)
  }
  const selectValue = async (id, value) => {
    if (id === "state-filter") await showFilters()
    return evaluate(`(() => { const input = document.getElementById(${JSON.stringify(id)}); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('change', {bubbles:true})); return true })()`)
  }
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
    assert.equal(await evaluate(`(() => {
      const field=document.getElementById('signup-code'), form=field.form;
      return field.type==='password' && field.name==='password' && field.autocomplete==='new-password' && field.readOnly
        && form?.method==='post' && form.autocomplete==='on' && form.querySelector('[autocomplete=username]').value.length===36;
    })()`, ctx), true, "Signup is a native password form with its real account identifier")
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
      assert.ok(Math.max(...summaries)-Math.min(...summaries)<.5, `${label}: row ${index+1} calendar actions must align`)
      assert.ok(row.cards.every(card=>card.unclipped), `${label}: complete names must remain visible`)
    }
    rowGeometryChecks.push({ label, rows: geometry })
  }

  async function assertCalendarRowDisclosure(theme, width, height) {
    const columns = await evaluate("getComputedStyle(document.querySelector('.dashboard-list')).gridTemplateColumns.split(' ').length")
    const states = () => evaluate("JSON.stringify([...document.querySelectorAll('.calendar-details')].map(el=>el.open))").then(JSON.parse)
    const activate = index => evaluate(`(() => {const summary=document.querySelectorAll('.calendar-details summary')[${index}];summary.focus();summary.click();return true})()`)
    const initial = await states()
    assert.ok(initial.length > columns, 'Fixture spans at least two real grid rows')
    assert.ok(initial.every(open => !open), 'Responsive row fixture starts folded')
    await activate(0)
    assert.deepEqual(await states(), initial.map((_, index) => index < columns), `${theme}/${width}: exactly the first visual row opens`)
    assert.equal(await evaluate(`([...document.querySelectorAll('.calendar-details')].filter(el=>el.open).every(el=>{
      const start=document.getElementById('period-start').value,end=document.getElementById('period-end').value;
      const range=el.querySelector('.calendar-range'), dates=[...range.querySelectorAll('time')], tiles=[...el.querySelectorAll('.calendar-tile')];
      return range.checkVisibility() && dates[0].dateTime===start && dates.at(-1).dateTime===end
        && dates.every(time=>time.textContent.includes(time.dateTime.slice(0,4)))
        && tiles[0].querySelector('time').dateTime===start && tiles.at(-1).querySelector('time').dateTime===end
        && tiles.every(tile=>{const time=tile.querySelector('time'),box=tile.getBoundingClientRect(),date=time.getBoundingClientRect();
          return time.checkVisibility() && time.textContent.trim().length>0 && date.width>0 && date.height>0
            && date.left>=box.left-.5 && date.right<=box.right+.5 && date.top>=box.top-.5 && date.bottom<=box.bottom+.5;});
    }))`), true, `${theme}/${width}: the full period and every date are visible inside their tiles`)
    await assertDashboardRowGeometry(`expanded/${theme}/${width}`)
    await evaluate("document.querySelector('.dashboard-list .front-card').scrollIntoView({block:'start'})")
    await screenshot(`calendar-row-${theme}-${width}`, width, height)
    await activate(columns)
    assert.deepEqual(await states(), initial.map((_, index) => index < columns * 2), 'Opening another row preserves the first row')
    await activate(columns - 1)
    assert.deepEqual(await states(), initial.map((_, index) => index >= columns && index < columns * 2), 'Closing a peer closes its entire row and preserves the other row')
    await activate(columns)
    assert.ok((await states()).every(open => !open), 'Every row can be collapsed again')
    assert.equal(await evaluate(`document.activeElement===document.querySelectorAll('.calendar-details summary')[${columns}]`), true, 'Row synchronization preserves focus')
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
    await assertTextContrast([[".language-picker select"]])
    await assertTextContrast([[".language-control [data-slot=button-decorations] > span", ".app-controls", "backgroundColor"], [".auth-form .field-input", ".auth-card [data-slot=card]", "borderTopColor"]], 3)
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
  await evaluate(`(() => {
    window.__signInCompletions=0;window.__formAtCompletion=false;
    const replace=history.replaceState;
    history.replaceState=function(...args){window.__signInCompletions++;window.__formAtCompletion ||= !!document.querySelector('#login-form,#signup-code-form');return replace.apply(this,args)};
    return true;
  })()`)
  for (const theme of ["light", "dark"]) {
    await chooseTheme(theme)
    assert.equal(await evaluate(`document.getElementById('signup-code').value===${JSON.stringify(codeA)}`), true, "Theme preserves the only displayed signup code")
    await screenshot(`signup-${theme}-desktop`, 1366, 1000)
    await screenshot(`signup-${theme}-mobile`, 390, 844)
    await assertTextContrast([[".code-warning"], ["#signup-code"]])
  }
  await chooseTheme("light")
  // Do not touch the user's system clipboard: exercise the failure fallback only.
  await evaluate("Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async()=>{throw new Error('Test clipboard unavailable')}}})")
  await click("Copiar")
  await waitFor(() => evaluate("document.body.textContent.includes('cópialo manualmente')"), "clipboard fallback")
  await click("Mostrar código")
  assert.equal(await evaluate(`document.getElementById('signup-code').type==='text' && document.getElementById('signup-code').value===${JSON.stringify(codeA)}`), true, "Code can be revealed without editing or regenerating it")
  await click("Ocultar código")
  await acknowledge()
  assert.equal(await evaluate("window.__signInCompletions===1 && window.__formAtCompletion===false"), true, "Successful SPA sign-in removes the password form before signaling completion")
  assert.equal(await evaluate(`(async()=>{
    const icon=document.querySelector('link[rel="icon"]');
    if(!icon || icon.type!=='image/svg+xml' || new URL(icon.href).pathname!=='/favicon.svg')return false;
    const response=await fetch(icon.href);
    if(!response.ok || !response.headers.get('content-type')?.includes('image/svg+xml'))return false;
    const svg=new DOMParser().parseFromString(await response.text(),'image/svg+xml').documentElement;
    if(svg.localName!=='svg' || svg.getAttribute('viewBox')!=='0 0 32 32')return false;
    const image=new Image();image.src=icon.href;await image.decode();return image.naturalWidth===32 && image.naturalHeight===32;
  })()`), true, "The local plant brand favicon is linked, served and decodable")
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
  // Emulate a password manager assigning the native value without React events.
  await evaluate(`(() => {
    const input=document.getElementById('access-code');window.__autofillInput=input;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(codeA)});
    return true;
  })()`)
  let autofillSessionReads = 0
  onEvent = message => {
    if (message.method === 'network.responseStarted' && message.params.context === context
      && new URL(message.params.request.url).pathname === '/auth/session') autofillSessionReads++
  }
  for (const event of ['focus', 'pageshow', 'visibilitychange']) {
    const before = autofillSessionReads
    await evaluate(`${event === 'visibilitychange' ? 'document' : 'window'}.dispatchEvent(new Event(${JSON.stringify(event)}))`)
    await waitFor(() => autofillSessionReads > before, `real session validation after autofill ${event}`)
    await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))")
    assert.equal(await evaluate(`document.getElementById('access-code')===window.__autofillInput
      && window.__autofillInput.value===${JSON.stringify(codeA)}
      && document.activeElement===window.__autofillInput && document.querySelector('.app-shell')===null`), true, `Autofill survives ${event}, with the same field/focus and no automatic login`)
  }
  onEvent = () => {}
  for (const theme of ['dark', 'light']) {
    await chooseTheme(theme)
    assert.equal(await evaluate(`document.getElementById('access-code')===window.__autofillInput && window.__autofillInput.value===${JSON.stringify(codeA)}`), true, 'Visual changes preserve native autofill')
  }
  assert.equal(await evaluate("window.__autofillInput.name==='password' && window.__autofillInput.autocomplete==='current-password'"), true, 'Standard password-manager field hints')
  await click('Entrar') // Submit the native autofilled value, without inputValue().
  await waitFor(() => evaluate("document.querySelectorAll('[role=checkbox].activity-check').length === 2"), "decrypted account A rows")
  assert.equal(await evaluate("window.__autofillInput.value===''"), true, 'Submitted credential is cleared even from the detached input')
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
    for (const width of [361, 601, 375, 390, 428, 600, 640, 768, 960, 1024, 1366, 1684, 1920, 360, 320]) {
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
  await evaluate("document.querySelector('.filter-toggle').getAttribute('aria-expanded')==='true' && document.querySelector('.filter-toggle').click()")
  await screenshot("daily-desktop", 1366, 1000)
  await screenshot("daily-mobile", 390, 844)
  await showFilters()
  await screenshot("daily-mobile-filters", 375, 812)
  await evaluate("document.querySelector('.filter-toggle').click()")
  await screenshot("daily-landscape", 844, 390)
  await evaluate("document.querySelector('.front-card').scrollIntoView({block:'start'})")
  await screenshot("daily-mobile-rows", 390, 844)
  // Hold before the request reaches workerd, then hold its real commit response:
  // the check must already be drawn on the first frame, without any animation.
  const dailyReadUrl = `${origin}/api/vault`
  let heldCheckSend = null
  let heldCheckRequest = null
  const checkRequests = []
  const checkFrames = []
  onEvent = ({ method, params }) => {
    if (method === "network.beforeRequestSent" && params.context === context && params.request.url === dailyReadUrl && params.isBlocked) {
      checkRequests.push(params.request.method)
      if (params.request.method === "PUT") heldCheckSend = params.request.request
      else void command("network.continueRequest", {request:params.request.request})
    }
    if (method === "network.responseStarted" && params.context === context && params.request.url === dailyReadUrl && params.isBlocked) {
      if (params.request.method === "PUT") heldCheckRequest = params.request.request
      else void command("network.continueResponse", {request:params.request.request})
    }
  }
  const heldCheck = await command("network.addIntercept", { contexts: [context], phases: ["beforeRequestSent", "responseStarted"], urlPatterns: [{ type: "string", pattern: dailyReadUrl }] })
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
  for (const marked of [true, false, true]) {
    heldCheckSend = null; heldCheckRequest = null
    const firstFrame = JSON.parse(await evaluate(`(async()=>{
      const start=performance.now();window.__checkTarget.click();
      await new Promise(requestAnimationFrame);
      return JSON.stringify({ms:Math.round(performance.now()-start),checked:window.__checkTarget.getAttribute('aria-checked')});
    })()`))
    assert.equal(firstFrame.checked, String(marked), "Mark and unmark must appear on the first frame before any network result")
    checkFrames.push({ marked, first_frame_ms: firstFrame.ms })
    await waitFor(async () => heldCheckSend !== null, "hold check before sending to workerd")
    assert.equal(await evaluate("window.__checkTarget.getAttribute('aria-busy')"), "true", "The immediate preview still reports that saving is pending")
    assert.equal(await evaluate("getComputedStyle(window.__checkTarget).animationName"), "none")
    assert.equal(await evaluate("getComputedStyle(window.__checkTarget).transitionDuration"), "0s")
    assert.equal(await evaluate("getComputedStyle(window.__checkTarget,'::after').content"), "none", "There is no animated busy glyph")
    assert.equal(await evaluate("document.getElementById(window.__checkTarget.getAttribute('aria-describedby')).textContent"), `${marked ? "Actividad marcada" : "Actividad desmarcada"}; guardando…`)
    assert.deepEqual(await otherControlAppearance(), stableControls, "Saving must not flash unrelated controls")
    assert.equal(await evaluate("document.querySelector('.main-feedback').textContent.trim()"), "", "Saving does not show a progress popup")
    const duringCheck = JSON.parse(await evaluate("JSON.stringify({connected:window.__checkTarget.isConnected,scroll:scrollY,top:window.__checkTarget.getBoundingClientRect().top})"))
    assert.equal(duringCheck.connected, true)
    assert.ok(Math.abs(duringCheck.top-beforeCheck.top)<8, "The immediate preview preserves row position")
    if (checkFrames.length === 1) {
      const previewImage = await command("browsingContext.captureScreenshot", { context, origin: "viewport" })
      await writeFile(join(output, "check-immediate-mobile.png"), Buffer.from(previewImage.data, "base64"))
    }
    await command("network.continueRequest", { request: heldCheckSend })
    await waitFor(async () => heldCheckRequest !== null, "hold real check commit response")
    assert.equal(await evaluate("window.__checkTarget.getAttribute('aria-checked')"), String(marked), "The preview stays stable while waiting for the commit response")
    await command("network.continueResponse", { request: heldCheckRequest })
    await waitFor(() => evaluate(`window.__checkTarget.getAttribute('aria-checked') === '${marked}' && window.__checkTarget.getAttribute('aria-busy') === 'false' && window.__checkTarget.getAttribute('aria-disabled') === 'false'`), "HTTP check confirmation without another read")
    assert.deepEqual(checkRequests, checkFrames.map(() => "PUT"), "Each loaded checkbox change needs one PUT and no extra GET")
  }
  await command("network.removeIntercept", { intercept: heldCheck.intercept })
  onEvent = () => {}
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
  // Native summary supports keyboard activation and the current one-card mobile row.
  await evaluate("document.querySelector('.calendar-details summary').focus()")
  const key = (value) => command("input.performActions", { context, actions: [{ type: "key", id: "dashboard-keys", actions: [{ type: "keyDown", value }, { type: "keyUp", value }] }] })
  await key("\uE007")
  assert.equal(await evaluate("document.querySelector('.calendar-details').open"), true, "Enter expands the focused calendar")
  assert.equal(await evaluate("document.querySelectorAll('.calendar-details')[1].open"), false, "Other mobile rows stay collapsed")
  assert.equal(await evaluate("document.querySelector('.calendar-grid').checkVisibility() && document.querySelectorAll('.calendar-details')[0].querySelectorAll('.calendar-tile').length === 28"), true)
  assert.notEqual(await evaluate("getComputedStyle(document.activeElement).outlineStyle"), "none", "Keyboard focus remains visible")
  await command("browsingContext.setViewport", { context, viewport: { width: 1366, height: 1000 }, devicePixelRatio: 1 })
  await key(" ")
  assert.equal(await evaluate("[...document.querySelectorAll('.calendar-details')].every(el=>!el.open)"), true, 'Space closes the current desktop row')
  await key("\uE007")
  assert.equal(await evaluate("[...document.querySelectorAll('.calendar-details')].every(el=>el.open)"), true, 'Enter opens both fronts on the same desktop row')
  await assertTextContrast([
    [".brand-name", ".sidebar"], [".sidebar-note", ".sidebar"], [".nav-button[aria-current]"], [".new-front"],
    [".coverage-value", ".front-card [data-slot=card]"], [".coverage-value > span", ".front-card [data-slot=card]"],
    [".period-count", ".front-card [data-slot=card]"], [".reference-link", ".front-card [data-slot=card]"],
    [".calendar-details summary", ".front-card [data-slot=card]"], [".calendar-range", ".front-card [data-slot=card]"], [".calendar-tile.is-marked"], [".calendar-tile:not(.is-marked)"],
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
    await screenshot(`editor-${theme}-short`, 375, 430)
    assert.equal(await evaluate(`(() => {
      const dialog=document.querySelector('[role=dialog]'), bounds=dialog.getBoundingClientRect();
      return bounds.top>=0 && bounds.bottom<=innerHeight && getComputedStyle(dialog).overflowY==='auto';
    })()`), true, "Short screens keep the editor inside the viewport with scrolling")
    await evaluate("document.querySelector('.editor-actions [type=submit]').scrollIntoView({block:'nearest'})")
    assert.equal(await evaluate("(() => {const bounds=document.querySelector('.editor-actions [type=submit]').getBoundingClientRect();return bounds.top>=0 && bounds.bottom<=innerHeight})()"), true, "Save remains reachable in a short viewport")
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

  // Recoverable deletion uses the encrypted protocol and preserves identity,
  // original state and historical checks across a reload, in every front state.
  await selectValue("state-filter", "all")
  await waitFor(() => evaluate("document.querySelectorAll('.front-card h2').length===5"), "all states before trash")
  for (const [name, state] of [["Guitarra", "open"], ["Lectura", "standby"], ["Proyecto terminado", "archived"]]) {
    const original = (await api(`/api/fronts?search=${encodeURIComponent(name)}`)).body.items[0]
    const history = async () => (await api(`/api/history?start=${periodStart}&end=${periodEnd}`)).body.items.filter(check => check.front_id === original.id)
    const originalChecks = await history()
    assert.ok(originalChecks.length >= 3, "The trash fixture has historical activity")
    await evaluate(`document.querySelector('[aria-label="Editar ${name}"]').click()`)
    await waitFor(() => evaluate("document.querySelector('.delete-front')!==null"), "trash action in editor")
    if (state === "open") {
      for (const theme of ["dark", "light"]) {
        await chooseTheme(theme, otherTab)
        await waitFor(() => evaluate(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`), "trash editor theme")
        await screenshot(`trash-editor-${theme}-390`, 390, 844)
        await screenshot(`trash-editor-${theme}-320`, 320, 780)
        await assertTextContrast([[".delete-front", ".editor-card [data-slot=card]"], [".editor-trash .field-help", ".editor-card [data-slot=card]"]])
      }
    }
    await click("Eliminar frente")
    await waitFor(() => evaluate(`document.querySelector('[role=dialog]')===null && ![...document.querySelectorAll('.front-card h2')].some(el=>el.textContent===${JSON.stringify(name)})`), "confirmed front leaves normal dashboard")
    assert.equal((await api(`/api/fronts?search=${encodeURIComponent(name)}`)).body.total, 0)
    if (state === "open") {
      await navigate()
      await waitFor(() => evaluate("document.querySelector('#access-code')!==null"), "trash persists after losing memory key")
      await login(codeA)
      await waitFor(() => evaluate("document.querySelector('.daily-list')!==null"), "normal records after reload")
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Actividad en Guitarra\"]')===null"), true)
    }
    await click("Papelera")
    await waitFor(() => evaluate(`document.querySelector('[aria-label="Restaurar ${name}"]')?.disabled===false`), "recoverable front in trash")
    assert.equal(await evaluate("document.querySelector('.new-front,.edit-front,.activity-check')===null"), true, "Trash offers restoration and explicit deletion without edits/checks")
    const trashed = (await api(`/api/fronts/${original.id}`)).body
    assert.deepEqual({ ...trashed, trashed_at: undefined }, { ...original, trashed_at: undefined })
    assert.ok(Number.isFinite(Date.parse(trashed.trashed_at)))
    assert.deepEqual(await history(), originalChecks, "Moving to trash never deletes checks")
    assert.equal((await api("/api/fronts?trashed=true")).body.total, 1)
    if (state === "open") {
      for (const theme of ["dark", "light"]) {
        await chooseTheme(theme)
        for (const width of [1366, 768, 390, 320]) {
          await evaluate("window.scrollTo(0,0)")
          await screenshot(`trash-${theme}-${width}`, width, 900)
        }
        await assertTextContrast([[".trash-help", ".main-content"], [".trash-help .muted", ".main-content"], [".trash-row h2", ".front-card [data-slot=card]"], [".restore-front"], [".purge-front", ".front-card [data-slot=card]"]])
      }
    }
    await evaluate(`(() => { const button=document.querySelector('[aria-label="Restaurar ${name}"]');button.focus();button.click(); })()`)
    await waitFor(() => evaluate("document.body.textContent.includes('La papelera está vacía')"), "restore removes front from trash")
    assert.equal(await evaluate("document.activeElement===document.querySelector('.trash-nav')"), true, "Restoration leaves focus on the available trash navigation")
    const restored = (await api(`/api/fronts/${original.id}`)).body
    assert.deepEqual({ ...restored, trashed_at: undefined }, { ...original, trashed_at: undefined })
    assert.deepEqual(await history(), originalChecks, "Restore preserves all original activity")
    assert.equal((await api("/api/fronts?trashed=true")).body.total, 0)
    await click("Dashboard")
    await waitFor(() => evaluate("document.querySelector('.dashboard-list')!==null && !document.querySelector('main').inert"), "dashboard after restoration")
    await selectValue("state-filter", "all")
    await waitFor(() => evaluate(`document.querySelectorAll('.front-card h2').length===5 && [...document.querySelectorAll('.front-card h2')].some(el=>el.textContent===${JSON.stringify(name)})`), "restore returns front to the original state")
  }

  // Permanent deletion uses separate synthetic fronts, leaving earlier fixtures.
  for (const state of ['open', 'standby', 'archived']) {
    const name = `Borrado permanente ${state}${state === 'open' ? ' ' + 'X'.repeat(150) : ''}`
    const reference = `https://example.test/borrar/${state}`
    await click('Nuevo frente')
    await waitFor(() => evaluate("document.getElementById('front-name')!==null"), 'permanent-delete fixture editor')
    await inputValue('front-name', name)
    await inputValue('front-reference', reference)
    await selectValue('front-state', state)
    await click('Crear frente')
    await waitFor(() => evaluate("document.querySelector('[role=dialog]')===null"), 'permanent-delete fixture created')
    const front = (await api(`/api/fronts?search=${encodeURIComponent(name)}`)).body.items[0]
    await click('Registro')
    await waitFor(() => evaluate("document.getElementById('registration-day')!==null && !document.querySelector('main').inert"), 'registration ready after navigation')
    await inputValue('name-search', name)
    await selectValue('state-filter', 'all')
    for (const day of [fixtureDay, offsetDay(fixtureDay, 1)]) {
      await inputValue('registration-day', day)
      await waitFor(() => evaluate(`document.querySelectorAll('[role=checkbox].activity-check').length===1 && document.querySelector('[role=checkbox].activity-check').getAttribute('aria-disabled')==='false' && document.getElementById('registration-day').value===${JSON.stringify(day)}`), 'deletion fixture selected day')
      await evaluate("document.querySelector('[role=checkbox].activity-check').click()")
      await waitFor(() => evaluate("document.querySelector('[role=checkbox].activity-check').getAttribute('aria-checked')==='true' && document.querySelector('[role=checkbox].activity-check').getAttribute('aria-busy')==='false'"), 'deletion fixture check confirmed')
    }
    await evaluate("document.querySelector('.edit-front').click()")
    await waitFor(() => evaluate("document.querySelector('.delete-front')!==null"), 'move permanent-delete fixture to trash')
    await click('Eliminar frente')
    await waitFor(() => evaluate("document.querySelector('[role=dialog]')===null"), 'fixture in trash')
    await click('Papelera')
    await waitFor(() => evaluate("document.querySelector('.purge-front')?.disabled===false"), 'permanent deletion offered in trash')
    const before = await encrypted.inspect()
    assert.equal(before.content.checks.filter(ch => ch.front_id === front.id).length, 2)
    await evaluate("window.__deleteOpener=document.querySelector('.purge-front');window.__deleteOpener.click()")
    await waitFor(() => evaluate("document.querySelector('[role=alertdialog]')!==null && document.activeElement.id==='cancel-permanent-delete'"), 'confirmation starts on Cancel')
    assert.equal(await evaluate(`document.querySelector('[role=alertdialog]').textContent.includes(${JSON.stringify(name)}) && document.querySelector('[role=alertdialog]').textContent.includes('No podrás recuperarlo')`), true)
    await click('Cancelar')
    await waitFor(() => evaluate("document.querySelector('[role=alertdialog]')===null"), 'cancel permanent deletion')
    assert.equal((await encrypted.inspect()).version, before.version, 'Cancellation performs no write')
    assert.equal(await evaluate("document.activeElement===window.__deleteOpener"), true, 'Cancel restores the original control focus')
    await evaluate("window.__deleteOpener.click()")
    await waitFor(() => evaluate("document.querySelector('[role=alertdialog]')!==null"), 'explicit confirmation reopened')
    if (state === 'open') {
      for (const theme of ['dark', 'light']) {
        await chooseTheme(theme, otherTab)
        await waitFor(() => evaluate(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`), 'confirmation follows theme')
        for (const width of [1366, 390, 320]) await screenshot(`permanent-delete-${theme}-${width}`, width, 900)
        await assertTextContrast([[".delete-panel .muted", ".editor-card [data-slot=card]"], [".confirm-delete"], ["#cancel-permanent-delete"]])
      }
    }
    const requests = []; let blocked = null
    onEvent = ({ method, params }) => {
      if (params.context !== context || params.request.url !== `${origin}/api/vault`) return
      if (method === 'network.beforeRequestSent') requests.push(params.request.method)
      if (method === 'network.responseStarted' && params.isBlocked) {
        if (params.request.method === 'PUT') blocked = params.request.request
        else void command('network.continueResponse', { request: params.request.request })
      }
    }
    const intercept = await command('network.addIntercept', { contexts: [context], phases: ['responseStarted'], urlPatterns: [{ type: 'string', pattern: `${origin}/api/vault` }] })
    await evaluate("document.querySelector('[role=alertdialog] .confirm-delete').click()")
    await waitFor(() => blocked !== null, 'hold actual permanent-delete commit response')
    assert.equal(await evaluate("document.querySelector('[role=alertdialog]')!==null && document.querySelector('.confirm-delete').disabled && document.getElementById('cancel-permanent-delete').disabled && document.querySelector('.restore-front').disabled"), true, 'Pending deletion remains visible and locked')
    if (state === 'standby') await command('network.failRequest', { request: blocked })
    else await command('network.continueResponse', { request: blocked })
    await command('network.removeIntercept', { intercept: intercept.intercept })
    if (state === 'standby') {
      await waitFor(() => evaluate("document.querySelector('[role=alertdialog]').textContent.includes('Solicitud sin confirmar')"), 'lost delete response keeps its confirmation')
      assert.equal((await api(`/api/fronts/${front.id}`)).status, 404, 'Deletion committed despite the lost response')
      const version = (await encrypted.inspect()).version
      await click('Reintentar solicitud')
      await waitFor(() => evaluate("document.querySelector('[role=alertdialog]')===null"), 'same delete request explicitly confirmed')
      assert.equal((await encrypted.inspect()).version, version, 'Delete retry does not commit again')
      assert.equal(requests.filter(method => method === 'PUT').length, 1)
    } else {
      await waitFor(() => evaluate("document.querySelector('[role=alertdialog]')===null"), 'permanent deletion confirmed')
      assert.deepEqual(requests, ['GET', 'PUT'], 'Deletion reads current data and projects its confirmed snapshot without another GET')
    }
    onEvent = () => {}
    assert.equal(await evaluate("document.activeElement===document.querySelector('.trash-nav')"), true, 'Deleted control returns focus to available trash navigation')
    const after = await encrypted.inspect()
    assert.equal(after.content.fronts.some(f => f.id === front.id), false)
    assert.equal(after.content.checks.some(ch => ch.front_id === front.id), false)
    assert.equal(JSON.stringify(after.content).includes(name), false, 'No deleted name remains in the current encrypted document or replay content')
    assert.equal(JSON.stringify(after.content).includes(reference), false, 'No deleted reference remains in replay content')
    assert.deepEqual(after.content.fronts, before.content.fronts.filter(f => f.id !== front.id))
    assert.deepEqual(after.content.checks, before.content.checks.filter(ch => ch.front_id !== front.id))
    if (state === 'archived') {
      await navigate()
      await waitFor(() => evaluate("document.getElementById('access-code')!==null"), 'permanent deletion survives losing the memory key')
      await login(codeA)
      await waitFor(() => evaluate("document.querySelector('.daily-list')!==null"), 'unlock after permanent deletion')
      await click('Papelera')
      await waitFor(() => evaluate("document.body.textContent.includes('La papelera está vacía')"), 'deleted fronts cannot be restored after reload')
    }
    await click('Dashboard')
    await waitFor(() => evaluate("document.getElementById('period-start')!==null && !document.querySelector('main').inert"), 'dashboard ready after deletion')
    await inputValue('name-search', '')
    await selectValue('state-filter', 'all')
    await waitFor(() => evaluate("document.querySelectorAll('.dashboard-list .front-card').length===5 && !document.querySelector('main').inert"), 'original fixtures preserved after permanent deletion')
  }

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
      await assertCalendarRowDisclosure(theme, width, height)
    }
    await command("browsingContext.setViewport", { context, viewport: { width: 1366, height: 1000 }, devicePixelRatio: 1 })
    await evaluate("document.querySelector('.calendar-details summary').focus()")
    await key("\uE007")
    assert.equal(await evaluate("document.querySelector('.calendar-details').open"), true)
    assert.equal(await evaluate("[...document.querySelectorAll('.calendar-details')].filter(el=>el.open).length===getComputedStyle(document.querySelector('.dashboard-list')).gridTemplateColumns.split(' ').length"), true, 'Enter opens the complete desktop row')
    assert.notEqual(await evaluate("getComputedStyle(document.activeElement).outlineStyle"), "none")
    await assertTextContrast([
      [".brand-name", ".sidebar"], [".sidebar-note", ".sidebar"], [".nav-button[aria-current]"], [".new-front"],
      [".front-title h2", ".front-card [data-slot=card]"], [".coverage-value", ".front-card [data-slot=card]"], [".coverage-value > span", ".front-card [data-slot=card]"],
      [".period-count", ".front-card [data-slot=card]"], [".reference-link", ".front-card [data-slot=card]"],
      [".calendar-details summary", ".front-card [data-slot=card]"], [".calendar-range", ".front-card [data-slot=card]"], [".calendar-tile.is-marked"], [".calendar-tile:not(.is-marked)"],
      [".state-open"], [".state-standby"], [".state-archived"], ["#period-start"], ["#state-filter"], [".app-controls .theme-toggle"],
      [".session-controls p", ".app-controls"],
    ])
    await key(" ")
    assert.equal(await evaluate("[...document.querySelectorAll('.calendar-details')].every(el=>!el.open)"), true, 'Space closes the complete desktop row')
    await key("\uE007")
    await evaluate("document.querySelector('.front-card').scrollIntoView({block:'start'})")
    await screenshot(`calendar-${theme}-390`, 390, 844)
    await evaluate("document.querySelector('.calendar-details summary').focus()")
    await key(" ")
    assert.equal(await evaluate("document.querySelector('.calendar-details').open"), false)
    await evaluate("(() => {for(const details of document.querySelectorAll('.calendar-details'))if(details.open)details.querySelector('summary').click();return true})()")
    assert.equal(await evaluate("[...document.querySelectorAll('.calendar-details')].every(el=>!el.open)"), true)
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

  // Exercise the second language against the same real encrypted account,
  // after legacy Spanish/storage contracts have been checked above.
  async function chooseLanguage(language, ctx = context) {
    await evaluate(`(() => {const select=document.querySelector('.language-picker select');select.value=${JSON.stringify(language)};select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`, ctx)
    await waitFor(() => evaluate(`document.documentElement.lang===${JSON.stringify(language)}`, ctx), `language ${language}`)
  }
  await evaluate(`(() => {window.__languageInput=document.getElementById('access-code');window.__languageInput.value=${JSON.stringify(codeA)};window.__languageInput.focus();return true})()`)
  await chooseLanguage("en")
  assert.equal(await evaluate(`document.getElementById('access-code')===window.__languageInput && document.activeElement===window.__languageInput && window.__languageInput.value===${JSON.stringify(codeA)}`), true, "Language preserves an autofilled password and its focus without React input events")
  assert.equal(await evaluate("document.title==='Activity Hub · Your activity log' && document.querySelector('#login-form [type=submit]').textContent==='Sign in' && localStorage.getItem('activity-hub.language')==='en'"), true, "English document and sign-in affordances")
  for (const theme of ["light", "dark"]) {
    await chooseTheme(theme)
    await screenshot(`login-english-${theme}-320`, 320, 780)
    await assertTextContrast([[".language-picker select"], ["#access-code"], [".auth-form [type=submit]"]])
  }
  await navigate()
  await waitFor(() => evaluate("document.documentElement.lang==='en' && document.getElementById('access-code')!==null"), "English selection survives reload")
  assert.equal(await evaluate("document.getElementById('access-code').value===''"), true, "Reload requires the key; language storage never saves credentials")
  await inputValue("access-code", codeA)
  await click("Sign in")
  await waitFor(() => evaluate("document.querySelector('.daily-list .front-card')!==null"), "English authenticated log")
  await click("New focus area")
  await waitFor(() => evaluate("document.activeElement?.id==='front-name'"), "English editor initial focus")
  await inputValue("front-name", "Borrador sin traducir — {name}")
  await inputValue("front-reference", "https://example.org/doc?q=castellano")
  await evaluate("window.__languageDraft=document.getElementById('front-name');window.__languageDraft.focus();performance.clearResourceTimings();true")
  for (const language of ["es", "en"]) {
    await chooseLanguage(language, otherTab)
    await waitFor(() => evaluate(`document.documentElement.lang===${JSON.stringify(language)}`), "real cross-tab language event")
    assert.equal(await evaluate("document.getElementById('front-name')===window.__languageDraft && document.activeElement===window.__languageDraft && window.__languageDraft.value==='Borrador sin traducir — {name}' && document.getElementById('front-reference').value==='https://example.org/doc?q=castellano'"), true, "Real storage events retain editor values, DOM and focus")
  }
  assert.equal(await evaluate("performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname.startsWith('/api/')).length"), 0, "Language never reads/writes activity")
  for (const theme of ["light", "dark"]) {
    await chooseTheme(theme, otherTab)
    await waitFor(() => evaluate(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`), "cross-tab editor theme")
    await screenshot(`editor-english-${theme}-320`, 320, 780)
  }
  await click("Cancel")
  await click("Dashboard")
  await waitFor(() => evaluate("document.querySelector('.coverage-value')!==null && !document.querySelector('main').inert"), "English dashboard with real history")
  await inputValue("period-start", offsetDay(periodEnd, 6))
  await inputValue("period-end", periodEnd)
  await waitFor(() => evaluate("!document.querySelector('main').inert && document.querySelector('.coverage-value')!==null"), "English seven-day period")
  assert.equal(await evaluate("[...document.querySelectorAll('.period-count')].every(el=>el.textContent.includes('of 7 days recorded'))"), true, "English inclusive day count")
  assert.equal(await evaluate("[...document.querySelectorAll('.coverage-value')].every(el=>el.getAttribute('aria-label').includes('% of selected days'))"), true, "English accessible percentages")
  await evaluate("document.querySelector('.calendar-details summary').click();window.__languageCard=document.querySelector('.front-card');performance.clearResourceTimings();true")
  const englishDates = Array.from({length: 7}, (_, index) => offsetDay(periodEnd, 6-index)).map(day => ({day, label: new Intl.DateTimeFormat("en-GB", {timeZone: "UTC", day: "numeric", month: "short"}).format(new Date(`${day}T12:00:00Z`))}))
  assert.equal(await evaluate(`(() => {const expected=${JSON.stringify(englishDates)};return [...document.querySelectorAll('.calendar-tile time')].every(el=>expected.some(date=>date.day===el.getAttribute('datetime') && date.label===el.textContent))})()`), true, "Calendar tiles use English dates while retaining ISO calendar days")
  for (const theme of ["light", "dark"]) {
    await chooseTheme(theme)
    for (const width of [1366, 768, 390, 320]) {
      await command("browsingContext.setViewport", { context, viewport: {width, height: 900}, devicePixelRatio: 1 })
      // Open the current visual row at each width, as the user's action does.
      // An earlier mobile disclosure is intentionally retained on resize.
      await evaluate("(() => {for(const details of document.querySelectorAll('.calendar-details'))details.open=false;document.querySelector('.calendar-details summary').click();return true})()")
      await evaluate("window.scrollTo(0,0);true")
      await screenshot(`dashboard-english-${theme}-${width}`, width, 900)
      await assertDashboardRowGeometry(`english/${theme}/${width}`)
    }
    await assertTextContrast([[".language-picker select"], [".session-controls p", ".app-controls"], [".period-count", ".front-card [data-slot=card]"], [".calendar-tile:not(.is-marked)"]])
  }
  assert.equal(await evaluate("document.querySelector('.front-card')===window.__languageCard && performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname.startsWith('/api/')).length===0"), true, "Theme and English layout retain history without activity requests")
  await click("Trash")
  await waitFor(() => evaluate("document.body.textContent.includes('The trash is empty')"), "English trash empty state")
  await screenshot("trash-english-dark-320", 320, 780)
  assert.equal(await evaluate("sessionStorage.length===0 && localStorage.length===2 && localStorage.getItem('activity-hub.language')==='en' && localStorage.getItem('activity-hub.theme')==='dark'"), true, "Only whitelisted language/theme preferences persist")
  await click("Sign out")
  await waitFor(() => evaluate("document.body.textContent.includes('Signed out on this device.')"), "English logout notice")
  await writeFile(join(output, "row-geometry.json"), JSON.stringify(rowGeometryChecks, null, 2))
  await writeFile(join(output, "daily-geometry.json"), JSON.stringify(dailyGeometryChecks, null, 2))
  console.log("Primary JavaScript/workerd/D1. Real signup: two empty private accounts, code ACK before login, permanent-code reuse, no recovery; local assets and responsive 1366/390px")
  console.log("Real HTTP: HttpOnly cookie/resume, CSRF and foreign-account rejection, check/create/edit/archive/link clearing")
  console.log("Dashboard: global descending order across 23 filtered fronts/two pages, changed period reorders and resets page; daily order unchanged")
  console.log("Layout: both themes at 1920/1684/1366/1024/768/390/320px, four wide/two intermediate/one mobile columns; contained controls and 44px touch height")
  console.log("Dashboard cards: equal heights/calendar actions per row across themes and widths, complete multiline/unbroken long names; no fixed height or truncation")
  console.log("Daily cards: responsive columns, bounded desktop widths even for one result, single-column mobile, equal row heights, complete names, 44px controls, stable reading order and keyboard focus after real writes")
  console.log("Calendars: inclusive percentages, native Enter/Space and visible focus, opening/closing the current responsive row while preserving other rows; visible full period/year and all tile dates, no activity requests for themes/layout/disclosure")
  console.log(`Palettes: ${contrastChecks} checked text/icon/surface pairs at least 4.5:1; no horizontal overflow or card-frame overflow in captured views`)
  console.log(`Control boundaries: ${controlContrastChecks} checked pixel frames/input outlines at least 3:1 in both themes; language selector reuses the button's 8-bit frame`)
  console.log("Themes: one-click light/dark, system default, reload persistence, login/signup/editor/pending intent retained; preference-only storage")
  console.log("Languages: English/Spanish access and account controls, persisted preference, real cross-tab draft/focus retention, native autofill, English seven-day dates/counts/percentages and trash; no extra activity requests or credential storage")
  console.log("Native autofill: no React events; preserved through real focus/pageshow/visibility session checks and themes, same input/focus, explicit login/decryption and credential cleared on submit")
  console.log("Mobile layout: 15 daily widths including 361/375/600/601/640px in both themes; controls do not overlap, primary labels remain visible, filters disclose correctly, landscape and short scrolling editors pass")
  console.log("Password forms: native signup password/account identifier, reveal/copy/ACK retained; successful SPA sign-in signals completion after removing the form")
  console.log(`Instant check: mark/unmark drawn on first frame before sending, no animation/transition/spinner; real commit confirmation, one PUT/no GET, stable DOM/position/focus; frames ${JSON.stringify(checkFrames)}`)
  console.log("Trash: real encrypted delete/restore in open, standby and archived states, preserved identity/history/reference, hidden from normal views, reload persistence and restoration focus; both themes at1366/768/390/320px")
  console.log("Permanent deletion: explicit confirmation/cancel in all three states, current ciphertext removes front/history/replay content, other records preserved; real held/lost commit response and explicit retry, reload/focus, both themes at1366/390/320px")
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
