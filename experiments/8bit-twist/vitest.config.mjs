import { buildConfig, ROOT } from './build-config.mjs';

export default {
  ...buildConfig(),
  test: {
    root: ROOT,
    environment: 'jsdom',
    setupFiles: ['./test-setup.ts'],
    clearMocks: true,
    // Reuse selected characterization tests, not a copy of the 149-test suite.
    include: ['./*.test.{ts,tsx}', '../../frontend/tests/{App,Theme,activity}.test.tsx'],
  },
};
