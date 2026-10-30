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

/** Each view made, with its session and the addresses it loaded. */
const made = vi.hoisted(() => [] as Array<{ partition: string; loaded: string[]; closed: boolean }>)

vi.mock('electron', () => {
  class WebContentsView {
    webContents: Record<string, unknown>
    constructor(options: { webPreferences: { partition: string } }) {
      const view = { partition: options.webPreferences.partition, loaded: [] as string[], closed: false }
      made.push(view)
      this.webContents = {
        loadURL: async (url: string) => void view.loaded.push(url),
        getURL: () => view.loaded.at(-1) ?? '',
        getTitle: () => '',
        isLoading: () => false,
        navigationHistory: { canGoBack: () => false, canGoForward: () => false },
        setBackgroundThrottling: () => undefined,
        setWindowOpenHandler: () => undefined,
        on: () => undefined,
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
