import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, account, request } from './fixture.js';
import { pythonReference } from './reference.js';
import { frontInput, checkInput, uuidHex, canonicalPayload } from '../src/contracts.js';

test('input normalization and canonical replay payload match the installed Python contracts', () => {
  const cases = [
    ...[' \u001cCafé 🎸\u0085 ', '\ufeffName\ufeff', '🎸'.repeat(200), '🎸'.repeat(201), '', '  ', 'bad\0name', 3]
      .map(name => ({ kind: 'create', value: { name } })),
    ...[null, 'HTTPS://bücher.example:443/mañana?q=🎸', 'https://example.test', 'http://127.1',
      'https://example.test/a/../b', 'mailto:user@example.test', '/relative', 3, 'https://example.test/' + 'x'.repeat(2048)]
      .map(reference => ({ kind: 'create', value: { name: 'Name', reference } })),
    ...[{}, { reference: null }, { name: null }, { state: null }, { name: ' Trim ' }, { state: 'open' }, { extra: 1 }]
      .map(value => ({ kind: 'patch', value })),
    ...[{ day: 'today', marked: true }, { day: 'yesterday', marked: false }, { day: '2024-02-29', marked: true },
      { day: '2026-02-29', marked: true }, { day: '0000-01-01', marked: true }, { day: '2026-01-01', marked: 1 }]
      .map(value => ({ kind: 'check', value })),
    ...['a'.repeat(32), 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', '{aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa}',
      'urn:uuid:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'invalid', null].map(value => ({ kind: 'uuid', value })),
  ];
  const expected = pythonReference('validate', { cases });
  for (const [index, example] of cases.entries()) {
    let actual;
    try {
      const value = example.kind === 'uuid' ? uuidHex(example.value)
        : example.kind === 'check' ? checkInput(example.value) : frontInput(example.value, example.kind === 'patch');
      actual = { valid: true, value, ...(example.kind === 'uuid' ? {} : { payload: canonicalPayload(value) }) };
    } catch { actual = { valid: false }; }
    assert.deepEqual(actual, expected[index], `Python normalization case ${index}`);
  }
});

test('fictitious Python Unicode replays retain their response/date and never undo later edits after import', async t => {
  const { DB, fetcher } = await fixture(t);
  const a = await account(fetcher);
  const data = pythonReference('replays', { account_id: a.login.value.account_id });
  for (const [table, rows] of [['fronts', data.fronts], ['idempotency_requests', data.records]]) {
    for (const row of rows) {
      const columns = Object.keys(row);
      await DB.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...Object.values(row)).run();
    }
  }
  const created = await request(fetcher, 'POST', '/api/fronts', data.body, { ...a.headers, 'Idempotency-Key': 'a'.repeat(32) });
  assert.equal(created.status, 201);
  assert.deepEqual(created.value, data.create);
  const check = await request(fetcher, 'PUT', `/api/fronts/${data.create.id}/check`, { day: 'today', marked: true }, { ...a.headers, 'Idempotency-Key': 'b'.repeat(32) });
  assert.equal(check.status, 200);
  assert.deepEqual(check.value, data.check);
  assert.equal((await request(fetcher, 'GET', `/api/fronts/${data.create.id}`, undefined, a.headers)).value.name, 'Editado después');
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM fronts').first()).n, 1);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM activity_checks').first()).n, 0);
});
