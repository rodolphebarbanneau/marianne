/**
 * Text out of the HTML feeds and pages hold: entities decoded, tags dropped, cut where a reader
 * would stop. No DOM: what is read here is a feed's summary or an article's first paragraphs.
 */

const SUMMARY_MAX = 200

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  agrave: 'à',
  acirc: 'â',
  ccedil: 'ç',
  ocirc: 'ô',
  ucirc: 'û',
  ugrave: 'ù',
  icirc: 'î',
  iuml: 'ï',
  euml: 'ë',
  oelig: 'œ',
  Eacute: 'É'
}

/** Entities left over by double-encoding feeds ("&amp;#039;"), and those pages write. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m
  })
}

/** Plain text of some HTML: no scripts, no tags, entities decoded, spaces folded. */
export function htmlText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&lt;[\s\S]*?&gt;/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/** Plain text from a feed's HTML, cut on a word to `max` characters. */
export function plainText(html: string, max = SUMMARY_MAX): string {
  const t = htmlText(html)
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  return `${cut.slice(0, cut.lastIndexOf(' ') > max / 2 ? cut.lastIndexOf(' ') : cut.length).replace(/[\s,;:.–-]+$/, '')}…`
}

/**
 * Text cut at the end of a sentence, `max` characters at most. A first sentence already longer is
 * cut on a word, with an ellipsis: the start of an article is never a sentence's middle otherwise.
 */
export function cutAtSentence(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  let end = 0
  // Not after an initial or a title: « M. Dupont », « J. Martin » go on.
  for (const m of t.slice(0, max + 1).matchAll(/(?<!(?:^|[\s(«“])(?:\p{Lu}|Mme|Mmes|MM|Dr|Me|Pr|St|Ste))[.!?…](?:\s*[»”"’)])?(?=\s|$)/gu))
    end = m.index + m[0].length
  if (end >= 40) return t.slice(0, end).trim()
  return plainText(t, max)
}
