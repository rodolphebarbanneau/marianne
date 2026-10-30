import { readManifest, type ServiceState } from '@marianne/sdk'
import { describe, expect, it } from 'vitest'
import { readFromFrame, readToFrame } from '../../src/shared/community'
import { shortcutLabel } from '../../src/shared/shortcuts'
import { routeTarget } from '../../src/renderer/src/app/routes'
import { opensSearch, searchOf, serviceKeys, viewShows, type BarKey, type ServiceBar } from '../../src/renderer/src/host/frame'

/** Marianne's frame around a service's view: its search field, its keys in the bottom bar, the routes that open it. */

const state = (more: Partial<ServiceState> = {}): ServiceState => ({
  manifest: readManifest({
    name: '@marianne/service-infos',
    version: '1.0.0',
    marianne: {
      code: 'infos',
      name: 'Les infos',
      description: 'l’actualité de vos sources',
      category: 'daily',
      hosts: [],
      news: true,
      search: { placeholder: 'chercher dans les titres' },
      permissions: { profile: ['opinions.themes', 'opinions.sources'], purpose: 'trier les titres' }
    }
  }),
  available: true,
  on: true,
  added: true,
  pinned: false,
  tools: [],
  builtIn: true,
  access: { asked: ['opinions.themes', 'opinions.sources'], granted: ['opinions.themes'] },
  ...more
})

const menu: BarKey[] = [
  ['SOMMAIRE', 'menu', 'menu', 'menu'],
  ['GUIDE', 'guide', 'aide', 'guide']
]
const focus = () => undefined
const bar = (more: Partial<ServiceBar> = {}): ServiceBar => ({ tabs: 3, search: { what: 'dans INFOS', focused: false, focus }, keys: [], ...more })
const shown = (keys: BarKey[]) => keys.map(([key, shortcut, what]) => `${key} ${what} (${shortcut})`)

describe('the frame’s search field', () => {
  it('shows only with the view: not before the consent is answered, nor in the other states', () => {
    expect(viewShows(state(), true)).toBe(true)
    expect(viewShows(state({ access: { asked: ['opinions.themes'], granted: null } }), true)).toBe(false)
    expect(viewShows(state({ access: { asked: ['opinions.themes'], granted: [] } }), true)).toBe(true)
    expect(viewShows(state({ added: false }), true)).toBe(false)
    expect(viewShows(state({ reviewedVersion: '0.9.0' }), true)).toBe(false)
    expect(viewShows(state({ on: false }), true)).toBe(false)
    expect(viewShows(state({ available: false }), true)).toBe(false)
    expect(viewShows(state({ error: 'il a planté' }), true)).toBe(false)
    expect(viewShows(state(), false)).toBe(false)
  })

  it('is reached by « / », unless the user types elsewhere or holds a modifier', () => {
    const key = (k: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'metaKey', boolean>> = {}) => ({
      key: k,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      ...mods
    })
    expect(opensSearch(key('/'), false)).toBe(true)
    expect(opensSearch(key('/'), true)).toBe(false)
    expect(opensSearch(key('/', { ctrlKey: true }), false)).toBe(false)
    expect(opensSearch(key('/', { altKey: true }), false)).toBe(false)
    expect(opensSearch(key(':'), false)).toBe(false)
  })

  it('starts with what the screen is opened with (params.search)', () => {
    expect(searchOf({ search: 'budget 2027' })).toBe('budget 2027')
    expect(searchOf({ search: 2027 })).toBe('2027')
    expect(searchOf({ tab: 'fil' })).toBe('')
  })
})

describe('the bottom bar on a service’s screen', () => {
  it('has Marianne’s keys, then CHERCHER, then the screen’s own', () => {
    const keys = serviceKeys(bar({ keys: [{ key: 'ENVOI', what: 'ouvrir le sujet 1', shortcut: 'Entrée' }] }), menu)
    expect(shown(keys)).toEqual([
      'RETOUR Services (Escape)',
      'SUITE onglets (F2…F4)',
      'SOMMAIRE menu (menu)',
      'GUIDE aide (guide)',
      'CHERCHER dans INFOS (/)',
      'ENVOI ouvrir le sujet 1 (Entrée)'
    ])
    expect(keys.find(([key]) => key === 'CHERCHER')?.[3]).toBe(focus)
  })

  it('says ANNULATION effacer la recherche while the field has the focus, and the screen’s keys wait', () => {
    const keys = serviceKeys(
      bar({ search: { what: 'dans INFOS', focused: true, focus }, keys: [{ key: 'SUITE', what: 'sujet suivant', shortcut: '↓' }] }),
      menu
    )
    expect(shown(keys)).toEqual(['ANNULATION effacer la recherche (Escape)', 'SUITE onglets (F2…F4)', 'SOMMAIRE menu (menu)', 'GUIDE aide (guide)'])
  })

  it('lets the screen’s own key on échap stand in for the way back', () => {
    const keys = serviceKeys(bar({ keys: [{ key: 'RETOUR', what: 'fermer le sujet', shortcut: 'Échap' }] }), menu)
    expect(shown(keys)).toEqual([
      'SUITE onglets (F2…F4)',
      'SOMMAIRE menu (menu)',
      'GUIDE aide (guide)',
      'CHERCHER dans INFOS (/)',
      'RETOUR fermer le sujet (Échap)'
    ])
  })

  it('has no CHERCHER without a search field, and no SUITE without tabs', () => {
    expect(shown(serviceKeys(bar({ tabs: 1, search: null }), menu))).toEqual(['RETOUR Services (Escape)', 'SOMMAIRE menu (menu)', 'GUIDE aide (guide)'])
    expect(shown(serviceKeys(null, menu))).toEqual(['RETOUR Services (Escape)', 'SOMMAIRE menu (menu)', 'GUIDE aide (guide)'])
  })

  it('writes the tabs’ keys as the function keys they are', () => {
    expect(shortcutLabel('F2…F4', false)).toBe('F2…F4')
    expect(shortcutLabel('1…14 Entrée', false)).toBe('1…14 entrée')
  })
})

describe('routes', () => {
  it('open a service with its params, in either form', () => {
    expect(routeTarget('service/infos', { search: 'budget 2027' })).toEqual({
      kind: 'view',
      view: { kind: 'service', id: 'infos', params: { search: 'budget 2027' } }
    })
    expect(routeTarget('service:infos')).toEqual({ kind: 'view', view: { kind: 'service', id: 'infos' } })
    expect(routeTarget('service/infos', {})).toEqual({ kind: 'view', view: { kind: 'service', id: 'infos' } })
  })

  it('open a settings page at one of its sections', () => {
    expect(routeTarget('settings/identity#sources')).toEqual({ kind: 'settings', page: 'identity', section: 'sources' })
    expect(routeTarget('settings:identity#sources')).toEqual({ kind: 'settings', page: 'identity', section: 'sources' })
    expect(routeTarget('settings')).toEqual({ kind: 'settings', page: 'identity', section: '' })
  })

  it('lead the Actualités page, gone, to 3615 INFOS', () => {
    expect(routeTarget('news')).toEqual({ kind: 'view', view: { kind: 'service', id: 'infos' } })
    expect(routeTarget('procedures')).toEqual({ kind: 'view', view: { kind: 'page', page: 'procedures' } })
    expect(routeTarget('nowhere')).toBeNull()
  })
})

describe('a community screen’s bridge to the frame', () => {
  it('takes a route with a section and a few short params', () => {
    expect(readFromFrame({ type: 'route', route: 'settings/identity#sources' })).toEqual({ type: 'route', route: 'settings/identity#sources' })
    expect(readFromFrame({ type: 'route', route: 'service/infos', params: { search: 'budget', page: 2 } })).toEqual({
      type: 'route',
      route: 'service/infos',
      params: { search: 'budget', page: 2 }
    })
    expect(readFromFrame({ type: 'route', route: 'service/infos', params: { search: { $: 1 } } })).toBeNull()
    expect(readFromFrame({ type: 'route', route: 'service/infos', params: 'search' })).toBeNull()
    expect(readFromFrame({ type: 'route', route: 'folder:abc#x' })).toBeNull()
  })

  it('fills the search field and says its keys, within limits', () => {
    expect(readFromFrame({ type: 'query', text: 'budget' })).toEqual({ type: 'query', text: 'budget' })
    expect(readFromFrame({ type: 'query', text: 'x'.repeat(201) })).toBeNull()
    expect(readFromFrame({ type: 'keys', keys: [{ key: 'ENVOI', what: 'ouvrir le sujet 1', shortcut: 'Entrée', extra: 1 }] })).toEqual({
      type: 'keys',
      keys: [{ key: 'ENVOI', what: 'ouvrir le sujet 1', shortcut: 'Entrée' }]
    })
    expect(readFromFrame({ type: 'keys', keys: [{ key: 'cliquez ici', what: 'x', shortcut: 'x' }] })).toBeNull()
    expect(readFromFrame({ type: 'keys', keys: Array.from({ length: 9 }, () => ({ key: 'ENVOI', what: 'x', shortcut: 'x' })) })).toBeNull()
    expect(readFromFrame({ type: 'key', key: '/' })).toEqual({ type: 'key', key: '/' })
  })

  it('hands the screen what the field holds', () => {
    expect(readToFrame({ type: 'query', query: 'budget' })).toEqual({ type: 'query', query: 'budget' })
    expect(readToFrame({ type: 'query', query: 3 })).toBeNull()
  })
})
