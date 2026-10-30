import type { WebContents } from 'electron'

/** While a planned task runs: whether its page may go to an address (the sites of its sheet); null when none runs. */
export type RunGuard = ((url: string) => boolean) | null

/**
 * A planned task's run reaches its own sites only, and that holds before any request leaves: a
 * page that navigates (a link, a form sent by a script or by Enter, a frame) or a server that
 * redirects elsewhere is stopped there, never loaded. The tools check again where the page landed
 * (tools/browser.ts). A conversation isn't held here: the user agrees to each site on a card.
 */
export function holdToRun(wc: Pick<WebContents, 'on'>, guard: () => RunGuard): void {
  const stop = (e: { url: string; preventDefault(): void }) => {
    const allows = guard()
    if (allows && !allows(e.url)) e.preventDefault()
  }
  wc.on('will-frame-navigate', stop)
  wc.on('will-redirect', stop)
}

/** Whether a popup (`window.open`, a link with a target) may open in the view: anything outside a run, its own sites during one. */
export const mayOpen = (guard: RunGuard, url: string) => !guard || guard(url)
