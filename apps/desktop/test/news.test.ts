import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NewsSource } from '@marianne/content'
import type { NewsChoice } from '@marianne/profile'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cutAtSentence } from '../src/main/public/html'
import { paywalled, readerStart, readSelector } from '../src/main/public/article'
import { cleanUrl, filterReading, NewsReader, parseFeed, parseSitemap, plainText, serviceNews, sourcesFor } from '../src/main/public/news'
import { regionOf, refusedSources } from '../src/shared/news'

/**
 * The news reader: the whole catalogue read, its 7-day history, the subjects grouped before the
 * filter of each service's grant, the stats of Réglages and the article of one headline. The
 * network is the test's: feeds and pages by URL.
 */

const state = vi.hoisted(() => ({
  root: '',
  catalogue: [] as NewsSource[],
  feeds: new Map<string, () => string>(),
  pages: new Map<string, { body: string | Buffer; type: string } | 'timeout'>(),
  fetched: [] as string[],
  resized: [] as number[]
}))

vi.mock('../src/main/paths', () => ({
  paths: {
    get news() {
      return join(state.root, 'news')
    },
    get logs() {
      return state.root
    }
  }
}))
vi.mock('../src/main/log', () => ({ log: { info: () => {}, warn: () => {}, error: () => {} } }))
vi.mock('../src/main/content', () => ({ content: { get: () => ({ newsSources: state.catalogue }) } }))
vi.mock('../src/main/http', async (original) => ({
  ...(await original<typeof import('../src/main/http')>()),
  fetchAsBrowser: async (url: string) => {
    state.fetched.push(url)
    const feed = state.feeds.get(url)
    if (!feed) throw new Error(`HTTP 404 de ${new URL(url).host}`)
    return feed()
  },
  fetchCapped: async (url: string) => {
    state.fetched.push(url)
    const page = state.pages.get(url)
    if (page === 'timeout') throw Object.assign(new Error(`Pas de réponse de ${new URL(url).host} (délai dépassé)`), { name: 'TimeoutError' })
    if (!page) throw Object.assign(new Error(`HTTP 404 de ${new URL(url).host}`), { status: 404 })
    return { bytes: Buffer.from(page.body), type: page.type, whole: true }
  }
}))
vi.mock('electron', () => {
  const image = (width: number) => ({
    isEmpty: () => false,
    getSize: () => ({ width, height: Math.round((width * 3) / 4) }),
    resize: (o: { width: number }) => {
      state.resized.push(o.width)
      return image(o.width)
    },
    toJPEG: () => Buffer.from(`jpeg ${width}`)
  })
  return { nativeImage: { createFromBuffer: (b: Buffer) => (b.length ? image(1200) : { isEmpty: () => true }) } }
})

const source = (id: string, group: NewsSource['group'], more: Partial<NewsSource> = {}): NewsSource => ({
  id,
  name: id,
  group,
  feed: `https://${id}.fr/rss.xml`,
  homepage: `https://www.${id}.fr`,
  ...more
})

const CATALOGUE: NewsSource[] = [
  source('le-monde', 'national', {
    lean: 'centre-gauche',
    sections: [
      { id: 'une', label: 'à la une', feed: 'https://le-monde.fr/une.xml' },
      { id: 'sport', label: 'sport', feed: 'https://le-monde.fr/sport.xml' }
    ]
  }),
  source('la-croix', 'national', { lean: 'centre' }),
  source('cnews', 'broadcast', { lean: 'droite' }),
  source('ouest-france', 'regional', { regions: ['53', '52'] }),
  source('le-progres', 'regional', { regions: ['84'] }),
  source('les-decodeurs', 'factcheck')
]

interface Entry {
  guid: string
  title: string
  /** Minutes before now. */
  ago: number
  extra?: string
  description?: string
}

const rss = (entries: Entry[]) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel><title>x</title>${entries
    .map(
      (e) =>
        `<item><title><![CDATA[${e.title}]]></title><link>https://site.fr/${e.guid}</link><guid isPermaLink="false">${e.guid}</guid><pubDate>${new Date(Date.now() - e.ago * 60_000).toUTCString()}</pubDate>${e.description ? `<description><![CDATA[${e.description}]]></description>` : ''}${e.extra ?? ''}</item>`
    )
    .join('')}</channel>
</rss>`

/** Each feed of the catalogue, by URL: its entries as they read now. */
function serve(feeds: Record<string, Entry[] | 'down'>): void {
  state.feeds.clear()
  for (const [url, entries] of Object.entries(feeds)) if (entries !== 'down') state.feeds.set(url, () => rss(entries))
}

let clock = Date.parse('2026-10-30T09:00:00Z')
let dirs = 0
const reader = () => {
  const dir = join(state.root, `news-${++dirs}`)
  return new NewsReader(() => dir)
}

beforeAll(() => {
  state.root = mkdtempSync(join(tmpdir(), 'marianne-news-'))
  state.catalogue = CATALOGUE
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterAll(() => {
  vi.useRealTimers()
  rmSync(state.root, { recursive: true, force: true })
})
// A step of a few hours each test: the feeds' five minutes of cache are long past.
beforeEach(() => {
  clock += 6 * 3600_000
  vi.setSystemTime(clock)
  state.fetched = []
  state.pages.clear()
  state.resized = []
})

const TRAIN = {
  monde: 'Collision de trains en Espagne : au moins 68 morts et un deuil national',
  croix: 'Espagne : collision entre deux trains, 68 morts, trois jours de deuil national',
  cnews: 'Collision ferroviaire en Espagne : 68 morts, le pays en deuil national'
}

/** A subject told by le-monde, la-croix and cnews; single titles elsewhere. */
function morning(): void {
  serve({
    'https://le-monde.fr/une.xml': [
      { guid: 'm1', title: TRAIN.monde, ago: 30 },
      { guid: 'm2', title: 'Budget 2027 : le Sénat adopte la première partie', ago: 90 }
    ],
    'https://le-monde.fr/sport.xml': [
      { guid: 'm2', title: 'Budget 2027 : le Sénat adopte la première partie', ago: 90 },
      { guid: 'm3', title: 'Rugby : le XV de France en tournée au Japon', ago: 120 }
    ],
    'https://la-croix.fr/rss.xml': [{ guid: 'c1', title: TRAIN.croix, ago: 60 }],
    'https://cnews.fr/rss.xml': [{ guid: 'n1', title: TRAIN.cnews, ago: 200 }],
    'https://ouest-france.fr/rss.xml': [{ guid: 'o1', title: 'Rennes : un nouveau pont sur la Vilaine', ago: 40 }],
    'https://le-progres.fr/rss.xml': [{ guid: 'p1', title: 'Lyon : la Fête des lumières se prépare', ago: 50 }],
    'https://les-decodeurs.fr/rss.xml': 'down'
  })
}

const view = (granted: boolean, choice: NewsChoice | null = null, region: string | null = null, all = false) => ({ granted, choice, region, all })

describe('feeds', () => {
  const now = new Date('2026-10-28T18:00:00Z')

  it('reads RSS 2.0: titles, cleaned links, plain summaries, categories and dates', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
      <item><title><![CDATA[EN DIRECT – Collision entre deux trains en Espagne]]></title>
        <link>https://www.exemple.fr/monde/article-1?utm_source=rss&amp;id=7#xtor=RSS-3</link><guid isPermaLink="false">exemple-1</guid>
        <description><![CDATA[<p>L&#8217;accident est survenu <b>mercredi</b> matin.</p>]]></description>
        <category><![CDATA[International]]></category><pubDate>Wed, 28 Oct 26 17:32:05 +0100</pubDate></item>
      <item><title>Pr&#xE9;sidentielle : le calendrier</title><guid isPermaLink="true">https://www.exemple.fr/politique/article-2</guid></item>
      <item><description>Sans titre</description><link>https://www.exemple.fr/sans-titre</link></item>
    </channel></rss>`
    const items = parseFeed(xml, 'exemple', now)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      title: 'EN DIRECT – Collision entre deux trains en Espagne',
      url: 'https://www.exemple.fr/monde/article-1?id=7',
      published: '2026-10-28T16:32:05.000Z',
      category: 'International',
      summary: 'L’accident est survenu mercredi matin.'
    })
    // No date: when it was first seen, and the same next time.
    expect(items[1].published).toBe(now.toISOString())
    expect(parseFeed(xml, 'exemple', new Date('2026-10-29T00:00:00Z'))[1].published).toBe(now.toISOString())
    expect(() => parseFeed('<html><body>Accès refusé</body></html>', 'x')).toThrow('flux')
  })

  it('dates an undated item by its source’s news sitemap, and takes its picture there', () => {
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
      <url><loc>https://www.leparisien.fr/politique/un-titre-30-10-2026-ABCD.php</loc><news:news><news:publication_date>2026-10-30T09:12:00+01:00</news:publication_date></news:news>
        <image:image><image:loc>https://www.leparisien.fr/resizer/photo.jpg</image:loc><image:caption><![CDATA[L’Assemblée, jeudi]]></image:caption></image:image></url>
      <url><loc>https://www.leparisien.fr/sans-date.php</loc></url>
    </urlset>`
    const dates = parseSitemap(sitemap)
    expect([...dates.keys()]).toEqual(['https://www.leparisien.fr/politique/un-titre-30-10-2026-ABCD.php'])
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
      <item><title>Un titre</title><link>https://www.leparisien.fr/politique/un-titre-30-10-2026-ABCD.php?utm_source=rss</link></item>
      <item><title>Un autre</title><link>https://www.leparisien.fr/politique/un-autre-30-10-2026-EFGH.php</link></item>
    </channel></rss>`
    const at = new Date('2026-10-30T13:00:00Z')
    const [listed, missing] = parseFeed(xml, 'le-parisien', at, dates)
    expect(listed.published).toBe('2026-10-30T08:12:00.000Z')
    expect(listed.media).toMatchObject({ url: 'https://www.leparisien.fr/resizer/photo.jpg', kind: 'photo', alt: 'L’Assemblée, jeudi' })
    // Not in the sitemap: as before, when Marianne first saw it.
    expect(missing.published).toBe(at.toISOString())
  })

  it('dates an undated item of an earlier day by its address, at noon in Paris', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
      <item><title>Hier</title><link>https://www.leparisien.fr/faits-divers/un-titre-27-10-2026-ABCD.php</link></item>
      <item><title>Ce matin</title><link>https://www.leparisien.fr/politique/un-autre-30-10-2026-EFGH.php</link></item>
      <item><title>Rangé</title><link>https://www.exemple.fr/2026/10/26/un-article/</link></item>
    </channel></rss>`
    const at = new Date('2026-10-30T13:00:00Z')
    const [old, today, path] = parseFeed(xml, 'le-parisien', at)
    expect(old.published).toBe('2026-10-27T11:00:00.000Z')
    expect(today.published).toBe(at.toISOString())
    expect(path.published).toBe('2026-10-26T11:00:00.000Z')
  })

  it('reads the media a feed gives and the article it carries', () => {
    const text = 'Le train circulait à grande vitesse quand la collision a eu lieu, près de Cordoue, en fin de journée. '.repeat(4)
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>x</title>
      <item><title>Un</title><link>https://a.fr/1</link>
        <media:content url="https://img.a.fr/small.jpg" medium="image" width="200"/>
        <media:content url="https://img.a.fr/big.jpg" medium="image" width="1200"><media:description>Carte des lignes</media:description><media:credit>AFP</media:credit></media:content>
        <media:content url="https://img.a.fr/mid.jpg" medium="image" width="600"/>
        <content:encoded><![CDATA[<p>Le résumé du flux.</p><p>${text}</p>]]></content:encoded></item>
      <item><title>Deux</title><link>https://a.fr/2</link><media:content url="https://v.a.fr/v.mp4" medium="video" duration="102"><media:thumbnail url="https://img.a.fr/frame.jpg"/></media:content></item>
      <item><title>Trois</title><link>https://a.fr/3</link><enclosure url="https://img.a.fr/e.png" type="image/png" length="1"/></item>
      <item><title>Quatre</title><link>https://a.fr/4</link><media:thumbnail url="file:///etc/passwd"/></item>
    </channel></rss>`
    const [one, two, three, four] = parseFeed(xml, 'a', now)
    expect(one.media).toEqual({ url: 'https://img.a.fr/mid.jpg', kind: 'photo', alt: '' })
    expect(one.start!.length).toBeLessThanOrEqual(600)
    expect(one.start).toMatch(/^Le train circulait.*\.$/)
    expect(two.media).toEqual({ url: 'https://img.a.fr/frame.jpg', kind: 'vidéo', alt: '', duration: '1 min 42' })
    expect(three.media).toMatchObject({ url: 'https://img.a.fr/e.png', kind: 'photo' })
    expect(four.media).toBeUndefined()
  })

  it('cleans text and links', () => {
    expect(plainText('<p>Un&nbsp;texte &amp; <a href="#">un lien</a></p>')).toBe('Un texte & un lien')
    expect(cleanUrl('https://www.exemple.fr/a?at_medium=RSS&amp;at_campaign=x&page=2')).toBe('https://www.exemple.fr/a?page=2')
    expect(cleanUrl('javascript:alert(1)')).toBe('')
  })
})

describe('the reading', () => {
  it('reads the whole catalogue, every section, and groups over all of it', async () => {
    morning()
    const r = reader()
    const whole = await r.whole()
    // Every source's feeds, whoever reads: the set-aside ones too.
    expect(new Set(state.fetched)).toEqual(new Set([...CATALOGUE.flatMap((s) => (s.sections ? s.sections.map((x) => x.feed) : [s.feed]))]))
    expect(whole.failed).toEqual(['les-decodeurs'])
    expect(whole.offline).toBeUndefined()
    // A title on the front page and in a section is one title, with both.
    const budget = whole.items.filter((i) => i.title.startsWith('Budget'))
    expect(budget).toHaveLength(1)
    expect(budget[0]).toMatchObject({ section: 'une', sections: ['une', 'sport'] })
    expect(whole.subjects).toHaveLength(1)
    expect(whole.subjects[0].items.map((i) => i.source)).toEqual(['le-monde', 'la-croix', 'cnews'])
    // Its id is its first title's: cnews's, the oldest.
    expect(whole.subjects[0].id).toBe(whole.items.find((i) => i.source === 'cnews')!.id)
  })

  it('filters after grouping: a granted service gets the user’s sources and sections, the set-aside ones marked on demand', async () => {
    morning()
    const whole = await reader().whole()
    const choice: NewsChoice = { refused: ['cnews'], sections: { 'le-monde': ['une'] }, leanings: {} }

    const mine = filterReading(whole, CATALOGUE, view(true, choice))
    expect(mine.items.map((i) => i.source)).not.toContain('cnews')
    // Rugby is only in the sport section, which the user unticked; the budget is on the front page too.
    expect(mine.items.map((i) => i.title)).not.toContain('Rugby : le XV de France en tournée au Japon')
    expect(mine.items.some((i) => i.title.startsWith('Budget'))).toBe(true)
    expect(mine.items.every((i) => !i.setAside)).toBe(true)
    // The subject keeps its id, told by two of the user's sources now.
    expect(mine.subjects).toEqual([{ id: whole.subjects[0].id, items: expect.any(Array) }])
    expect(mine.subjects[0].items.map((i) => i.source)).toEqual(['le-monde', 'la-croix'])
    expect(mine.failed).toEqual(['les-decodeurs'])
    expect(JSON.stringify(mine)).not.toMatch(/"sections"|"media"/)

    const all = filterReading(whole, CATALOGUE, view(true, choice, null, true))
    expect(
      all.items
        .filter((i) => i.setAside)
        .map((i) => i.source)
        .sort()
    ).toEqual(['cnews', 'le-monde'])
    expect(all.subjects[0].items.find((i) => i.source === 'cnews')?.setAside).toBe(true)

    // Without the grant: everything, unmarked, whatever is asked.
    const everything = filterReading(whole, CATALOGUE, view(false, null, null, true))
    expect(everything.items).toHaveLength(whole.items.length)
    expect(everything.items.some((i) => 'setAside' in i)).toBe(false)
    expect(everything.subjects[0].items).toHaveLength(3)
  })

  it('keeps a subject that only a set-aside title tied together, once grouped over everything', async () => {
    serve({
      'https://le-monde.fr/une.xml': [{ guid: 'a', title: 'Grève SNCF : trafic très perturbé jeudi sur les lignes TGV', ago: 10 }],
      'https://cnews.fr/rss.xml': [{ guid: 'b', title: 'Grève SNCF jeudi : trafic perturbé, TGV et TER annulés en Bretagne', ago: 20 }],
      'https://la-croix.fr/rss.xml': [{ guid: 'c', title: 'TER annulés en Bretagne : grève SNCF jeudi, usagers en colère', ago: 30 }]
    })
    const whole = await reader().whole()
    expect(whole.subjects).toHaveLength(1)
    const mine = filterReading(whole, CATALOGUE, view(true, { refused: ['cnews'], sections: {}, leanings: {} }))
    expect(mine.subjects).toHaveLength(1)
    expect(mine.subjects[0].items.map((i) => i.source).sort()).toEqual(['la-croix', 'le-monde'])
  })

  it('keeps the titles a feed no longer lists, 7 days, and prunes the rest', async () => {
    const r = reader()
    serve({
      'https://la-croix.fr/rss.xml': [
        { guid: 'x', title: 'Premier titre du matin', ago: 60 },
        { guid: 'old', title: 'Un titre de la semaine dernière', ago: 8 * 24 * 60 }
      ]
    })
    await r.whole()
    vi.setSystemTime((clock += 3600_000))
    serve({ 'https://la-croix.fr/rss.xml': [{ guid: 'y', title: 'Deuxième titre', ago: 5 }] })
    const later = await r.whole()
    expect(later.items.map((i) => i.title)).toEqual(['Deuxième titre', 'Premier titre du matin'])
    expect(r.history.all().some((i) => i.title.includes('semaine dernière'))).toBe(false)

    // Read again from its files by another run of the app.
    const dir = join(state.root, `news-${dirs}`)
    const files = readdirSync(dir)
    expect(files.every((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))).toBe(true)
    const again = new NewsReader(() => dir)
    expect(again.history.all().map((i) => i.title)).toEqual(['Deuxième titre', 'Premier titre du matin'])

    // Nine days on: the titles are gone, and their files.
    vi.setSystemTime((clock += 9 * 86_400_000))
    serve({})
    expect(again.history.all()).toEqual([])
    expect(files.some((f) => existsSync(join(dir, f)))).toBe(false)
  })

  it('leaves out the titles dated ahead, and the window offline never ends past now', async () => {
    const r = reader()
    serve({
      'https://la-croix.fr/rss.xml': [
        { guid: 'soon', title: 'Un titre daté de dix minutes plus tard', ago: -10 },
        { guid: 'event', title: 'Le concert de ce soir, daté de son heure', ago: -6 * 60 },
        { guid: 'now', title: 'Un titre de maintenant', ago: 1 }
      ]
    })
    expect((await r.whole()).items.map((i) => i.title)).toEqual(['Un titre daté de dix minutes plus tard', 'Un titre de maintenant'])
    expect(r.history.all().some((i) => i.title.includes('concert'))).toBe(false)
    serve({})
    vi.setSystemTime((clock += 6 * 60_000))
    const offline = await r.whole()
    expect(offline.offline).toBe(true)
    expect(Date.parse(offline.readAt)).toBeLessThanOrEqual(Date.now())

    // A title ahead an earlier version kept, and the article it kept with its title: both left out.
    const dir = join(state.root, `news-${++dirs}`)
    mkdirSync(dir, { recursive: true })
    const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(at(-1)))
    writeFileSync(
      join(dir, `${day}.json`),
      JSON.stringify([
        { id: 'a', source: 'la-croix', title: 'Lu hier', url: 'https://site.fr/a', published: at(-1), article: { start: 'Ce que l’utilisateur a lu.' } },
        { id: 'b', source: 'la-croix', title: 'Daté demain', url: 'https://site.fr/b', published: at(24 * 60) }
      ])
    )
    const old = new NewsReader(() => dir)
    expect(old.history.all().map((i) => i.id)).toEqual(['a'])
    expect(old.history.get('a')).not.toHaveProperty('article')
    expect(readFileSync(join(dir, `${day}.json`), 'utf8')).not.toMatch(/utilisateur|Daté demain/)
  })

  it('groups and counts once until a title comes or goes', async () => {
    morning()
    const r = reader()
    const first = await r.whole()
    const stats = r.stats()
    expect(r.stats()).toBe(stats)
    await r.article(first.items[0].id)
    expect(r.stats()).toBe(stats)
    vi.setSystemTime((clock += 6 * 60_000))
    serve({ 'https://la-croix.fr/rss.xml': [{ guid: 'new', title: 'Un titre nouveau dans le flux', ago: 1 }] })
    await r.whole()
    expect(r.stats()).not.toBe(stats)
  })

  it('reads a day of the history, and the history alone when no feed answers', async () => {
    morning()
    const r = reader()
    const first = await r.whole()
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(first.items[0].published))
    const past = await r.whole(day)
    expect(past.items.length).toBeGreaterThan(0)
    expect(past.items.every((i) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(i.published)) === day)).toBe(true)

    vi.setSystemTime((clock += 2 * 3600_000))
    serve({})
    const offline = await r.whole()
    expect(offline.offline).toBe(true)
    expect(offline.items.map((i) => i.id).sort()).toEqual(first.items.map((i) => i.id).sort())
    expect(offline.readAt).toBe(first.readAt)
  })

  it('says what the history holds of each source, for Réglages', async () => {
    morning()
    const r = reader()
    await r.whole()
    const stats = r.stats()
    expect(stats.perDay['le-monde']).toBe(3)
    expect(stats.perDay['les-decodeurs']).toBeUndefined()
    expect(stats.today).toEqual([{ words: expect.arrayContaining(['espagne', '68']), sources: ['le-monde', 'la-croix', 'cnews'] }])
    expect(stats.today[0].words.length).toBeLessThanOrEqual(3)
    expect(Object.values(stats.aloneThisMorning).every((n) => n > 0)).toBe(true)
  })
})

describe('ctx.news', () => {
  it('filters by the grant, notes the read, and names the sources as the service may see them', async () => {
    morning()
    const r = reader()
    let granted = false
    const reads: number[] = []
    const ctx = serviceNews(
      {
        granted: () => granted,
        choice: () => ({ refused: ['cnews'], sections: {}, leanings: { 'la-croix': 'gauche' } }),
        region: () => '53',
        noteRead: () => reads.push(1)
      },
      r
    )
    expect(ctx.filtered()).toBe(false)
    expect((await ctx.read()).items.some((i) => i.source === 'cnews')).toBe(true)
    expect((await ctx.sources({ all: true })).find((s) => s.id === 'la-croix')).toMatchObject({ lean: 'centre', site: 'la-croix.fr' })
    expect(reads).toEqual([])

    granted = true
    expect(ctx.filtered()).toBe(true)
    expect((await ctx.read()).items.some((i) => i.source === 'cnews')).toBe(false)
    const sources = await ctx.sources()
    // The user's choice, not the defaults of their region: only what they set aside goes.
    expect(sources.map((s) => s.id)).toEqual(['le-monde', 'la-croix', 'ouest-france', 'le-progres', 'les-decodeurs'])
    expect(sources.find((s) => s.id === 'la-croix')?.lean).toBe('gauche')
    expect(sources.find((s) => s.id === 'le-monde')?.sections).toEqual([
      { id: 'une', label: 'à la une' },
      { id: 'sport', label: 'sport' }
    ])
    expect((await ctx.sources({ all: true })).filter((s) => s.setAside).map((s) => s.id)).toEqual(['cnews'])
    expect(reads.length).toBeGreaterThan(0)

    // Search over the 7 days, accents and plurals aside.
    expect((await ctx.search('ESPAGNE collisions')).map((i) => i.source)).toEqual(['le-monde', 'la-croix'])
    expect((await ctx.search('espagne', { all: true })).find((i) => i.source === 'cnews')?.setAside).toBe(true)
    expect(await ctx.search('  ')).toEqual([])
    expect(await ctx.search('espagne', { limit: 1 })).toHaveLength(1)
  })
})

describe('default sources', () => {
  it('accepts every source but the regional ones of other regions; without an address, every one', () => {
    expect(regionOf('35238')).toBe('53')
    expect(regionOf('69123')).toBe('84')
    expect(regionOf('2A004')).toBe('94')
    expect(regionOf('97411')).toBe('04')
    expect(regionOf('')).toBeNull()
    expect([...refusedSources(CATALOGUE, null, '53')]).toEqual(['le-progres'])
    expect([...refusedSources(CATALOGUE, null, '84')]).toEqual(['ouest-france'])
    expect([...refusedSources(CATALOGUE, null, null)]).toEqual([])
    // A choice is the user's, whatever their address.
    expect([...refusedSources(CATALOGUE, { refused: ['cnews'], sections: {}, leanings: {} }, '53')]).toEqual(['cnews'])
    expect(sourcesFor(CATALOGUE, view(true, null, '84')).map((s) => s.id)).not.toContain('ouest-france')
    // Unticking every section sets a source aside.
    expect(sourcesFor(CATALOGUE, view(true, { refused: [], sections: { 'le-monde': [] }, leanings: {} })).map((s) => s.id)).not.toContain('le-monde')
  })
})

describe('the article', () => {
  const para = (n: number) =>
    `<p>${Array.from({ length: n }, (_, i) => `Phrase numéro ${i + 1} de l’article, assez longue pour être lue comme un paragraphe du texte.`).join(' ')}</p>`
  const page = (body: string, head = '') =>
    `<html><head>${head}<meta property="og:image" content="/photo.jpg"><meta property="og:image:alt" content="Le quai de la gare"></head><body><nav><p>Menu du site, rubriques et liens de navigation à ne pas lire.</p></nav><article><p class="article__chapo">Le résumé du flux, que la page redit en chapô.</p>${body}<aside><p>Lire aussi : un autre article qui n’a rien à faire dans le début.</p></aside></article></body></html>`

  async function articleOf(entry: Partial<Entry>, html?: string | 'timeout', src = 'la-croix') {
    const url = `https://${src}.fr/rss.xml`
    serve({ [url]: [{ guid: 'g', title: 'Collision de trains en Espagne', ago: 5, description: 'Le résumé du flux, que la page redit en chapô.', ...entry }] })
    const r = reader()
    const { items } = await r.whole()
    if (html === 'timeout') state.pages.set('https://site.fr/g', 'timeout')
    else if (html !== undefined) state.pages.set('https://site.fr/g', { body: html, type: 'text/html; charset=utf-8' })
    else state.pages.delete('https://site.fr/g')
    state.pages.set('https://site.fr/photo.jpg', { body: 'img', type: 'image/jpeg' })
    state.pages.set('https://img.fr/feed.jpg', { body: 'img', type: 'image/jpeg' })
    return { r, id: items[0].id, article: await r.article(items[0].id) }
  }

  it('reads the start of the page like a reader view, cut at a sentence, and its picture made small', async () => {
    const { r, id, article } = await articleOf({}, page(para(12)))
    expect(article?.paid).toBeUndefined()
    expect(article?.start).toMatch(/^Phrase numéro 1 de l’article/)
    expect(article!.start!.length).toBeLessThanOrEqual(600)
    expect(article!.start!.endsWith('.')).toBe(true)
    expect(article?.media).toEqual({ kind: 'photo', src: `data:image/jpeg;base64,${Buffer.from('jpeg 400').toString('base64')}`, alt: 'Le quai de la gare' })
    expect(state.resized).toEqual([400])
    // Kept in memory: not read again.
    state.fetched = []
    const version = r.history.version
    expect(await r.article(id)).toEqual(article)
    expect(state.fetched).toEqual([])
    // Never with the titles, on disk in the clear: the history doesn't change for it (nor its groupings).
    expect(r.history.version).toBe(version)
    expect(r.history.get(id)).not.toHaveProperty('article')
    const dir = join(state.root, `news-${dirs}`)
    for (const file of readdirSync(dir)) expect(readFileSync(join(dir, file), 'utf8')).not.toMatch(/Phrase numéro|data:image/)
    // The account locked: let go, read again when asked.
    r.forgetArticles()
    expect(await r.article(id)).toEqual(article)
    expect(state.fetched).toContain('https://site.fr/g')
  })

  it('keeps only the last articles asked', async () => {
    const r = reader()
    serve({
      'https://la-croix.fr/rss.xml': Array.from({ length: 201 }, (_, i) => ({ guid: `a${i}`, title: `Titre numéro ${i} du jour`, ago: 5 + i }))
    })
    const { items } = await r.whole()
    for (const item of items) await r.article(item.id)
    state.fetched = []
    // The first asked went with the 201st; the second is still there.
    await r.article(items[1].id)
    expect(state.fetched).toEqual([])
    await r.article(items[0].id)
    expect(state.fetched).toEqual(['https://site.fr/a0'])
  })

  it('takes the feed’s picture and text first', async () => {
    const text = 'Le texte que le flux donne lui-même, en entier, et qui suffit à dire le début de l’article sans lire sa page. '.repeat(3)
    const { article } = await articleOf({
      extra: `<media:content url="https://img.fr/feed.jpg" medium="image"/><content:encoded><![CDATA[<p>${text}</p>]]></content:encoded>`
    })
    expect(article?.start).toMatch(/^Le texte que le flux donne/)
    expect(article?.media?.kind).toBe('photo')
    expect(state.fetched).not.toContain('https://site.fr/g')
  })

  it('gives nothing past a paywall', async () => {
    const ld = '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"NewsArticle","isAccessibleForFree":"False"}]}</script>'
    expect((await articleOf({}, page(para(8), ld))).article).toEqual({ media: expect.any(Object), paid: true })
    state.catalogue = CATALOGUE.map((s) => (s.id === 'la-croix' ? { ...s, paywall: 'div.premium-lock, [data-paywall]' } : s))
    try {
      expect((await articleOf({}, page(`<div class="premium-lock big">abonnés</div>${para(8)}`))).article?.paid).toBe(true)
      expect((await articleOf({}, page(para(8)))).article?.paid).toBeUndefined()
    } finally {
      state.catalogue = CATALOGUE
    }
  })

  it('shows no start for a source that asked, and nothing when nothing could be read', async () => {
    state.catalogue = CATALOGUE.map((s) => (s.id === 'la-croix' ? { ...s, start: false as const } : s))
    try {
      expect((await articleOf({}, page(para(8)))).article).toEqual({ media: expect.objectContaining({ kind: 'photo' }) })
    } finally {
      state.catalogue = CATALOGUE
    }
    // A page that isn't there: that is its answer, not asked again.
    const gone = await articleOf({})
    expect(gone.article).toBeNull()
    state.fetched = []
    vi.setSystemTime((clock += 6 * 60_000))
    expect(await gone.r.article(gone.id)).toBeNull()
    expect(state.fetched).toEqual([])
  })

  it('asks again later what didn’t answer: a page or a picture that timed out', async () => {
    const { r, id, article } = await articleOf({}, 'timeout')
    expect(article).toBeNull()
    state.fetched = []
    expect(await r.article(id)).toBeNull()
    expect(state.fetched).toEqual([])
    vi.setSystemTime((clock += 6 * 60_000))
    state.pages.set('https://site.fr/g', { body: page(para(8)), type: 'text/html' })
    expect((await r.article(id))?.start).toMatch(/^Phrase numéro 1/)

    // The page read, its picture not: what was read is shown, and the whole asked again later.
    const late = await articleOf({}, page(para(8)))
    expect(late.article?.media).toBeDefined()
    const second = reader()
    serve({ 'https://la-croix.fr/rss.xml': [{ guid: 'g', title: 'Collision de trains en Espagne', ago: 5 }] })
    const { items } = await second.whole()
    state.pages.set('https://site.fr/photo.jpg', 'timeout')
    const partial = await second.article(items[0].id)
    expect(partial?.start).toBeDefined()
    expect(partial?.media).toBeUndefined()
    vi.setSystemTime((clock += 6 * 60_000))
    state.pages.set('https://site.fr/photo.jpg', { body: 'img', type: 'image/jpeg' })
    expect((await second.article(items[0].id))?.media?.kind).toBe('photo')
  })

  it('reads pages robustly', () => {
    expect(readerStart(page(para(1)), 'Le résumé du flux, que la page redit en chapô.')).toBe(
      'Phrase numéro 1 de l’article, assez longue pour être lue comme un paragraphe du texte.'
    )
    // An article nested in another: its own paragraphs, the related teasers' left out.
    expect(readerStart('<main><article><p>court</p></article><article><p>' + 'Un vrai paragraphe du texte. '.repeat(5) + '</p></article></main>')).toMatch(
      /^Un vrai/
    )
    expect(readerStart('<p>Accepter les cookies pour continuer la lecture de cet article sur notre site.</p>')).toBe('')
    expect(cutAtSentence(`M. Dupont est venu. ${'Il a parlé longtemps de la ligne. '.repeat(30)}`, 600)).toMatch(/^M\. Dupont est venu\. Il a parlé.*ligne\.$/)
    expect(cutAtSentence('mot '.repeat(300), 100).endsWith('…')).toBe(true)
    // At the 600th character a number's point is no sentence's end: never 601 characters, never « 1. ».
    const before = `${'Une phrase de quarante caractères ici. '.repeat(15).slice(0, 560)}fin.`
    const number = `${before} Le taux passe à ${'9'.repeat(600 - before.length - 18)}1.5 pour cent cette année.`
    expect(number.indexOf('1.5') + 1).toBe(600)
    expect(cutAtSentence(number, 600)).toBe(before)
    const exact = `${'x'.repeat(39)} ${'mot '.repeat(139)}fin. Et la suite.`
    expect(exact.indexOf('fin.') + 4).toBe(600)
    expect(cutAtSentence(exact, 600)).toHaveLength(600)
    expect(readSelector('div.premium-lock, [data-paywall="yes"], #lock')).toHaveLength(3)
    expect(readSelector('div[')).toBeNull()
    expect(paywalled('<meta itemprop="isAccessibleForFree" content="false">')).toBe(true)
    expect(paywalled('<meta property="article:content_tier" content="locked">')).toBe(true)
    expect(paywalled('<div data-paywall="no"></div>', '[data-paywall="yes"]')).toBe(false)
    expect(paywalled('<section class="article paywall"></section>', 'article .paywall')).toBe(true)
  })
})
