import { mkdtemp, mkdir, rm, readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestHarness, getPlatformProxy, unstable_splitSqlQuery as splitSqlQuery } from 'wrangler';
import { createWorker } from '../src/worker.js';
import { databaseClock, utcText } from '../src/time.js';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const origin = 'http://127.0.0.1:8787';
export async function fixture(t, { migrate = true, webOrigin = origin, assets = false, main, legacy = true } = {}) {
  await mkdir(path.join(root, '.state'), { recursive: true });
  const directory = await mkdtemp(path.join(root, '.state', 'gate-'));
  // Inline config rooted in our own empty directory avoids .dev.vars probes
  // against the user's project/home. Only the deployable main is bundled.
  const local = JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
  const config = {
    ...local,
    ...local.env.local,
    main: path.join(root, legacy ? 'tests/legacy-worker.js' : local.main),
    vars: { WEB_ORIGIN: webOrigin },
    d1_databases: local.env.local.d1_databases.map(db => ({ ...db, migrations_dir: path.join(root, db.migrations_dir) })),
  };
  delete config.env;
  if (assets && config.assets) {
    // Freeze this test's public build: concurrent UI builds must not replace
    // hashed chunks while a long browser run is opening another tab.
    const assetSnapshot = path.join(directory, 'assets');
    await cp(path.resolve(root, config.assets.directory), assetSnapshot, { recursive: true });
    config.assets = { ...config.assets, directory: assetSnapshot };
  } else delete config.assets;
  if (main) config.main = main;
  let options = { root: directory, workers: [{ config }] };
  const server = createTestHarness(options);
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  const { url } = await server.listen();
  if (webOrigin === null) {
    config.vars.WEB_ORIGIN = url.origin;
    options = { ...options, workers: [{ config }] };
    await server.update(options);
  }
  const worker = server.getWorker();
  if (migrate) await worker.applyD1Migrations('DB');
  const { DB } = await worker.getEnv();
  const fetcher = (url, options) => server.fetch(url, options);
  return { server, DB, config, directory, options, fetcher, url };
}

export async function request(fetcher, method, route, body, headers = {}) {
  const response = await fetcher(route, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = response.status === 204 ? null : await response.json();
  return { status: response.status, value, headers: response.headers };
}
export async function account(fetcher, webOrigin = origin) {
  const signup = await request(fetcher, 'POST', '/auth/signup', {}, { Origin: webOrigin });
  if (signup.status !== 201) throw new Error(`Signup did not succeed: ${signup.status}`);
  // Never include generated codes/cookies/CSRF in assert diagnostics or logs.
  const login = await request(fetcher, 'POST', '/auth/login', { code: signup.value.code }, { Origin: webOrigin });
  if (login.status !== 200) throw new Error(`Login did not succeed: ${login.status}`);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  return {
    code: signup.value.code,
    signup, login,
    headers: { Cookie: cookie, Origin: webOrigin, 'X-CSRF-Token': login.value.csrf_token, 'X-Activity-Account': login.value.account_id },
  };
}
export async function counts(DB) {
  const rows = await DB.batch(['fronts', 'activity_checks', 'idempotency_requests', 'worker_batch_context'].map(table =>
    DB.prepare(`SELECT count(*) AS n FROM ${table}`)));
  return rows.map(row => row.results[0].n);
}

// Runs the same Worker fetch handler with a real workerd/D1 binding. Constructor
// clocks and wrappers stay in tests; the deployable HTTP/env surface has no hook.
export function localFetcher(DB, { clock = databaseClock, webOrigin = origin } = {}) {
  const worker = createWorker({ clock, legacy: true });
  return (route, options) => worker.fetch(new Request(new URL(route, webOrigin), options), { DB, WEB_ORIGIN: webOrigin });
}

export async function sqlClock(DB, instant) {
  await DB.prepare('CREATE TABLE test_clock(now TEXT NOT NULL)').run();
  await DB.prepare('INSERT INTO test_clock VALUES (?)').bind(utcText(Date.parse(instant))).run();
  let hint = Date.parse(instant);
  return {
    clock: () => ({ sql: '(SELECT now FROM test_clock)', bindings: [], hint }),
    async set(instant, { staleHint = false } = {}) {
      if (!staleHint) hint = Date.parse(instant);
      await DB.prepare('UPDATE test_clock SET now=?').bind(utcText(Date.parse(instant))).run();
    },
  };
}

export function afterBatch(DB, hook) {
  let calls = 0;
  return {
    prepare: sql => DB.prepare(sql),
    async batch(statements) {
      const rows = await DB.batch(statements);
      await hook(++calls, rows);
      return rows;
    },
  };
}

export async function domainSnapshot(DB) {
  const rows = await DB.batch([
    DB.prepare('SELECT * FROM fronts ORDER BY id'),
    DB.prepare('SELECT * FROM activity_checks ORDER BY front_id,day'),
    DB.prepare('SELECT * FROM idempotency_requests ORDER BY account_id,key'),
    DB.prepare('SELECT * FROM worker_batch_context ORDER BY nonce'),
  ]);
  return rows.map(row => row.results);
}

// Wrangler's HTTP test harness deliberately uses persist=false. Use its D1
// platform proxy with an explicit disposable path to test a physical reopen.
export async function persistentFixture(t) {
  await mkdir(path.join(root, '.state'), { recursive: true });
  const directory = await mkdtemp(path.join(root, '.state', 'persist-'));
  const local = JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
  const configPath = path.join(directory, 'wrangler.json');
  await writeFile(configPath, JSON.stringify({
    ...local, ...local.env.local, main: path.join(root, local.main), env: undefined,
    vars: { WEB_ORIGIN: origin },
  }));
  const options = { configPath, envFiles: [], persist: { path: path.join(directory, 'd1') }, remoteBindings: false };
  let proxy;
  async function open() {
    proxy = await getPlatformProxy(options);
    const DB = proxy.env.DB;
    return { DB, fetcher: localFetcher(DB) };
  }
  t.after(async () => { await proxy?.dispose(); await rm(directory, { recursive: true, force: true }); });
  const initial = await open();
  for (const migration of ['0001_gate.sql', '0002_private_storage.sql']) {
    const sql = await readFile(path.join(root, `migrations/${migration}`), 'utf8');
    await initial.DB.batch(splitSqlQuery(sql).map(statement => initial.DB.prepare(statement)));
  }
  return { ...initial, async reopen() { await proxy.dispose(); return open(); } };
}
