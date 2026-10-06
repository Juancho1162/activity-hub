import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_DAY, SIMULATED_TODAY, TIME_ZONE, SampleError, freshSample,
  isDemoDay, inclusiveDays, periodDays, summarize, selectFronts,
  setCheck, safeReference, saveFront,
} from './sample.mjs';

test('fixed Madrid sample: 28 inclusive days, fresh independent records', () => {
  assert.equal(TIME_ZONE, 'Europe/Madrid');
  assert.equal(SIMULATED_TODAY, '2026-10-04');
  const days = inclusiveDays(MIN_DAY, SIMULATED_TODAY);
  assert.equal(days.length, 28);
  assert.equal(days[0], '2026-09-07');
  assert.equal(days.at(-1), SIMULATED_TODAY);
  assert.deepEqual(inclusiveDays(SIMULATED_TODAY, SIMULATED_TODAY), [SIMULATED_TODAY]);
  const first = freshSample();
  const second = freshSample();
  assert.equal(first.length, 8);
  first[0].name = 'Cambio local';
  first[0].marks.length = 0;
  assert.notEqual(second[0].name, first[0].name);
  assert.ok(second[0].marks.length > 0);
  assert.deepEqual(freshSample(), second);
  assert.ok(second.some((front) => front.reference));
  assert.ok(second.some((front) => !front.reference));
  assert.deepEqual([...new Set(second.map((front) => front.state))].sort(), ['archived', 'open', 'standby']);
});

test('strict finite day boundaries reject missing, malformed, impossible and future days', () => {
  for (const invalid of ['', null, '2026-9-07', '2026-09-31', '2026-02-29', '2026-09-06', '2026-10-05', 'garbage']) {
    assert.equal(isDemoDay(invalid), false, String(invalid));
    assert.throws(() => setCheck(freshSample(), 'sample-01', invalid, true), SampleError);
  }
  assert.equal(isDemoDay(MIN_DAY), true);
  assert.equal(isDemoDay(SIMULATED_TODAY), true);
  assert.throws(() => inclusiveDays(SIMULATED_TODAY, MIN_DAY), SampleError);
  assert.throws(() => periodDays(29), SampleError);
  assert.throws(() => periodDays('7'), SampleError);
  assert.equal(periodDays(7)[0], '2026-09-28');
  assert.equal(periodDays(14).length, 14);
});

test('inclusive percentages, zero front and GLOBAL last date outside short period', () => {
  const fronts = freshSample();
  const days = periodDays(7);
  const first = summarize(fronts[0], days);
  assert.equal(first.count, 4);
  assert.equal(first.total, 7);
  assert.equal(first.percentage, 4 / 7 * 100);
  assert.equal(first.last, SIMULATED_TODAY);
  assert.deepEqual(summarize(fronts[4], days), { count: 0, total: 7, percentage: 0, last: null });
  const outside = summarize(fronts[5], days);
  assert.equal(outside.count, 0);
  assert.equal(outside.last, '2026-09-20');
  const full = summarize(fronts[0], periodDays(28));
  assert.equal(full.count, 10);
  assert.equal(full.percentage, 10 / 28 * 100);
});

test('dashboard sorts filtered counts descending with stable creation ties; daily keeps creation order', () => {
  const fronts = freshSample();
  const dashboard = selectFronts(fronts, { view: 'dashboard', state: 'all', period: 7 });
  assert.deepEqual(dashboard.map((front) => front.id), [
    'sample-01', 'sample-02', 'sample-03', 'sample-04', 'sample-07', 'sample-05', 'sample-06', 'sample-08',
  ]);
  assert.deepEqual(selectFronts([...fronts].reverse(), { view: 'daily', state: 'all' }).map((front) => front.id), fronts.map((front) => front.id));
  assert.equal(selectFronts(fronts).length, 5);
  assert.deepEqual(selectFronts(fronts, { view: 'dashboard', state: 'standby', period: 7 }).map((front) => front.id), ['sample-07', 'sample-06']);
  assert.equal(selectFronts(fronts, { state: 'all', search: '  FOTOGRAFíA  ' })[0].id, 'sample-06');
  assert.equal(selectFronts(fronts, { state: 'all', search: 'no existe' }).length, 0);
  assert.throws(() => selectFronts(fronts, { state: 'unknown' }), SampleError);
});

test('sample search retains the product ASCII-case/literal-accent rule', () => {
  const fronts = freshSample();
  assert.equal(selectFronts(fronts, { state: 'all', search: 'FOTOGRAFíA' }).length, 1);
  for (const search of ['FOTOGRAFIA', 'FOTOGRAFÍA', '%', '_']) {
    assert.deepEqual(selectFronts(fronts, { state: 'all', search }), [], search);
  }
});

test('explicit checks/unchecks are idempotent in ALL states and never change state', () => {
  const original = freshSample();
  for (const state of ['open', 'standby', 'archived']) {
    const front = original.find((entry) => entry.state === state);
    const day = '2026-09-26';
    const marked = setCheck(original, front.id, day, true);
    const updated = marked.find((entry) => entry.id === front.id);
    assert.equal(updated.state, state);
    assert.ok(updated.marks.includes(day));
    assert.deepEqual(setCheck(marked, front.id, day, true), marked);
    const unmarked = setCheck(marked, front.id, day, false).find((entry) => entry.id === front.id);
    assert.equal(unmarked.state, state);
    assert.deepEqual(unmarked.marks, front.marks);
    assert.ok(!front.marks.includes(day), 'original sample not mutated');
  }
  assert.throws(() => setCheck(original, 'missing', SIMULATED_TODAY, true), SampleError);
  assert.throws(() => setCheck(original, original[0].id, SIMULATED_TODAY, 'yes'), SampleError);
});

test('reference validation permits only absolute HTTP(S), never credentials or executable schemes', () => {
  assert.equal(safeReference(''), null);
  assert.equal(safeReference('  https://example.invalid/reference?q=demo  '), 'https://example.invalid/reference?q=demo');
  assert.equal(safeReference('http://example.invalid/'), 'http://example.invalid/');
  for (const invalid of ['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/demo', '//example.invalid', '/relative', 'https:/example.invalid', 'https://user:secret@example.invalid/', 'https://example.invalid/\npath', 'not a URL', `https://example.invalid/${'a'.repeat(2048)}`]) {
    assert.throws(() => safeReference(invalid), SampleError, invalid.slice(0, 60));
  }
});

test('normalized references stay within the limit and round-trip through the editor', () => {
  const expanded = `https://example.invalid/${'ñ'.repeat(400)}`;
  assert.ok([...expanded].length < 2048);
  assert.throws(() => safeReference(expanded), SampleError);
  const draft = { name: 'Material ficticio', state: 'open', reference: `https://example.invalid/${'ñ'.repeat(300)}` };
  const normalized = safeReference(draft.reference);
  assert.ok(normalized.length <= 2048);
  assert.equal(safeReference(normalized), normalized);
  const created = saveFront(freshSample(), null, draft);
  const front = created.at(-1);
  assert.doesNotThrow(() => saveFront(created, front.id, { ...front, name: 'Otro nombre ficticio' }));
});

test('sample editor validates fields, keeps history on edits and resets new entries', () => {
  const original = freshSample();
  const draft = { name: '  <img src=x onerror=alert(1)> & estudio  ', reference: '', state: 'archived' };
  const created = saveFront(original, null, draft);
  assert.equal(created.length, 9);
  assert.equal(created.at(-1).name, '<img src=x onerror=alert(1)> & estudio', 'raw name retained for safe textContent rendering');
  assert.deepEqual(created.at(-1).marks, []);
  assert.equal(created.at(-1).state, 'archived');
  assert.equal(original.length, 8);
  const edited = saveFront(created, original[0].id, { name: 'Nombre nuevo', reference: 'https://example.invalid/new', state: 'standby' });
  assert.deepEqual(edited[0].marks, original[0].marks);
  assert.equal(edited[0].state, 'standby');
  assert.equal(freshSample().length, 8);
  for (const invalid of [
    { ...draft, name: '' }, { ...draft, name: '  ' }, { ...draft, name: 'a'.repeat(201) },
    { ...draft, name: 'nul\0name' }, { ...draft, reference: 'javascript:alert(1)' }, { ...draft, state: 'unknown' },
  ]) assert.throws(() => saveFront(original, null, invalid), SampleError);
  assert.throws(() => saveFront(original, 'missing', draft), SampleError);
});
