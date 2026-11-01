import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Archive } from '@marianne/archive'
import type { TokenDef } from '@marianne/profile'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogueState } from '../src/shared/catalogue'
import type { SandboxInvoke } from '../src/shared/community'

/**
 * Marianne acting with her services: what the engines learn of the services that aren't on (her own
 * only), the services tool, proposing one on a card that leads to « avant d’ajouter » (added, refused,
 * unanswered; never a community service, never twice in a folder), and planning a service's own task
 * from the conversation as the Démarches sheet plans it; the sites a service declares, and a task's
 * follow-up. The host is the app's, with built-in services of the test's (one left out: its site is a
 * public suffix) and community ones (one left out: it declares sites), whose sandbox is a fake.
 */

// ~/.marianne points at a temporary folder, before paths.ts reads it.
const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-service-proposals-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

const PLATE = 'GH-482-KX'

vi.mock('electron', () => ({ app: { getVersion: () => '0', isPackaged: false }, clipboard: { writeText: () => undefined } }))
// Built-in services, none among a new account's: 3615 VIGNETTE, which reads the profile, acts on a site and proposes a task, 3615
// CIEL, and 3615 PARTAGE, whose site is shared by many.
vi.mock('../src/main/host/registry', () => {
  const service = (code: string, name: string, description: string, more: object, runtime: object) => ({
    pkg: { name: `@marianne/service-${code}`, version: '1.0.0', marianne: { code, name, description, category: 'daily', hosts: [], domains: [], ...more } },
    module: { activate: () => runtime },
    starter: false
  })
  const zones = {
    name: 'zones',
    label: 'zones à faibles émissions',
    description: 'The low-emission zones.',
    input: {},
    readOnly: true,
    run: async () => 'none'
  }
  const template = {
    id: 'zfe:v1',
    domain: 'mobility',
    title: 'Zones à faibles émissions',
    checks: 'les nouvelles restrictions de circulation',
    detail: 'sur le site de la métropole',
    entity: { id: 'v1', label: 'GH-482-KX' },
    rhythms: [
      { every: { unit: 'week', n: 1 }, label: 'chaque semaine' },
      { every: { unit: 'month', n: 1 }, label: 'chaque mois', note: 'les arrêtés changent rarement' }
    ],
    rhythm: 1,
    allows: ['lire les arrêtés de la métropole'],
    never: 'payer, signer ou envoyer',
    instruction: 'Look for new low-emission rules.',
    sites: ['www.metropole.example'],
    followUp: { label: 'voir où rouler', instruction: 'Show the user where the new rules apply, on the metropole’s site.', more: 'dropped' }
  }
  // Its follow-up's label starts with a capital: left out.
  const wrong = { ...template, id: 'zfe:v2', followUp: { label: 'Voir où rouler', instruction: 'Show the user.' } }
  return {
    BUILTIN_SERVICES: [
      service(
        'vignette',
        'Vignette',
        'la vignette de vos véhicules et les zones à faibles émissions',
        {
          hosts: ['api.zfe.example'],
          domains: ['mobility'],
          permissions: { profile: ['vehicles.critair'], purpose: 'vous dire où vous pouvez rouler' },
          tools: [{ name: 'zones', label: 'zones à faibles émissions' }],
          sites: ['paiement.vignette.example']
        },
        { tools: [zones], tasks: () => [template, wrong], instructions: 'Use vignette_zones.' }
      ),
      service('ciel', 'Ciel', 'le temps qu’il fait', {}, {}),
      service('partage', 'Partage', 'des pages de tous', { sites: ['github.io'] }, {})
    ],
    RENAMED_SERVICES: {}
  }
})
// A community service's sandbox that loads at once and answers as its code would: nothing to lend.
vi.mock('../src/main/community/runtime/sandbox', async (original) => ({
  ...(await original<typeof import('../src/main/community/runtime/sandbox')>()),
  electronSandbox: () => (_code: string, events: { loaded(): void; reply(id: unknown, reply: unknown): void }) => {
    setTimeout(() => events.loaded(), 0)
    const description = {
      methods: [],
      tools: [],
      skills: [],
      instructions: '',
      has: { today: false, summary: false, deadlines: false, tile: false },
      tileEveryMinutes: null
    }
    return {
      send: (m: SandboxInvoke) => setTimeout(() => events.reply(m.id, { json: JSON.stringify(m.kind === 'activate' ? description : null) }), 0),
      destroy: () => undefined
    }
  }
}))

import { accounts } from '../src/main/account'
import { approvals } from '../src/main/approvals'
import { folders } from '../src/main/folders'
import { services } from '../src/main/host'
import { callTool } from '../src/main/mcp'
import { profile } from '../src/main/profile/store'
import { session } from '../src/main/session'
import { offeredTemplate, tasks, templateTask } from '../src/main/tasks'
import { servicesTools } from '../src/main/tools/services'
import { taskTools } from '../src/main/tools/tasks'
import type { ApprovalPart, ChatMessage } from '../src/shared/types'

function memoryArchive(): Archive {
  const records = new Map<string, Map<string, unknown>>()
  const of = (kind: string) => records.get(kind) ?? records.set(kind, new Map()).get(kind)!
  return {
    get: (kind: string, id: string) => structuredClone(of(kind).get(id) ?? null),
    put: (kind: string, id: string, value: unknown) => void of(kind).set(id, structuredClone(value)),
    remove: (kind: string, id: string) => void of(kind).delete(id),
    ids: (kind: string) => [...of(kind).keys()],
    list: (kind: string) => [...of(kind).values()].map((v) => structuredClone(v)),
    close: () => undefined
  } as unknown as Archive
}

/** A community service added on this computer and validated (3615 BONJOUR): its folder, its package.json the only file to check. */
function installed(code = 'bonjour', more: object = {}) {
  const dir = join(root, 'packages', code)
  mkdirSync(dir, { recursive: true })
  const json = JSON.stringify({
    name: `@marianne/service-${code}`,
    version: '1.0.0',
    author: 'Collectif Bonjour',
    marianne: { code, name: 'Bonjour', description: 'un salut', category: 'culture', hosts: [], domains: ['family'], ...more }
  })
  writeFileSync(join(dir, 'package.json'), json)
  return {
    code,
    version: '1.0.0',
    dir,
    sha256: 'b'.repeat(64),
    verdict: 'validated' as const,
    installedAt: '2026-10-30T09:00:00Z',
    files: { 'package.json': createHash('sha256').update(json).digest('hex') }
  }
}

const tool = (name: string) => [...servicesTools, ...taskTools].find((t) => t.name === name)!
/** A call as the engine makes it, through the gate; its text, or « refused: » and why. */
async function call(folderId: string, name: string, args: Record<string, unknown> = {}): Promise<string> {
  const answer = await callTool(tool(name), args, { folderId })
  const text = answer.content[0].text
  return answer.isError ? `refused: ${text}` : text
}

let parts: ApprovalPart[] = []
const onPart = (_folderId: string, part: ApprovalPart) => void parts.push(part)
/** The card waiting for the user. */
async function pending(): Promise<ApprovalPart> {
  await vi.waitFor(() => expect(parts.some((p) => p.status === 'pending')).toBe(true))
  return parts.find((p) => p.status === 'pending')!
}
const folder = (title = 'Rouler en ville') => folders.create({ title, engine: 'claude' }).id
/** On, and what it reads granted: as the user leaves it after adding it from the card. */
function addVignette(): void {
  services.add('vignette')
  services.setAccess('vignette', ['vehicles.critair'])
}

const pkg = installed()
/** 3615 ATELIER, a community service whose manifest declares sites to act on: the host leaves it out. */
const atelier = installed('atelier', { sites: ['paiement.atelier.example'] })
const FOLLOW_UP = { label: 'voir où rouler', instruction: 'Show the user where the new rules apply, on the metropole’s site.' }

beforeAll(() => {
  const catalogue = {
    status: 'ready',
    entries: [{ code: 'bonjour', status: 'validated', file: { url: 'https://x.test/b.3615', size: 1, sha256: pkg.sha256 } }],
    withdrawn: []
  }
  services.start({
    catalogue: { state: () => catalogue as unknown as CatalogueState, on: () => undefined } as never,
    packages: { installed: () => [pkg, atelier], remove: async () => undefined, on: () => undefined } as never,
    appToolNames: () => [],
    protectedHosts: () => new Set()
  })
})
beforeEach(() => {
  session.open(memoryArchive())
  // The community service, among this account's services, this very version reviewed.
  accounts.updateSettings({ services: { added: ['bonjour'], reviewed: { bonjour: { sha256: pkg.sha256, version: '1.0.0' } } } })
  parts = []
  approvals.on('part', onPart)
  approvals.canShow = () => true
  vi.spyOn(profile, 'tokens').mockReturnValue([{ token: 'vehicle.1.plate', label: 'plaque', value: PLATE, kind: 'id' } satisfies TokenDef])
})
afterEach(() => {
  approvals.off('part', onPart)
  approvals.canShow = () => false
  session.lock()
  vi.restoreAllMocks()
})

describe('what the engines know of the services that aren’t on', () => {
  it('Marianne’s own, not added or switched off; never a community service', () => {
    expect(services.idle().map((s) => [s.manifest.id, s.added])).toEqual([
      ['vignette', false],
      ['ciel', false]
    ])
    services.add('ciel')
    services.switch('ciel', false)
    services.switch('bonjour', false)
    expect(services.states().find((s) => s.manifest.id === 'bonjour')).toMatchObject({ added: true, on: false })
    expect(services.idle().map((s) => [s.manifest.id, s.added])).toEqual([
      ['vignette', false],
      ['ciel', true]
    ])
  })

  it('the services tool: those on, with their tools and tasks; then Marianne’s own off or not added; a community one only while on', async () => {
    addVignette()
    services.add('ciel')
    services.switch('ciel', false)
    const text = await call(folder(), 'services')
    expect(text).toContain('## On\n\n- **vignette** · 3615 VIGNETTE · Vignette: la vignette de vos véhicules et les zones à faibles émissions')
    expect(text).toContain(
      'domains: mobility · tools: vignette_zones (zones à faibles émissions) · reaches api.zfe.example · acts on: paiement.vignette.example · reads of the profile'
    )
    expect(text).toContain('- template "zfe:v1": Zones à faibles émissions · checks les nouvelles restrictions de circulation')
    expect(text).toContain('rhythms: 0 chaque semaine, 1 chaque mois (usual) · when a run finds something, the user gets a button: « voir où rouler »')
    // What a task is about reaches the engine as a token, as any identifier.
    expect(text).toContain('for [[vehicle.1.plate]]')
    expect(text).not.toContain(PLATE)
    expect(text).toContain('- **bonjour** · 3615 BONJOUR · Bonjour · community service, reviewed by Marianne: un salut')
    expect(text).toMatch(/## Off\n[\s\S]*- \*\*ciel\*\*[\s\S]*switched off/)

    services.switch('bonjour', false)
    services.remove('vignette')
    const after = await call(folder(), 'services')
    expect(after).not.toContain('bonjour')
    expect(after).toMatch(/## Not added\n[\s\S]*- \*\*vignette\*\*/)
  })
})

describe('proposing a service', () => {
  const propose = (folderId: string, code = 'vignette') => call(folderId, 'service_propose', { code, reason: 'Pour savoir où vous pouvez rouler.' })

  it('shows what it does, reaches and would read, then waits for the user’s own act and what it asks to read', async () => {
    const answer = propose(folder())
    const card = await pending()
    expect(card).toMatchObject({ kind: 'add', action: 'add', service: { code: 'vignette', off: false }, title: 'Ajouter 3615 VIGNETTE' })
    expect(card.always).toBeUndefined()
    expect(card.fields).toEqual([
      { label: 'service', value: '3615 VIGNETTE · Vignette' },
      { label: 'ce qu’il fait', value: 'la vignette de vos véhicules et les zones à faibles émissions' },
      { label: 'se connecte à', value: 'api.zfe.example' },
      { label: 'Marianne pourra agir pour vous sur', value: 'paiement.vignette.example' },
      { label: 'lira de votre profil', value: 'la vignette Crit’Air de vos véhicules, pour vous dire où vous pouvez rouler, si vous l’acceptez' },
      { label: 'outils pour Marianne', value: 'zones à faibles émissions' }
    ])
    // Added in « avant d’ajouter »: the card waits for what it asks to read, asked at once.
    services.add('vignette')
    await new Promise((r) => setTimeout(r, 10))
    expect(card.status).toBe('pending')
    services.setAccess('vignette', ['vehicles.critair'])
    expect(await answer).toMatch(
      /^The user added 3615 VIGNETTE\. It may read vehicles\.critair\. Its tools reach you in a new turn, which Marianne starts herself/
    )
    expect(card.status).toBe('accepted')
    // On now: nothing more to propose.
    expect(await propose(folder())).toBe('3615 VIGNETTE is already on: use its tools.')
  })

  it('says so when the user let it read nothing', async () => {
    const answer = propose(folder())
    await pending()
    services.add('vignette')
    services.setAccess('vignette', [])
    expect(await answer).toContain('The user didn’t let it read vehicles.critair')
  })

  it('switches back on one the user had switched off', async () => {
    services.add('ciel')
    services.switch('ciel', false)
    const answer = propose(folder(), 'ciel')
    expect(await pending()).toMatchObject({ title: 'Réactiver 3615 CIEL', service: { code: 'ciel', off: true } })
    services.switch('ciel', true)
    expect(await answer).toMatch(/^The user switched 3615 CIEL back on\. Its tools/)
  })

  it('refused, or left unanswered: Marianne carries on without it, and doesn’t propose it again in that folder', async () => {
    const f = folder()
    const refusing = propose(f)
    approvals.respond((await pending()).id, 'refuse')
    expect(await refusing).toMatch(/^refused: The user didn’t add it: carry on without 3615 VIGNETTE, and don’t propose it again in this folder/)
    parts = []
    expect(await propose(f)).toMatch(/^refused: The user already declined 3615 VIGNETTE in this folder/)
    expect(parts).toEqual([])

    const other = folder()
    const unanswered = propose(other)
    await pending()
    // The turn ended without an answer.
    approvals.expire(other)
    expect(await unanswered).toMatch(/^refused: No answer from the user: carry on without 3615 VIGNETTE/)
    expect(await propose(other)).toMatch(/^refused: The user already declined/)

    // A yes on the card isn't adding it: only the user's act in « avant d’ajouter » is.
    const third = folder()
    const approved = propose(third)
    approvals.respond((await pending()).id, 'approve')
    expect(await approved).toMatch(/^refused: The user didn’t add it/)
    expect(services.states().find((s) => s.manifest.id === 'vignette')?.added).toBe(false)
  })

  it('reads what the folder’s conversation kept: a card refused before, in another session', async () => {
    const f = folder()
    const card: ApprovalPart = {
      type: 'approval',
      id: 'c1',
      kind: 'add',
      action: 'add',
      service: { code: 'vignette', off: false },
      title: '',
      fields: [],
      status: 'refused'
    }
    const kept: ChatMessage = { id: 'm1', role: 'assistant', at: '2026-10-30T09:00:00.000Z', parts: [card] }
    folders.saveMessages(f, [kept])
    expect(await propose(f)).toMatch(/^refused: The user already declined/)
  })

  it('never a community service, nor one Marianne doesn’t have', async () => {
    for (const code of ['bonjour', 'nowhere']) expect(await propose(folder(), code)).toMatch(/^refused: Marianne proposes only her own services/)
    expect(parts).toEqual([])
  })
})

describe('planning a service’s own task from the conversation', () => {
  const plan = (folderId: string, args: Record<string, unknown> = {}) => call(folderId, 'task_propose', { service: 'vignette', template: 'zfe:v1', ...args })

  it('takes everything from the template, shows what the sheet shows, and plans it in the calling folder', async () => {
    addVignette()
    const f = folder()
    const answer = plan(f)
    const card = await pending()
    expect(card).toMatchObject({ kind: 'proposal', action: 'task', title: `Planifier « Zones à faibles émissions · ${PLATE} » ?` })
    expect(card.fields).toEqual([
      { label: 'tâche', value: `Zones à faibles émissions · ${PLATE}` },
      { label: 'service', value: '3615 VIGNETTE' },
      { label: 'vérifier', value: 'les nouvelles restrictions de circulation · sur le site de la métropole' },
      { label: 'pour', value: PLATE },
      { label: 'quand', value: 'chaque mois, à votre première ouverture du jour prévu · les arrêtés changent rarement' },
      { label: 'Marianne pourra', value: 'lire les arrêtés de la métropole' },
      { label: 'sites sans redemander', value: 'www.metropole.example' },
      { label: 'jamais', value: 'payer, signer ou envoyer' },
      { label: 'si elle trouve quelque chose', value: 'voir où rouler' },
      { label: 'vous prévenir', value: 'seulement si elle trouve' },
      { label: 'dossier', value: 'celui-ci' }
    ])
    approvals.respond(card.id, 'approve')
    const text = await answer
    expect(text).toMatch(/^Planned: « Zones à faibles émissions · \[\[vehicle\.1\.plate\]\] », chaque mois, next on .*It comes back in this folder\.$/)
    expect(tasks.byFolder(f)).toMatchObject({
      origin: { kind: 'service', service: 'vignette', template: 'zfe:v1' },
      instruction: 'Look for new low-emission rules.',
      sites: ['www.metropole.example'],
      entity: { id: 'v1', label: PLATE },
      every: { unit: 'month', n: 1 },
      why: 'les arrêtés changent rarement',
      followUp: FOLLOW_UP
    })
    // Taken, it is no longer proposed.
    expect(await plan(folder())).toMatch(/^refused: 3615 VIGNETTE doesn’t propose the task "zfe:v1" now/)
  })

  it('in a new folder of its own when the calling one already has its task; at the rhythm the engine names', async () => {
    addVignette()
    const f = folder()
    tasks.create({
      title: 'Contrôle technique',
      domain: 'mobility',
      runner: 'remind',
      origin: { kind: 'user' },
      every: { unit: 'year', n: 1 },
      everyLabel: 'chaque année',
      folderId: f
    })
    const answer = plan(f, { rhythm: 0 })
    const card = await pending()
    expect(card.fields.at(-1)).toEqual({ label: 'dossier', value: `un nouveau dossier, « Zones à faibles émissions · ${PLATE} » : celui-ci a déjà sa tâche` })
    approvals.respond(card.id, 'approve')
    expect(await answer).toContain('It comes back in a new folder of its own')
    const planned = tasks.list().find((t) => t.origin.kind === 'service')!
    expect(planned.folderId).not.toBe(f)
    expect(planned.everyLabel).toBe('chaque semaine')
    expect(folders.get(planned.folderId)?.title).toBe(`Zones à faibles émissions · ${PLATE}`)
  })

  it('refuses a template that isn’t offered, a rhythm it doesn’t have, and words of the engine’s', async () => {
    // Its service isn't on: none of its tasks is offered.
    expect(await plan(folder())).toMatch(/^refused: 3615 VIGNETTE doesn’t propose the task/)
    addVignette()
    expect(await plan(folder(), { template: 'zfe:v9' })).toMatch(/^refused: 3615 VIGNETTE doesn’t propose the task "zfe:v9"/)
    expect(await plan(folder(), { service: 'bonjour', template: 'x' })).toMatch(/^refused: 3615 BONJOUR doesn’t propose/)
    expect(await plan(folder(), { rhythm: 5 })).toMatch(/^refused: Not one of its rhythms\. Its rhythms: 0 chaque semaine, 1 chaque mois\.$/)
    expect(await plan(folder(), { instruction: 'Payer les amendes.', sites: ['evil.example'] })).toMatch(
      /^refused: A service’s task takes everything from the service: leave out instruction, sites/
    )
    expect(await plan(folder(), { template: undefined })).toMatch(/^refused: A service’s task needs both service and template/)
    expect(parts).toEqual([])
    expect(tasks.list()).toEqual([])
  })

  it('without a service, stays as it was', async () => {
    const f = folder()
    expect(await call(f, 'task_propose', { title: 'Les arrêtés' })).toMatch(/^refused: A task needs its title, runner and every/)
    const answer = call(f, 'task_propose', { title: 'Les arrêtés', runner: 'remind', every: { unit: 'week', n: 1 } })
    approvals.respond((await pending()).id, 'approve')
    expect(await answer).toMatch(/^Planned: « Les arrêtés », chaque semaine/)
    expect(tasks.byFolder(f)?.origin).toEqual({ kind: 'agent' })
  })
})

describe('the path the Démarches sheet and task_propose share', () => {
  it('offers what isn’t planned yet, at the template’s rhythms only', () => {
    addVignette()
    const [template] = services.taskTemplates()
    expect(offeredTemplate([template], [], 'vignette', 'zfe:v1')).toBe(template)
    expect(offeredTemplate([template], [], 'vignette', 'zfe:v2')).toBeNull()
    expect(templateTask(template, 0)).toMatchObject({
      runner: 'marianne',
      every: { unit: 'week', n: 1 },
      everyLabel: 'chaque semaine',
      instruction: template.instruction,
      followUp: FOLLOW_UP
    })
    for (const rhythm of [2, -1, 0.5, '__proto__']) expect(templateTask(template, rhythm as number)).toBeNull()
    const planned = tasks.create(templateTask(template, 1)!)
    expect(offeredTemplate([template], [planned], 'vignette', 'zfe:v1')).toBeNull()
  })
})

describe('the sites a service declares, and a task’s follow-up', () => {
  it('leaves out a built-in service whose site is shared by many, and a community service that declares any', () => {
    accounts.updateSettings({ services: { added: ['bonjour', 'atelier', 'partage'] } })
    expect(services.states().map((s) => s.manifest.id)).toEqual(['vignette', 'ciel', 'bonjour'])
  })

  it('counts the sites of the built-in services that are on, where Marianne acts, and tells the engines', () => {
    expect(services.declaredSites()).toEqual([])
    addVignette()
    expect(services.declaredSites()).toEqual(['paiement.vignette.example'])
    expect(services.instructions()).toContain('Use vignette_zones.\n\nActs on: paiement.vignette.example (where you act for the user for it, in the browser).')
    services.switch('vignette', false)
    expect(services.declaredSites()).toEqual([])
  })

  it('leaves out a template whose follow-up isn’t right, and keeps the others’ as plain data', () => {
    addVignette()
    expect(services.taskTemplates().map((t) => [t.id, t.followUp])).toEqual([['zfe:v1', FOLLOW_UP]])
  })
})
