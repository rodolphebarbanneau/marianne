import { getCollection, type CollectionEntry } from 'astro:content'
import { localized, nbsp, type Lang } from '../i18n'

// The guide's pages in a language, in the order its index.md lists them ("Each folder starts at
// index.md, which lists the pages in their order": docs/guide/README.md), each with its title (the
// page's # heading) and the line the index gives it.

export interface GuidePage {
  /** install, getting-started…; '' for the index. */
  slug: string
  title: string
  /** What the index says of it, after its link: "creating your archive, the passphrase…". */
  summary: string
  href: string
  entry: CollectionEntry<'guide'>
}

const LINK = /^- \[([^\]]+)\]\(([\w-]+)\.md\)(?:\s*:\s*(.+))?$/

export async function guidePages(lang: Lang): Promise<GuidePage[]> {
  const entries = await getCollection('guide', (e) => e.id.startsWith(lang + '/'))
  const bySlug = new Map(entries.map((e) => [e.id.slice(3), e]))
  const index = bySlug.get('index')
  if (!index) throw new Error(`docs/guide/${lang}/index.md is missing`)
  const fix = lang === 'fr' ? nbsp : (s: string) => s
  const page = (slug: string, summary = ''): GuidePage => {
    const entry = bySlug.get(slug)!
    return {
      slug: slug === 'index' ? '' : slug,
      title: fix(titleOf(entry)),
      summary: fix(summary),
      href: localized(lang, `guide/${slug === 'index' ? '' : slug + '/'}`),
      entry
    }
  }
  const listed = (index.body ?? '')
    .split('\n')
    .map((line) => line.trim().match(LINK))
    .filter((m): m is RegExpMatchArray => !!m && bySlug.has(m[2]))
    .map((m) => page(m[2], m[3]?.replace(/\.$/, '') ?? ''))
  // A page the index forgets still gets published, at the end.
  const rest = [...bySlug.keys()].filter((s) => s !== 'index' && !listed.some((p) => p.slug === s)).map((s) => page(s))
  return [page('index'), ...listed, ...rest]
}

export const titleOf = (entry: CollectionEntry<'guide'>) => entry.body?.match(/^#\s+(.+)$/m)?.[1].trim() ?? entry.id
