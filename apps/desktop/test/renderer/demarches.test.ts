import type { Deadline, DocumentMeta } from '@marianne/profile'
import type { Procedure } from '@marianne/content'
import { describe, expect, it } from 'vitest'
import {
  aboutEntity,
  dayLabel,
  domainByNumber,
  hourOf,
  presses,
  proposed,
  searchDemarches,
  searchRows,
  shortDate,
  todoItems,
  type TodoSources,
  weekLabels,
  weekMarks,
  weeksFrom,
  whenOf
} from '../../src/renderer/src/lib/demarches'
import { ticketCells, TICKET_MACHINE_ART } from '../../src/renderer/src/components/ticket-machine'
import { MINITEL_ART } from '../../src/renderer/src/pages/services/kiosk'
import type { FolderSummary, PlannedTask, TaskTemplate } from '../../src/shared/types'

/** Friday 30 October 2026. */
const NOW = new Date(2026, 9, 30, 10, 40)

const folder = (more: Partial<FolderSummary>): FolderSummary => ({
  id: 'f',
  title: 'Dossier',
  domain: 'housing',
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
const document = (more: Partial<DocumentMeta>): DocumentMeta => ({
  id: 'd',
  domain: 'mobility',
  title: 'Avis de contravention',
  type: 'letter',
  date: '2026-10-22',
  entity: '',
  fileName: 'avis.pdf',
  mime: 'application/pdf',
  size: 1,
  addedAt: '',
  ...more
})
const task = (more: Partial<PlannedTask>): PlannedTask => ({
  id: 't',
  folderId: 'tf',
  domain: 'mobility',
  title: 'Péages en flux libre',
  runner: 'marianne',
  origin: { kind: 'service', service: 'peage', template: 'tolls:v1' },
  every: { unit: 'day', n: 2 },
  everyLabel: 'tous les 2 jours',
  sites: [],
  notify: 'found',
  next: '2026-11-01',
  on: true,
  runs: [],
  ...more
})
const none: TodoSources = { folders: [], deadlines: [], documents: [], tasks: [], services: [] }

describe('when something falls', () => {
  it('says it in words near, and as a date far', () => {
    expect(whenOf('2026-10-29', NOW)).toEqual({ text: 'en retard de 1 j', tone: 'late' })
    expect(whenOf('2026-10-30', NOW)).toEqual({ text: 'aujourd’hui', tone: 'soon' })
    expect(whenOf('2026-10-31', NOW)).toEqual({ text: 'demain', tone: 'soon' })
    expect(whenOf('2026-11-01', NOW)).toEqual({ text: 'dimanche', tone: 'soon' })
    expect(whenOf('2026-11-14', NOW)).toEqual({ text: 'dans 15 j', tone: '' })
    expect(whenOf('2026-12-04', NOW)).toEqual({ text: '4 déc.', tone: '' })
  })

  it('says the year only of a day far enough to be taken for this year’s', () => {
    expect(dayLabel('2026-11-01', NOW)).toBe('dimanche 1er nov.')
    expect(dayLabel('2027-01-15', NOW)).toBe('vendredi 15 janv.')
    expect(dayLabel('2027-10-30', NOW)).toBe('samedi 30 oct. 2027')
  })

  it('says the first of the month, and the hour of what has one', () => {
    expect(shortDate('2026-11-01')).toBe('1er nov.')
    expect(hourOf('2026-11-01')).toBe('')
    expect(hourOf('2026-11-01T18:12')).toBe(' à 18 h 12')
    expect(hourOf('2026-11-01T18:00')).toBe(' à 18 h')
  })
})

describe('à faire', () => {
  it('ranks: late, what waits for the user, the 3 days, then by date', () => {
    const items = todoItems(
      {
        ...none,
        folders: [folder({ id: 'a', status: 'approval', title: 'APL' })],
        deadlines: [
          deadline({ key: 'far', date: '2026-12-01', title: 'loin' }),
          deadline({ key: 'near', date: '2026-11-14', title: 'proche' }),
          deadline({ key: 'soon', date: '2026-11-01', title: 'dimanche' }),
          deadline({ key: 'late', date: '2026-10-28', title: 'retard' })
        ]
      },
      undefined,
      NOW
    )
    expect(items.map((x) => x.title)).toEqual(['retard', 'APL', 'dimanche', 'proche', 'loin'])
    expect(items.filter(presses).map((x) => x.title)).toEqual(['retard', 'APL', 'dimanche'])
  })

  it('keeps what the rules dated today because it is late at the top', () => {
    const items = todoItems(
      {
        ...none,
        folders: [folder({ status: 'approval' })],
        deadlines: [deadline({ date: '2026-10-30', note: 'en retard : l’échéance était le 01/10/2026', title: 'retard' })]
      },
      undefined,
      NOW
    )
    expect(items[0]).toMatchObject({ title: 'retard', rank: 0, when: { text: 'en retard', tone: 'late' } })
  })

  it('leaves out what is beyond 45 days, done, or a settled folder', () => {
    const items = todoItems(
      {
        ...none,
        folders: [folder({ status: 'approval', settledAt: '2026-10-01' })],
        deadlines: [deadline({ date: '2026-12-15' }), deadline({ key: 'x', status: 'done' })]
      },
      undefined,
      NOW
    )
    expect(items).toEqual([])
  })

  it('says where a thing comes from, and that a task found it this morning', () => {
    const service = deadline({
      key: 'service:peage:t1',
      source: 'service',
      service: 'peage',
      title: 'Passage A13',
      date: '2026-11-01T18:12',
      note: 'reste 2 j'
    })
    const tasks = [task({ runs: [{ at: new Date(2026, 9, 30, 8, 2).toISOString(), outcome: 'found' }] })]
    const [item] = todoItems({ ...none, deadlines: [service], tasks }, undefined, NOW)
    expect(item).toMatchObject({ chip: '3615 PEAGE', act: 'ouvrir', when: { text: 'dimanche à 18 h 12', tone: 'soon' } })
    expect(item.detail).toBe('trouvé ce matin par sa tâche · reste 2 j')
  })

  it('brings back a task that needs the user or failed, and not a paused one', () => {
    const waiting = task({ runs: [{ at: '2026-10-30T07:00:00Z', outcome: 'waiting', text: 'le site demande un code' }] })
    const paused = task({ id: 'p', on: false, runs: [{ at: '2026-10-30T07:00:00Z', outcome: 'failed' }] })
    const items = todoItems({ ...none, tasks: [waiting, paused] }, undefined, NOW)
    expect(items.map((x) => x.target)).toEqual([{ kind: 'folder', id: 'tf' }])
    expect(items[0].detail).toBe('le site demande un code')
  })

  it('brings back a task that found something it offers to follow up, opening its folder at that run, while its service is on', () => {
    const run = { at: '2026-10-30T07:00:00Z', outcome: 'found' as const, text: '1 passage sur l’A13 le 29/10', reported: true }
    const followUp = { label: 'payer maintenant', instruction: 'Pay what the run found.' }
    const peage = (on: boolean) => [{ manifest: { id: 'peage' }, on }] as TodoSources['services']
    const items = todoItems({ ...none, tasks: [task({ runs: [run], followUp })], services: peage(true) }, undefined, NOW)
    expect(items).toEqual([
      expect.objectContaining({
        rank: 1,
        when: { text: 'une tâche a trouvé', tone: 'you' },
        detail: '1 passage sur l’A13 le 29/10 · « payer maintenant » dans son dossier',
        act: 'ouvrir',
        target: { kind: 'folder', id: 'tf', at: 'run' },
        wait: 'une tâche a trouvé'
      })
    ])
    // Found without a follow-up, paused, its service off, its folder read: nothing waits for the user.
    expect(todoItems({ ...none, tasks: [task({ runs: [run] })], services: peage(true) }, undefined, NOW)).toEqual([])
    expect(todoItems({ ...none, tasks: [task({ runs: [run], followUp, on: false })], services: peage(true) }, undefined, NOW)).toEqual([])
    expect(todoItems({ ...none, tasks: [task({ runs: [run], followUp })], services: peage(false) }, undefined, NOW)).toEqual([])
    const read = [folder({ id: 'tf', unread: false })]
    expect(todoItems({ ...none, tasks: [task({ runs: [run], followUp })], services: peage(true), folders: read }, undefined, NOW)).toEqual([])
    // A run that didn't say itself what it found, or a task the main process says is no longer offered (its plate taken back): nothing either.
    const unreported = { ...run, reported: undefined }
    expect(todoItems({ ...none, tasks: [task({ runs: [unreported], followUp })], services: peage(true) }, undefined, NOW)).toEqual([])
    expect(todoItems({ ...none, tasks: [task({ runs: [run], followUp, offered: false })], services: peage(true) }, undefined, NOW)).toEqual([])
  })

  it('lets go of a task that waited once the user has opened its folder', () => {
    const waiting = task({ runs: [{ at: '2026-10-30T07:00:00Z', outcome: 'waiting' }] })
    expect(todoItems({ ...none, tasks: [waiting], folders: [folder({ id: 'tf', unread: true })] }, undefined, NOW)).toHaveLength(1)
    expect(todoItems({ ...none, tasks: [waiting], folders: [folder({ id: 'tf', unread: false })] }, undefined, NOW)).toEqual([])
  })

  it('lists a letter no folder holds', () => {
    const items = todoItems(
      { ...none, documents: [document({}), document({ id: 'e', folderId: 'f' }), document({ id: 'g', type: 'other' as DocumentMeta['type'] })] },
      undefined,
      NOW
    )
    expect(items.map((x) => [x.chip, x.act])).toEqual([['courrier', 'traiter']])
  })

  it('keeps to a domain', () => {
    const items = todoItems({ ...none, deadlines: [deadline({ domain: 'taxes' }), deadline({ key: 'b', domain: 'mobility' })] }, 'mobility', NOW)
    expect(items).toHaveLength(1)
  })
})

describe('the weeks', () => {
  it('start on the current Monday', () => {
    const weeks = weeksFrom(NOW)
    expect(weeks).toHaveLength(8)
    expect([weeks[0].getDate(), weeks[0].getMonth(), weeks[0].getDay()]).toEqual([26, 9, 1])
  })

  it('name the month only where it changes', () => {
    expect(weekLabels(NOW)).toEqual(['sem.', '2 nov.', '9', '16', '23', '30', '7 déc.', '14'])
  })

  it('mark an échéance in its week, red when it presses', () => {
    const marks = weekMarks(
      [deadline({ key: 'a', date: '2026-11-01', title: 'Passage' }), deadline({ key: 'b', date: '2026-11-14' }), deadline({ key: 'c', date: '2027-03-01' })],
      NOW
    )
    expect(marks[0]).toEqual([{ key: 'a', title: 'Passage · 1er nov.', pressing: true }])
    expect(marks[2].map((m) => m.pressing)).toEqual([false])
    expect(marks.flat()).toHaveLength(2)
  })

  it('survive a date nobody can read', () => {
    expect(weekMarks([deadline({ date: '2026-13-45' })], NOW).flat()).toEqual([])
  })

  it('put what is late in the current week', () => {
    expect(weekMarks([deadline({ date: '2026-10-01' })], NOW)[0]).toHaveLength(1)
  })

  it('tie an échéance to its entity', () => {
    expect(aboutEntity(deadline({ key: 'inspection:v2:2026-11-14' }), 'v2')).toBe(true)
    expect(aboutEntity(deadline({ key: 'inspection:v2:2026-11-14' }), 'v1')).toBe(false)
    expect(aboutEntity(deadline({ key: 'service:peage:t1', params: { vehicle: 'v1' } }), 'v1')).toBe(true)
  })
})

describe('a number typed', () => {
  it('calls its domain, and nothing else does', () => {
    expect(domainByNumber('8')?.id).toBe('mobility')
    expect(domainByNumber(' 10 ')?.id).toBe('business')
    expect(domainByNumber('11')).toBeNull()
    expect(domainByNumber('amende')).toBeNull()
  })
})

describe('what the services propose', () => {
  it('leaves out what the user has already planned', () => {
    const template = (id: string): TaskTemplate => ({
      id,
      service: 'peage',
      domain: 'mobility',
      title: 't',
      checks: 'c',
      rhythms: [],
      rhythm: 0,
      allows: [],
      never: '',
      instruction: '',
      sites: []
    })
    expect(proposed([template('tolls:v1'), template('tolls:v2')], [task({})]).map((t) => t.id)).toEqual(['tolls:v2'])
  })
})

describe('the search', () => {
  const procedures = [
    { id: 'contest-fine', domain: 'mobility', title: 'Contester une amende', description: 'radar, stationnement', steps: [{}, {}] }
  ] as unknown as Procedure[]
  const sources = {
    folders: [folder({ id: 'f1', title: 'Contester l’amende du 3 mai', domain: 'mobility' })],
    documents: [document({ title: 'Avis d’amende' })],
    deadlines: [deadline({ title: 'Payer l’amende', key: 'd1' })],
    procedures
  }

  it('finds what is the user’s first, then the guided démarches, the official links, the domains, and always offers to ask', () => {
    const groups = searchDemarches('amende', sources, NOW)
    expect(groups.map((g) => g.id)).toEqual(['yours', 'guided', 'official', 'domains', 'ask'])
    expect(groups[0].rows.map((r) => r.kind)).toEqual(['dossier', 'pièce', 'échéance'])
  })

  it('ignores accents and case, and wants every word', () => {
    expect(searchRows(searchDemarches('AMÉNDE MAI', sources, NOW)).map((r) => r.title)).toEqual(['Contester l’amende du 3 mai', '« AMÉNDE MAI »'])
  })

  it('still offers to ask when nothing is found', () => {
    const groups = searchDemarches('zzzz', sources, NOW)
    expect(groups.map((g) => g.id)).toEqual(['ask'])
    expect(groups[0].rows[0].target).toEqual({ kind: 'ask', text: 'zzzz' })
  })
})

describe('the ticket machine', () => {
  it('is on the Minitel’s grid', () => {
    const [width, height] = [MINITEL_ART[0].length, MINITEL_ART.length]
    expect(MINITEL_ART.every((row) => row.length === width)).toBe(true)
    expect(TICKET_MACHINE_ART).toHaveLength(height)
    expect(TICKET_MACHINE_ART.every((row) => row.length === width)).toBe(true)
  })

  it('blinks at its slot at rest, and prints the number', () => {
    const slot = ticketCells(null)
    expect(slot.every((c) => c.blink && TICKET_MACHINE_ART[c.y][c.x] === 's')).toBe(true)
    const cells = ticketCells(8)
    expect(cells.some((c) => c.ink === 'W')).toBe(true)
    expect(cells.some((c) => c.ink === 's')).toBe(true)
    expect(cells.every((c) => c.x < TICKET_MACHINE_ART[0].length && c.y < TICKET_MACHINE_ART.length)).toBe(true)
    // The ticket comes out of the slot: right under it, no wider.
    expect(Math.min(...cells.map((c) => c.y))).toBe(slot[0].y + 1)
    expect(cells.every((c) => TICKET_MACHINE_ART[slot[0].y][c.x] === 's')).toBe(true)
  })

  it('prints both digits, in their places', () => {
    const digits = (n: number) =>
      ticketCells(n)
        .filter((c) => c.ink === 's')
        .map((c) => `${c.x}:${c.y}`)
        .join()
    expect(digits(10)).not.toBe(digits(1))
    expect(digits(10)).not.toBe(digits(11))
  })
})
