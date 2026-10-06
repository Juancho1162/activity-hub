// Build using installed frontend tools, then serve ONLY generated lab assets.
// No Vite dev server/proxy, env files, API, accounts or database.
import { createServer } from 'node:http';
import { copyFile, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig, FRONTEND, ROOT, frontendRequire } from './build-config.mjs';

export async function buildLab() {
  const { build } = await import(frontendRequire.resolve('vite'));
  await build(buildConfig());
  const destination = path.join(ROOT, 'dist/fonts');
  await mkdir(destination, { recursive: true });
  for (const file of ['press-start-2p.ttf', 'OFL.txt']) {
    await copyFile(path.join(FRONTEND, 'public/fonts', file), path.join(destination, file));
  }
}

export async function createLabServer() {
  // Enumerate generated files once. Requests never turn a URL into a filesystem
  // path, and symlinks/non-files are ignored. No SPA fallback or directory index.
  const resources = new Map();
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };
  async function collect(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await collect(path.join(directory, entry.name), relative);
      else if (entry.isFile()) {
        const type = types[path.extname(entry.name)];
        if (type) resources.set(relative, { type, content: await readFile(path.join(directory, entry.name)) });
      }
    }
  }
  await collect(path.join(ROOT, 'dist'));
  resources.set('/', resources.get('/index.html'));
  const policy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";
  return createServer((request, response) => {
    let url;
    try { url = new URL(request.url, 'http://127.0.0.1'); } catch { response.writeHead(400).end(); return; }
    const resource = resources.get(url.pathname);
    const headers = { 'Cache-Control': 'no-store', 'Content-Security-Policy': policy, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    if (!['GET', 'HEAD'].includes(request.method) || !resource) { response.writeHead(404, headers).end(); return; }
    response.writeHead(200, { ...headers, 'Content-Type': resource.type, 'Content-Length': resource.content.length });
    response.end(request.method === 'HEAD' ? undefined : resource.content);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arguments_ = process.argv.slice(2);
  const buildOnly = arguments_.length === 1 && arguments_[0] === '--build-only';
  const port = arguments_.length === 2 && arguments_[0] === '--port' ? Number(arguments_[1]) : 5182;
  if ((!buildOnly && arguments_.length && arguments_[0] !== '--port') || (!buildOnly && arguments_.length !== 0 && arguments_.length !== 2) || !Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('Uso: node experiments/8bit-twist/lab.mjs [--build-only | --port 5182]'); process.exitCode = 1;
  } else {
    try {
      await buildLab();
      if (!buildOnly) {
        const server = await createLabServer();
        server.on('error', () => { console.error('No se pudo abrir el puerto del laboratorio. No se han detenido ni reutilizado otros procesos.'); process.exitCode = 1; });
        server.listen(port, '127.0.0.1', () => console.log(`Laboratorio ficticio: http://127.0.0.1:${port} · Ctrl+C para detener solo este servidor.`));
        for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.closeAllConnections(); server.close(); });
      }
    } catch (error) {
      console.error(`No se pudo preparar el laboratorio: ${error instanceof Error ? error.message : 'error local'}`); process.exitCode = 1;
    }
  }
}
