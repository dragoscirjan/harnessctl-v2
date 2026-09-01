import { fileURLToPath } from 'node:url';
import defineConfig from '@templ-project/vitest';

export default defineConfig({
  include: ['**/*.spec.ts', '**/*.test.ts'],
  setupFiles: [fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))],
  environment: 'node',
  clearMocks: true,
  restoreMocks: true,
  fileParallelism: false,
  maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 1),
  maxConcurrency: Number(process.env.VITEST_MAX_CONCURRENCY ?? 2),
  testTimeout: 15_000,
  coverage: {
    enabled: process.env.VITEST_COVERAGE !== 'false',
    provider: 'v8',
    reporter: ['text', 'html', 'lcov'],
  },
});
