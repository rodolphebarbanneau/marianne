import type { Deadline } from '@marianne/profile'
import { readManifest, type ServiceState } from '@marianne/sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { domainLine, domainServices, nextTaskDay, pressingLine, runCell, type TodoSources } from '../../src/renderer/src/lib/demarches'
import type { FolderSummary, PlannedTask, TaskRun } from '../../src/shared/types'

/** Friday 30 October 2026. */
const NOW = new Date(2026, 9, 30, 10, 40)

const folder = (more: Partial<FolderSummary>): FolderSummary => ({
  id: 'f',
  title: 'Dossier',
  domain: 'mobility',
  pinned: false,
  snoozedUntil: '',
  settledAt: '',
  engine: 'claude',
  status: 'idle',
  updatedAt: '',
  meta: '',
  unread: false,
  ...more
})
const deadline = (more: Partial<Deadline>): Deadline => ({
  key: 'k',
  domain: 'mobility',
  title: 'Échéance',
  date: '2026-11-14',
  source: 'rule',
  status: 'todo',
  ...more
})
const task = (more: Partial<PlannedTask>): PlannedTask => ({
  id: 't',
  folderId: 'tf',
  domain: 'mobility',
  title: 'Péages en flux libre',
  runner: 'marianne',
  origin: { kind: 'user' },
  every: { unit: 'day', n: 2 },
  everyLabel: 'tous les 2 jours',
  sites: [],
  notify: 'found',
  next: '2026-11-01',
  on: true,
  runs: [],
  ...more
})
const service = (code: string, more: Partial<ServiceState> & { domains?: string[] } = {}): ServiceState => {
  const { domains = ['mobility'], ...rest } = more
  return {
    manifest: readManifest({
      name: `@marianne/service-${code}`,
      version: '1.0.0',
      marianne: { code, name: code, description: code, category: 'daily', domains, hosts: [] }
    }),
    available: true,
    on: true,
    added: true,
    pinned: false,
    tools: [],
    builtIn: true,
    access: { asked: [], granted: null },
    ...rest
  }
}
const none: TodoSources = { folders: [], deadlines: [], documents: [], tasks: [], services: [] }
const line = (sources: Partial<TodoSources>) => domainLine('mobility', { ...none, ...sources }, NOW)

describe('a domain’s line of the sommaire', () => {
  it('says nothing and steps back when nothing is there', () => {
    expect(line({})).toEqual({ wait: '', next: '', folders: 0, tasks: 0, idle: true })
  })

  it('says what waits for the user, in the words of its kind', () => {
    expect(line({ folders: [folder({ status: 'approval' })] }).wait).toBe('attend votre accord')
    expect(line({ folders: [folder({ status: 'question' })] }).wait).toBe('une question pour vous')
  })

  it('counts what waits when there are several, a task with the folders', () => {
    const waiting = task({ runs: [{ at: '2026-10-30T07:00:00Z', outcome: 'waiting' }] })
    expect(line({ folders: [folder({ status: 'approval' })], tasks: [waiting] }).wait).toBe('2 vous attendent')
    expect(line({ tasks: [waiting] }).wait).toBe('une tâche vous attend')
  })

  it('takes the next échéance, its title cut to what to do', () => {
    const deadlines = [
      deadline({ key: 'b', date: '2026-12-04', title: 'Contrôle technique' }),
      deadline({ key: 'a', date: '2026-11-01', title: 'Passage A13 à payer · AB-123-CD' })
    ]
    expect(line({ deadlines }).next).toBe('Passage A13 à payer · dimanche')
    expect(line({ deadlines: [deadline({ title: 'Assurance : à renouveler' })] }).next).toBe('Assurance · dans 15 j')
  })

  it('says a late échéance first', () => {
    const deadlines = [deadline({ key: 'b' }), deadline({ key: 'a', date: '2026-10-28', title: 'Retard' })]
    expect(line({ deadlines }).next).toBe('Retard · en retard de 2 j')
  })

  it('looks 45 days ahead, at what is still to do, in its domain', () => {
    const deadlines = [deadline({ key: 'far', date: '2026-12-20' }), deadline({ key: 'done', status: 'done' }), deadline({ key: 'other', domain: 'taxes' })]
    expect(line({ deadlines })).toMatchObject({ next: '', idle: true })
  })

  it('counts folders in progress and tasks that are on, not what sleeps', () => {
    const folders = [
      folder({ id: 'a' }),
      folder({ id: 'b', status: 'working' }),
      folder({ id: 'c', snoozedUntil: '2027-01-15' }),
      folder({ id: 'd', settledAt: '2026-10-01' }),
      folder({ id: 'e', domain: 'taxes' })
    ]
    const tasks = [task({ id: 'a' }), task({ id: 'b', on: false }), task({ id: 'c', domain: 'taxes' })]
    expect(line({ folders, tasks })).toMatchObject({ folders: 2, tasks: 1, idle: false })
  })

  it('isn’t idle for an échéance alone, or for a folder asleep that waits', () => {
    expect(line({ deadlines: [deadline({})] }).idle).toBe(false)
    expect(line({ folders: [folder({ status: 'question', snoozedUntil: '2027-01-15' })] })).toMatchObject({ folders: 0, idle: false })
  })
})

describe('the services of a line', () => {
  it('shows those on in the domain, without ANNUAIRE', () => {
    const list = [
      service('peage'),
      service('annuaire'),
      service('meteo', { on: false }),
      service('carte', { added: false }),
      service('parlement', { domains: ['identity'] })
    ]
    expect(domainServices(list, 'mobility').map((s) => s.manifest.id)).toEqual(['peage'])
  })
})

describe('what is said of what presses', () => {
  it('agrees with its number, and says when nothing does', () => {
    expect(pressingLine(3)).toBe('3 vous attendent ou arrivent dans les 3 jours')
    expect(pressingLine(1)).toBe('1 vous attend ou arrive dans les 3 jours')
    expect(pressingLine(0)).toBe('rien ne presse')
  })
})

describe('the next task', () => {
  // The day is told against today's date: the test's, not the machine's.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('names the day of the nearest one that is on', () => {
    const tasks = [task({ id: 'a', next: '2026-11-14' }), task({ id: 'b', next: '2026-10-31', on: false }), task({ id: 'c', next: '2026-11-01' })]
    expect(nextTaskDay(tasks)).toBe('dimanche 1er nov.')
  })

  it('says today for one due today or before', () => {
    expect(nextTaskDay([task({ next: '2026-10-30' })])).toBe('aujourd’hui')
    expect(nextTaskDay([task({ next: '2026-10-28' })])).toBe('aujourd’hui')
  })

  it('has nothing to say when all are paused', () => {
    expect(nextTaskDay([task({ on: false })])).toBe('')
    expect(nextTaskDay([])).toBe('')
  })
})

describe('a run’s cell', () => {
  const run = (more: Partial<TaskRun>): TaskRun => ({ at: new Date(2026, 9, 30, 8, 2).toISOString(), outcome: 'nothing', ...more })

  it('looks like its outcome, and says it with its day', () => {
    expect(runCell(run({}))).toEqual({ look: '', title: '30 oct. · rien trouvé' })
    expect(runCell(run({ outcome: 'found', text: 'Passage A13' }))).toEqual({ look: 'found', title: '30 oct. · trouvé : Passage A13' })
    expect(runCell(run({ outcome: 'waiting' })).look).toBe('you')
    expect(runCell(run({ outcome: 'failed' })).look).toBe('failed')
    expect(runCell(run({ outcome: 'done' })).look).toBe('done')
  })

  it('takes the local day, not the UTC one', () => {
    expect(runCell(run({ at: new Date(2026, 10, 1, 0, 30).toISOString() })).title).toBe('1er nov. · rien trouvé')
  })

  it('shows a run caught up when it found nothing, and says so on any', () => {
    expect(runCell(run({ due: '2026-10-29' }))).toEqual({ look: 'late', title: '30 oct. · rien trouvé · rattrapée' })
    expect(runCell(run({ outcome: 'found', due: '2026-10-29' }))).toEqual({ look: 'found', title: '30 oct. · trouvé · rattrapée' })
  })
})
