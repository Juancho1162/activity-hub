// Own build/static server/temporary Firefox profile. No app/API/SQLite.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLab, createLabServer } from './lab.mjs';
import { ROOT } from './build-config.mjs';
await buildLab();
const temporary = await mkdtemp(join(tmpdir(), 'activity-hub-8bit-twist-'));
const profile = join(temporary, 'profile');
const output = join(ROOT, 'test-results');
const server = await createLabServer();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], network = [], evidence = { layouts: [], contrast: [], references: [] };
let browser, socket;
async function waitFor(check, description) {
  const deadline = Date.now() + 20000;
  do { if (await check()) return; await pause(35); } while (Date.now() < deadline);
  throw new Error(`Timed out: ${description}`);
}
try {
  await mkdir(output, { recursive: true }); await mkdir(profile);
  await writeFile(join(profile, 'user.js'), [
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("datareporting.healthreport.uploadEnabled", false);',
    'user_pref("toolkit.telemetry.enabled", false);',
    'user_pref("app.normandy.enabled", false);',
    'user_pref("network.captive-portal-service.enabled", false);',
  ].join('\n'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  // The same production static handler must not expose source/private/API paths.
  for (const path of ['/api/fronts', '/auth/session', '/data/activity.sqlite3', '/.env', '/SampleApp.tsx', '/%2e%2e/README.md']) {
    assert.equal((await fetch(origin + path)).status, 404, `static isolation ${path}`);
  }
  assert.equal((await fetch(origin, { method: 'POST' })).status, 404);
  assert.equal((await fetch(origin, { method: 'HEAD' })).status, 200);
  const probe = createServer().listen(0, '127.0.0.1'); await once(probe, 'listening');
  const bidiPort = probe.address().port; await new Promise(resolve => probe.close(resolve));
  browser = spawn('/Applications/Firefox.app/Contents/MacOS/firefox', ['--headless', '--no-remote', '--new-instance', '--profile', profile, '--remote-debugging-port', String(bidiPort)], { env: { HOME: temporary, PATH: '/usr/bin:/bin:/opt/homebrew/bin' }, stdio: 'ignore' });
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${bidiPort}/`)).status > 0; } catch { return false; } }, 'isolated Firefox');
  socket = new WebSocket(`ws://127.0.0.1:${bidiPort}/session`);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === 'event') {
      if (message.method === 'log.entryAdded' && message.params.level === 'error') errors.push(message.params.text);
      if (message.method === 'network.beforeRequestSent') network.push(message.params.request.url);
      return;
    }
    const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.type === 'error') request.reject(new Error(`${message.error}: ${message.message}`)); else request.resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`BiDi timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const session = await command('session.new', { capabilities: { alwaysMatch: {} } });
  evidence.browser = session.capabilities.browserVersion;
  await command('session.subscribe', { events: ['log.entryAdded', 'network.beforeRequestSent'] });
  const { context } = await command('browsingContext.create', { type: 'tab' });
  async function evaluate(expression) {
    const result = await command('script.evaluate', { expression, target: { context }, awaitPromise: true });
    assert.equal(result.type, 'success', JSON.stringify(result.exceptionDetails)); return result.result.value;
  }
  const json = async expression => JSON.parse(await evaluate(`JSON.stringify(${expression})`));
  const click = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(25); };
  const set = async (selector, value) => {
    await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)}); const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));})()`); await pause(25);
  };
  const key = value => command('input.performActions', { context, actions: [{ type: 'key', id: 'keys', actions: [{ type: 'keyDown', value }, { type: 'keyUp', value }] }] });
  const viewport = (width, height = 1000) => command('browsingContext.setViewport', { context, viewport: { width, height }, devicePixelRatio: 1 });
  const ready = () => waitFor(() => evaluate("!!document.querySelector('.front-list') && document.querySelector('.front-list').getAttribute('aria-busy')==='false'"), 'sample rendered');
  const daily = async () => { await click('.view-nav button:first-child'); await ready(); };
  const dashboard = async () => { await click('.view-nav button:last-child'); await ready(); };
  const look = value => set('.lab-controls .look-picker select', value);
  const theme = value => set('.lab-controls .theme-picker select', value);
  async function capture(name, width, height = width === 390 ? 844 : 1000) {
    await viewport(width, height); await evaluate('document.fonts.ready.then(()=>true)'); await pause(30);
    const dimensions = await json(`(()=>{
      const visible=el=>el.checkVisibility();
      const controls=[...document.querySelectorAll('button,input,select,summary')].filter(visible);
      const small=controls.filter(el=>{const r=el.getBoundingClientRect();return r.width<43.5||r.height<43.5}).map(el=>el.id||el.className);
      const outside=[...document.querySelectorAll('.daily-row,.front-card,.toolbar-card,.view-nav,.lab-selectors,[role=dialog]')].filter(visible).flatMap(group=>{const box=group.getBoundingClientRect();return [...group.querySelectorAll('button,input,select,summary')].filter(visible).filter(el=>{const r=el.getBoundingClientRect();return r.left<box.left-.6||r.right>box.right+.6}).map(el=>el.id||el.className)});
      return {overflow:document.documentElement.scrollWidth>innerWidth,small,outside};
    })()`);
    assert.equal(dimensions.overflow, false, `${name}: overflow`);
    assert.deepEqual(dimensions.small, [], `${name}: targets below44px`);
    assert.deepEqual(dimensions.outside, [], `${name}: controls outside container`);
    const image = await command('browsingContext.captureScreenshot', { context, origin: 'viewport' });
    await writeFile(join(output, `${name}.png`), Buffer.from(image.data, 'base64'));
    evidence.layouts.push({ name, width, height, ...dimensions });
  }
  async function contrast(label) {
    const checks = await json(`(()=>{
      const lum=color=>{const c=color.match(/[0-9.]+/g).slice(0,3).map(Number).map(x=>{const n=x/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return c[0]*.2126+c[1]*.7152+c[2]*.0722};
      const selectors=['.lab-context strong','.lab-note','.page-description','.front-title h2','.state-badge','.period-count','.coverage-value','.dashboard-meta dt','.calendar-details summary','.new-front','.nav-button[aria-current=page]','.reference-link','.field label','.date-help'];
      return selectors.map(selector=>{const el=document.querySelector(selector);let surface=el;while(getComputedStyle(surface).backgroundColor==='rgba(0, 0, 0, 0)')surface=surface.parentElement;const fg=lum(getComputedStyle(el).color),bg=lum(getComputedStyle(surface).backgroundColor);return {selector,ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)}});
    })()`);
    checks.forEach(check => assert.ok(check.ratio>=4.5, `${label}: ${check.selector} contrast ${check.ratio}`));
    evidence.contrast.push({ label, checks });
  }
  await viewport(1366);
  await command('browsingContext.navigate', { context, url: origin, wait: 'complete' }); await ready();
  assert.equal(await evaluate('document.documentElement.dataset.look'), 'charm');
  assert.equal(await evaluate("document.querySelectorAll('[role=checkbox].activity-check').length"), 5);
  await evaluate('document.fonts.ready.then(()=>true)');
  assert.equal(await evaluate("document.fonts.check('12px \"Press Start 2P\"')"), true);
  await set('#state-filter', 'all'); await ready();
  for (const variant of ['base', 'charm']) {
    await look(variant);
    for (const palette of ['light', 'dark']) {
      await theme(palette);
      for (const view of ['daily', 'dashboard']) {
        await (view === 'daily' ? daily() : dashboard());
        for (const width of [1920, 1366, 768, 390, 320]) {
          await evaluate('window.scrollTo(0,0)'); await capture(`${variant}-${palette}-${view}-${width}`, width);
        }
        if (view === 'dashboard') {
          await contrast(`${variant}-${palette}`);
          await click('.calendar-details summary');
          assert.equal(await evaluate("document.querySelectorAll('.calendar-grid li').length"), 224);
          assert.equal(await evaluate("document.querySelectorAll('.calendar-details[open]').length"), 1);
          await evaluate("document.querySelector('.dashboard-list').scrollIntoView({block:'start'})");
          await capture(`${variant}-${palette}-calendar-390`, 390);
          await click('.calendar-details summary');
        }
      }
    }
  }
  // Keyboard interaction keeps the same confirmed React node and visible focus.
  for (const variant of ['base', 'charm']) {
    await look(variant); await daily(); await viewport(390, 844);
    await evaluate("window.originalCheck=document.querySelectorAll('[role=checkbox].activity-check')[4]; originalCheck.scrollIntoView({block:'center'}); originalCheck.focus({preventScroll:true}); window.beforeCheck={y:scrollY,top:originalCheck.getBoundingClientRect().top,marked:originalCheck.getAttribute('aria-checked')};");
    await key(' '); await waitFor(() => evaluate("originalCheck.getAttribute('aria-checked')!==beforeCheck.marked && originalCheck.getAttribute('aria-disabled')==='false'"), 'local confirmed check');
    const continuity = await json("({connected:originalCheck.isConnected,focused:document.activeElement===originalCheck,outline:getComputedStyle(originalCheck).outlineStyle,delta:Math.abs(scrollY-beforeCheck.y),topDelta:Math.abs(originalCheck.getBoundingClientRect().top-beforeCheck.top),message:document.querySelector('.confirmed-notice').textContent})");
    assert.equal(continuity.connected, true); assert.equal(continuity.focused, true); assert.notEqual(continuity.outline, 'none'); assert.ok(continuity.delta<.5 && continuity.topDelta<.5); assert.match(continuity.message, /Solo en esta maqueta; no guardado en la app/);
    await look(variant === 'base' ? 'charm' : 'base'); await theme('light');
    assert.equal(await evaluate('originalCheck.isConnected'), true);
  }
  // A real editor portal keeps its draft/node when switching both selectors.
  await click('.new-front'); await waitFor(() => evaluate("document.activeElement?.id==='front-name'"), 'editor autofocus');
  await set('#front-name', 'Borrador que se conserva');
  await evaluate("window.draftInput=document.getElementById('front-name'); window.draftDialog=document.querySelector('[role=dialog]')");
  for (const variant of ['base', 'charm']) for (const palette of ['light', 'dark']) {
    await set('[role=dialog] .look-picker select', variant); await set('[role=dialog] .theme-picker select', palette);
    assert.equal(await evaluate("draftInput===document.getElementById('front-name') && draftDialog===document.querySelector('[role=dialog]') && draftInput.value==='Borrador que se conserva'"), true);
    await capture(`${variant}-${palette}-editor-390`, 390);
  }
  await key('\uE00C'); await waitFor(() => evaluate("!document.querySelector('[role=dialog]')"), 'Escape editor');
  assert.equal(await evaluate("document.activeElement===document.querySelector('.new-front')"), true);
  // Reference is a button, never an external href; focus returns on Escape.
  await daily(); await click('.reference-link');
  assert.equal(await evaluate("document.querySelector('.reference-text').textContent"), 'https://example.invalid/cartografia');
  assert.equal(await evaluate("document.querySelectorAll('a[href]:not([href^=\"#\"])').length"), 0);
  await capture('charm-dark-reference-390', 390);
  await key('\uE00C'); await waitFor(() => evaluate("!document.querySelector('[role=dialog]')"), 'Escape reference');
  assert.equal(await evaluate("document.activeElement.classList.contains('reference-link')"), true);
  // Compare actual DOMRect sizes across absent/present/long references.
  async function referenceGeometry() {
    const result = {};
    for (const variant of ['base', 'charm']) for (const palette of ['light', 'dark']) {
      await look(variant); await theme(palette);
      for (const view of ['daily', 'dashboard']) {
        await (view==='daily'?daily():dashboard());
        for (const width of [1366,390,320]) {
          await viewport(width);
          result[`${variant}/${palette}/${view}/${width}`] = await json("(()=>{const r=document.querySelector('.front-card').getBoundingClientRect();return {width:r.width,height:r.height}})()");
        }
      }
    }
    return result;
  }
  async function editReference(reference) {
    await daily(); await click('.edit-front'); await set('#front-reference', reference);
    await click('[role=dialog] button[type=submit]'); await waitFor(() => evaluate("!document.querySelector('[role=dialog]')"), 'save reference'); await ready();
  }
  const withReference = await referenceGeometry();
  await editReference(''); const absent = await referenceGeometry();
  await editReference(`https://example.invalid/${'long-path/'.repeat(100)}`); const long = await referenceGeometry();
  for (const name of Object.keys(withReference)) {
    for (const axis of ['width','height']) {
      assert.ok(Math.abs(withReference[name][axis]-absent[name][axis])<.001, `absent reference geometry ${name}/${axis}`);
      assert.ok(Math.abs(withReference[name][axis]-long[name][axis])<.001, `long reference geometry ${name}/${axis}`);
    }
    evidence.references.push({ name, withReference:withReference[name], absent:absent[name], long:long[name] });
  }
  // Literal names, normalized URLs, no false success and long-name geometry.
  await daily(); await click('.edit-front');
  await set('#front-reference', 'javascript:alert(1)'); await click('[role=dialog] button[type=submit]');
  assert.equal(await evaluate("document.getElementById('front-reference').getAttribute('aria-invalid')"), 'true');
  await set('#front-reference', `https://example.invalid/${'ñ'.repeat(400)}`); await click('[role=dialog] button[type=submit]');
  assert.match(await evaluate("document.getElementById('form-error').textContent"), /normalizada/);
  await set('#front-reference', `https://example.invalid/${'ñ'.repeat(300)}`); await click('[role=dialog] button[type=submit]'); await ready();
  await click('.edit-front');
  assert.ok((await evaluate("document.getElementById('front-reference').value.length"))<=2048);
  const literal = '<img src=x onerror="alert(1)"> ' + 'Nombre-completo-'.repeat(10);
  await set('#front-name', literal); await click('[role=dialog] button[type=submit]'); await ready();
  assert.equal(await evaluate("document.querySelector('.front-title h2').textContent"), literal);
  assert.equal(await evaluate("document.querySelectorAll('.front-title img').length"), 0);
  for (const palette of ['light','dark']) { await look('charm'); await theme(palette); await capture(`charm-${palette}-long-name-320`,320); }
  // Reset is the sole intentional remount and restores the original data.
  await click('.lab-reset'); await ready();
  assert.equal(await evaluate("document.querySelector('.front-title h2').textContent"), 'Cartografía sonora del barrio');
  assert.equal(await evaluate("document.querySelectorAll('[role=checkbox].activity-check').length"), 5);
  await set('#registration-day','2026-09-06');
  assert.match(await evaluate("document.querySelector('[role=alert]').textContent"), /07\/09–04\/10/);
  assert.equal(await evaluate("document.querySelectorAll('[role=checkbox].activity-check').length"), 0);
  await click('.lab-reset'); await ready();
  // Persistence is strictly the existing visual theme preference; not activity.
  const storage = JSON.parse(await evaluate("(async()=>JSON.stringify({local:Object.keys(localStorage),session:sessionStorage.length,cookies:document.cookie,databases:await indexedDB.databases(),workers:await navigator.serviceWorker.getRegistrations()}))()"));
  assert.deepEqual(storage.local, ['activity-hub.theme']); assert.equal(storage.session,0); assert.equal(storage.cookies,''); assert.deepEqual(storage.databases,[]); assert.deepEqual(storage.workers,[]);
  assert.equal(await evaluate("document.body.textContent.includes('Cambio confirmado por el servidor.')"), false);
  assert.deepEqual(errors, [], 'no browser JS/CSP errors');
  for (const url of network) { const parsed=new URL(url); assert.equal(parsed.origin,origin); assert.ok(parsed.pathname==='/' || parsed.pathname.startsWith('/assets/') || parsed.pathname==='/fonts/press-start-2p.ttf', `unexpected browser request ${parsed.pathname}`); }
  evidence.requests = [...new Set(network)].map(url=>new URL(url).pathname); evidence.storage=storage;
  await writeFile(join(output,'evidence.json'),JSON.stringify(evidence,null,2));
  console.log(`PASS: ${evidence.layouts.length} captures; Base/Con encanto, light/dark, two views, 320–1920px; >=44px controls, checked overflow absent.`);
  console.log(`PASS: ${evidence.contrast.reduce((n,x)=>n+x.checks.length,0)} explicit contrast pairs >=4.5; ${evidence.references.length} reference geometry comparisons.`);
  console.log('PASS: node/focus/scroll after keyboard check; visual switches retain data/drafts/portals; honest sample notices, safe text/reference, finite dates/reset.');
  console.log('PASS: no API/auth/external requests, JS/CSP errors or persistent activity; only theme preference. Static routes remain isolated.');
  console.log(`Evidence: ${output}`);
} finally {
  if (socket) socket.close();
  if (browser && browser.exitCode===null && browser.signalCode===null) {
    const exited = once(browser,'exit');
    browser.kill('SIGTERM');
    await Promise.race([exited,pause(4000)]);
    if (browser.exitCode===null && browser.signalCode===null) { browser.kill('SIGKILL'); await exited; }
  }
  server.closeAllConnections(); if(server.listening)await new Promise(resolve=>server.close(resolve));
  await rm(temporary,{recursive:true,force:true});
}
