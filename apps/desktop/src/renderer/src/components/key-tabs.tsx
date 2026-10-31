import { useEffect, useRef } from 'react'
import { tabKey } from '@marianne/sdk'
import { accelOf, matches, SHORTCUTS } from '@shared/shortcuts'
import { useApp } from '../app/context'
import { isMac } from '../lib/api'
import { tabFromKey } from '../lib/keys'

/** A tab of a page: its label, a count beside it (none: nothing shown), a class of its own. */
export interface KeyTab<T extends string> {
  id: T
  label: string
  count?: number
  className?: string
}

/**
 * A page's tabs as a service's screen has them: each with its key (F2, F3…), muted, lit on the tab
 * shown, and its count. Démarches, Services and a domain's page; the bar they sit in is the page's.
 */
export function KeyTabs<T extends string>({ tabs, current, onPick }: { tabs: KeyTab<T>[]; current: T; onPick: (id: T) => void }) {
  return (
    <div className="service-tab-list" role="tablist">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === current}
          className={`service-tab${t.id === current ? ' on' : ''}${t.className ? ` ${t.className}` : ''}`}
          title={`${t.label} (${tabKey(i)})`}
          onClick={() => onPick(t.id)}
        >
          <span className="fkey">{tabKey(i)}</span>
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * F2, F3…: a page's tabs, in their order. Not while a dialog, the palette, the settings or the guide
 * are open, nor for a key the user made one of their shortcuts.
 */
export function useTabKeys(count: number, pick: (index: number) => void): void {
  const { palette, settingsPage, guideOpen, config } = useApp()
  const latest = useRef(pick)
  latest.current = pick
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const index = tabFromKey(e, count)
      if (index === null) return
      if (palette || settingsPage || guideOpen || document.querySelector('#root > .overlay')) return
      if (SHORTCUTS.some((def) => matches(e, accelOf(def.id, isMac, config.shortcuts), isMac))) return
      e.preventDefault()
      latest.current(index)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, palette, settingsPage, guideOpen, config.shortcuts])
}
