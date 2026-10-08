// Fictional dataset for recorded query contracts and D1 regression tests.
const hex = i => i.toString(16).padStart(32, '0');
export function sample() {
  const fronts = Array.from({ length: 105 }, (_, i) => ({
    id: hex(i + 1), owner: 'A', name: `Item ${i}`, reference: null,
    state: i === 104 ? 'open' : ['open', 'standby', 'archived'][i % 3],
    created_at: '2026-01-01 00:00:00.000000', updated_at: '2026-01-01 00:00:00.000000',
  }));
  fronts[0].name = `Literal%_/ ${'L'.repeat(150)}`;
  fronts[1].name = `literal%_/ ${'L'.repeat(150)}`;
  fronts[2].name = 'Café'; fronts[3].name = 'CAFÉ';
  fronts[4].name = fronts[5].name = 'Same';
  fronts.push({ ...fronts[0], id: hex(106), owner: 'B' }, { ...fronts[0], id: hex(107), owner: null });
  const checks = fronts.flatMap((f, i) => Array.from({ length: i === 104 ? 4 : i % 3 }, (_, d) => ({ front_id: f.id, day: `2026-01-0${d + 1}` })));
  checks.push({ front_id: hex(1), day: '2026-09-30' });
  return { fronts, checks };
}
export async function seed(DB, data, owners) {
  const statements = data.fronts.map(row => DB.prepare('INSERT INTO fronts(id,account_id,name,reference,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .bind(row.id, owners[row.owner] || null, row.name, row.reference, row.state, row.created_at, row.updated_at));
  statements.push(...data.checks.map(row => DB.prepare('INSERT INTO activity_checks(front_id,day) VALUES (?,?)').bind(row.front_id, row.day)));
  for (let i = 0; i < statements.length; i += 40) await DB.batch(statements.slice(i, i + 40));
}
