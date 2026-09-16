import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'server/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 20000,
    coverage: { provider: 'v8', reporter: ['text', 'json-summary'] },
  },
  resolve: {
    alias: { '@rhmacaw/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname },
  },
});
