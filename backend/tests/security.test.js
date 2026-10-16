import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../src/worker.js';
import { settings, requireOrigin, cookieToken } from '../src/auth.js';
import { input } from '../src/contracts.js';
import { verifySignup } from '../src/security.js';
import { vaultInput } from '../src/vault.js';

test('vault revision metadata is validated before binding SQL values', () => {
  const envelope = { version: 1, day: '2026-10-06', iv: 'AAAAAAAAAAAAAAAA', ciphertext: btoa('a'.repeat(32)) };
  for (const legacy_revision of [{}, [], '1', -1, 1.5]) {
    assert.throws(() => vaultInput({ ...envelope, legacy_revision }), error => error.status === 422);
  }
  assert.equal(vaultInput({ ...envelope, legacy_revision: null }).version, 1);
  assert.throws(() => vaultInput({ ...envelope, version: 0 }), error => error.status === 422);
});

test('absent or malformed session cookies are rejected without accessing D1', async () => {
  let queries = 0;
  const DB = { prepare() { queries++; throw new Error('Database must not be touched'); } };
  const worker = createWorker();
  for (const route of ['/auth/session', '/api/fronts', '/api/unknown']) {
    for (const cookie of ['', 'activity_hub_session=bad', 'activity_hub_session=a; activity_hub_session=b']) {
      const response = await worker.fetch(new Request(`http://127.0.0.1:8787${route}`, { headers: { Cookie: cookie } }), { DB, WEB_ORIGIN: 'http://127.0.0.1:8787' });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
  assert.equal(queries, 0);
});

test('JSON readers bound actual streamed bytes, including absent or dishonest Content-Length', async () => {
  for (const length of [undefined, '1']) {
    let cancelled = false;
    let chunks = 0;
    const body = new ReadableStream({
      pull(controller) {
        chunks++;
        if (chunks <= 3) controller.enqueue(new Uint8Array(8192).fill(32));
        else { controller.enqueue(new TextEncoder().encode('{}')); controller.close(); }
      },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const request = new Request('http://localhost/api/fronts', {
      method: 'POST', duplex: 'half', body,
      headers: { 'Content-Type': 'application/json', ...(length ? { 'Content-Length': length } : {}) },
    });
    // Whitespace is still request data even though the parsed object is tiny.
    await assert.rejects(input(request), error => error.status === 413);
    assert.equal(cancelled, true);
    assert.ok(chunks <= 3);
  }
});

test('production limits and emergency stop reject before D1; missing bindings fail closed', async () => {
  let queries = 0;
  const DB = { prepare() { queries++; throw new Error('D1 must not run'); } };
  const worker = createWorker();
  const origin = 'https://activity.example';
  const request = () => new Request(`${origin}/auth/login`, { method: 'POST', headers: { Origin: origin, 'CF-Connecting-IP': '192.0.2.1', 'Content-Type': 'application/json' }, body: '{}' });
  const allow = { limit: async () => ({ success: true }) };
  const deny = { limit: async () => ({ success: false }) };
  const env = { DB, WEB_ORIGIN: origin, GLOBAL_RATE_LIMITER: allow, IP_RATE_LIMITER: allow, AUTH_RATE_LIMITER: deny, ACCOUNT_RATE_LIMITER: allow };
  assert.equal((await worker.fetch(request(), env)).status, 429);
  assert.equal((await worker.fetch(request(), { ...env, API_ENABLED: 'false' })).status, 503);
  assert.equal((await worker.fetch(request(), { DB, WEB_ORIGIN: origin })).status, 503);
  assert.equal(queries, 0);
});

test('Turnstile validates success, action and exact hostname and fails closed before any D1 effect', async () => {
  const config = settings('https://activity.example');
  const env = { TURNSTILE_SITEKEY: 'public-test-sitekey', TURNSTILE_SECRET: 'synthetic-test-secret' };
  const request = new Request(`${config.origin}/auth/signup`, { method: 'POST', headers: { Origin: config.origin } });
  const ok = { success: true, hostname: 'activity.example', action: 'signup' };
  await verifySignup(request, env, config, 'synthetic-token', async () => Response.json(ok));
  for (const value of [{ ...ok, success: false }, { ...ok, success: 'true' }, { ...ok, hostname: 'localhost' }, { ...ok, hostname: 'evil.example' }, { ...ok, action: 'login' }, null]) {
    await assert.rejects(verifySignup(request, env, config, 'synthetic-token', async () => Response.json(value)), e => e.status === 403);
  }
  for (const upstream of [async () => { throw new Error('network'); }, async () => new Response('oops'), async () => new Response('', { status: 500 })]) {
    await assert.rejects(verifySignup(request, env, config, 'synthetic-token', upstream), e => e.status === 403);
  }
  let queries = 0;
  const allow = { limit: async () => ({ success: true }) };
  const worker = createWorker({ turnstileFetch: async () => Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] }) });
  const response = await worker.fetch(new Request(`${config.origin}/auth/signup`, {
    method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: 'a'.repeat(64), turnstile_token: 'consumed-token' }),
  }), { ...env, WEB_ORIGIN: config.origin, GLOBAL_RATE_LIMITER: allow, IP_RATE_LIMITER: allow, AUTH_RATE_LIMITER: allow,
    DB: { prepare() { queries++; throw new Error('D1 must not run'); } } });
  assert.equal(response.status, 403);
  assert.equal(queries, 0);
});

test('WEB_ORIGIN may list several origins: the first is canonical and every one is validated', () => {
  const config = settings('https://app.example, https://app.workers.example');
  assert.equal(config.origin, 'https://app.example');
  assert.deepEqual(config.origins, ['https://app.example', 'https://app.workers.example']);
  assert.deepEqual(config.hostnames, ['app.example', 'app.workers.example']);
  assert.equal(config.cookie, '__Host-activity_hub_session');
  assert.deepEqual(settings('http://127.0.0.1:8787').origins, ['http://127.0.0.1:8787']);
  for (const value of ['https://app.example,', ',https://app.example', 'https://app.example,https://app.example', 'https://A.example:443,https://a.example',
    'https://app.example,http://localhost:8787', 'https://app.example,https://other.example/path', 'https://app.example;https://app.workers.example']) {
    assert.throws(() => settings(value), /^Error: Invalid web origin configuration$/, value);
  }
  assert.throws(() => settings('https://app.example,http://app.workers.example'), /^Error: HTTPS required$/);
});

test('writes and Turnstile are accepted from every listed origin and from no other', async () => {
  const config = settings('https://app.example,https://app.workers.example');
  const at = (origin, headers) => new Request(`${origin}/auth/login`, { method: 'POST', headers });
  for (const origin of config.origins) requireOrigin(at(origin, { Origin: origin }), config);
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: 'https://app.example, https://app.workers.example' }, { Origin: 'null' }, {}]) {
    assert.throws(() => requireOrigin(at(config.origin, headers), config), error => error.status === 403);
  }
  const env = { TURNSTILE_SITEKEY: 'public-test-sitekey', TURNSTILE_SECRET: 'synthetic-test-secret' };
  const ok = { success: true, action: 'signup' };
  for (const origin of config.origins) {
    await verifySignup(at(origin, { Origin: origin }), env, config, 'synthetic-token', async () => Response.json({ ...ok, hostname: new URL(origin).hostname }));
  }
  for (const hostname of ['evil.example', 'example', 'app.example.evil.example']) {
    await assert.rejects(verifySignup(at('https://app.example', { Origin: 'https://app.example' }), env, config, 'synthetic-token', async () => Response.json({ ...ok, hostname })), e => e.status === 403);
  }
});

test('login reaches its own checks from every listed origin and is refused from any other', async () => {
  const origins = 'https://app.example,https://app.workers.example';
  const allow = { limit: async () => ({ success: true }) };
  const env = { WEB_ORIGIN: origins, TURNSTILE_SITEKEY: 'public-test-sitekey', TURNSTILE_SECRET: 'synthetic-test-secret',
    GLOBAL_RATE_LIMITER: allow, IP_RATE_LIMITER: allow, AUTH_RATE_LIMITER: allow, ACCOUNT_RATE_LIMITER: allow,
    DB: { prepare() { throw new Error('D1 must not run'); } } };
  const login = (url, origin) => createWorker().fetch(new Request(`${url}/auth/login`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}',
  }), env);
  for (const origin of origins.split(',')) {
    const response = await login(origin, origin);
    assert.notEqual((await response.json()).detail, 'Request forbidden', origin);
  }
  for (const [url, origin] of [['https://app.example', 'https://evil.example'], ['https://app.workers.example', 'https://evil.example'], ['https://app.example', 'null']]) {
    const response = await login(url, origin);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).detail, 'Request forbidden');
  }
});

test('a cookie whose name only matches after Unicode trimming is not the session cookie', () => {
  const config = settings('https://app.example');
  const stub = cookie => ({ headers: { get: name => (name === 'Cookie' ? cookie : null) } });
  const a = 'A'.repeat(43);
  const b = 'B'.repeat(43);
  assert.equal(cookieToken(stub(`\u2000${config.cookie}=${a}; ${config.cookie}=${b}`), config), b);
  for (const space of ['\u2000', '\u3000', '\ufeff', '\u00a0']) {
    assert.equal(cookieToken(stub(`${space}${config.cookie}=${a}`), config), null);
  }
  assert.equal(cookieToken(stub(` \t${config.cookie}=${b} `), config), b);
});
