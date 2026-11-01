import { fileURLToPath } from 'node:url'
import { defineProject } from 'vitest/config'

export default defineProject({
  // The window imports what it shares with the main process as @shared (electron.vite.config.ts): its tests resolve it the same way.
  resolve: { alias: { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) } },
  test: { name: 'desktop', include: ['test/**/*.test.ts'], environment: 'node' }
})
