// Isolated visual trial: own static loopback server and Firefox profile. NO API/DB.
// Node >=26 and the already installed macOS Firefox. No downloads or dependencies.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'activity-hub-cyberpunk-'));
const profile = join(temporary, 'profile');
const output = join(root, 'test-results');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const resources = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']], ['/app.mjs', ['app.mjs', 'text/javascript']],
  ['/sample.mjs', ['sample.mjs', 'text/javascript']], ['/mark.svg', ['mark.svg', 'image/svg+xml']],
]);
const server = createServer(async (request, response) => {
  const resource = resources.get(new URL(request.url, 'http://127.0.0.1').pathname);
  if (request.method !== 'GET' || !resource) { response.writeHead(404).end(); return; }
  try {
    const content = await readFile(join(root, resource[0]));
    response.writeHead(200, { 'Content-Type': `${resource[1]}; charset=utf-8`, 'Cache-Control': 'no-store' }).end(content);
  } catch { response.writeHead(500).end(); }
});
const errors = [], network = [], evidence = { layouts: [], contrast: [] };
let socket, browser;
async function waitFor(check, description) {
  const deadline = Date.now() + 20000;
  do { if (await check()) return; await pause(50); } while (Date.now() < deadline);
  throw new Error(`Timed out: ${description}`);
}
try {
  await mkdir(output, { recursive: true });
  await mkdir(profile);
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
  const probe = createServer().listen(0, '127.0.0.1'); await once(probe, 'listening');
  const bidiPort = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  browser = spawn('/Applications/Firefox.app/Contents/MacOS/firefox', [
    '--headless', '--no-remote', '--new-instance', '--profile', profile, '--remote-debugging-port', String(bidiPort),
  ], { env: { HOME: temporary, PATH: '/usr/bin:/bin:/opt/homebrew/bin' }, stdio: 'ignore' });
  await waitFor(async () => {
    try { return (await fetch(`http://127.0.0.1:${bidiPort}/`)).status > 0; } catch { return false; }
  }, 'Firefox isolated instance');
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
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.type === 'error') request.reject(new Error(`${message.error}: ${message.message}`));
    else request.resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`BiDi timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  await command('session.new', { capabilities: { alwaysMatch: {} } });
  await command('session.subscribe', { events: ['log.entryAdded', 'network.beforeRequestSent'] });
  const { context } = await command('browsingContext.create', { type: 'tab' });
  async function evaluate(expression) {
    const result = await command('script.evaluate', { expression, target: { context }, awaitPromise: true });
    assert.equal(result.type, 'success', JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  const json = async (expression) => JSON.parse(await evaluate(`JSON.stringify(${expression})`));
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const value = (id, next, type = 'change') => evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(id)}); el.value=${JSON.stringify(next)}; el.dispatchEvent(new Event(${JSON.stringify(type)},{bubbles:true}));})()`);
  const key = (character) => command('input.performActions', { context, actions: [{ type: 'key', id: 'keys', actions: [{ type: 'keyDown', value: character }, { type: 'keyUp', value: character }] }] });
  const viewport = (width, height = 1000) => command('browsingContext.setViewport', { context, viewport: { width, height }, devicePixelRatio: 1 });
  async function capture(name, width, height = 1000) {
    await viewport(width, height);
    await evaluate('document.fonts.ready.then(()=>true)');
    await pause(30);
    const dimensions = await json(`(()=>{
      const visible = el=>el.checkVisibility();
      const controls = [...document.querySelectorAll('button,input,select,summary')].filter(visible);
      const small = controls.filter(el=>{const r=el.getBoundingClientRect();return r.width<43.5 || r.height<43.5}).map(el=>el.id||el.className);
      const outside = [...document.querySelectorAll('.front-row,.row-main,.front-actions,.filter-panel,.context-panel,.view-nav,.look-selector,dialog[open]')].filter(visible).flatMap(group=>{
        const outer=group.getBoundingClientRect();
        return [...group.querySelectorAll('button,input,select,summary')].filter(visible).filter(el=>{const r=el.getBoundingClientRect();return r.left<outer.left-.6 || r.right>outer.right+.6}).map(el=>el.id||el.className);
      });
      return {overflow:document.documentElement.scrollWidth>innerWidth,small,outside};
    })()`);
    assert.equal(dimensions.overflow, false, `${name}: document overflow`);
    assert.deepEqual(dimensions.small, [], `${name}: touch targets below44px`);
    assert.deepEqual(dimensions.outside, [], `${name}: controls outside containers`);
    const image = await command('browsingContext.captureScreenshot', { context, origin: 'viewport' });
    await writeFile(join(output, `${name}.png`), Buffer.from(image.data, 'base64'));
    evidence.layouts.push({ name, width, height, ...dimensions });
  }
  async function contrast(look) {
    // Explicit opaque surfaces, not a complete automated accessibility audit.
    const checks = await json(`(()=>{
      const lum=color=>{const c=color.match(/[0-9.]+/g).slice(0,3).map(Number).map(x=>{const n=x/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return c[0]*.2126+c[1]*.7152+c[2]*.0722};
      const pairs=[['body','body'],['.page-description','body'],['.front-name','.front-row'],['.state-badge','.front-row'],['.period-count','.front-row'],['.global-last dt','.front-row'],['.calendar-details summary','.front-row'],['.button-primary','.button-primary'],['.look-selector button[aria-pressed=true]','.look-selector button[aria-pressed=true]'],['.lab-flag','.lab-bar']];
      return pairs.map(([text,surface])=>{const el=document.querySelector(text);let parent=document.querySelector(surface);while(getComputedStyle(parent).backgroundColor==='rgba(0, 0, 0, 0)') parent=parent.parentElement;const fg=lum(getComputedStyle(el).color),bg=lum(getComputedStyle(parent).backgroundColor);return{text,ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)}});
    })()`);
    for (const check of checks) assert.ok(check.ratio >= 4.5, `${look} ${check.text}: contrast ${check.ratio.toFixed(2)}`);
    evidence.contrast.push({ look, checks });
  }
  const row = (id = 'sample-01') => `[data-front-id="${id}"]`;
  await viewport(1366);
  await command('browsingContext.navigate', { context, url: origin, wait: 'complete' });
  await waitFor(() => evaluate("document.querySelectorAll('.front-row').length===5"), 'five open sample fronts');
  assert.equal(await evaluate("document.querySelector('#next-day').disabled"), true);
  await value('state-filter', 'all');
  for (const look of ['neon', 'industrial', 'noir']) {
    await click(`[data-look-choice="${look}"]`);
    for (const view of ['daily', 'dashboard']) {
      await click(`[data-view-choice="${view}"]`);
      for (const width of [1920, 1366, 768, 390, 320]) {
        await evaluate('window.scrollTo(0,0)');
        await capture(`${look}-${view}-${width}`, width);
        if (width === 390) {
          await evaluate("document.querySelector('.results').scrollIntoView({block:'start'})");
          await capture(`${look}-${view}-390-rows`, width, 844);
        }
      }
      if (view === 'dashboard') await contrast(look);
    }
  }
  // Keyboard check: same node, focus and viewport without forced scrolling/rebuild.
  for (const look of ['neon', 'industrial', 'noir']) {
    await click(`[data-look-choice="${look}"]`); await click('[data-view-choice="daily"]');
    await viewport(390, 780);
    await evaluate("window.checkNode=document.getElementById('check-sample-03');checkNode.scrollIntoView({block:'center'});checkNode.focus({preventScroll:true})");
    const before = await json('({top:checkNode.getBoundingClientRect().top,y:scrollY,checked:checkNode.checked})');
    await key(' ');
    assert.equal(await evaluate("checkNode===document.getElementById('check-sample-03') && document.activeElement===checkNode"), true);
    const after = await json('({top:checkNode.getBoundingClientRect().top,y:scrollY,checked:checkNode.checked})');
    assert.equal(after.checked, !before.checked);
    assert.ok(Math.abs(before.top - after.top) < .5 && Math.abs(before.y - after.y) < .5, `${look}: check moved viewport`);
    assert.equal(await evaluate("document.getElementById(checkNode.getAttribute('aria-describedby')).textContent"), after.checked ? 'Actividad registrada' : 'Sin actividad registrada');
    assert.equal(await evaluate("getComputedStyle(checkNode).outlineStyle !== 'none'"), true, 'visible keyboard focus');
    await click('[data-look-choice="neon"]');
    assert.equal(await evaluate("document.getElementById('check-sample-03')===checkNode"), true, 'look change preserves check node');
    assert.equal(await evaluate('checkNode.checked'), after.checked);
    await click('#dismiss-notice');
  }
  await click('#reset-demo'); await click('#dismiss-notice'); await value('state-filter', 'all');
  await click('[data-view-choice="dashboard"]'); await value('demo-period', '7');
  assert.deepEqual(await json("[...document.querySelectorAll('.front-row')].map(el=>el.dataset.frontId)"), ['sample-01','sample-02','sample-03','sample-04','sample-07','sample-05','sample-06','sample-08']);
  assert.equal(await evaluate(`document.querySelector('${row()} .period-count').textContent`), '4 de 7 días registrados');
  assert.equal(await evaluate(`document.querySelector('${row('sample-06')} time').getAttribute('datetime')`), '2026-09-20');
  await evaluate(`document.querySelector('${row()} summary').focus()`); await key('\uE007');
  assert.equal(await evaluate(`document.querySelector('${row()} details').open`), true);
  assert.equal(await evaluate(`document.querySelector('${row('sample-02')} details').open`), false);
  assert.equal(await evaluate(`document.querySelectorAll('${row()} .calendar-tile').length`), 7);
  for (const look of ['neon','industrial','noir']) {
    await click(`[data-look-choice="${look}"]`);
    assert.equal(await evaluate(`document.querySelector('${row()} details').open`), true);
    await evaluate(`document.querySelector('${row()}').scrollIntoView({block:'center'})`);
    await capture(`${look}-calendar-390`, 390, 900);
  }
  await value('demo-period', '14');
  assert.equal(await evaluate("[...document.querySelectorAll('details')].every(el=>!el.open)"), true, 'period closes disclosures');
  // Native dialogs/validation; adding a reference changes no dimensions in either view.
  async function changeReference(reference) {
    await click(`${row()} .edit-button`);
    assert.equal(await evaluate('document.activeElement.id'), 'front-name');
    await value('front-reference', reference, 'input');
    await click('#front-form [type="submit"]');
    await waitFor(() => evaluate("!document.getElementById('front-editor').open"), 'editor close');
    await waitFor(() => evaluate("document.activeElement.classList.contains('edit-button')"), 'editor return focus');
    await click('#dismiss-notice');
  }
  async function dimensions() {
    const result = {};
    for (const look of ['neon','industrial','noir']) {
      await click(`[data-look-choice="${look}"]`);
      for (const view of ['daily','dashboard']) {
        await click(`[data-view-choice="${view}"]`);
        for (const width of [1366,390,320]) {
          await viewport(width);
          result[`${look}/${view}/${width}`] = await json(`(()=>{const r=document.querySelector('${row()}').getBoundingClientRect();return{width:r.width,height:r.height}})()`);
        }
      }
    }
    return result;
  }
  const original = await dimensions();
  await changeReference('');
  const absent = await dimensions();
  await changeReference(`https://example.invalid/${'long-reference-'.repeat(60)}`);
  const restored = await dimensions();
  assert.deepEqual(original, absent, 'reference presence does not change row/card dimensions');
  assert.deepEqual(absent, restored, 'long URL never adds a line');
  await click(`${row()} .reference-button`);
  assert.equal(await evaluate("document.getElementById('reference-preview').open && document.querySelectorAll('#reference-preview a').length===0"), true);
  await capture('reference-noir-390', 390, 844); await key('\uE00C');
  await waitFor(() => evaluate("document.activeElement.classList.contains('reference-button')"), 'reference Escape return');
  for (const look of ['neon','industrial','noir']) {
    await click(`[data-look-choice="${look}"]`);
    await click(`${row()} .edit-button`);
    await value('front-reference', 'javascript:alert(1)', 'input');
    await click('#front-form [type="submit"]');
    assert.equal(await evaluate("document.getElementById('front-editor').open && document.getElementById('front-reference').getAttribute('aria-invalid')==='true'"), true);
    await capture(`${look}-editor-390`, 390, 844); await key('\uE00C');
    await waitFor(() => evaluate("!document.getElementById('front-editor').open"), 'Escape editor');
  }
  // Normalization must not accept a URL that blocks its next edit round-trip.
  await click(`${row()} .edit-button`);
  await value('front-reference', `https://example.invalid/${'ñ'.repeat(400)}`, 'input');
  await click('#front-form [type="submit"]');
  assert.equal(await evaluate("document.getElementById('front-editor').open && document.getElementById('editor-error').textContent.includes('normalizada')"), true);
  const normalizedReference = new URL(`https://example.invalid/${'ñ'.repeat(300)}`).href;
  await value('front-reference', `https://example.invalid/${'ñ'.repeat(300)}`, 'input');
  await click('#front-form [type="submit"]');
  await waitFor(() => evaluate("!document.getElementById('front-editor').open"), 'accepted normalized reference');
  await click(`${row()} .edit-button`);
  assert.equal(await evaluate("document.getElementById('front-reference').value"), normalizedReference);
  await value('front-name', 'Cartografía sonora del barrio / revisión', 'input');
  await click('#front-form [type="submit"]');
  await waitFor(() => evaluate("!document.getElementById('front-editor').open"), 'unrelated edit with accepted normalized reference');
  assert.equal(await evaluate(`document.querySelector('${row()} .front-name').textContent`), 'Cartografía sonora del barrio / revisión');
  // All-state checks stay in their chosen state; invalid dates remove writable rows.
  await click('[data-view-choice="daily"]');
  for (const state of ['standby','archived']) {
    await value('state-filter', state);
    const oldState = await evaluate("document.querySelector('.state-badge').textContent");
    await click('.check-control input');
    assert.equal(await evaluate("document.querySelector('.state-badge').textContent"), oldState);
  }
  await value('demo-day', '2026-10-05', 'input');
  assert.equal(await evaluate("document.querySelectorAll('.front-row').length"), 0);
  await click('#simulated-today');
  await value('state-filter', 'all');
  await value('front-search', 'ninguna coincidencia', 'input');
  assert.equal(await evaluate("document.querySelectorAll('.front-row').length"), 0);
  await value('front-search', '', 'input');
  await click('#new-front');
  const literal = '<img src=x onerror=alert(1)> ' + 'X'.repeat(165);
  await value('front-name', literal, 'input'); await value('front-reference', '', 'input');
  await click('#front-form [type="submit"]');
  await waitFor(() => evaluate("!document.getElementById('front-editor').open"), 'new sample saved');
  assert.equal(await evaluate("document.querySelector('[data-front-id=sample-09] .front-name').textContent"), literal);
  assert.equal(await evaluate("document.querySelectorAll('img').length"), 0, 'name remains literal text');
  assert.equal(await evaluate("document.querySelector('#check-sample-09').checked"), false, 'create never marks');
  await click('#dismiss-notice');
  for (const look of ['neon','industrial','noir']) {
    await click(`[data-look-choice="${look}"]`);
    await evaluate("document.querySelector('[data-front-id=sample-09]').scrollIntoView({block:'center'})");
    await capture(`${look}-long-name-320`, 320, 844);
  }
  assert.equal(await evaluate('localStorage.length===0 && sessionStorage.length===0'), true, 'no persistent browser data');
  await command('browsingContext.navigate', { context, url: `${origin}/?look=industrial&view=dashboard`, wait: 'complete' });
  await waitFor(() => evaluate("document.body.dataset.look==='industrial' && document.querySelectorAll('.front-row').length===5"), 'reload resets sample and supports visual URL');
  assert.equal(await evaluate("document.querySelector('[data-front-id=sample-09]')===null"), true);
  assert.ok(network.every((url) => url.startsWith(origin) && resources.has(new URL(url).pathname)), 'only own static resources requested, no API/auth/external resource');
  assert.deepEqual(errors, [], 'no browser JS/CSP errors');
  await writeFile(join(output, 'evidence.json'), JSON.stringify({ ...evidence, referenceComparisons: original, checks: 'keyboard/focus/scroll, sample isolation, finite dates, safe literal inputs, reference dimensions, native dialogs, no external/API requests', errors }, null, 2));
  console.log(`PASS: ${evidence.layouts.length} responsive captures;3 distinct directions,2 views,320/390/768/1366/1920px; 44px controls and no checked overflow.`);
  console.log(`PASS: ${evidence.contrast.reduce((total, x) => total + x.checks.length, 0)} explicit text/surface contrast checks>=4.5 (not a full accessibility audit).`);
  console.log('PASS: keyboard check preserves node/focus/viewport; looks retain sample; independent calendars, filters and finite dates.');
  console.log('PASS:18 layout/reference comparisons without/with/long URL; native dialog focus/Escape; input validation and safe text; all-state checks and reset.');
  console.log('PASS: no persistent browser data, API/auth/external requests or JS/CSP errors; temporary profile/server only.');
  console.log(`Screenshots and evidence: ${output}`);
  await command('session.end');
} finally {
  socket?.close();
  // Firefox on macOS may relaunch. Signal only processes holding OUR profile lock.
  const lock = join(profile, '.parentlock');
  const owners = spawnSync('/usr/sbin/lsof', ['-t', lock], { encoding: 'utf8' });
  for (const pid of (owners.stdout ?? '').trim().split(/\s+/).filter((entry) => /^\d+$/.test(entry))) {
    try { process.kill(Number(pid), 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  if (browser && browser.exitCode === null && browser.signalCode === null) browser.kill('SIGTERM');
  await waitFor(async () => spawnSync('/usr/sbin/lsof', ['-t', lock], { encoding: 'utf8' }).status !== 0, 'own profile released');
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
