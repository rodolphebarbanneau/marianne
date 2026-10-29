import { dialog } from 'electron'
import { accounts } from './account'
import { samePath } from './files'
import { session } from './session'
import { broadcast, showMain } from './windows'

/**
 * Archives opened from the system: a .marianne file double-clicked, dropped on the app's icon or
 * named on the command line. The first launch finds them in its arguments, a second launch hands
 * its own to the running app, macOS sends an event. Each one joins the accounts, and the window
 * shows it: the renderer takes it (asking first when another account is open).
 */

let ready = false
const early: string[] = []
let pending: string | null = null

export const openedArchives = {
  /** An archive to show: kept until the app is ready, then added to the accounts and announced to the window. */
  open(file: string): void {
    if (!ready) return void early.push(file)
    showMain()
    // The open one is already on screen (and locked exclusively: its header can't be read again).
    const open = session.maybe
    if (open && samePath(open.path, file)) return
    try {
      pending = accounts.addOther(file).id
      broadcast('openArchive')
    } catch (err) {
      void dialog.showMessageBox({
        type: 'warning',
        message: 'Marianne ne peut pas ouvrir ce fichier.',
        detail: err instanceof Error ? err.message : String(err)
      })
    }
  },

  /** The app is ready: the archives that arrived meanwhile. */
  ready(): void {
    ready = true
    for (const file of early.splice(0)) this.open(file)
  },

  /** The account the window should show next, given once. */
  take(): string | null {
    const id = pending
    pending = null
    return id
  }
}
