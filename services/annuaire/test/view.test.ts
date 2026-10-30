import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readManifest, ServiceHostProvider, type Loaded, type ServiceHost } from '@marianne/sdk/view'
import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { parseOffice } from '../src/directory'
import type { NearbyOffices } from '../src/types'
import { Nearby } from '../src/view'
import { MAIRIE_BORDEAUX } from './fixtures'

// The screen's list of the offices near the user's commune, rendered as markup.

const HOST: ServiceHost = {
  manifest: readManifest(pkg),
  call: async () => null as never,
  params: {},
  home: null,
  ask: () => undefined,
  openRoute: () => undefined,
  openUrl: () => undefined,
  copy: () => undefined,
  toast: () => undefined,
  load: async () => null,
  save: async () => undefined
}

const loaded = (data: NearbyOffices[]): Loaded<NearbyOffices[]> => ({ data, error: '', loading: false, reload: () => undefined })
const nearby = (data: NearbyOffices[]) =>
  renderToStaticMarkup(
    createElement(ServiceHostProvider, {
      host: HOST,
      children: createElement(Nearby, { state: loaded(data), place: 'Bordeaux', now: new Date(2026, 9, 28, 10) })
    })
  )

describe('the offices near the commune', () => {
  it('says which kinds the directory didn’t answer for, apart from those it has none of', () => {
    const html = nearby([
      { kind: 'mairie', label: 'Mairie', offices: [parseOffice(MAIRIE_BORDEAUX)] },
      { kind: 'caf', label: 'Caf', offices: [], error: 'HTTP 500' },
      { kind: 'cpam', label: 'CPAM', offices: [] }
    ])
    expect(html).toContain('Mairie - Bordeaux')
    expect(html).toContain('Rien trouvé pour : CPAM.')
    expect(html).toContain('L’annuaire n’a pas répondu pour Caf : ')
    expect(html).toContain('HTTP 500')
    expect(html).toContain('réessayer')
  })

  it('says nothing failed when every kind answered', () => {
    const html = nearby([
      { kind: 'mairie', label: 'Mairie', offices: [parseOffice(MAIRIE_BORDEAUX)] },
      { kind: 'cpam', label: 'CPAM', offices: [] }
    ])
    expect(html).toContain('Rien trouvé pour : CPAM.')
    expect(html).not.toContain('n’a pas répondu')
  })
})
