import * as z from 'zod'
import { fetchJson } from '../http'
import { findCommunes } from '../public/geo'
import { base, clip, tool, ToolError } from './tool'

/**
 * OpenFisca France, the open-source model of French taxes and benefits (the one the official
 * simulators use). Amounts are estimates for the situation described, not decisions.
 */

type Situation = Record<string, Record<string, Record<string, unknown>>>

/** Benefits of the family entity, by OpenFisca variable. */
const FAMILY_BENEFITS: Array<[string, string]> = [
  ['rsa', 'RSA'],
  ['ppa', 'prime d’activité (in-work benefit)'],
  ['aide_logement', 'housing benefit (APL, ALS or ALF)'],
  ['af', 'allocations familiales'],
  ['cf', 'complément familial'],
  ['asf', 'allocation de soutien familial'],
  ['aspa', 'minimum old-age pension (ASPA)']
]

/** Housing situations, as OpenFisca's statut_occupation_logement names them. */
const HOUSING = {
  tenant_unfurnished: 'locataire_vide',
  tenant_furnished: 'locataire_meuble',
  social_housing: 'locataire_hlm',
  hostel: 'locataire_foyer',
  owner: 'proprietaire',
  first_time_buyer: 'primo_accedant',
  housed_free: 'loge_gratuitement',
  homeless: 'sans_domicile'
} as const

type Housing = keyof typeof HOUSING

/** Couples, as OpenFisca's statut_marital names them; cohabiting partners file separately. */
const COUPLES = { married: 'marie', pacs: 'pacse', cohabiting: '' } as const

const month = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Months from `from` (YYYY-MM) to December of `toYear`, inclusive. */
function monthsUntilYearEnd(from: string, toYear: number): number {
  const [y, m] = from.split('-').map(Number)
  return (toYear - y) * 12 + (12 - m) + 1
}

function shift(period: string, months: number): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + months, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

async function calculate(situation: Situation): Promise<Situation> {
  return fetchJson<Situation>(`${base('openfisca')}/calculate`, { json: situation, timeoutMs: 60_000 })
}

const euros = (v: unknown) => `${Math.abs(Number(v) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

const adult = z.object({
  birth_date: z.string().describe('YYYY-MM-DD'),
  gross_monthly_salary: z.number().min(0).default(0),
  net_monthly_unemployment: z.number().min(0).default(0),
  gross_monthly_pension: z.number().min(0).default(0),
  disability: z.boolean().default(false).describe('A recognized incapacity rate of at least 80 %')
})

export const openfiscaTools = [
  tool({
    name: 'estimate_benefits',
    title: 'OpenFisca estimate',
    source: 'openfisca',
    readOnly: true,
    description:
      'Estimates, for a household described simply, the monthly amount of the main benefits (RSA, prime d’activité, housing benefit, allocations familiales, complément familial, ASF, ASPA, AAH) and the income tax of the year, with the official OpenFisca model. Incomes are assumed stable over the last 12 months. Always present the result as an estimate, and point to the official simulator or the body for a decision.',
    input: {
      commune: z.string().describe('Commune of residence: name, postal code or INSEE code'),
      adults: z.array(adult).min(1).max(2),
      couple: z.enum(['married', 'pacs', 'cohabiting']).default('married').describe('For two adults'),
      children: z
        .array(z.object({ birth_date: z.string().describe('YYYY-MM-DD') }))
        .max(10)
        .default([]),
      housing: z.enum(Object.keys(HOUSING) as [Housing, ...Housing[]]).default('tenant_unfurnished'),
      rent: z.number().min(0).default(0).describe('Monthly rent without charges, or the loan instalment of a first-time buyer'),
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional()
        .describe('Month simulated, YYYY-MM (default: this month)')
    },
    run: async ({ commune, adults, couple, children, housing, rent, month: asked }) => {
      const period = asked ?? month()
      const year = Number(period.slice(0, 4))
      const place = (
        await findCommunes(commune, 1).catch((err: Error) => {
          throw new ToolError(err.message)
        })
      )[0]
      if (!place) throw new ToolError(`Commune not found: « ${commune} ».`)
      // Benefits look back over past months and the tax over the whole year: spread stable incomes.
      const from = shift(period, -12)
      const span = monthsUntilYearEnd(from, year)
      const spread = (monthly: number) => ({ [`month:${from}:${span}`]: monthly * span })
      const adultIds = adults.map((_, i) => `adult${i + 1}`)
      const childIds = children.map((_, i) => `child${i + 1}`)
      const marital = adults.length === 2 ? COUPLES[couple] : ''
      const individus: Record<string, Record<string, unknown>> = {}
      adults.forEach((a, i) => {
        individus[adultIds[i]] = {
          date_naissance: { ETERNITY: a.birth_date },
          salaire_de_base: spread(a.gross_monthly_salary),
          chomage_net: spread(a.net_monthly_unemployment),
          retraite_brute: spread(a.gross_monthly_pension),
          ...(marital ? { statut_marital: { [period]: marital } } : {}),
          ...(a.disability ? { handicap: { [period]: true }, taux_incapacite: { [period]: 0.8 }, aah: { [period]: null } } : {})
        }
      })
      children.forEach((c, i) => (individus[childIds[i]] = { date_naissance: { ETERNITY: c.birth_date } }))
      // Married or pacsed couples file one tax return; others one each, children with the first.
      const joint = adults.length === 1 || !!marital
      const foyers: Record<string, Record<string, unknown>> = joint
        ? { foyer1: { declarants: adultIds, personnes_a_charge: childIds } }
        : { foyer1: { declarants: [adultIds[0]], personnes_a_charge: childIds }, foyer2: { declarants: [adultIds[1]], personnes_a_charge: [] } }
      for (const f of Object.values(foyers)) f.impot_revenu_restant_a_payer = { [year]: null }
      const situation: Situation = {
        individus,
        familles: {
          famille: { parents: adultIds, enfants: childIds, ...Object.fromEntries(FAMILY_BENEFITS.map(([v]) => [v, { [period]: null }])) }
        },
        foyers_fiscaux: foyers,
        menages: {
          menage: {
            personne_de_reference: [adultIds[0]],
            ...(adultIds[1] ? { conjoint: [adultIds[1]] } : {}),
            enfants: childIds,
            depcom: { [period]: place.code },
            statut_occupation_logement: { [period]: HOUSING[housing] },
            loyer: { [period]: rent }
          }
        }
      }
      const r = await calculate(situation)
      const family = r.familles.famille
      const rows = FAMILY_BENEFITS.map(([v, label]) => `- ${label}: ${euros((family[v] as Record<string, number>)[period])} a month`)
      for (const [i, id] of adultIds.entries()) {
        const aah = (r.individus[id].aah as Record<string, number> | undefined)?.[period]
        if (aah !== undefined) rows.push(`- AAH (adult ${i + 1}): ${euros(aah)} a month`)
      }
      const taxes = Object.keys(foyers).map((f) => euros((r.foyers_fiscaux[f].impot_revenu_restant_a_payer as Record<string, number>)[year]))
      rows.push(`- income tax ${year} (paid in ${year + 1}): ${taxes.join(' + ')} a year`)
      return `OpenFisca estimate for ${period} · ${place.name} (${place.code}) · ${housing.replace(/_/g, ' ')}${rent ? `, rent ${rent} €` : ''} · ${adults.length} adult(s), ${children.length} child(ren):\n\n${rows.join('\n')}\n\nAssumptions: the same incomes every month since ${from}, no other income nor assets. Actual rights depend on the body's review of the file (CAF, MSA, tax office).`
    }
  }),

  tool({
    name: 'openfisca_simulation',
    title: 'OpenFisca simulation',
    source: 'openfisca',
    readOnly: true,
    description:
      'Free OpenFisca calculation, for cases estimate_benefits does not cover: send a whole situation in the format of the /calculate API (individus, familles, foyers_fiscaux, menages; variables to compute set to null) and get the same structure back, filled in. Tax amounts are negative. Check variable names with openfisca_variable.',
    input: { situation: z.record(z.string(), z.any()).describe('OpenFisca situation (JSON)') },
    run: async ({ situation }) => clip(JSON.stringify(await calculate(situation as Situation), null, 1), 20_000)
  }),

  tool({
    name: 'openfisca_variable',
    title: 'OpenFisca variable',
    source: 'openfisca',
    readOnly: true,
    description:
      'Describes an OpenFisca variable: definition, entity (individu, famille, foyer_fiscal, menage), period (MONTH, YEAR), possible values and legal references.',
    input: { name: z.string().regex(/^[a-z0-9_]+$/) },
    run: async ({ name }) => {
      const v = await fetchJson<{
        description: string
        entity: string
        definitionPeriod: string
        valueType: string
        possibleValues?: Record<string, string>
        references?: string[]
      }>(`${base('openfisca')}/variable/${name}`, { cacheMs: 86_400_000 })
      const values = v.possibleValues ? `\nvalues: ${Object.keys(v.possibleValues).join(', ')}` : ''
      const refs = v.references?.length ? `\nreferences: ${v.references.join(' ; ')}` : ''
      return `${name}: ${v.description}\nentity ${v.entity} · period ${v.definitionPeriod} · type ${v.valueType}${values}${refs}`
    }
  })
]
