import { describe, expect, it } from 'vitest'
import type { MarianneApi } from '../../src/shared/api'
import type { BrowserState } from '../../src/shared/types'
import type { View } from '../../src/renderer/src/app/routes'
import { BrowserReveals } from '../../src/renderer/src/browser/reveal'

/** window.marianne's two events, sent by hand as the main process would. */
function fakeApi() {
  const reveal = new Set<(folderId: string) => void>()
  const state = new Set<(s: BrowserState) => void>()
  const api: Pick<MarianneApi, 'onBrowserReveal' | 'onBrowserState'> = {
    onBrowserReveal: (cb) => (reveal.add(cb), () => void reveal.delete(cb)),
    onBrowserState: (cb) => (state.add(cb), () => void state.delete(cb))
  }
  const page = (folderId: string): BrowserState => ({
    url: 'https://www.impots.gouv.fr/',
    title: 'impots.gouv.fr',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    visible: false,
    controller: 'agent',
    folderId,
    waiting: ''
  })
  return {
    api,
    /** The main process: browser.reveal(), after the page's state (browser.open or setWaiting). */
    reveal: (folderId: string) => {
      for (const cb of state) cb(page(folderId))
      for (const cb of reveal) cb(folderId)
    },
    /** The browser's page changed hands (open_site in another folder, the account locked). */
    browse: (folderId: string) => {
      for (const cb of state) cb(page(folderId))
    },
    listeners: () => reveal.size + state.size
  }
}

/** The window: its screen, and what the reveals did to it. */
function windowOn(start: View) {
  const main = fakeApi()
  let view = start
  const did: string[] = []
  const reveals = new BrowserReveals({ view: () => view, open: () => did.push('open'), away: (id) => did.push(`away:${id}`) })
  const stop = reveals.listen(main.api)
  const go = (next: View) => {
    view = next
    reveals.visit(next)
  }
  return { ...main, did, go, stop }
}

const folder = (id: string): View => ({ kind: 'folder', id })

describe('Marianne showing the browser (hand_over, open_site with show)', () => {
  it('opens the panel of the folder on screen', () => {
    const w = windowOn(folder('impots'))
    w.reveal('impots')
    expect(w.did).toEqual(['open'])
  })

  it('leaves the user on another folder, tells them, and opens the panel when they go to the folder', () => {
    const w = windowOn(folder('logement'))
    w.reveal('impots')
    expect(w.did).toEqual(['away:impots'])
    // Elsewhere first: nothing opens there.
    w.go({ kind: 'page', page: 'home' })
    w.go(folder('famille'))
    expect(w.did).toEqual(['away:impots'])
    w.go(folder('impots'))
    expect(w.did).toEqual(['away:impots', 'open'])
    // Once only: the user may close the panel, and coming back doesn't open it again.
    w.go(folder('logement'))
    w.go(folder('impots'))
    expect(w.did).toEqual(['away:impots', 'open'])
  })

  it('waits on a page of the app or a service as on another folder', () => {
    const w = windowOn({ kind: 'service', id: 'meteo' })
    w.reveal('impots')
    w.go(folder('impots'))
    expect(w.did).toEqual(['away:impots', 'open'])
  })

  it('waits for the latest folder Marianne asked for: the browser holds one page', () => {
    const w = windowOn({ kind: 'page', page: 'home' })
    w.reveal('impots')
    w.reveal('caf')
    w.go(folder('impots'))
    expect(w.did).toEqual(['away:impots', 'away:caf'])
    w.go(folder('caf'))
    expect(w.did).toEqual(['away:impots', 'away:caf', 'open'])
  })

  it('forgets a reveal once the browser’s page belongs to another folder, or to none', () => {
    const w = windowOn({ kind: 'page', page: 'home' })
    // The folder's own page moving on (the user signing in elsewhere, a redirect) keeps it.
    w.reveal('impots')
    w.browse('impots')
    w.go(folder('impots'))
    expect(w.did).toEqual(['away:impots', 'open'])
    w.did.length = 0
    w.go({ kind: 'page', page: 'home' })
    // Another folder's open_site took the browser: its panel would show the other folder's page.
    w.reveal('impots')
    w.browse('caf')
    w.go(folder('impots'))
    expect(w.did).toEqual(['away:impots'])
    w.did.length = 0
    w.go({ kind: 'page', page: 'home' })
    // The account locked: the browser forgot every page.
    w.reveal('impots')
    w.browse('')
    w.go(folder('impots'))
    expect(w.did).toEqual(['away:impots'])
  })

  it('stops hearing the main process when the window lets it go', () => {
    const w = windowOn(folder('impots'))
    expect(w.listeners()).toBe(2)
    w.stop()
    expect(w.listeners()).toBe(0)
    w.reveal('impots')
    expect(w.did).toEqual([])
  })
})
