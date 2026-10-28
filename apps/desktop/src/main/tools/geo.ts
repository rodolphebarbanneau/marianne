import * as z from 'zod'
import { fetchJson, query } from '../http'
import { findCommunes } from '../public/geo'
import { base, plural, table, tool, ToolError } from './tool'

/** Communes (Découpage administratif) and postal addresses (Base adresse nationale). */

interface AddressFeature {
  properties: Record<string, string | number>
  geometry: { coordinates: [number, number] }
}

export const geoTools = [
  tool({
    name: 'communes',
    title: 'Communes',
    source: 'geo',
    readOnly: true,
    description:
      'Finds a commune by name, postal code or INSEE code: official codes (INSEE, postal), department, region, population. Useful before the tools that need an INSEE code (openfisca_simulation).',
    input: { query: z.string().min(2).describe('Commune name, postal code or INSEE code') },
    run: async ({ query: q }) => {
      const list = await findCommunes(q, 8)
      if (!list.length) throw new ToolError(`No commune for « ${q} ».`)
      return `${plural(list.length, 'commune')}:\n\n${table(
        ['commune', 'INSEE code', 'postal codes', 'department', 'region', 'population'],
        list.map((c) => [c.name, c.code, c.postalCodes.join(', '), `${c.departmentName} (${c.department})`, c.region, c.population || ''])
      )}`
    }
  }),

  tool({
    name: 'addresses',
    title: 'Addresses',
    source: 'adresse',
    readOnly: true,
    description: 'Finds or normalizes a French postal address (Base adresse nationale): official label, postal code, commune, INSEE code, coordinates.',
    input: { address: z.string().min(3), limit: z.number().int().min(1).max(10).default(5) },
    run: async ({ address, limit }, ctx) => {
      const data = await fetchJson<{ features?: AddressFeature[] }>(`${base('adresse')}/search${query({ q: address, limit })}`)
      if (!data.features?.length) throw new ToolError(`Address not found: « ${address} ».`)
      return table(
        ['address', 'postal code', 'commune', 'INSEE code', 'score', 'lon, lat'],
        data.features.map((f) => [
          f.properties.label,
          f.properties.postcode,
          f.properties.city,
          f.properties.citycode,
          Number(f.properties.score).toFixed(2),
          // The user's own address: the neighbourhood (about 1 km), not the house.
          f.geometry.coordinates.map((c) => c.toFixed(ctx.resolved ? 2 : 5)).join(', ')
        ])
      )
    }
  })
]
