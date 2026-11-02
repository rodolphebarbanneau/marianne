import { readManifest } from '@marianne/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The open account's settings, as the archive keeps them: only what options.ts reads and writes. */
const state = vi.hoisted(() => ({ unlocked: true, kept: {} as Record<string, Record<string, unknown>> }))

vi.mock('../src/main/session', () => ({
  session: {
    get unlocked() {
      return state.unlocked
    }
  }
}))
vi.mock('../src/main/account', () => ({
  accounts: {
    settings: () => ({ services: { options: state.kept } }),
    updateSettings: (patch: { services: { options: Record<string, Record<string, unknown>> } }) => {
      state.kept = patch.services.options
    }
  }
}))
vi.mock('../src/main/log', () => ({ log: { info: () => {}, warn: () => {}, error: () => {} } }))

const { announceOptions, optionsOf, serviceOptions, setOption } = await import('../src/main/host/options')

const manifest = readManifest({
  name: '@marianne/service-parlement',
  version: '1.0.0',
  marianne: {
    code: 'parlement',
    name: 'Parlement',
    description: 'les votes',
    category: 'democracy',
    hosts: [],
    options: [
      {
        key: 'chamber',
        label: 'chambre à l’ouverture',
        type: 'choice',
        choices: [
          { value: 'both', label: 'les deux' },
          { value: 'an', label: 'Assemblée' }
        ],
        default: 'both'
      },
      { key: 'live', label: 'séance en direct', type: 'switch', default: false }
    ]
  }
})

beforeEach(() => {
  state.unlocked = true
  state.kept = {}
})

describe('a service’s own options', () => {
  it('are their defaults until the user chooses, and while locked', () => {
    expect(optionsOf(manifest)).toEqual({ chamber: 'both', live: false })
    state.kept = { parlement: { chamber: 'an' } }
    expect(optionsOf(manifest)).toEqual({ chamber: 'an', live: false })
    state.unlocked = false
    expect(optionsOf(manifest)).toEqual({ chamber: 'both', live: false })
  })

  it('keep the user’s choice, checked against the manifest, in the account’s settings, by service', () => {
    state.kept = { meteo: { days: 3 } }
    expect(setOption(manifest, 'chamber', 'an')).toEqual({ chamber: 'an', live: false })
    expect(state.kept).toEqual({ meteo: { days: 3 }, parlement: { chamber: 'an', live: false } })
    expect(() => setOption(manifest, 'chamber', 'eu')).toThrow('cette valeur ne convient pas à « chambre à l’ouverture »')
    expect(() => setOption(manifest, 'live', 'yes')).toThrow('cette valeur ne convient pas')
    expect(() => setOption(manifest, 'theme', 'dark')).toThrow('3615 PARLEMENT n’a pas de réglage « theme »')
    expect(state.kept.parlement).toEqual({ chamber: 'an', live: false })
  })

  it('tell the service when the user changes one, and when another account opens or none is', () => {
    const heard: unknown[] = []
    const stop = serviceOptions(manifest).onChange((values) => heard.push(values))
    setOption(manifest, 'live', true)
    state.unlocked = false
    announceOptions(manifest)
    stop()
    setOption(manifest, 'chamber', 'an')
    expect(heard).toEqual([
      { chamber: 'both', live: true },
      { chamber: 'both', live: false }
    ])
  })

  it('keep telling the others when one listener fails', () => {
    const heard: unknown[] = []
    serviceOptions(manifest).onChange(() => {
      throw new Error('broken')
    })
    serviceOptions(manifest).onChange((values) => heard.push(values))
    setOption(manifest, 'chamber', 'an')
    expect(heard).toEqual([{ chamber: 'an', live: false }])
  })
})
