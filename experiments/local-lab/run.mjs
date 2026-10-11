import { fileURLToPath } from 'node:url'
import { createServer, build } from '../../frontend/node_modules/vite/dist/node/index.js'
import config from './vite.config.mjs'

if (Number(process.versions.node.split('.')[0]) !== 26) throw Error('Use Node 26, as required by Activity Hub.')
const mode = process.argv[2] ?? 'dev'
if (!['dev', 'build'].includes(mode)) throw Error('Usage: node experiments/local-lab/run.mjs [dev|build]')
if (mode === 'build') {
  await build({ ...config, configFile: false })
} else {
  const servers = []
  const close = async () => { await Promise.all(servers.map(server => server.close())) }
  try {
    const lab = await createServer({ ...config, configFile: false })
    servers.push(lab)
    await lab.listen()
    const baseline = await createServer({
      root: fileURLToPath(new URL('../../frontend/', import.meta.url)),
      configFile: fileURLToPath(new URL('../../frontend/vite.config.ts', import.meta.url)),
      server: { host: '127.0.0.1', port: 5173, strictPort: true },
    })
    servers.push(baseline)
    await baseline.listen()
    console.log('Laboratorio: http://127.0.0.1:5174/\nPortada original: http://127.0.0.1:5173/\nCtrl+C detiene ambos servidores. No se inicia la API ni se accede a cuentas.')
  } catch (error) { await close(); throw error }
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await close(); process.exit(0) })
}
