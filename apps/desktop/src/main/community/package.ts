import { createHash } from 'node:crypto'
import { crc32 } from 'node:zlib'
import { ManifestError, readManifest, serviceCode, type ServiceManifest } from '@marianne/sdk'
import { Inflate } from 'fflate'

/**
 * A .3615 file: a community service in one zip, named by its code (pharmagarde.3615), its version
 * in its manifest. Reading one runs nothing of it: the zip's directory is checked
 * before anything is inflated, each entry is inflated within the size its directory announces and
 * checked against its CRC, then the manifest is read as data. Every problem found is a French line
 * for the user.
 */

export const SERVICE_FILE_EXT = '.3615'

/** A .3615 file is at most this big: the files read, and the catalogue's entries alike. */
export const MAX_SERVICE_FILE_BYTES = 5 * 1024 * 1024

/** A service's version: 1.3.0, or 1.3.0-beta.1. */
export const SERVICE_VERSION = /^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z.-]{1,32})?$/

/**
 * The only entries a .3615 may hold, all at its root. The list is short on purpose: a service
 * arrives built (one main side, one view and its styles, its guide, a readme), so there is
 * nothing else to extract, and no folder, link or odd name can lead a file anywhere but into the
 * service's own folder.
 */
export const PACKAGE_ENTRIES = ['package.json', 'main.js', 'view.js', 'view.css', 'help.md', 'README.md'] as const

/**
 * A sync job (sync.js) runs with Node, out of any sandbox: a community service may not have one
 * in this version, and is refused with it, saying why.
 */
export const SYNC_ENTRY = 'sync.js'
export const NO_SYNC =
  'Ce service a une tâche de synchronisation (sync.js) : Marianne ne l’exécuterait pas à l’écart du reste, aussi les services de la communauté n’en ont pas encore.'
const REQUIRED = ['package.json', 'main.js', 'view.js']
const ALLOWED: ReadonlySet<string> = new Set(PACKAGE_ENTRIES)

/** Far more than the seven entries; inflated sizes as the zip's directory announces them. */
const MAX_ZIP_ENTRIES = 16
const MAX_ENTRY_BYTES = 10 * 1024 * 1024
const MAX_UNPACKED_BYTES = 20 * 1024 * 1024
const MAX_MANIFEST_BYTES = 256 * 1024
/** Compressed data is inflated this much at a time: one step can't produce more than about 16 MB. */
const INFLATE_STEP = 16 * 1024

/** Why a file is not a service Marianne can add: French lines, one each. */
export class PackageRefused extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(' '))
  }
}

/** A service read from its .3615: its manifest, checked, and its entries by name. */
export interface UnpackedService {
  manifest: ServiceManifest
  files: Map<string, Uint8Array>
}

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** "1,2 Mo": a size for the user. */
export const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`

const UNREADABLE = 'Ce fichier n’est pas une archive .3615 lisible.'
const LIMIT = megabytes(MAX_ENTRY_BYTES)

interface ZipEntry {
  name: string
  flags: number
  method: number
  crc: number
  compressed: number
  size: number
  /** Where its local header is. */
  offset: number
  /** The system that made it (high byte) and its attributes: a Unix link is refused. */
  madeBy: number
  external: number
}

const utf8 = new TextDecoder('utf-8')
// Names are read as UTF-8 whatever their flag says: only the ASCII names of PACKAGE_ENTRIES are ever allowed, so either reading refuses the others.
const decodeName = (bytes: Uint8Array) => utf8.decode(bytes)
/** A name as the user may read it: control characters shown as « ? », long ones cut. */
const shown = (name: string) => `« ${name.replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, 80)} »`

/** The entries of a zip, from its central directory; throws PackageRefused when the zip can't be read as Marianne reads them (one disk, no zip64). */
function readDirectory(z: Uint8Array): { entries: ZipEntry[]; directoryOffset: number } {
  const view = new DataView(z.buffer, z.byteOffset, z.byteLength)
  const fail = (): never => {
    throw new PackageRefused([UNREADABLE])
  }
  const u16 = (at: number) => (at >= 0 && at + 2 <= z.length ? view.getUint16(at, true) : fail())
  const u32 = (at: number) => (at >= 0 && at + 4 <= z.length ? view.getUint32(at, true) : fail())
  // The end record: 22 bytes, then its comment (up to 65 535 bytes) to the end of the file.
  let end = -1
  for (let at = z.length - 22; at >= Math.max(0, z.length - 22 - 0xffff); at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === z.length) {
      end = at
      break
    }
  }
  if (end < 0) fail()
  const count = u16(end + 10)
  const size = u32(end + 12)
  const offset = u32(end + 16)
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff || (end >= 20 && u32(end - 20) === 0x07064b50)) fail() // zip64: never needed under 5 MB
  if (u16(end + 4) !== 0 || u16(end + 6) !== 0 || u16(end + 8) !== count) fail() // split over several disks
  if (count === 0) throw new PackageRefused(['Ce fichier .3615 est vide.'])
  if (count > MAX_ZIP_ENTRIES) throw new PackageRefused([`Ce fichier contient ${count} éléments : un service en a ${PACKAGE_ENTRIES.length} au plus.`])
  if (offset + size > end) fail()
  const entries: ZipEntry[] = []
  let at = offset
  for (let i = 0; i < count; i++) {
    if (at + 46 > offset + size || u32(at) !== 0x02014b50) fail()
    const nameLength = u16(at + 28)
    const nameEnd = at + 46 + nameLength
    if (nameEnd > offset + size) fail()
    entries.push({
      name: decodeName(z.subarray(at + 46, nameEnd)),
      madeBy: u16(at + 4),
      flags: u16(at + 8),
      method: u16(at + 10),
      crc: u32(at + 16),
      compressed: u32(at + 20),
      size: u32(at + 24),
      external: u32(at + 38),
      offset: u32(at + 42)
    })
    at = nameEnd + u16(at + 30) + u16(at + 32)
  }
  return { entries, directoryOffset: offset }
}

/** What is wrong with the entries, before anything is inflated: their names, their kind, their sizes. */
function entryProblems(entries: ZipEntry[]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  let total = 0
  let folders = false
  for (const e of entries) {
    const name = shown(e.name)
    if (!e.name || /[\u0000-\u001f\u007f\ufffd]/.test(e.name)) problems.push(`${name} : un élément du fichier porte un nom illisible.`)
    else if (e.name.includes('\\')) problems.push(`${name} : un nom d’élément ne peut pas contenir de barre oblique inverse.`)
    else if (e.name.startsWith('/') || /^[a-zA-Z]:/.test(e.name))
      problems.push(`${name} est un chemin absolu : un service ne peut rien écrire hors de son dossier.`)
    else if (e.name.split('/').includes('..')) problems.push(`${name} sortirait du dossier du service.`)
    else if (e.name === SYNC_ENTRY) problems.push(NO_SYNC)
    else if (!ALLOWED.has(e.name)) {
      problems.push(`${name} n’a pas sa place dans un service.`)
      folders ||= e.name.includes('/')
    } else if (seen.has(e.name)) problems.push(`${name} y figure deux fois.`)
    seen.add(e.name)
    if (e.flags & 1) problems.push(`${name} est chiffré : Marianne n’ouvre pas les archives protégées par un mot de passe.`)
    if (e.method !== 0 && e.method !== 8) problems.push(`${name} est compressé d’une façon que Marianne ne lit pas.`)
    // A Unix symbolic link: its mode, in the high half of the external attributes.
    if (e.madeBy >> 8 === 3 && ((e.external >>> 16) & 0o170000) === 0o120000) problems.push(`${name} est un lien, pas un fichier.`)
    if (e.size > MAX_ENTRY_BYTES) problems.push(`${name} fait plus de ${LIMIT} une fois décompressé.`)
    total += e.size
  }
  if (folders) problems.push(`Un fichier .3615 n’a pas de dossier : ses fichiers sont à sa racine (${PACKAGE_ENTRIES.join(', ')}).`)
  else if (problems.some((p) => p.endsWith('n’a pas sa place dans un service.')))
    problems.push(
      `Un fichier .3615 contient ${REQUIRED.join(', ')}, et au besoin ${PACKAGE_ENTRIES.filter((n) => !REQUIRED.includes(n)).join(', ')} : rien d’autre.`
    )
  if (total > MAX_UNPACKED_BYTES) problems.push(`Son contenu dépasse ${megabytes(MAX_UNPACKED_BYTES)} une fois décompressé.`)
  for (const name of REQUIRED) if (!seen.has(name)) problems.push(`Il y manque ${name}.`)
  return problems
}

/** Inflated, never past what the directory announces: a zip that lies about a size is refused before it can fill the memory. */
function inflate(data: Uint8Array, expected: number, name: string): Uint8Array {
  const out = new Uint8Array(expected)
  let length = 0
  const damaged = () => new PackageRefused([`${shown(name)} est endommagé.`])
  const stream = new Inflate((chunk) => {
    if (length + chunk.length > expected) throw damaged()
    out.set(chunk, length)
    length += chunk.length
  })
  try {
    if (!data.length) stream.push(data, true)
    for (let at = 0; at < data.length; at += INFLATE_STEP) stream.push(data.subarray(at, at + INFLATE_STEP), at + INFLATE_STEP >= data.length)
  } catch (err) {
    if (err instanceof PackageRefused) throw err
    throw damaged()
  }
  if (length !== expected) throw damaged()
  return out
}

/** Each entry's bytes, from its local header: the same name as in the directory, data that stays before the directory and overlaps no other's, the CRC it announces. */
function readEntries(z: Uint8Array, entries: ZipEntry[], directoryOffset: number): Map<string, Uint8Array> {
  const view = new DataView(z.buffer, z.byteOffset, z.byteLength)
  const spans = entries.map((e) => {
    const at = e.offset
    if (at + 30 > directoryOffset || view.getUint32(at, true) !== 0x04034b50) throw new PackageRefused([UNREADABLE])
    const nameLength = view.getUint16(at + 26, true)
    const start = at + 30 + nameLength + view.getUint16(at + 28, true)
    const stop = start + e.compressed
    if (stop > directoryOffset) throw new PackageRefused([UNREADABLE])
    if (decodeName(z.subarray(at + 30, at + 30 + nameLength)) !== e.name) throw new PackageRefused([`${shown(e.name)} : l’archive se contredit sur son nom.`])
    return { entry: e, at, start, stop }
  })
  const ordered = [...spans].sort((a, b) => a.at - b.at)
  for (let i = 1; i < ordered.length; i++) if (ordered[i].at < ordered[i - 1].stop) throw new PackageRefused([UNREADABLE])
  const files = new Map<string, Uint8Array>()
  for (const { entry: e, start, stop } of spans) {
    const data = z.subarray(start, stop)
    let bytes: Uint8Array
    if (e.method === 0) {
      if (e.compressed !== e.size) throw new PackageRefused([`${shown(e.name)} est endommagé.`])
      bytes = data.slice()
    } else bytes = inflate(data, e.size, e.name)
    if (crc32(bytes) >>> 0 !== e.crc) throw new PackageRefused([`${shown(e.name)} est endommagé.`])
    files.set(e.name, bytes)
  }
  return files
}

/**
 * What is wrong with a community service's `links` (the pages it opens itself, and that answers'
 * links open in it): each must be on one of its own declared hosts, and never on a host a
 * built-in service declares or opens, nor on a public site of Marianne's (`protectedHosts`): it
 * would take her answers' links away.
 */
export function linkProblems(m: Pick<ServiceManifest, 'id' | 'hosts' | 'links'>, protectedHosts: ReadonlySet<string>): string[] {
  const problems: string[] = []
  for (const link of m.links) {
    let host = ''
    try {
      host = new URL(link).hostname
    } catch {
      // refused below
    }
    if (!host || !m.hosts.includes(host)) problems.push(`Le lien « ${link.slice(0, 80)} » n’est pas sur un site que 3615 ${serviceCode(m)} déclare.`)
    else if (protectedHosts.has(host))
      problems.push(
        `Le lien « ${link.slice(0, 80)} » est sur ${host}, un site que Marianne ouvre elle-même : un service de la communauté ne peut pas l’ouvrir à sa place.`
      )
  }
  return problems
}

/** The manifest of package.json, checked by the SDK, as the user is told of it. */
function manifestOf(bytes: Uint8Array, reserved: ReadonlySet<string>, protectedHosts: ReadonlySet<string>): ServiceManifest {
  if (bytes.length > MAX_MANIFEST_BYTES) throw new PackageRefused([`Le manifeste (package.json) fait plus de ${MAX_MANIFEST_BYTES / 1024} ko.`])
  let pkg: unknown
  try {
    pkg = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''))
  } catch {
    throw new PackageRefused(['Le manifeste (package.json) n’est pas un JSON lisible.'])
  }
  let manifest: ServiceManifest
  try {
    manifest = readManifest(pkg)
  } catch (err) {
    if (err instanceof ManifestError) throw new PackageRefused([`Le manifeste est invalide : ${err.message}`])
    throw err
  }
  const problems: string[] = []
  if (!SERVICE_VERSION.test(manifest.version)) problems.push(`Sa version, « ${manifest.version.slice(0, 40)} », ne se lit pas comme 1.2.3.`)
  if (reserved.has(manifest.id)) problems.push(`3615 ${serviceCode(manifest)} est un service officiel de Marianne : un fichier ne peut pas le remplacer.`)
  if (manifest.news)
    problems.push(
      `3615 ${serviceCode(manifest)} demande les titres de presse que lit Marianne (« news » dans son manifeste) : seuls ses services officiels les reçoivent.`
    )
  // Where Marianne acts for the user goes past what « avant d’ajouter » reviews of a community service: its own hosts, its own screen.
  if (manifest.sites.length)
    problems.push(
      `3615 ${serviceCode(manifest)} déclare des sites où Marianne agirait pour vous (« sites » dans son manifeste) : seuls ses services officiels le peuvent.`
    )
  // The user's sources serve the headlines Marianne reads (ctx.news): its sandbox never gets them, so asking for them would only make the user say yes to nothing.
  if (manifest.permissions.profile.includes('opinions.sources'))
    problems.push(
      `3615 ${serviceCode(manifest)} demande vos sources d’information (« opinions.sources » dans son manifeste) : seuls les services officiels de Marianne les lisent.`
    )
  problems.push(...linkProblems(manifest, protectedHosts))
  if (problems.length) throw new PackageRefused(problems)
  return manifest
}

/**
 * The service in the bytes of a .3615 file, checked: its entries (only PACKAGE_ENTRIES, at the
 * root, within the size limits, intact) and its manifest (valid for the SDK, a version, not the
 * code of a service built into Marianne: `reserved`; links only on its own hosts, none on a
 * site of Marianne's: `protectedHosts`; neither the headlines nor the user's news sources, nor
 * sites for Marianne to act on, which only built-in services get). Throws PackageRefused saying
 * what is wrong.
 */
export function unpackService(bytes: Uint8Array, options: { reserved: ReadonlySet<string>; protectedHosts?: ReadonlySet<string> }): UnpackedService {
  if (bytes.length > MAX_SERVICE_FILE_BYTES)
    throw new PackageRefused([`Le fichier fait ${megabytes(bytes.length)} : un service fait au plus ${megabytes(MAX_SERVICE_FILE_BYTES)}.`])
  if (bytes.length < 22) throw new PackageRefused([UNREADABLE])
  const { entries, directoryOffset } = readDirectory(bytes)
  const problems = entryProblems(entries)
  if (problems.length) throw new PackageRefused(problems)
  const files = readEntries(bytes, entries, directoryOffset)
  return { manifest: manifestOf(files.get('package.json')!, options.reserved, options.protectedHosts ?? new Set()), files }
}
