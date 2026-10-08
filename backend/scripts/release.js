// Verification and publication are explicit, separate commands. No Git writes.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const release = path.join(root, '.release');
const target = { worker: 'activity-hub', account: '72734ad9e032887b9758d0c2216e3d48', database: '5ffb5d44-eb8f-4fac-8c2b-5714a1251460', origin: 'https://activity-hub.software-juancho-prego-gundin.workers.dev' };
const sha = value => createHash('sha256').update(value).digest('hex');
function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('No se ha podido comprobar Git.');
  return result.stdout;
}
function run(command, args, { cwd = root, capture = false, env = process.env } = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Ha fallado ${path.basename(command)} ${args[0] || ''}; publicación detenida.`);
  return result.stdout;
}
async function json(file) { return JSON.parse(await readFile(file, 'utf8')); }
async function save(file, value) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + '\n'); }
export async function sourceFingerprint() {
  const files = [...new Set(git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean))].sort();
  if (files.some(name => /(^|\/)(\.env(?:\..*)?|\.dev\.vars(?:\..*)?|auth\.json|credentials(?:\.json)?)$/.test(name))) throw new Error('Git incluye un archivo de credenciales; no se leerá ni publicará.');
  // Documentation edits do not change the executable artifact or its tests.
  const selected = files.filter(name => !name.endsWith('.md'));
  const entries = [];
  for (const name of selected) {
    try { entries.push([name, sha(await readFile(path.join(root, name)))]); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return sha(JSON.stringify(entries));
}
async function treeFingerprint(directory) {
  const entries = [];
  async function visit(relative) {
    for (const entry of (await readdir(path.join(directory, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error('El artefacto no admite enlaces simbólicos.');
      if (entry.isDirectory()) await visit(name);
      else entries.push([name, sha(await readFile(path.join(directory, name)))]);
    }
  }
  await visit('');
  return sha(JSON.stringify(entries));
}
export function validateTarget(config) {
  const env = config.env?.production;
  if (env?.name !== target.worker || env.account_id !== target.account || env.vars?.WEB_ORIGIN !== target.origin
    || env.d1_databases?.length !== 1 || env.d1_databases[0].binding !== 'DB' || env.d1_databases[0].database_id !== target.database
    || env.preview_urls !== false || !env.vars.TURNSTILE_SITEKEY || env.vars.TURNSTILE_SECRET
    || !['GLOBAL_RATE_LIMITER', 'IP_RATE_LIMITER', 'AUTH_RATE_LIMITER', 'ACCOUNT_RATE_LIMITER'].every(name => env.ratelimits?.some(binding => binding.name === name && binding.simple?.limit > 0 && binding.simple?.period === 60))) {
    throw new Error('Destino, CAPTCHA o límites de producción incompletos; publicación detenida.');
  }
  return env;
}
function dryBundle(artifact) {
  // Dry-run has no need for the operator's Cloudflare session or environment.
  const isolatedConfig = path.join(root, 'backend/.cache/release-home');
  const env = { PATH: process.env.PATH, HOME: isolatedConfig, XDG_CONFIG_HOME: path.join(isolatedConfig, 'config'), XDG_CACHE_HOME: path.join(isolatedConfig, 'cache'), CI: 'true',
    WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_SANITIZE: 'true', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' };
  return run(process.execPath, [path.join(root, 'backend/node_modules/wrangler/bin/wrangler.js'), 'deploy', '--dry-run', '--outdir', path.join(artifact, 'worker'),
    '--config', path.join(root, 'backend/wrangler.jsonc'), '--env', 'production', '--env-file', path.join(root, 'backend/scripts/no-secrets.txt')], { env });
}
async function verify() {
  const source = await sourceFingerprint();
  const checks = ['check', 'test:integration', 'test:browser', 'test:presentation'];
  for (const task of checks) run('npm', ['run', task]);
  if (await sourceFingerprint() !== source) throw new Error('El código cambió durante las pruebas. Hay que verificarlas de nuevo.');
  await save(path.join(release, 'verification.json'), { source, assets_hash: await treeFingerprint(path.join(root, 'frontend/dist')), verified_at: new Date().toISOString(), checks });
  console.log('Verificación completa. No se ha publicado ni modificado Git.');
}
async function prepare() {
  const config = await json(path.join(root, 'backend/wrangler.jsonc'));
  validateTarget(config);
  let proof;
  try { proof = await json(path.join(release, 'verification.json')); } catch {}
  if (proof?.source !== await sourceFingerprint() || !proof?.assets_hash) { await verify(); proof = await json(path.join(release, 'verification.json')); }
  if (await treeFingerprint(path.join(root, 'frontend/dist')) !== proof.assets_hash) throw new Error('El frontend compilado no coincide con el verificado; ejecuta npm run verify.');
  // A fresh directory avoids including stale assets from an older build.
  const artifact = path.join(release, `build-${crypto.randomUUID()}`);
  await mkdir(artifact, { recursive: true });
  dryBundle(artifact);
  await cp(path.join(root, 'frontend/dist'), path.join(artifact, 'assets'), { recursive: true });
  if (await treeFingerprint(path.join(artifact, 'assets')) !== proof.assets_hash) throw new Error('Los assets cambiaron durante la preparación.');
  await cp(path.join(root, 'backend/migrations'), path.join(artifact, 'migrations'), { recursive: true });
  const frozen = structuredClone(config);
  delete frozen.env.local;
  delete frozen.dev;
  frozen.main = path.join(artifact, 'worker/worker.js');
  frozen.assets.directory = path.join(artifact, 'assets');
  frozen.env.production.d1_databases[0].migrations_dir = path.join(artifact, 'migrations');
  await save(path.join(artifact, 'wrangler.json'), frozen);
  if (await sourceFingerprint() !== proof.source) throw new Error('El código cambió al preparar el artefacto.');
  await save(path.join(release, 'manifest.json'), { ...proof, artifact, artifact_hash: await treeFingerprint(artifact), target, prepared_at: new Date().toISOString() });
  console.log(`Artefacto comprobado y congelado en ${artifact}.`);
}
export async function assertPrepared({ requireMain = true } = {}) {
  const manifest = await json(path.join(release, 'manifest.json'));
  if (manifest.source !== await sourceFingerprint()) throw new Error('Hay código sin verificar; ejecuta npm run release:prepare.');
  if (path.dirname(manifest.artifact) !== release || !path.basename(manifest.artifact).startsWith('build-')
    || manifest.artifact_hash !== await treeFingerprint(manifest.artifact)) throw new Error('El artefacto preparado ha cambiado.');
  validateTarget(await json(path.join(manifest.artifact, 'wrangler.json')));
  if (requireMain && (git(['branch', '--show-current']).trim() !== 'main' || git(['status', '--porcelain']).trim())) throw new Error('Publicar requiere main sin cambios pendientes. Revisa y registra el cambio en Git primero.');
  return manifest;
}
function frozenCommand(manifest, args, capture = false) {
  return run(process.execPath, [path.join(root, 'backend/node_modules/wrangler/bin/wrangler.js'), ...args, '--config', path.join(manifest.artifact, 'wrangler.json'), '--env', 'production', '--env-file', path.join(root, 'backend/scripts/no-secrets.txt')], {
    capture, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' },
  });
}
async function smoke() {
  for (const [pathname, status] of [['/', 200], ['/app/', 200], ['/presentacion/', 200], ['/health', 200], ['/auth/session', 401], ['/api/vault', 401]]) {
    const response = await fetch(target.origin + pathname, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (response.status !== status) throw new Error(`Comprobación remota fallida: ${pathname}.`);
    if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
      if (response.headers.get('cache-control') !== 'no-store') throw new Error('Falta no-store en una ruta privada.');
    }
    if (['/', '/app/', '/presentacion/'].includes(pathname) && !response.headers.get('content-security-policy')) throw new Error('Falta CSP en una página pública.');
    await response.arrayBuffer();
  }
  const settings = await (await fetch(target.origin + '/auth/config', { signal: AbortSignal.timeout(15000) })).json();
  if (settings.local !== false || !settings.sitekey || settings.registration_enabled !== true) throw new Error('Turnstile no está preparado en producción.');
  const blocked = await fetch(target.origin + '/auth/signup', { method: 'POST', headers: { Origin: target.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: 'a'.repeat(64) }), signal: AbortSignal.timeout(15000) });
  if (blocked.status !== 403) throw new Error('El alta sin CAPTCHA no está bloqueada.');
  console.log('Comprobaciones remotas de lectura/acceso correctas; no se han creado cuentas.');
}
async function main(mode) {
  if (Number(process.versions.node.split('.')[0]) !== 26) throw new Error('Se requiere Node 26.');
  if (mode === 'verify') return verify();
  if (mode === 'prepare') return prepare();
  if (mode === 'smoke') return smoke();
  if (!['migrate', 'deploy'].includes(mode)) throw new Error('Usa verify, prepare, migrate, deploy o smoke.');
  const manifest = await assertPrepared();
  if (mode === 'migrate') {
    const versions = frozenCommand(manifest, ['versions', 'list', '--json'], true);
    const recovery = frozenCommand(manifest, ['d1', 'time-travel', 'info', 'DB', '--json'], true);
    await save(path.join(release, 'before-migration.json'), { recorded_at: new Date().toISOString(), versions: JSON.parse(versions), recovery: JSON.parse(recovery) });
    frozenCommand(manifest, ['d1', 'migrations', 'apply', 'DB', '--remote']);
    return;
  }
  const secrets = JSON.parse(frozenCommand(manifest, ['secret', 'list'], true));
  if (!secrets.some(secret => secret.name === 'TURNSTILE_SECRET')) throw new Error('Falta TURNSTILE_SECRET en el Worker.');
  // A read-only schema probe catches forgotten migrations without reading data.
  frozenCommand(manifest, ['d1', 'execute', 'DB', '--remote', '--command', 'SELECT a.auth_verifier,a.signup_challenge,a.legacy_revision,v.version FROM accounts a,encrypted_vaults v LIMIT 0', '--json'], true);
  await assertPrepared();
  frozenCommand(manifest, ['deploy', '--no-bundle']);
  await save(path.join(release, 'last-deployment.json'), { commit: git(['rev-parse', 'HEAD']).trim(), source: manifest.source, artifact_hash: manifest.artifact_hash, deployed_at: new Date().toISOString() });
  await smoke();
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
