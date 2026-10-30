import { describe, expect, it } from 'vitest'
import { parsePeriod, parseSpCards, selectChanges } from '../src/main/public/france'
import { clockEvents, schoolEvents } from '../src/main/public/today'

/** What public life holds today and in the coming weeks: the start of 3615 CALENDRIER. */

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
