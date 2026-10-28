import { describe, expect, it } from 'vitest'
import { parsePeriod, parseSpCards, selectChanges } from '../src/main/public/france'
import { cleanUrl, groupStories, parseFeed, plainText, similarity, titleWords } from '../src/main/public/news'
import { clockEvents, schoolEvents } from '../src/main/public/today'
import type { NewsItem } from '../src/shared/public'

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Exemple</title>
    <link>https://www.exemple.fr</link>
    <item>
      <title><![CDATA[EN DIRECT – Collision entre deux trains en Espagne : au moins 68 morts]]></title>
      <link>https://www.exemple.fr/monde/article-1?utm_source=rss&amp;utm_medium=flux&amp;id=7#xtor=RSS-3</link>
      <guid isPermaLink="false">exemple-1</guid>
      <description><![CDATA[<p>L&#8217;accident est survenu <b>mercredi</b> matin.</p><img src="x.jpg"/>]]></description>
      <category><![CDATA[International]]></category>
      <category>Europe</category>
      <pubDate>Wed, 28 Oct 26 17:32:05 +0100</pubDate>
    </item>
    <item>
      <title>Pr&#xE9;sidentielle : le calendrier des candidatures</title>
      <guid isPermaLink="true">https://www.exemple.fr/politique/article-2</guid>
      <description>${'Une phrase assez longue pour dépasser la limite de deux cents caractères. '.repeat(5)}</description>
    </item>
    <item>
      <description>Un élément sans titre n'est pas une actualité.</description>
      <link>https://www.exemple.fr/sans-titre</link>
    </item>
  </channel>
</rss>`

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Exemple Atom</title>
  <entry>
    <title type="html">Budget 2027 &amp;amp; Sécurité sociale : les dates-clés</title>
    <link rel="self" href="https://www.exemple.fr/feed/3"/>
    <link rel="alternate" type="text/html" href="https://www.exemple.fr/decodeurs/article-3"/>
    <id>tag:exemple.fr,2026:3</id>
    <published>2026-10-27T05:30:02+01:00</published>
    <updated>2026-10-27T08:00:00+01:00</updated>
    <summary type="html">&lt;p&gt;Le point sur le calendrier.&lt;/p&gt;</summary>
    <category term="politique" label="Politique"/>
  </entry>
</feed>`

describe('feeds', () => {
  const now = new Date('2026-10-28T18:00:00Z')

  it('reads RSS 2.0: titles, cleaned links, plain summaries, categories and dates', () => {
    const items = parseFeed(RSS, 'exemple', now)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      source: 'exemple',
      title: 'EN DIRECT – Collision entre deux trains en Espagne : au moins 68 morts',
      url: 'https://www.exemple.fr/monde/article-1?id=7',
      published: '2026-10-28T16:32:05.000Z',
      category: 'International',
      summary: 'L’accident est survenu mercredi matin.'
    })
    // No link: the permalink guid. No date: when it was first seen, and the same next time.
    expect(items[1]).toMatchObject({ title: 'Présidentielle : le calendrier des candidatures', url: 'https://www.exemple.fr/politique/article-2' })
    expect(items[1].published).toBe(now.toISOString())
    expect(parseFeed(RSS, 'exemple', new Date('2026-10-29T00:00:00Z'))[1].published).toBe(now.toISOString())
    expect(items[1].summary!.length).toBeLessThanOrEqual(200)
    expect(items[1].summary!.endsWith('…')).toBe(true)
    expect(items[0].id).not.toBe(items[1].id)
    expect(parseFeed(RSS, 'exemple', now)[0].id).toBe(items[0].id)
  })

  it('reads Atom: the alternate link, the published date, the category label', () => {
    const [item] = parseFeed(ATOM, 'decodeurs', now)
    expect(item).toMatchObject({
      title: 'Budget 2027 & Sécurité sociale : les dates-clés',
      url: 'https://www.exemple.fr/decodeurs/article-3',
      published: '2026-10-27T04:30:02.000Z',
      category: 'Politique',
      summary: 'Le point sur le calendrier.'
    })
  })

  it('refuses what is not a feed', () => {
    expect(() => parseFeed('<html><body>Accès refusé</body></html>', 'x')).toThrow('flux')
  })

  it('cleans text and links', () => {
    // The XML parser decodes once; what double-encoding feeds leave is decoded here.
    expect(plainText('<p>Un&nbsp;texte &amp; <a href="#">un lien</a></p>')).toBe('Un texte & un lien')
    expect(cleanUrl('https://www.exemple.fr/a?at_medium=RSS&amp;at_campaign=x&page=2')).toBe('https://www.exemple.fr/a?page=2')
    expect(cleanUrl('javascript:alert(1)')).toBe('')
  })
})

const item = (source: string, title: string, published: string): NewsItem => ({
  id: `${source}:${title}`,
  source,
  title,
  url: `https://${source}.fr/`,
  published
})

describe('grouping', () => {
  it('compares the words that matter', () => {
    expect([...titleWords('EN DIRECT – Les trains : au moins 68 morts')]).toEqual(['train', '68', 'mort'])
    expect(similarity(titleWords('Collision de trains en Espagne'), titleWords('Espagne : collision entre deux trains'))).toBe(1)
    expect(similarity(titleWords('Espagne : un train'), titleWords('Espagne : un autre train'))).toBe(0)
  })

  it('groups the same story told by different sources, the most covered first', () => {
    const stories = groupStories([
      item('le-monde', 'EN DIRECT, accident entre deux trains en Espagne : au moins 68 morts, trois jours de deuil national', '2026-10-28T16:31:00Z'),
      item('rfi', 'Collision de trains en Espagne : au moins 68 morts et une centaine de blessés, un deuil national', '2026-10-28T09:58:00Z'),
      item('le-progres', 'Espagne. Terrible accident de trains : le bilan grimpe à 68 morts, trois jours de deuil national décrétés', '2026-10-28T15:13:00Z'),
      item('les-echos', 'Impôts : la France reprend son titre de championne d’Europe', '2026-10-28T16:27:00Z')
    ])
    expect(stories).toHaveLength(2)
    expect(stories[0].item.source).toBe('le-monde')
    expect(stories[0].others.map((o) => o.source).sort()).toEqual(['le-progres', 'rfi'])
    expect(stories.map((s) => s.others.length)).toEqual([2, 0])
  })

  it('never groups a source with itself', () => {
    const title = 'Accident de trains en Espagne : 68 morts, trois jours de deuil national'
    expect(groupStories([item('le-monde', title, '2026-10-28T17:00:00Z'), item('le-monde', `${title} (suite)`, '2026-10-28T16:00:00Z')])).toHaveLength(2)
  })
})

describe('En France', () => {
  it('reads the periods of Service-Public badges', () => {
    expect(parsePeriod('À partir du 1 nov. 2026')).toEqual({ from: '2026-11-01' })
    expect(parsePeriod('Jusqu’au 31 déc. 2026')).toEqual({ until: '2026-12-31' })
    expect(parsePeriod('Avant le 31 déc. 2026')).toEqual({ until: '2026-12-31' })
    expect(parsePeriod('Le 2 sept. 2027')).toEqual({ from: '2027-09-02', until: '2027-09-02' })
    expect(parsePeriod('Du 10 oct. au 3 nov. 2026')).toEqual({ from: '2026-10-10', until: '2026-11-03' })
    expect(parsePeriod('Du 20 déc. au 3 janv. 2027')).toEqual({ from: '2026-12-20', until: '2027-01-03' })
    expect(parsePeriod('Du 14 sept. 2026 au 28 févr. 2027')).toEqual({ from: '2026-09-14', until: '2027-02-28' })
  })

  const card = (id: string, title: string, published: string, badge = '') =>
    `<li><div class="fr-card" data-test="carte"><div class="fr-card__body"><H4 class="fr-card__title" data-test="carte-titre"><a href="https://www.service-public.gouv.fr/particuliers/actualites/${id}" data-test="cards-private" >${title}</a></H4><p class="fr-card__desc" data-test="carte-description">Publié le ${published}</p><div class="fr-card__start">${badge ? `<p class="fr-badge fr-badge--green-emeraude fr-mb-1w">${badge}</p>` : ''}<p class="fr-card__detail fr-mb-0" data-test="carte-badge">Sécurité routière</p></div></div></div></li>`

  it('reads Service-Public cards and keeps what concerns the coming weeks', () => {
    const agenda = parseSpCards(
      card('A14389', 'Pneus hiver, chaînes : quelles sont vos obligations ?', '20 octobre 2026', 'À partir du 1 nov. 2026') +
        card('A18926', 'Prime de transport : le plafond d&#39;exonération', '24 octobre 2026', 'Jusqu&#39;au 31 déc. 2026') +
        card('A19000', 'Une réforme lointaine', '01 octobre 2026', 'À partir du 1 juil. 2027')
    )
    expect(agenda[0]).toEqual({
      id: 'A14389',
      source: 'service-public',
      title: 'Pneus hiver, chaînes : quelles sont vos obligations ?',
      url: 'https://www.service-public.gouv.fr/particuliers/actualites/A14389',
      published: '2026-10-20',
      category: 'Sécurité routière',
      when: 'À partir du 1 nov. 2026',
      from: '2026-11-01'
    })
    expect(agenda[1]).toMatchObject({ title: 'Prime de transport : le plafond d’exonération', when: 'Jusqu’au 31 déc. 2026', until: '2026-12-31' })
    const news = parseSpCards(card('A17785', 'Ce qui change en novembre 2026', '28 octobre 2026'))
    const changes = selectChanges(agenda, news, '2026-10-28')
    expect(changes.map((c) => c.id)).toEqual(['A17785', 'A14389'])
    expect(selectChanges(agenda, [], '2026-12-15').map((c) => c.id)).toEqual(['A18926'])
  })
})

describe('Aujourd’hui', () => {
  it('announces the clock change the day before and the day itself', () => {
    expect(clockEvents('2026-10-24', '2026-10-25')[0].title).toBe('La nuit prochaine, passage à l’heure d’hiver : à 3 h, il sera 2 h')
    expect(clockEvents('2026-03-29', '2026-03-30')[0].title).toBe('Cette nuit, passage à l’heure d’été : à 2 h, il sera 3 h')
    expect(clockEvents('2026-10-28', '2026-10-29')).toEqual([])
  })

  it('lists school holidays in progress, by zone, with the day classes resume', () => {
    const period = (zones: string, population = '-') => ({
      description: 'Vacances de la Toussaint',
      start_date: '2026-10-16T22:00:00+00:00',
      end_date: '2026-11-01T23:00:00+00:00',
      zones,
      population
    })
    const events = schoolEvents('2026-10-28', [period('Zone A'), period('Zone C'), period('Zone B'), period('Zone B', 'Enseignants'), period('Guadeloupe')])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'school', title: 'Vacances de la Toussaint', detail: 'zones A, B et C · reprise des cours le lundi 2 novembre' })
    expect(schoolEvents('2026-11-02', [period('Zone A')])).toEqual([])
  })
})
