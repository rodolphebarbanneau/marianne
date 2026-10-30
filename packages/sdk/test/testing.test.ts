import { describe, expect, it } from 'vitest'
import type { Commune } from '../src/main'
import { checkTile, fakeContext } from '../src/testing'

const pkg = {
  name: '@marianne/service-meteo',
  version: '1.0.0',
  author: { name: 'Marianne' },
  marianne: { code: 'meteo', name: 'Météo', description: 'le temps', category: 'daily', hosts: ['api.open-meteo.com'] }
}

const BORDEAUX: Commune = {
  code: '33063',
  name: 'Bordeaux',
  postalCodes: ['33000', '33100'],
  department: '33',
  departmentName: 'Gironde',
  region: 'Nouvelle-Aquitaine',
  population: 261804,
  longitude: -0.5874,
  latitude: 44.8572
}

describe('fakeContext', () => {
  it('answers what the test says, and records the URLs asked', async () => {
    const { ctx, urls } = fakeContext(pkg, { answer: (url) => ({ path: url.pathname }) })
    expect(ctx.manifest.id).toBe('meteo')
    expect(await ctx.http.json('https://api.open-meteo.com/v1/forecast?latitude=44.8')).toEqual({ path: '/v1/forecast' })
    expect(urls.map((u) => u.searchParams.get('latitude'))).toEqual(['44.8'])
    await expect(ctx.http.text('https://api.open-meteo.com/')).rejects.toThrow('3615 METEO reaches no host')
  })

  it('reaches no host without an answer', async () => {
    const { ctx, urls } = fakeContext(pkg)
    await expect(ctx.http.json('https://api.open-meteo.com/')).rejects.toThrow('3615 METEO reaches no host')
    expect(urls).toEqual([])
  })

  it('refuses, as Marianne does, a host the manifest doesn’t declare, and plain http', async () => {
    const { ctx, urls } = fakeContext(pkg, { answer: () => ({}), answerText: () => '' })
    const undeclared = '3615 METEO n’a pas déclaré www.example.com (package.json, marianne.hosts).'
    await expect(ctx.http.json('https://www.example.com/a')).rejects.toThrow(undeclared)
    await expect(ctx.http.text('https://www.example.com/a')).rejects.toThrow(undeclared)
    await expect(ctx.http.page('https://www.example.com/a')).rejects.toThrow(undeclared)
    await expect(ctx.http.json('http://api.open-meteo.com/v1')).rejects.toThrow('n’a pas déclaré api.open-meteo.com')
    await expect(fakeContext(pkg).ctx.http.json('https://www.example.com/a')).rejects.toThrow(undeclared)
    expect(urls).toEqual([])
  })

  it('gives only the vehicles’ fields granted, as Marianne does', () => {
    const vehicles = [{ id: 'v1', plate: 'AB-123-CD', model: 'Clio', critair: '1' }]
    expect(fakeContext(pkg, { profile: { granted: ['vehicles.model'], vehicles } }).ctx.profile.vehicles()).toEqual([{ id: 'v1', model: 'Clio' }])
    expect(fakeContext(pkg, { profile: { granted: ['opinions.themes'], vehicles } }).ctx.profile.vehicles()).toEqual([])
    expect(fakeContext(pkg, { profile: { vehicles } }).ctx.profile.vehicles()).toEqual([])
  })

  it('stores copies, as the archive does', () => {
    const { ctx, stored } = fakeContext(pkg)
    const trip = { id: 't1' }
    ctx.storage.set('trip', trip)
    trip.id = 'changed'
    expect(ctx.storage.get('trip')).toEqual({ id: 't1' })
    ctx.storage.remove('trip')
    expect(stored.size).toBe(0)
  })

  it('finds the communes and the profile fields it is given', async () => {
    const { ctx } = fakeContext(pkg, { communes: [BORDEAUX], profile: { granted: ['vehicles.plate'], vehicles: [{ id: 'v1', plate: 'AB-123-CD' }] } })
    expect((await ctx.geo.findCommunes('33100')).map((c) => c.code)).toEqual(['33063'])
    expect((await ctx.geo.findCommunes('bord')).map((c) => c.code)).toEqual(['33063'])
    expect(await ctx.geo.getCommune('75056')).toBeNull()
    expect(ctx.profile.granted()).toEqual(['vehicles.plate'])
    expect(ctx.profile.vehicles()).toHaveLength(1)
  })
})

describe('checkTile', () => {
  it('gives back a tile within its limits, and lists what Marianne would change otherwise', () => {
    expect(checkTile({ title: 'bac jaune demain', lines: [{ text: 'à sortir ce soir', tone: 'accent' }] })).toEqual({
      title: 'bac jaune demain',
      lines: [{ text: 'à sortir ce soir', tone: 'accent' }]
    })
    expect(checkTile(null)).toBeNull()
    expect(() => checkTile({ value: { text: '1 000 000' }, lines: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] })).toThrow(
      /Marianne would change this tile:\n- value.text is cut to 6 characters: "1 000…"\n- lines: 3 given, 2 at most/
    )
  })
})

describe('fakeContext, for a service that reads pages or keeps data', () => {
  it('answers text and pages, gives the data folder and the sync status', async () => {
    const { ctx, urls } = fakeContext(pkg, { answerText: (url) => `<p>${url.pathname}</p>`, dataDir: '/tmp/meteo', sync: { syncedAt: '2026-10-30T06:00:00Z' } })
    expect(await ctx.http.text('https://api.open-meteo.com/feed')).toBe('<p>/feed</p>')
    expect(await ctx.http.page('https://api.open-meteo.com/page')).toBe('<p>/page</p>')
    expect(urls.map((u) => u.pathname)).toEqual(['/feed', '/page'])
    expect(ctx.dataDir).toBe('/tmp/meteo')
    expect(ctx.sync.status()).toEqual({ syncedAt: '2026-10-30T06:00:00Z' })
  })
})
