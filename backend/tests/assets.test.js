import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, account } from './fixture.js';

test('built React is served as Static Assets while exact private prefixes and health always reach the Worker', async t => {
  const { fetcher } = await fixture(t, { assets: true });
  const home = await fetcher('/', { headers: { Accept: 'text/html' } });
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /<div id="root"/);
  const script = html.match(/src="([^"]+\.js)"/)[1];
  const javascript = await fetcher(script);
  assert.equal(javascript.status, 200);
  assert.match(javascript.headers.get('content-type'), /javascript/);
  assert.equal((await fetcher('/health')).status, 200);
  for (const route of ['/api', '/api/unknown', '/api/dashboard', '/auth', '/auth/session', '/auth/unknown']) {
    const response = await fetcher(route, { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } });
    assert.equal(response.status, route.startsWith('/api') || route === '/auth/session' ? 401 : 404, route);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const a = await account(fetcher);
  const unknown = await fetcher('/api/unknown', { headers: { ...a.headers, Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } });
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { detail: 'Not Found' });
  // FastAPI's generated documentation is explicitly outside this experiment.
  for (const route of ['/openapi.json', '/docs', '/redoc']) assert.equal((await fetcher(route)).status, 404);
  assert.equal((await fetcher('/application/view', { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } })).status, 200);
});

test('canonical API routing preserves Allow and authorized trailing-slash redirects without SPA fallback', async t => {
  const { fetcher } = await fixture(t, { assets: true });
  const a = await account(fetcher);
  for (const [route, allow] of [['/api/fronts', 'POST'], ['/api/history', 'GET'], ['/api/dashboard', 'GET'], ['/auth/login', 'POST'], ['/health', 'GET']]) {
    const response = await fetcher(route, { method: 'OPTIONS', headers: a.headers });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), allow);
  }
  const redirect = await fetcher('/api/fronts/?limit=2', { headers: a.headers, redirect: 'manual' });
  assert.equal(redirect.status, 307);
  assert.ok(redirect.headers.get('location').endsWith('/api/fronts?limit=2'));
  assert.equal(redirect.headers.get('cache-control'), 'no-store');
  assert.equal((await fetcher('/api/fronts/', { redirect: 'manual' })).status, 401);
});

test('public landing and private app stay separate; retired presentation redirects home', async t => {
  const { fetcher, DB } = await fixture(t, { assets: true, legacy: false });
  const home = await fetcher('/', { headers: { Accept: 'text/html', Cookie: 'activity_hub_session=synthetic-remembered-session' } });
  const html = await home.text();
  assert.match(html, /<meta name="description"/);
  const app = await fetcher('/app/', { redirect: 'manual' });
  assert.equal(app.status, 200);
  const appHtml = await app.text();
  assert.notEqual(appHtml.match(/src="([^"]+\.js)"/)[1], html.match(/src="([^"]+\.js)"/)[1]);
  for (const route of ['/app']) {
    const response = await fetcher(route, { redirect: 'manual' });
    assert.equal(response.status, 307, route);
    assert.equal(new URL(response.headers.get('location'), 'http://localhost').pathname, `${route}/`);
  }
  for (const route of ['/presentacion', '/presentacion/', '/presentacion/index.html', '/presentacion/assets/old.js']) {
    const response = await fetcher(route, { redirect: 'manual' });
    assert.equal(response.status, 302, route);
    assert.equal(new URL(response.headers.get('location'), 'http://localhost').pathname, '/');
  }
  for (const table of ['accounts', 'encrypted_vaults']) assert.equal((await DB.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n, 0);
});
