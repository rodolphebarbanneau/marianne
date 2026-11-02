import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { Boundary, SearchField } from '../components/ui'
import { api } from '../lib/api'
import { AccountsPane, SecurityPane, SpacePane } from './archive'
import { ApprovalsPane, DataPane, EnginesPane, SitesPane, WebPane } from './connections'
import { AboutPane, DisplayPane, ShortcutsPane, SkillsPane } from './application'
import { AssetsPane, ContactPane, DocumentsPane, HouseholdPane, IdentityPane, NotesPane } from './me'
import { AccessPane, LeaningPane, ThemesPane } from './opinions'
import { MoneyPane } from './payment'
import { SourcesPane } from './sources'
import { guideUrl, SETTINGS_GROUPS, SETTINGS_PAGES, settingsTarget } from './pages'

const PANES: Record<string, () => React.ReactNode> = {
  identity: () => <IdentityPane />,
  contact: () => <ContactPane />,
  household: () => <HouseholdPane />,
  assets: () => <AssetsPane />,
  money: () => <MoneyPane />,
  documents: () => <DocumentsPane />,
  leaning: () => <LeaningPane />,
  themes: () => <ThemesPane />,
  sources: () => <SourcesPane />,
  engines: () => <EnginesPane />,
  notes: () => <NotesPane />,
  skills: () => <SkillsPane />,
  web: () => <WebPane />,
  approvals: () => <ApprovalsPane />,
  access: () => <AccessPane />,
  sites: () => <SitesPane />,
  data: () => <DataPane />,
  space: () => <SpacePane />,
  security: () => <SecurityPane />,
  accounts: () => <AccountsPane />,
  display: () => <DisplayPane />,
  shortcuts: () => <ShortcutsPane />,
  about: () => <AboutPane />
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Settings, a dialog over the application: the sections on the left, the page on the right; « page#section » opens a page at a section. */
export function SettingsDialog() {
  const app = useApp()
  const { page, section } = settingsTarget(app.settingsPage ?? 'identity')
  const [query, setQuery] = useState('')
  const pageRef = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const close = () => app.openSettings(null)

  // The focus, as a Modal takes it: the keys are the settings', not those of a field behind them (the 3615 bar,
  // the composer), and it goes back there when they close.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!box.current?.contains(document.activeElement)) box.current?.focus({ preventScroll: true })
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true })
    }
  }, [])

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
      // A shortcut being recorded, the search box and a dialog over the settings (Modal) take Échap for themselves.
      if (e.key === 'Escape' && !e.defaultPrevented) close()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const q = norm(query.trim())
  const current = SETTINGS_PAGES.find((p) => p.id === page)
  const title = current?.label ?? ''
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={box} className="settings" role="dialog" aria-modal="true" aria-label="réglages" tabIndex={-1}>
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
          <span className="ptitle">
            {title}
            {/* What explains the page is in the guide, not on it. */}
            {current?.guide && (
              <button
                className="link guide-link"
                title="les explications de cette page, dans le guide"
                onClick={() => api.openExternal(guideUrl(current.guide!))}
              >
                guide ↗
              </button>
            )}
          </span>
          <Boundary key={page} label={title}>
            {PANES[page]?.() ?? null}
          </Boundary>
        </div>
      </div>
    </div>
  )
}
