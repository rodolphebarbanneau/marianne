import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { today, type DocumentMeta, type DomainId } from '../../shared/dossier'
import { readSealed, writeSealed } from '../crypto'
import { log } from '../log'
import { paths } from '../paths'
import { dossier } from './store'

/**
 * Documents of the personal file (tax notices, certificates, payslips…), encrypted one file each
 * in ~/.marianne/documents. Decrypted only to open, export, or read as text for the agent.
 */

const MAX_BYTES = 50 * 1024 * 1024
const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html'
}

const file = (id: string) => join(paths.documents, `${id}.bin`)

/** A first guess of the type from the file name; the user corrects it on the page. */
const TYPES: Array<[RegExp, DocumentMeta['type']]> = [
  [/avis.*(impo|impot|taxe)|imposition|taxe.?foncier|taxe.?habitation/, 'avis_impot'],
  [/bulletin|fiche.?de.?paie|salaire/, 'bulletin_paie'],
  [/attestation|certificat/, 'attestation'],
  [/releve/, 'releve'],
  [/contrat|bail/, 'contrat'],
  [/courrier|lettre|notification|mise.?en.?demeure/, 'courrier'],
  [/justificatif|facture|quittance/, 'justificatif']
]
export const guessType = (name: string): DocumentMeta['type'] => {
  const plain = name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  return TYPES.find(([re]) => re.test(plain))?.[1] ?? 'autre'
}

/** Encrypt files into the vault and add them to the file. */
export async function addDocuments(sources: string[], domain: DomainId): Promise<DocumentMeta[]> {
  const added: DocumentMeta[] = []
  for (const src of sources) {
    const { size } = await stat(src)
    if (size > MAX_BYTES) throw new Error(`${basename(src)} dépasse 50 Mo.`)
    const id = randomUUID()
    writeSealed(file(id), await readFile(src))
    const name = basename(src)
    const meta: DocumentMeta = {
      id,
      domain,
      title: name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
      type: guessType(name),
      date: today(),
      fileName: name,
      mime: MIME[extname(name).toLowerCase()] ?? 'application/octet-stream',
      size,
      addedAt: new Date().toISOString()
    }
    dossier.addDocument(meta)
    added.push(meta)
  }
  return added
}

export function documentBytes(id: string): Buffer {
  if (!dossier.get().documents.some((x) => x.id === id)) throw new Error('Document inconnu')
  return readSealed(file(id))
}

/** A decrypted copy in the temporary folder (emptied at each start), to open with the system. */
export async function decryptedCopy(id: string): Promise<string> {
  const meta = dossier.get().documents.find((x) => x.id === id)
  if (!meta) throw new Error('Document inconnu')
  const out = join(paths.tmp, `${id.slice(0, 8)}-${meta.fileName.replace(/[^\w.\- ()àâäéèêëîïôöùûüç]/gi, '_')}`)
  await writeFile(out, documentBytes(id), { mode: 0o600 })
  // Long enough for the viewer to open it; the rest of tmp is emptied at quit and at launch.
  setTimeout(() => void rm(out, { force: true }).catch(() => undefined), 10 * 60_000).unref()
  return out
}

export async function deleteDocument(id: string): Promise<void> {
  if (existsSync(file(id))) await rm(file(id), { force: true })
  dossier.removeDocument(id)
}

/** The text of a document, for the agent: PDFs with a text layer and text files; null for images. */
export async function documentText(id: string): Promise<string | null> {
  const meta = dossier.get().documents.find((x) => x.id === id)
  if (!meta) throw new Error('Document inconnu')
  const bytes = documentBytes(id)
  if (meta.mime.startsWith('text/') || meta.mime === 'application/json' || meta.mime === 'application/xml') return bytes.toString('utf8')
  if (meta.mime !== 'application/pdf') return null
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false })
    const doc = await task.promise
    const pages: string[] = []
    for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      // Items carry their own line breaks (hasEOL); join the rest with spaces.
      pages.push(content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join(''))
    }
    await task.destroy()
    const text = pages
      .join('\n\n— page suivante —\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim()
    // A scan has no text layer.
    return text.length > 20 ? text : null
  } catch (err) {
    log.warn('PDF text extraction failed:', (err as Error).message)
    return null
  }
}
