import { XMLParser } from 'fast-xml-parser'

/** A minimal ordered XML tree: the documents mix text and inline tags, so order matters. */
export interface XmlElement {
  tag: string
  attrs: Record<string, string>
  children: XmlNode[]
}
export type XmlNode = XmlElement | string

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
  htmlEntities: true
})

type Raw = Record<string, unknown>

function convert(raw: Raw[]): XmlNode[] {
  const out: XmlNode[] = []
  for (const item of raw) {
    for (const [key, value] of Object.entries(item)) {
      if (key === ':@') continue
      if (key === '#text') out.push(String(value))
      else if (!key.startsWith('?')) {
        const attrs = (item[':@'] as Record<string, string> | undefined) ?? {}
        out.push({ tag: key, attrs, children: convert((value as Raw[]) ?? []) })
      }
    }
  }
  return out
}

/** The document's root element. */
export function parseXml(xml: string): XmlElement {
  const root = convert(parser.parse(xml) as Raw[]).find((n): n is XmlElement => typeof n !== 'string')
  if (!root) throw new Error('Empty XML document')
  return root
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
