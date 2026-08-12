import defineConfig from '@templ-project/vitest';

export default defineConfig({
  include: ['**/*.spec.ts', '**/*.test.ts'],
  environment: 'node',
  clearMocks: true,
  restoreMocks: true,
  fileParallelism: true,
  maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 4),
  maxConcurrency: Number(process.env.VITEST_MAX_CONCURRENCY ?? 2),
  coverage: {
    enabled: true,
    provider: 'v8',
    reporter: ['text', 'html', 'lcov'],
  },
});
