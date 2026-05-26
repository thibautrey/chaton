import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Default include covers standard *.test.ts / *.spec.ts naming.
    // Also explicitly include electron/ipc/workspace-handlers-*.test.ts files
    // which have a non-standard but intentional naming pattern.
    include: [
      '**/*.test.{ts,tsx,js,jsx}',
      '**/*.spec.{ts,tsx,js,jsx}',
      '**/workspace-handlers-*.test.{ts,tsx}',
    ],
  },
})
