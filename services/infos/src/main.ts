import { cached, defineService, type ServiceContext, type ServiceNews } from '@marianne/sdk/main'
import { rank, sameSubject, wordsOf } from './model'
import { infosTile } from './tile'
import { addDays, parisDay } from './time'
import type { DayBefore, InfosMethods, Reading } from './types'

/**
 * 3615 INFOS: the headlines of the user's news sources, grouped into subjects, ranked by how many
 * sources tell them. It reaches no site: Marianne reads the feeds for it (ctx.news), and keeps their
 * history. It keeps only the last visit (for what is new) and the kiosk as the user arranged it.
 */

/** The days before a subject is looked for in: Marianne keeps a week of titles. */
const DAYS_BACK = 6

/** What Marianne's move to INFOS left in its storage, once: the feeds the user had added by hand were dropped. */
const CUSTOM_FEEDS_DROPPED = 'Vos flux ajoutés à la main ne sont plus lus : la liste est celle de Marianne.'

type Context = Pick<ServiceContext, 'profile' | 'storage'> & { news: ServiceNews }

/**
 * The last 24 hours, ranked for the user. With their sources granted, the set-aside ones are always
 * read too: a subject counts them (« et 2 sources écartées »), and « toutes » shows them.
 */
export async function readingOf(ctx: Context, all: boolean): Promise<Reading> {
  const filtered = ctx.news.filtered()
  const [raw, catalogue] = await Promise.all([ctx.news.read({ all: filtered }), ctx.news.sources({ all: filtered })])
  return rank(raw, catalogue, { all: all || !filtered, filtered, themes: ctx.profile.themes(), sections: ctx.profile.sources()?.sections ?? null })
}

/** The same subject on each of the days before today: its latest title then, and how many sources told it. */
async function daysBefore(ctx: Context, id: string, all: boolean): Promise<DayBefore[]> {
  const filtered = ctx.news.filtered()
  const today = await ctx.news.read({ all: filtered })
  const subject = today.subjects.find((s) => s.id === id)
  if (!subject) return []
  const words = wordsOf(subject.items)
  const shows = (setAside?: boolean) => all || !filtered || !setAside
  const days = await Promise.all(
    Array.from({ length: DAYS_BACK }, async (_, i): Promise<DayBefore | null> => {
      const day = addDays(parisDay(), -(DAYS_BACK - i))
      const reading = await ctx.news.read({ day, all: filtered })
      const same = sameSubject(
        words,
        reading.subjects.map((s) => ({ ...s, items: s.items.filter((h) => shows(h.setAside)) })).filter((s) => s.items.length > 1)
      )
      return same ? { day, title: same.items[0].title, sources: new Set(same.items.map((h) => h.source)).size } : null
    })
  )
  return days.filter((d): d is DayBefore => d !== null)
}

export const service = defineService<InfosMethods>({
  // Marianne reads the feeds for a tile every 15 minutes: the first subject changes as the day goes.
  tile: { everyMinutes: 15 },

  activate(base) {
    if (!base.news) throw new Error('3615 INFOS lit les titres par Marianne : son manifeste déclare "news"')
    const ctx: Context = { profile: base.profile, storage: base.storage, news: base.news }
    // A subject's days before are six days of titles grouped again: kept a minute, then given at once
    // for ten more while they are read again (a pane opened again, the same subject on another tab).
    const days = cached((id: string, all: boolean) => daysBefore(ctx, id, all), {
      ttlMs: 60_000,
      staleMs: 10 * 60_000,
      key: (id, all) => `${parisDay()} ${id} ${all}`
    })
    return {
      methods: {
        reading: ({ all }) => readingOf(ctx, all),
        search: (words, { all }) => ctx.news.search(words, { all: all && ctx.news.filtered() }),
        article: (id) => ctx.news.article(id),
        days: (id, { all }) => days(id, all),
        // Read when INFOS opens, kept when the user leaves: what came during the visit stays new until then.
        visit: () => ctx.storage.get<string>('lastVisit'),
        leave() {
          ctx.storage.set('lastVisit', new Date().toISOString())
        },
        notice: () => (ctx.storage.get<{ customFeedsDropped?: boolean }>('notice')?.customFeedsDropped ? CUSTOM_FEEDS_DROPPED : null),
        // Gone once the screen has shown it: asked for and lost on the way (a screen closed at once), it comes again.
        noticeSeen() {
          ctx.storage.remove('notice')
        }
      },
      tools: [],
      tile: async () => infosTile(await readingOf(ctx, false))
    }
  }
})
