import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { EMPTY_DOSSIER, newKey, today, type Deadline, type DocumentMeta, type DomainId, type Dossier, type DossierOp } from '../../shared/dossier'
import { SERVICES } from '../../shared/constants'
import type { Service } from '../../shared/types'
import { configStore } from '../config'
import { readSealed, VaultLockedError, writeSealed } from '../crypto'
import { log } from '../log'
import { paths, resource } from '../paths'
import { computeDeadlines, type CalendarItem } from './rules'
import { tokensOf, type TokenDef } from './tokens'

/**
 * The personal file, encrypted at rest (dossier.enc). Changes go through `apply`, which validates
 * them, saves, and notifies the windows, the reminders and the chat.
 */

const CALENDAR_URL = 'https://raw.githubusercontent.com/rodolphebarbanneau/marianne/main/resources/calendrier.json'

/** Fill in fields added since the file was written. */
export function normalize(raw: Partial<Dossier>): Dossier {
  const e = structuredClone(EMPTY_DOSSIER)
  return {
    ...e,
    ...raw,
    version: 1,
    person: { ...e.person, ...raw.person },
    address: { ...e.address, ...raw.address },
    deadlineStatus: raw.deadlineStatus ?? {},
    procedures: raw.procedures ?? {}
  } as Dossier
}

const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : s)

function cleanObject<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clean(v)])) as T
}

/** Identifiers are stored without spaces: they're typed in every format. */
const compact = (s: string) => s.replace(/[\s.]/g, '').toUpperCase()

const upsert = <T extends { id: string }>(list: T[], item: T): T[] => {
  const withId = { ...item, id: item.id || newKey() }
  return list.some((x) => x.id === withId.id) ? list.map((x) => (x.id === withId.id ? withId : x)) : [...list, withId]
}

class DossierStore extends EventEmitter {
  private data: Dossier = structuredClone(EMPTY_DOSSIER)
  private calendarItems: CalendarItem[] = []
  /** 'locked': the file exists but the keystore can't open it (restore a backup). */
  state: 'ok' | 'locked' | 'error' = 'ok'
  error = ''

  load(): void {
    try {
      this.data = existsSync(paths.dossier) ? normalize(JSON.parse(readSealed(paths.dossier).toString('utf8'))) : structuredClone(EMPTY_DOSSIER)
      this.state = 'ok'
    } catch (err) {
      this.state = err instanceof VaultLockedError ? 'locked' : 'error'
      this.error = (err as Error).message
      log.error('Personal file unreadable:', this.error)
    }
    void this.loadCalendar()
  }

  get(): Dossier {
    return this.data
  }

  /** Replace the whole file (backup restore). */
  replace(d: Dossier): void {
    this.data = normalize(d)
    this.state = 'ok'
    this.save()
  }

  private save(): void {
    if (this.state !== 'ok') throw new Error(this.error || 'Le dossier est verrouillé')
    writeSealed(paths.dossier, JSON.stringify(this.data))
    this.emit('change', this.data)
  }

  services(): Service[] {
    return [...SERVICES, ...configStore.get().services.custom]
  }

  tokens(): TokenDef[] {
    return tokensOf(this.data, this.services())
  }

  deadlines(now = new Date(), days = 400): Deadline[] {
    return computeDeadlines(this.data, this.calendarItems, now, days)
  }

  apply(op: DossierOp): Dossier {
    const d = structuredClone(this.data)
    switch (op.type) {
      case 'person': {
        const patch = cleanObject(op.patch)
        if (patch.nir !== undefined) patch.nir = compact(patch.nir)
        d.person = { ...d.person, ...patch }
        break
      }
      case 'address':
        d.address = cleanObject(op.address)
        break
      case 'member':
        d.household = upsert(d.household, cleanObject(op.member))
        break
      case 'deleteMember':
        d.household = d.household.filter((m) => m.id !== op.id)
        d.pieces = d.pieces.filter((p) => p.titulaire !== op.id)
        break
      case 'account': {
        const fields = Object.fromEntries(Object.entries(op.account.fields).map(([k, v]) => [k, compact(v)]))
        const account = { serviceId: op.account.serviceId, fields, since: op.account.since || today() }
        d.accounts = d.accounts.some((a) => a.serviceId === account.serviceId)
          ? d.accounts.map((a) => (a.serviceId === account.serviceId ? account : a))
          : [...d.accounts, account]
        break
      }
      case 'deleteAccount':
        d.accounts = d.accounts.filter((a) => a.serviceId !== op.serviceId)
        break
      case 'piece':
        d.pieces = upsert(d.pieces, { ...cleanObject(op.piece), numero: compact(op.piece.numero) })
        break
      case 'deletePiece':
        d.pieces = d.pieces.filter((p) => p.id !== op.id)
        break
      case 'entity': {
        const item = cleanObject(op.item) as { id: string; siren?: string; immatriculation?: string }
        if (item.siren !== undefined) item.siren = compact(item.siren)
        if (item.immatriculation !== undefined) item.immatriculation = item.immatriculation.toUpperCase()
        ;(d[op.kind] as Array<{ id: string }>) = upsert(d[op.kind] as Array<{ id: string }>, item)
        break
      }
      case 'deleteEntity':
        ;(d[op.kind] as Array<{ id: string }>) = (d[op.kind] as Array<{ id: string }>).filter((x) => x.id !== op.id)
        break
      case 'deadline':
        d.deadlines = upsert(d.deadlines, cleanObject(op.deadline))
        break
      case 'deleteDeadline':
        d.deadlines = d.deadlines.filter((x) => x.id !== op.id)
        delete d.deadlineStatus[op.id]
        break
      case 'deadlineStatus':
        if (op.status === 'a_faire') delete d.deadlineStatus[op.key]
        else d.deadlineStatus[op.key] = op.status
        break
      case 'procedureStep': {
        const done = new Set(d.procedures[op.id] ?? [])
        if (op.done) done.add(op.step)
        else done.delete(op.step)
        d.procedures[op.id] = [...done].sort((a, b) => a - b)
        break
      }
      case 'documentMeta':
        d.documents = d.documents.map((x) => (x.id === op.id ? { ...x, ...cleanObject(op.patch) } : x))
        break
      case 'notes':
        d.notes = op.notes
        break
      case 'onboarded':
        d.onboarded = op.value
        break
    }
    this.data = d
    this.save()
    return d
  }

  addDocument(meta: DocumentMeta): void {
    this.data = { ...this.data, documents: [...this.data.documents, meta] }
    this.save()
  }

  removeDocument(id: string): void {
    this.data = { ...this.data, documents: this.data.documents.filter((x) => x.id !== id) }
    this.save()
  }

  journal(domain: DomainId, text: string): void {
    const entry = { id: newKey(), at: new Date().toISOString(), domain, text }
    this.data = { ...this.data, journal: [entry, ...this.data.journal].slice(0, 500) }
    this.save()
  }

  /** The bundled calendar, then the published one when it can be fetched (cached). */
  private async loadCalendar(): Promise<void> {
    const read = async (file: string) => (JSON.parse(await readFile(file, 'utf8')) as { items: CalendarItem[] }).items
    try {
      this.calendarItems = await read(existsSync(paths.calendar) ? paths.calendar : resource('calendrier.json'))
    } catch (err) {
      log.warn('Calendar unreadable:', err)
      this.calendarItems = await read(resource('calendrier.json')).catch(() => [])
    }
    try {
      const res = await fetch(CALENDAR_URL, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) return
      const text = await res.text()
      const items = (JSON.parse(text) as { items?: CalendarItem[] }).items
      if (!Array.isArray(items) || !items.length) return
      this.calendarItems = items
      await writeFile(paths.calendar, text)
      this.emit('change', this.data)
    } catch {
      // offline, or not published yet: keep the local calendar
    }
  }
}

export const dossier = new DossierStore()
