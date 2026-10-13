import { createServer, build } from '../../frontend/node_modules/vite/dist/node/index.js'
import config from './vite.config.mjs'
if (Number(process.versions.node.split('.')[0]) !== 26) throw Error('Use Node 26, as required by Activity Hub.')
const mode = process.argv[2] ?? 'dev'
if (!['dev', 'build'].includes(mode)) throw Error('Usage: node experiments/icon-groups/run.mjs [dev|build]')
if (mode === 'build') {
  await build({ ...config, configFile: false })
} else {
  const server = await createServer({ ...config, configFile: false })
  await server.listen()
  console.log('Grupos por icono: http://127.0.0.1:5175/ — demos locales con datos ficticios.')
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0) })
}

