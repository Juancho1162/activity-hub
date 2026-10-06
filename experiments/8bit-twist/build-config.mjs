import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = fileURLToPath(new URL('.', import.meta.url));
export const FRONTEND = fileURLToPath(new URL('../../frontend/', import.meta.url));
export const frontendRequire = createRequire(path.join(FRONTEND, 'package.json'));
const { default: react } = await import(frontendRequire.resolve('@vitejs/plugin-react'));
const { default: tailwindcss } = await import(frontendRequire.resolve('@tailwindcss/vite'));

// No workspace/root config, env files, proxies, dependency symlinks or install.
export function buildConfig() {
  return {
    configFile: false,
    root: ROOT,
    envDir: false,
    envPrefix: [],
    cacheDir: path.join(ROOT, '.cache'),
    publicDir: false,
    plugins: [react(), tailwindcss()],
    server: { fs: { allow: [ROOT, path.join(FRONTEND, 'src'), path.join(FRONTEND, 'tests'), path.join(FRONTEND, 'node_modules')] } },
    resolve: {
      alias: [
        { find: '@', replacement: path.join(FRONTEND, 'src') },
        ...['react', 'react-dom', 'radix-ui', 'lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge', '@testing-library/react', '@testing-library/user-event', 'vitest'].map((name) => ({
          find: name, replacement: path.join(FRONTEND, 'node_modules', name),
        })),
      ],
      dedupe: ['react', 'react-dom'],
    },
    build: {
      outDir: path.join(ROOT, 'dist'),
      emptyOutDir: true,
      assetsInlineLimit: 0,
      sourcemap: false,
    },
  };
}
