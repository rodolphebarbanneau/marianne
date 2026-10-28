import * as z from 'zod'
import { fetchJson } from '../http'
import { findCommunes } from './geo'
import { base, clip, tool, ToolError } from './tool'

/**
 * OpenFisca France, the open-source model of French taxes and benefits (used by the official
 * simulators). Amounts are estimates for the situation described, not decisions.
 */

type Situation = Record<string, Record<string, Record<string, unknown>>>

const FAMILY_BENEFITS: Array<[string, string]> = [
  ['rsa', 'RSA'],
  ['ppa', 'prime d’activité'],
  ['aide_logement', 'aide au logement (apl, als ou alf)'],
  ['af', 'allocations familiales'],
  ['cf', 'complément familial'],
  ['asf', 'allocation de soutien familial'],
  ['aspa', 'minimum vieillesse (aspa)']
]

const LOGEMENTS = [
  'locataire_vide',
  'locataire_meuble',
  'locataire_hlm',
  'locataire_foyer',
  'proprietaire',
  'primo_accedant',
  'loge_gratuitement',
  'sans_domicile'
] as const

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
  date_naissance: z.string().describe('AAAA-MM-JJ'),
  salaire_brut_mensuel: z.number().min(0).default(0),
  chomage_net_mensuel: z.number().min(0).default(0),
  retraite_brute_mensuelle: z.number().min(0).default(0),
  handicap: z.boolean().default(false).describe('Taux d’incapacité reconnu d’au moins 80 %')
})

export const openfiscaTools = [
  tool({
    name: 'estimation_aides',
    title: 'OpenFisca · estimation des aides',
    source: 'openfisca',
    readOnly: true,
    description:
      "Estime, pour un foyer décrit simplement, le montant mensuel des principales prestations (rsa, prime d'activité, aide au logement, allocations familiales, complément familial, asf, aspa, aah) et l'impôt sur le revenu de l'année, avec le moteur officiel OpenFisca. Les revenus sont supposés stables sur les 12 derniers mois. Donne toujours le résultat comme une estimation, et renvoie vers le simulateur officiel ou l'organisme pour une décision.",
    input: {
      commune: z.string().describe('Commune de résidence : nom, code postal ou code insee'),
      adultes: z.array(adult).min(1).max(2),
      couple: z.enum(['marie', 'pacse', 'union_libre']).default('marie').describe('Pour deux adultes'),
      enfants: z
        .array(z.object({ date_naissance: z.string() }))
        .max(10)
        .default([]),
      logement: z.enum(LOGEMENTS).default('locataire_vide'),
      loyer: z.number().min(0).default(0).describe('Loyer mensuel hors charges, ou mensualité d’emprunt d’un primo-accédant'),
      mois: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional()
        .describe('Mois simulé AAAA-MM (défaut : mois en cours)')
    },
    run: async ({ commune, adultes, couple, enfants, logement, loyer, mois }) => {
      const period = mois ?? month()
      const year = Number(period.slice(0, 4))
      const place = (await findCommunes(commune, 1))[0]
      if (!place) throw new ToolError(`Commune introuvable : « ${commune} ».`)
      // Benefits look back over past months and the tax over the whole year: spread stable incomes.
      const from = shift(period, -12)
      const span = monthsUntilYearEnd(from, year)
      const spread = (monthly: number) => ({ [`month:${from}:${span}`]: monthly * span })
      const adultIds = adultes.map((_, i) => `adulte${i + 1}`)
      const childIds = enfants.map((_, i) => `enfant${i + 1}`)
      const individus: Record<string, Record<string, unknown>> = {}
      adultes.forEach((a, i) => {
        individus[adultIds[i]] = {
          date_naissance: { ETERNITY: a.date_naissance },
          salaire_de_base: spread(a.salaire_brut_mensuel),
          chomage_net: spread(a.chomage_net_mensuel),
          retraite_brute: spread(a.retraite_brute_mensuelle),
          ...(adultes.length === 2 && couple !== 'union_libre' ? { statut_marital: { [period]: couple } } : {}),
          ...(a.handicap ? { handicap: { [period]: true }, taux_incapacite: { [period]: 0.8 }, aah: { [period]: null } } : {})
        }
      })
      enfants.forEach((e, i) => (individus[childIds[i]] = { date_naissance: { ETERNITY: e.date_naissance } }))
      // Married or pacsed couples file one tax return; others one each, children with the first.
      const joint = adultes.length === 1 || couple !== 'union_libre'
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
            statut_occupation_logement: { [period]: logement },
            loyer: { [period]: loyer }
          }
        }
      }
      const r = await calculate(situation)
      const fam = r.familles.famille
      const rows = FAMILY_BENEFITS.map(([v, label]) => `- ${label} : ${euros((fam[v] as Record<string, number>)[period])} par mois`)
      for (const [i, id] of adultIds.entries()) {
        const aah = (r.individus[id].aah as Record<string, number> | undefined)?.[period]
        if (aah !== undefined) rows.push(`- aah (adulte ${i + 1}) : ${euros(aah)} par mois`)
      }
      const taxes = Object.keys(foyers).map((f) => euros((r.foyers_fiscaux[f].impot_revenu_restant_a_payer as Record<string, number>)[year]))
      rows.push(`- impôt sur le revenu ${year} (payé en ${year + 1}) : ${taxes.join(' + ')} par an`)
      return `Estimation OpenFisca pour ${period} · ${place.nom} (${place.code}) · ${logement.replace(/_/g, ' ')}${loyer ? `, loyer ${loyer} €` : ''} · ${adultes.length} adulte(s), ${enfants.length} enfant(s) :\n\n${rows.join('\n')}\n\nHypothèses : revenus identiques chaque mois depuis ${from}, pas d'autre revenu ni patrimoine. Les droits réels dépendent de l'examen du dossier par l'organisme (caf, msa, impôts).`
    }
  }),

  tool({
    name: 'simulation_openfisca',
    title: 'OpenFisca · simulation',
    source: 'openfisca',
    readOnly: true,
    description:
      "Calcul OpenFisca libre, pour les cas qu'estimation_aides ne couvre pas : envoie une situation complète au format de l'API /calculate (individus, familles, foyers_fiscaux, menages ; variables à calculer à null) et reçoit la même structure remplie. Les montants d'impôt sont négatifs. Vérifie les noms de variables avec variable_openfisca.",
    input: { situation: z.record(z.string(), z.any()).describe('Situation OpenFisca (JSON)') },
    run: async ({ situation }) => clip(JSON.stringify(await calculate(situation as Situation), null, 1), 20_000)
  }),

  tool({
    name: 'variable_openfisca',
    title: 'OpenFisca · variable',
    source: 'openfisca',
    readOnly: true,
    description:
      'Décrit une variable OpenFisca : définition, entité (individu, famille, foyer_fiscal, menage), période (MONTH, YEAR), valeurs possibles et textes de loi de référence.',
    input: { nom: z.string().regex(/^[a-z0-9_]+$/) },
    run: async ({ nom }) => {
      const v = await fetchJson<{
        description: string
        entity: string
        definitionPeriod: string
        valueType: string
        possibleValues?: Record<string, string>
        references?: string[]
      }>(`${base('openfisca')}/variable/${nom}`, { cacheMs: 86_400_000 })
      const values = v.possibleValues ? `\nvaleurs : ${Object.keys(v.possibleValues).join(', ')}` : ''
      const refs = v.references?.length ? `\nréférences : ${v.references.join(' ; ')}` : ''
      return `${nom} : ${v.description}\nentité ${v.entity} · période ${v.definitionPeriod} · type ${v.valueType}${values}${refs}`
    }
  })
]
