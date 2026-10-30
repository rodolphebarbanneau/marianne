import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { archivesIn, defaultArchiveFolder } from '@marianne/archive'
import { app, powerMonitor, protocol, session as electronSession } from 'electron'
import { SERVICE_SCHEME } from '../shared/community'
import type { DeviceConfig } from '../shared/types'
import { accounts, checkKeystore } from './account'
import { browser } from './browser'
import { catalogue, communityPackages, protectedHosts } from './community'
import { configStore } from './config'
import { content } from './content'
import { wipeScratch } from './engines'
import { emptyDir } from './files'
import { registerIpc } from './ipc'
import { keychain } from './keychain'
import { log } from './log'
import { mcp } from './mcp'
import { ALL_TOOLS } from './tools'
import { openedArchives } from './opened-archives'
import { isServiceFile, openedServiceFiles, serviceFilesIn } from './opened-service-files'
import { ensureDirs, paths } from './paths'
import { sync } from './public/sync'
import { screens, services } from './host'
import { session } from './session'
import { tasks } from './tasks'
import { startBackground } from './tray'
import { updater } from './updater'
import { isMac, isWin, loadShellEnv } from './util'
import { APP_ID, showMain, whenWindow } from './windows'

const SYNC_CHECK_MS = 3600_000

/**
 * Decrypted copies opened in a viewer: nothing in clear outlives a session. At start and at quit the
 * whole temporary folder goes, downloads left half-done included; on lock only the copies, so that a
 * sync under way goes on (paths.ts).
 */
const cleanTmp = () => emptyDir(paths.tmp)

// French dates in forms (jj/mm/aaaa) and French defaults, whatever the system language.
app.commandLine.appendSwitch('lang', 'fr')

// No name looked up as a hint, from any page. A community service's screen reaches nothing else, but
// a <link rel="dns-prefetch"> goes to the system's resolver whatever its session's proxy says, and a
// name can carry a message to the DNS servers of its author (docs/services.md).
app.commandLine.appendSwitch('blink-settings', 'dnsPrefetchingEnabled=false')

// Community services' pages (main/community/runtime/scheme.ts): a scheme of their own, secure and
// standard (an origin per service), whose module scripts load in a frame without an origin of its own.
// `stream`: a <video> reads a file of its declared hosts (~media/) by ranges, and so can seek in it;
// what the scheme serves, and to whom, is still the handler's and the session's to say.
protocol.registerSchemesAsPrivileged([
  { scheme: SERVICE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

// Dev runs keep their own Electron data (and so their own single-instance lock): they never
// collide with an installed Marianne. An explicit --user-data-dir still wins.
if (!app.isPackaged && !app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', join(app.getPath('appData'), 'Marianne Dev'))

if (!app.requestSingleInstanceLock()) {
  // The running one shows its window; say so, rather than leave a silent exit.
  console.error(`Marianne is already running (${app.getPath('userData')}): its window was brought to the front.`)
  app.quit()
} else {
  // A .marianne or .3615 file opened from the system: a second launch hands over its arguments
  // (Windows, Linux), macOS sends an event, possibly before the app is ready. The first launch's come below.
  app.on('second-instance', (_e, argv, cwd) => {
    showMain()
    for (const file of archivesIn(argv, cwd)) openedArchives.open(file)
    for (const file of serviceFilesIn(argv, cwd)) openedServiceFiles.open(file)
  })
  app.on('open-file', (e, file) => {
    e.preventDefault()
    if (isServiceFile(file)) openedServiceFiles.open(file)
    else openedArchives.open(file)
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
    catalogue.start()
    communityPackages.start()
    wipeScratch()
    session.setIdleMinutes(configStore.get().lockAfterMinutes)
    sync.hasKey = (id) => (id === 'legifrance' ? session.unlocked && keychain.hasApi('piste') : true)

    // Our own pages may write to the clipboard and show a video full screen (the player's « plein
    // écran »), nothing else; the built-in browser and community services have sessions of their own.
    const ours = (permission: string) => permission === 'clipboard-sanitized-write' || permission === 'fullscreen'
    electronSession.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(ours(permission)))
    electronSession.defaultSession.setPermissionCheckHandler((_wc, permission) => ours(permission))

    // Locked, nothing personal stays around: the browser's cookies, the opened copies.
    session.on('locked', (reason) => {
      log.info(`Locked (${reason})`)
      void browser.forget()
      emptyDir(paths.opened)
    })
    const lockOnSleep = () => {
      if (configStore.get().lockOnSleep) accounts.lock('system')
    }
    powerMonitor.on('lock-screen', lockOnSleep)
    powerMonitor.on('suspend', lockOnSleep)

    services.start({ catalogue, packages: communityPackages, appToolNames: () => ALL_TOOLS.map((t) => t.name), protectedHosts })
    await mcp.start()
    registerIpc()
    whenWindow((win) => browser.attach(win))
    // Community services' screens: views of their own over the window (each its own session and scheme handler).
    whenWindow((win) => screens.attach(win))
    showMain(!hidden)
    for (const file of archivesIn(process.argv.slice(1), process.cwd())) openedArchives.open(file)
    openedArchives.ready()
    for (const file of serviceFilesIn(process.argv.slice(1), process.cwd())) openedServiceFiles.open(file)
    openedServiceFiles.ready()
    startBackground()
    tasks.start()

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
