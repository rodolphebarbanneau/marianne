import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      // The index worker parses the open data dumps off the main thread (see main/data/worker.ts).
      rollupOptions: { input: { index: resolve('src/main/index.ts'), worker: resolve('src/main/data/worker.ts') } }
    }
  },
  preload: {},
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias: { '@shared': resolve('src/shared') } },
    plugins: [react()],
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } }
    }
  }
})
