import { defineConfig } from 'vitest/config'

// Unit tests only — kept apart from vite.config.ts so the PWA and model plugins
// never load for a test run. Pure logic plus api.ts against a mocked fetch.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/lib/test-setup.ts'],
  },
})
