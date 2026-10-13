// Local UI smoke/captures with the installed Brave browser and a disposable profile.
import assert from 'node:assert/strict'
import { seed, summarize, shiftDay } from './src/custom-model.mjs'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = 'http://127.0.0.1:5175'
const temporary = await mkdtemp(join(tmpdir(), 'custom-groups-browser-'))
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

  const saved = () => evaluate("JSON.parse(localStorage.getItem('activity-garden-custom-groups-v1'))")
  const select = async (selector, value) => { await evaluate("(()=>{const el=document.querySelector("+JSON.stringify(selector)+");el.value="+JSON.stringify(value)+";el.dispatchEvent(new Event('change',{bubbles:true}));})()"); await pause(80) }
  const log = () => click('.app-sidebar nav button:first-child')
  const dashboard = () => click('.app-sidebar nav button:last-child')
  const close = () => click('dialog [aria-label="Cerrar"]')
  const groupButton = id => '[data-record-group="'+id+'"]'
  const row = id => '[data-front="'+id+'"]'
  const createGroup = async (name, icon) => {
    await click('.manage-groups')
    await click('.create-group')
    assert.equal(await evaluate('document.querySelector("[data-icon-option=coffee]")===null'),true,'no Coffee in new options')
    await input('#group-name',name)
    await click('[data-icon-option="'+icon+'"]')
    await click('.group-form [type=submit]')
    await until(()=>evaluate('!!document.querySelector(".group-manager-list")'),'group saved')
    await close()
    return (await saved()).groups.find(group=>group.name===name)
  }
  await viewport(1440)
  await navigate('/','.gallery')
  assert.equal(await evaluate('document.querySelector(".chosen-proposal").getAttribute("href")'),'/?v=combinada')
  await evaluate("for(const v of ['matriz','semana','panorama'])localStorage.setItem('activity-icon-groups-v1-'+v,'preserve-'+v)")
  await navigate('/?v=combinada','.variant-combinada')
  const day=await evaluate('document.querySelector("#selected-day").value')
  const initial=seed(day)
  assert.deepEqual(await saved(),initial)
  assert.deepEqual(initial.groups.map(group=>group.name),['Personal','Proyectos','Aprendizaje','Salud','Creatividad'])
  assert.equal(await evaluate('document.querySelectorAll(".matrix-group").length'),5)
  const stats=summarize(initial,shiftDay(day,-13),day)
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".summary-strip > div > strong")].map(el=>el.textContent)'),[stats.activeDays+' / 14',String(stats.checkCount),String(stats.activeFronts)])
  await screenshot('combinada-dashboard-desktop')
  await log()
  assert.equal(await evaluate('!!document.querySelector(".log-semana")'),true,'selected weekly log')
  await screenshot('combinada-log-desktop')
  const first=initial.groups[0],second=initial.groups[1]
  await click(groupButton(first.id))
  await until(async()=>!(await saved()).fronts.some(front=>front.groupId===first.id&&front.status==='open'&&!front.days.includes(day)),'first group recorded')
  assert.deepEqual((await saved()).fronts.filter(front=>front.groupId!==first.id||front.status!=='open'),initial.fronts.filter(front=>front.groupId!==first.id||front.status!=='open'))
  await click('.undo-group')
  assert.deepEqual(await saved(),initial,'initial group undo is exact')

  await click('.manage-groups')
  await screenshot('combinada-groups')
  await click('[data-managed-group="'+first.id+'"] button')
  await input('#group-name','Casa')
  await click('[data-icon-option="'+second.icon+'"]')
  await click('.group-form [type=submit]')
  await until(()=>evaluate('!!document.querySelector(".group-manager-list")'),'renamed group')
  await close()
  const renamed=await saved()
  assert.deepEqual(renamed.fronts,initial.fronts,'renaming/icon change preserves every front and history')
  assert.equal(renamed.groups.find(group=>group.id===first.id).name,'Casa')
  assert.equal(renamed.groups.filter(group=>group.icon===second.icon).length,2,'duplicate icons allowed')
  const custom=await createGroup('Proyecto compartido',second.icon)
  assert.equal((await saved()).groups.filter(group=>group.icon===second.icon).length,3)
  await dashboard()
  assert.equal(await evaluate('document.querySelectorAll(".matrix-group").length'),6,'empty group visible and same-icon groups separated')
  await click('.matrix-group:nth-child(1) .group-expand')
  await evaluate('document.querySelectorAll(".matrix-group .group-expand")[1].click()')
  assert.equal(await evaluate('document.querySelectorAll(".group-expand[aria-expanded=true]").length'),2,'same-icon expansion is independent')
  assert.equal(await evaluate('document.querySelectorAll(".matrix-front").length'),initial.fronts.filter(front=>[first.id,second.id].includes(front.groupId)).length)
  await evaluate('document.querySelectorAll(".matrix-group .group-expand")[0].click()')
  assert.equal(await evaluate('document.querySelectorAll(".group-expand[aria-expanded=true]").length'),1,'first same-icon group collapses independently')
  assert.equal(await evaluate('document.querySelectorAll(".matrix-front").length'),initial.fronts.filter(front=>front.groupId===second.id).length)
  await evaluate('document.querySelectorAll(".matrix-group .group-expand")[1].click()')
  assert.equal(await evaluate('document.querySelectorAll(".matrix-front").length'),0,'second same-icon group collapses too')
  await log()

  await click('.new-front')
  await input('#front-name','Solo')
  await select('#front-group',custom.id)
  await click('.front-form [type=submit]')
  await until(()=>evaluate('!document.querySelector("dialog[open]")'),'new front saved')
  const moving=initial.fronts.find(front=>front.groupId===second.id&&front.status==='open')
  await click(row(moving.id)+' .edit-front')
  await select('#front-group',custom.id)
  await click('.front-form [type=submit]')
  await until(()=>evaluate('!document.querySelector("dialog[open]")'),'front moved')
  assert.deepEqual((await saved()).fronts.find(front=>front.id===moving.id),{...moving,groupId:custom.id},'move changes only group reference')
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(row(moving.id))+').closest(".log-group").dataset.group'),custom.id)
  await input('[aria-label="Buscar frentes"]',' ')
  assert.equal(await evaluate('[...document.querySelectorAll(".front-row h3")].some(el=>el.textContent==="Solo")'),true,'whitespace search never hides a front while enabling bulk')
  await input('[aria-label="Buscar frentes"]','Solo')
  assert.equal(await evaluate('document.querySelector(".record-group").disabled'),true)
  await input('[aria-label="Buscar frentes"]','')
  await input('#selected-day','2024-02-29')
  const beforeBulk=await saved()
  await click(groupButton(custom.id))
  await until(async()=>(await saved()).fronts.find(front=>front.name==='Solo').days.includes('2024-02-29'),'custom pack recorded')
  const packed=await saved()
  for(const front of packed.fronts) {
    const before=beforeBulk.fronts.find(item=>item.id===front.id)
    assert.deepEqual(front.days,front.groupId===custom.id&&front.status==='open'?[...new Set([...before.days,'2024-02-29'])].sort():before.days,'group ID defines exact pack even with repeated icon')
  }
  assert.deepEqual(packed.groups,beforeBulk.groups)
  await dashboard()
  assert.equal(await evaluate('document.querySelector(".summary-strip strong").textContent'),'1 / 14')
  await click('.undo-group')
  assert.deepEqual(await saved(),beforeBulk)
  await click('.matrix-cell')
  assert.deepEqual(await saved(),beforeBulk,'matrix detail is read-only')
  await click('dialog .primary-button')
  await select('[aria-label="Filtrar por grupo"]','')
  await click('.today-button')
  const solo=(await saved()).fronts.find(front=>front.name==='Solo')
  await click(row(solo.id)+' .day-check')
  assert.equal((await saved()).fronts.find(front=>front.id===solo.id).days.includes(day),true)
  await click(row(solo.id)+' .day-check')
  assert.deepEqual(await saved(),beforeBulk,'individual toggle targets exact front')
  await click(row(solo.id)+' .edit-front')
  await select('#front-status','standby')
  await click('.front-form [type=submit]')
  await until(()=>evaluate('!document.querySelector("dialog[open]")'),'pause state saved')
  assert.equal(await evaluate('[...document.querySelectorAll(".day-check")].every(button=>button.disabled)'),true)
  await select('[aria-label="Estado de los frentes"]','open')
  const savedState=await saved()
  await navigate('/?v=combinada','.variant-combinada')
  assert.deepEqual(await saved(),savedState,'custom groups and references survive reload')

  // Both native dialogs and the chosen layout must remain usable on narrow screens.
  for(const width of [1440,768,390,320]) {
    await viewport(width)
    await fits('combined dashboard '+width)
    if(width===390) await screenshot('combinada-dashboard-mobile')
    await click('.manage-groups')
    assert.equal(await evaluate('(()=>{const r=document.querySelector("dialog").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()'),true)
    await click('.create-group')
    if(width===390) await screenshot('combinada-new-group-mobile')
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
    assert.equal(await evaluate('document.querySelector("dialog").contains(document.activeElement)'),true)
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
    await until(()=>evaluate('!document.querySelector("dialog[open]")'),'Escape closes group manager')
    await log()
    await fits('combined log '+width)
    if(width===390) await screenshot('combinada-log-mobile')
    await dashboard()
  }
  const longGroup=await createGroup('G'.repeat(60),'book')
  await select('[aria-label="Filtrar por grupo"]',longGroup.id)
  await fits('long group matrix 320')
  await log()
  await fits('long group log 320')
  await click('.empty-group button')
  await input('#front-name','F'.repeat(200))
  await click('.front-form [type=submit]')
  await until(()=>evaluate('!document.querySelector("dialog[open]")'),'long front saved')
  await fits('long front log 320')
  await dashboard()
  await click('.group-expand')
  await fits('long group/front matrix 320')
  await input('#selected-day',shiftDay(day,1))
  assert.notEqual(await evaluate('document.querySelector("#selected-day").value'),shiftDay(day,1))
  await input('#selected-day','0001-03-01')
  await click('.range-tabs button:last-child')
  assert.equal(await evaluate('document.querySelector(".summary-strip strong").textContent'),'0 / 30')
  assert.equal(await evaluate('document.querySelector("[aria-label=\\"Día anterior\\"]").disabled'),true)
  const beforeReset=await saved()
  await click('.footer-reset')
  await close()
  assert.deepEqual(await saved(),beforeReset)
  await click('.footer-reset')
  await click('.confirm-reset')
  await until(async()=>JSON.stringify(await saved())===JSON.stringify(initial),'only combined demo reset')
  for(const variant of ['matriz','semana','panorama'])assert.equal(await evaluate("localStorage.getItem('activity-icon-groups-v1-"+variant+"')"),'preserve-'+variant)
  assert.deepEqual(errors,[],'no browser errors')
  assert.deepEqual(network.filter(url=>/^https?:/.test(url)&&!url.startsWith(base+'/')),[],'local assets only')
  assert.deepEqual(network.filter(url=>/\/(auth|api)\//.test(url)),[],'no account/API calls')
  console.log('Combined demo PASS: chosen views; basic/custom/empty groups; repeated-icon independence; rename, move and reload preserve history; exact group/individual log and undo; search/state guards; mobile/dialogs; long names; dates; isolated reset; no account requests.')
} finally {
  socket?.close()
  for(const item of pending.values())clearTimeout(item.timer)
  if(browser?.exitCode===null)browser.kill('SIGTERM')
  if(browser)await until(()=>browser.exitCode!==null||browser.signalCode!==null,'browser exits')
  await rm(temporary,{recursive:true,force:true})
}

