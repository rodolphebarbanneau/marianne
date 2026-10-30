import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dialog } from 'electron'
import type { ServiceFileReview } from '../shared/catalogue'
import { communityPackages, SERVICE_FILE_EXT } from './community'
import { session } from './session'
import { broadcast, mainWindow, showMain } from './windows'

/**
 * Service files opened from the system: a .3615 file double-clicked, dropped on the app's icon or
 * named on the command line, as archives are (opened-archives.ts). Each one waits until an account
 * is unlocked and the window is loaded; then it is read and checked (nothing of it runs), and its
 * review waits for the window to take it (`take`): the window is told ('serviceFile') and takes
 * what waits when its screens come, so none is lost while they are still on their way. The window
 * asks the user before adding it.
 */

export const isServiceFile = (file: string) => file.toLowerCase().endsWith(SERVICE_FILE_EXT)

/** The .3615 files among a launch's arguments (as archivesIn finds the archives). */
export function serviceFilesIn(argv: readonly string[], cwd: string): string[] {
  return argv.filter((arg) => !arg.startsWith('-') && isServiceFile(arg)).map((arg) => (arg.startsWith('file://') ? fileURLToPath(arg) : resolve(cwd, arg)))
}

let ready = false
const waiting: string[] = []
/** The reviews read, until the window takes them; dropped on lock (their tickets are). */
const reviewed: ServiceFileReview[] = []

/** Each file waiting, read and its review sent, once an account is open and the window loaded. */
function deliver(): void {
  if (!ready || !session.unlocked || !waiting.length) return
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  if (win.webContents.isLoading()) return void win.webContents.once('did-finish-load', deliver)
  for (const file of waiting.splice(0)) {
    communityPackages.review(file).then(
      (review) => {
        reviewed.push(review)
        broadcast('serviceFile')
      },
      (err) =>
        void dialog.showMessageBox(win, {
          type: 'warning',
          message: 'Marianne ne peut pas lire ce fichier.',
          detail: err instanceof Error ? err.message : String(err)
        })
    )
  }
}

export const openedServiceFiles = {
  /** A .3615 file to review: kept until an account is unlocked and the window is ready. */
  open(file: string): void {
    if (!waiting.includes(file)) waiting.push(file)
    if (!ready) return
    showMain()
    deliver()
  },

  /** The app is ready: the files that arrived meanwhile, as soon as an account is open. */
  ready(): void {
    if (ready) return
    ready = true
    session.on('unlocked', deliver)
    session.on('locked', () => void reviewed.splice(0))
    deliver()
  },

  /** The reviews waiting for the window, taken: each is given once. */
  take(): ServiceFileReview[] {
    return reviewed.splice(0)
  }
}
