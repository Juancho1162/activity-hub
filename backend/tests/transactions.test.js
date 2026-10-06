import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, request, account, counts } from './fixture.js';

// Acceptance examples specified before implementing the transactional slice.
// No list/history/dashboard route is needed to inspect the persisted state.
test('same key conflicting concurrent creates and checks: one winner, one 409', async t => {
  const { DB, fetcher } = await fixture(t);
  const a = await account(fetcher);
  const key = randomUUID();
  const creates = await Promise.all(['A', 'B'].map(name => request(fetcher, 'POST', '/api/fronts', { name }, { ...a.headers, 'Idempotency-Key': key })));
  assert.deepEqual(creates.map(r => r.status).sort(), [201, 409]);
  const front = creates.find(r => r.status === 201).value;
  assert.deepEqual(await counts(DB), [1, 0, 1, 0]);
  const checkKey = randomUUID();
  const path = `/api/fronts/${front.id}/check`;
  const checks = await Promise.all([true, false].map(marked => request(fetcher, 'PUT', path, { day: 'yesterday', marked }, { ...a.headers, 'Idempotency-Key': checkKey })));
  assert.deepEqual(checks.map(r => r.status).sort(), [200, 409]);
  const winner = checks.find(r => r.status === 200).value;
  assert.deepEqual(await counts(DB), [1, winner.marked ? 1 : 0, 2, 0]);
});

test('lost create response then edit/replay returns original without reverting data', async t => {
  const { DB, fetcher } = await fixture(t);
  const a = await account(fetcher);
  const key = randomUUID();
  const body = { name: 'Original', reference: 'https://example.test/' };
  const headers = { ...a.headers, 'Idempotency-Key': key };
  // Discard the response after the real HTTP commit, as on a broken connection.
  const lost = await fetcher('/api/fronts', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(lost.status, 201);
  await lost.arrayBuffer();
  const original = await request(fetcher, 'POST', '/api/fronts', body, headers);
  const edited = await request(fetcher, 'PATCH', `/api/fronts/${original.value.id}`, { name: 'Edited', state: 'standby', reference: null }, a.headers);
  assert.equal(edited.status, 200);
  const replay = await request(fetcher, 'POST', '/api/fronts', body, headers);
  assert.deepEqual(replay.value, original.value);
  assert.deepEqual((await request(fetcher, 'GET', `/api/fronts/${original.value.id}`, undefined, a.headers)).value, edited.value);
  assert.deepEqual(await counts(DB), [1, 0, 1, 0]);
});

test('simultaneous checks and independent desired values are not toggles; replays never undo later intent', async t => {
  const { DB, fetcher } = await fixture(t);
  const a = await account(fetcher);
  const front = (await request(fetcher, 'POST', '/api/fronts', { name: 'Archived', state: 'archived' }, { ...a.headers, 'Idempotency-Key': randomUUID() })).value;
  const path = `/api/fronts/${front.id}/check`;
  const markKey = randomUUID();
  const mark = { day: 'yesterday', marked: true };
  const marks = await Promise.all(Array.from({ length: 4 }, () => request(fetcher, 'PUT', path, mark, { ...a.headers, 'Idempotency-Key': markKey })));
  assert.deepEqual(marks.map(r => r.status), [200, 200, 200, 200]);
  for (const result of marks) assert.deepEqual(result.value, marks[0].value);
  const day = marks[0].value.day;
  const independent = await Promise.all(Array.from({ length: 4 }, () => request(fetcher, 'PUT', path, { day, marked: true }, { ...a.headers, 'Idempotency-Key': randomUUID() })));
  assert.ok(independent.every(r => r.status === 200));
  assert.equal((await counts(DB))[1], 1);
  const unmarkKey = randomUUID();
  const unmark = { day, marked: false };
  const unmarked = await request(fetcher, 'PUT', path, unmark, { ...a.headers, 'Idempotency-Key': unmarkKey });
  assert.equal(unmarked.status, 200);
  assert.equal((await counts(DB))[1], 0);
  assert.deepEqual((await request(fetcher, 'PUT', path, mark, { ...a.headers, 'Idempotency-Key': markKey })).value, marks[0].value);
  assert.equal((await counts(DB))[1], 0, 'old mark replay must not restore a removed row');
  await request(fetcher, 'PUT', path, { day, marked: true }, { ...a.headers, 'Idempotency-Key': randomUUID() });
  assert.deepEqual((await request(fetcher, 'PUT', path, unmark, { ...a.headers, 'Idempotency-Key': unmarkKey })).value, unmarked.value);
  assert.equal((await counts(DB))[1], 1, 'old unmark replay must not remove a later mark');
  assert.equal((await request(fetcher, 'GET', `/api/fronts/${front.id}`, undefined, a.headers)).value.state, 'archived');
});

test('synthetic replay insertion failure rolls back create, mark and unmark domain mutations', async t => {
  const { DB, fetcher } = await fixture(t);
  const a = await account(fetcher);
  const front = (await request(fetcher, 'POST', '/api/fronts', { name: 'Preserved' }, { ...a.headers, 'Idempotency-Key': randomUUID() })).value;
  const path = `/api/fronts/${front.id}/check`;
  await request(fetcher, 'PUT', path, { day: 'yesterday', marked: true }, { ...a.headers, 'Idempotency-Key': randomUUID() });
  const baseline = await counts(DB);
  await DB.prepare("CREATE TRIGGER test_reject_replay BEFORE INSERT ON idempotency_requests BEGIN SELECT RAISE(ABORT, 'synthetic-private-marker'); END").run();
  for (const [method, route, body] of [
    ['POST', '/api/fronts', { name: 'Must roll back' }],
    ['PUT', path, { day: 'today', marked: true }],
    ['PUT', path, { day: 'yesterday', marked: false }],
  ]) {
    const result = await request(fetcher, method, route, body, { ...a.headers, 'Idempotency-Key': randomUUID() });
    assert.equal(result.status, 503);
    assert.deepEqual(result.value, { detail: 'Service unavailable' });
    assert.deepEqual(await counts(DB), baseline);
  }
});

test('same create/check keys in separate accounts are independent; foreign front 404 precedes key conflict', async t => {
  const { DB, fetcher } = await fixture(t);
  const a = await account(fetcher);
  const b = await account(fetcher);
  const key = randomUUID();
  const body = { name: 'Same' };
  const fronts = [];
  for (const actor of [a, b]) {
    const result = await request(fetcher, 'POST', '/api/fronts', body, { ...actor.headers, 'Idempotency-Key': key });
    assert.equal(result.status, 201);
    fronts.push(result.value);
  }
  assert.notEqual(fronts[0].id, fronts[1].id);
  const checkKey = randomUUID();
  const check = { day: 'yesterday', marked: true };
  for (const [index, actor] of [a, b].entries()) {
    assert.equal((await request(fetcher, 'PUT', `/api/fronts/${fronts[index].id}/check`, check, { ...actor.headers, 'Idempotency-Key': checkKey })).status, 200);
    const foreign = `/api/fronts/${fronts[1 - index].id}`;
    for (const [method, route, data] of [['GET', foreign, undefined], ['PATCH', foreign, { state: 'standby' }], ['PUT', `${foreign}/check`, check]]) {
      const result = await request(fetcher, method, route, data, { ...actor.headers, 'Idempotency-Key': key });
      assert.equal(result.status, 404);
      assert.deepEqual(result.value, { detail: 'Front not found' });
    }
    assert.deepEqual((await request(fetcher, 'POST', '/api/fronts', body, { ...actor.headers, 'Idempotency-Key': key })).value, fronts[index]);
  }
  assert.deepEqual(await counts(DB), [2, 2, 4, 0]);
});
