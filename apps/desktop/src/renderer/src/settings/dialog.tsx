import { useEffect, useState } from 'react'
import { useApp } from '../app/context'
import { Boundary, SearchField } from '../components/ui'
import { AccountsPane, SecurityPane, SpacePane } from './archive'
import { BrowserPane, DataPane, EnginesPane, PrivacyPane, SitesPane } from './connections'
import { AboutPane, DisplayPane, ShortcutsPane, SkillsPane } from './application'
import { DocumentsPane, HouseholdPane, IdentityPane } from './me'
import { NewsSourcesPane, ServicesPane } from './pages-panes'
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
  sources: () => <NewsSourcesPane />,
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

/** Settings, a dialog over the application: the sections on the left, the page on the right. */
export function SettingsDialog() {
  const app = useApp()
  const page = app.settingsPage ?? 'identity'
  const [query, setQuery] = useState('')
  const close = () => app.openSettings(null)

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
        <div className="settings-page">
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
