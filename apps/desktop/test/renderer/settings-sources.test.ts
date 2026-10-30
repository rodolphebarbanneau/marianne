import type { ProfileField } from '@marianne/sdk'
import { describe, expect, it } from 'vitest'
import type { NewsSource } from '../../src/shared/news'
import { acceptSources, byLean, choiceOf, giveLean, isAccepted, keepSections, sidesOf } from '../../src/shared/news-choice'
import { keptSections, leanOf } from '../../src/shared/news'
import { readSummary } from '../../src/renderer/src/settings/readers'

const source = (id: string, more: Partial<NewsSource> = {}): NewsSource => ({
  id,
  name: id,
  group: 'national',
  feed: `https://${id}.example.fr/rss`,
  homepage: `https://www.${id}.example.fr`,
  ...more
})

const sections = (...ids: string[]) => ids.map((id) => ({ id, label: id, feed: `https://example.fr/${id}.xml` }))

const catalog = [
  source('le-monde', { lean: 'centre-gauche', leanBasis: 'une étude', sections: sections('une', 'politique', 'economie') }),
  source('liberation', { lean: 'gauche', leanBasis: 'une étude' }),
  source('le-figaro', { lean: 'droite', leanBasis: 'une étude' }),
  source('la-croix', { lean: 'centre', leanBasis: 'une étude' }),
  source('franceinfo', { group: 'broadcast' }),
  source('ouest-france', { group: 'regional', regions: ['53', '52', '28'], lean: 'centre', leanBasis: 'une étude' }),
  source('sud-ouest', { group: 'regional', regions: ['75'], lean: 'centre', leanBasis: 'une étude' })
]
const byId = (id: string) => catalog.find((s) => s.id === id)!
// Rennes (35238): Bretagne.
const defaults = choiceOf(null, catalog, '35238')

describe('the sources of Réglages › Identité', () => {
  it('starts from the defaults: every source, but the regional ones of other regions; none set aside without an address', () => {
    expect(defaults.refused).toEqual(['sud-ouest'])
    expect(choiceOf(null, catalog, '').refused).toEqual([])
    const stored = { refused: ['le-figaro'], sections: {}, leanings: {} }
    expect(choiceOf(stored, catalog, '35238')).toBe(stored)
  })

  it('accepts a source and sets one aside', () => {
    const aside = acceptSources(defaults, ['le-figaro'], false)
    expect(isAccepted(aside, 'le-figaro')).toBe(false)
    expect(aside.refused).toEqual(['sud-ouest', 'le-figaro'])
    expect(acceptSources(aside, ['sud-ouest'], true).refused).toEqual(['le-figaro'])
    // Setting aside twice keeps one entry.
    expect(acceptSources(aside, ['le-figaro'], false).refused).toEqual(['sud-ouest', 'le-figaro'])
  })

  it('accepts or sets aside a whole family', () => {
    const regional = catalog.filter((s) => s.group === 'regional').map((s) => s.id)
    const none = acceptSources(defaults, regional, false)
    expect(regional.every((id) => !isAccepted(none, id))).toBe(true)
    expect(acceptSources(none, regional, true).refused).toEqual([])
  })

  it('keeps the sections ticked, all of them unstored, and sets the source aside when none is left', () => {
    const monde = byId('le-monde')
    expect(keptSections(monde, defaults)).toEqual(['une', 'politique', 'economie'])
    const two = keepSections(defaults, monde, ['economie', 'une'])
    expect(two.sections['le-monde']).toEqual(['une', 'economie'])
    expect(keptSections(monde, two)).toEqual(['une', 'economie'])
    expect(keepSections(two, monde, ['une', 'politique', 'economie']).sections).toEqual({})
    const none = keepSections(two, monde, [])
    expect(isAccepted(none, 'le-monde')).toBe(false)
    // Accepted again, it has all its sections back.
    expect(keptSections(monde, acceptSources(none, ['le-monde'], true))).toEqual(['une', 'politique', 'economie'])
  })

  it('gives a source a colour of the user’s, « modifié » while it isn’t Marianne’s, and takes it back with « rétablir »', () => {
    const figaro = byId('le-figaro')
    const changed = giveLean(defaults, figaro, 'centre-droit')
    expect(leanOf(figaro, changed)).toBe('centre-droit')
    expect(changed.leanings).toEqual({ 'le-figaro': 'centre-droit' })
    expect(giveLean(changed, figaro, null).leanings).toEqual({})
    // Choosing Marianne's again is no change of the user's.
    expect(giveLean(changed, figaro, 'droite').leanings).toEqual({})
    // Without a line of Marianne's, a source is « sans classement ».
    expect(leanOf(byId('franceinfo'), defaults)).toBe('aucune')
  })

  it('sums the accepted sources up by side, and lines them up from the left to the right', () => {
    expect(sidesOf(catalog, defaults)).toEqual({ left: 2, centre: 2, right: 1, none: 1 })
    const moved = giveLean(acceptSources(defaults, ['liberation'], false), byId('la-croix'), 'droite')
    expect(sidesOf(catalog, moved)).toEqual({ left: 1, centre: 1, right: 2, none: 1 })
    expect(byLean(catalog, defaults).map((s) => s.id)).toEqual(['liberation', 'le-monde', 'la-croix', 'ouest-france', 'sud-ouest', 'le-figaro', 'franceinfo'])
  })
})

describe('« qui peut les lire », with three fields', () => {
  const all: ProfileField[] = ['opinions.leaning', 'opinions.themes', 'opinions.sources']

  it('says what each service reads of what it asked for', () => {
    expect(readSummary(all, all)).toEqual({ text: 'sensibilité, thèmes et sources', on: true })
    expect(readSummary(['opinions.themes', 'opinions.sources'], ['opinions.sources', 'opinions.themes'])).toEqual({ text: 'thèmes et sources', on: true })
    expect(readSummary(all, ['opinions.sources'])).toEqual({ text: 'sources seulement', on: true })
    expect(readSummary(all, ['opinions.themes', 'opinions.sources', 'vehicles.plate'])).toEqual({ text: 'thèmes et sources seulement', on: true })
    expect(readSummary(['opinions.sources'], ['opinions.sources'])).toEqual({ text: 'sources', on: true })
    expect(readSummary(all, ['vehicles.plate'])).toEqual({ text: 'refusé', on: false })
    expect(readSummary(all, null)).toEqual({ text: 'pas encore demandé', on: false })
  })
})
