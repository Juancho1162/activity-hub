// Loopback HTTP comparison, not a cloud CPU/cost/cold-start benchmark.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fixture, root, account, request, origin } from '../tests/fixture.js';
import { sample, seed } from '../tests/sample.js';

const data = sample(), cleanup = [];
await mkdir(path.join(root, '.state'), { recursive: true });
const directory = await mkdtemp(path.join(root, '.state', 'measure-'));
let python;
try {
  // Test-only instrumentation around the unmodified production entrypoint.
  // No route, credential or environment flag enables this in the deployable Worker.
  const main = path.join(directory, 'instrumented.js');
  await writeFile(main, `import worker from ${JSON.stringify(path.join(root, 'src/worker.js'))};
export default {async fetch(request, env) {
  const meta={statements:0,rows_read:0,rows_written:0};
  const DB={prepare:sql=>env.DB.prepare(sql),async batch(statements){
    const results=await env.DB.batch(statements);meta.statements+=statements.length;
    for(const row of results){meta.rows_read+=row.meta.rows_read;meta.rows_written+=row.meta.rows_written;}
    return results;
  }};
  const response=await worker.fetch(request,{...env,DB});
  response.headers.set('X-Test-D1-Meta',JSON.stringify(meta));return response;
}};`);
  const { DB, url } = await fixture({ after: callback => cleanup.push(callback) }, { main });
  const workerFetch = (route, options) => fetch(new URL(route, url), options);
  const a = await account(workerFetch), b = await account(workerFetch);
  await seed(DB, data, { A: a.login.value.account_id.replaceAll('-', ''), B: b.login.value.account_id.replaceAll('-', '') });
  python = spawn(path.resolve(root, '../.venv/bin/python'), ['-B', path.join(root, 'scripts/measure_reference.py')], {
    cwd: path.resolve(root, '../experiments/python-sqlite'), env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: '1' }, stdio: ['pipe', 'pipe', 'ignore'],
  });
  const lines = createInterface({ input: python.stdout });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Temporary Python server startup timeout')), 15000);
    lines.once('line', line => { clearTimeout(timer); try { resolve(JSON.parse(line)); } catch { reject(new Error('Invalid readiness response')); } });
    python.once('error', () => { clearTimeout(timer); reject(new Error('Temporary Python server failed')); });
    python.once('exit', code => { clearTimeout(timer); reject(new Error(`Temporary Python server exited: ${code}`)); });
  });
  python.stdin.write(JSON.stringify(data) + '\n');
  const { port } = await ready;
  const pythonFetch = (route, options) => fetch(new URL(route, `http://127.0.0.1:${port}`), options);
  const login = await request(pythonFetch, 'POST', '/auth/login', { code: 'A'.repeat(32) }, { Origin: origin });
  if (login.status !== 200) throw new Error('Temporary Python login failed');
  const pythonHeaders = {
    Cookie: login.headers.get('set-cookie').split(';')[0], Origin: origin,
    'X-Activity-Account': login.value.account_id, 'X-CSRF-Token': login.value.csrf_token,
  };
  const results = {};
  const routes = {
    list100: '/api/fronts?limit=100',
    history: '/api/history?start=2026-01-01&end=2026-01-04&limit=1000',
    dashboard100: '/api/dashboard?start=2026-01-01&end=2026-01-04&limit=100&order=activity_desc',
    longSearch: `/api/fronts?search=${'L'.repeat(150)}`,
  };
  // First sampled read follows setup/auth/seed; it is explicitly not a cold start.
  const observed = {};
  for (const [name, fetcher, headers] of [['python', pythonFetch, pythonHeaders], ['workerd', workerFetch, a.headers]]) {
    const metrics = {}, bodies = {};
    async function send(method, route, body, extra, status) {
      const start = performance.now();
      const response = await request(fetcher, method, route, body, { ...headers, ...extra });
      const ms = performance.now() - start;
      assert.equal(response.status, status, `${name}: ${method} ${route}`);
      const meta = JSON.parse(response.headers.get('X-Test-D1-Meta') || 'null');
      if (meta) for (const value of Object.values(meta)) assert.ok(Number.isFinite(value));
      return { ms, meta, body: response.value };
    }
    function summarize(samples) {
      const warm = samples.slice(1).map(s => s.ms).sort((a, b) => a - b);
      return {
        first_ms: Number(samples[0].ms.toFixed(3)), warm_samples: warm.length,
        warm_p50_ms: Number(warm[Math.ceil(warm.length * .5) - 1].toFixed(3)),
        warm_p95_ms: Number(warm[Math.ceil(warm.length * .95) - 1].toFixed(3)),
        d1_local_last: samples.at(-1).meta,
      };
    }
    for (const [operation, route] of Object.entries(routes)) {
      const samples = [];
      for (let n = 0; n < 21; n++) samples.push(await send('GET', route, undefined, {}, 200));
      metrics[operation] = summarize(samples); bodies[operation] = samples[0].body;
    }
    const creates = [], replays = [], checks = [];
    for (let n = 0; n < 21; n++) {
      const key = { 'Idempotency-Key': randomUUID() }, body = { name: `Measured ${n}` };
      const first = await send('POST', '/api/fronts', body, key, 201);
      const replay = await send('POST', '/api/fronts', body, key, 201);
      assert.deepEqual(replay.body, first.body);
      creates.push(first); replays.push(replay);
      checks.push(await send('PUT', `/api/fronts/${first.body.id}/check`, { day: '2026-01-01', marked: true }, { 'Idempotency-Key': randomUUID() }, 200));
    }
    metrics.create = summarize(creates); metrics.replay = summarize(replays); metrics.check = summarize(checks);
    const started = performance.now();
    const concurrent = await Promise.all(Array.from({ length: 8 }, () => send('GET', routes.dashboard100, undefined, {}, 200)));
    concurrent.forEach(result => assert.deepEqual(result.body, concurrent[0].body));
    metrics.dashboard_concurrency8 = { total_ms: Number((performance.now() - started).toFixed(3)), successes: concurrent.length };
    observed[name] = bodies; results[name] = metrics;
  }
  assert.deepEqual(observed.python, observed.workerd, 'identical initial read snapshots');
  const report = {
    measured_at: new Date().toISOString(), node: process.versions.node, platform: `${process.platform}/${process.arch}`,
    dataset: { fronts: data.fronts.length, ownerA: 105, ownerB: 1, legacy: 1, checks: data.checks.length },
    method: 'Real loopback HTTP, sequential Python then workerd, same seeded rows, 1 first + 20 warm samples per operation, 8 simultaneous dashboards after writes. First is after setup, not a process/isolate cold start. Workerd has test-only D1 metadata instrumentation.',
    limits: 'Local emulation only. No cloud CPU, remote latency, billing, hosted cold starts, or recovery claims. D1 rows/statement counts are emulator metadata, not billed usage.',
    results,
  };
  await mkdir(path.join(root, 'test-results'), { recursive: true });
  await writeFile(path.join(root, 'test-results/measurement.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (python && python.exitCode === null && python.signalCode === null) {
    const exit = once(python, 'exit');
    python.stdin.end('\n');
    const timer = setTimeout(() => python.kill('SIGTERM'), 10000);
    await exit; clearTimeout(timer);
  }
  for (const callback of cleanup.reverse()) await callback();
  await rm(directory, { recursive: true, force: true });
}
