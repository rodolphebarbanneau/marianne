import { describe, expect, it } from 'vitest'
import type { Commune } from '../src/main'
import { fakeContext } from '../src/testing'

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
