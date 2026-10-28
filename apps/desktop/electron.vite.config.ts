import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** The built-in services: the app's @marianne/service-* packages (see docs/services.md). */
const fromApp = createRequire(resolve('package.json'))
const app = JSON.parse(readFileSync('package.json', 'utf8')) as { devDependencies: Record<string, string> }
const services = Object.keys(app.devDependencies)
  .filter((name) => name.startsWith('@marianne/service-'))
  .map((name) => {
    const file = fromApp.resolve(`${name}/package.json`)
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as {
      exports: Record<string, string>
      marianne: { code: string; hosts: string[] }
    }
    return { code: pkg.marianne.code, dir: dirname(file), sync: pkg.exports['./sync'], hosts: pkg.marianne.hosts }
  })

/** Each service's sync job runs in a process of its own: one entry per job, out/main/sync-<code>.js. */
const syncEntries = Object.fromEntries(services.filter((s) => s.sync).map((s) => [`sync-${s.code}`, resolve(s.dir, s.sync!)]))

/** The window may reach the hosts services declare (a video stream…), and in development its dev server: nothing else. */
function contentPolicy(): Plugin {
  const hosts = [...new Set(services.flatMap((s) => s.hosts))].map((h) => `https://${h}`).join(' ')
  return {
    name: 'marianne-content-policy',
    transformIndexHtml: (html, ctx) => html.replaceAll('%SERVICE_HOSTS%', hosts).replaceAll('%DEV_SERVER%', ctx.server ? 'ws://localhost:*' : '')
  }
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          // The index worker parses the Service-Public dump off the main thread (see main/public/worker.ts).
          worker: resolve('src/main/public/worker.ts'),
          ...syncEntries
        }
      }
    }
  },
  preload: {},
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias: { '@shared': resolve('src/shared') } },
    plugins: [react(), contentPolicy()],
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } }
    }
  }
})
