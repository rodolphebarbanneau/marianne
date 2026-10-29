/**
 * A small XML reader for the video portal's metadata files (data.nvs, finalplayer.nvs): elements,
 * attributes, text and entities, in document order. Enough for well-formed, DTD-free documents;
 * comments, processing instructions and doctypes are skipped.
 */

export interface XmlElement {
  tag: string
  attrs: Record<string, string>
  children: XmlNode[]
}
export type XmlNode = XmlElement | string

const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

/** Character and predefined entities; unknown ones are left as written. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] !== '#') return NAMED[ref] ?? whole
    const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

const ATTR = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g

/** The document's root element; throws on a document that isn't XML. */
export function parseXml(xml: string): XmlElement {
  const root: XmlElement = { tag: '#document', attrs: {}, children: [] }
  const stack: XmlElement[] = [root]
  let i = 0
  while (i < xml.length) {
    const lt = xml.indexOf('<', i)
    const text = xml.slice(i, lt < 0 ? xml.length : lt)
    if (text && stack.length > 1) stack[stack.length - 1].children.push(decodeEntities(text))
    if (lt < 0) break
    if (xml.startsWith('<!--', lt)) {
      i = end(xml, '-->', lt)
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const close = xml.indexOf(']]>', lt)
      if (close < 0) throw new Error('Unterminated CDATA section')
      stack[stack.length - 1].children.push(xml.slice(lt + 9, close))
      i = close + 3
    } else if (xml[lt + 1] === '?' || xml[lt + 1] === '!') {
      i = end(xml, '>', lt)
    } else if (xml[lt + 1] === '/') {
      const close = end(xml, '>', lt)
      const tag = xml.slice(lt + 2, close - 1).trim()
      if (stack.length < 2 || stack[stack.length - 1].tag !== tag) throw new Error(`Unexpected </${tag}>`)
      stack.pop()
      i = close
    } else {
      const close = tagEnd(xml, lt)
      const selfClosing = xml[close - 2] === '/'
      const inner = xml.slice(lt + 1, close - (selfClosing ? 2 : 1))
      const tag = inner.match(/^[^\s/>]+/)?.[0]
      if (!tag) throw new Error('Malformed tag')
      const attrs: Record<string, string> = {}
      for (const m of inner.slice(tag.length).matchAll(ATTR)) attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? '')
      const el: XmlElement = { tag, attrs, children: [] }
      stack[stack.length - 1].children.push(el)
      if (!selfClosing) stack.push(el)
      i = close
    }
  }
  if (stack.length > 1) throw new Error(`Unclosed <${stack[stack.length - 1].tag}>`)
  const element = root.children.find(isElement)
  if (!element) throw new Error('Empty XML document')
  return element
}

/** The index just past the `>` that closes the tag at `from`, skipping quoted attribute values. */
function tagEnd(xml: string, from: number): number {
  let quote = ''
  for (let i = from + 1; i < xml.length; i++) {
    const c = xml[i]
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '>') return i + 1
  }
  throw new Error('Unterminated tag')
}

/** The index just past the next `token` from `from`. */
function end(xml: string, token: string, from: number): number {
  const at = xml.indexOf(token, from)
  if (at < 0) throw new Error('Unterminated markup')
  return at + token.length
}

export const isElement = (n: XmlNode): n is XmlElement => typeof n !== 'string'

export function child(el: XmlElement, tag: string): XmlElement | undefined {
  return el.children.find((c): c is XmlElement => isElement(c) && c.tag === tag)
}

export function children(el: XmlElement, tag: string): XmlElement[] {
  return el.children.filter((c): c is XmlElement => isElement(c) && c.tag === tag)
}

/** All the text inside an element, whitespace collapsed. */
export function textOf(node: XmlNode | undefined): string {
  if (!node) return ''
  if (typeof node === 'string') return node.replace(/\s+/g, ' ')
  return node.children.map(textOf).join('').replace(/\s+/g, ' ').trim()
}
