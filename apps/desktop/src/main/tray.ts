import { daysUntil, frDate, type Deadline } from '@marianne/profile'
import type { PlannedTask, TaskRun } from '../shared/types'
import { app, Menu, nativeImage, Notification, Tray } from 'electron'
import { configStore } from './config'
import { log } from './log'
import { resource } from './paths'
import { deadlines } from './deadlines'
import { profile } from './profile/store'
import { session } from './session'
import { tasks } from './tasks'
import { isMac, isWin } from './util'
import { navigate, setKeepInTray, showMain } from './windows'

/**
 * Background mode: Marianne starts with the system (hidden), stays in the tray, and notifies the
 * open account's deadlines ahead of time. Locked, it knows nothing: no deadline, no reminder.
 */

const REMIND_AT = [30, 7, 1, 0]
/** What a run tells: its title alone, a notification stays on the screen of whoever is there. */
const RUN_TITLES = {
  nothing: 'Rien à signaler',
  found: 'Une tâche a trouvé quelque chose',
  waiting: 'Une tâche attend votre réponse',
  failed: 'Une tâche n’a pas abouti',
  done: 'Rappel'
}
const CHECK_EVERY_MS = 3600_000

let tray: Tray | null = null

const background = () => configStore.get().background
const upcoming = (): Deadline[] => (session.unlocked ? deadlines(new Date(), 60).filter((d) => d.status === 'todo' && daysUntil(d.date) >= 0) : [])

function when(days: number): string {
  return days === 0 ? 'aujourd’hui' : days === 1 ? 'demain' : `dans ${days} jours`
}

/**
 * What deadlines' notifications say: when, never what. A notification stays on the screen of whoever
 * is there, and a deadline's title may carry an identifier (a vehicle's plate, when it has no model).
 * A few at a time; more (a first run, a long absence) in a single summary.
 */
export function deadlineNotices(due: Deadline[], now = new Date()): Array<{ title: string; body: string; silent: boolean }> {
  const days = (d: Deadline) => daysUntil(d.date, now)
  if (due.length <= 3)
    return due.map((d) => ({ title: `Échéance ${when(days(d))} · ${frDate(d.date)}`, body: 'Ouvrez Marianne pour la voir.', silent: days(d) > 7 }))
  const first = [...due].sort((a, b) => a.date.localeCompare(b.date))[0]
  return [{ title: `${due.length} échéances à venir`, body: `La prochaine ${when(days(first))} : ouvrez Marianne pour les voir.`, silent: days(first) > 7 }]
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
  for (const notice of deadlineNotices(due)) {
    const n = new Notification(notice)
    n.on('click', () => navigate('procedures'))
    n.show()
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
  tasks.on('run', (task: PlannedTask, run: TaskRun) => {
    if (!Notification.isSupported()) return
    const n = new Notification({ title: RUN_TITLES[run.outcome], body: task.title, silent: run.outcome === 'nothing' })
    n.on('click', () => navigate(`folder:${task.folderId}`))
    n.show()
  })
  applyLoginItem()
  setInterval(() => {
    safeRefresh()
    check()
  }, CHECK_EVERY_MS).unref()
}
