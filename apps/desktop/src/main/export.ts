import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { domainInfo } from '@marianne/profile'
import type { ChatMessage } from '../shared/types'
import { folders } from './folders'
import { documents } from './profile/documents'
import { profile } from './profile/store'
import { session } from './session'
import { tasks } from './tasks'

/**
 * "Tout exporter": the account as ordinary files, in clear, for the user to keep or move
 * elsewhere: the profile, the planned tasks, every pièce in its domain, every folder's conversation
 * in Markdown.
 * The keychain and the payment cards stay out: their passwords and numbers never leave the archive in clear.
 */

const safeName = (name: string) =>
  name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'sans titre'

/** A name not taken yet in that folder: "facture.pdf", "facture (2).pdf"… */
function unique(taken: Set<string>, name: string): string {
  const dot = name.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  let candidate = name
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`
  taken.add(candidate.toLowerCase())
  return candidate
}

function markdown(title: string, messages: ChatMessage[]): string {
  const lines = [`# ${title}`, '']
  for (const m of messages) {
    if (m.role === 'system') continue
    lines.push(`## ${m.role === 'user' ? 'Vous' : 'Marianne'} · ${new Date(m.at).toLocaleString('fr-FR')}`, '')
    for (const p of m.parts) {
      if (p.type === 'text') lines.push(p.text, '')
      else if (p.type === 'document') lines.push(`> pièce : ${p.title}`, '')
      else if (p.type === 'page') lines.push(`> page : [${p.title}](${p.url})`, '')
      else if (p.type === 'tool') lines.push(`> outil : ${p.name}`, '')
    }
  }
  return lines.join('\n')
}

/** Writes the export into a new folder inside `parent`; returns its path. */
export function exportAll(parent: string): string {
  const archive = session.archive
  const root = join(parent, `Marianne ${archive.id} ${new Date().toISOString().slice(0, 10)}`)
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'profil.json'), JSON.stringify(profile.get(), null, 2))
  writeFileSync(join(root, 'tâches planifiées.json'), JSON.stringify(tasks.list(), null, 2))

  const byDomain = new Map<string, Set<string>>()
  for (const d of documents.list()) {
    const dir = join(root, 'pièces', safeName(domainInfo(d.domain).label))
    mkdirSync(dir, { recursive: true })
    const taken = byDomain.get(dir) ?? new Set()
    byDomain.set(dir, taken)
    writeFileSync(join(dir, unique(taken, safeName(d.fileName))), documents.bytes(d.id))
  }

  const dir = join(root, 'dossiers')
  mkdirSync(dir, { recursive: true })
  const taken = new Set<string>()
  for (const f of folders.list()) writeFileSync(join(dir, unique(taken, `${safeName(f.title)}.md`)), markdown(f.title, folders.messages(f.id)))
  return root
}
