import { describe, expect, it } from 'vitest'
import { groupSubjects, isLive, ownWords, sideOf, stem, subjectWords, titleWords, similarity, withoutLive, type NewsHeadline } from '../src/news'

/** The helpers that name a subject from its titles: Marianne's grouping and the services share them. */

const item = (source: string, title: string, published: string, id = `${source}:${title}`): NewsHeadline => ({
  id,
  source,
  title,
  url: `https://${source}.fr/`,
  published
})

describe('words', () => {
  it('compares the words that matter, one word whatever its ending', () => {
    expect([...titleWords('EN DIRECT – Les trains : au moins 68 morts')]).toEqual(['train', '68', 'mort'])
    expect(stem('adopte')).toBe(stem('adoptees'))
    expect([...titleWords('adopté')]).toEqual([...titleWords('adoptées')])
    expect([...titleWords('adopte')]).toEqual([...titleWords('adopté')])
    expect(similarity(titleWords('Collision de trains en Espagne'), titleWords('Espagne : collision entre deux trains'))).toBe(1)
    expect(similarity(titleWords('Espagne : un train'), titleWords('Espagne : un autre train'))).toBe(0)
  })

  it('names a subject by the words most of its titles share, as the first wrote them', () => {
    const words = subjectWords([
      'Budget 2027 : le Sénat adopte la partie recettes',
      'Le Sénat a adopté le budget 2027 en première lecture',
      'Budget : les sénateurs ont adopté les recettes 2027'
    ])
    expect(words.label).toEqual(['budget', '2027', 'adopte'])
    expect(words.count.get(stem('senat'))).toBe(2)
    expect(subjectWords(['SNCF : grève jeudi', 'Grève à la SNCF jeudi']).label).toEqual(['SNCF', 'grève', 'jeudi'])
  })

  it('marks what a title alone says: two words at most, no small talk, no short word', () => {
    const titles = [
      'Budget 2027 : le Sénat adopte la partie recettes',
      'Budget 2027 : ce qu’il faut retenir du vote, pourquoi le Sénat a adopté le texte malgré la gauche et les écologistes',
      'Budget 2027 adopté au Sénat'
    ]
    const words = subjectWords(titles)
    expect(ownWords(titles[0], words)).toEqual(['recettes', 'partie'])
    const own = ownWords(titles[1], words)
    expect(own).toEqual(['écologistes', 'malgré'])
    expect(ownWords(titles[1], words, 5)).not.toEqual(expect.arrayContaining(['retenir', 'pourquoi', 'faut', 'vote']))
    expect(ownWords(titles[2], words)).toEqual([])
  })

  it('knows live coverage', () => {
    expect(isLive('DIRECT. Budget 2027')).toBe(true)
    expect(isLive('EN DIRECT - Grève')).toBe(true)
    expect(isLive('en direct, la séance')).toBe(true)
    expect(isLive('Le direct de la séance')).toBe(false)
    expect(isLive('DIRECTION du Trésor')).toBe(false)
    expect(withoutLive('EN DIRECT – Grève SNCF')).toBe('Grève SNCF')
    expect(sideOf('centre-gauche')).toBe('left')
    expect(sideOf('aucune')).toBe('none')
  })
})

describe('subjects', () => {
  const TRAIN = [
    item('le-monde', 'EN DIRECT, accident entre deux trains en Espagne : au moins 68 morts, trois jours de deuil national', '2026-10-28T16:31:00Z'),
    item('rfi', 'Collision de trains en Espagne : au moins 68 morts et une centaine de blessés, un deuil national', '2026-10-28T09:58:00Z'),
    item('le-progres', 'Espagne. Terrible accident de trains : le bilan grimpe à 68 morts, trois jours de deuil national décrétés', '2026-10-28T15:13:00Z')
  ]

  it('groups the same story told by different sources, the most told first, the single titles apart', () => {
    const other = item('les-echos', 'Impôts : la France reprend son titre de championne d’Europe', '2026-10-28T16:27:00Z')
    const { subjects, single } = groupSubjects([...TRAIN, other])
    expect(subjects).toHaveLength(1)
    expect(subjects[0].items.map((i) => i.source)).toEqual(['le-monde', 'le-progres', 'rfi'])
    expect(single).toEqual([other])
  })

  it('keeps a subject’s id as it grows: its first title’s', () => {
    const before = groupSubjects(TRAIN.slice(1))
    const after = groupSubjects(TRAIN)
    expect(before.subjects[0].id).toBe(TRAIN[1].id)
    expect(after.subjects[0].id).toBe(TRAIN[1].id)
  })

  it('takes one title per source', () => {
    const title = 'Accident de trains en Espagne : 68 morts, trois jours de deuil national'
    const { subjects, single } = groupSubjects([item('le-monde', title, '2026-10-28T17:00:00Z'), item('le-monde', `${title} (suite)`, '2026-10-28T16:00:00Z')])
    expect(subjects).toEqual([])
    expect(single).toHaveLength(2)
    const mixed = groupSubjects([...TRAIN, item('rfi', `${TRAIN[1].title}, le point`, '2026-10-28T18:00:00Z')])
    expect(mixed.subjects[0].items.filter((i) => i.source === 'rfi')).toHaveLength(1)
  })

  it('ranks by sources, then by the latest title', () => {
    const strike = [
      item('a', 'Grève SNCF jeudi : TGV et TER très perturbés', '2026-10-28T18:00:00Z'),
      item('b', 'SNCF : grève jeudi, TGV et TER perturbés', '2026-10-28T17:00:00Z')
    ]
    const { subjects } = groupSubjects([...strike, ...TRAIN])
    expect(subjects.map((s) => s.items.length)).toEqual([3, 2])
    const two = groupSubjects([...strike, ...TRAIN.slice(1)])
    expect(two.subjects[0].items[0].source).toBe('a')
  })
})
