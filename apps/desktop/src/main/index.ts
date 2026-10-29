import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { archivesIn, defaultArchiveFolder } from '@marianne/archive'
import { app, powerMonitor, session as electronSession } from 'electron'
import type { DeviceConfig } from '../shared/types'
import { accounts, checkKeystore } from './account'
import { browser } from './browser'
import { configStore } from './config'
import { content } from './content'
import { wipeScratch } from './engines'
import { registerIpc } from './ipc'
import { keychain } from './keychain'
import { log } from './log'
import { mcp } from './mcp'
import { openedArchives } from './opened-archives'
import { ensureDirs, paths } from './paths'
import { sync } from './public/sync'
import { services } from './host'
import { session } from './session'
import { startBackground } from './tray'
import { updater } from './updater'
import { isMac, isWin, loadShellEnv } from './util'
import { APP_ID, showMain, whenWindow } from './windows'

const SYNC_CHECK_MS = 3600_000

/** Decrypted copies opened in a viewer, MCP files of earlier runs: nothing in clear outlives a session. */
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

// Dev runs keep their own Electron data (and so their own single-instance lock): they never
// collide with an installed Marianne. An explicit --user-data-dir still wins.
if (!app.isPackaged && !app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', join(app.getPath('appData'), 'Marianne Dev'))

if (!app.requestSingleInstanceLock()) {
  // The running one shows its window; say so, rather than leave a silent exit.
  console.error(`Marianne is already running (${app.getPath('userData')}): its window was brought to the front.`)
  app.quit()
} else {
  // A .marianne file opened from the system: a second launch hands over its arguments (Windows,
  // Linux), macOS sends an event, possibly before the app is ready. The first launch's come below.
  app.on('second-instance', (_e, argv, cwd) => {
    showMain()
    for (const file of archivesIn(argv, cwd)) openedArchives.open(file)
  })
  app.on('open-file', (e, file) => {
    e.preventDefault()
    openedArchives.open(file)
  })
  // Started at login: stay in the tray until the user opens the window.
  const hidden = process.argv.includes('--hidden')
  if (isWin) app.setAppUserModelId(APP_ID)

  app.whenReady().then(async () => {
    ensureDirs()
    cleanTmp()
    log.info(`Marianne ${app.getVersion()} starting (${process.platform}-${process.arch}, electron ${process.versions.electron})`)
    await loadShellEnv()
    configStore.load()
    // Where archives go until the user picks another place (Documents, unless a cloud syncs it).
    if (!configStore.get().archiveFolder) {
      const places = { platform: process.platform, home: app.getPath('home'), documents: app.getPath('documents'), env: process.env, exists: existsSync }
      configStore.update({ archiveFolder: defaultArchiveFolder(places) })
    }
    await checkKeystore()
    content.start()
    wipeScratch()
    session.setIdleMinutes(configStore.get().lockAfterMinutes)
    sync.hasKey = (id) => (id === 'legifrance' ? session.unlocked && keychain.hasApi('piste') : true)

    // Our own pages may only write to the clipboard; the built-in browser has its own session.
    electronSession.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'clipboard-sanitized-write'))
    electronSession.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write')

    // Locked, nothing personal stays around: the browser's cookies, the opened copies.
    session.on('locked', (reason) => {
      log.info(`Locked (${reason})`)
      void browser.forget()
      cleanTmp()
    })
    const lockOnSleep = () => {
      if (configStore.get().lockOnSleep) accounts.lock('system')
    }
    powerMonitor.on('lock-screen', lockOnSleep)
    powerMonitor.on('suspend', lockOnSleep)

    services.start()
    await mcp.start()
    registerIpc()
    whenWindow((win) => browser.attach(win))
    showMain(!hidden)
    for (const file of archivesIn(process.argv.slice(1), process.cwd())) openedArchives.open(file)
    openedArchives.ready()
    startBackground()

    configStore.on('change', (next: DeviceConfig, prev: DeviceConfig) => {
      // Service-Public turned on, or pointed at another URL: index it now.
      const a = next.sources['service-public']
      const b = prev.sources['service-public']
      if (a.enabled && (!b.enabled || a.url !== b.url)) void sync.sync('service-public')
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
  app.on('before-quit', () => session.lock('quit'))
  app.on('will-quit', () => {
    mcp.stop()
    sync.close()
    cleanTmp()
  })
}
