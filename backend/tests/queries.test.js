import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, account, request, localFetcher, afterBatch } from './fixture.js';
import { recordedReference } from './reference.js';
import { uuidText } from '../src/contracts.js';
import { sample, seed } from './sample.js';

const hex = i => i.toString(16).padStart(32, '0');

const window = 'start=2026-01-01&end=2026-01-04';
test('list/history/dashboard HTTP and full ordered snapshots match recorded contracts, including long literal search and a 100-front page', async t => {
  const data = sample();
  const cases = [
    '/api/fronts', '/api/fronts?limit=100', '/api/fronts?limit=2&offset=104', '/api/fronts?offset=100000',
    '/api/fronts?states=open&states=standby', '/api/fronts?search=%25_%2F',
    `/api/fronts?search=${'L'.repeat(150)}`, '/api/fronts?search=Caf%C3%A9', '/api/fronts?search=Same',
    ...['1.0', '%2B1', '01', '1_0', '1e1', '0', '101', '2&limit=3'].map(n => `/api/fronts?limit=${n}`),
    ...['states=open&states=open&states=open&states=open', 'states=closed', 'search=', 'extra=x', 'order=created', 'offset=-1'].map(q => `/api/fronts?${q}`),
    `/api/history?${window}`, `/api/history?${window}&limit=1&offset=1`,
    `/api/history?${window}&front_id=${uuidText(hex(105))}`,
    `/api/history?${window}&front_id=${uuidText(hex(106))}`,
    `/api/history?${window}&front_id=${uuidText(hex(999))}`,
    '/api/history?start=0001-01-01&end=0001-01-02',
    '/api/history?start=2024-01-01&end=2025-01-01', '/api/history?start=2026-01-02&end=2026-01-01',
    '/api/history?start=2024-02-29&end=2024-02-29', '/api/history?start=2026-02-29&end=2026-02-29',
    `/api/history?${window}&front_id=`, `/api/history?${window}&states=open`,
    `/api/dashboard?${window}`, `/api/dashboard?${window}&limit=100`,
    `/api/dashboard?${window}&order=activity_desc&limit=1`,
    `/api/dashboard?${window}&order=activity_desc&limit=2&offset=1`,
    `/api/dashboard?${window}&order=activity_desc&states=open&states=standby&search=%25_`,
    `/api/dashboard?${window}&front_id=${uuidText(hex(1))}&states=archived`,
    `/api/dashboard?${window}&front_id=${uuidText(hex(106))}&search=missing`,
    `/api/dashboard?${window}&front_id=${uuidText(hex(999))}&search=missing`,
    `/api/dashboard?${window}&order=bad`, '/api/dashboard?start=9999-12-30&end=9999-12-31',
    '/api/dashboard?start=2024-01-01&end=2024-12-31&limit=100',
  ];
  const expected = recordedReference('queries', { ...data, cases });
  const { DB, fetcher } = await fixture(t);
  const a = await account(fetcher), b = await account(fetcher);
  await seed(DB, data, { A: a.login.value.account_id.replaceAll('-', ''), B: b.login.value.account_id.replaceAll('-', '') });
  for (const [i, route] of cases.entries()) {
    const result = await request(fetcher, 'GET', route, undefined, a.headers);
    assert.deepEqual({ status: result.status, value: result.value }, expected[i], `Recorded query case ${i}: ${route}`);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  }
  let maximumBindings = 0;
  const bounded = {
    prepare(sql) { return { bind(...values) { maximumBindings = Math.max(maximumBindings, values.length); return DB.prepare(sql).bind(...values); } }; },
    batch: statements => DB.batch(statements),
  };
  const page = await request(localFetcher(bounded), 'GET', `/api/dashboard?${window}&limit=100&order=activity_desc`, undefined, a.headers);
  assert.equal(page.status, 200); assert.equal(page.value.items.length, 100);
  assert.ok(maximumBindings <= 100, 'full page must not expand IDs beyond the D1 parameter limit');
  assert.equal(page.value.items[0].front.id, uuidText(hex(105)), 'global activity order precedes pagination');
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM worker_batch_context').first()).n, 0);
});

test('new query routes reject missing/stale accounts before parsing and recheck revoked proofs inside D1', async t => {
  const { DB, fetcher } = await fixture(t);
  const a = await account(fetcher);
  for (const path of ['/api/fronts', `/api/history?${window}`, `/api/dashboard?${window}`]) {
    assert.equal((await request(fetcher, 'GET', `${path}${path.includes('?') ? '&' : '?'}extra=invalid`)).status, 401);
    assert.equal((await request(fetcher, 'GET', path, undefined, { Cookie: a.headers.Cookie })).status, 409);
  }
  for (const path of ['/api/fronts', `/api/history?${window}`, `/api/dashboard?${window}`]) {
    const credentials = await account(fetcher);
    const wrapped = afterBatch(DB, async n => {
      if (n === 1) assert.equal((await request(fetcher, 'POST', '/auth/logout', undefined, credentials.headers)).status, 204);
    });
    const response = await request(localFetcher(wrapped), 'GET', path, undefined, credentials.headers);
    assert.equal(response.status, 401);
    assert.deepEqual(response.value, { detail: 'Authentication required' });
  }
});
