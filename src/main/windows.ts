import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { Route } from '../shared/types'
import { resource } from './paths'
import { isMac, isWin } from './util'

type View = 'main' | 'browser'

let isQuitting = false
app.on('before-quit', () => (isQuitting = true))

export const quitting = () => isQuitting

/** Let windows close for real (they normally hide): needed before the updater quits the app. */
export function allowQuit(): void {
  isQuitting = true
}

export function load(win: BrowserWindow, view: View): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}#${view}`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: view })
}

export function webPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    spellcheck: true
  }
}

// Videotex palette: deep blue-black screen, white phosphor, yellow accent.
const BACKGROUND = '#05071a'
const FOREGROUND = '#e8ecff'
const ACCENT = '#ffd23f'
export const TITLE_BAR_HEIGHT = 34

/** Windows picks the right size from the multi-resolution .ico; elsewhere a PNG is used. */
export const appIcon = () => resource(isWin ? 'icon.ico' : 'icon.png')

/**
 * Native window chrome: the OS draws the frame, corners, shadow, resize edges and caption
 * buttons; our title row is laid out around them with the Window Controls Overlay CSS env()
 * variables. On Windows the DWM border uses our accent while the window is active.
 */
export function nativeChrome(): Partial<Electron.BrowserWindowConstructorOptions> {
  return {
    backgroundColor: BACKGROUND,
    titleBarStyle: 'hidden',
    titleBarOverlay: isMac ? true : { color: BACKGROUND, symbolColor: FOREGROUND, height: TITLE_BAR_HEIGHT },
    ...(isMac ? { trafficLightPosition: { x: 12, y: (TITLE_BAR_HEIGHT - 14) / 2 } } : {}),
    ...(isWin ? { accentColor: false } : {})
  }
}

/** Windows convention: only the active window's border carries the accent color. */
function followActivation(win: BrowserWindow): void {
  if (!isWin) return
  win.on('focus', () => win.setAccentColor(ACCENT))
  win.on('blur', () => win.setAccentColor(false))
}

/** Main window: the personal file, the domains, the conversation panel, settings. */
export let mainWindow: BrowserWindow | null = null

/** With the tray, closing the window keeps Marianne running (reminders); set by main/tray. */
let keepInTray = () => false
export function setKeepInTray(fn: () => boolean): void {
  keepInTray = fn
}

/** Show the main window, on `route` when given ("domaine/impots#compte:impots"…). */
export function showMain(route?: Route, focus = true): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1080,
      minHeight: 640,
      show: false,
      title: 'Marianne',
      icon: appIcon(),
      ...nativeChrome(),
      webPreferences: webPreferences()
    })
    mainWindow.removeMenu()
    followActivation(mainWindow)
    if (focus) mainWindow.once('ready-to-show', () => mainWindow?.show())
    mainWindow.on('close', (e) => {
      if (quitting() || !keepInTray()) return
      e.preventDefault()
      mainWindow?.hide()
    })
    mainWindow.on('closed', () => {
      mainWindow = null
      if (!isMac && !keepInTray()) app.quit()
    })
    // Links in the conversation open in the built-in browser (see ipc); never navigate this window.
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())
    load(mainWindow, 'main')
    if (route) mainWindow.webContents.once('did-finish-load', () => mainWindow?.webContents.send('marianne:navigate', route))
    return
  }
  if (route) mainWindow.webContents.send('marianne:navigate', route)
  if (!focus) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** The agent shows a screen: the window comes up, but focus stays where the user is. */
export function navigate(route: Route): void {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) mainWindow.webContents.send('marianne:navigate', route)
  else showMain(route)
}

/** Send an event to every renderer. */
export function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(`marianne:${channel}`, payload)
  }
}
