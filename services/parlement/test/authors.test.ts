import { describe, expect, it } from 'vitest'
import { ballotAuthor, ballotKind, MemberNames, parseMention } from '../src/authors'

const NAMES = new MemberNames([
  { id: 'PA793980', groupId: 'EcoS', civility: 'M.', firstName: 'Charles', lastName: 'Fournier' },
  { id: 'PA1', groupId: 'LIOT', civility: 'M.', firstName: 'Charles', lastName: 'de Courson' },
  { id: 'PA2', groupId: 'SOC', civility: 'Mme', firstName: 'Christine', lastName: 'Pires Beaune' },
  { id: 'PA3', groupId: 'RN', civility: 'M.', firstName: 'Jean-Philippe', lastName: 'Tanguy' },
  // Namesakes: the subject then gives the first name.
  { id: 'PA4', groupId: 'EPR', civility: 'M.', firstName: 'Paul', lastName: 'Martin' },
  { id: 'PA5', groupId: 'DR', civility: 'M.', firstName: 'Jean', lastName: 'Martin' },
  { id: '21089R', groupId: 'SOC', civility: 'Mme', firstName: 'Colombe', lastName: 'Brossel' },
  { id: '19595P', groupId: 'GEST', civility: 'M.', firstName: 'Bernard', lastName: 'Jomier' },
  { id: 'PA6', groupId: 'LFI-NFP', civility: 'M.', firstName: 'Hadrien', lastName: 'Coulomme' },
  { id: 'PA7', groupId: 'EcoS', civility: 'M.', firstName: 'Aurélien', lastName: 'Taché' },
  { id: 'PA8', groupId: 'DR', civility: 'M.', firstName: 'Marc', lastName: 'Le Fur' },
  { id: 'PA9', groupId: 'RN', civility: 'M.', firstName: 'Julien', lastName: 'Chenu' }
])

const author = (chamber: 'an' | 'se', title: string) => {
  const { author, group } = ballotAuthor(parseMention(chamber, title), NAMES)
  return { author, group }
}

describe('what a ballot is about', () => {
  it('tells amendments, articles, whole texts and motions apart, as both chambers word them', () => {
    expect(ballotKind("l'amendement n° 1274 de M. Fournier après l'article 15")).toBe('amendment')
    expect(ballotKind('le sous-amendement n° 48 de M. Tanguy à l’amendement n° 22')).toBe('amendment')
    expect(ballotKind('sur les amendements identiques n° 1 rectifié quinquies, présenté par Mme Billon')).toBe('amendment')
    expect(ballotKind("l'article 4 du projet de loi de finances pour 2027")).toBe('article')
    expect(ballotKind("l'ensemble du projet de loi de finances pour 2027 (première lecture)")).toBe('text')
    expect(ballotKind("sur l'ensemble du projet de loi relatif à la protection des enfants")).toBe('text')
    expect(ballotKind('la motion de rejet préalable déposée par M. X')).toBe('motion')
    expect(ballotKind('la déclaration du Gouvernement')).toBe('other')
  })
})

describe('who tabled an amendment', () => {
  it('finds the Assemblée’s author by civility and surname, wherever the sentence goes on', () => {
    expect(author('an', "l'amendement n° 1022 de M. Fournier après l'article 15 (examen prioritaire) du projet de loi de finances")).toEqual({
      author: 'PA793980',
      group: 'EcoS'
    })
    expect(author('an', "l'amendement n° 22 de M. de Courson à l'article 2")).toEqual({ author: 'PA1', group: 'LIOT' })
    // Hyphens and a missing space after the civility, as some subjects write them.
    expect(author('an', "l'amendement n° 1602 de Mme Pirès-Beaune après l'article 3")).toEqual({ author: 'PA2', group: 'SOC' })
    expect(author('an', "l'amendement n° 3779 de M.Fournier à l'article 2")).toEqual({ author: 'PA793980', group: 'EcoS' })
    // A rectification in brackets, identical amendments after: the first author.
    expect(parseMention('an', "l'amendement n° 2133 (2ème rect.) de M. Fournier et l'amendement identique suivant après l'article 15")).toMatchObject({
      amendment: '2133 2eme rect.',
      author: { type: 'member', name: 'm. fournier' }
    })
    // A sub-amendment: its own author, not the amendment's.
    expect(author('an', "le sous-amendement n° 48 de M. Jean-Philippe Tanguy à l'amendement n° 22 de M. de Courson")).toEqual({ author: 'PA3', group: 'RN' })
  })

  it('asks for the first name between namesakes', () => {
    expect(author('an', "l'amendement n° 7 de M. Martin après l'article 1er")).toEqual({ author: '', group: '' })
    expect(author('an', "l'amendement n° 7 de M. Paul Martin après l'article 1er")).toEqual({ author: 'PA4', group: 'EPR' })
  })

  it('knows the Government’s and the committees’ amendments', () => {
    expect(author('an', "l'amendement n° 851 du Gouvernement à l'article 6")).toEqual({ author: 'GOUV', group: 'GOUV' })
    expect(author('an', "l'amendement n° 859 de la commission des affaires économiques après l'article 3")).toEqual({ author: 'COM', group: 'COM' })
    expect(author('se', "sur l'amendement n° 12, présenté par le Gouvernement, à l'article 2")).toEqual({ author: 'GOUV', group: 'GOUV' })
  })

  it('finds the Sénat’s author by full name: presented, taken up, or the first of several', () => {
    expect(author('se', "sur l'amendement n° 5, présenté par M. Bernard Jomier et plusieurs de ses collègues, à l'article 1er")).toEqual({
      author: '19595P',
      group: 'GEST'
    })
    expect(author('se', "sur l'amendement n° 304 rectifié quater, repris par Mme Colombe Brossel, à l'article 5 quater")).toEqual({
      author: '21089R',
      group: 'SOC'
    })
    expect(
      author('se', "sur l'amendement n° A-1, présenté en seconde délibération par MM. Bernard Jomier et David Margueritte au nom de la commission des lois")
    ).toEqual({
      author: '19595P',
      group: 'GEST'
    })
    expect(parseMention('se', "sur l'amendement n° 304 rectifié quater, repris par Mme Colombe Brossel").amendment).toBe('304 rectifie quater')
  })

  it('says nothing of an article or a whole text', () => {
    expect(parseMention('an', "l'article 4 du projet de loi")).toEqual({ kind: 'article', amendment: '', author: null })
    expect(author('an', "l'ensemble du projet de loi")).toEqual({ author: '', group: '' })
  })
})

describe('the author, and only the one of the amendment voted on', () => {
  it('reads a deputy’s sub-amendment to an amendment of the Government as the deputy’s', () => {
    expect(author('an', 'le sous-amendement n° 45 de M. Coulomme à l’amendement n° 39 du Gouvernement après l’article 5')).toEqual({
      author: 'PA6',
      group: 'LFI-NFP'
    })
  })

  it('doesn’t take "du gouvernement" further in the subject for the author', () => {
    expect(author('an', 'l’amendement n° 12 de M. Chenu à l’article 2 du projet de loi relatif à l’accord avec le gouvernement géorgien')).toEqual({
      author: 'PA9',
      group: 'RN'
    })
    expect(author('an', 'l’amendement n° 851 du Gouvernement après l’article 3')).toEqual({ author: 'GOUV', group: 'GOUV' })
  })

  it('reads amendments of deletion, of restoration, of overall rewording', () => {
    expect(parseMention('an', 'l’amendement de suppression n° 444 de M. Le Fur à l’article 7').amendment).toBe('444')
    expect(author('an', 'l’amendement de suppression n° 444 de M. Le Fur à l’article 7')).toEqual({ author: 'PA8', group: 'DR' })
    expect(author('an', 'l’amendement de rédaction globale n° 9 de la commission des finances à l’article 1er')).toEqual({ author: 'COM', group: 'COM' })
  })

  it('ends a name only on whole words', () => {
    expect(author('an', 'l’amendement n° 77 de M. Aurélien Taché après l’article 4')).toEqual({ author: 'PA7', group: 'EcoS' })
  })
})

describe('a member who left office', () => {
  it('is named as the ballot was indexed', () => {
    expect(ballotAuthor(parseMention('an', 'l’amendement n° 77 de M. Aurélien Taché après l’article 4'), NAMES).name).toBe('M. Aurélien Taché')
  })
})
