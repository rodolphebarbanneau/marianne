import { rmSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import type { Archive } from '@marianne/archive'
import type { TokenDef } from '@marianne/profile'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What holds a planned task's run, where nobody watches and pages anyone can write are read: its
 * sites only (redirects, clicks and popups included, and a call that outlives its run), clicks on
 * what plainly searches or moves, typing the one identifier of its sheet, never a card. The run is
 * a real one (tasks.ts), the calls go through the engine's gate (mcp.ts), the browser is faked.
 */

// ~/.marianne points at a temporary folder, before paths.ts reads it.
const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-run-tools-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** The page: where an address leads (its redirects), where a click leads, what an element says when clicked. */
const page = vi.hoisted(() => ({
  url: '',
  title: '',
  folderId: '',
  redirects: {} as Record<string, string>,
  targets: {} as Record<string, string>,
  live: {} as Record<string, string>,
  elements: [] as { id: string; role: string; label: string; type: string; secret: boolean }[],
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
    inRun: vi.fn(() => true),
    open: vi.fn((url: string, folderId: string) => {
      page.url = page.redirects[url] ?? url
      page.folderId = folderId
      page.title = `Page de ${new URL(page.url).hostname}`
    }),
    settled: vi.fn(() => (page.hold ? new Promise<void>((resolve) => (page.loaded = resolve)) : Promise.resolve())),
    reveal: vi.fn(),
    readPage: vi.fn(async () => ({ url: page.url, title: page.title, text: 'Le texte de la page.', elements: page.elements })),
    elementLabel: vi.fn(async (id: string) => page.live[id] ?? ''),
    click: vi.fn(async (id: string) => {
      if (page.targets[id]) {
        page.url = page.targets[id]
        page.title = 'Page piégée'
      }
    }),
    type: vi.fn(async () => undefined),
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
import { callTool } from '../src/main/mcp'
import { profile } from '../src/main/profile/store'
import { session } from '../src/main/session'
import { siteAllowed, tasks, type NewTask } from '../src/main/tasks'
import { ALL_TOOLS } from '../src/main/tools'
import { browserTools } from '../src/main/tools/browser'
import { taskTools } from '../src/main/tools/tasks'
import { folders } from '../src/main/folders'
import { reading } from '../src/main/tools/online'
import type { Tool } from '../src/main/tools/tool'

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
  Object.assign(page, { url: '', title: '', folderId: '', redirects: {}, targets: {}, live: {}, elements: [], hold: false })
  vi.mocked(browser.open).mockClear()
  vi.mocked(browser.settled).mockClear()
  vi.mocked(browser.click).mockClear()
  vi.mocked(browser.type).mockClear()
  vi.mocked(browser.back).mockClear()
  vi.mocked(browser.reveal).mockClear()
  vi.spyOn(accounts, 'settings').mockReturnValue({ browser: { askOnline: 'folder', show: 'always' } } as never)
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

  it('refuses a tool that only bears the name of one of Marianne’s', async () => {
    const fake = { ...tool('click'), run: vi.fn(async () => 'clicked') } as Tool
    const { result } = await during((f) => call(f, 'click', { element: 'e1', ...CLICK }, fake))
    expect(result).toMatch(/^refused:/)
    expect(fake.run).not.toHaveBeenCalled()
  })
})

describe('a task proposed in a conversation', () => {
  const propose = (sites: string[]) => {
    const folder = folders.create({ title: 'Mairie', engine: 'claude' })
    const t = taskTools.find((x) => x.name === 'task_propose')!
    const args = { title: 'Les arrêtés', runner: 'marianne', every: { unit: 'week', n: 1 }, instruction: 'Regarder les nouveaux arrêtés.', sites }
    return call(folder.id, 'task_propose', args, t)
  }

  it('names one site, never a whole hosting service: its run could reach any page there', async () => {
    expect(await propose(['github.io'])).toMatch(/^refused:.*whole hosting service/)
    expect(await propose(['www.github.io'])).toMatch(/^refused:/)
    expect(request).not.toHaveBeenCalled()
    await propose(['mairie.github.io'])
    expect(request).toHaveBeenCalledOnce()
  })
})
