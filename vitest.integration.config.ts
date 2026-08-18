import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      // Build-time marker with no runtime behaviour; see the stub.
      'server-only': resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // Real network round-trips; the default 5s is too tight.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // These share one database, so they must not run concurrently.
    fileParallelism: false,
  },
})
