import { app, Menu, nativeImage, Notification, Tray } from 'electron'
import { daysUntil, frDate, type Deadline } from '../shared/profile'
import { session } from './archive/session'
import { configStore } from './config'
import { log } from './log'
import { resource } from './paths'
import { deadlines } from './deadlines'
import { profile } from './profile/store'
import { isMac, isWin } from './util'
import { navigate, setKeepInTray, showMain } from './windows'

/**
 * Background mode: Marianne starts with the system (hidden), stays in the tray, and notifies the
 * open account's deadlines ahead of time. Locked, it knows nothing: no deadline, no reminder.
 */

const REMIND_AT = [30, 7, 1, 0]
const CHECK_EVERY_MS = 3600_000

let tray: Tray | null = null

const background = () => configStore.get().background
const upcoming = (): Deadline[] => (session.unlocked ? deadlines(new Date(), 60).filter((d) => d.status === 'todo' && daysUntil(d.date) >= 0) : [])

function when(days: number): string {
  return days === 0 ? 'aujourd’hui' : days === 1 ? 'demain' : `dans ${days} jours`
}

function refresh(): void {
  if (!tray) return
  const next = upcoming()
  const week = next.filter((d) => daysUntil(d.date) <= 7).length
  tray.setToolTip(!session.unlocked ? 'Marianne · verrouillée' : week ? `Marianne · ${week} échéance${week > 1 ? 's' : ''} dans les 7 jours` : 'Marianne')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Ouvrir Marianne', click: () => showMain() },
      { type: 'separator' },
      ...(session.unlocked
        ? [
            ...(next.length
              ? next.slice(0, 6).map((d) => ({
                  label: `${frDate(d.date).slice(0, 5)} · ${d.title.length > 60 ? `${d.title.slice(0, 57)}…` : d.title}`,
                  click: () => navigate('procedures')
                }))
              : [{ label: 'Aucune échéance dans les 60 jours', enabled: false }]),
            { type: 'separator' as const },
            { label: 'Verrouiller', click: () => session.lock('user') }
          ]
        : [{ label: 'Archive verrouillée', enabled: false }]),
      { type: 'separator' },
      { label: 'Quitter Marianne', click: () => app.quit() }
    ])
  )
}

// On Windows the .ico: the system takes the image drawn for its scaling (20px at 125 %), where it
// would stretch a PNG's 16 or 32px one and blur the mosaic.
function icon(): Electron.NativeImage {
  const img = nativeImage.createFromPath(resource(isMac ? 'tray-mac.png' : isWin ? 'tray.ico' : 'tray.png'))
  if (isMac) img.setTemplateImage(true)
  return img
}

/** Notify each deadline once per threshold (30 days, 7 days, the day before, the day); what was shown stays in the archive. */
function remind(): void {
  if (!background() || !session.unlocked || !Notification.isSupported()) return
  const archive = session.archive
  let shown = archive.get<Record<string, string>>('settings', 'reminders') ?? {}
  const due: Deadline[] = []
  for (const d of upcoming()) {
    const days = daysUntil(d.date)
    const threshold = REMIND_AT.find((t) => days <= t && days > (REMIND_AT[REMIND_AT.indexOf(t) + 1] ?? -1))
    if (threshold === undefined) continue
    const key = `${d.key}@${threshold}`
    if (shown[key]) continue
    due.push(d)
    shown[key] = new Date().toISOString()
  }
  if (!due.length) return
  const notify = (title: string, body: string, silent: boolean) => {
    const n = new Notification({ title, body, silent })
    n.on('click', () => navigate('procedures'))
    n.show()
  }
  // A few at a time; more (first run, a long absence) in a single summary.
  if (due.length <= 3) for (const d of due) notify(`Échéance ${when(daysUntil(d.date))} · ${frDate(d.date)}`, d.title, daysUntil(d.date) > 7)
  else {
    const first = due.sort((a, b) => a.date.localeCompare(b.date))[0]
    notify(`${due.length} échéances à venir`, `La prochaine ${when(daysUntil(first.date))} : ${first.title}`, daysUntil(first.date) > 7)
  }
  // Forget reminders older than a year.
  const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString()
  shown = Object.fromEntries(Object.entries(shown).filter(([, at]) => at > cutoff))
  archive.put('settings', 'reminders', shown)
}

/** Start at login, hidden (packaged builds: a dev build would register the bare Electron binary). */
export function applyLoginItem(): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: background(), args: ['--hidden'] })
}

export function startBackground(): void {
  setKeepInTray(background)
  tray = new Tray(icon())
  tray.on('click', () => showMain())
  // A failure here must not break the profile's other listeners.
  const safe = (fn: () => void, what: string) => () => {
    try {
      fn()
    } catch (err) {
      log.warn(`${what} failed:`, err)
    }
  }
  const safeRefresh = safe(refresh, 'Tray refresh')
  const check = safe(remind, 'Reminders')
  safeRefresh()
  profile.on('change', safeRefresh)
  session.on('unlocked', () => {
    safeRefresh()
    setTimeout(check, 10_000).unref()
  })
  session.on('locked', safeRefresh)
  applyLoginItem()
  setInterval(() => {
    safeRefresh()
    check()
  }, CHECK_EVERY_MS).unref()
}
