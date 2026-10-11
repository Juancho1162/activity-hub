// Local UI smoke/captures with the installed Brave browser and a disposable profile.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = 'http://127.0.0.1:5174'
const temporary = await mkdtemp(join(tmpdir(), 'activity-lab-browser-'))
const output = new URL('./test-results/', import.meta.url)
const pending = new Map()
const errors = []
const network = []
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let browser, socket, nextId = 0, session
async function until(check, description) {
  const deadline = Date.now() + 15000
  do { if (await check()) return; await pause(70) } while(Date.now() < deadline)
  throw Error(`Timed out: ${description}`)
}
function command(method, params = {}, useSession = true) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`Timeout: ${method}`)) }, 20000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({id, method, params, ...(useSession && session ? {sessionId:session} : {})}))
  })
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true})
  if(result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
async function input(selector, value) {
  await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await pause(80)
}
async function navigate(route, selector) {
  await command('Page.navigate',{url: base + route})
  await until(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), route)
  await evaluate('document.fonts.ready.then(()=>true)')
  await pause(120)
}
const viewport = width => command('Emulation.setDeviceMetricsOverride',{width,height:width>700 ? 1000 : 844,deviceScaleFactor:1,mobile:false})
async function screenshot(name) {
  const shot = await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  await writeFile(new URL(name+'.png',output), Buffer.from(shot.data,'base64'))
}
async function fits(label) {
  const result = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
  assert.ok(result.scroll<=result.width, `${label}: horizontal overflow ${JSON.stringify(result)}`)
}
try {
  await mkdir(output,{recursive:true})
  browser = spawn('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',[
    '--headless','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync',
    '--password-store=basic','--use-mock-keychain',`--user-data-dir=${temporary}`,'--remote-debugging-port=0','about:blank',
  ],{stdio:'ignore'})
  let portFile, launchError
  browser.once('error',error=>{launchError=error})
  await until(async()=>{if(launchError)throw launchError;try{portFile=(await readFile(join(temporary,'DevToolsActivePort'),'utf8')).trim().split('\n');return true}catch{return false}},'Brave starts')
  socket=new WebSocket(`ws://127.0.0.1:${portFile[0]}${portFile[1]}`)
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
  socket.addEventListener('message',({data})=>{
    const message=JSON.parse(data)
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    if(message.method==='Log.entryAdded'&&message.params.entry.level==='error')errors.push(message.params.entry.text)
    if(message.method==='Network.requestWillBeSent')network.push(message.params.request.url)
    const item=pending.get(message.id)
    if(!item)return
    pending.delete(message.id);clearTimeout(item.timer)
    if(message.error)item.reject(Error(message.error.message));else item.resolve(message.result)
  })
  const {targetId}=await command('Target.createTarget',{url:'about:blank'},false)
  session=(await command('Target.attachToTarget',{targetId,flatten:true},false)).sessionId
  for(const domain of ['Page','Runtime','Network','Log'])await command(domain+'.enable')
  await viewport(1440)
  await navigate('/','.gallery')
  await screenshot('gallery-desktop')
  assert.equal(await evaluate('document.querySelectorAll(".concept-card").length'),3)
  for(const width of [390,320]){await viewport(width);await fits(`gallery ${width}`)}
  for(const variant of ['jardin','orbita','cuaderno']) {
    await viewport(1440)
    await navigate(`/?v=${variant}`,'.app-main')
    await fits(`${variant} desktop`)
    await screenshot(variant+'-desktop')
    const first='[role=checkbox].day-check:not(:disabled)'
    const before=await evaluate(`document.querySelector('${first}').getAttribute('aria-checked')`)
    await click(first)
    await until(()=>evaluate(`document.querySelector('${first}').getAttribute('aria-checked')!==${JSON.stringify(before)}`),'toggle')
    const persisted=await evaluate(`localStorage.getItem('activity-lab-v1-${variant}')`)
    await navigate(`/?v=${variant}`,'.app-main')
    assert.notEqual(await evaluate(`document.querySelector('${first}').getAttribute('aria-checked')`),before,'check survives reload')
    assert.equal(await evaluate(`localStorage.getItem('activity-lab-v1-${variant}')`),persisted)
    await click(first)
    await click('.new-front')
    await until(()=>evaluate('!!document.querySelector("dialog[open]")'),'editor')
    await input('.editor-form input',`Frente de prueba ${variant}`)
    await click('.editor-form [type=submit]')
    await until(()=>evaluate('!document.querySelector("dialog[open]")'),'save front')
    await input('[aria-label="Buscar frentes"]',`Frente de prueba ${variant}`)
    assert.equal(await evaluate('document.querySelectorAll(".garden-card,.matrix tbody tr,.notebook-row").length'),1,'search filters new front')
    await click(`[aria-label="Editar Frente de prueba ${variant}"]`)
    await until(()=>evaluate('!!document.querySelector("dialog[open]")'),'edit front')
    await input('.editor-form input',`Frente editado ${variant}`)
    await evaluate('(()=>{const el=document.querySelector(".editor-form select");el.value="standby";el.dispatchEvent(new Event("change",{bubbles:true}))})()')
    await click('.editor-form [type=submit]')
    await until(()=>evaluate('!document.querySelector("dialog[open]")'),'save state')
    assert.equal(await evaluate('document.querySelector(".status-tabs [aria-pressed=true]").textContent.startsWith("En pausa")'),true)
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('activity-lab-v1-${variant}')).some(f=>f.name==='Frente editado ${variant}'&&f.status==='standby')`),true)
    await click('.status-tabs button:first-child')
    await click('.app-nav button:nth-child(2)')
    await until(()=>evaluate('!!document.querySelector(".frequency-row")'),'insights')
    await click('.range-tabs button:last-child')
    assert.equal(await evaluate('document.querySelector(".range-tabs [aria-pressed=true]").textContent'),'30 días')
    await screenshot(variant+'-insights')
    await click('.app-nav button:nth-child(3)')
    await until(()=>evaluate('document.querySelectorAll(".history-entry").length===14'),'history')
    await click('.history-entry:nth-child(2)')
    await until(()=>evaluate('document.querySelector(".app-nav [aria-current]").textContent.includes("Mi")'),'history opens daily log')
    await click('.today-button')
    if(variant==='jardin') {
      await click('.focus-button')
      await until(()=>evaluate('!!document.querySelector(".focus-content")'),'focus mode')
      const name=await evaluate('document.querySelector(".focus-content h3").textContent')
      await click('.focus-navigation button:last-child')
      assert.notEqual(await evaluate('document.querySelector(".focus-content h3").textContent'),name)
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
      await until(()=>evaluate('!document.querySelector("dialog[open]")'),'escape closes modal')
    }
    if(variant==='cuaderno') {
      await click('.list-intro input')
      assert.equal(await evaluate('[...document.querySelectorAll(".notebook-row .day-check")].every(el=>el.getAttribute("aria-checked")==="false")'),true)
      await click('.list-intro input')
    }
    for(const width of [390,320]) {
      await viewport(width)
      await fits(`${variant} ${width}`)
      if(width===390)await screenshot(variant+'-mobile')
      await click('.new-front')
      await until(()=>evaluate('!!document.querySelector("dialog[open]")'),'mobile dialog')
      assert.equal(await evaluate('(()=>{const r=document.querySelector("dialog").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()'),true)
      await click('dialog [aria-label="Cerrar"]')
    }
    await viewport(1440)
    await click('.sidebar-bottom button:first-child')
    await until(()=>evaluate('!!document.querySelector(".experimental-landing")'),'landing')
    await fits(variant+' landing desktop')
    await screenshot(variant+'-landing')
    if(variant==='jardin') {
      await evaluate('document.querySelector(".garden-live-section").scrollIntoView({block:"center"})')
      await screenshot('jardin-landing-live')
      await evaluate('window.scrollTo(0,0)')
    }
    for(const width of [390,320]) {await viewport(width);await fits(variant+' landing '+width)}
    await click('.landing-composition .primary-button')
    await until(()=>evaluate('!!document.querySelector(".app-main")'),'return from landing')
    await viewport(1440)
    await click('.sidebar-bottom button:nth-child(2)')
    await until(()=>evaluate('!!document.querySelector("dialog[open]")'),'reset confirmation')
    await click('dialog .primary-button')
    await until(()=>evaluate(`JSON.parse(localStorage.getItem('activity-lab-v1-${variant}')).length===6`),'reset only this version')
    console.log(`${variant}: mark/reload/reverse, create/edit/state, search, insights, history, reset, desktop/mobile and landing passed`)
  }
  // Refinement chosen by the user: per-front calendar and a live landing preview.
  await viewport(1440)
  await navigate('/?v=jardin','.app-main')
  const outerDay = await evaluate('document.querySelector("input[type=date]").value')
  const initialGarden = JSON.parse(await evaluate('localStorage.getItem("activity-lab-v1-jardin")'))
  await evaluate('document.querySelector(".garden-history-button").focus()')
  await click('.garden-history-button')
  await until(()=>evaluate('!!document.querySelector(".front-history")'),'front history')
  await screenshot('jardin-front-history')
  assert.equal(await evaluate('document.querySelector(".front-history-summary > div > strong > span").textContent.trim()'),`/ ${Number(outerDay.slice(-2))}`,'current month counts through today')
  assert.equal(await evaluate('document.querySelector(".front-history-toolbar button:last-child").disabled'),true)
  const targetDay = await evaluate('document.querySelector(".front-month-grid button:not(:disabled)").dataset.day')
  await click('.front-month-grid button:not(:disabled)')
  await until(async()=>(await evaluate('localStorage.getItem("activity-lab-v1-jardin")'))!==JSON.stringify(initialGarden),'history check persisted')
  const updatedGarden = JSON.parse(await evaluate('localStorage.getItem("activity-lab-v1-jardin")'))
  assert.notEqual(updatedGarden[0].days.includes(targetDay),initialGarden[0].days.includes(targetDay),'correct date of correct front changes')
  assert.deepEqual(updatedGarden.slice(1),initialGarden.slice(1),'other fronts preserved')
  assert.equal(await evaluate('document.querySelector("input[type=date]").value'),outerDay,'outer date unchanged')
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  assert.equal(await evaluate('document.querySelector("dialog").contains(document.activeElement)'),true,'focus stays inside dialog')
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await until(()=>evaluate('!document.querySelector("dialog[open]")'),'history escape')
  assert.equal(await evaluate('document.activeElement.classList.contains("garden-history-button")'),true,'trigger receives focus back')
  await navigate('/?v=jardin','.app-main')
  assert.deepEqual(JSON.parse(await evaluate('localStorage.getItem("activity-lab-v1-jardin")')),updatedGarden,'detail correction survives reload')
  await click('.garden-history-button')
  await until(()=>evaluate('!!document.querySelector(".front-history")'),'reopened detail')
  await click('.front-month-grid button:not(:disabled)')
  await click('dialog [aria-label="Cerrar"]')
  await input('[aria-label="Fecha del registro"]','2024-02-15')
  await click('.garden-history-button')
  await until(()=>evaluate('document.querySelectorAll(".front-month-grid button").length===29'),'leap-year month')
  const beforeMonthNavigation = await evaluate('localStorage.getItem("activity-lab-v1-jardin")')
  await click('[aria-label="Mes anterior del frente"]')
  await until(()=>evaluate('document.querySelector(".front-history-toolbar h4").textContent.includes("enero")'),'previous month')
  assert.equal(await evaluate('document.querySelectorAll(".front-month-grid button").length'),31)
  assert.equal(await evaluate('localStorage.getItem("activity-lab-v1-jardin")'),beforeMonthNavigation,'month browsing is read-only')
  await click('dialog [aria-label="Cerrar"]')
  await click('.today-button')
  const otherVariants = await evaluate('[localStorage.getItem("activity-lab-v1-orbita"),localStorage.getItem("activity-lab-v1-cuaderno")]')
  await click('.sidebar-bottom button:first-child')
  await until(()=>evaluate('!!document.querySelector(".garden-live-row")'),'live landing demo')
  const previewBefore = await evaluate('document.querySelector(".garden-live-row .day-check").getAttribute("aria-checked")')
  await click('.garden-live-row .day-check')
  await until(async()=>(await evaluate('document.querySelector(".garden-live-row .day-check").getAttribute("aria-checked")'))!==previewBefore,'landing marks day')
  await click('.garden-live-open')
  await until(()=>evaluate('!!document.querySelector(".garden-card")'),'enter garden from live preview')
  assert.notEqual(await evaluate('document.querySelector(".garden-card .day-check").getAttribute("aria-checked")'),previewBefore,'landing and app share the same demo')
  assert.deepEqual(await evaluate('[localStorage.getItem("activity-lab-v1-orbita"),localStorage.getItem("activity-lab-v1-cuaderno")]'),otherVariants,'other versions unchanged')
  await click('.garden-card .day-check')
  console.log('Jardín refinement: monthly editing/persistence, leap year, focus, read-only browsing and live landing passed')

  await viewport(390)
  await navigate('/?v=jardin','.app-main')
  await input('[aria-label="Fecha del registro"]','0001-01-01')
  assert.notEqual(await evaluate('document.querySelector("input[type=date]").value'),'0001-01-01','unsupported early date does not enter state')
  await input('[aria-label="Fecha del registro"]','0001-02-01')
  assert.equal(await evaluate('document.querySelector(".date-controls > button:first-child").disabled'),true,'backward navigation stops at supported boundary')
  await click('.app-nav button:nth-child(2)')
  await click('.range-tabs button:last-child')
  await until(()=>evaluate('!!document.querySelector(".frequency-row")'),'earliest date supports a 30-day window')
  await click('.app-nav button:nth-child(3)')
  assert.equal(await evaluate('document.querySelectorAll(".history-entry:disabled").length'),13)
  await navigate('/?v=cuaderno','.app-main')
  await input('[aria-label="Fecha del registro"]','0001-02-01')
  assert.equal(await evaluate('document.querySelector(".calendar-heading button:first-child").disabled'),true)

  // A valid user-written name must wrap, including inside the history's flex tags.
  await navigate('/?v=jardin','.app-main')
  await click('.new-front')
  await until(()=>evaluate('!!document.querySelector("dialog[open]")'),'long name editor')
  await input('.editor-form input','X'.repeat(100))
  await click('.editor-form [type=submit]')
  await until(()=>evaluate('!document.querySelector("dialog[open]")'),'long name saved')
  await input('[aria-label="Buscar frentes"]','X'.repeat(100))
  await click('[role=checkbox].day-check')
  await click('.app-nav button:nth-child(3)')
  await until(()=>evaluate('!!document.querySelector(".history-tag")'),'long name history')
  for(const width of [390,320]) {await viewport(width);await fits('100-character history name '+width)}
  await click('.app-nav button:first-child')
  await click('.garden-history-button')
  await until(()=>evaluate('!!document.querySelector(".front-history")'),'long-name detail')
  for(const width of [390,320]) {
    await viewport(width)
    await fits('100-character front detail '+width)
    assert.equal(await evaluate('(()=>{const r=document.querySelector("dialog").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()'),true)
  }
  await screenshot('jardin-front-history-mobile')
  console.log('Regression checks: early dates/navigation and 100-character mobile history names passed')
  assert.deepEqual(errors,[],'no browser errors')
  assert.deepEqual(network.filter(url=>/^https?:/.test(url)&&!url.startsWith(base+'/')),[],'experiments request local assets only')
  assert.deepEqual(network.filter(url=>/\/(auth|api)\//.test(url)),[],'no account/API calls')
  console.log('All browser checks passed at 1440, 390 and 320 px. Captures: experiments/local-lab/test-results/')
} finally {
  socket?.close()
  for(const item of pending.values())clearTimeout(item.timer)
  if(browser?.exitCode===null)browser.kill('SIGTERM')
  if(browser)await until(()=>browser.exitCode!==null||browser.signalCode!==null,'browser exits')
  await rm(temporary,{recursive:true,force:true})
}
