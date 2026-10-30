import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { resource } from './paths'
import { isMac, isWin } from './util'

let isQuitting = false
app.on('before-quit', () => (isQuitting = true))

export const quitting = () => isQuitting

/** Let windows close for real (they normally hide): needed before the updater quits the app. */
export function allowQuit(): void {
  isQuitting = true
}

// Videotex palette: deep blue-black screen, white phosphor.
const BACKGROUND = '#05071a'
const FOREGROUND = '#e8ecff'
const ACCENT = '#ffd23f'
/** Height of the title bar drawn by the screens; the OS draws its window buttons over its right end. */
export const TITLE_BAR_HEIGHT = 40

/** The dialogs' overlay (.overlay in styles.css): its color, and how much of the page it covers. */
const OVERLAY = { rgb: [3, 4, 15], alpha: 0.72 }
const dimmed = (hex: string) =>
  `#${OVERLAY.rgb
    .map((c, i) =>
      Math.round(c * OVERLAY.alpha + parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) * (1 - OVERLAY.alpha))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`

/** Windows picks the right size from the multi-resolution .ico; elsewhere a PNG is used. */
export const appIcon = () => resource(isWin ? 'icon.ico' : 'icon.png')

/** Windows' identity for the app (taskbar grouping, notifications); dev runs get their own, never mixed with the installed app. */
export const APP_ID = app.isPackaged ? 'io.github.rodolphebarbanneau.marianne' : 'io.github.rodolphebarbanneau.marianne.dev'

/** The main window: the whole application, the built-in browser docked inside it. */
export let mainWindow: BrowserWindow | null = null

/** With the tray, closing the window keeps Marianne running (reminders); set by main/tray. */
let keepInTray = () => false
export function setKeepInTray(fn: () => boolean): void {
  keepInTray = fn
}

/** Created after the window exists (the browser panel attaches to it). */
const onCreated: Array<(win: BrowserWindow) => void> = []
export function whenWindow(fn: (win: BrowserWindow) => void): void {
  onCreated.push(fn)
  if (mainWindow && !mainWindow.isDestroyed()) fn(mainWindow)
}

function load(win: BrowserWindow): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

export function showMain(focus = true): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!focus) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return
  }
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 620,
    show: false,
    title: 'Marianne',
    icon: appIcon(),
    backgroundColor: BACKGROUND,
    // Our title bar, with the system's own window buttons over its right end (traffic lights on the left on macOS).
    titleBarStyle: 'hidden',
    titleBarOverlay: isMac ? true : { color: BACKGROUND, symbolColor: FOREGROUND, height: TITLE_BAR_HEIGHT },
    ...(isMac ? { trafficLightPosition: { x: 14, y: (TITLE_BAR_HEIGHT - 14) / 2 } } : {}),
    ...(isWin ? { accentColor: false } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })
  mainWindow = win
  win.removeMenu()
  if (isWin) {
    win.on('focus', () => win.setAccentColor(ACCENT))
    win.on('blur', () => win.setAccentColor(false))
  }
  if (focus) win.once('ready-to-show', () => win.show())
  win.on('close', (e) => {
    if (quitting() || !keepInTray()) return
    e.preventDefault()
    win.hide()
  })
  win.on('closed', () => {
    mainWindow = null
    if (!isMac && !keepInTray()) app.quit()
  })
  win.on('enter-full-screen', () => broadcast('fullscreen', true))
  win.on('leave-full-screen', () => broadcast('fullscreen', false))
  // Links open in the built-in browser or the system's (see ipc): this window never navigates.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  load(win)
  for (const fn of onCreated) fn(win)
}

/**
 * A dialog over the screens dims the title bar, and the system's window buttons with it: Windows
 * and Linux draw them in our colors, so they take the overlay's; macOS keeps its own.
 */
export function dimTitleBar(dim: boolean): void {
  if (isMac || !mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setTitleBarOverlay({ color: dim ? dimmed(BACKGROUND) : BACKGROUND, symbolColor: dim ? dimmed(FOREGROUND) : FOREGROUND })
}

/** Send an event to the screens. */
export function broadcast(channel: string, payload?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(`marianne:${channel}`, payload)
}

/** Ask the screens to show something: "folder:<id>", "settings:identity", "service:infos"… */
export function navigate(route: string): void {
  showMain(false)
  broadcast('navigate', route)
}
