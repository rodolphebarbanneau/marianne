import type { Procedure } from '@marianne/content'
import {
  CONTRACT_LABELS,
  PROPERTY_STATUS_LABELS,
  PROPERTY_USE_LABELS,
  ROLE_LABELS,
  today,
  type Deadline,
  type EntityKind,
  type Profile,
  type Vehicle
} from '@marianne/profile'
import type { FolderSummary } from '@shared/types'
import { aboutEntity, shortDate, weekMarks, type WeekMark } from '../lib/demarches'
import { when } from '../lib/format'

/** What a domain's page computes, without React. */

/** "18 mars 2027". */
export const longDate = (iso: string) => `${shortDate(iso)} ${iso.slice(0, 4)}`

/** The local day of a moment: a day that starts at midnight here starts the evening before in UTC. */
const localDay = (iso: string) => today(new Date(iso))

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Something the user has in a domain, whatever its kind: what the cards and the weeks need of it. */
export interface DomainEntity {
  id: string
  /** How the user knows it. */
  name: string
  /** A line each. */
  facts: string[]
  /** What deadlines call it: on its own card, their titles do without. */
  names: string[]
  /** A vehicle keeps its plate and its pastille. */
  vehicle?: Vehicle
}

/** The next inspection, as the rules date it (a late one's key keeps its real day), or the last one. */
function inspectionLine(v: Vehicle, deadlines: Deadline[]): string {
  const due = deadlines.find((d) => d.key.startsWith(`inspection:${v.id}:`))?.key.split(':')[2]
  if (due) return `contrôle technique avant le ${longDate(due)}`
  return v.lastInspection ? `contrôle technique le ${longDate(v.lastInspection)}` : ''
}

const since = (day: string) => (day ? `depuis le ${longDate(day)}` : '')

const line = (...parts: string[]) => parts.filter(Boolean).join(' · ')

/** What the profile holds of a kind: nothing is detected or guessed. */
export function entitiesOf(profile: Profile, kind: EntityKind, deadlines: Deadline[]): DomainEntity[] {
  const fact = (text: string) => (text ? [text] : [])
  switch (kind) {
    case 'vehicles':
      return profile.vehicles.map((v) => ({
        id: v.id,
        name: v.model || v.plate || 'véhicule',
        facts: fact(inspectionLine(v, deadlines)),
        names: [v.plate, v.model],
        vehicle: v
      }))
    case 'properties':
      return profile.properties.map((p) => ({
        id: p.id,
        name: p.address || 'adresse à compléter',
        facts: fact(line(PROPERTY_STATUS_LABELS[p.status], PROPERTY_USE_LABELS[p.use], since(p.leaseStart))),
        names: []
      }))
    case 'companies':
      return profile.companies.map((c) => ({
        id: c.id,
        name: c.name || 'entreprise',
        facts: fact(line(c.siren && `siren ${c.siren}`, ROLE_LABELS[c.role])),
        names: []
      }))
    case 'employers':
      return profile.employers.map((e) => ({
        id: e.id,
        name: line(e.name, e.position) || 'employeur',
        facts: fact(line(CONTRACT_LABELS[e.contract], since(e.start))),
        names: []
      }))
  }
}

/** A deadline's title on its entity's card, without the entity: « contrôle technique du véhicule Clio » is « Contrôle technique ». */
export function tiedTitle(title: string, names: string[]): string {
  const left = names.filter(Boolean).reduce((t, n) => t.replace(` du véhicule ${n}`, '').replace(` de ${n}`, '').replace(` · ${n}`, ''), title)
  return capitalize(left)
}

export interface WeekRow {
  /** Its entity; null: what no entity holds. */
  entity: string | null
  marks: WeekMark[][]
}

/** The weeks' lines: one per entity that has marks, then what no entity holds. Nothing to show: none. */
export function weekRows(entities: string[], deadlines: Deadline[], now = new Date()): WeekRow[] {
  const held = (d: Deadline) => entities.some((id) => aboutEntity(d, id))
  const rows: WeekRow[] = [
    ...entities.map((id) => ({
      entity: id,
      marks: weekMarks(
        deadlines.filter((d) => aboutEntity(d, id)),
        now
      )
    })),
    {
      entity: null,
      marks: weekMarks(
        deadlines.filter((d) => !held(d)),
        now
      )
    }
  ]
  return rows.filter((r) => r.marks.some((week) => week.length))
}

/** A domain's folders as « dossiers » lays them out. A settled folder is settled, asleep or not. */
export function folderGroups(folders: FolderSummary[]) {
  return {
    open: folders.filter((f) => !f.settledAt && !f.snoozedUntil),
    asleep: folders.filter((f) => !f.settledAt && f.snoozedUntil),
    settled: folders.filter((f) => f.settledAt)
  }
}

/** A folder's row: what it says under its title, and its state, on which its colour depends. */
export function folderRow(f: FolderSummary): { detail: string; state: FolderSummary['status'] | 'veille' | 'classe' } {
  if (f.settledAt) return { detail: `classé le ${shortDate(localDay(f.settledAt))}`, state: 'classe' }
  if (f.snoozedUntil) return { detail: line(f.meta, `jusqu’au ${shortDate(localDay(f.snoozedUntil))}`), state: 'veille' }
  return { detail: line(f.meta, when(f.updatedAt)), state: f.status }
}

/**
 * The titles of Service-Public's sheets, as the guided démarches name them in their actions (« Lire
 * la fiche dépôt de garantie »): the window has no other way to know them, the index being the main
 * process's. A sheet no démarche mentions has none.
 */
export function sheetTitles(procedures: Procedure[]): Map<string, string> {
  const titles = new Map<string, string>()
  for (const p of procedures)
    for (const step of p.steps)
      for (const action of step.actions)
        if (action.kind === 'sheet') titles.set(action.target, capitalize(action.label.replace(/^Lire (la fiche|le dossier) /, '')))
  return titles
}
