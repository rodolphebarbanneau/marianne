import { readFileSync, writeFileSync } from 'node:fs'
import { app, Menu, nativeImage, Notification, Tray } from 'electron'
import { daysUntil, frDate, type Deadline } from '../shared/dossier'
import { configStore } from './config'
import { dossier } from './dossier/store'
import { log } from './log'
import { paths, resource } from './paths'
import { isMac } from './util'
import { setKeepInTray, showMain } from './windows'

/**
 * Background mode: Marianne starts with the system (hidden), stays in the tray, and notifies the
 * deadlines of the personal file ahead of time.
 */

const REMIND_AT = [30, 7, 1, 0]
const CHECK_EVERY_MS = 3600_000

let tray: Tray | null = null

const background = () => configStore.get().background
const upcoming = (): Deadline[] =>
  dossier.state === 'ok' ? dossier.deadlines(new Date(), 60).filter((d) => d.status === 'a_faire' && daysUntil(d.date) >= 0) : []

function when(days: number): string {
  return days === 0 ? 'aujourd’hui' : days === 1 ? 'demain' : `dans ${days} jours`
}

function refresh(): void {
  if (!tray) return
  const next = upcoming()
  const week = next.filter((d) => daysUntil(d.date) <= 7).length
  tray.setToolTip(week ? `Marianne · ${week} échéance${week > 1 ? 's' : ''} dans les 7 jours` : 'Marianne')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Ouvrir Marianne', click: () => showMain('moi') },
      { type: 'separator' },
      ...(next.length
        ? next.slice(0, 6).map((d) => ({
            label: `${frDate(d.date).slice(0, 5)} · ${d.title.length > 60 ? `${d.title.slice(0, 57)}…` : d.title}`,
            click: () => showMain('agenda')
          }))
        : [{ label: 'Aucune échéance dans les 60 jours', enabled: false }]),
      { label: 'Agenda…', click: () => showMain('agenda') },
      { type: 'separator' },
      { label: 'Quitter Marianne', click: () => app.quit() }
    ])
  )
}

function icon(): Electron.NativeImage {
  const img = nativeImage.createFromPath(resource(isMac ? 'tray-mac.png' : 'tray.png'))
  if (isMac) img.setTemplateImage(true)
  return img
}

/** Notify each deadline once per threshold (30 days, 7 days, the day before, the day). */
function remind(): void {
  if (!background().reminders || !Notification.isSupported()) return
  let shown: Record<string, string> = {}
  try {
    shown = JSON.parse(readFileSync(paths.reminders, 'utf8')) as Record<string, string>
  } catch {
    // first run
  }
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
    n.on('click', () => showMain('agenda'))
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
  writeFileSync(paths.reminders, JSON.stringify(shown))
}

/** Start at login, hidden (packaged builds: a dev build would register the bare Electron binary). */
export function applyLoginItem(): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: background().launchAtLogin, args: ['--hidden'] })
}

export function startBackground(): void {
  setKeepInTray(() => background().launchAtLogin || background().reminders)
  tray = new Tray(icon())
  tray.on('click', () => showMain())
  // A failure here must not break the file's other listeners.
  const safeRefresh = () => {
    try {
      refresh()
    } catch (err) {
      log.warn('Tray refresh failed:', err)
    }
  }
  safeRefresh()
  dossier.on('change', safeRefresh)
  applyLoginItem()
  const check = () => {
    try {
      remind()
    } catch (err) {
      log.warn('Reminders failed:', err)
    }
  }
  setTimeout(check, 10_000).unref()
  setInterval(() => {
    safeRefresh()
    check()
  }, CHECK_EVERY_MS).unref()
}
