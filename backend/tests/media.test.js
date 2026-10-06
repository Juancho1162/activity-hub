import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, request, origin, account } from './fixture.js';
import { pythonReference } from './reference.js';

async function snapshot(DB) {
  const tables = ['accounts', 'web_sessions', 'fronts', 'activity_checks', 'idempotency_requests', 'worker_batch_context'];
  const rows = await DB.batch(tables.map(table => DB.prepare(`SELECT count(*) AS n FROM ${table}`)));
  return rows.map(row => row.results[0].n);
}

test('duplicate auth Content-Type after charset is 415, consumes an attempt and changes no account/session/domain data', async t => {
  const { DB, fetcher } = await fixture(t);
  const a = await account(fetcher);
  const before = await snapshot(DB);
  for (const action of ['signup', 'login']) {
    const attempts = (await DB.prepare('SELECT attempts FROM action_throttle WHERE action=?').bind(action).first()).attempts;
    const response = await fetcher(`/auth/${action}`, {
      method: 'POST',
      headers: [['Origin', origin], ['Content-Type', 'application/json; charset=utf-8'], ['Content-Type', 'text/plain']],
      body: JSON.stringify(action === 'signup' ? {} : { code: a.code }),
    });
    assert.equal(response.status, 415, `${action} must reject coalesced duplicate Content-Type`);
    assert.deepEqual(await response.json(), { detail: 'JSON required' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal((await DB.prepare('SELECT attempts FROM action_throttle WHERE action=?').bind(action).first()).attempts, attempts + 1);
    assert.deepEqual(await snapshot(DB), before);
  }
});

test('API text/plain JSON is 422 with no mutation after authentication', async t => {
  const { DB, fetcher } = await fixture(t);
  const a = await account(fetcher);
  const front = await request(fetcher, 'POST', '/api/fronts', { name: 'Preserved' }, { ...a.headers, 'Idempotency-Key': randomUUID() });
  assert.equal(front.status, 201);
  const before = await snapshot(DB);
  for (const [method, route, body] of [
    ['POST', '/api/fronts', { name: 'Denied' }],
    ['PATCH', `/api/fronts/${front.value.id}`, { name: 'Denied' }],
    ['PUT', `/api/fronts/${front.value.id}/check`, { day: 'today', marked: true }],
  ]) {
    const result = await request(fetcher, method, route, body, { ...a.headers, 'Content-Type': 'text/plain', 'Idempotency-Key': randomUUID() });
    assert.equal(result.status, 422, `${method} must not parse text/plain as a JSON contract`);
    assert.deepEqual(result.value, { detail: 'Invalid request' });
    assert.deepEqual(await snapshot(DB), before);
  }
});

test('Content-Type JSON/+json/absent and quoted parameters match temporary FastAPI HTTP and persisted changes', async t => {
  const cases = [
    ...[[], ['text/plain'], ['application/json'], ['application/json; charset=utf-8'],
      ['APPLICATION/JSON'], ['application/problem+json'], ['application/vnd.example+json'], ['text/json'],
      ['application/json, text/plain'], ['application/json,text/plain']]
      .map(types => ({ route: '/api/fronts', body: { name: 'Media' }, types })),
    ...[[], ['text/plain'], ['application/json; charset=utf-8', 'text/plain'],
      ['application/json', 'application/json'], ['application/problem+json'],
      ['application/json; charset="utf-8,utf-8"'], ['application/json; charset=utf-8']]
      .map(types => ({ route: '/auth/signup', body: {}, types })),
    ...[[], ['text/plain'], ['application/json; charset=utf-8', 'text/plain'], ['application/json']]
      .map(types => ({ route: '/auth/login', body: { code: 'B'.repeat(32) }, types })),
  ];
  const expected = pythonReference('media', { cases });
  const { DB, fetcher } = await fixture(t);
  const a = await account(fetcher);
  for (const [index, example] of cases.entries()) {
    await DB.prepare('DELETE FROM action_throttle').run();
    const before = await snapshot(DB);
    const headers = Object.entries(example.route.startsWith('/api/')
      ? { ...a.headers, 'Idempotency-Key': 'b'.repeat(32) } : { Origin: origin });
    headers.push(...example.types.map(value => ['Content-Type', value]));
    const response = await fetcher(example.route, {
      method: 'POST', headers, body: new TextEncoder().encode(JSON.stringify(example.body)),
    });
    await response.arrayBuffer();
    const after = await snapshot(DB);
    const attempts = await DB.prepare('SELECT action,attempts FROM action_throttle').all();
    assert.deepEqual({
      status: response.status, changes: after.slice(0, 5).map((n, i) => n - before[i]),
      attempts: Object.fromEntries(attempts.results.map(row => [row.action, row.attempts])),
      no_store: response.headers.get('cache-control') === 'no-store',
    }, expected[index], `HTTP/media/state differential case ${index}`);
    assert.equal(after.at(-1), 0);
  }
});
