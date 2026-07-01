import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['electron/core/**/*.ts', 'electron/plugins/**/*.ts', 'src/plugins/**/*.ts'],
      exclude: ['electron/core/types.ts', '**/*.test.ts'],
      thresholds: {
        lines: 30,
        functions: 30,
        branches: 25,
        statements: 30,
      },
    },
  },
})
