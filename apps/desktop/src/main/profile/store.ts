import { EventEmitter } from 'node:events'
import { THEMES } from '@marianne/sdk'
import {
  computeDeadlines,
  EMPTY_PROFILE,
  newKey,
  numbered,
  readNewsChoice,
  today,
  tokensOf,
  type Deadline,
  type Profile,
  type ProfileOp,
  type TokenDef
} from '@marianne/profile'
import type { DomainId } from '../../shared/types'
import { content } from '../content'
import { session } from '../session'

/**
 * The profile of the open account: one record of its archive, read on first use and kept in
 * memory until the session locks. Changes go through `apply`, which normalizes them, saves, and
 * emits 'change' (windows, reminders, the engines' context).
 */

const KIND = 'profile'
const ID = 'main'

/** Fill in fields added since the record was written, and number what isn't yet (numbered). */
export function normalize(raw: Partial<Profile>): Profile {
  const e = structuredClone(EMPTY_PROFILE)
  return numbered({
    ...e,
    ...raw,
    version: 1,
    person: { ...e.person, ...raw.person },
    address: { ...e.address, ...raw.address },
    deadlineStatus: raw.deadlineStatus ?? {},
    procedures: raw.procedures ?? {},
    opinions: {
      leaning: { ...e.opinions.leaning, ...raw.opinions?.leaning },
      themes: raw.opinions?.themes ?? [],
      sources: readNewsChoice(raw.opinions?.sources)
    }
  } as Profile)
}

const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : s)

function cleanObject<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clean(v)])) as T
}

/** Identifiers are stored without spaces: they're typed in every format. */
const compact = (s: string) => s.replace(/[\s.]/g, '').toUpperCase()

const upsert = <T extends { id: string; n?: number }>(list: T[], item: T): T[] => {
  const withId = { ...item, id: item.id || newKey() }
  const old = list.find((x) => x.id === withId.id)
  // A record's number in the tokens is the store's to give (numbered): an edit keeps it whatever the
  // form sent, and a new record takes none from it, which could be another's.
  if (old?.n) withId.n = old.n
  else delete withId.n
  return old ? list.map((x) => (x.id === withId.id ? withId : x)) : [...list, withId]
}

class ProfileStore extends EventEmitter {
  private cache: Profile | null = null

  constructor() {
    super()
    // Dropped before the archive closes: the next account must never see this one's file.
    session.on('locked', () => {
      this.cache = null
    })
    // New content (official dates, sites): the deadlines and tokens change.
    content.on('change', () => {
      if (session.unlocked) this.emit('change', this.get())
    })
  }

  /** The profile; throws LockedError when no account is open. */
  get(): Profile {
    if (!this.cache) this.cache = normalize(session.archive.get<Partial<Profile>>(KIND, ID) ?? {})
    return this.cache
  }

  private save(p: Profile): void {
    session.archive.put(KIND, ID, p)
    this.cache = p
    this.emit('change', p)
  }

  tokens(): TokenDef[] {
    return tokensOf(this.get(), content.get().sites)
  }

  deadlines(now = new Date(), days = 400): Deadline[] {
    return computeDeadlines(this.get(), content.get().calendar, now, days)
  }

  apply(op: ProfileOp): Profile {
    const p = structuredClone(this.get())
    switch (op.type) {
      case 'person': {
        const patch = cleanObject(op.patch)
        if (patch.nir !== undefined) patch.nir = compact(patch.nir)
        if (patch.iban !== undefined) patch.iban = compact(patch.iban)
        p.person = { ...p.person, ...patch }
        break
      }
      case 'address':
        p.address = cleanObject(op.address)
        break
      case 'member':
        p.household = upsert(p.household, cleanObject(op.member))
        break
      case 'deleteMember':
        p.household = p.household.filter((m) => m.id !== op.id)
        p.idDocuments = p.idDocuments.filter((x) => x.holder !== op.id)
        break
      case 'account': {
        const fields = Object.fromEntries(Object.entries(op.account.fields).map(([k, v]) => [k, compact(v)]))
        const account = { siteId: op.account.siteId, fields, since: op.account.since || today() }
        p.accounts = p.accounts.some((a) => a.siteId === account.siteId)
          ? p.accounts.map((a) => (a.siteId === account.siteId ? account : a))
          : [...p.accounts, account]
        break
      }
      case 'deleteAccount':
        p.accounts = p.accounts.filter((a) => a.siteId !== op.siteId)
        break
      case 'idDocument':
        p.idDocuments = upsert(p.idDocuments, { ...cleanObject(op.document), number: compact(op.document.number) })
        break
      case 'deleteIdDocument':
        p.idDocuments = p.idDocuments.filter((x) => x.id !== op.id)
        break
      case 'entity': {
        const item = cleanObject(op.item) as { id: string; siren?: string; plate?: string }
        if (item.siren !== undefined) item.siren = compact(item.siren)
        if (item.plate !== undefined) item.plate = item.plate.toUpperCase()
        ;(p[op.kind] as Array<{ id: string }>) = upsert(p[op.kind] as Array<{ id: string }>, item)
        break
      }
      case 'deleteEntity':
        ;(p[op.kind] as Array<{ id: string }>) = (p[op.kind] as Array<{ id: string }>).filter((x) => x.id !== op.id)
        break
      case 'deadline':
        p.deadlines = upsert(p.deadlines, cleanObject(op.deadline))
        break
      case 'deleteDeadline':
        p.deadlines = p.deadlines.filter((x) => x.id !== op.id)
        delete p.deadlineStatus[op.id]
        break
      case 'deadlineStatus':
        if (op.status === 'todo') delete p.deadlineStatus[op.key]
        else p.deadlineStatus[op.key] = op.status
        break
      case 'procedureStep': {
        const done = new Set(p.procedures[op.id] ?? [])
        if (op.done) done.add(op.step)
        else done.delete(op.step)
        p.procedures[op.id] = [...done].sort((a, b) => a - b)
        break
      }
      case 'notes':
        p.notes = op.notes
        break
      case 'opinions': {
        // Acronyms as the chambers write them, at most as many as a chamber has groups; themes among the known ones; sources checked (readNewsChoice).
        const acronyms = (list: unknown) =>
          [
            ...new Set(
              (Array.isArray(list) ? list : [])
                .filter((x): x is string => typeof x === 'string' && /^[\p{L}\d .'-]{1,24}$/u.test(x.trim()))
                .map((x) => x.trim())
            )
          ].slice(0, 16)
        const themes = new Set<string>(THEMES.map((t) => t.id))
        // A part left out of the change stays as it was: two quick changes (a theme, then a source) don't undo each other.
        p.opinions = {
          leaning:
            op.opinions.leaning === undefined
              ? p.opinions.leaning
              : { assembly: acronyms(op.opinions.leaning?.assembly), senate: acronyms(op.opinions.leaning?.senate) },
          themes: op.opinions.themes === undefined ? p.opinions.themes : [...new Set(op.opinions.themes.filter((t) => themes.has(t)))],
          sources: op.opinions.sources === undefined ? p.opinions.sources : readNewsChoice(op.opinions.sources)
        }
        break
      }
      case 'onboarded':
        p.onboarded = op.value
        break
    }
    const saved = numbered(p)
    this.save(saved)
    return saved
  }

  /** Keep a trace of what was done (the last 500). */
  journal(domain: DomainId, text: string): void {
    const p = this.get()
    const entry = { id: newKey(), at: new Date().toISOString(), domain, text }
    this.save({ ...p, journal: [entry, ...p.journal].slice(0, 500) })
  }
}

export const profile = new ProfileStore()
