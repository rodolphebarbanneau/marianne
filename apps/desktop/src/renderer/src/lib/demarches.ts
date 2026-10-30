import { daysUntil, DOMAINS, today, type Deadline, type DocumentMeta } from '@marianne/profile'
import { foldText } from '@marianne/sdk'
import type { ServiceState } from '@marianne/sdk'
import type { Procedure } from '@marianne/content'
import type { DomainId, FolderSummary, PlannedTask, TaskOutcome, TaskRun, TaskTemplate } from '@shared/types'

/**
 * What the Démarches pages compute, without React: « à faire », the weeks to come, the one search.
 * Nothing in « à faire » is put there by hand: it is what waits for the user and what is coming.
 */

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
/** How far « à faire » looks ahead. */
export const TODO_DAYS = 45
/** Within this many days, an échéance presses: it goes to the top, and is red on the weeks. */
export const PRESSING_DAYS = 3
export const WEEKS = 8

/** "4 déc.", "1er nov.". */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('T')[0].split('-').map(Number)
  return `${d === 1 ? '1er' : d} ${MONTHS[m - 1]}`
}

/** "à 18 h 12", from an ISO date with a time; nothing for a day alone. */
export function hourOf(iso: string): string {
  if (iso.length <= 10) return ''
  const d = new Date(iso)
  return ` à ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`.replace(' h 00', ' h')
}

export const weekdayOf = (iso: string) => WEEKDAYS[new Date(`${iso.slice(0, 10)}T12:00:00`).getDay()]

export type Tone = '' | 'soon' | 'late' | 'you'

/** When something falls: « aujourd’hui », « dimanche », « dans 15 j », « 4 déc. », « en retard de 2 j ». */
export function whenOf(date: string, now = new Date()): { text: string; tone: Tone } {
  const n = daysUntil(date, now)
  if (n < 0) return { text: `en retard de ${-n} j`, tone: 'late' }
  if (n === 0) return { text: 'aujourd’hui', tone: 'soon' }
  if (n === 1) return { text: 'demain', tone: 'soon' }
  if (n <= PRESSING_DAYS) return { text: weekdayOf(date), tone: 'soon' }
  if (n <= 21) return { text: `dans ${n} j`, tone: '' }
  return { text: shortDate(date), tone: '' }
}

export type TodoTarget =
  | { kind: 'folder'; id: string }
  | { kind: 'service'; id: string; params?: Record<string, string | number> }
  | { kind: 'procedure'; id: string }
  | { kind: 'url'; url: string }
  | { kind: 'letter'; id: string }
  | { kind: 'domain'; id: DomainId }

export interface TodoItem {
  key: string
  /** 0 late, 1 waits for the user, 1.5 within the days that press, 2 the rest: what presses is under 2. */
  rank: number
  /** For the order within a rank. */
  date: string
  when: { text: string; tone: Tone }
  domain: DomainId | ''
  title: string
  /** Where it comes from: dossier, règle, 3615 PEAGE… */
  chip: string
  detail: string
  /** The action's word; empty: the row alone opens it. */
  act: string
  target: TodoTarget
  /** It waits for the user, in the words of the sommaire's state line. */
  wait?: string
}

const SOURCES: Record<Deadline['source'], string> = { rule: 'règle', calendar: 'calendrier officiel', user: 'vous', agent: 'Marianne', service: 'service' }

const lastRun = (task: PlannedTask): TaskRun | undefined => task.runs[task.runs.length - 1]

/** Whether a task found something today, in the service a deadline comes from. */
const foundToday = (tasks: PlannedTask[], service: string, now: Date) =>
  tasks.some((t) => {
    const run = lastRun(t)
    return t.origin.kind === 'service' && t.origin.service === service && run?.outcome === 'found' && today(new Date(run.at)) === today(now)
  })

function deadlineTarget(d: Deadline): { act: string; target: TodoTarget } {
  if (d.service) return { act: 'ouvrir', target: { kind: 'service', id: d.service, params: d.params } }
  if (d.procedureId) return { act: 'commencer', target: { kind: 'procedure', id: d.procedureId } }
  if (d.sourceUrl) return { act: 'voir', target: { kind: 'url', url: d.sourceUrl } }
  return { act: '', target: { kind: 'domain', id: d.domain } }
}

export interface TodoSources {
  folders: FolderSummary[]
  deadlines: Deadline[]
  documents: DocumentMeta[]
  tasks: PlannedTask[]
}

/**
 * What needs the user, ranked: late, then what waits for them, then what falls within 3 days, then
 * by date. Folders that wait, tasks that need them or failed, deadlines within 45 days, letters to
 * process. `domain`: one domain's.
 */
export function todoItems({ folders, deadlines, documents, tasks }: TodoSources, domain?: DomainId, now = new Date()): TodoItem[] {
  const items: TodoItem[] = []
  for (const f of folders) {
    if (f.settledAt || (f.status !== 'approval' && f.status !== 'question')) continue
    const approval = f.status === 'approval'
    const wait = approval ? 'attend votre accord' : 'une question pour vous'
    items.push({
      key: `folder:${f.id}`,
      rank: 1,
      date: '',
      when: { text: approval ? 'votre accord' : 'une question', tone: 'you' },
      domain: f.domain,
      title: f.title,
      chip: 'dossier',
      detail: f.meta || wait,
      act: 'répondre',
      target: { kind: 'folder', id: f.id },
      wait
    })
  }
  for (const t of tasks) {
    const run = lastRun(t)
    if (!t.on || !run || (run.outcome !== 'waiting' && run.outcome !== 'failed')) continue
    const wait = run.outcome === 'waiting' ? 'une tâche vous attend' : 'tâche sans suite'
    items.push({
      key: `task:${t.id}`,
      rank: 1,
      date: '',
      when: { text: wait, tone: 'you' },
      domain: t.domain,
      title: t.title,
      chip: 'tâche planifiée',
      detail: run.text ?? '',
      act: 'ouvrir',
      target: { kind: 'folder', id: t.folderId },
      wait
    })
  }
  for (const d of deadlines) {
    if (d.status !== 'todo' || daysUntil(d.date, now) > TODO_DAYS) continue
    const when = whenOf(d.date, now)
    const days = daysUntil(d.date, now)
    const found = d.service && foundToday(tasks, d.service, now)
    items.push({
      key: `deadline:${d.key}`,
      rank: when.tone === 'late' ? 0 : days <= PRESSING_DAYS ? 1.5 : 2,
      date: d.date,
      when: { text: `${when.text}${days <= PRESSING_DAYS ? hourOf(d.date) : ''}`, tone: when.tone },
      domain: d.domain,
      title: d.title,
      chip: d.service ? `3615 ${d.service.toUpperCase()}` : SOURCES[d.source],
      detail: [found && 'trouvé ce matin par sa tâche', d.note, d.indicative && 'date indicative'].filter(Boolean).join(' · '),
      ...deadlineTarget(d)
    })
  }
  for (const x of documents) {
    if (x.type !== 'letter' || x.folderId) continue
    items.push({
      key: `letter:${x.id}`,
      rank: 2,
      date: '9999',
      when: { text: 'courrier', tone: '' },
      domain: x.domain,
      title: x.title,
      chip: 'courrier',
      detail: x.date ? `reçu le ${shortDate(x.date)}` : 'à traiter',
      act: 'traiter',
      target: { kind: 'letter', id: x.id }
    })
  }
  return items.filter((x) => !domain || x.domain === domain).sort((a, b) => a.rank - b.rank || a.date.localeCompare(b.date))
}

/** Under 2: what presses, shown first, the rest a click further. */
export const presses = (item: TodoItem) => item.rank < 2

/** What is said of what presses, beside its section's name. */
export function pressingLine(n: number): string {
  if (!n) return 'rien ne presse'
  return n > 1 ? `${n} vous attendent ou arrivent dans les ${PRESSING_DAYS} jours` : `1 vous attend ou arrive dans les ${PRESSING_DAYS} jours`
}

export interface DomainLine {
  /** What waits for the user; empty: nothing. */
  wait: string
  /** The next échéance, « title · when »; empty: none within 45 days. */
  next: string
  /** Folders in progress: neither settled nor asleep. */
  folders: number
  /** Tasks that are on. */
  tasks: number
  /** Nothing at all: the row steps back. */
  idle: boolean
}

/** A title as a state line has room for it: « Passage A13 à payer · AB-123-CD » keeps what to do. */
const shortTitle = (title: string) => title.split(' · ')[0].split(' : ')[0]

/**
 * A domain's line of the sommaire. What waits comes from « à faire », so that the two never
 * disagree; a task that needs the user counts as a folder does.
 */
export function domainLine(domain: DomainId, sources: TodoSources, now = new Date()): DomainLine {
  const folders = sources.folders.filter((f) => f.domain === domain && !f.settledAt && !f.snoozedUntil).length
  const tasks = sources.tasks.filter((t) => t.domain === domain && t.on).length
  const waits = todoItems(sources, domain, now).flatMap((x) => x.wait ?? [])
  const wait = waits.length > 1 ? `${waits.length} vous attendent` : (waits[0] ?? '')
  const [coming] = sources.deadlines
    .filter((d) => d.domain === domain && d.status === 'todo' && daysUntil(d.date, now) <= TODO_DAYS)
    .sort((a, b) => a.date.localeCompare(b.date))
  const next = coming ? `${shortTitle(coming.title)} · ${whenOf(coming.date, now).text}` : ''
  return { wait, next, folders, tasks, idle: !wait && !next && !folders && !tasks }
}

/** The services shown on a domain's line. ANNUAIRE is in every domain: it would say nothing there. */
export const domainServices = (services: ServiceState[], domain: DomainId) =>
  services.filter((s) => s.added && s.on && s.manifest.domains.includes(domain) && s.manifest.id !== 'annuaire')

/** The day of the next task that is on: « dimanche 1er nov. »; empty: none. */
export function nextTaskDay(tasks: PlannedTask[]): string {
  const [next] = tasks
    .filter((t) => t.on)
    .map((t) => t.next)
    .sort()
  return next ? `${weekdayOf(next)} ${shortDate(next)}` : ''
}

const RUN_CELLS: Record<TaskOutcome, { look: string; word: string }> = {
  nothing: { look: '', word: 'rien trouvé' },
  found: { look: 'found', word: 'trouvé' },
  waiting: { look: 'you', word: 'vous attend' },
  failed: { look: 'failed', word: 'échec' },
  done: { look: 'done', word: 'fait' }
}

/** A run's cell: its look, and what it says on hover. Only a quiet run shows that it was caught up: what one found matters more. */
export function runCell(run: TaskRun): { look: string; title: string } {
  const { look, word } = RUN_CELLS[run.outcome]
  const day = shortDate(today(new Date(run.at)))
  return { look: look || (run.due ? 'late' : ''), title: `${day} · ${word}${run.due ? ' · rattrapée' : ''}${run.text ? ` : ${run.text}` : ''}` }
}

/** The Monday of a date's week. */
function monday(from: Date): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/** The eight weeks to come, Monday to Sunday, the current one first. */
export function weeksFrom(now = new Date()): Date[] {
  const first = monday(now)
  return Array.from({ length: WEEKS }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i * 7))
}

/** A week's head: its Monday, the month named only where it changes. */
export function weekLabels(now = new Date()): string[] {
  const weeks = weeksFrom(now)
  return weeks.map((w, i) => {
    if (i === 0) return 'sem.'
    const day = w.getDate() === 1 ? '1er' : String(w.getDate())
    return i === 1 || w.getMonth() !== weeks[i - 1].getMonth() ? `${day} ${MONTHS[w.getMonth()]}` : day
  })
}

export interface WeekMark {
  key: string
  title: string
  /** Late, or within the days that press: red. */
  pressing: boolean
}

const weekIndex = (iso: string, weeks: Date[]) =>
  Math.floor((monday(new Date(`${iso.slice(0, 10)}T12:00:00`)).getTime() - weeks[0].getTime()) / (7 * 86_400_000) + 0.5)

/** The échéances of each week, a mark each. A running task isn't drawn: one that runs every week would only fill the row. */
export function weekMarks(deadlines: Deadline[], now = new Date()): WeekMark[][] {
  const weeks = weeksFrom(now)
  const out: WeekMark[][] = weeks.map(() => [])
  for (const d of deadlines) {
    if (d.status !== 'todo') continue
    const i = Math.max(0, weekIndex(d.date, weeks))
    if (i >= WEEKS) continue
    out[i].push({ key: d.key, title: `${d.title} · ${shortDate(d.date)}`, pressing: daysUntil(d.date, now) <= PRESSING_DAYS })
  }
  return out
}

/** Whether a deadline is about an entity: the rules put its id in their key (`inspection:<id>:…`); a service in its params. */
export const aboutEntity = (d: Deadline, id: string) => d.key.split(':').includes(id) || Object.values(d.params ?? {}).includes(id)

/** The domain a number calls: 1 to 10, typed in the bar. */
export function domainByNumber(text: string): (typeof DOMAINS)[number] | null {
  const t = text.trim()
  return /^\d{1,2}$/.test(t) ? (DOMAINS.find((d) => d.num === Number(t)) ?? null) : null
}

/** The planned tasks the services propose that the user hasn't taken yet. */
export const proposed = (templates: TaskTemplate[], tasks: PlannedTask[]) =>
  templates.filter((t) => !tasks.some((x) => x.origin.kind === 'service' && x.origin.service === t.service && x.origin.template === t.id))

// ---------------------------------------------------------------- the search

export type SearchTarget = TodoTarget | { kind: 'ask'; text: string }

export interface SearchRow {
  key: string
  domain: DomainId | ''
  title: string
  detail: string
  /** What it is: dossier, pièce, échéance… */
  kind: string
  act: string
  target: SearchTarget
}

export interface SearchGroup {
  id: 'yours' | 'guided' | 'official' | 'domains' | 'ask'
  label: string
  rows: SearchRow[]
}

export interface SearchSources extends Pick<TodoSources, 'folders' | 'deadlines' | 'documents'> {
  procedures: Procedure[]
}

export const SHEET_URL = 'https://www.service-public.gouv.fr/particuliers/vosdroits/'

export const searchWords = (query: string) => foldText(query).split(/\s+/).filter(Boolean)

/**
 * The page's one search: what is the user's first (dossiers, pièces, échéances), then the guided
 * démarches, then the official pages, then the domains; the last group always offers to ask.
 * Accents and case are ignored, and every word must be found.
 */
export function searchDemarches(query: string, { folders, deadlines, documents, procedures }: SearchSources, now = new Date()): SearchGroup[] {
  const words = searchWords(query)
  const hit = (...text: Array<string | undefined>) => {
    const hay = foldText(text.filter(Boolean).join(' '))
    return words.every((w) => hay.includes(w))
  }
  const yours: SearchRow[] = [
    ...folders
      .filter((f) => hit(f.title, f.meta))
      .map((f) => ({
        key: `folder:${f.id}`,
        domain: f.domain,
        title: f.title,
        detail: f.meta || (f.settledAt ? `classé le ${shortDate(f.settledAt)}` : 'en cours'),
        kind: 'dossier',
        act: 'ouvrir',
        target: { kind: 'folder' as const, id: f.id }
      })),
    ...documents
      .filter((x) => hit(x.title, x.type))
      .map((x) => ({
        key: `document:${x.id}`,
        domain: x.domain,
        title: x.title,
        detail: x.date ? shortDate(x.date) : x.fileName,
        kind: 'pièce',
        act: 'ouvrir',
        target: { kind: 'letter' as const, id: x.id }
      })),
    ...deadlines
      .filter((d) => d.status === 'todo' && hit(d.title, d.note))
      .map((d) => ({
        key: `deadline:${d.key}`,
        domain: d.domain,
        title: d.title,
        detail: [whenOf(d.date, now).text, d.note].filter(Boolean).join(' · '),
        kind: 'échéance',
        ...{ act: 'voir', target: deadlineTarget(d).target }
      }))
  ]
  const guided = procedures
    .filter((p) => hit(p.title, p.description))
    .map((p) => ({
      key: `procedure:${p.id}`,
      domain: p.domain as DomainId,
      title: p.title,
      detail: `${p.steps.length} étapes · ${p.description}`,
      kind: 'démarche guidée',
      act: 'commencer',
      target: { kind: 'procedure' as const, id: p.id }
    }))
  const official = DOMAINS.flatMap((d) =>
    d.links
      .filter((l) => hit(l.label))
      .map((l) => ({
        key: `link:${l.url}`,
        domain: d.id,
        title: l.label,
        detail: new URL(l.url).hostname.replace(/^www\./, ''),
        kind: 'lien officiel',
        act: 'lire ↗',
        target: { kind: 'url' as const, url: l.url }
      }))
  )
  const domains = DOMAINS.filter((d) => hit(d.label, d.description)).map((d) => ({
    key: `domain:${d.id}`,
    domain: d.id,
    title: d.label,
    detail: d.description,
    kind: 'domaine',
    act: 'ouvrir',
    target: { kind: 'domain' as const, id: d.id }
  }))
  const text = query.trim()
  const ask: SearchRow = {
    key: 'ask',
    domain: '',
    title: `« ${text} »`,
    detail: 'un nouveau dossier, rangé dans son domaine',
    kind: 'question',
    act: 'demander',
    target: { kind: 'ask', text }
  }
  const groups: SearchGroup[] = [
    { id: 'yours', label: 'chez vous', rows: yours },
    { id: 'guided', label: 'démarches guidées', rows: guided },
    { id: 'official', label: 'liens officiels', rows: official },
    { id: 'domains', label: 'domaines', rows: domains },
    { id: 'ask', label: 'demander à Marianne', rows: [ask] }
  ]
  return groups.filter((g) => g.rows.length)
}

/** The rows in order, as ↑ ↓ go through them. */
export const searchRows = (groups: SearchGroup[]) => groups.flatMap((g) => g.rows)
