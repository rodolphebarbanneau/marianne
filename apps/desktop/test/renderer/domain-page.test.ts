import type { Procedure } from '@marianne/content'
import { EMPTY_PROFILE, type Deadline, type Profile } from '@marianne/profile'
import { describe, expect, it } from 'vitest'
import { entitiesOf, folderGroups, folderRow, longDate, sheetTitles, tiedTitle, weekRows } from '../../src/renderer/src/pages/domain-model'
import { hostParts, nextShort, notPlanned, RHYTHMS, rhythmChoices, runLine, runWhen, sameEvery, withEntity } from '../../src/renderer/src/pages/tasks/model'
import type { FolderSummary, TaskRun, TaskTemplate } from '../../src/shared/types'

/** Friday 30 October 2026. */
const NOW = new Date(2026, 9, 30, 10, 40)

const deadline = (more: Partial<Deadline>): Deadline => ({
  key: 'k',
  domain: 'mobility',
  title: 'Échéance',
  date: '2026-11-14',
  source: 'rule',
  status: 'todo',
  ...more
})
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
const profile = (more: Partial<Profile>): Profile => ({ ...EMPTY_PROFILE, ...more })
const clio = { id: 'v1', plate: 'AB-123-CD', model: 'Renault Clio IV', firstRegistration: '2019-03-18', lastInspection: '2025-03-18', critair: '1' }
const template = (more: Partial<TaskTemplate>): TaskTemplate => ({
  id: 'tolls:v1',
  service: 'peage',
  domain: 'mobility',
  title: 'Péages en flux libre',
  checks: 'les passages',
  rhythms: [],
  rhythm: 0,
  allows: [],
  never: '',
  instruction: '',
  sites: [],
  ...more
})

describe('the entities of a domain', () => {
  it('says what the profile holds, and nothing it doesn’t', () => {
    expect(entitiesOf(profile({}), 'vehicles', [])).toEqual([])
    const [plain] = entitiesOf(profile({ vehicles: [{ ...clio, lastInspection: '' }] }), 'vehicles', [])
    expect(plain.facts).toEqual([])
  })

  it('dates the next inspection from its rule, a late one included', () => {
    const list = [deadline({ key: 'inspection:v1:2027-03-18' })]
    expect(entitiesOf(profile({ vehicles: [clio] }), 'vehicles', list)[0].facts).toEqual(['contrôle technique avant le 18 mars 2027'])
    expect(entitiesOf(profile({ vehicles: [clio] }), 'vehicles', [])[0].facts).toEqual(['contrôle technique le 18 mars 2025'])
  })

  it('reads every kind the same way', () => {
    const home = {
      id: 'h1',
      address: '12 rue de la Monnaie, 35000 Rennes',
      inseeCode: '',
      use: 'main_home',
      status: 'tenant',
      rent: '',
      leaseStart: '2026-09-01',
      landlord: ''
    } as const
    expect(entitiesOf(profile({ properties: [home] }), 'properties', [])[0]).toMatchObject({
      name: home.address,
      facts: ['locataire · résidence principale · depuis le 1er sept. 2026']
    })
    const employer = { id: 'e1', name: 'Acme', siren: '', position: 'comptable', contract: 'permanent', start: '', end: '', idcc: '' } as const
    expect(entitiesOf(profile({ employers: [employer] }), 'employers', [])[0]).toMatchObject({ name: 'Acme · comptable', facts: ['cdi'] })
  })

  it('takes the entity out of a deadline’s title on its own card', () => {
    expect(tiedTitle('contrôle technique du véhicule Renault Clio IV', ['AB-123-CD', 'Renault Clio IV'])).toBe('Contrôle technique')
    expect(tiedTitle('Passage A13 à payer · AB-123-CD', ['AB-123-CD', 'Renault Clio IV'])).toBe('Passage A13 à payer')
    expect(tiedTitle('transmettre au bailleur l’attestation', [])).toBe('Transmettre au bailleur l’attestation')
  })
})

describe('the weeks of a domain', () => {
  const inspection = deadline({ key: 'inspection:v1:2026-11-03', title: 'Contrôle', date: '2026-11-03' })
  const loose = deadline({ key: 'calendar:assurance:2026', title: 'Assurance', date: '2026-11-20' })

  it('has a line per entity that has marks, then what none holds', () => {
    const rows = weekRows(['v1', 'v2'], [inspection, loose], NOW)
    expect(rows.map((r) => r.entity)).toEqual(['v1', null])
    expect(rows[0].marks[1].map((m) => m.key)).toEqual(['inspection:v1:2026-11-03'])
    expect(rows[1].marks[3].map((m) => m.key)).toEqual(['calendar:assurance:2026'])
  })

  it('finds a service’s deadline by its params', () => {
    const trip = deadline({ key: 'service:peage:t1', date: '2026-11-01', params: { vehicle: 'v2' } })
    expect(weekRows(['v1', 'v2'], [trip], NOW).map((r) => r.entity)).toEqual(['v2'])
  })

  it('is nothing when nothing falls in the eight weeks', () => {
    expect(weekRows(['v1'], [], NOW)).toEqual([])
    expect(weekRows(['v1'], [deadline({ date: '2027-06-01' })], NOW)).toEqual([])
    expect(weekRows(['v1'], [deadline({ status: 'done' })], NOW)).toEqual([])
  })
})

describe('the folders of a domain', () => {
  it('sorts them: settled, then asleep, then in progress', () => {
    const groups = folderGroups([
      folder({ id: 'a' }),
      folder({ id: 'b', snoozedUntil: '2026-11-01T00:00:00Z' }),
      folder({ id: 'c', settledAt: '2026-06-12T10:00:00Z', snoozedUntil: '2026-11-01T00:00:00Z' })
    ])
    expect(groups.open.map((f) => f.id)).toEqual(['a'])
    expect(groups.asleep.map((f) => f.id)).toEqual(['b'])
    expect(groups.settled.map((f) => f.id)).toEqual(['c'])
  })

  it('says when an asleep or settled folder comes back, in local days', () => {
    // A task's folder sleeps until local midnight, the evening before in UTC.
    const until = new Date(2026, 10, 1).toISOString()
    expect(folderRow(folder({ snoozedUntil: until, meta: 'tâche planifiée' }))).toEqual({ detail: 'tâche planifiée · jusqu’au 1er nov.', state: 'veille' })
    expect(folderRow(folder({ settledAt: new Date(2026, 5, 12, 9).toISOString() }))).toEqual({ detail: 'classé le 12 juin', state: 'classe' })
  })

  it('keeps a running folder’s own status', () => {
    expect(folderRow(folder({ status: 'approval', meta: 'attend votre accord' })).state).toBe('approval')
  })
})

describe('the sheets of a domain', () => {
  it('takes their titles from what the guided démarches call them', () => {
    const procedure = {
      steps: [
        { title: '', body: '', actions: [{ kind: 'sheet', target: 'F31269', label: 'Lire la fiche dépôt de garantie' }] },
        {
          title: '',
          body: '',
          actions: [
            { kind: 'sheet', target: 'N20312', label: 'Lire le dossier litiges avec l’administration' },
            { kind: 'open', target: 'caf', label: 'Ouvrir' }
          ]
        }
      ]
    } as unknown as Procedure
    expect(sheetTitles([procedure])).toEqual(
      new Map([
        ['F31269', 'Dépôt de garantie'],
        ['N20312', 'Litiges avec l’administration']
      ])
    )
  })
})

describe('what a task says', () => {
  it('names its entity', () => {
    expect(withEntity({ title: 'Péages', entity: { label: 'AB-123-CD' } })).toBe('Péages · AB-123-CD')
    expect(withEntity({ title: 'Points du permis' })).toBe('Points du permis')
  })

  it('tells its next day, and today once it has come', () => {
    expect(nextShort('2026-11-01', NOW)).toBe('dim. 1er nov.')
    expect(nextShort('2027-01-15', NOW)).toBe('ven. 15 janv.')
    expect(nextShort('2026-10-30', NOW)).toBe('aujourd’hui')
    expect(nextShort('2026-10-28', NOW)).toBe('aujourd’hui')
  })

  it('tells a run in its own words, or by its outcome', () => {
    const run = (more: Partial<TaskRun>): TaskRun => ({ at: new Date(2026, 9, 30, 8, 2).toISOString(), outcome: 'nothing', ...more })
    expect(runWhen(run({}).at)).toBe('vendredi 30 oct. à 8 h 02')
    expect(runLine(run({}))).toBe('rien trouvé')
    expect(runLine(run({ outcome: 'found', text: '1 passage trouvé' }))).toBe('1 passage trouvé')
    expect(runLine(run({ due: '2026-10-29' }))).toBe('rattrapée · rien trouvé')
  })

  it('sets the sites apart on its sheet', () => {
    expect(hostParts('aller sur www.sanef.com et paiement.aliae.com sans redemander', ['www.sanef.com', 'paiement.aliae.com'])).toEqual([
      { text: 'aller sur ', host: false },
      { text: 'www.sanef.com', host: true },
      { text: ' et ', host: false },
      { text: 'paiement.aliae.com', host: true },
      { text: ' sans redemander', host: false }
    ])
    expect(hostParts('noter ce qu’elle trouve', [])).toEqual([{ text: 'noter ce qu’elle trouve', host: false }])
  })

  it('offers the presets, with its own rhythm when it isn’t one', () => {
    expect(rhythmChoices({ unit: 'day', n: 2 })).toBe(RHYTHMS)
    const choices = rhythmChoices({ unit: 'week', n: 2 })
    expect(choices).toHaveLength(RHYTHMS.length + 1)
    expect(sameEvery(choices[0], { unit: 'week', n: 2 })).toBe(true)
  })

  it('says what an entity’s card misses', () => {
    expect(notPlanned(template({ unplanned: 'péages non vérifiés' }))).toBe('péages non vérifiés')
    expect(notPlanned(template({ service: 'autre', title: 'Relevé' }))).toBe('Relevé : non planifiée')
  })
})

describe('long dates', () => {
  it('reads as the wireframe does', () => {
    expect(longDate('2027-03-18')).toBe('18 mars 2027')
    expect(longDate('2026-09-01')).toBe('1er sept. 2026')
  })
})
