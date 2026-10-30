import type { MarianneApi } from '@shared/api'
import type { View } from '../app/routes'

/** What the reveals need of the window: the screen on now, and what to do. */
export interface RevealScreen {
  view(): View
  /** Open the browser panel, on the folder on screen. */
  open(): void
  /** Marianne asked for a folder that is not on screen: its panel waits for the user there. */
  away(folderId: string): void
}

/**
 * Marianne asks the window to show a folder's browser: hand_over, for the user to sign in with
 * FranceConnect or type a code; open_site with show, or with « afficher le navigateur : toujours ».
 * The main process sends the folder whose page it is (onBrowserReveal).
 *
 * On that folder's screen, its panel opens at once. On any other screen the window stays where it
 * is: the panel opens the next time the user goes to the folder, and `away` tells them meanwhile.
 * Marianne asks for the user's attention, she doesn't take the screen from them: switching folders
 * under them would drop what they were reading or typing elsewhere, and with several folders at
 * work their asks would fight over the window. A hand-over waits ten minutes for them to come.
 */
export class BrowserReveals {
  /** The folder whose panel opens when the user next goes to it; '' when none waits. */
  private waiting = ''

  constructor(private readonly screen: RevealScreen) {}

  /** Hear the main process: Marianne's asks, and whose page the browser holds. */
  listen(api: Pick<MarianneApi, 'onBrowserReveal' | 'onBrowserState'>): () => void {
    const offReveal = api.onBrowserReveal((folderId) => this.reveal(folderId))
    const offState = api.onBrowserState((state) => this.browsing(state.folderId))
    return () => {
      offReveal()
      offState()
    }
  }

  reveal(folderId: string): void {
    if (!folderId) return
    const view = this.screen.view()
    if (view.kind === 'folder' && view.id === folderId) {
      this.waiting = ''
      return this.screen.open()
    }
    this.waiting = folderId
    this.screen.away(folderId)
  }

  /** The screen changed: the folder a reveal waits for, now on screen, opens its panel. */
  visit(view: View): void {
    if (!this.waiting || view.kind !== 'folder' || view.id !== this.waiting) return
    this.waiting = ''
    this.screen.open()
  }

  /** The browser holds `folderId`'s page now: a reveal waiting for another folder has nothing left to show. */
  private browsing(folderId: string): void {
    if (folderId !== this.waiting) this.waiting = ''
  }
}
