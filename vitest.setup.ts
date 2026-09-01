import { afterEach } from 'vitest';

afterEach(
  () =>
    new Promise<void>((resolve) => {
      // Long synchronous filesystem suites can starve Vitest worker RPC responses on Windows.
      setImmediate(resolve);
    }),
);
