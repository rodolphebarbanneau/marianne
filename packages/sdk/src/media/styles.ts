/// <reference types="vite/client" />
import css from './media.css?inline'

/**
 * The player's stylesheet, put in the page by the first player drawn. Imported as text rather
 * than as a stylesheet: a service's view, Marianne's window and a community service's screen (where
 * this module is one of the runtime's own, not bundled with the service) all get it the same way.
 * It leans on Marianne's stylesheet (its variables, .menu, .btn, .chip), which every screen has.
 */
export function injectMediaStyles(doc: Document = document): void {
  const id = 'marianne-media-styles'
  const found = doc.getElementById(id)
  if (found) {
    // A new version of the module (development): its rules replace the old ones.
    if (found.textContent !== css) found.textContent = css
    return
  }
  const style = doc.createElement('style')
  style.id = id
  style.textContent = css
  // First, so that a service's own rules (its view.css) come after and win.
  doc.head.prepend(style)
}
