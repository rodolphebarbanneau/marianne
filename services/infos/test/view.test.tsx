import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readManifest, ServiceHostProvider, sideOf, type NewsHeadline, type ServiceHost } from '@marianne/sdk/view'
import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { rank } from '../src/model'
import type { Kiosk, Reading } from '../src/types'
import { InfosContext, infosOf } from '../src/ui/common'
import { ArticleStart, Band, FrontTab, Media, type FrontProps } from '../src/ui/front'
import { KioskTab } from '../src/ui/kiosk'
import { SubjectPane } from '../src/ui/pane'
import { WireTab } from '../src/ui/wire'
import { catalogue, ITEMS, readingOf } from './fixtures'

// The screen's parts, rendered as markup: what each shows, and in which order.

const HOST: ServiceHost = {
  manifest: readManifest(pkg),
  call: async () => null as never,
  params: {},
  home: null,
  ask: () => undefined,
  openRoute: () => undefined,
  openUrl: () => undefined,
  copy: () => undefined,
  toast: () => undefined,
  load: async () => null,
  save: async () => undefined
}

const readingFor = (all = false, items: NewsHeadline[] = ITEMS) =>
  rank(readingOf(items, true), catalogue(true), { all, filtered: true, themes: ['housing'], sections: null })

function render(node: ReactNode, reading: Reading, screen: { query?: string; since?: string | null } = {}) {
  const infos = infosOf(reading, HOST, {
    openSubject: () => undefined,
    setAll: () => undefined,
    openTab: () => undefined,
    query: screen.query ?? '',
    since: screen.since ?? null
  })
  return renderToStaticMarkup(
    <ServiceHostProvider host={HOST}>
      <InfosContext.Provider value={infos}>{node}</InfosContext.Provider>
    </ServiceHostProvider>
  )
}

const front = (reading: Reading, props: Partial<FrontProps> = {}) =>
  render(
    <FrontTab listed={reading.subjects} chosen={reading.subjects[0]} choose={() => undefined} mine={false} setMine={() => undefined} wide {...props} />,
    reading
  )
const rowsOf = (html: string) => [...html.matchAll(/<tr class="row( sel)?" data-subject="([^"]+)"/g)].map((m) => `${m[2]}${m[1] ? '*' : ''}`)
const all = (html: string, re: RegExp) => [...html.matchAll(re)].length

describe('« à la une »', () => {
  it('is two columns, the list on the left and the chosen subject on the right, without a head of source names', () => {
    const html = front(readingFor())
    expect(html.indexOf('infos-side')).toBeLessThan(html.indexOf('infos-cur'))
    expect(html).not.toContain('<th')
    expect(rowsOf(html)).toEqual(['b1*', 'g1', 't1', 'm1'])
    expect(html).toContain('budget · sénat · adopte')
  })

  it('shows another subject when another row is chosen, every row keeping its place', () => {
    const r = readingFor()
    const html = front(r, { chosen: r.subjects[2] })
    expect(rowsOf(html)).toEqual(['b1', 'g1', 't1*', 'm1'])
    const right = html.slice(html.indexOf('infos-cur'))
    expect(right).toContain('Taxe foncière : le doublement pour les propriétaires, un chiffre trompeur')
    expect(right).toContain('✓ vérifié')
  })

  it('draws each row’s sources as one bar, a cell a source shown, never more (21 with « toutes »)', () => {
    for (const r of [readingFor(), readingFor(true)]) {
      const html = front(r)
      const bars = [...html.matchAll(/<span class="bar">(.*?)<\/span><\/td>/g)].map((m) => all(m[1], /class="cell/g))
      expect(bars).toEqual(r.subjects.map(() => r.sources.filter((s) => r.all || !s.setAside).length))
    }
  })

  it('with « toutes », lights a side told by set-aside sources only, and still counts the user’s sources', () => {
    const r = readingFor(true)
    const s1 = r.subjects.find((s) => s.id === 's1')!
    const html = front(r, { chosen: s1 })
    const sides = [...html.matchAll(/<div class="sd( none)?"><span class="l">([^<]+)<\/span>.*?<span class="c"><b>(\d+)<\/b> sur (\d+)/g)].map(
      (m) => `${m[2]}${m[1] ? ' (muted)' : ''} ${m[3]}/${m[4]}`
    )
    expect(sides.find((x) => x.startsWith('à droite'))).toBe('à droite 0/2')
    expect(sides.filter((x) => x.includes('muted')).length).toBe(sides.length - 1)
  })

  it('leaves out of « qui en parle » a side none of the sources shown belongs to', () => {
    const sides = (html: string) => [...html.matchAll(/<div class="sd(?: none)?"><span class="l">([^<]+)<\/span>/g)].map((m) => m[1])
    const r = readingFor()
    expect(sides(front(r))).toEqual(['à gauche', 'au centre', 'à droite'])
    const placed = { ...r, sources: r.sources.map((s) => (sideOf(s.lean) === 'right' ? { ...s, lean: 'centre' as const } : s)) }
    expect(sides(front(placed))).toEqual(['à gauche', 'au centre'])
  })

  it('keeps the numbers when the theme filter hides rows', () => {
    const r = readingFor()
    const html = front(r, { listed: r.subjects.filter((s) => s.themes.length), chosen: r.subjects[2], mine: true })
    expect(rowsOf(html)).toEqual(['t1*'])
    expect(html).toContain('<span class="infos-num">3</span>')
    expect(html).toContain('◆ vos thèmes · 1')
  })

  it('narrower, opens the chosen subject under its row, across the list', () => {
    const html = front(readingFor(), { wide: false })
    expect(html).not.toContain('infos-cur')
    expect(html).toMatch(/data-subject="b1".*?<\/tr><tr class="open"><td colSpan="3"><div class="infos-detail">/)
  })

  it('says when no subject is told by two sources, and lists the single titles', () => {
    const html = front({ ...readingFor(), subjects: [] })
    // Not « aucun titre »: the titles of one source are just below.
    expect(html).toContain('Aucun sujet repris par deux sources pour le moment.')
    expect(html).not.toContain('Aucun titre')
    expect(html).toContain('4 titres que les autres ne reprennent pas')
    const none = front({ ...readingFor(), subjects: [], single: [], items: [] })
    expect(none).toContain('Aucun titre de vos sources pour le moment.')
    expect(none).not.toContain('une seule source')
  })

  it('puts in « le fil du sujet » each title’s square at its source’s position, newest first', () => {
    const html = front(readingFor())
    const fil = html.slice(html.indexOf('infos-snip'), html.indexOf('infos-section'))
    const order = [...fil.matchAll(/<span class="tm">(\d\d:\d\d)<\/span>/g)].map((m) => m[1])
    expect(order).toEqual(['10:25', '10:20', '10:05', '09:40', '09:12', '07:40'])
    // Le Figaro is « droite », the fifth position.
    expect(fil).toMatch(
      /title="Le Figaro · droite"><span><\/span><span><\/span><span><\/span><span><\/span><span><i class="" style="background:var\(--lean-droite\)"/
    )
  })
})

describe('the band', () => {
  it('holds « EN DIRECT », the hour, the counts, and the live titles with their subject’s number', () => {
    const html = render(<Band refreshing={false} pending={false} apply={() => undefined} choose={() => undefined} />, readingFor())
    expect(html).toContain('<span class="lab">EN DIRECT</span>')
    expect(html).toContain('ven. 30 · 10:37')
    expect(html).toContain('<b>16</b>titres')
    expect(html).toContain('<b>7</b>sources')
    expect(all(html, /class="lv"/g)).toBe(2)
    expect(html).toContain('Coup de vent en Bretagne')
    expect(html).not.toContain('DIRECT. Coup')
    // The title opens the article from the keys; the number is a button beside it, never inside a link.
    expect(html).not.toMatch(/class="lv"[^>]*role=/)
    expect(html).toMatch(/<span class="t" role="link" tabindex="0">Budget 2027/i)
    expect(html).toContain('<span class="lv-more small muted">+1</span>')
  })

  it('shows four live titles at most, the most recent, and says how many there are', () => {
    const lives = Array.from({ length: 6 }, (_, i): NewsHeadline => ({
      id: `l${i}`,
      source: 'franceinfo',
      title: `DIRECT. Sujet numéro ${i} en cours`,
      url: `https://x/${i}`,
      published: `2026-10-30T0${i}:00:00.000Z`
    }))
    const html = render(<Band refreshing={false} pending={false} apply={() => undefined} choose={() => undefined} />, readingFor(false, lives))
    expect(all(html, /class="lv"/g)).toBe(4)
    expect(html).toContain('6 directs, les 4 derniers')
    // Under 760 px one card shows: « +N » counts every other live title, not only the other cards.
    expect(html).toContain('<span class="lv-more small muted">+5</span>')
    expect(html.indexOf('numéro 5')).toBeLessThan(html.indexOf('numéro 4'))
    expect(html).not.toContain('numéro 1')
  })

  it('says when nothing is live, and when offline', () => {
    const quiet = readingFor(
      false,
      ITEMS.filter((h) => !/DIRECT/.test(h.title))
    )
    expect(render(<Band refreshing={false} pending={false} apply={() => undefined} choose={() => undefined} />, quiet)).toContain('aucun direct en ce moment')
    const offline = render(<Band refreshing={false} pending={false} apply={() => undefined} choose={() => undefined} />, { ...quiet, offline: true })
    expect(offline).toContain('hors ligne · titres de 10 h 37')
  })
})

describe('the article', () => {
  const open = () => undefined
  it('gives the start, then the way to the rest; behind a paywall, the way only; nothing to read, nothing', () => {
    expect(renderToStaticMarkup(<ArticleStart article={{ start: 'Il était 1 h 40.' }} source="Ouest-France" onOpen={open} />)).toContain(
      'lire la suite sur Ouest-France ›'
    )
    const paid = renderToStaticMarkup(<ArticleStart article={{ paid: true }} source="Le Monde" onOpen={open} />)
    expect(paid).toContain('abonnés')
    expect(paid).toContain('l’ouvrir sur Le Monde ›')
    expect(renderToStaticMarkup(<ArticleStart article={null} source="Le Monde" onOpen={open} />)).toBe('')
  })

  it('shows a video’s frame, never its player', () => {
    const html = renderToStaticMarkup(
      <Media media={{ kind: 'vidéo', src: 'data:image/png;base64,AA==', alt: 'Le Sénat', credit: 'AFP', duration: '1 min 42' }} onOpen={open} />
    )
    expect(html).toContain('vidéo · 1 min 42')
    expect(html).toContain('<span class="play">▶</span>')
    expect(html).not.toContain('<video')
  })
})

describe('the subject opened', () => {
  it('tells how each source titles it in the order they came, and the set-aside ones that tell it too', () => {
    const r = readingFor()
    const html = render(<SubjectPane subject={r.subjects[0]} />, r)
    expect(html).toContain('<b>6</b>de vos 7 sources')
    expect(html).toContain('<b>2 H 45</b>du premier au dernier')
    expect(html).toMatch(/<tr class=" first">.*?Les Échos/)
    expect(html).toContain('1 source écartée en parle aussi')
    expect(html).toContain('Aucune vérification sur ce sujet pour le moment.')
    expect(html).not.toContain('les jours d’avant')
  })
})

describe('the fil', () => {
  it('lists every title by time under its hour, with its subject’s number, NOUVEAU since the last visit', () => {
    const html = render(<WireTab />, readingFor(), { since: '2026-10-30T09:26:00.000Z' })
    expect(all(html, /class="infos-w/g)).toBe(16)
    expect(html).toContain('10 H<span>7 titres</span>')
    expect(html).toContain('8 H<span>1 titre</span>')
    expect(html).toContain('22 H · HIER')
    expect(all(html, /infos-new/g)).toBe(2)
    expect(html).toMatch(
      /Budget 2027 : le Sénat adopte les recettes, suivez le vote<\/button><span class="r"><button class="infos-cov"[^>]*><span class="infos-num lead sm">1<\/span>6 ›/
    )
  })

  it('follows the search', () => {
    const html = render(<WireTab />, readingFor(), { query: 'goncourt' })
    expect(all(html, /class="infos-w/g)).toBe(2)
  })

  it('found nothing: among the user’s sources, with the way to all; with all of them, plainly', () => {
    const mine = render(<WireTab />, readingFor(), { query: 'zzz' })
    expect(mine).toContain('Aucun titre de vos sources n’en parle.')
    expect(mine).toContain('chercher dans toutes ›')
    const every = render(<WireTab />, readingFor(true), { query: 'zzz' })
    expect(every).toContain('Aucun titre n’en parle.')
    expect(every).not.toContain('chercher dans toutes')
    const unshared = rank(readingOf(ITEMS, true), catalogue(true), { all: true, filtered: false, themes: [], sections: null })
    expect(render(<WireTab />, unshared, { query: 'zzz' })).toContain('Aucun titre n’en parle.')
  })
})

describe('the kiosk', () => {
  const kiosk = (k: Kiosk, query = '') => render(<KioskTab kiosk={k} setKiosk={() => undefined} />, readingFor(), { query })
  const cards = (html: string) => [...html.matchAll(/<b>([^<]+)<\/b><span class="sub">/g)].map((m) => m[1])

  it('is Marianne’s order by default, a card each accepted source, every card normal', () => {
    const html = kiosk({ order: [], large: [] })
    expect(cards(html)).toEqual(['LE MONDE', 'LIBÉRATION', 'LE FIGARO', 'LES ÉCHOS', 'OUEST-FRANCE', 'FRANCEINFO', 'LES DÉCODEURS'])
    expect(html).not.toContain('large')
    expect(html).not.toContain('rétablir')
    expect(all(html, /class="grip"/g)).toBe(7)
  })

  it('keeps the user’s order and sizes, and offers to put them back', () => {
    const html = kiosk({ order: ['ouest-france', 'le-figaro'], large: ['ouest-france'] })
    expect(cards(html).slice(0, 3)).toEqual(['OUEST-FRANCE', 'LE FIGARO', 'LE MONDE'])
    expect(html).toContain('infos-kcard large')
    expect(html).toContain('rétablir l’ordre et les tailles')
  })

  it('says which of the first subjects a source tells, by their numbers', () => {
    const html = kiosk({ order: [], large: [] })
    expect(html).toContain('2 des 4 sujets')
    expect(html).toContain('1 des 4 sujets')
  })

  it('follows the search', () => {
    expect(cards(kiosk({ order: [], large: [] }, 'goncourt'))).toEqual(['LE MONDE', 'LIBÉRATION'])
    expect(kiosk({ order: [], large: [] }, 'zzz')).toContain('Aucun titre de vos sources n’en parle.')
  })

  it('with no card and no search, says so without a word of a search', () => {
    const html = render(<KioskTab kiosk={{ order: [], large: [] }} setKiosk={() => undefined} />, { ...readingFor(), sources: [] })
    expect(html).toContain('Aucune source à montrer.')
    expect(html).not.toContain('en parle')
  })
})
