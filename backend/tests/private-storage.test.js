import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { fixture, request, origin } from './fixture.js';
import { createWorker } from '../src/worker.js';

const credential = () => randomBytes(32).toString('hex');
async function privateAccount(fetcher) {
  const secret = credential();
  const signup = await request(fetcher, 'POST', '/auth/signup', { credential: secret }, { Origin: origin });
  assert.equal(signup.status, 201);
  assert.equal(signup.value.code, undefined, 'the server must never generate the private code');
  const login = await request(fetcher, 'POST', '/auth/login', { credential: secret }, { Origin: origin });
  assert.equal(login.status, 200);
  return { secret, id: login.value.account_id, headers: {
    Cookie: login.headers.get('set-cookie').split(';')[0], Origin: origin,
    'X-CSRF-Token': login.value.csrf_token, 'X-Activity-Account': login.value.account_id,
  } };
}
const envelope = (version, day, legacy_revision = 0) => ({ version, day, legacy_revision, iv: randomBytes(12).toString('base64'), ciphertext: randomBytes(48).toString('base64') });

test('session polling applies the authenticated account limiter and requires its production binding', async t => {
  const { DB, fetcher } = await fixture(t, { legacy: false });
  const a = await privateAccount(fetcher);
  const allow = { limit: async () => ({ success: true }) };
  const env = { DB, WEB_ORIGIN: 'https://activity.example', GLOBAL_RATE_LIMITER: allow, IP_RATE_LIMITER: allow, AUTH_RATE_LIMITER: allow };
  const worker = createWorker();
  for (const [binding, status] of [[{ limit: async () => ({ success: false }) }, 429], [undefined, 503]]) {
    const response = await worker.fetch(new Request('https://activity.example/auth/session', { headers: { Cookie: `__Host-${a.headers.Cookie}` } }), { ...env, ACCOUNT_RATE_LIMITER: binding });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('private storage: opaque bounded data, account isolation, atomic concurrent updates and no plaintext API', async t => {
  const { DB, fetcher } = await fixture(t, { legacy: false });
  const a = await privateAccount(fetcher);
  const b = await privateAccount(fetcher);
  const get = () => request(fetcher, 'GET', '/api/vault', undefined, a.headers);
  const empty = await get();
  assert.equal(empty.status, 200);
  assert.equal(empty.value.version, 0);
  assert.equal(empty.value.ciphertext, null);
  const body = envelope(0, empty.value.day);
  const competing = await Promise.all([body, envelope(0, empty.value.day)].map(value => request(fetcher, 'PUT', '/api/vault', value, a.headers)));
  assert.deepEqual(competing.map(r => r.status).sort(), [200, 409]);
  const stored = await get();
  assert.equal(stored.value.version, 1);
  assert.equal((await request(fetcher, 'GET', '/api/vault', undefined, b.headers)).value.ciphertext, null);
  assert.equal((await request(fetcher, 'GET', '/api/vault', undefined, { ...b.headers, 'X-Activity-Account': a.id })).status, 409);
  assert.equal((await request(fetcher, 'PUT', '/api/vault', body, { ...a.headers, 'X-CSRF-Token': 'bad' })).status, 403);
  assert.equal((await request(fetcher, 'POST', '/api/fronts', { name: 'Must never enter D1' }, a.headers)).status, 410);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM fronts').first()).n, 0);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM worker_batch_context').first()).n, 0);
  const rows = await DB.prepare('SELECT code_verifier,auth_verifier FROM accounts').all();
  assert.ok(rows.results.every(row => row.code_verifier !== a.secret && row.auth_verifier !== a.secret));
  const oversized = { ...envelope(1, stored.value.day), ciphertext: randomBytes(512 * 1024 + 1).toString('base64') };
  assert.equal((await request(fetcher, 'PUT', '/api/vault', oversized, a.headers)).status, 413);
  assert.deepEqual((await get()).value.ciphertext, stored.value.ciphertext);
});

test('100-account cap remains exact under concurrent signup and returns no credentials on rejection', async t => {
  const { DB, fetcher } = await fixture(t, { legacy: false });
  await DB.batch(Array.from({ length: 99 }, () => DB.prepare('INSERT INTO accounts(id,code_verifier,created_at) VALUES (?,?,?)')
    .bind(randomBytes(16).toString('hex'), credential(), '2026-10-06 00:00:00.000000')));
  const results = await Promise.all(Array.from({ length: 4 }, () => request(fetcher, 'POST', '/auth/signup', { credential: credential() }, { Origin: origin })));
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.equal(results.filter(r => r.status === 403 && r.value.detail === 'Registration capacity reached').length, 3);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM accounts').first()).n, 100);
});

test('private sessions stay bounded; expired and concurrently revoked proofs cannot read or write a vault', async t => {
  const { DB, fetcher } = await fixture(t, { legacy: false });
  const a = await privateAccount(fetcher);
  const sessions = await Promise.all(Array.from({ length: 24 }, () => request(fetcher, 'POST', '/auth/login', { credential: a.secret }, { Origin: origin })));
  assert.ok(sessions.every(result => result.status === 200));
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM web_sessions').first()).n, 20);
  for (const method of ['GET', 'PUT']) {
    const login = await request(fetcher, 'POST', '/auth/login', { credential: a.secret }, { Origin: origin });
    const headers = { ...a.headers, Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': login.value.csrf_token };
    let batches = 0;
    const racingDB = { prepare: sql => DB.prepare(sql), async batch(statements) {
      if (++batches === 2) await DB.prepare('DELETE FROM web_sessions').run();
      return DB.batch(statements);
    } };
    const worker = createWorker();
    const racingFetch = (url, init) => worker.fetch(new Request(new URL(url, origin), init), { DB: racingDB, WEB_ORIGIN: origin });
    const result = await request(racingFetch, method, '/api/vault', method === 'PUT' ? envelope(0, '2026-10-06') : undefined, headers);
    assert.equal(result.status, 401);
    assert.equal((await DB.prepare('SELECT count(*) AS n FROM encrypted_vaults').first()).n, 0);
  }
  const login = await request(fetcher, 'POST', '/auth/login', { credential: a.secret }, { Origin: origin });
  await DB.prepare("UPDATE web_sessions SET created_at='1999-12-02 00:00:00.000000',expires_at='2000-01-01 00:00:00.000000'").run();
  assert.equal((await request(fetcher, 'GET', '/api/vault', undefined, { ...a.headers, Cookie: login.headers.get('set-cookie').split(';')[0] })).status, 401);
});

test('existing accounts unlock with a derived credential; migration removes plaintext only in the successful ciphertext transaction', async t => {
  const { DB, fetcher } = await fixture(t, { legacy: false });
  const id = randomBytes(16).toString('hex');
  const derived = createHash('sha256').update(`activity-hub:access-code:v1:${'A'.repeat(32)}`).digest('hex');
  await DB.prepare('INSERT INTO accounts(id,code_verifier,created_at) VALUES (?,?,?)').bind(id, derived, '2026-10-06 00:00:00.000000').run();
  await DB.prepare('INSERT INTO fronts(id,account_id,name,state,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .bind('a'.repeat(32), id, 'Synthetic migration example', 'open', '2026-10-06 00:00:00.000000', '2026-10-06 00:00:00.000000').run();
  const login = await request(fetcher, 'POST', '/auth/login', { credential: derived }, { Origin: origin });
  assert.equal(login.status, 200);
  const headers = { Origin: origin, Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': login.value.csrf_token, 'X-Activity-Account': login.value.account_id };
  const previous = await request(fetcher, 'GET', '/api/vault', undefined, headers);
  assert.equal(previous.value.legacy.fronts[0].name, 'Synthetic migration example');
  assert.equal((await request(fetcher, 'PUT', '/api/vault', envelope(1, previous.value.day), headers)).status, 409);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM fronts').first()).n, 1);
  await DB.prepare('UPDATE fronts SET name=? WHERE id=?').bind('Late old-Worker write', 'a'.repeat(32)).run();
  assert.equal((await request(fetcher, 'PUT', '/api/vault', envelope(0, previous.value.day, previous.value.legacy_revision), headers)).status, 409);
  const current = await request(fetcher, 'GET', '/api/vault', undefined, headers);
  assert.equal(current.value.legacy.fronts[0].name, 'Late old-Worker write');
  await DB.prepare("CREATE TRIGGER fail_vault BEFORE INSERT ON encrypted_vaults BEGIN SELECT RAISE(ABORT,'synthetic'); END").run();
  assert.equal((await request(fetcher, 'PUT', '/api/vault', envelope(0, current.value.day, current.value.legacy_revision), headers)).status, 503);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM fronts').first()).n, 1);
  await DB.prepare('DROP TRIGGER fail_vault').run();
  assert.equal((await request(fetcher, 'PUT', '/api/vault', envelope(0, current.value.day, current.value.legacy_revision), headers)).status, 200);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM fronts').first()).n, 0);
  assert.equal((await request(fetcher, 'GET', '/api/vault', undefined, headers)).value.legacy, null);
  await assert.rejects(DB.prepare('INSERT INTO fronts(id,account_id,name,state,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .bind('b'.repeat(32), id, 'Forbidden plaintext', 'open', '2026-10-06 00:00:00.000000', '2026-10-06 00:00:00.000000').run());
});
