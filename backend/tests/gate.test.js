import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, request, origin, account, counts } from './fixture.js';

// First acceptance red: the harness/schema/SQLite clock already work, but the
// deployable Worker lacks the public signup + session + transactional create.
test('real workerd/D1: signup is not login; identical concurrent creates commit one snapshot', async t => {
  const { DB, fetcher } = await fixture(t);
  const probe = await DB.prepare("SELECT strftime('%Y-%m-%d %H:%M:%f000', 'now') AS now, 1 AS alive").first();
  assert.equal(probe.alive, 1);
  assert.match(probe.now, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/);
  assert.equal((await request(fetcher, 'GET', '/health')).status, 200);
  const signup = await request(fetcher, 'POST', '/auth/signup', {}, { Origin: origin });
  assert.equal(signup.status, 201, 'healthy local D1 must support signup');
  assert.equal(signup.headers.get('set-cookie'), null);
  assert.equal((await request(fetcher, 'GET', '/auth/session')).status, 401);
  const login = await request(fetcher, 'POST', '/auth/login', { code: signup.value.code }, { Origin: origin });
  assert.equal(login.status, 200);
  const headers = {
    Cookie: login.headers.get('set-cookie').split(';')[0], Origin: origin,
    'X-CSRF-Token': login.value.csrf_token, 'X-Activity-Account': login.value.account_id,
    'Idempotency-Key': randomUUID(),
  };
  const results = await Promise.all(Array.from({ length: 4 }, () => request(fetcher, 'POST', '/api/fronts', { name: '  Same  ' }, headers)));
  assert.deepEqual(results.map(result => result.status), [201, 201, 201, 201]);
  for (const result of results) assert.deepEqual(result.value, results[0].value);
  assert.equal(results[0].value.name, 'Same');
  assert.deepEqual(await counts(DB), [1, 0, 1, 0]);
});
