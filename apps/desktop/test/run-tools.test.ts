import { rmSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import type { Archive } from '@marianne/archive'
import type { TokenDef } from '@marianne/profile'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Arrival } from '../src/main/browser/payment'

/**
 * What holds a planned task's run, where nobody watches and pages anyone can write are read: its
 * sites only (redirects, clicks and popups included, and a call that outlives its run), clicks on
 * what plainly searches or moves (on the sites its own service declares, anything short of what
 * binds the user), typing the one identifier of its sheet, never a card. The run is a real one
 * (tasks.ts), the calls go through the engine's gate (mcp.ts), the browser is faked. And beside it,
 * what a conversation may do without a card: go where the user allowed ahead, no more, and click
 * the steps on the way on the sites Marianne's own services declare.
 */

// ~/.marianne points at a temporary folder, before paths.ts reads it.
const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-run-tools-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

/**
 * The page: where an address leads (its redirects), where a click leads, what an element says when
 * clicked, how the browser came to it (an address opened: no page sent it; a click: the page clicked
 * did), and its form.
 */
const page = vi.hoisted(() => ({
  url: '',
  title: '',
  folderId: '',
  redirects: {} as Record<string, string>,
  targets: {} as Record<string, string>,
  live: {} as Record<string, string>,
  elements: [] as { id: string; role: string; label: string; type: string; secret: boolean }[],
  arrival: null as Arrival | null,
  form: [] as { id: string; label: string; type: string; required: boolean; value: string }[],
  /** While set, the page doesn't finish loading until `loaded()`. */
  hold: false,
  loaded: () => undefined as void
}))

vi.mock('electron', () => ({ app: { getVersion: () => '0' } }))
vi.mock('../src/main/browser', () => {
  class HumanControlError extends Error {}
  const browser = {
    state: () => ({
      url: page.url,
      title: page.title,
      folderId: page.folderId,
      controller: 'agent',
      visible: false,
      loading: false,
      canGoBack: true,
      canGoForward: false
    }),
    currentUrl: () => page.url,
    pageVersion: () => 1,
    arrival: () => page.arrival,
    inRun: vi.fn(() => true),
    open: vi.fn((url: string, folderId: string) => {
      page.url = page.redirects[url] ?? url
      page.folderId = folderId
      page.title = `Page de ${new URL(page.url).hostname}`
      page.arrival = { url: page.url, initiator: '', hops: [url, page.url], previous: page.arrival }
    }),
    settled: vi.fn(() => (page.hold ? new Promise<void>((resolve) => (page.loaded = resolve)) : Promise.resolve())),
    reveal: vi.fn(),
    readPage: vi.fn(async () => ({ url: page.url, title: page.title, text: 'Le texte de la page.', elements: page.elements })),
    elementLabel: vi.fn(async (id: string) => page.live[id] ?? ''),
    click: vi.fn(async (id: string) => {
      if (page.targets[id]) {
        const from = new URL(page.url).origin
        page.url = page.targets[id]
        page.title = 'Page piégée'
        page.arrival = { url: page.url, initiator: from, hops: [page.url], previous: page.arrival }
      }
    }),
    type: vi.fn(async () => undefined),
    readForm: vi.fn(async () => page.form),
    fillForm: vi.fn(async (values: Record<string, string>) => ({ filled: Object.keys(values), missing: [] })),
    back: vi.fn(),
    setWaiting: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
  return { browser, HumanControlError }
})

import { accounts } from '../src/main/account'
import { approvals } from '../src/main/approvals'
import { browser } from '../src/main/browser'
import { holdToRun, mayOpen } from '../src/main/browser/run-guard'
import { services } from '../src/main/host'
import { callTool } from '../src/main/mcp'
import { profile } from '../src/main/profile/store'
import { session } from '../src/main/session'
import { siteAllowed, tasks, type NewTask } from '../src/main/tasks'
import { ALL_TOOLS } from '../src/main/tools'
import { browserTools } from '../src/main/tools/browser'
import { servicesTools } from '../src/main/tools/services'
import { taskTools } from '../src/main/tools/tasks'
import { folders } from '../src/main/folders'
import { reading } from '../src/main/tools/online'
import type { Tool, ToolContext } from '../src/main/tools/tool'
import type { ApprovalLevel, ApprovalPart, ApprovalRule, PlannedTask } from '../src/shared/types'

/** A fake archive: tasks and folders only need keyed records. */
function memoryArchive(): Archive {
  const records = new Map<string, Map<string, unknown>>()
  const of = (kind: string) => records.get(kind) ?? records.set(kind, new Map()).get(kind)!
  return {
    get: (kind: string, id: string) => structuredClone(of(kind).get(id) ?? null),
    put: (kind: string, id: string, value: unknown) => void of(kind).set(id, structuredClone(value)),
    remove: (kind: string, id: string) => void of(kind).delete(id),
    list: (kind: string) => [...of(kind).values()].map((v) => structuredClone(v)),
    close: () => undefined
  } as unknown as Archive
}

const PLATE = 'AB-123-CD'
const TOLLS: NewTask = {
  title: 'Péages en flux libre',
  domain: 'mobility',
  runner: 'marianne',
  origin: { kind: 'service', service: 'peage', template: 'tolls:v1' },
  every: { unit: 'day', n: 2 },
  everyLabel: 'tous les 2 jours',
  instruction: 'Look for unpaid passages.',
  sites: ['www.sanef.com', 'paiement.aliae.com'],
  entity: { id: 'v1', label: PLATE }
}

/** What its sheet lists, as siteAllowed reads it. */
const SHEET = { sites: TOLLS.sites ?? [] }

const tool = (name: string) => browserTools.find((t) => t.name === name)!
/** A call as the engine makes it, through the gate; its text, or « refused: » and why. */
async function call(folderId: string, name: string, args: Record<string, unknown> = {}, t: Tool = tool(name)): Promise<string> {
  const answer = await callTool(t, args, { folderId })
  const text = answer.content[0].text
  return answer.isError ? `refused: ${text}` : text
}
const OPEN = { reason: 'Chercher les passages.', show: false }
const CLICK = { purpose: 'chercher les passages', consequential: false }

let request: ReturnType<typeof vi.spyOn>

/** Runs a task (its folder, its run), doing what its engine would while it runs; what `inside` returns. */
async function during<T>(inside: (folderId: string) => Promise<T>, more: Partial<NewTask> = {}): Promise<{ result: T; folderId: string }> {
  const task = tasks.create({ ...TOLLS, ...more })
  let result!: T
  tasks.runTurn = async (running) => {
    result = await inside(running.folderId)
    return { outcome: 'nothing', text: 'rien' }
  }
  await tasks.tick()
  return { result, folderId: task.folderId }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 30, 9, 0))
  session.open(memoryArchive())
  tasks.isBusy = () => false
  tasks.addLine = () => undefined
  tasks.isOffered = () => true
  Object.assign(page, { url: '', title: '', folderId: '', redirects: {}, targets: {}, live: {}, elements: [], arrival: null, form: [], hold: false })
  vi.mocked(browser.open).mockClear()
  vi.mocked(browser.settled).mockClear()
  vi.mocked(browser.click).mockClear()
  vi.mocked(browser.type).mockClear()
  vi.mocked(browser.back).mockClear()
  vi.mocked(browser.reveal).mockClear()
  vi.spyOn(accounts, 'settings').mockReturnValue({ approvals: { level: 'balanced', rules: [] }, browser: { show: 'always' } } as never)
  vi.spyOn(profile, 'tokens').mockReturnValue([{ token: 'vehicle.1.plate', label: 'plaque', value: PLATE, kind: 'id' } satisfies TokenDef])
  // Any card would be accepted at once: a run that asked one would get through, and be caught here.
  request = vi.spyOn(approvals, 'request').mockResolvedValue('accepted')
})
afterEach(() => {
  session.lock()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a run’s page, held to its sites before a request leaves (the browser)', () => {
  const wc = () => {
    const events = new EventEmitter()
    return { events, on: (name: string, fn: (e: { url: string; preventDefault(): void }) => void) => events.on(name, fn) }
  }
  const go = (events: EventEmitter, name: string, url: string) => {
    const e = { url, preventDefault: vi.fn() }
    events.emit(name, e)
    return e.preventDefault.mock.calls.length > 0
  }

  it('stops a navigation or a redirect elsewhere, in any frame; lets its sites through; holds nothing outside a run', () => {
    const { events, on } = wc()
    let guard: ((url: string) => boolean) | null = (url) => siteAllowed(SHEET, url)
    holdToRun({ on } as never, () => guard)
    expect(go(events, 'will-frame-navigate', 'https://evil.example/?q=AB-123-CD')).toBe(true)
    expect(go(events, 'will-redirect', 'https://evil.example/')).toBe(true)
    expect(go(events, 'will-frame-navigate', 'https://www.sanef.com/passages')).toBe(false)
    expect(go(events, 'will-redirect', 'https://paiement.aliae.com/fr/')).toBe(false)
    guard = null
    expect(go(events, 'will-frame-navigate', 'https://evil.example/')).toBe(false)
  })

  it('opens a popup on its sites only during a run', () => {
    const guard = (url: string) => siteAllowed(SHEET, url)
    expect(mayOpen(guard, 'https://evil.example/')).toBe(false)
    expect(mayOpen(guard, 'https://www.sanef.com/aide')).toBe(true)
    expect(mayOpen(null, 'https://evil.example/')).toBe(true)
  })

  it('takes https only, on a listed host or under it', () => {
    expect(siteAllowed(SHEET, 'http://www.sanef.com/')).toBe(false)
    expect(siteAllowed(SHEET, 'https://sanef.com/')).toBe(true)
    expect(siteAllowed(SHEET, 'https://autoroutes.sanef.com/')).toBe(false)
    expect(siteAllowed({ sites: ['mairie.github.io'] }, 'https://evil.github.io/')).toBe(false)
    expect(siteAllowed(SHEET, 'https://www.sanef.com@evil.example/')).toBe(false)
  })
})

describe('open_site in a run', () => {
  it('opens its sites out of sight, without a card', async () => {
    const { result } = await during((f) => call(f, 'open_site', { url: 'https://www.sanef.com/passages', ...OPEN }))
    expect(result).toMatch(/^Opened https:\/\/www\.sanef\.com\/passages/)
    expect(browser.reveal).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('refuses another site before opening it, and a disguised one', async () => {
    const { result } = await during(async (f) => [
      await call(f, 'open_site', { url: 'https://evil.example/', ...OPEN }),
      await call(f, 'open_site', { url: 'https://www.sanef.com@evil.example/', ...OPEN })
    ])
    expect(result.every((r) => r.startsWith('refused:'))).toBe(true)
    expect(browser.open).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('refuses where a redirect leads, and leaves nothing to the folder’s conversations', async () => {
    page.redirects['https://www.sanef.com/sortie'] = 'https://evil.example/'
    const { result, folderId } = await during((f) => call(f, 'open_site', { url: 'https://www.sanef.com/sortie', ...OPEN }))
    expect(result).toMatch(/^refused:.*evil\.example/)
    expect(request).not.toHaveBeenCalled()
    // A conversation of the folder still asks to go there: the run consented to nothing.
    await call(folderId, 'open_site', { url: 'https://evil.example/', ...OPEN })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('holds a sheet’s host, not its whole domain', async () => {
    page.redirects['https://mairie.github.io/'] = 'https://evil.github.io/'
    const { result } = await during((f) => call(f, 'open_site', { url: 'https://mairie.github.io/', ...OPEN }), { sites: ['mairie.github.io'] })
    expect(result).toMatch(/^refused:/)
  })

  it('doesn’t use what the user agreed to in a conversation of the folder', async () => {
    const task = tasks.create(TOLLS)
    await call(task.folderId, 'open_site', { url: 'https://evil.example/', ...OPEN })
    expect(request).toHaveBeenCalledTimes(1)
    request.mockClear()
    let result = ''
    tasks.runTurn = async (running) => {
      result = await call(running.folderId, 'open_site', { url: 'https://evil.example/', ...OPEN })
      return { outcome: 'nothing', text: 'rien' }
    }
    await tasks.tick()
    expect(result).toMatch(/^refused:/)
    expect(request).not.toHaveBeenCalled()
  })

  it('a call the run outlives (the user’s message stopped it while the page loaded) stops, and consents to nothing', async () => {
    page.redirects['https://www.sanef.com/sortie'] = 'https://evil.example/'
    page.hold = true
    let pending: Promise<string> = Promise.resolve('')
    const { folderId } = await during(async (f) => {
      pending = call(f, 'open_site', { url: 'https://www.sanef.com/sortie', ...OPEN })
      await vi.waitFor(() => expect(browser.settled).toHaveBeenCalled())
    })
    // The run is over; the page loads now, elsewhere.
    expect(tasks.runningIn(folderId)).toBeNull()
    page.hold = false
    page.loaded()
    expect(await pending).toMatch(/^refused:.*run is over/)
    await call(folderId, 'open_site', { url: 'https://evil.example/', ...OPEN })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('a call made once the run’s browser is gone (the user typed an address) stops: the page is theirs', async () => {
    vi.mocked(browser.readPage).mockClear()
    const { result } = await during(async (f) => {
      await call(f, 'open_site', { url: 'https://www.sanef.com/passages', ...OPEN })
      vi.mocked(browser.inRun).mockReturnValue(false)
      return [await call(f, 'read_page'), await call(f, 'open_site', { url: 'https://www.sanef.com/passages', ...OPEN })]
    })
    vi.mocked(browser.inRun).mockReturnValue(true)
    expect(result.every((r) => /^refused:.*run is over/.test(r))).toBe(true)
    expect(browser.open).toHaveBeenCalledTimes(1)
    expect(browser.readPage).not.toHaveBeenCalled()
  })

  it('stops reading a page that went elsewhere', async () => {
    const { result } = await during(async (f) => {
      await call(f, 'open_site', { url: 'https://www.sanef.com/passages', ...OPEN })
      page.url = 'https://evil.example/'
      return call(f, 'read_page')
    })
    expect(result).toMatch(/^refused:/)
  })
})

describe('click in a run', () => {
  const button = (label: string) => ({ id: 'e1', role: 'button', label, type: 'submit', secret: false })
  /** On its site, the page read, then a click. */
  const clickOn = (label: string, args: Record<string, unknown> = CLICK, before?: () => void) =>
    during(async (f) => {
      page.elements = [button(label)]
      await call(f, 'open_site', { url: 'https://www.sanef.com/passages', ...OPEN })
      await call(f, 'read_page')
      before?.()
      return call(f, 'click', { element: 'e1', ...args })
    })

  it('clicks what plainly searches', async () => {
    const { result } = await clickOn('Rechercher')
    expect(result).toMatch(/^Clicked « Rechercher »/)
    expect(browser.click).toHaveBeenCalledOnce()
  })

  it('refuses what commits, whatever the engine says, and asks nobody', async () => {
    const results = [
      (await clickOn('Payer')).result,
      (await clickOn('Rechercher', { purpose: 'chercher', consequential: true })).result,
      (await clickOn('Rechercher', { purpose: 'payer le passage', consequential: false })).result,
      (await clickOn('Tout refuser et payer')).result
    ]
    expect(results.every((r) => r.startsWith('refused:'))).toBe(true)
    expect(browser.click).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('reads the element again as it clicks: what it says then counts', async () => {
    const { result } = await clickOn('Rechercher', CLICK, () => (page.live.e1 = 'Payer'))
    expect(result).toMatch(/^refused:/)
    expect(browser.click).not.toHaveBeenCalled()
  })

  it('goes back from a click that led off its sites, telling nothing of where', async () => {
    const { result } = await clickOn('Suivant', CLICK, () => (page.targets.e1 = 'https://evil.example/'))
    expect(result).toMatch(/^refused:/)
    expect(result).not.toContain('Page piégée')
    expect(browser.back).toHaveBeenCalledOnce()
  })

  it('a click to a neighbour of its host is off its sites', async () => {
    const { result } = await during(
      async (f) => {
        page.elements = [button('Suivant')]
        page.targets.e1 = 'https://evil.github.io/'
        await call(f, 'open_site', { url: 'https://mairie.github.io/', ...OPEN })
        await call(f, 'read_page')
        return call(f, 'click', { element: 'e1', ...CLICK })
      },
      { sites: ['mairie.github.io'] }
    )
    expect(result).toMatch(/^refused:/)
    expect(browser.back).toHaveBeenCalledOnce()
  })

  it('wants the page it read', async () => {
    const { result } = await clickOn('Rechercher', CLICK, () => (page.url = 'https://www.sanef.com/autre'))
    expect(result).toMatch(/^refused:.*Read the page first/)
  })

  it('says no to a cookie banner, and only that', () => {
    const b = (label: string) => ({ role: 'button', type: 'button', label })
    expect(reading(b('Tout refuser'))).toBe(true)
    expect(reading(b('Continuer sans accepter →'))).toBe(true)
    expect(reading(b('Tout refuser et payer'))).toBe(false)
    expect(reading(b('Continuer sans accepter et valider'))).toBe(false)
  })
})

/** The operators' pay-by-plate pages, as 3615 PEAGE declares them, and the buttons of their searches and of the way to the card. */
const SANEF_PAGE = 'https://www.sanef.com/client/index.html?lang=fr#basket'
const ALIAE_PAGE = 'https://paiement.aliae.com/fr/form/payment'
const TOLL_STEPS: Array<[string, string]> = [
  [SANEF_PAGE, 'Vérifier mes péages à payer'],
  [ALIAE_PAGE, 'PLAQUE D’IMMATRICULATION'],
  [ALIAE_PAGE, 'VALIDER'],
  [ALIAE_PAGE, 'CONTINUER'],
  [ALIAE_PAGE, 'Payer mes trajets'],
  [ALIAE_PAGE, 'Poursuivre vers le paiement']
]
/** What binds the user beyond paying, and still asks there. */
const BINDING = ['Signer', 'Envoyer', 'Supprimer', 'Je certifie sur l’honneur']
/** The sites the built-in services that are on declare: 3615 PEAGE's, and none of another service's. */
const declare = () =>
  vi.spyOn(services, 'declaredSites').mockImplementation((code?: string) => (!code || code === 'peage' ? ['www.sanef.com', 'paiement.aliae.com'] : []))
const submit = (label: string) => ({ id: 'e1', role: 'button', label, type: 'submit', secret: false })

describe('click in a run, on the sites its own service declares', () => {
  /** On a page of its sites, read, then a click. */
  const clickAt = (url: string, label: string, more: Partial<NewTask> = {}, args: Record<string, unknown> = CLICK, before?: () => void) =>
    during(async (f) => {
      page.elements = [submit(label)]
      await call(f, 'open_site', { url, ...OPEN })
      await call(f, 'read_page')
      before?.()
      return call(f, 'click', { element: 'e1', ...args })
    }, more)

  it('clicks through the search and the way to the card, asking nobody', async () => {
    declare()
    for (const [url, label] of TOLL_STEPS) expect((await clickAt(url, label)).result, label).toMatch(/^Clicked/)
    expect(browser.click).toHaveBeenCalledTimes(TOLL_STEPS.length)
    expect(request).not.toHaveBeenCalled()
  })

  it('refuses what binds the user, what the engine flags, and what it says binds them', async () => {
    declare()
    const results: string[] = []
    for (const label of BINDING) results.push((await clickAt(SANEF_PAGE, label)).result)
    results.push((await clickAt(ALIAE_PAGE, 'Payer mes trajets', {}, { purpose: 'payer', consequential: true })).result)
    results.push((await clickAt(ALIAE_PAGE, 'VALIDER', {}, { purpose: 'envoyer le dossier', consequential: false })).result)
    expect(results.every((r) => r.startsWith('refused:'))).toBe(true)
    expect(browser.click).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('keeps to what plainly reads for a task Marianne proposed, another service’s task, a site its service doesn’t declare, or its service off', async () => {
    const declared = declare()
    const results = [
      (await clickAt(SANEF_PAGE, 'Vérifier mes péages à payer', { origin: { kind: 'agent' } })).result,
      (await clickAt(SANEF_PAGE, 'Vérifier mes péages à payer', { origin: { kind: 'service', service: 'vignette', template: 'zfe:v1' } })).result,
      (await clickAt('https://www.metropole.example/zfe', 'Valider', { sites: ['www.sanef.com', 'www.metropole.example'] })).result
    ]
    declared.mockReturnValue([])
    results.push((await clickAt(SANEF_PAGE, 'Vérifier mes péages à payer')).result)
    expect(results.every((r) => r.startsWith('refused:'))).toBe(true)
    expect(browser.click).not.toHaveBeenCalled()
    // What plainly reads, as before.
    expect((await clickAt(SANEF_PAGE, 'Rechercher', { origin: { kind: 'agent' } })).result).toMatch(/^Clicked/)
  })

  it('goes back from a click that led off its sites: the bank’s page, the payment provider’s', async () => {
    declare()
    const { result } = await clickAt(ALIAE_PAGE, 'Poursuivre vers le paiement', {}, CLICK, () => (page.targets.e1 = 'https://paymentpage.axepta.bnpparibas/'))
    expect(result).toMatch(/^refused:/)
    expect(browser.back).toHaveBeenCalledOnce()
  })
})

describe('click in a conversation, on the sites Marianne’s own services declare', () => {
  const conversation = () => folders.create({ title: 'Péages', engine: 'claude' }).id
  /** The cards a click asked, not going online's. */
  const commits = (): ApprovalPart[] => (request.mock.calls as unknown[][]).map((args) => args[1] as ApprovalPart).filter((card) => card.action === 'commit')
  const clickAt = async (url: string, label: string, args: Record<string, unknown> = CLICK) => {
    const f = conversation()
    page.elements = [submit(label)]
    await call(f, 'open_site', { url, ...OPEN })
    await call(f, 'read_page')
    return call(f, 'click', { element: 'e1', ...args })
  }

  it('clicks the toll pages’ steps without a card: paying there takes the payment card', async () => {
    declare()
    for (const [url, label] of TOLL_STEPS) expect(await clickAt(url, label), label).toMatch(/^Clicked/)
    expect(commits()).toEqual([])
  })

  it('still asks to sign, send, delete or certify, and for a click the engine flags or says binds the user', async () => {
    declare()
    for (const label of BINDING) await clickAt(SANEF_PAGE, label)
    await clickAt(ALIAE_PAGE, 'Payer mes trajets', { purpose: 'payer avec la carte enregistrée sur le compte', consequential: true })
    await clickAt(ALIAE_PAGE, 'VALIDER', { purpose: 'envoyer le dossier', consequential: false })
    expect(commits().map((card) => card.title)).toEqual([
      ...BINDING.map((label) => `Cliquer sur « ${label} »`),
      'Cliquer sur « Payer mes trajets »',
      'Cliquer sur « VALIDER »'
    ])
  })

  it('asks for the same steps off those sites: a neighbour of a declared host, a look-alike, another site', async () => {
    declare()
    const elsewhere = ['https://www.aliae.com/fr/', 'https://aliae.com/', 'https://evil-aliae.com/', 'https://autoroutes.sanef.com/', 'https://shop.example/']
    for (const url of elsewhere) {
      await clickAt(url, 'Payer mes trajets')
      await clickAt(url, 'VALIDER')
    }
    expect(commits()).toHaveLength(elsewhere.length * 2)
  })

  it('frees nothing when no service that is on declares the site: a service switched off, a community service', async () => {
    declare().mockReturnValue([])
    for (const [url, label] of TOLL_STEPS) await clickAt(url, label)
    // Each one asks, as a button that submits a form does; « CONTINUER » plainly moves on, there as anywhere.
    expect(commits().map((card) => card.title)).toEqual(TOLL_STEPS.filter(([, label]) => label !== 'CONTINUER').map(([, label]) => `Cliquer sur « ${label} »`))
  })
})

describe('type_text in a run', () => {
  const field = { id: 'e1', role: 'textbox', label: 'Plaque', type: 'text', secret: false }
  const typing = (value: string, more: Partial<NewTask> = {}) =>
    during(async (f) => {
      page.elements = [field]
      await call(f, 'open_site', { url: 'https://www.sanef.com/passages', ...OPEN })
      await call(f, 'read_page')
      return call(f, 'type_text', { element: 'e1', value })
    }, more)

  it('types the identifier of its sheet, given as its token', async () => {
    const { result } = await typing('[[vehicle.1.plate]]')
    expect(result).toMatch(/^Typed into/)
    expect(browser.type).toHaveBeenCalledWith('e1', PLATE)
  })

  it('types nothing else: not the identifier with more, not text of the engine’s, nothing without an identifier', async () => {
    const results = [
      (await typing('[[vehicle.1.plate]] ')).result,
      (await typing('[[vehicle.1.plate]] x')).result,
      (await typing('ab-123-cd')).result,
      (await typing('Jean Dupont 75011')).result,
      (await typing('[[vehicle.1.plate]]', { entity: undefined })).result
    ]
    expect(results.every((r) => r.startsWith('refused:'))).toBe(true)
    expect(browser.type).not.toHaveBeenCalled()
  })

  it('a conversation types what it wants', async () => {
    const task = tasks.create(TOLLS)
    page.elements = [field]
    await call(task.folderId, 'open_site', { url: 'https://www.sanef.com/passages', ...OPEN })
    await call(task.folderId, 'read_page')
    expect(await call(task.folderId, 'type_text', { element: 'e1', value: 'Jean Dupont 75011' })).toMatch(/^Typed into/)
  })
})

describe('the gate, in a run', () => {
  it('lets no other tool carry an identifier out', async () => {
    const lookup: Tool = {
      name: 'skill',
      title: 'Lookup',
      description: 'A reading tool of the app, for this test.',
      readOnly: true,
      input: {},
      run: vi.fn(async () => 'found')
    } as unknown as Tool
    ALL_TOOLS.push(lookup)
    try {
      const { result } = await during(async (f) => [
        await call(f, 'skill', { q: '[[vehicle.1.plate]]' }, lookup),
        await call(f, 'skill', { q: 'Bordeaux' }, lookup)
      ])
      expect(result[0]).toMatch(/^refused:.*identifiers/)
      expect(result[1]).toBe('found')
      expect(lookup.run).toHaveBeenCalledTimes(1)
    } finally {
      ALL_TOOLS.splice(ALL_TOOLS.indexOf(lookup), 1)
    }
  })

  it('keeps Marianne’s acting tools out: the services, proposing one, planning a task, a service’s own included, paying', async () => {
    const own = (name: string) => [...servicesTools, ...taskTools, ...browserTools].find((t) => t.name === name)!
    const calls: Array<[string, Record<string, unknown>]> = [
      ['services', {}],
      ['service_propose', { code: 'peage', reason: 'Pour vos passages.' }],
      ['task_propose', { service: 'peage', template: 'tolls:v2' }],
      ['task_propose', { title: 'Encore', runner: 'remind', every: { unit: 'day', n: 1 } }],
      ['pay_by_card', { amount: '12,40 €', reason: 'Payer les passages.' }]
    ]
    const { result } = await during(async (f) => Promise.all(calls.map(([name, args]) => call(f, name, args, own(name)))))
    expect(result.every((r) => /^refused:.*cannot use/.test(r))).toBe(true)
    expect(request).not.toHaveBeenCalled()
    expect(tasks.list()).toHaveLength(1)
  })

  it('refuses a tool that only bears the name of one of Marianne’s', async () => {
    const fake = { ...tool('click'), run: vi.fn(async () => 'clicked') } as Tool
    const { result } = await during((f) => call(f, 'click', { element: 'e1', ...CLICK }, fake))
    expect(result).toMatch(/^refused:/)
    expect(fake.run).not.toHaveBeenCalled()
  })
})

describe('what the user allowed ahead, in a run', () => {
  /** The most a conversation could go without a card: « autonomie », and standing permissions for the run's site and another. */
  const allowedAhead = () =>
    vi.spyOn(accounts, 'settings').mockReturnValue({
      approvals: {
        level: 'autonomous',
        rules: [
          { id: 'r1', action: 'online', site: 'evil.example', at: '2026-10-30T08:00:00.000Z' },
          { id: 'r2', action: 'form', site: 'sanef.com', at: '2026-10-30T08:00:00.000Z' }
        ]
      },
      browser: { show: 'always' }
    } as never)

  it('opens no other site for it', async () => {
    allowedAhead()
    const { result } = await during((f) => call(f, 'open_site', { url: 'https://evil.example/', ...OPEN }))
    expect(result).toMatch(/^refused:/)
    expect(browser.open).not.toHaveBeenCalled()
  })

  it('lets nothing through, and shows neither a card nor a line', async () => {
    allowedAhead()
    approvals.canShow = () => true
    const shown = vi.fn()
    approvals.on('part', shown)
    try {
      const { result } = await during((f) =>
        Promise.all([
          approvals.ask(f, { action: 'form', site: 'sanef.com', known: true }, { kind: 'form', title: 'Remplir', fields: [] }),
          approvals.ask(
            f,
            { action: 'online', site: 'evil.example', known: false, consented: { site: false, folder: false } },
            { kind: 'online', title: 'Aller', fields: [] }
          ),
          approvals.ask(f, { action: 'profile', deadline: true }, { kind: 'proposal', title: 'Ajouter une échéance', fields: [] })
        ])
      )
      expect(result).toEqual([
        { decision: 'expired', ahead: false },
        { decision: 'expired', ahead: false },
        { decision: 'expired', ahead: false }
      ])
      expect(shown).not.toHaveBeenCalled()
      expect(request).not.toHaveBeenCalled()
    } finally {
      approvals.off('part', shown)
      approvals.canShow = () => false
    }
  })
})

describe('going online from a conversation, as the user allowed ahead', () => {
  let lines: ApprovalPart[] = []
  const onPart = (_folderId: string, part: ApprovalPart) => void (part.given && lines.push(part))
  const conversation = () => folders.create({ title: 'Péages', engine: 'claude' }).id
  beforeEach(() => {
    lines = []
    approvals.on('part', onPart)
    approvals.canShow = () => true
    vi.spyOn(accounts, 'settings').mockReturnValue({
      approvals: { level: 'balanced', rules: [{ id: 'r1', action: 'online', site: 'sanef.com', at: '2026-10-30T08:00:00.000Z' }] },
      browser: { show: 'always' }
    } as never)
  })
  afterEach(() => {
    approvals.off('part', onPart)
    approvals.canShow = () => false
  })

  it('goes to a site the user allowed without a card, says so once, and keeps it from the folder’s consents', async () => {
    const f = conversation()
    expect(await call(f, 'open_site', { url: 'https://www.sanef.com/passages', ...OPEN })).toMatch(/^Opened/)
    await call(f, 'read_page')
    await call(f, 'open_site', { url: 'https://www.sanef.com/aide', ...OPEN })
    expect(request).not.toHaveBeenCalled()
    expect(lines).toMatchObject([{ action: 'online', given: 'toujours pour sanef.com' }])
    // Allowed ahead for that site only: another one is asked, though the folder asks once at « équilibré ».
    await call(f, 'open_site', { url: 'https://evil.example/', ...OPEN })
    expect(request).toHaveBeenCalledOnce()
  })

  it('at « autonomie », goes without a card to a site a built-in service that is on declares, as to a public site', async () => {
    vi.spyOn(accounts, 'settings').mockReturnValue({ approvals: { level: 'autonomous', rules: [] }, browser: { show: 'always' } } as never)
    const declared = vi.spyOn(services, 'declaredSites').mockReturnValue(['paiement.aliae.com'])
    expect(await call(conversation(), 'open_site', { url: 'https://paiement.aliae.com/payer', ...OPEN })).toMatch(/^Opened/)
    expect(request).not.toHaveBeenCalled()
    expect(lines).toMatchObject([{ action: 'online', given: 'autonomie', title: 'Aller sur aliae.com' }])
    // Its service switched off, it is a site like any other: asked.
    declared.mockReturnValue([])
    await call(conversation(), 'open_site', { url: 'https://paiement.aliae.com/payer', ...OPEN })
    expect(request).toHaveBeenCalledOnce()
  })

  it('asks on its own for where such a site’s address led, and goes back without the yes', async () => {
    page.redirects['https://www.sanef.com/sortie'] = 'https://evil.example/'
    request.mockResolvedValueOnce('refused')
    const result = await call(conversation(), 'open_site', { url: 'https://www.sanef.com/sortie', ...OPEN })
    expect(result).toMatch(/^refused:.*led to evil\.example/)
    expect(request).toHaveBeenCalledOnce()
    expect(browser.back).toHaveBeenCalledOnce()
  })

  it('takes where an address led as part of opening it, when the user said yes to it on a card', async () => {
    page.redirects['https://www.impots.gouv.fr/'] = 'https://www.franceconnect.gouv.fr/'
    const f = conversation()
    expect(await call(f, 'open_site', { url: 'https://www.impots.gouv.fr/', ...OPEN })).toMatch(/^Opened https:\/\/www\.franceconnect/)
    expect(await call(f, 'read_page')).toMatch(/^# Page de/)
    expect(request).toHaveBeenCalledOnce()
  })
})

/** The account's level and standing permissions, for a conversation's tests. */
const allowing = (level: ApprovalLevel, rules: ApprovalRule[] = []) =>
  vi.spyOn(accounts, 'settings').mockReturnValue({ approvals: { level, rules }, browser: { show: 'always' } } as never)
/** The cards asked (the test's request answers yes to each), by title. */
const asked = () => (request.mock.calls as unknown[][]).map((args) => (args[1] as ApprovalPart).title)
const aliaeRule: ApprovalRule = { id: 'r1', action: 'online', site: 'aliae.com', at: '2026-10-30T08:00:00.000Z' }

describe('a planned task’s follow-up: the user’s click is their go-ahead, for its turn', () => {
  const FOLLOW_UP = { label: 'payer maintenant', instruction: 'Pay the passages the check found.' }
  const BILLING = [
    { id: 'f1', label: 'Nom', type: 'text', required: true, value: '' },
    { id: 'f2', label: 'E-mail', type: 'email', required: true, value: '' }
  ]
  const FILL = { fields: [{ id: 'f1', value: 'Camille Martin' }], reason: 'Vos coordonnées de facturation.' }
  let lines: ApprovalPart[] = []
  const onPart = (_folderId: string, part: ApprovalPart) => void (part.given && lines.push(part))
  /** The follow-up's turn under way, as the chat runner marks it (chat.followUp): the task it read, or none. */
  let following: PlannedTask | null = null
  /** 3615 PEAGE's task, with its follow-up, and the turn the user started from it: its folder. */
  const followUp = () => {
    following = tasks.create({ ...TOLLS, followUp: FOLLOW_UP })
    return following.folderId
  }
  /** Through the operators' pages to ALIAE's form, filled. */
  const payingNow = async (f: string) => [
    await call(f, 'open_site', { url: SANEF_PAGE, ...OPEN }),
    await call(f, 'open_site', { url: ALIAE_PAGE, ...OPEN }),
    await call(f, 'read_form'),
    await call(f, 'fill_form', FILL)
  ]
  /** A reading tool of the app's, for this test, that tells whether its call was told of a follow-up. */
  const probe = {
    name: 'skill',
    title: 'Probe',
    description: 'A reading tool of the app, for this test.',
    readOnly: true,
    input: {},
    run: async (_args: unknown, ctx: ToolContext) => String(!!ctx.followUp)
  } as unknown as Tool
  beforeEach(() => {
    lines = []
    following = null
    page.form = BILLING
    approvals.on('part', onPart)
    approvals.canShow = () => true
    tasks.followingUp = (id) => (following && id === following.folderId ? following : null)
    declare()
  })
  afterEach(() => {
    approvals.off('part', onPart)
    approvals.canShow = () => false
    tasks.followingUp = () => null
  })

  it('goes to its task’s sites and fills the forms of its service’s sites without a card, each said on a line naming it', async () => {
    for (const level of ['balanced', 'autonomous'] as const) {
      allowing(level)
      lines = []
      const results = await payingNow(followUp())
      expect(
        results.every((r) => !r.startsWith('refused:')),
        level
      ).toBe(true)
      expect(lines, level).toMatchObject([
        { action: 'online', given: 'payer maintenant', title: 'Aller sur sanef.com' },
        { action: 'online', given: 'payer maintenant', title: 'Aller sur aliae.com' },
        { action: 'form', given: 'payer maintenant', title: 'Remplir 1 champ sur aliae.com', fields: [{ label: 'Nom', value: 'Camille Martin' }] }
      ])
    }
    expect(request).not.toHaveBeenCalled()
  })

  it('asks as the level says for a site its task doesn’t list, and a form on a page its service doesn’t declare', async () => {
    allowing('balanced')
    const f = followUp()
    await call(f, 'open_site', { url: 'https://www.autoroutes.sanef.com/fr/aide', ...OPEN })
    await call(f, 'read_form')
    await call(f, 'fill_form', FILL)
    expect(asked()).toEqual(['Aller sur sanef.com', 'Remplir 1 champ sur sanef.com'])
    expect(lines).toEqual([])
  })

  it('lowers nothing at « tout demander »: each site and each form is asked', async () => {
    allowing('ask')
    await payingNow(followUp())
    expect(asked()).toEqual(['Aller sur sanef.com', 'Aller sur aliae.com', 'Remplir 1 champ sur aliae.com'])
    expect(lines).toEqual([])
  })

  it('is the follow-up’s turn only: not a message typed after it, nor an engine’s claim, nor a call an earlier turn left going', async () => {
    allowing('balanced')
    // The turn is over: the user types a message in the same folder.
    const typed = followUp()
    following = null
    await call(typed, 'open_site', { url: SANEF_PAGE, ...OPEN })
    // A call that names the follow-up itself: only the chat runner's mark counts.
    const claimed = followUp()
    const claim = following!
    following = null
    await callTool(tool('open_site'), { url: SANEF_PAGE, ...OPEN }, { folderId: claimed, followUp: claim })
    expect(await callTool(probe, {}, { folderId: claimed, followUp: claim })).toMatchObject({ content: [{ text: 'false' }] })
    // Started again, a call of the earlier turn's still going gets nothing of the new one.
    const again = followUp()
    const earlier = following!
    following = tasks.get(earlier.id)
    await tool('open_site').run({ url: SANEF_PAGE, ...OPEN }, { folderId: again, followUp: earlier })
    expect(asked()).toEqual(['Aller sur sanef.com', 'Aller sur sanef.com', 'Aller sur sanef.com'])
    expect(lines).toEqual([])
  })

  it('never in a run, nor for a task without its service’s follow-up', async () => {
    allowing('balanced')
    ALL_TOOLS.push(probe)
    try {
      // Whatever is marked in its folder, a run's calls are never told of a follow-up.
      const { result } = await during(async (f) => {
        following = { ...tasks.byFolder(f)!, followUp: FOLLOW_UP }
        return call(f, 'skill', {}, probe)
      })
      expect(result).toBe('false')
      // A conversation's are, while the turn goes on.
      expect(await call(followUp(), 'skill', {}, probe)).toBe('true')
    } finally {
      ALL_TOOLS.splice(ALL_TOOLS.indexOf(probe), 1)
    }
    const without = followUp()
    following = { ...following!, followUp: undefined }
    await call(without, 'open_site', { url: SANEF_PAGE, ...OPEN })
    const agents = followUp()
    following = { ...following!, origin: { kind: 'agent' } }
    await call(agents, 'open_site', { url: SANEF_PAGE, ...OPEN })
    // Its service switched off during the turn: the task no longer offers its follow-up.
    const off = followUp()
    tasks.isOffered = () => false
    await call(off, 'open_site', { url: SANEF_PAGE, ...OPEN })
    expect(asked()).toEqual(['Aller sur sanef.com', 'Aller sur sanef.com', 'Aller sur sanef.com'])
  })

  it('never covers the floor: a click that binds the user, or one the engine flags, still asks', async () => {
    allowing('autonomous')
    const f = followUp()
    page.elements = [submit('Signer le mandat')]
    await call(f, 'open_site', { url: ALIAE_PAGE, ...OPEN })
    await call(f, 'read_page')
    await call(f, 'click', { element: 'e1', ...CLICK })
    page.elements = [submit('Payer mes trajets')]
    await call(f, 'read_page')
    await call(f, 'click', { element: 'e1', purpose: 'payer avec la carte enregistrée sur le compte', consequential: true })
    expect(asked()).toEqual(['Cliquer sur « Signer le mandat »', 'Cliquer sur « Payer mes trajets »'])
    // The policy's own word: a step that commits takes a card, whatever it is told.
    await approvals.ask(f, { action: 'commit', followUp: 'payer maintenant' } as never, { kind: 'online', title: 'Payer', fields: [] })
    expect(request).toHaveBeenCalledTimes(3)
  })
})

describe('a payment provider’s page a declared site sent the browser to, going online', () => {
  const AXEPTA_PAGE = 'https://paymentpage.axepta.bnpparibas/paymentPage.aspx'
  const conversation = () => folders.create({ title: 'Péages', engine: 'claude' }).id
  /** From a page, « Poursuivre vers le paiement », whose form sends the browser to Axepta's page, then reading it: the cards that asked on the way. */
  const toAxepta = async (f: string, from = ALIAE_PAGE) => {
    page.elements = [submit('Poursuivre vers le paiement')]
    page.targets.e1 = AXEPTA_PAGE
    await call(f, 'open_site', { url: from, ...OPEN })
    await call(f, 'read_page')
    request.mockClear()
    expect(await call(f, 'click', { element: 'e1', ...CLICK })).toMatch(/^Clicked/)
    expect(await call(f, 'read_page')).toMatch(/^# Page/)
    return asked()
  }
  beforeEach(() => {
    declare()
    approvals.canShow = () => true
  })
  afterEach(() => {
    approvals.canShow = () => false
    tasks.followingUp = () => null
  })

  it('is covered by what covered the declared page: the folder’s yes, a standing permission, « autonomie », the follow-up', async () => {
    allowing('ask')
    expect(await toAxepta(conversation())).toEqual([])
    allowing('balanced', [aliaeRule])
    expect(await toAxepta(conversation())).toEqual([])
    allowing('autonomous')
    expect(await toAxepta(conversation())).toEqual([])
    allowing('balanced')
    const task = tasks.create({ ...TOLLS, followUp: { label: 'payer maintenant', instruction: 'Pay.' } })
    tasks.followingUp = (id) => (id === task.folderId ? task : null)
    expect(await toAxepta(task.folderId)).toEqual([])
  })

  it('is a site of its own when a page that isn’t declared, or no page, sent the browser there', async () => {
    allowing('ask')
    // The folder said yes to aliae.com, but www.aliae.com isn't a page 3615 PEAGE declares.
    expect(await toAxepta(conversation(), 'https://www.aliae.com/fr/payer')).toEqual([
      'Cliquer sur « Poursuivre vers le paiement »',
      'Aller sur axepta.bnpparibas'
    ])
    // Back, reload or an address typed: no page sent it.
    const f = conversation()
    await call(f, 'open_site', { url: ALIAE_PAGE, ...OPEN })
    request.mockClear()
    Object.assign(page, { url: AXEPTA_PAGE, arrival: { url: AXEPTA_PAGE, initiator: '', hops: [AXEPTA_PAGE], previous: page.arrival } })
    await call(f, 'read_page')
    expect(asked()).toEqual(['Aller sur axepta.bnpparibas'])
  })

  it('is a site of its own when nothing covers the declared page now: a follow-up’s turn over, at « équilibré »', async () => {
    allowing('balanced')
    const f = conversation()
    const aliae: Arrival = { url: ALIAE_PAGE, initiator: '', hops: [ALIAE_PAGE], previous: null }
    Object.assign(page, {
      url: AXEPTA_PAGE,
      folderId: f,
      arrival: { url: AXEPTA_PAGE, initiator: 'https://paiement.aliae.com', hops: [AXEPTA_PAGE], previous: aliae }
    })
    await call(f, 'read_page')
    expect(asked()).toEqual(['Aller sur axepta.bnpparibas'])
  })
})

describe('a task proposed in a conversation', () => {
  const propose = (sites: string[]) => {
    const folder = folders.create({ title: 'Mairie', engine: 'claude' })
    const t = taskTools.find((x) => x.name === 'task_propose')!
    const args = { title: 'Les arrêtés', runner: 'marianne', every: { unit: 'week', n: 1 }, instruction: 'Regarder les nouveaux arrêtés.', sites }
    return call(folder.id, 'task_propose', args, t)
  }

  it('names one site, never a whole hosting service or public suffix: its run could reach any page there', async () => {
    expect(await propose(['github.io'])).toMatch(/^refused:.*shared by many sites/)
    // The Public Suffix List's (asso.fr, gouv.fr, pages.dev), and the hosts it leaves out (free.fr).
    for (const site of ['www.github.io', 'asso.fr', 'gouv.fr', 'pages.dev', 'free.fr', 'www.free.fr']) expect(await propose([site]), site).toMatch(/^refused:/)
    expect(request).not.toHaveBeenCalled()
    await propose(['mairie.github.io', 'x.asso.fr', 'www.impots.gouv.fr'])
    expect(request).toHaveBeenCalledOnce()
  })
})
