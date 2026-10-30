import { groupSubjects, type NewsHeadline } from '@marianne/sdk'
import { describe, expect, it } from 'vitest'
import {
  arranged,
  askText,
  daysInRow,
  kioskOrder,
  matches,
  moveBy,
  moveTo,
  newSince,
  sameOrder,
  rank,
  sameSubject,
  wordsOf,
  type RankOptions
} from '../src/model'
import { addDays } from '../src/time'
import { catalogue, ITEMS, READ_AT, readingOf, SOURCES, UNMARKED } from './fixtures'

const MINE: RankOptions = { all: false, filtered: true, themes: ['housing'], sections: null }
const ranked = (opts: Partial<RankOptions> = {}, items = ITEMS) => rank(readingOf(items, true), catalogue(true), { ...MINE, ...opts })

describe('the subjects', () => {
  it('are titles of different sources, ranked by how many tell them, then by their latest title', () => {
    const r = ranked()
    expect(r.subjects.map((s) => [s.number, s.id, s.told])).toEqual([
      [1, 'b1', 6],
      [2, 'g1', 2],
      [3, 't1', 2],
      [4, 'm1', 2]
    ])
    for (const s of r.subjects) expect(new Set(s.items.map((h) => h.source)).size).toBe(s.items.length)
    // Most recent first.
    expect(r.subjects[0].items.map((h) => h.id)).toEqual(['b7', 'b5', 'b4', 'b3', 'b2', 'b1'])
  })

  it('are named by the words their titles share, as the first title wrote them', () => {
    expect(ranked().subjects.map((s) => s.words.join(' · '))).toEqual([
      'budget · sénat · adopte',
      'goncourt · quatre · finalistes',
      'taxe · foncière · chiffre',
      'élections · mandat · états'
    ])
  })

  it('keep their id as they grow: their first title’s', () => {
    const later: NewsHeadline = {
      ...ITEMS[0],
      id: 'b8',
      source: 'les-decodeurs',
      published: '2026-10-30T09:36:00.000Z',
      title: 'Budget 2027 : le Sénat adopte les recettes, nos vérifications'
    }
    const r = ranked({}, [...ITEMS, later])
    expect(r.subjects[0].id).toBe('b1')
    expect(r.subjects[0].items[0].id).toBe('b8')
  })

  it('leave the titles no other source shown tells to « une seule source »', () => {
    const r = ranked()
    expect(r.single.map((h) => h.id)).toEqual(['v1', 'd1', 'e1', 'r1'])
    // The set-aside sources' pair isn't a subject without « toutes », and isn't shown.
    expect(r.items.some((h) => h.source === 'cnews' || h.source === 'europe-1')).toBe(false)
  })

  it('give every title of a subject its number, the same wherever it shows', () => {
    const r = ranked()
    expect(r.numbers.b4).toBe(1)
    expect(r.numbers.g2).toBe(2)
    expect(r.numbers.d1).toBeUndefined()
    for (const s of r.subjects) for (const h of s.items) expect(r.numbers[h.id]).toBe(s.number)
    expect(r.live.map((l) => [l.item.id, l.number])).toEqual([
      ['v1', null],
      ['b7', 1]
    ])
  })
})

describe('the badges, each read from the titles', () => {
  const r = ranked()
  const byId = (id: string) => r.subjects.find((s) => s.id === id)!

  it('DIRECT: a live title in the subject', () => {
    expect(r.subjects.map((s) => s.live)).toEqual([true, false, false, false])
  })

  it('NOUVEAU: its first title is less than two hours old', () => {
    // Goncourt's first came at 9 h 50, the reading at 10 h 37; the budget's at 7 h 40.
    expect(r.subjects.filter((s) => s.fresh).map((s) => s.id)).toEqual(['g1'])
  })

  it('✓ vérifié: a fact-checker’s title in it', () => {
    expect(byId('t1').checks.map((h) => h.source)).toEqual(['les-decodeurs'])
    expect(byId('b1').checks).toEqual([])
  })

  it('◆: one of the user’s themes, only when INFOS may read them', () => {
    expect(byId('t1').themes).toEqual(['housing'])
    expect(r.themed.t2).toEqual(['housing'])
    expect(ranked({ themes: [] }).subjects.every((s) => !s.themes.length)).toBe(true)
  })

  it('the theme filter hides rows and keeps their numbers', () => {
    expect(r.subjects.filter((s) => s.themes.length).map((s) => s.number)).toEqual([3])
  })
})

describe('« toutes »', () => {
  it('shows the set-aside sources, counts them in the ranking, and marks them', () => {
    const r = ranked({ all: true })
    expect(r.subjects.map((s) => [s.id, s.told, s.aside])).toEqual([
      ['b1', 6, 1],
      ['g1', 2, 0],
      ['t1', 2, 0],
      ['s1', 0, 2],
      ['m1', 2, 0]
    ])
    expect(r.subjects[0].hidden).toEqual([])
  })

  it('without it, a subject still counts the set-aside sources that tell it, hidden', () => {
    expect(ranked().subjects[0].hidden.map((h) => h.source)).toEqual(['cnews'])
    expect(ranked().accepted).toBe(7)
  })
})

describe('without the user’s sources', () => {
  it('shows all of Marianne’s, unmarked, none set aside', () => {
    const { subjects } = groupSubjects(ITEMS)
    const r = rank({ items: ITEMS, subjects, failed: ['le-figaro'], readAt: READ_AT }, UNMARKED, { all: true, filtered: false, themes: [], sections: null })
    expect(r.filtered).toBe(false)
    expect(r.accepted).toBe(SOURCES.length)
    expect(r.subjects.map((s) => s.id)).toEqual(['b1', 'g1', 't1', 's1', 'm1'])
    expect(r.subjects.every((s) => !s.aside && !s.hidden.length)).toBe(true)
    expect(r.failed).toEqual(['Le Figaro'])
  })
})

describe('the sources', () => {
  it('say how many of their sections the user keeps, when not all', () => {
    expect(ranked({ sections: { 'ouest-france': ['une', 'bretagne'] } }).sources.find((s) => s.id === 'ouest-france')).toMatchObject({ sections: 3, kept: 2 })
    expect(ranked().sources.find((s) => s.id === 'ouest-france')).toMatchObject({ sections: 3, kept: null })
  })
})

describe('NOUVEAU in the fil', () => {
  it('is what came after the last visit, nothing the first time', () => {
    expect(newSince(ITEMS, '2026-10-30T09:26:00.000Z').map((h) => h.id)).toEqual(['v1', 'd1'])
    expect(newSince(ITEMS, null)).toEqual([])
  })
})

describe('the kiosk', () => {
  const ids = SOURCES.map((s) => s.id)

  it('is Marianne’s order by default, the user’s once arranged, the sources that join later at the end', () => {
    expect(kioskOrder(ids, { order: [], large: [] })).toEqual(ids)
    const order = kioskOrder(ids.slice(0, 5), { order: ['ouest-france', 'le-monde'], large: [] })
    expect(order).toEqual(['ouest-france', 'le-monde', 'liberation', 'le-figaro', 'les-echos'])
    expect(kioskOrder([...ids.slice(0, 5), 'nouvelle'], { order, large: [] }).at(-1)).toBe('nouvelle')
    // A source Marianne no longer lists leaves it.
    expect(kioskOrder(['le-monde'], { order: ['gone', 'le-monde'], large: [] })).toEqual(['le-monde'])
  })

  it('moves a card to another’s place, and one step by the grip’s keys', () => {
    const order = ['a', 'b', 'c', 'd']
    expect(moveTo(order, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(moveTo(order, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
    expect(moveBy(order, 'b', -1)).toEqual(['b', 'a', 'c', 'd'])
    expect(moveBy(order, 'd', 1)).toEqual(order)
    // Among the cards shown: the hidden ones (a set-aside source, a search) keep their places.
    expect(moveBy(order, 'a', 1, ['a', 'c', 'd'])).toEqual(['c', 'b', 'a', 'd'])
    expect(moveBy(order, 'd', -1, ['a', 'b', 'd'])).toEqual(['a', 'd', 'c', 'b'])
    expect(moveBy(order, 'd', 1, ['a', 'd'])).toBe(order)
    expect(sameOrder(order, [...order])).toBe(true)
    expect(sameOrder(order, moveBy(order, 'a', 1))).toBe(false)
  })

  it('offers « rétablir » once arranged', () => {
    expect(arranged({ order: [], large: [] })).toBe(false)
    expect(arranged({ order: [], large: ['le-monde'] })).toBe(true)
  })
})

describe('the days before', () => {
  it('find the same subject on another day by its words', () => {
    const budget = ranked().subjects[0].items
    const at = (id: string, source: string, title: string, published: string): NewsHeadline => ({ id, source, title, url: `https://x/${id}`, published })
    const other = groupSubjects([
      at('x1', 'le-monde', 'Budget : le Sénat entame le vote de la partie recettes', '2026-10-28T09:00:00.000Z'),
      at('x2', 'le-figaro', 'Budget : au Sénat, le vote de la partie recettes commence', '2026-10-28T10:00:00.000Z'),
      at('y1', 'le-monde', 'Prix Goncourt : la deuxième sélection', '2026-10-28T09:00:00.000Z'),
      at('y2', 'liberation', 'Goncourt : la deuxième sélection du prix', '2026-10-28T09:30:00.000Z')
    ]).subjects
    expect(sameSubject(wordsOf(budget), other)?.id).toBe('x1')
    expect(sameSubject(wordsOf([{ title: 'Ariane 6 réussit son lancement' }]), other)).toBeNull()
  })

  it('count the days in a row, today included', () => {
    expect(daysInRow([{ day: '2026-10-28' }, { day: '2026-10-29' }], '2026-10-30', addDays)).toBe(3)
    expect(daysInRow([{ day: '2026-10-27' }], '2026-10-30', addDays)).toBe(1)
  })
})

describe('what Marianne is asked', () => {
  it('is the question, the titles shown and their links, nothing else', () => {
    const items = ranked().subjects[1].items
    const text = askText('Pourquoi en parle-t-on aujourd’hui ?', items, new Map(SOURCES.map((s) => [s.id, s.name])))
    expect(text).toBe(
      'Pourquoi en parle-t-on aujourd’hui ?\n\nLes titres (3615 INFOS) :\n' +
        '- Libération, 10 h 10 : Goncourt : les quatre finalistes dévoilés par le jury\n  https://liberation.fr/g2\n' +
        '- Le Monde, 9 h 50 : Prix Goncourt : les quatre finalistes dévoilés\n  https://lemonde.fr/g1'
    )
  })
})

describe('the search', () => {
  it('matches accents and case aside', () => {
    expect(matches('Taxe foncière : le doublement', 'FONCIERE')).toBe(true)
    expect(matches('Taxe foncière', 'budget')).toBe(false)
    expect(matches('Taxe foncière', ' ')).toBe(true)
  })
})
