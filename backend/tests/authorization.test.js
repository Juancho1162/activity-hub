import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, request, origin, account, localFetcher, sqlClock, afterBatch, domainSnapshot } from './fixture.js';

const initial = '2026-10-03T21:59:00Z';
const expired = '2026-11-02T21:59:00Z';

async function credentials(fetcher, code, previous) {
  const result = await request(fetcher, 'POST', '/auth/login', { code }, { Origin: origin, ...(previous ? { Cookie: previous.Cookie } : {}) });
  assert.equal(result.status, 200);
  return { Cookie: result.headers.get('set-cookie').split(';')[0], Origin: origin,
    'X-Activity-Account': result.value.account_id, 'X-CSRF-Token': result.value.csrf_token };
}

for (const failure of ['revocation', 'expiration']) {
  test(`${failure} between HTTP proof and D1 batch rejects reads/writes/both replay types/logout without domain mutation`, async t => {
    const { DB } = await fixture(t);
    const time = await sqlClock(DB, initial);
    const fetcher = localFetcher(DB, time);
    const a = await account(fetcher);
    let headers = a.headers;
    const createKey = randomUUID();
    const checkKey = randomUUID();
    const body = { name: 'Preserved', reference: 'https://example.test/' };
    const created = await request(fetcher, 'POST', '/api/fronts', body, { ...headers, 'Idempotency-Key': createKey });
    assert.equal(created.status, 201);
    const path = `/api/fronts/${created.value.id}`;
    const check = { day: 'yesterday', marked: true };
    assert.equal((await request(fetcher, 'PUT', `${path}/check`, check, { ...headers, 'Idempotency-Key': checkKey })).status, 200);
    const baseline = await domainSnapshot(DB);
    for (const [method, route, data, key] of [
      ['GET', path, undefined],
      ['PATCH', path, { name: 'Forbidden', state: 'archived' }],
      ['POST', '/api/fronts', { name: 'Forbidden' }, randomUUID()],
      ['PUT', `${path}/check`, { day: 'today', marked: true }, randomUUID()],
      ['POST', '/api/fronts', body, createKey],
      ['PUT', `${path}/check`, check, checkKey],
      ['POST', '/auth/logout', undefined],
    ]) {
      await time.set(initial);
      headers = await credentials(fetcher, a.code, headers);
      const sessions = (await DB.prepare('SELECT count(*) AS n FROM web_sessions').first()).n;
      let proofRead = false;
      const wrapped = afterBatch(DB, async (number, rows) => {
        if (number !== 1) return;
        proofRead = rows.at(-1).results.length === 1;
        if (failure === 'revocation') {
          // A separate logout commits after the initial proof query returns.
          assert.equal((await request(fetcher, 'POST', '/auth/logout', undefined, headers)).status, 204);
        } else {
          await time.set(expired, { staleHint: true });
        }
      });
      const result = await request(localFetcher(wrapped, time), method, route, data, { ...headers, ...(key ? { 'Idempotency-Key': key } : {}) });
      assert.ok(proofRead, 'the initial HTTP gate must have returned a valid proof');
      assert.equal(result.status, 401, `${failure} must precede ${method} lookup/mutation/replay/logout`);
      assert.deepEqual(result.value, { detail: 'Authentication required' });
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.equal(result.headers.get('set-cookie'), null);
      assert.deepEqual(await domainSnapshot(DB), baseline);
      assert.equal((await DB.prepare('SELECT count(*) AS n FROM web_sessions').first()).n, sessions - (failure === 'revocation' ? 1 : 0));
    }
  });
}

test('read serialized before logout can return its authorized snapshot; later reads fail', async t => {
  const { DB, fetcher } = await fixture(t);
  const a = await account(fetcher);
  const created = await request(fetcher, 'POST', '/api/fronts', { name: 'Snapshot' }, { ...a.headers, 'Idempotency-Key': randomUUID() });
  assert.equal(created.status, 201);
  let logoutCommitted = false;
  const wrapped = afterBatch(DB, async number => {
    if (number !== 2) return;
    assert.equal((await request(fetcher, 'POST', '/auth/logout', undefined, a.headers)).status, 204);
    logoutCommitted = true;
  });
  const path = `/api/fronts/${created.value.id}`;
  const reader = await request(localFetcher(wrapped), 'GET', path, undefined, a.headers);
  assert.ok(logoutCommitted, 'logout physically committed before the delayed HTTP read response');
  assert.equal(reader.status, 200);
  assert.deepEqual(reader.value, created.value);
  assert.equal((await request(fetcher, 'GET', path, undefined, a.headers)).status, 401);
});
