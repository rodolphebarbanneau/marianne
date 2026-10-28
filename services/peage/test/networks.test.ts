import { readManifest } from '@marianne/sdk'
import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { hostOf, NETWORKS, networkOf, SCAM_SOURCES } from '../src/networks'

describe('the manifest', () => {
  it('is valid: mobility, plates only, no host', () => {
    const m = readManifest(pkg)
    expect(m).toMatchObject({ id: 'peage', name: 'Péage en flux libre', category: 'daily', domains: ['mobility'], hosts: [] })
    expect(m.permissions).toEqual({ profile: ['vehicles.plate'], purpose: 'vous rappeler les péages en flux libre à payer et ouvrir le paiement officiel' })
  })
})

describe('the catalog', () => {
  it('has unique ids, made for trips to refer to', () => {
    const ids = NETWORKS.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(networkOf('a13-a14')?.operator).toBe('Sanef')
    expect(networkOf('a79')?.operator).toBe('ALIAE')
    expect(networkOf('a99')).toBeUndefined()
  })

  it('gives each section its official https pages, a time to pay and its sources, checked on a day', () => {
    for (const n of NETWORKS) {
      for (const url of [n.payUrl, ...(n.accountUrl ? [n.accountUrl] : []), ...n.sources]) expect(new URL(url).protocol, `${n.id}: ${url}`).toBe('https:')
      expect(n.deadlineHours, n.id).toBeGreaterThan(0)
      expect(n.motorways.length, n.id).toBeGreaterThan(0)
      expect(n.channels.length, n.id).toBeGreaterThan(0)
      expect(n.penalties.trim(), n.id).not.toBe('')
      expect(n.sources.length, n.id).toBeGreaterThan(0)
      expect(n.checked, n.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(n.checked)), n.id).toBe(false)
    }
  })

  it('pays on the operators’ own sites only', () => {
    expect([...new Set(NETWORKS.map((n) => hostOf(n.payUrl)))]).toEqual(['www.sanef.com', 'paiement.aliae.com'])
    for (const url of SCAM_SOURCES) expect(new URL(url).protocol).toBe('https:')
  })
})
