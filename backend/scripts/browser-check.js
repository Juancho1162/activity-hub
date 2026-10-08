// Real Firefox -> encrypted React client -> workerd -> disposable D1.
// Uses only its own browser profile; generated access data stays in memory.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fixture, root } from '../tests/fixture.js';

const temporary = await mkdtemp(path.join(tmpdir(), 'activity-hub-d1-browser-'));
const profile = path.join(temporary, 'profile');
const output = path.join(root, 'test-results');
const cleanup = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  const deadline = Date.now() + 20000;
  do { if (await check()) return; await pause(100); } while (Date.now() < deadline);
  throw new Error(`Timed out: ${label}`);
}
let socket, browser;
try {
  const { url, DB } = await fixture({ after: callback => cleanup.push(callback) }, { assets: true, webOrigin: null, legacy: false });
  const origin = url.origin;
  assert.equal((await fetch(`${origin}/health`)).status, 200);
  const portServer = createServer().listen(0, '127.0.0.1');
  await once(portServer, 'listening');
  const port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));
  await mkdir(profile);
  await mkdir(output, { recursive: true });
  await writeFile(path.join(profile, 'user.js'), [
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("browser.startup.homepage", "about:blank");',
    'user_pref("intl.accept_languages", "es-ES, es");',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("datareporting.healthreport.uploadEnabled", false);',
    'user_pref("toolkit.telemetry.enabled", false);',
    'user_pref("app.normandy.enabled", false);',
    'user_pref("network.captive-portal-service.enabled", false);',
  ].join('\n'));
  browser = spawn('/Applications/Firefox.app/Contents/MacOS/firefox', [
    '--headless', '--no-remote', '--new-instance', '--profile', profile, '--remote-debugging-port', String(port),
  ], { env: { PATH: '/usr/bin:/bin:/opt/homebrew/bin', HOME: temporary }, stdio: 'ignore' });
  await waitFor(async () => {
    try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).status !== 0; } catch { return false; }
  }, 'Firefox BiDi listener');
  socket = new WebSocket(`ws://127.0.0.1:${port}/session`);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0, onEvent = () => {};
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === 'event') { onEvent(message); return; }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id); clearTimeout(entry.timer);
    // Do not print protocol payloads: they may include generated access data.
    if (message.type === 'error') entry.reject(new Error(`BiDi command failed: ${entry.method}`));
    else entry.resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`BiDi timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer, method });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await command('session.new', { capabilities: { alwaysMatch: {} } });
  await command('session.subscribe', { events: ['network.responseStarted'] });
  const { context } = await command('browsingContext.create', { type: 'tab' });
  async function evaluate(expression, ctx = context) {
    const result = await command('script.evaluate', { expression, target: { context: ctx }, awaitPromise: true });
    if (result.type !== 'success') throw new Error('Browser assertion evaluation failed');
    return result.result.value;
  }
  const navigate = (ctx = context) => command('browsingContext.navigate', { context: ctx, url: origin, wait: 'complete' });
  const click = async (label, ctx = context) => {
    await waitFor(() => evaluate(`([...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(label)} && !b.disabled))`, ctx), `enabled ${label}`);
    return evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click(), true)`, ctx);
  };
  const input = (id, value, ctx = context) => evaluate(`(() => {
    const el=document.getElementById(${JSON.stringify(id)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});
    el.dispatchEvent(new Event('input',{bubbles:true}));return true;
  })()`, ctx);
  const login = async (code, ctx = context) => { await input('access-code', code, ctx); await click('Entrar', ctx); };
  const currentAccount = (ctx = context) => evaluate("fetch('/auth/session').then(r=>r.json()).then(p=>p.account_id)", ctx);
  // Independent test oracle: decrypt only our synthetic accounts in memory.
  const codes = new Map();
  async function api(route, ctx = context) {
    const id = await currentAccount(ctx);
    const result = JSON.parse(await evaluate(`(async()=>{
      const r=await fetch('/api/vault',{headers:{'X-Activity-Account':${JSON.stringify(id)}}});
      return JSON.stringify({status:r.status,body:await r.json()});
    })()`, ctx));
    if (result.status !== 200) return result;
    const box = result.body;
    const normalized = codes.get(id).replaceAll('-', '').toUpperCase();
    const encoder = new TextEncoder();
    const material = await crypto.subtle.importKey('raw', encoder.encode(normalized), 'HKDF', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode('activity-hub:private-storage:v1'),info:encoder.encode('content-encryption')},material,{name:'AES-GCM',length:256},false,['decrypt']);
    const bytes = await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(box.iv,'base64'),additionalData:encoder.encode(`activity-hub:vault:v1:${id}:${box.version}`),tagLength:128},key,Buffer.from(box.ciphertext,'base64'));
    const content = JSON.parse(new TextDecoder().decode(bytes));
    const query = new URL(route, origin);
    const items = query.pathname === '/api/history'
      ? content.checks.filter(ch=>ch.day>=query.searchParams.get('start') && ch.day<=query.searchParams.get('end'))
      : content.fronts.filter(f=>!query.searchParams.has('search') || f.name.includes(query.searchParams.get('search')));
    return {status:200,body:{items,total:items.length},version:box.version};
  }
  async function createAccount(ctx = context) {
    await click('Crear cuenta', ctx);
    await waitFor(() => evaluate("document.getElementById('signup-code')!==null", ctx), 'signup code');
    const code = await evaluate("document.getElementById('signup-code').value", ctx);
    assert.equal(await evaluate("fetch('/auth/session').then(r=>r.status)", ctx), 401);
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Entrar en mi cuenta').disabled", ctx), true);
    await evaluate("document.getElementById('saved-code').click()", ctx);
    await click('Entrar en mi cuenta', ctx);
    await waitFor(() => evaluate("document.body.textContent.includes('No hay frentes en esta vista')", ctx), 'empty private account');
    codes.set(await currentAccount(ctx), code);
    return code;
  }
  async function screenshot(name, width) {
    // Captures only fictional activity, never signup/login codes.
    await command('browsingContext.setViewport', { context, viewport: { width, height: 900 }, devicePixelRatio: 1 });
    await evaluate('document.fonts.ready.then(()=>true)');
    await pause(100);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false, 'horizontal overflow');
    const shot = await command('browsingContext.captureScreenshot', { context, origin: 'viewport' });
    await writeFile(path.join(output, `${name}.png`), Buffer.from(shot.data, 'base64'));
  }
  await navigate();
  await waitFor(() => evaluate("document.querySelector('#access-code')!==null"), 'access screen');
  const codeA = await createAccount();
  const accountA = await currentAccount();
  assert.equal(await evaluate("document.cookie.includes('activity_hub_session')"), false, 'HttpOnly cookie');
  await click('Nuevo frente');
  await waitFor(() => evaluate("document.activeElement?.id==='front-name'"), 'create editor');
  await input('front-name', 'Guitarra D1');
  await input('front-reference', 'https://example.test/material');
  await click('Crear frente');
  await waitFor(() => evaluate("document.querySelectorAll('.activity-check[role=checkbox]').length===1 && !document.querySelector('[role=dialog]')"), 'created front');
  await waitFor(() => evaluate("document.querySelector('.activity-check[role=checkbox]').getAttribute('aria-disabled')==='false'"), 'check ready after refresh');
  await evaluate("document.querySelector('.activity-check[role=checkbox]').click()");
  await waitFor(() => evaluate("document.querySelector('.activity-check[role=checkbox]').getAttribute('aria-checked')==='true' && document.querySelector('.activity-check[role=checkbox]').getAttribute('aria-disabled')==='false'"), 'confirmed check');
  const day = await evaluate("document.getElementById('registration-day').value");
  assert.equal((await api(`/api/history?start=${day}&end=${day}`)).body.total, 1);
  await evaluate("document.querySelector('[aria-label=\"Editar Guitarra D1\"]').click()");
  await waitFor(() => evaluate("document.getElementById('front-reference')!==null"), 'edit reference');
  await input('front-reference', '');
  await click('Guardar cambios');
  await waitFor(() => evaluate("!document.querySelector('[role=dialog]') && !document.querySelector('.reference-link')"), 'reference cleared');
  await input('name-search', 'Guitarra');
  await waitFor(() => evaluate("document.querySelectorAll('.front-card').length===1"), 'literal search');
  await screenshot('daily-desktop', 1366);
  await screenshot('daily-mobile', 390);
  await input('name-search', '');
  await click('Dashboard');
  await waitFor(() => evaluate("document.querySelectorAll('.coverage-value').length===1"), 'dashboard');
  await screenshot('dashboard-desktop', 1366);
  await screenshot('dashboard-mobile', 390);
  assert.equal(await evaluate("performance.getEntriesByType('resource').every(e=>new URL(e.name).origin===location.origin)"), true, 'all app assets local');
  await click('Registro');
  const { context: otherTab } = await command('browsingContext.create', { type: 'tab' });
  await navigate(otherTab);
  await waitFor(() => evaluate("document.querySelector('#access-code')!==null", otherTab), 'second tab requires decryption code');
  assert.equal(await evaluate("document.querySelector('.app-shell')===null", otherTab), true, 'remembered session does not reveal content');
  await click('Cerrar sesión', otherTab); // Closing a remembered session needs no decryption code.
  await waitFor(() => evaluate("document.querySelector('#access-code')!==null", otherTab), 'logout A');
  const codeB = await createAccount(otherTab);
  const accountB = await currentAccount(otherTab);
  assert.ok(accountA !== accountB);
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await waitFor(() => evaluate("document.querySelector('#access-code')!==null"), 'account change requires B key');
  await login(codeB);
  await waitFor(() => evaluate("document.body.textContent.includes('No hay frentes en esta vista')"), 'B remains empty');
  await click('Cerrar sesión');
  await waitFor(() => evaluate("document.querySelector('#access-code')!==null"), 'leave B');
  await login(codeA);
  await waitFor(() => evaluate("document.querySelectorAll('.activity-check[role=checkbox]').length===1"), 'permanent A code reused');

  let committedWrites = 0;
  let blocked = null;
  onEvent = ({ method, params }) => {
    if (method === 'network.responseStarted' && params.context === context && params.isBlocked && params.request.method === 'GET') {
      void command('network.continueResponse', { request: params.request.request });
      return;
    }
    if (method !== 'network.responseStarted' || params.context !== context || params.request.method !== 'PUT' || params.request.url !== `${origin}/api/vault`) return;
    committedWrites++;
    if (params.isBlocked) blocked = params.request.request;
  };
  const held = await command('network.addIntercept', { contexts: [context], phases: ['responseStarted'], urlPatterns: [{ type: 'string', pattern: `${origin}/api/vault` }] });
  await click('Nuevo frente');
  await waitFor(() => evaluate("document.activeElement?.id==='front-name'"), 'uncertain create editor');
  await input('front-name', 'Solicitud pendiente de A');
  await click('Crear frente');
  await waitFor(() => blocked !== null, 'response after D1 commit');
  await command('network.failRequest', { request: blocked });
  await command('network.removeIntercept', { intercept: held.intercept });
  await waitFor(() => evaluate("document.body.textContent.includes('Solicitud sin confirmar')"), 'uncertain request shown');
  assert.equal((await api('/api/fronts?search=Solicitud%20pendiente%20de%20A')).body.total, 1);
  await navigate(otherTab);
  await waitFor(() => evaluate("document.querySelector('#access-code')!==null", otherTab), 'reloaded tab requires A key');
  await login(codeA, otherTab);
  await waitFor(() => evaluate("document.querySelector('.app-shell')!==null", otherTab), 'other tab decrypts A again');
  await click('Cerrar sesión', otherTab);
  await waitFor(() => evaluate("document.querySelector('#access-code')!==null", otherTab), 'revoke A');
  await login(codeB, otherTab);
  await waitFor(() => evaluate("document.body.textContent.includes('No hay frentes en esta vista')", otherTab), 'B still empty');
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await waitFor(() => evaluate("document.querySelector('#access-code')!==null && !document.querySelector('[role=dialog]')"), 'A intent frozen under B');
  await login(codeB);
  await waitFor(() => evaluate("document.querySelector('#access-code')?.disabled===false && document.body.textContent.includes('cuenta original')"), 'wrong account cannot unlock A intent');
  assert.equal((await api('/api/fronts')).body.total, 0);
  await login(codeA);
  await waitFor(() => evaluate("document.querySelector('#front-name')?.value==='Solicitud pendiente de A'"), 'A intent restored');
  await click('Reintentar solicitud');
  await waitFor(() => evaluate("!document.querySelector('[role=dialog]') && document.body.textContent.includes('Solicitud pendiente de A')"), 'explicit retry confirmed');
  assert.equal((await api('/api/fronts?search=Solicitud%20pendiente%20de%20A')).body.total, 1);
  assert.equal(committedWrites, 1, 'encrypted replay confirms the existing commit without writing twice');
  assert.ok(await currentAccount() === accountA);

  let delayedLogout = null;
  onEvent = ({ method, params }) => {
    if (method === 'network.responseStarted' && params.context === context && params.request.url === `${origin}/auth/logout` && params.isBlocked) delayedLogout = params.request.request;
  };
  const logout = await command('network.addIntercept', { contexts: [context], phases: ['responseStarted'], urlPatterns: [{ type: 'string', pattern: `${origin}/auth/logout` }] });
  await click('Cerrar sesión');
  await waitFor(() => delayedLogout !== null, 'hold old logout headers');
  assert.equal(await evaluate("fetch('/auth/session').then(r=>r.status)", otherTab), 401);
  await navigate(otherTab);
  await waitFor(() => evaluate("document.querySelector('#access-code')!==null", otherTab), 'B can replace cookie');
  await login(codeB, otherTab);
  await waitFor(() => evaluate("document.body.textContent.includes('No hay frentes en esta vista')", otherTab), 'B replacement cookie');
  await command('network.continueResponse', { request: delayedLogout });
  await command('network.removeIntercept', { intercept: logout.intercept });
  await waitFor(() => evaluate("document.querySelector('#continue-account')!==null"), 'late logout detects B');
  assert.ok(await currentAccount(otherTab) === accountB, 'late A logout preserves B cookie');
  await click('Continuar con esta cuenta');
  await waitFor(() => evaluate("document.querySelector('#access-code')!==null"), 'B requires its private key');
  await login(codeB);
  await waitFor(() => evaluate("document.body.textContent.includes('No hay frentes en esta vista')"), 'explicitly decrypt B');
  await click('Cerrar sesión');
  await waitFor(() => evaluate("document.querySelector('#access-code')!==null"), 'final logout');
  await navigate();
  await waitFor(() => evaluate("document.querySelector('#access-code')!==null"), 'logout survives reload');
  assert.equal(await evaluate("fetch('/api/fronts').then(r=>r.status)"), 401);
  assert.equal(await evaluate('sessionStorage.length===0 && localStorage.length<=1'), true, 'no persisted access data');
  const counts = await DB.batch(['fronts', 'activity_checks', 'idempotency_requests'].map(table=>DB.prepare(`SELECT count(*) AS n FROM ${table}`)));
  assert.ok(counts.every(row=>row.results[0].n===0), 'no plaintext domain rows or replays in D1');
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM encrypted_vaults').first()).n, 2);
  await command('session.end');
  console.log('PASS Firefox → encrypted React → workerd/D1: signup ACK, create/edit/check/history/dashboard, 1366/390 px, two accounts/tabs, lost committed response, encrypted replay, delayed logout, unlock after reload, no plaintext in D1.');
  console.log(`Fictional activity screenshots: ${output}`);
} finally {
  socket?.close();
  const owners = () => spawnSync('/usr/sbin/lsof', ['-t', path.join(profile, '.parentlock')], { encoding: 'utf8' });
  for (const pid of (owners().stdout ?? '').trim().split(/\s+/)) {
    if (!/^[0-9]+$/.test(pid)) continue;
    try { process.kill(Number(pid), 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  if (browser && browser.exitCode === null && browser.signalCode === null) browser.kill('SIGTERM');
  await waitFor(() => owners().status !== 0, 'own browser profile released');
  for (const callback of cleanup.reverse()) await callback();
  await rm(temporary, { recursive: true, force: true });
}
