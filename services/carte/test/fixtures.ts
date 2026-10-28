import type { RawCommune, RawDepartment } from '../src/territory'

/** geo.api.gouv.fr answers, shortened. */

const GIRONDE = { code: '33', nom: 'Gironde' }
const NOUVELLE_AQUITAINE = { code: '75', nom: 'Nouvelle-Aquitaine' }

export const BORDEAUX: RawCommune = {
  nom: 'Bordeaux',
  code: '33063',
  codeDepartement: '33',
  codesPostaux: ['33000', '33100', '33200', '33300', '33800'],
  population: 267991,
  surface: 4977.4,
  centre: { coordinates: [-0.5848, 44.8624] },
  departement: GIRONDE,
  region: NOUVELLE_AQUITAINE
}

export const BORDEAUX_SAINT_CLAIR: RawCommune = {
  nom: 'Bordeaux-Saint-Clair',
  code: '76117',
  codeDepartement: '76',
  codesPostaux: ['76790'],
  population: 658,
  surface: 1020.98,
  centre: { coordinates: [0.2445, 49.6953] },
  departement: { code: '76', nom: 'Seine-Maritime' },
  region: { code: '28', nom: 'Normandie' }
}

export const GIRONDE_COMMUNES: RawCommune[] = [
  { nom: 'Pessac', code: '33318', codeDepartement: '33', codesPostaux: ['33600'], population: 66760, surface: 3882.5, centre: { coordinates: [-0.69, 44.79] } },
  { nom: 'Bordeaux', code: '33063', codeDepartement: '33', codesPostaux: BORDEAUX.codesPostaux, population: 267991, surface: 4977.4, centre: BORDEAUX.centre },
  { nom: 'Arcachon', code: '33009', codeDepartement: '33', codesPostaux: ['33120'], population: 11425, surface: 759.6, centre: { coordinates: [-1.18, 44.65] } }
]

export const DEPARTMENTS: RawDepartment[] = [
  { nom: 'Ain', code: '01', region: { code: '84', nom: 'Auvergne-Rhône-Alpes' } },
  { nom: 'Gironde', code: '33', region: NOUVELLE_AQUITAINE }
]

/** Every commune of France, as /communes gives them for the national figures. */
export const ALL_COMMUNES: RawCommune[] = [
  { nom: '', code: '01001', codeDepartement: '01', population: 800, surface: 1600 },
  { nom: '', code: '01002', codeDepartement: '01', population: 200, surface: 400 },
  ...GIRONDE_COMMUNES.map((c) => ({ nom: '', code: c.code, codeDepartement: '33', population: c.population, surface: c.surface }))
]
