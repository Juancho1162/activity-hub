import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
// No personal Wrangler configuration, credential environment, telemetry or dotenv.
const isolatedConfig = path.join(root, '.cache', 'wrangler-home');
mkdirSync(isolatedConfig, { recursive: true });
const env = {
  PATH: process.env.PATH,
  HOME: isolatedConfig,
  XDG_CONFIG_HOME: path.join(isolatedConfig, 'config'),
  XDG_CACHE_HOME: path.join(isolatedConfig, 'cache'),
  WRANGLER_SEND_METRICS: 'false',
  WRANGLER_LOG: 'error',
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
  CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
  CI: 'true',
};
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
function jsFiles(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? jsFiles(`${directory}/${entry.name}`) : entry.name.endsWith('.js') ? [`${directory}/${entry.name}`] : []);
}
const mode = process.argv[2];
if (!['test', 'check', 'browser', 'browser-ui', 'measure', 'dev', 'migrate'].includes(mode)) throw new Error('Use test, check, browser, browser-ui, measure, dev or migrate');
if (Number(process.versions.node.split('.')[0]) !== 26) throw new Error('Activity Hub requires Node 26. Run npm from the workspace root.');
if (mode === 'check') {
  for (const file of ['src', 'tests', 'scripts'].flatMap(jsFiles)) run(process.execPath, ['--check', file]);
}
if (mode !== 'measure') run('npm', ['--prefix', '../frontend', 'run', 'build']);
const wrangler = args => run(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args, '--env-file', 'scripts/no-secrets.txt']);
if (mode === 'migrate') {
  wrangler(['d1', 'migrations', 'apply', 'DB', '--env', 'local', '--local', '--persist-to', '.state/local']);
} else if (mode === 'dev') {
  console.log('Activity Hub: http://127.0.0.1:8787 — Ctrl+C para detener.');
  wrangler(['dev', '--env', 'local', '--local', '--ip', '127.0.0.1', '--port', '8787', '--persist-to', '.state/local']);
} else if (mode === 'browser-ui') {
  run(process.execPath, ['../frontend/tests/browser-check.mjs']);
} else if (mode === 'browser' || mode === 'measure') {
  run(process.execPath, [`scripts/${mode === 'browser' ? 'browser-check' : 'measure'}.js`]);
} else {
  run(process.execPath, ['--test', '--test-concurrency=1', ...process.argv.slice(3), ...jsFiles('tests').filter(file => file.endsWith('.test.js'))]);
}
if (mode === 'check') {
  // Explicit empty env-file argument suppresses .dev.vars lookup; dotenv is off.
  wrangler(['deploy', '--env', 'local', '--dry-run', '--outdir', 'dist']);
}
