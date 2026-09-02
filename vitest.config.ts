import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The integration suite starts an in-memory replica set, so it gets room to boot.
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // One database, one seeded factory: the suites run in sequence, not in parallel.
    fileParallelism: false,
    env: { NODE_ENV: 'test' },
    reporters: ['default']
  }
});
