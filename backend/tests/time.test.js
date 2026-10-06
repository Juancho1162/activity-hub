import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, request, account, localFetcher, sqlClock, afterBatch, domainSnapshot } from './fixture.js';

for (const [label, before, after, today, yesterday] of [
  ['midnight', '2026-10-03T21:59:59Z', '2026-10-03T22:00:00Z', '2026-10-04', '2026-10-03'],
  ['spring DST', '2026-03-29T00:59:59Z', '2026-03-29T01:00:00Z', '2026-03-29', '2026-03-28'],
  ['autumn DST', '2026-10-25T00:59:59Z', '2026-10-25T01:00:00Z', '2026-10-25', '2026-10-24'],
]) {
  test(`SQL resolves Madrid at serialization across ${label}, even with a stale JS hint`, async t => {
    const { DB } = await fixture(t);
    const time = await sqlClock(DB, before);
    const fetcher = localFetcher(DB, time);
    const a = await account(fetcher);
    const front = await request(fetcher, 'POST', '/api/fronts', { name: 'Calendar' }, { ...a.headers, 'Idempotency-Key': randomUUID() });
    assert.equal(front.status, 201);
    const route = `/api/fronts/${front.value.id}/check`;
    const delayed = localFetcher(afterBatch(DB, async n => { if (n === 1) await time.set(after, { staleHint: true }); }), time);
    const key = randomUUID();
    const result = await request(delayed, 'PUT', route, { day: 'today', marked: true }, { ...a.headers, 'Idempotency-Key': key });
    assert.deepEqual(result.value, { front_id: front.value.id, day: today, marked: true });
    assert.equal((await request(fetcher, 'PUT', route, { day: 'yesterday', marked: true }, { ...a.headers, 'Idempotency-Key': randomUUID() })).value.day, yesterday);
    const snapshot = await domainSnapshot(DB);
    const future = await request(fetcher, 'PUT', route, { day: '9999-12-31', marked: true }, { ...a.headers, 'Idempotency-Key': randomUUID() });
    assert.equal(future.status, 422);
    assert.deepEqual(await domainSnapshot(DB), snapshot);
    await time.set(new Date(Date.parse(after) + 86400000).toISOString());
    assert.equal((await request(fetcher, 'PUT', route, { day: today, marked: false }, { ...a.headers, 'Idempotency-Key': randomUUID() })).status, 200);
    const replay = await request(fetcher, 'PUT', route, { day: 'today', marked: true }, { ...a.headers, 'Idempotency-Key': key });
    assert.deepEqual(replay.value, result.value);
    assert.equal((await DB.prepare('SELECT count(*) AS n FROM activity_checks WHERE day=?').bind(today).first()).n, 0);
  });
}
