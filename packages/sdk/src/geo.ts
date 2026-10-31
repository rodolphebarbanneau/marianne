/**
 * Paris, Lyon and Marseille are one commune each, made of municipal arrondissements that have codes
 * of their own (Paris 11e: 75111). An address there gets its arrondissement's code, as the Base
 * Adresse Nationale gives it, and lists of communes don't hold those codes: a commune looked up by
 * it isn't found. This says which commune an arrondissement is part of (75056, 69123, 13055), or
 * null for any other code.
 */
export function communeOfArrondissement(code: string): string | null {
  if (/^751(0[1-9]|1\d|20)$/.test(code)) return '75056'
  if (/^6938[1-9]$/.test(code)) return '69123'
  if (/^132(0[1-9]|1[0-6])$/.test(code)) return '13055'
  return null
}
