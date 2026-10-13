import { fileURLToPath } from 'node:url'
import { defineConfig } from '../../frontend/node_modules/vite/dist/node/index.js'
import react from '../../frontend/node_modules/@vitejs/plugin-react/dist/index.js'
const path = value => fileURLToPath(new URL(value, import.meta.url))
export default defineConfig({
  root: path('./'),
  publicDir: path('../../frontend/public'),
  plugins: [react()],
  resolve: { alias: {
    'lucide-react': path('../../frontend/node_modules/lucide-react'),
    'react-dom': path('../../frontend/node_modules/react-dom'),
    'react': path('../../frontend/node_modules/react'),
  } },
  server: { host: '127.0.0.1', port: 5175, strictPort: true, fs: { allow: [path('../../')] } },
  build: { outDir: 'dist', emptyOutDir: true },
})

