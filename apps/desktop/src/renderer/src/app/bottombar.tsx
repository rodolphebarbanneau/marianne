import { useLayoutEffect, useRef } from 'react'
import { tabKey } from '@marianne/sdk'
import { ENGINE_BADGES, ENGINE_LABELS } from '@shared/config'
import { LockIcon } from '../components/icons'
import { serviceKeys, type BarKey as Key } from '../host/frame'
import { api } from '../lib/api'
import { TABS as DOMAIN_TABS } from '../pages/domain'
import { TABS as PROCEDURE_TABS } from '../pages/procedures'
import { TABS as SERVICE_TABS } from '../pages/services'
import { useShortcutLabel, type Actions } from './commands'
import { PAGES, PAGE_LABELS, useApp } from './context'

/** A page's tabs on F2, F3…, said as a service's screen says its own. */
const tabKeys = (count: number): Key => ['SUITE', `${tabKey(0)}…${tabKey(count - 1)}`, 'onglets', null]
const PAGE_TABS: Partial<Record<string, number>> = { procedures: PROCEDURE_TABS.length, services: SERVICE_TABS.length }

/** The Minitel keys of the screen: [key, shortcut, what it does, command when clicked]. */
function useKeys(): Key[] {
  const { view, settingsPage, screenKeys, serviceBar } = useApp()
  const menu: Key[] = [
    ['SOMMAIRE', 'menu', 'menu', 'menu'],
    ['GUIDE', 'guide', 'aide', 'guide']
  ]
  // No ENVOI: Réglages saves as the user types.
  if (settingsPage)
    return [
      ['ANNULATION', 'Escape', 'fermer', null],
      ['GUIDE', 'guide', 'aide', 'guide']
    ]
  // A screen with keys of its own for now: a search, one of its dialogs.
  if (screenKeys) return screenKeys.map((k) => [k.key, k.shortcut, k.what, k.run ?? null])
  if (view.kind === 'folder')
    return [
      ['ENVOI', 'send', 'envoyer', null],
      ['ANNULATION', 'stop', 'arrêter Marianne', null],
      ['CORRECTION', 'edit', 'modifier mon message', null],
      ['RÉPÉTITION', 'retry', 'refaire', null],
      ['GUIDE', 'guide', 'aide', 'guide']
    ]
  if (view.kind === 'service') return serviceKeys(serviceBar, menu)
  if (view.kind === 'domain') return [['ENVOI', 'Enter', 'demander', null], ['RETOUR', 'Escape', 'Démarches', 'prev'], tabKeys(DOMAIN_TABS.length), ...menu]
  const i = PAGES.indexOf(view.page)
  const keys: Key[] = []
  if (view.page === 'home') keys.push(['ENVOI', 'send', 'envoyer', null])
  // The 3615 bar: a code typed, ENVOI opens it.
  if (view.page === 'services') keys.push(['ENVOI', 'Enter', 'ouvrir le code', null])
  if (i > 0) keys.push(['RETOUR', 'prev', PAGE_LABELS[PAGES[i - 1]], 'prev'])
  if (i < PAGES.length - 1) keys.push(['SUITE', 'next', PAGE_LABELS[PAGES[i + 1]], 'next'])
  const tabs = PAGE_TABS[view.page]
  if (tabs) keys.push(tabKeys(tabs))
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
          <span
            key={`${key} ${what}`}
            className={command ? 'clickable' : ''}
            onClick={command ? () => (typeof command === 'function' ? command() : actions[command]?.()) : undefined}
          >
            <span className="key">{key}</span>
            <span className="what">{what}</span>
            <span className="sc">{label(shortcut)}</span>
          </span>
        ))}
      </div>
    </footer>
  )
}
