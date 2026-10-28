import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { today, type DocumentMeta, type DocumentType } from '../../shared/profile'
import type { DomainId } from '../../shared/types'
import { session } from '../archive/session'
import { log } from '../log'
import { paths } from '../paths'
import { profile } from './store'
import { redact } from './tokens'

/**
 * Documents (tax notices, certificates, payslips…): files of the account archive, sealed like the
 * rest, with a DocumentMeta each. Decrypted only to open, export, or read as text; the text of
 * a PDF is extracted once and kept as a 'doctext' record.
 */

const MAX_BYTES = 50 * 1024 * 1024
const TEXT_KIND = 'doctext'
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

/** A first guess of the type from the file name; the user corrects it on the page. */
const TYPES: Array<[RegExp, DocumentType]> = [
  [/avis.*(impo|impot|taxe)|imposition|taxe.?foncier|taxe.?habitation/, 'tax_notice'],
  [/bulletin|fiche.?de.?paie|salaire/, 'payslip'],
  [/attestation|certificat/, 'certificate'],
  [/releve/, 'statement'],
  [/contrat|bail/, 'contract'],
  [/courrier|lettre|notification|mise.?en.?demeure/, 'letter'],
  [/justificatif|facture|quittance/, 'proof']
]
export const guessType = (name: string): DocumentType => {
  const plain = name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  return TYPES.find(([re]) => re.test(plain))?.[1] ?? 'other'
}

/** A file on disk, or bytes with their name (a drop, an attachment). */
export type DocumentSource = string | { name: string; data: Uint8Array }
export type DocumentPatch = Partial<Pick<DocumentMeta, 'title' | 'domain' | 'type' | 'date' | 'entity' | 'folderId'>>

const isText = (mime: string) => mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml'

/** The text layer of a PDF; null for a scan. */
async function pdfText(bytes: Uint8Array): Promise<string | null> {
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
  return text.length > 20 ? text : null
}

/** Emits 'change' when documents are added, edited or deleted. */
class DocumentStore extends EventEmitter {
  /** In the order they were added. */
  list(): DocumentMeta[] {
    // Other files of the archive have prefixed ids (the engines' transcripts: "transcript:…").
    return session.archive
      .listFiles<DocumentMeta>()
      .filter((f) => !f.id.includes(':'))
      .map((f) => f.meta)
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
  }

  get(id: string): DocumentMeta | null {
    return session.archive.fileMeta<DocumentMeta>(id)?.meta ?? null
  }

  /** Seal a file into the archive. Throws ArchiveFullError past the archive's capacity. */
  async add(source: DocumentSource, options: { domain: DomainId; folderId?: string; entity?: string }): Promise<DocumentMeta> {
    // The archive of now: the session may lock or switch while the file is read.
    const archive = session.archive
    const name = typeof source === 'string' ? basename(source) : source.name
    const tooBig = () => new Error(`${name} dépasse 50 Mo.`)
    if (typeof source === 'string' && (await stat(source)).size > MAX_BYTES) throw tooBig()
    const data = typeof source === 'string' ? await readFile(source) : source.data
    if (data.byteLength > MAX_BYTES) throw tooBig()
    const meta: DocumentMeta = {
      id: randomUUID(),
      domain: options.domain,
      title: name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
      type: guessType(name),
      date: today(),
      entity: options.entity ?? '',
      fileName: name,
      mime: MIME[extname(name).toLowerCase()] ?? 'application/octet-stream',
      size: data.byteLength,
      ...(options.folderId ? { folderId: options.folderId } : {}),
      addedAt: new Date().toISOString()
    }
    archive.writeFile(meta.id, data, meta)
    this.emit('change')
    return meta
  }

  update(id: string, patch: DocumentPatch): DocumentMeta {
    const meta = this.get(id)
    if (!meta) throw new Error('Document inconnu')
    const trimmed = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]))
    const next = { ...meta, ...trimmed, id }
    session.archive.updateFileMeta(id, next)
    this.emit('change')
    return next
  }

  bytes(id: string): Buffer {
    return session.archive.readFile(id)
  }

  /** A decrypted copy in the temporary folder (emptied at each start), to open with the system. */
  async decryptedCopy(id: string): Promise<string> {
    const meta = this.get(id)
    if (!meta) throw new Error('Document inconnu')
    const out = join(paths.tmp, `${id.slice(0, 8)}-${meta.fileName.replace(/[^\w.\- ()àâäéèêëîïôöùûüç]/gi, '_')}`)
    await writeFile(out, this.bytes(id), { mode: 0o600 })
    // Long enough for the viewer to open it; the rest of tmp is emptied at quit and at launch.
    setTimeout(() => void rm(out, { force: true }).catch(() => undefined), 10 * 60_000).unref()
    return out
  }

  remove(id: string): void {
    const archive = session.archive
    archive.remove(TEXT_KIND, id)
    archive.removeFile(id)
    this.emit('change')
  }

  /** The text as engines get it: identifiers replaced by their tokens. Null for images and scans. */
  async text(id: string): Promise<string | null> {
    const raw = await this.rawText(id)
    return raw === null ? null : redact(raw, profile.tokens())
  }

  /** The text with the real values: only for use on this computer (filling the profile from it). */
  async rawText(id: string): Promise<string | null> {
    const archive = session.archive
    const meta = archive.fileMeta<DocumentMeta>(id)?.meta
    if (!meta) throw new Error('Document inconnu')
    if (isText(meta.mime)) return archive.readFile(id).toString('utf8')
    if (meta.mime !== 'application/pdf') return null
    const cached = archive.get<{ text: string | null }>(TEXT_KIND, id)
    if (cached) return cached.text
    let text: string | null
    try {
      text = await pdfText(archive.readFile(id))
    } catch (err) {
      // Not kept: a later try may succeed.
      log.warn('PDF text extraction failed:', (err as Error).message)
      return null
    }
    archive.put(TEXT_KIND, id, { text })
    return text
  }
}

export const documents = new DocumentStore()
