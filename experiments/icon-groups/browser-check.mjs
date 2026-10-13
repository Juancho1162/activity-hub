// Local UI smoke/captures with the installed Brave browser and a disposable profile.
import assert from 'node:assert/strict'
import { seed, summarize, shiftDay } from './src/model.mjs'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = 'http://127.0.0.1:5175'
const temporary = await mkdtemp(join(tmpdir(), 'icon-groups-browser-'))
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
  const saved = variant => evaluate(`JSON.parse(localStorage.getItem('activity-icon-groups-v1-${variant}'))`)
  const select = async (selector, value) => { await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`); await pause(80) }
  const log = () => click('.app-sidebar nav button:first-child')
  const dashboard = () => click('.app-sidebar nav button:last-child')
  const close = () => click('dialog [aria-label="Cerrar"]')
  await viewport(1440)
  await navigate('/', '.gallery')
  await evaluate(`localStorage.setItem('activity-lab-v1-jardin','previous-demo-sentinel');localStorage.setItem('unrelated-key','preserve-me')`)
  assert.equal(await evaluate('document.querySelectorAll(".concept-card").length'),3)
  await screenshot('gallery-desktop')
  for(const width of [390,320]){await viewport(width);await fits('gallery '+width)}
  await viewport(1440)
  await navigate('/?compare=1','.comparison')
  await until(()=>evaluate('[...document.querySelectorAll("iframe")].every(f=>f.contentDocument?.querySelector(".app-main"))'),'three embedded apps')
  assert.equal(await evaluate('document.querySelectorAll("iframe").length'),3)
  await screenshot('comparison-desktop')
  for(const width of [390,320]){await viewport(width);await fits('comparison '+width)}

  for(const variant of ['matriz','semana','panorama']) {
    await viewport(1440)
    await navigate('/?v='+variant,'.app-main')
    const day=await evaluate('document.querySelector("#selected-day").value')
    const initial=seed(day)
    assert.deepEqual(await saved(variant),initial,'same starting fixtures')
    assert.equal(await evaluate(`!!document.querySelector('.dashboard-${variant === 'matriz' ? 'matrix' : variant === 'semana' ? 'week' : 'panorama'}')`),true)
    const range={matriz:14,semana:7,panorama:30}[variant]
    const expected=summarize(initial,shiftDay(day,1-range),day)
    const summary=await evaluate('[...document.querySelectorAll(".summary-strip > div > strong")].map(el=>el.textContent)')
    assert.deepEqual(summary,[expected.activeDays+' / '+range,String(expected.checkCount),String(expected.activeFronts)])
    await fits(variant+' dashboard desktop')
    await screenshot(variant+'-dashboard-desktop')
    if(variant==='matriz') {
      await click('.group-expand')
      assert.equal(await evaluate('document.querySelectorAll(".matrix-front").length'),4,'group expands its fronts')
      await click('.group-expand')
    }
    const cell={matriz:'.matrix-cell',semana:'.day-card',panorama:'.panorama-day'}[variant]
    await evaluate(`document.querySelector(${JSON.stringify(cell)}).focus()`)
    await click(cell)
    await until(()=>evaluate('!!document.querySelector("dialog[open]")'),'read-only day detail')
    assert.deepEqual(await saved(variant),initial,'chart detail does not write')
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
    assert.equal(await evaluate('document.querySelector("dialog").contains(document.activeElement)'),true)
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
    await until(()=>evaluate('!document.querySelector("dialog[open]")'),'Escape closes')
    assert.equal(await evaluate(`document.activeElement.matches(${JSON.stringify(cell)})`),true,'focus restored')
    await click(cell)
    await click('dialog .primary-button')
    assert.equal(await evaluate('document.querySelector("#selected-day").value'),shiftDay(day,1-range),'detail opens chosen log date')
    await click('.today-button')
    await select('[aria-label="Filtrar por grupo"]','all')
    assert.equal(await evaluate('document.querySelectorAll(".log-group").length'),5)
    assert.equal(await evaluate('document.querySelector(".filtered-count").textContent'),'15 frentes · 5 grupos')
    await screenshot(variant+'-log-desktop')
    await click('[data-record-group="book"]')
    await until(async()=>!(await saved(variant)).some(f=>f.icon==='book'&&f.status==='open'&&!f.days.includes(day)),'record pending group')
    const recorded=await saved(variant)
    assert.deepEqual(recorded.filter(f=>f.icon!=='book'||f.status!=='open'),initial.filter(f=>f.icon!=='book'||f.status!=='open'),'others including standby/archive unchanged')
    for(const front of recorded.filter(f=>f.icon==='book'&&f.status==='open')) assert.deepEqual(front.days,[...new Set([...initial.find(f=>f.id===front.id).days,day])].sort())
    assert.equal(await evaluate('document.querySelector("[data-record-group=book]").disabled'),true,'fully recorded is a no-op')
    await screenshot(variant+'-group-recorded')
    await click('.undo-group')
    await until(async()=>JSON.stringify(await saved(variant))===JSON.stringify(initial),'selective undo restores exact snapshot')
    await input('[aria-label="Buscar frentes"]','Club')
    assert.equal(await evaluate('document.querySelector(".record-group").disabled'),true,'search cannot batch hidden fronts')
    await input('[aria-label="Buscar frentes"]','')
    await input('#selected-day','2024-02-29')
    await click('[data-record-group="code"]')
    const past=await saved(variant)
    for(const front of past)assert.deepEqual(front.days,front.icon==='code'&&front.status==='open'?[...initial.find(f=>f.id===front.id).days,'2024-02-29'].sort():initial.find(f=>f.id===front.id).days)
    await click('.undo-group')
    assert.deepEqual(await saved(variant),initial)
    await input('#selected-day',shiftDay(day,1))
    assert.notEqual(await evaluate('document.querySelector("#selected-day").value'),shiftDay(day,1),'future date rejected')
    await click('.today-button')
    await click('[data-front="sample-book-2"] .day-check')
    assert.equal((await saved(variant)).find(f=>f.id==='sample-book-2').days.includes(day),true)
    await click('[data-front="sample-book-2"] .day-check')
    assert.deepEqual(await saved(variant),initial)

    // Changing an icon moves its existing history into the new group.
    await click('[data-front="sample-book-2"] .edit-front')
    await click('[data-icon-option="music"]')
    await click('.editor-form [type=submit]')
    await until(()=>evaluate('!document.querySelector("dialog[open]")'),'saved icon')
    const moved=await saved(variant)
    assert.deepEqual(moved.find(f=>f.id==='sample-book-2'),{...initial.find(f=>f.id==='sample-book-2'),icon:'music'})
    assert.equal(await evaluate('document.querySelector("[data-front=sample-book-2]").closest(".log-group").dataset.group'),'music')
    await navigate('/?v='+variant,'.app-main')
    assert.deepEqual(await saved(variant),moved,'own data persists after reload')
    await log()
    await select('[aria-label="Estado de los frentes"]','standby')
    assert.equal(await evaluate('document.querySelectorAll(".record-group").length'),0)
    assert.equal(await evaluate('[...document.querySelectorAll(".day-check")].every(el=>el.disabled)'),true)
    await select('[aria-label="Estado de los frentes"]','archived')
    assert.equal(await evaluate('document.querySelectorAll(".record-group").length'),0)
    await select('[aria-label="Estado de los frentes"]','open')

    for(const width of [768,390,320]) {
      await viewport(width)
      await fits(variant+' log '+width)
      if(width===390) await screenshot(variant+'-log-mobile')
      await dashboard()
      await fits(variant+' dashboard '+width)
      if(width===390) await screenshot(variant+'-dashboard-mobile')
      await click(cell)
      assert.equal(await evaluate('(()=>{const r=document.querySelector("dialog").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()'),true)
      await close()
      await log()
    }
    await click('.new-front')
    await input('#front-name','X'.repeat(200))
    await click('[data-icon-option="art"]')
    await click('.editor-form [type=submit]')
    await until(()=>evaluate('!document.querySelector("dialog[open]")'),'create 200-character name')
    await fits(variant+' long name log')
    await dashboard()
    await fits(variant+' long name dashboard')
    await click('.range-tabs button:last-child')
    await input('#selected-day','0001-03-01')
    assert.equal(await evaluate(`document.querySelector('[aria-label="Día anterior"]').disabled`),true)
    assert.equal(await evaluate('document.querySelector(".summary-strip strong").textContent'),'0 / 30','earliest date supports full window')
    await click('.today-button')
    await select('[aria-label="Filtrar por grupo"]','art')
    await log()
    await click('.edit-front')
    await click('[data-icon-option="music"]')
    await click('.editor-form [type=submit]')
    await until(()=>evaluate(`document.querySelector('[aria-label="Filtrar por grupo"]').value==='all'`),'last front moves: obsolete filter cleared')
    const edited=await saved(variant)
    const otherKeys=await evaluate(`Object.fromEntries(Object.entries(localStorage).filter(([key])=>key!=='activity-icon-groups-v1-${variant}'))`)
    await click('.reset-demo')
    await close()
    assert.deepEqual(await saved(variant),edited,'cancel reset preserves data')
    await click('.reset-demo')
    await click('.confirm-reset')
    await until(async()=>JSON.stringify(await saved(variant))===JSON.stringify(initial),'reset current variant')
    assert.deepEqual(await evaluate(`Object.fromEntries(Object.entries(localStorage).filter(([key])=>key!=='activity-icon-groups-v1-${variant}'))`),otherKeys,'reset cannot alter other demos')
    console.log(variant+': dashboard totals, detail/focus, bulk/undo/past day, search, icon move/history, state, persistence, mobile, long names, earliest date and isolated reset PASS')
  }
  // A whitespace-only search must not hide a one-word front while enabling bulk write.
  await navigate('/?v=matriz','.app-main')
  await log()
  await click('.new-front')
  await input('#front-name','Solo')
  await click('[data-icon-option="book"]')
  await click('.editor-form [type=submit]')
  await until(()=>evaluate('!document.querySelector("dialog[open]")'),'one-word front saved')
  const beforeWhitespace=await saved('matriz')
  await input('[aria-label="Buscar frentes"]',' ')
  assert.equal(await evaluate('[...document.querySelectorAll(".front-row h3")].some(el=>el.textContent==="Solo")'),true,'whitespace-only search must show the full group, including one-word names')
  assert.equal(await evaluate('document.querySelector("[data-record-group=book]").disabled'),false)
  await click('[data-record-group="book"]')
  await until(async()=>(await saved('matriz')).find(f=>f.name==='Solo').days.length===1,'visible Solo included in group')
  await click('.undo-group')
  assert.deepEqual(await saved('matriz'),beforeWhitespace,'whitespace search group undo preserves prior data')
  console.log('Whitespace-only search preserves visibility before bulk registration: PASS')
  assert.equal(await evaluate('localStorage.getItem("activity-lab-v1-jardin")'),'previous-demo-sentinel')
  assert.equal(await evaluate('localStorage.getItem("unrelated-key")'),'preserve-me')
  await evaluate(`(()=>{const key='activity-icon-groups-v1-matriz';const fronts=JSON.parse(localStorage.getItem(key));fronts[0].icon='__proto__';localStorage.setItem(key,JSON.stringify(fronts))})()`)
  await navigate('/?v=matriz','.app-main')
  assert.equal(await evaluate('document.querySelectorAll(".matrix-group").length'),6,'future icon uses fallback without merging groups or crashing')
  await log()
  await click('[data-record-group="__proto__"]')
  assert.equal(await evaluate('document.querySelector("[data-group=__proto__]")!==null'),true)
  assert.deepEqual(errors,[],'no browser errors')
  assert.deepEqual(network.filter(url=>/^https?:/.test(url)&&!url.startsWith(base+'/')),[],'local assets only')
  assert.deepEqual(network.filter(url=>/\/(auth|api)\//.test(url)),[],'no account/API calls')
  console.log('All browser checks passed at 1440, 768, 390 and 320 px. Captures: experiments/icon-groups/test-results/')
} finally {
  socket?.close()
  for(const item of pending.values())clearTimeout(item.timer)
  if(browser?.exitCode===null)browser.kill('SIGTERM')
  if(browser)await until(()=>browser.exitCode!==null||browser.signalCode!==null,'browser exits')
  await rm(temporary,{recursive:true,force:true})
}
