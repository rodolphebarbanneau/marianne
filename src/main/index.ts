import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { app, session } from 'electron'
import type { Config } from '../shared/types'
import { configStore } from './config'
import { sync } from './data/sync'
import { dossier } from './dossier/store'
import { registerIpc } from './ipc'
import { log } from './log'
import { mcp } from './mcp'
import { ensureDirs, paths } from './paths'
import { startBackground } from './tray'
import { updater } from './updater'
import { isMac, isWin, loadShellEnv } from './util'
import { vault } from './vault'
import { showMain } from './windows'

const SYNC_CHECK_MS = 3600_000

/** Prompt and MCP files of earlier runs: the MCP ones hold a token that is no longer valid anyway. */
function cleanTmp(): void {
  for (const name of readdirSync(paths.tmp)) {
    try {
      rmSync(join(paths.tmp, name), { recursive: true, force: true })
    } catch {
      // still open in its viewer: removed next time
    }
  }
}

// French dates in forms (jj/mm/aaaa) and French defaults, whatever the system language.
app.commandLine.appendSwitch('lang', 'fr')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showMain())
  // Started at login: stay in the tray until the user opens the window.
  const hidden = process.argv.includes('--hidden')
  // Dev runs (electron.exe) get their own ID so they never share the installed app's taskbar entry.
  if (isWin) app.setAppUserModelId(app.isPackaged ? 'io.github.rodolphebarbanneau.marianne' : 'io.github.rodolphebarbanneau.marianne.dev')

  app.whenReady().then(async () => {
    ensureDirs()
    cleanTmp()
    log.info(`Marianne ${app.getVersion()} starting (${process.platform}-${process.arch}, electron ${process.versions.electron})`)
    await loadShellEnv()
    configStore.load()
    vault.load()
    dossier.load()
    sync.hasKey = (id) => (id === 'legifrance' ? vault.hasApi('piste') : true)

    // Our own pages may only write to the clipboard; the built-in browser has its own session.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'clipboard-sanitized-write'))
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write')

    await mcp.start()
    registerIpc()
    showMain('moi', !hidden)
    startBackground()

    configStore.on('change', (next: Config, prev: Config) => {
      if (next.updates.auto !== prev.updates.auto) updater.applyConfig()
      // A source turned on, or pointed at another URL: index it now.
      for (const id of ['service-public', 'assemblee'] as const) {
        const a = next.sources[id]
        const b = prev.sources[id]
        if (a.enabled && (!b.enabled || a.url !== b.url)) void sync.sync(id)
      }
    })

    updater.init()
    void sync.auto()
    setInterval(() => void sync.auto(), SYNC_CHECK_MS).unref()
  })

  app.on('render-process-gone', (_e, wc, d) => log.error(`Renderer gone (${d.reason}, code ${d.exitCode}): ${wc.getURL()}`))
  app.on('child-process-gone', (_e, d) => log.error(`Process gone: ${d.type}${d.serviceName ? ` ${d.serviceName}` : ''} (${d.reason}, code ${d.exitCode})`))
  app.on('activate', () => showMain())
  app.on('window-all-closed', () => {
    if (!isMac) app.quit()
  })
  app.on('will-quit', () => {
    mcp.stop()
    sync.close()
    // Decrypted copies of documents opened in a viewer.
    cleanTmp()
  })
}
