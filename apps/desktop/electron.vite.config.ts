import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import { build, type Plugin } from 'vite'
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

/**
 * The modules a community service's code imports by name, as its runtime pages' import maps
 * resolve them (src/runtime/*.html): each the app's own copy, re-exported by name. The output's
 * file name for each, and the package it is.
 */
const RUNTIME_MODULES: Record<string, string> = {
  react: 'react',
  'react-jsx-runtime': 'react/jsx-runtime',
  'react-dom': 'react-dom',
  'react-dom-client': 'react-dom/client',
  sdk: '@marianne/sdk',
  'sdk-view': '@marianne/sdk/view',
  'sdk-main': '@marianne/sdk/main',
  zod: 'zod'
}
/** React's packages are CommonJS: their names are listed (from the modules themselves) so that each is a static export. */
const COMMONJS = new Set(['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'])
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/** One module per name of RUNTIME_MODULES, re-exporting the app's copy with static named exports. */
function runtimeModules(): Plugin {
  const prefix = '\0runtime-module:'
  return {
    name: 'marianne-runtime-modules',
    resolveId: (id) => (id.startsWith('runtime-module:') ? `\0${id}` : null),
    load(id) {
      if (!id.startsWith(prefix)) return null
      const spec = id.slice(prefix.length)
      if (!COMMONJS.has(spec)) return [`export * from '${spec}'`, ...(spec === 'zod' ? [`export { default } from 'zod'`] : [])].join('\n')
      const names = Object.keys(fromApp(spec) as object).filter((k) => k !== 'default' && IDENTIFIER.test(k))
      return [`import m from '${spec}'`, 'export default m', `export const { ${names.join(', ')} } = m`].join('\n')
    }
  }
}

/**
 * Community services' runtime (src/runtime, served by main/community/runtime/scheme.ts as
 * marianne-service://<code>/~runtime/…): the page of a service's main side (main.html), the page of
 * its screen (view.html, with Marianne's stylesheet and fonts), and the modules of their import
 * maps, built together so that each exists once. Built into out/runtime with the main process.
 */
async function buildRuntime(): Promise<void> {
  const root = resolve('src/runtime')
  await build({
    configFile: false,
    root,
    base: './',
    logLevel: 'warn',
    mode: 'production',
    plugins: [react(), runtimeModules()],
    build: {
      outDir: resolve('out/runtime'),
      emptyOutDir: true,
      modulePreload: { polyfill: false },
      reportCompressedSize: false,
      rollupOptions: {
        input: {
          'view-runtime': resolve(root, 'view.html'),
          'main-runtime': resolve(root, 'main.html'),
          // The worker a service's main side runs in (no import map there: the scheme points its imports at these files).
          'main-worker': resolve(root, 'main-worker.ts'),
          ...Object.fromEntries(Object.entries(RUNTIME_MODULES).map(([name, spec]) => [name, `runtime-module:${spec}`]))
        },
        // The modules of the import maps keep their names and their exports.
        preserveEntrySignatures: 'strict',
        output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' }
      }
    }
  })
}

/** Builds the community runtime once the main process is built (once per run of `electron-vite dev`). */
function communityRuntime(): Plugin {
  let built: Promise<void> | null = null
  return {
    name: 'marianne-community-runtime',
    apply: 'build',
    closeBundle: () => (built ??= buildRuntime())
  }
}

export default defineConfig({
  main: {
    plugins: [communityRuntime()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          // The index worker parses the Service-Public dump off the main thread (see main/public/worker.ts).
          worker: resolve('src/main/public/worker.ts'),
          // The runner starts short commands off the main process (see main/aside.ts).
          runner: resolve('src/main/runner.ts'),
          ...syncEntries
        }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          // A community service's sandbox, and its screen: a bridge each, and nothing else (see main/community/runtime).
          community: resolve('src/preload/community.ts'),
          'community-screen': resolve('src/preload/community-screen.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias: { '@shared': resolve('src/shared') } },
    plugins: [react(), contentPolicy()],
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } }
    }
  }
})
