import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useApp, type ScreenKey } from '../../app/context'
import { KeyTabs, useTabKeys, type KeyTab } from '../../components/key-tabs'
import { api } from '../../lib/api'
import { useCatalogue, useServices, useServiceTiles } from '../../host'
import { plainKey } from '../../lib/keys'
import { CATALOGUE_PAGE, CatalogueNote, CatalogueTable, catalogueRows, RecommendedCards, recommended, TRUST_FILTERS, type TrustFilter } from './discover'
import { FileDialog, PinsDialog, ReviewDialog, type ReviewSubject } from './dialogs'
import { ServicesHead } from './kiosk'
import { byOrigin, MineTable, ORIGIN_FILTERS, type OriginFilter } from './mine'
import { listings, nextSort, search, searchTerms, type CatalogueKey, type Listing, type MineKey, type Sort } from './model'
import { onFileReview, takeFileReview } from './pending'
import { flatten, SearchHead, SearchView } from './search-view'
import { Tiles } from './tiles'

/**
 * Services: the 3615 kiosk. Its head is the one search of the page (a code or words, my services
 * and the catalogue's together); under it, two tabs: « mes services » (the pinned ones as tiles,
 * then all of mine as a table) and « découvrir » (what Marianne recommends as cards, then the
 * community catalogue). The head and the tabs stay: only what is under them scrolls, each view from
 * its top. Adding always goes through « avant d’ajouter »; closing a dialog gives the page back as
 * it was.
 */

type Tab = 'mine' | 'discover'

/** The page's tabs, in the order of their keys (F2, F3): the bottom bar counts them too. */
export const TABS: Array<[Tab, string]> = [
  ['mine', 'mes services'],
  ['discover', 'découvrir']
]

type Dialog = { kind: 'pins' } | { kind: 'file' } | { kind: 'review'; subject: ReviewSubject } | null

/** The tab shown, kept while the user opens a service and comes back. */
let lastTab: Tab = 'mine'

export function ServicesPage() {
  const app = useApp()
  const { go, setSettings, setScreenKeys, toast, openSettings } = app
  const services = useServices()
  const tiles = useServiceTiles((app.settings?.services.pinned ?? []).join())
  const catalogue = useCatalogue()
  const all = useMemo(() => listings(services, catalogue.entries), [services, catalogue.entries])

  const [tab, setTabState] = useState<Tab>(lastTab)
  const setTab = (next: Tab) => {
    lastTab = next
    setTabState(next)
  }
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [origin, setOrigin] = useState<OriginFilter>('all')
  const [mineSort, setMineSort] = useState<Sort<MineKey>>({ key: 'service', dir: 1 })
  const [trust, setTrust] = useState<TrustFilter>('all')
  const [catalogueSort, setCatalogueSort] = useState<Sort<CatalogueKey>>({ key: 'validation', dir: 1 })
  const [shown, setShown] = useState(CATALOGUE_PAGE)
  const [dialog, setDialog] = useState<Dialog>(null)
  const input = useRef<HTMLInputElement>(null)

  const pinnedOrder = app.settings?.services.pinned ?? []
  const mine = all.filter((l) => l.added)
  const pinnedServices = pinnedOrder.flatMap((id) => services.filter((s) => s.manifest.id === id && s.added))
  const terms = searchTerms(query)
  const groups = useMemo(() => search(all, query), [all, query])
  const results = flatten(groups)

  // Typing in the 3615 bar, at once: the page is a kiosk.
  useEffect(() => void input.current?.focus({ preventScroll: true }), [])
  // A .3615 file opened from the system: its review, over the page; several, one after another, never over another dialog.
  const dialogOpen = useRef(false)
  dialogOpen.current = dialog !== null
  const nextFile = useCallback(() => {
    const review = takeFileReview()
    if (review) setDialog({ kind: 'review', subject: { kind: 'file', review } })
  }, [])
  useEffect(() => onFileReview(() => !dialogOpen.current && nextFile()), [nextFile])
  useEffect(() => {
    if (!dialog) nextFile()
  }, [dialog, nextFile])

  const open = useCallback((id: string, params: Record<string, string | number> = {}) => go({ kind: 'service', id, params }), [go])
  const review = (l: Listing) => {
    if (l.added) return open(l.code)
    if (l.state) setDialog({ kind: 'review', subject: { kind: 'official', state: l.state } })
    else if (l.entry) setDialog({ kind: 'review', subject: { kind: 'catalogue', listing: l } })
  }
  const togglePin = (code: string) => void api.pinService(code, !pinnedOrder.includes(code))
  const switchOn = (l: Listing, on: boolean) => void api.switchService(l.code, on)

  const typed = (next: string) => {
    setQuery(next)
    // A code typed in full is the one ENVOI opens: it is chosen, whatever ranks above it.
    const code = next.trim().toLowerCase()
    const rows = flatten(search(all, next))
    setSelected(
      Math.max(
        0,
        rows.findIndex((l) => l.code === code)
      )
    )
  }
  const clear = () => typed('')
  const envoi = () => {
    if (!query.trim()) return toast('tapez un code ou un mot')
    const l = results[selected]
    if (l) review(l)
  }
  const step = (by: number) => setSelected((i) => Math.max(0, Math.min(results.length - 1, i + by)))
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // Entrée alone: ctrl+entrée stays the app's (a new folder).
    if (plainKey(e, 'Enter')) {
      e.preventDefault()
      envoi()
    } else if (e.key === 'Escape' && query) {
      e.preventDefault()
      e.stopPropagation()
      clear()
    } else if (query && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(e.key)) {
      // While searching, SUITE and RETOUR go through the results rather than the pages.
      e.preventDefault()
      e.stopPropagation()
      step(e.key === 'ArrowDown' || e.key === 'PageDown' ? 1 : -1)
    }
  }

  // The bottom bar's keys: a dialog's, the search's, or the page's.
  const dialogKind = dialog?.kind ?? null
  const searching = !!query.trim()
  useEffect(() => {
    const keys: ScreenKey[] | null = dialogKind
      ? [
          { key: 'ENVOI', shortcut: 'Enter', what: dialogKind === 'pins' ? 'terminé' : dialogKind === 'file' ? 'choisir' : 'ajouter' },
          { key: 'ANNULATION', shortcut: 'Escape', what: 'fermer', run: () => setDialog(null) },
          { key: 'GUIDE', shortcut: 'guide', what: 'aide' }
        ]
      : searching
        ? [
            { key: 'ENVOI', shortcut: 'Enter', what: 'ouvrir' },
            { key: 'SUITE', shortcut: 'ArrowDown', what: 'suivant' },
            { key: 'RETOUR', shortcut: 'ArrowUp', what: 'précédent' },
            { key: 'ANNULATION', shortcut: 'Escape', what: 'effacer', run: () => setQuery('') }
          ]
        : null
    setScreenKeys(keys)
  }, [dialogKind, searching, setScreenKeys])
  useEffect(() => () => setScreenKeys(null), [setScreenKeys])

  // « découvrir » opens on the catalogue's first page.
  const pick = (next: Tab) => {
    setTab(next)
    if (next === 'discover') setShown(CATALOGUE_PAGE)
  }
  const tabs: KeyTab<Tab>[] = TABS.map(([id, label]) => (id === 'mine' ? { id, label, count: mine.length } : { id, label, className: 'disc' }))
  // F2, F3: the tabs, a search under way cleared (the tabs come back with it).
  useTabKeys(tabs.length, (i) => {
    clear()
    pick(tabs[i].id)
  })

  const recs = recommended(all)
  const rows = catalogueRows(all, trust, catalogueSort)
  const more = useCallback(() => setShown((n) => n + CATALOGUE_PAGE), [])
  const closeDialog = useCallback(() => setDialog(null), [])

  return (
    <div className="page services-page">
      <div className="section kiosk-top">
        <ServicesHead ref={input} query={query} onQuery={typed} onEnvoi={envoi} onKey={onKey} />
        {searching ? (
          <SearchHead query={query.trim()} groups={groups} onClear={clear} />
        ) : (
          <nav className="page-tabs" aria-label="onglets de Services">
            <KeyTabs tabs={tabs} current={tab} onPick={pick} />
          </nav>
        )}
      </div>
      <div key={searching ? 'search' : tab} className="page-body">
        <div className="section">
          {searching ? (
            <SearchView
              query={query.trim()}
              terms={terms}
              groups={groups}
              selected={selected}
              onSelect={setSelected}
              onActivate={review}
              onFile={() => setDialog({ kind: 'file' })}
            />
          ) : tab === 'mine' ? (
            <div role="tabpanel">
              <div className="sec-h">
                <span className="label">★ épinglés</span>
                <span className="small dim">{pinnedServices.length}</span>
                <span className="tools">
                  <button className="btn small" onClick={() => setDialog({ kind: 'pins' })}>
                    modifier les épingles
                  </button>
                </span>
              </div>
              {pinnedServices.length ? (
                <Tiles
                  services={pinnedServices}
                  tiles={tiles}
                  onOpen={open}
                  onOrder={(order) => void setSettings({ services: { pinned: [...order, ...pinnedOrder.filter((id) => !order.includes(id))] } })}
                />
              ) : (
                <p className="dim">Aucun service épinglé : ☆ dans le tableau en fait une tuile.</p>
              )}
              <div className="sec-h">
                <span className="label">mes services</span>
                <span className="small dim">{mine.length}</span>
                <span className="tools">
                  <span className="seg" role="group" aria-label="origine">
                    {ORIGIN_FILTERS.map(([id, label]) => (
                      <button key={id} aria-pressed={origin === id} onClick={() => setOrigin(id)}>
                        {label}
                      </button>
                    ))}
                  </span>
                </span>
              </div>
              <MineTable
                list={mine.filter(byOrigin(origin))}
                sort={mineSort}
                onSort={(key) => setMineSort((s) => nextSort(s, key))}
                onOpen={(l) => open(l.code)}
                onPin={(l) => togglePin(l.code)}
                onSwitch={switchOn}
                onSettings={() => openSettings('services')}
              />
            </div>
          ) : (
            <div role="tabpanel">
              {recs.length > 0 && (
                <>
                  <div className="sec-h">
                    <span className="label">recommandés</span>
                    <span className="small dim">{recs.length}</span>
                  </div>
                  <RecommendedCards list={recs} onReview={review} />
                </>
              )}
              <div className="sec-h">
                <span className="label">catalogue</span>
                <span className="small dim">{rows.length}</span>
                <span className="tools">
                  {catalogue.entries.length > 0 && (
                    <span className="seg" role="group" aria-label="validation">
                      {TRUST_FILTERS.map(([id, label]) => (
                        <button
                          key={id}
                          aria-pressed={trust === id}
                          onClick={() => {
                            setTrust(id)
                            setShown(CATALOGUE_PAGE)
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </span>
                  )}
                  <button className="btn small" onClick={() => setDialog({ kind: 'file' })}>
                    ajouter un fichier .3615
                  </button>
                </span>
              </div>
              {rows.length ? (
                <CatalogueTable
                  rows={rows}
                  sort={catalogueSort}
                  onSort={(key) => {
                    setCatalogueSort((s) => nextSort(s, key))
                    setShown(CATALOGUE_PAGE)
                  }}
                  shown={shown}
                  onMore={more}
                  onReview={review}
                />
              ) : (
                <CatalogueNote state={catalogue} filtered={trust !== 'all'} />
              )}
            </div>
          )}
        </div>
      </div>
      {dialog?.kind === 'pins' && (
        <PinsDialog
          services={mine}
          pinned={pinnedOrder}
          onToggle={togglePin}
          onDiscover={() => {
            setDialog(null)
            clear()
            setTab('discover')
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'file' && <FileDialog onReview={(r) => setDialog({ kind: 'review', subject: { kind: 'file', review: r } })} onClose={closeDialog} />}
      {dialog?.kind === 'review' && (
        <ReviewDialog
          subject={dialog.subject}
          onAdded={(code) => {
            setDialog(null)
            toast(`3615 ${code.toUpperCase()} ajouté à mes services`)
          }}
          onClose={closeDialog}
        />
      )}
    </div>
  )
}
