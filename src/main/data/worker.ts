import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { actorNumber, fold, parseActeur, parseOrgane, parseScrutin, POSITION_CODES } from './assemblee'
import { openIndex } from './db'
import { isDocumentFile, parseSpDocument } from './service-public'

/**
 * Index worker, run as an Electron utility process: unzips a downloaded dump, parses it and
 * rebuilds its tables in one transaction, away from the main process (a full Service-Public
 * rebuild parses ~5 500 XML documents). A utility process loads modules from the asar archive.
 */

export interface IndexJob {
  source: 'service-public' | 'assemblee'
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
  const files = unzip(job.files.vosdroits, (name) => isDocumentFile(basename(name)))
  if (files.length < 1000) throw new Error(`Archive incomplète (${files.length} documents)`)
  const db = openIndex(job.db)
  const insert = db.prepare('insert or replace into sp_docs (id, kind, title, description, theme, url, updated, body) values (?, ?, ?, ?, ?, ?, ?, ?)')
  const report = progress()
  let count = 0
  db.exec('begin')
  try {
    db.exec('delete from sp_docs')
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

function indexAssemblee(job: IndexJob): number {
  const json = (name: string) => name.endsWith('.json')
  const amo = unzip(job.files.deputes, json)
  const scrutins = unzip(job.files.scrutins, json)
  const db = openIndex(job.db)
  const report = progress()
  const total = amo.length + scrutins.length
  let done = 0
  let count = 0
  db.exec('begin')
  try {
    for (const table of ['an_organes', 'an_deputes', 'an_scrutins', 'an_votes']) db.exec(`delete from ${table}`)
    const organe = db.prepare('insert or replace into an_organes (id, type, libelle, abrege) values (?, ?, ?, ?)')
    const depute = db.prepare(
      'insert or replace into an_deputes (id, nom, prenom, search, groupe_id, num_departement, circo, data) values (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const [name, text] of amo) {
      const doc = JSON.parse(text)
      if (name.includes('/organe/')) {
        const o = parseOrgane(doc)
        if (o) organe.run(o.id, o.type, o.libelle, o.abrege)
      } else if (name.includes('/acteur/')) {
        const d = parseActeur(doc)
        if (d) {
          const search = fold(`${d.prenom} ${d.nom} ${d.departement} ${d.numDepartement}`)
          depute.run(d.id, d.nom, d.prenom, search, d.groupeId, d.numDepartement, d.circo, JSON.stringify(d))
          count++
        }
      }
      report(++done, total)
    }
    const scrutin = db.prepare('insert or replace into an_scrutins (id, numero, date, titre, sort, data) values (?, ?, ?, ?, ?, ?)')
    const vote = db.prepare('insert or replace into an_votes (acteur, scrutin, position, delegation) values (?, ?, ?, ?)')
    for (const [, text] of scrutins) {
      const parsed = parseScrutin(JSON.parse(text))
      if (parsed) {
        const s = parsed.scrutin
        scrutin.run(s.id, s.numero, s.date, s.titre, s.sort, JSON.stringify(s))
        for (const v of parsed.votes) vote.run(actorNumber(v.acteur), s.numero, POSITION_CODES.indexOf(v.position), v.delegation ? 1 : 0)
        count++
      }
      report(++done, total)
    }
    db.exec("insert into an_scrutins_fts (an_scrutins_fts) values ('rebuild')")
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
    const count = job.source === 'service-public' ? indexServicePublic(job) : indexAssemblee(job)
    post({ type: 'done', count })
  } catch (err) {
    post({ type: 'error', message: (err as Error).message ?? String(err) })
  }
  // The main process ends this process once it has the result.
})
