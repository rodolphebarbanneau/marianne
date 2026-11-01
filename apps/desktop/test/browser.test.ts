import { rmSync } from 'node:fs'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The built-in browser between a planned task's run and the user: an address they type or open
 * never loads in the run's view and session, and a lock leaves no page that holds the next runs.
 * Electron's views and sessions are the test's.
 */

// ~/.marianne points at a temporary folder, before paths.ts reads it.
const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-browser-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** A frame of a view's page, as the test sets it: its origin, the frame above it, and what reading it gives. */
interface Frame {
  origin: string
  parent: Frame | null
  name: string
  frameTreeNodeId: number
  detached: boolean
  isDestroyed: () => boolean
  executeJavaScript: () => Promise<unknown>
}

/** Each view made, with its session, the addresses it loaded, what listens to its page, and its page's frames. */
const made = vi.hoisted(
  () =>
    [] as Array<{
      partition: string
      loaded: string[]
      closed: boolean
      listeners: Record<string, Array<(...args: unknown[]) => void>>
      frames: unknown[]
    }>
)

vi.mock('electron', () => {
  class WebContentsView {
    webContents: Record<string, unknown>
    constructor(options: { webPreferences: { partition: string } }) {
      const view = { partition: options.webPreferences.partition, loaded: [] as string[], closed: false, listeners: {}, frames: [] }
      made.push(view)
      const listeners: Record<string, Array<(...args: unknown[]) => void>> = view.listeners
      this.webContents = {
        loadURL: async (url: string) => void view.loaded.push(url),
        getURL: () => view.loaded.at(-1) ?? '',
        getTitle: () => '',
        isLoading: () => false,
        navigationHistory: { canGoBack: () => false, canGoForward: () => false },
        setBackgroundThrottling: () => undefined,
        setWindowOpenHandler: () => undefined,
        on: (event: string, listener: (...args: unknown[]) => void) => void (listeners[event] ??= []).push(listener),
        get mainFrame() {
          return { framesInSubtree: view.frames }
        },
        isDestroyed: () => view.closed,
        close: () => void (view.closed = true)
      }
    }
    setVisible() {}
    setBounds() {}
  }
  const partition = { clearStorageData: async () => undefined, setPermissionRequestHandler: () => undefined, on: () => undefined }
  return { WebContentsView, session: { fromPartition: () => partition }, shell: { openExternal: async () => undefined } }
})

import { browser } from '../src/main/browser'

const win = { contentView: { addChildView: () => undefined, removeChildView: () => undefined }, on: () => undefined }
browser.attach(win as never)

/** A run under way, its page open on its site, as its tools leave it. */
async function runOn(url: string, folderId = 'task-folder'): Promise<void> {
  await browser.beginRun((u) => u.startsWith('https://www.sanef.com/'))
  browser.open(url, folderId)
}

/** Where an address loaded: in the user's session, the run's, or both. */
const loadedIn = (url: string) => [...new Set(made.filter((v) => v.loaded.includes(url)).map((v) => v.partition))]

beforeEach(() => browser.forget())

describe('the user’s address during a run', () => {
  it('ends the run before it loads: never in the run’s view or session', async () => {
    const taken = vi.fn()
    browser.on('taken', taken)
    browser.open('https://www.impots.gouv.fr/', 'their-folder')
    await runOn('https://www.sanef.com/passages')
    await browser.navigate('www.ameli.fr')
    browser.off('taken', taken)
    expect(taken).toHaveBeenCalledOnce()
    expect(loadedIn('https://www.ameli.fr')).toEqual(['marianne-web'])
    expect(loadedIn('https://www.sanef.com/passages')).toEqual(['marianne-run'])
    expect(made.filter((v) => v.partition === 'marianne-run').every((v) => v.closed)).toBe(true)
    expect(browser.inRun()).toBe(false)
    expect(browser.state()).toMatchObject({ url: 'https://www.ameli.fr', folderId: 'their-folder' })
  })

  it('a site the window opens (a step of a démarche) interrupts the run too', async () => {
    const taken = vi.fn()
    browser.on('taken', taken)
    await runOn('https://www.sanef.com/passages')
    await browser.openForUser('https://www.service-public.gouv.fr/particuliers/vosdroits/F1342', 'their-folder')
    browser.off('taken', taken)
    expect(taken).toHaveBeenCalledOnce()
    expect(loadedIn('https://www.service-public.gouv.fr/particuliers/vosdroits/F1342')).toEqual(['marianne-web'])
    expect(browser.state().folderId).toBe('their-folder')
  })

  it('reaching for it while the run’s view gets ready interrupts the run', async () => {
    const taken = vi.fn()
    browser.on('taken', taken)
    const starting = browser.beginRun(() => true)
    browser.setBounds({ x: 0, y: 0, width: 400, height: 600 })
    await starting
    browser.setBounds(null)
    await browser.endRun()
    browser.off('taken', taken)
    expect(taken).toHaveBeenCalledOnce()
  })
})

describe('what the user does in their page', () => {
  /** The view the user's page is in, open on `url`. */
  const userPage = (url: string) => {
    browser.open(url, 'their-folder')
    return made.find((v) => v.partition === 'marianne-web' && !v.closed && v.loaded.at(-1) === url)!
  }
  const press = (view: (typeof made)[number], key: string, type = 'keyDown') => {
    for (const listener of view.listeners['before-input-event'] ?? []) listener({}, { type, key })
  }

  it('says where they typed: a key that types, not one that moves about; never in a run’s page', async () => {
    const typed = vi.fn()
    browser.on('typed', typed)
    const page = userPage('https://www.sanef.com/client/')
    for (const key of ['Tab', 'ArrowDown', 'PageDown', 'Escape', 'Shift']) press(page, key)
    press(page, '4', 'keyUp')
    expect(typed).not.toHaveBeenCalled()
    press(page, '4')
    press(page, 'v')
    expect(typed.mock.calls).toEqual([['https://www.sanef.com/client/'], ['https://www.sanef.com/client/']])
    typed.mockClear()
    await runOn('https://www.sanef.com/passages')
    for (const view of made.filter((v) => v.partition === 'marianne-run')) press(view, '4')
    browser.off('typed', typed)
    expect(typed).not.toHaveBeenCalled()
  })

  it('lists a payment provider’s frame it can’t read as one that may hold a card; no other frame it can’t read', async () => {
    const page = userPage('https://www.sanef.com/client/')
    const frame = (frameTreeNodeId: number, origin: string, parent: Frame | null, read: () => Promise<unknown>): Frame => ({
      origin,
      parent,
      name: '',
      frameTreeNodeId,
      detached: false,
      isDestroyed: () => false,
      executeJavaScript: read
    })
    const unreadable = async () => {
      throw new Error('The frame went away.')
    }
    const top = frame(1, 'https://www.sanef.com', null, async () => ({ fields: [], pay: [] }))
    page.frames = [top, frame(2, 'https://payment.cdn.payline.com', top, unreadable), frame(3, 'https://ads.example', top, unreadable)]
    expect(await browser.cardFields(() => true)).toEqual([
      { node: 2, origins: ['https://www.sanef.com', 'https://payment.cdn.payline.com'], fields: [], pay: [], unread: true }
    ])
  })
})

describe('the lock', () => {
  it('leaves no page and no folder, even one a run had set aside, and nothing used lately', async () => {
    browser.open('https://www.impots.gouv.fr/', 'their-folder')
    await runOn('https://www.sanef.com/passages')
    await browser.forget()
    expect(browser.state()).toMatchObject({ url: '', folderId: '', controller: 'agent', waiting: '' })
    expect(browser.quietMs()).toBeGreaterThan(30 * 60_000)
    expect(browser.inRun()).toBe(false)
  })
})
