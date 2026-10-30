import { readManifest, type NewsReading } from '@marianne/sdk'
import { checkTile, fakeContext, type FakeContextOptions } from '@marianne/sdk/testing'
import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { service } from '../src/main'
import { infosTile } from '../src/tile'
import { addDays, parisDay } from '../src/time'
import type { DayBefore, Reading } from '../src/types'
import { catalogue, ITEMS, READ_AT, readingOf, SOURCES, UNMARKED } from './fixtures'

const GRANTED: FakeContextOptions['profile'] = {
  granted: ['opinions.themes', 'opinions.sources'],
  themes: ['housing'],
  sources: { accepted: SOURCES.filter((s) => !s.setAside).map((s) => s.id), sections: { 'ouest-france': ['une'] } }
}

function setup(options: FakeContextOptions = {}) {
  const asked: Array<{ day?: string; all?: boolean }> = []
  const { ctx, stored } = fakeContext(pkg, {
    news: {
      read: (opts) => {
        asked.push(opts)
        return readingOf(ITEMS, !!opts.all)
      },
      sources: catalogue(true),
      articles: { b7: { start: 'Il était 1 h 40 quand le président de séance a annoncé le résultat.' } }
    },
    profile: GRANTED,
    ...options
  })
  const { methods, tile } = service.activate(ctx)
  return { methods, tile: tile!, asked, stored }
}

describe('the reading', () => {
  it('reads the set-aside sources too when the user’s sources apply, and shows the accepted ones', async () => {
    const { methods, asked } = setup()
    const r = (await methods.reading({ all: false })) as Reading
    expect(asked).toEqual([{ all: true }])
    expect(r.filtered).toBe(true)
    expect(r.accepted).toBe(7)
    expect(r.subjects[0]).toMatchObject({ id: 'b1', told: 6, aside: 0 })
    expect(r.subjects[0].hidden.map((h) => h.source)).toEqual(['cnews'])
    expect(r.themes).toEqual(['housing'])
    expect(r.sources.find((s) => s.id === 'ouest-france')?.kept).toBe(1)
  })

  it('« toutes » adds the set-aside sources, for this visit', async () => {
    const r = (await setup().methods.reading({ all: true })) as Reading
    expect(r.all).toBe(true)
    expect(r.subjects.map((s) => s.id)).toContain('s1')
  })

  it('not granted: all of Marianne’s sources, unmarked, no themes', async () => {
    const asked: Array<{ all?: boolean }> = []
    const { ctx } = fakeContext(pkg, {
      news: {
        read: (opts) => {
          asked.push(opts)
          return readingOf(ITEMS, true)
        },
        sources: UNMARKED
      }
    })
    const r = (await service.activate(ctx).methods.reading({ all: false })) as Reading
    expect(asked).toEqual([{ all: false }])
    expect(r.filtered).toBe(false)
    expect(r.all).toBe(true)
    expect(r.themes).toEqual([])
    expect(r.accepted).toBe(SOURCES.length)
  })
})

describe('the other methods', () => {
  it('search: with « toutes » only when the user’s sources apply', async () => {
    const { methods } = setup()
    const mine = (await methods.search('goncourt', { all: false })) as Array<{ id: string }>
    expect(mine.map((h) => h.id)).toEqual(['g2', 'g1'])
    const all = (await methods.search('sécurité', { all: true })) as Array<{ id: string }>
    expect(all.map((h) => h.id)).toEqual(['s2', 's1'])
  })

  it('article: the start Marianne could read, else nothing', async () => {
    const { methods } = setup()
    expect(await methods.article('b7')).toEqual({ start: 'Il était 1 h 40 quand le président de séance a annoncé le résultat.' })
    expect(await methods.article('d1')).toBeNull()
  })

  it('days: the same subject on the days before, oldest first, over the week Marianne keeps', async () => {
    const today = parisDay()
    const before = (day: string, title: string): NewsReading => {
      const at = `${day}T09:00:00.000Z`
      return {
        items: [],
        subjects: [
          {
            id: `${day}-a`,
            items: [
              { id: `${day}-a`, source: 'le-monde', title, url: 'https://lemonde.fr/a', published: at },
              { id: `${day}-b`, source: 'le-figaro', title: `${title} ce matin`, url: 'https://lefigaro.fr/b', published: at }
            ]
          }
        ],
        failed: [],
        readAt: at
      }
    }
    const days: Record<string, NewsReading> = {
      [addDays(today, -1)]: before(addDays(today, -1), 'Budget : le Sénat adopte une taxe sur les holdings, contre les recettes du gouvernement'),
      [addDays(today, -2)]: before(addDays(today, -2), 'Budget : le Sénat entame le vote de la partie recettes'),
      [addDays(today, -3)]: before(addDays(today, -3), 'Ariane 6 réussit son lancement')
    }
    const read: Array<string | undefined> = []
    const { ctx } = fakeContext(pkg, {
      news: {
        read: (opts) => {
          read.push(opts.day)
          return opts.day ? (days[opts.day] ?? { items: [], subjects: [], failed: [], readAt: READ_AT }) : readingOf(ITEMS, !!opts.all)
        },
        sources: catalogue(true)
      },
      profile: GRANTED
    })
    const found = (await service.activate(ctx).methods.days('b1', { all: false })) as DayBefore[]
    expect(found.map((d) => d.day)).toEqual([addDays(today, -2), addDays(today, -1)])
    expect(found[1]).toMatchObject({ sources: 2 })
    expect(read.filter(Boolean)).toHaveLength(6)
  })

  it('visit: the last visit, then now kept for the next', async () => {
    const { methods, stored } = setup()
    expect(await methods.visit()).toBeNull()
    const kept = stored.get('lastVisit') as string
    expect(Date.parse(kept)).toBeGreaterThan(Date.now() - 60_000)
    expect(await methods.visit()).toBe(kept)
  })

  it('notice: the word Marianne left at the move, once', async () => {
    const { methods, stored } = setup()
    stored.set('notice', { customFeedsDropped: true })
    expect(await methods.notice()).toBe('Vos flux ajoutés à la main ne sont plus lus : la liste est celle de Marianne.')
    expect(stored.has('notice')).toBe(false)
    expect(await methods.notice()).toBeNull()
  })
})

describe('the tile', () => {
  it('shows the first subject: its words, who tells it in their colours, its latest title', async () => {
    const tile = checkTile(await setup().tile())
    expect(tile).toEqual({
      title: 'budget · sénat · adopte',
      visual: {
        kind: 'blocks',
        blocks: [
          { color: 'rouge' },
          { color: 'rouge-clair' },
          { color: 'jaune' },
          { color: 'bleu-clair' },
          { color: 'bleu' },
          { color: 'gris-clair' },
          { color: null }
        ]
      },
      lines: [
        { text: 'chez 6 de vos 7 sources', tone: 'live' },
        { text: 'Budget 2027 : le Sénat adopte les recettes, suivez le vote', tone: 'dim' }
      ],
      params: { subject: 'b1' }
    })
  })

  it('says so when there is no subject, or no title', async () => {
    const reading = (await setup().methods.reading({ all: false })) as Reading
    expect(checkTile(infosTile({ ...reading, subjects: [] }))).toEqual({
      title: 'aucun sujet commun',
      lines: [{ text: 'Coup de vent en Bretagne : suivez l’évolution de la vigilan…', tone: 'dim' }]
    })
    expect(checkTile(infosTile({ ...reading, subjects: [], items: [] }))?.title).toBe('aucun titre pour le moment')
  })

  it('is asked every 15 minutes', () => {
    expect(service.tile).toEqual({ everyMinutes: 15 })
  })
})

describe('the manifest', () => {
  it('reads headlines through Marianne, has the frame’s search, three tabs, its icon and no tool', () => {
    const m = readManifest(pkg)
    expect(m).toMatchObject({
      id: 'infos',
      news: true,
      search: { placeholder: 'chercher dans les titres' },
      hosts: [],
      tools: [],
      permissions: { profile: ['opinions.themes', 'opinions.sources'] }
    })
    expect(m.tabs.map((t) => t.id)).toEqual(['front', 'wire', 'kiosk'])
    expect(m.icon).toEqual(pkg.marianne.icon)
    expect(service.activate(fakeContext(pkg).ctx).tools).toEqual([])
  })
})
