import type { SpKind } from '../../shared/public'
import { child, children, isElement, parseXml, textOf, type XmlElement, type XmlNode } from './xml'

/**
 * Service-Public "vos droits" documents (the DILA "co-marquage" dump, XML schema 3.4) turned into
 * Markdown for the assistant: fiches (F…), questions-réponses, dossiers (N…), and resources (R…)
 * such as cerfa forms, online services and simulators.
 */

export interface SpDocument {
  id: string
  kind: SpKind
  title: string
  description: string
  theme: string
  url: string
  /** Last significant change, YYYY-MM-DD. */
  updated: string
  body: string
}

const BASE = 'https://www.service-public.gouv.fr/particuliers/vosdroits'

const KINDS: Array<[RegExp, SpKind]> = [
  [/^fiche d'information/i, 'sheet'],
  [/^fiche question-réponse/i, 'question'],
  [/^(dossier|thème|sous-thème|comment faire si)/i, 'topic'],
  [/^formulaire/i, 'form'],
  [/^téléservice/i, 'online-service'],
  [/^simulateur/i, 'simulator'],
  [/^modèle de document/i, 'template'],
  [/^outil de recherche/i, 'search-tool'],
  [/^définition/i, 'definition']
]

export function kindOf(type: string): SpKind {
  return KINDS.find(([re]) => re.test(type))?.[1] ?? 'other'
}

/** Only these files are documents; the rest of the dump is navigation (menus, home page…). */
export const isDocumentFile = (name: string) => /^[FNR]\d+\.xml$/.test(name)

/** Metadata and navigation that don't belong in the text. */
const SKIP = new Set([
  'SurTitre',
  'Audience',
  'Canal',
  'FilDAriane',
  'Theme',
  'SousThemePere',
  'DossierPere',
  'SousDossierPere',
  'Credits',
  'Image',
  'Source',
  'Abreviation',
  'Partenaire',
  'NoticeLiee',
  'InformationComplementaire',
  'ServiceEnLigneAnnexe'
])

const NOTES: Record<string, string> = { ANoter: 'À noter', ASavoir: 'À savoir', Attention: 'Attention', Rappel: 'Rappel', Exemple: 'Exemple' }

interface Context {
  services: string[]
  references: string[]
  more: string[]
  seeAlso: string[]
}

const link = (text: string, url?: string) => (url ? `[${text || url}](${url})` : text)

function inline(nodes: XmlNode[]): string {
  return nodes
    .map((n) => {
      if (!isElement(n)) return n.replace(/\s+/g, ' ')
      const text = inline(n.children)
      switch (n.tag) {
        case 'MiseEnEvidence':
          return text.trim() ? `**${text.trim()}**` : ''
        case 'Expression':
          return text.trim() ? `*${text.trim()}*` : ''
        case 'Exposant':
          return text
        case 'LienExterne':
          return link(text.trim(), n.attrs.URL)
        case 'LienInterne':
          // Links to other fiches are worth following; glossary/acronym links are not.
          return /^[FN]\d+$/.test(n.attrs.LienPublication ?? '') ? link(text.trim(), `${BASE}/${n.attrs.LienPublication}`) : text
        default:
          return text
      }
    })
    .join('')
}

function heading(level: number, text: string): string {
  return `${'#'.repeat(Math.min(6, level))} ${text}`
}

function title(el: XmlElement): string {
  return textOf(child(el, 'Titre'))
}

function table(el: XmlElement): string {
  const rows = children(el, 'Rangée').length ? children(el, 'Rangée') : children(el, 'Rang')
  if (!rows.length) return ''
  const cells = rows.map((r) => children(r, 'Cellule').map((c) => textOf(c).replace(/\|/g, '/')))
  const width = Math.max(...cells.map((r) => r.length))
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`
  const out = [line(cells[0]), `|${' --- |'.repeat(width)}`, ...cells.slice(1).map(line)]
  const caption = title(el)
  return (caption ? `**${caption}**\n\n` : '') + out.join('\n')
}

function list(el: XmlElement, ctx: Context, level: number): string {
  const numbered = el.attrs.type === 'numero'
  return children(el, 'Item')
    .map((item, i) => {
      const body = blocks(item.children, ctx, level).trim().replace(/\n\n+/g, '\n').replace(/\n/g, '\n  ')
      return `${numbered ? `${i + 1}.` : '-'} ${body}`
    })
    .join('\n')
}

/** Render block-level children; `level` is the heading level for the next section title. */
function blocks(nodes: XmlNode[], ctx: Context, level: number): string {
  const out: string[] = []
  for (const n of nodes) {
    if (!isElement(n)) {
      if (n.trim()) out.push(n.trim())
      continue
    }
    if (SKIP.has(n.tag) || n.tag.startsWith('dc:')) continue
    switch (n.tag) {
      case 'Paragraphe':
        out.push(inline(n.children).trim())
        break
      case 'Titre':
        // Section titles are rendered by their parent.
        break
      case 'Liste':
        out.push(list(n, ctx, level + 1))
        break
      case 'Tableau':
        out.push(table(n))
        break
      case 'Situation':
      case 'Chapitre':
      case 'SousChapitre':
      case 'Cas':
      case 'SousDossier': {
        const t = title(n)
        if (t) out.push(heading(level, t))
        out.push(blocks(n.children, ctx, level + 1))
        break
      }
      case 'ANoter':
      case 'ASavoir':
      case 'Attention':
      case 'Rappel':
      case 'Exemple': {
        const body = blocks(n.children, ctx, level + 1).trim()
        const t = title(n)
        const label = t && t.toLowerCase() !== NOTES[n.tag].toLowerCase() ? `${NOTES[n.tag]} : ${t}` : NOTES[n.tag]
        if (body) out.push(`> **${label}**\n> ${body.replace(/\n/g, '\n> ')}`)
        break
      }
      case 'Fiche':
      case 'Dossier':
      case 'QuestionReponse': {
        const t = title(n) || textOf(n)
        if (t && n.attrs.ID) out.push(`- ${link(t, `${BASE}/${n.attrs.ID}`)} (${n.attrs.ID})`)
        break
      }
      case 'OuSAdresser':
      case 'QuiPeutMAider': {
        const url = child(n, 'RessourceWeb')?.attrs.URL
        const label = n.tag === 'OuSAdresser' ? 'Où s’adresser' : 'Qui peut m’aider'
        const t = title(n)
        const body = blocks(
          n.children.filter((c) => !isElement(c) || c.tag !== 'RessourceWeb'),
          ctx,
          level + 1
        ).trim()
        if (t) out.push(`**${label} :** ${link(t, url)}${body ? `\n\n${body}` : ''}`)
        break
      }
      case 'ServiceEnLigne': {
        const t = title(n) || textOf(n)
        const cerfa = textOf(child(n, 'NumeroCerfa'))
        const line = `${link(t, n.attrs.URL)} · ${(n.attrs.type ?? 'service').toLowerCase()}${cerfa ? ` · cerfa n° ${cerfa}` : ''}${n.attrs.ID ? ` (${n.attrs.ID})` : ''}`
        // Shown where the text mentions it ("utilisez le téléservice suivant :") and listed again at the end.
        if (t) {
          out.push(`→ ${line}`)
          ctx.services.push(`- ${line}`)
        }
        break
      }
      case 'Reference': {
        const t = title(n) || textOf(n)
        if (t) ctx.references.push(`- ${link(t, n.attrs.URL)}`)
        break
      }
      case 'PourEnSavoirPlus': {
        const t = title(n) || textOf(n)
        if (t) ctx.more.push(`- ${link(t, n.attrs.URL)}`)
        break
      }
      case 'VoirAussi':
        for (const d of n.children.filter(isElement)) {
          const t = title(d) || textOf(d)
          if (t && d.attrs.ID) ctx.seeAlso.push(`- ${link(t, `${BASE}/${d.attrs.ID}`)} (${d.attrs.ID})`)
        }
        break
      case 'Video': {
        const t = title(n)
        if (n.attrs.URL) out.push(`Vidéo : ${link(t || 'voir la vidéo', n.attrs.URL)}`)
        break
      }
      case 'LienWeb':
        if (n.attrs.URL) out.push(`Accéder au document : ${link(title(n) || n.attrs.URL, n.attrs.URL)}${n.attrs.poids ? ` (${n.attrs.poids})` : ''}`)
        break
      case 'NumeroCerfa':
        out.push(`Cerfa n° ${textOf(n)}`)
        break
      case 'PivotLocal':
        out.push(`Service local compétent : ${textOf(n)} (voir l’annuaire de l’administration)`)
        break
      case 'Definition':
        out.push(blocks(n.children, ctx, level))
        break
      default:
        // Containers (Texte, Introduction, ListeSituations, BlocCas, Complement…): render their content.
        out.push(blocks(n.children, ctx, level))
    }
  }
  return out.filter((s) => s.trim()).join('\n\n')
}

function section(name: string, lines: string[]): string {
  const unique = [...new Set(lines)]
  return unique.length ? `## ${name}\n\n${unique.join('\n')}` : ''
}

/** Convert one document of the dump; null for files that aren't documents. */
export function parseSpDocument(xml: string): SpDocument | null {
  const root = parseXml(xml)
  const id = root.attrs.ID
  if (!id || !/^[FNR]\d+$/.test(id)) return null
  const meta = (tag: string) => textOf(child(root, tag))
  const type = root.attrs.type ?? meta('dc:type')
  const ctx: Context = { services: [], references: [], more: [], seeAlso: [] }
  const body = [
    blocks(root.children, ctx, 2),
    section('Services en ligne et formulaires', ctx.services),
    section('Textes de référence', ctx.references),
    section('Pour en savoir plus', ctx.more),
    section('Voir aussi', ctx.seeAlso)
  ]
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    // Consecutive list items rendered as separate blocks form one list.
    .replace(/^([-→] .+)\n\n(?=[-→] )/gm, '$1\n')
    .trim()
  const date = root.attrs.dateDerniereModificationImportante ?? meta('dc:date').replace(/^modified\s*/, '')
  return {
    id,
    kind: kindOf(type),
    title: meta('dc:title'),
    description: meta('dc:description'),
    theme: meta('dc:subject') || textOf(child(child(root, 'Theme') ?? root, 'Titre')),
    url: root.attrs.spUrl || `${BASE}/${id}`,
    updated: date.slice(0, 10),
    body
  }
}
