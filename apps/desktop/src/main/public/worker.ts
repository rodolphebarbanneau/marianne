import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { openPublicDb } from './db'
import { isDocumentFile, parseSpDocument } from './service-public'

/**
 * Index worker, run as an Electron utility process: unzips a downloaded dump, parses it and
 * rebuilds its tables in one transaction, away from the main process (a full rebuild parses
 * ~5 500 XML documents). A utility process loads modules from the asar archive.
 */

export interface IndexJob {
  source: 'service-public'
  db: string
  /** Downloaded zip files, by dump name. */
  files: Record<string, string>
}

export type WorkerMessage = { type: 'progress'; done: number; total: number } | { type: 'done'; count: number } | { type: 'error'; message: string }

const post = (m: WorkerMessage) => process.parentPort.postMessage(m)
const basename = (name: string) => name.slice(name.lastIndexOf('/') + 1)

function unzip(file: string, keep: (name: string) => boolean): Array<[string, string]> {
  const entries = unzipSync(readFileSync(file), { filter: (f) => keep(f.name) })
  return Object.entries(entries).map(([name, data]) => [name, strFromU8(data)])
}

function progress(): (done: number, total: number) => void {
  let last = 0
  return (done, total) => {
    const now = Date.now()
    if (now - last > 200 || done === total) {
      last = now
      post({ type: 'progress', done, total })
    }
  }
}

function indexServicePublic(job: IndexJob): number {
  const files = unzip(job.files.documents, (name) => isDocumentFile(basename(name)))
  if (files.length < 1000) throw new Error(`Archive incomplète (${files.length} documents)`)
  const db = openPublicDb(job.db)
  const insert = db.prepare('insert or replace into sp_documents (id, kind, title, description, theme, url, updated, body) values (?, ?, ?, ?, ?, ?, ?, ?)')
  const report = progress()
  let count = 0
  db.exec('begin')
  try {
    db.exec('delete from sp_documents')
    files.forEach(([, xml], i) => {
      const doc = parseSpDocument(xml)
      if (doc) {
        insert.run(doc.id, doc.kind, doc.title, doc.description, doc.theme, doc.url, doc.updated, doc.body)
        count++
      }
      report(i + 1, files.length)
    })
    db.exec("insert into sp_fts (sp_fts) values ('rebuild')")
    db.exec('commit')
  } catch (err) {
    db.exec('rollback')
    throw err
  } finally {
    db.close()
  }
  return count
}

process.parentPort.on('message', (e) => {
  try {
    const job = e.data as IndexJob
    const count = indexServicePublic(job)
    post({ type: 'done', count })
  } catch (err) {
    post({ type: 'error', message: (err as Error).message ?? String(err) })
  }
  // The main process ends this process once it has the result.
})
