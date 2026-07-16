import defineConfig from '@templ-project/vitest';

export default defineConfig({
  include: ['**/*.spec.ts', '**/*.test.ts'],
  environment: 'node',
  clearMocks: true,
  restoreMocks: true,
});
