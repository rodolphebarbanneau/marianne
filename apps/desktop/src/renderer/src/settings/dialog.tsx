import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { Boundary, SearchField } from '../components/ui'
import { AccountsPane, SecurityPane, SpacePane } from './archive'
import { BrowserPane, DataPane, EnginesPane, PrivacyPane, SitesPane } from './connections'
import { AboutPane, DisplayPane, ShortcutsPane, SkillsPane } from './application'
import { DocumentsPane, HouseholdPane, IdentityPane } from './me'
import { ServicesPane } from './pages-panes'
import { SETTINGS_GROUPS, SETTINGS_PAGES } from './pages'

const PANES: Record<string, () => React.ReactNode> = {
  identity: () => <IdentityPane />,
  household: () => <HouseholdPane />,
  documents: () => <DocumentsPane />,
  space: () => <SpacePane />,
  security: () => <SecurityPane />,
  accounts: () => <AccountsPane />,
  sites: () => <SitesPane />,
  engines: () => <EnginesPane />,
  browser: () => <BrowserPane />,
  privacy: () => <PrivacyPane />,
  data: () => <DataPane />,
  services: () => <ServicesPane />,
  display: () => <DisplayPane />,
  shortcuts: () => <ShortcutsPane />,
  skills: () => <SkillsPane />,
  about: () => <AboutPane />
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Pages that went, and where what they had is now: an old link (an engine's answer kept in a folder) still lands there. */
const MOVED: Record<string, string> = { sources: 'identity#sources' }

/** Settings, a dialog over the application: the sections on the left, the page on the right; « page#section » opens a page at a section. */
export function SettingsDialog() {
  const app = useApp()
  const [page, section] = (MOVED[app.settingsPage ?? ''] ?? app.settingsPage ?? 'identity').split('#')
  const [query, setQuery] = useState('')
  const pageRef = useRef<HTMLDivElement>(null)
  const close = () => app.openSettings(null)

  // The section may come after the first drawing, and what is above it too (the profile, the catalogue are asked
  // for): it is kept at the top while the page settles, until the user scrolls or the page has been still a moment.
  useEffect(() => {
    const root = pageRef.current
    if (!section || !root) return
    const show = () => root.querySelector(`#${CSS.escape(section)}`)?.scrollIntoView({ block: 'start' })
    // 3 s at most, and never against the user: a scroll, a key or a click stops it.
    const limit = setTimeout(() => stop(), 3000)
    let settle = setTimeout(() => stop(), 3000)
    const watch = new MutationObserver(() => {
      show()
      clearTimeout(settle)
      settle = setTimeout(() => stop(), 600)
    })
    const stop = () => {
      watch.disconnect()
      clearTimeout(settle)
      clearTimeout(limit)
      for (const event of ['wheel', 'keydown', 'pointerdown'] as const) root.removeEventListener(event, stop)
    }
    show()
    watch.observe(root, { childList: true, subtree: true })
    for (const event of ['wheel', 'keydown', 'pointerdown'] as const) root.addEventListener(event, stop, { passive: true })
    return stop
  }, [page, section])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // A shortcut being recorded takes Échap for itself.
      if (e.key === 'Escape' && !e.defaultPrevented) close()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const q = norm(query.trim())
  const title = SETTINGS_PAGES.find((p) => p.id === page)?.label ?? ''
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="settings">
        <nav className="settings-nav">
          <span className="title px">RÉGLAGES</span>
          <SearchField value={query} onChange={setQuery} placeholder="chercher un réglage" />
          {SETTINGS_GROUPS.map((g) => {
            const pages = g.pages.filter((p) => !q || norm(p.label).includes(q) || norm(g.label).includes(q))
            if (!pages.length) return null
            return (
              <div key={g.label}>
                <span className="g">{g.label}</span>
                {pages.map((p) => (
                  <button key={p.id} className={p.id === page ? 'on' : ''} onClick={() => app.openSettings(p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="settings-page" ref={pageRef}>
          <button className="btn small close" onClick={close}>
            fermer ✕
          </button>
          <span className="ptitle">{title}</span>
          <Boundary key={page} label={title}>
            {PANES[page]?.() ?? null}
          </Boundary>
        </div>
      </div>
    </div>
  )
}
