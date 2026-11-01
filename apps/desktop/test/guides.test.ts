import { describe, expect, it } from 'vitest'
import { GuideLedger, type GuideSources } from '../src/main/guides'

/** 3615 VIGNETTE ships one guide and acts on paiement.vignette.example; 3615 CIEL ships none. */
const sources: GuideSources = {
  guides: () => [{ service: 'vignette', guides: [{ name: 'low-emission-zones', body: '# Zones\n\nRead the zones first.' }] }],
  onSites: (service, url) => service === 'vignette' && new URL(url).hostname === 'paiement.vignette.example'
}
const zones = { name: 'vignette_zones', service: 'vignette' }

describe('a service’s guides, with its first use in a folder', () => {
  it('come with the first call of one of its tools, once per folder', () => {
    const ledger = new GuideLedger(sources)
    expect(ledger.forCall('f1', zones, {}).map((g) => g.name)).toEqual(['low-emission-zones'])
    expect(ledger.forCall('f1', zones, {})).toEqual([])
    // Another folder is another conversation.
    expect(ledger.forCall('f2', zones, {}).map((g) => g.name)).toEqual(['low-emission-zones'])
  })

  it('come with the opening of a site it declares, and not of another', () => {
    const ledger = new GuideLedger(sources)
    expect(ledger.forCall('f1', { name: 'open_site' }, { url: 'https://www.service-public.fr/' })).toEqual([])
    expect(ledger.forCall('f1', { name: 'open_site' }, { url: 'https://paiement.vignette.example/payer' }).map((g) => g.name)).toEqual(['low-emission-zones'])
    // Nor with Marianne's other tools, nor a service that ships none.
    expect(ledger.forCall('f2', { name: 'read_page' }, { url: 'https://paiement.vignette.example/payer' })).toEqual([])
    expect(ledger.forCall('f2', { name: 'ciel_now', service: 'ciel' }, {})).toEqual([])
  })

  it('don’t come again once the engine read them itself', () => {
    const ledger = new GuideLedger(sources)
    ledger.noteRead('f1', 'low-emission-zones')
    expect(ledger.forCall('f1', zones, {})).toEqual([])
  })

  it('say what they are, after the call’s own result', () => {
    const text = GuideLedger.text([{ name: 'low-emission-zones', body: '# Zones\n\nRead the zones first.' }])
    expect(text).toMatch(/^\n\n---\n\nThe guide « low-emission-zones », which comes with this service's first use in the folder/)
    expect(text).toContain('Read the zones first.')
    expect(GuideLedger.text([])).toBe('')
  })
})
