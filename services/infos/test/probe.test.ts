import { it } from 'vitest'
import { rank } from '../src/model'
import { catalogue, ITEMS, readingOf } from './fixtures'
it('probe', () => {
  for (const all of [false, true]) {
    const r = rank(readingOf(ITEMS, true), catalogue(true), {
      all,
      filtered: true,
      themes: ['housing', 'ecology'],
      sections: { 'ouest-france': ['une', 'bretagne'] }
    })
    console.log(
      all,
      r.subjects.map((s) => [s.number, s.id, s.words.join('·'), s.told, s.aside, s.hidden.length, s.live, s.fresh, s.checks.length, s.themes]),
      r.single.map((h) => h.id),
      r.live.map((l) => [l.item.id, l.number]),
      r.accepted
    )
  }
})
