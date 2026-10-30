import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { BrowserState, KeychainEntry } from '@shared/types'
import { useApp } from '../app/context'
import { CloseIcon } from '../components/icons'
import { addressUrl } from '../lib/address'
import { api, errorText, useLive } from '../lib/api'
import { plainKey } from '../lib/keys'
import { overlay } from '../lib/overlay'

const rect = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
}

const siteOf = (url: string) => {
  try {
    const host = new URL(url).hostname
    return host
      .split('.')
      .slice(host.endsWith('.gouv.fr') ? -3 : -2)
      .join('.')
  } catch {
    return ''
  }
}

/**
 * The built-in browser, in the folder's right column. The page itself is a native view the main
 * process draws over the viewport box; this is its chrome: address, who drives, take control.
 */
export function BrowserPanel({ folderId }: { folderId: string }) {
  const app = useApp()
  const state = useLive<BrowserState>(api.browserState, api.onBrowserState)
  const [address, setAddress] = useState('')
  const [logins, setLogins] = useState<KeychainEntry[]>([])
  const [notice, setNotice] = useState('')
  const viewport = useRef<HTMLDivElement>(null)
  // Dialogs and menus draw over the page: the native view hides while one is open.
  const dialog = useSyncExternalStore(overlay.subscribe, overlay.get)
  const covered = !!app.palette || !!app.settingsPage || dialog
  const hidden = useRef(covered)
  hidden.current = covered

  // Tell the main process where to draw the page; nothing when the panel closes or is covered.
  useLayoutEffect(() => {
    const el = viewport.current
    if (!el) return
    const report = () => !hidden.current && api.browserBounds(rect(el))
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
      api.browserBounds(null)
    }
  }, [])

  useEffect(() => {
    if (covered) api.browserBounds(null)
    else if (viewport.current) api.browserBounds(rect(viewport.current))
  }, [covered])

  useEffect(() => setAddress(state?.url ?? ''), [state?.url])
  useEffect(() => {
    const site = siteOf(state?.url ?? '')
    if (!site) return setLogins([])
    void api
      .listKeychain()
      .then((all) => setLogins(all.filter((e) => e.kind === 'login' && siteOf(e.url.startsWith('http') ? e.url : `https://${e.url}`) === site)))
  }, [state?.url])

  const human = state?.controller === 'human'
  const foreign = state && state.folderId && state.folderId !== folderId
  const flash = (text: string) => {
    setNotice(text)
    setTimeout(() => setNotice(''), 3000)
  }

  return (
    <aside className="browser">
      <div className="bhead">
        <button className="icon-btn" disabled={!state?.canGoBack} onClick={() => api.browserBack()} title="page précédente">
          ‹
        </button>
        <button className="icon-btn" disabled={!state?.canGoForward} onClick={() => api.browserForward()} title="page suivante">
          ›
        </button>
        <input
          value={address}
          spellCheck={false}
          placeholder="adresse ou recherche sur service-public.fr"
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            // Entrée alone: ctrl+entrée stays the app's (a new folder).
            if (!plainKey(e, 'Enter')) return
            const url = addressUrl(address)
            if (!url) return
            // No page of this folder's yet: one opens for it. On its page, the main process reads the address the same way (browser.navigate).
            if (!state?.url || state.folderId !== folderId) api.browserOpen(url, folderId)
            else api.browserNavigate(address)
          }}
        />
        <span className={`pilot${human ? ' human' : ''}`}>{human ? 'vous pilotez' : 'Marianne pilote'}</span>
        <button className="icon-btn" title="fermer le navigateur" onClick={() => app.setBrowserOpen(false)}>
          <CloseIcon />
        </button>
      </div>
      {state?.waiting && <div className="waiting">← Marianne attend votre accord : {state.waiting}</div>}
      {foreign && <div className="waiting">Cette page appartient à un autre dossier.</div>}
      <div className="viewport" ref={viewport}>
        {!state?.url && (
          <p className="dim small" style={{ padding: 14 }}>
            Aucune page ouverte. Marianne ouvre ici les sites dont elle a besoin. Vous pouvez aussi taper une adresse.
          </p>
        )}
      </div>
      <div className="bfoot">
        <button className={`btn small${human ? '' : ' primary'}`} onClick={() => api.browserControl(human ? 'agent' : 'human')}>
          {human ? 'rendre la main' : 'prendre la main'}
        </button>
        {logins.map((l) => (
          <button
            key={l.id}
            className="btn small"
            onClick={() =>
              void api
                .browserFillLogin(l.id)
                .then((filled) =>
                  flash(filled.length ? `${filled.join(' et ')} rempli${filled.length > 1 ? 's' : ''}` : 'aucun champ de connexion sur cette page')
                )
                .catch((err) => flash(errorText(err)))
            }
          >
            remplir {l.label}
          </button>
        ))}
        <button
          className="btn small"
          disabled={!state?.url}
          onClick={() =>
            void api
              .browserCapture()
              .then(
                (page) => page && api.send({ folderId, text: 'Voici la page que je regarde.', attachments: [page] }).then(() => flash('page donnée à Marianne'))
              )
          }
        >
          donner la page à Marianne
        </button>
        <button className="btn small" disabled={!state?.url} onClick={() => api.browserExternal()}>
          ouvrir dans mon navigateur
        </button>
        <span>{notice || (human ? 'Marianne attend et reprendra là où vous vous êtes arrêté.' : 'vous pouvez reprendre la main à tout moment')}</span>
      </div>
    </aside>
  )
}
