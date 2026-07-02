import { defineConfig } from '@playwright/test'

/**
 * E2E tests launch the built Electron app (out/main/main.js).
 * Run `npm run build` before `npm run test:e2e` — the e2e script does both.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // Electron apps can't share a single instance across parallel workers
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
})
