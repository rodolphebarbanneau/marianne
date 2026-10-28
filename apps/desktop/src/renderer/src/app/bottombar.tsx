import { useLayoutEffect, useRef } from 'react'
import { ENGINE_BADGES, ENGINE_LABELS } from '@shared/config'
import { LockIcon } from '../components/icons'
import { api } from '../lib/api'
import { useShortcutLabel, type Actions } from './commands'
import { PAGES, PAGE_LABELS, useApp } from './context'

type Key = [string, string, string, keyof Actions | null]

/** The Minitel keys of the screen: [key, shortcut, what it does, command when clicked]. */
function useKeys(): Key[] {
  const { view, settingsPage } = useApp()
  const menu: Key[] = [
    ['SOMMAIRE', 'menu', 'menu', 'menu'],
    ['GUIDE', 'guide', 'aide', null]
  ]
  if (settingsPage)
    return [
      ['ENVOI', 'CommandOrControl+S', 'enregistrer', null],
      ['ANNULATION', 'Escape', 'fermer', null],
      ['GUIDE', 'guide', 'aide', null]
    ]
  if (view.kind === 'folder')
    return [
      ['ENVOI', 'send', 'envoyer', null],
      ['ANNULATION', 'stop', 'arrêter Marianne', null],
      ['CORRECTION', 'edit', 'modifier mon message', null],
      ['RÉPÉTITION', 'retry', 'refaire', null],
      ['GUIDE', 'guide', 'aide', null]
    ]
  if (view.kind === 'service') return [['RETOUR', 'Escape', 'Services', 'prev'], ...menu]
  if (view.kind === 'domain') return [['RETOUR', 'Escape', 'Démarches', 'prev'], ...menu]
  const i = PAGES.indexOf(view.page)
  const keys: Key[] = []
  if (view.page === 'home') keys.push(['ENVOI', 'send', 'envoyer', null])
  if (i > 0) keys.push(['RETOUR', 'prev', PAGE_LABELS[PAGES[i - 1]], 'prev'])
  if (i < PAGES.length - 1) keys.push(['SUITE', 'next', PAGE_LABELS[PAGES[i + 1]], 'next'])
  return [...keys, ...menu]
}

/** Lock and the engines on the left; the screen's Minitel keys on the right. */
export function BottomBar({ actions }: { actions: Actions }) {
  const { lights, openSettings } = useApp()
  const label = useShortcutLabel()
  const keys = useKeys()
  const ref = useRef<HTMLDivElement>(null)

  // Narrow window: the keys drop their descriptions first, then their shortcuts.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.classList.remove('compact', 'tiny')
      if (el.scrollWidth > el.clientWidth) el.classList.add('compact')
      if (el.scrollWidth > el.clientWidth) el.classList.add('tiny')
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [keys])

  return (
    <footer className="bottombar">
      <div className="status">
        <button className="icon-btn" title={`verrouiller la session (${label('lock')})`} onClick={() => api.lock()}>
          <LockIcon />
        </button>
        <button className="engines" title="moteurs : ouvrir les réglages" onClick={() => openSettings('engines')}>
          {lights.map((l) => (
            <span
              key={l.id}
              className={`eng${l.ok ? '' : ' off'}`}
              title={`${ENGINE_LABELS[l.id]} · ${!l.ok ? 'introuvable' : l.busy ? 'au travail' : 'prêt'}`}
            >
              <span className={`dot ${!l.ok ? 'err' : l.busy ? 'work' : 'ready'}`} />
              {ENGINE_BADGES[l.id]}
            </span>
          ))}
        </button>
      </div>
      <div className="keys" ref={ref}>
        {keys.map(([key, shortcut, what, command]) => (
          <span key={key} className={command ? 'clickable' : ''} onClick={command ? () => actions[command]?.() : undefined}>
            <span className="key">{key}</span>
            <span className="what">{what}</span>
            <span className="sc">{label(shortcut)}</span>
          </span>
        ))}
      </div>
    </footer>
  )
}
