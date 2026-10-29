import type { DatabaseSync } from 'node:sqlite'
import { strToU8, zipSync } from 'fflate'
import { parsePollingStations } from '../src/constituency'
import { addSenateBallots, indexBallots, indexBills, indexConstituencies, indexDeputies, indexFormer, indexMeetings, indexSenators } from '../src/indexer'
import { parseSenateColors, parseSenateVotes, parseSenators } from '../src/senate'
import { resetSchema, transaction } from '../src/store'
import type { Http } from '../src/videos'

/**
 * A small Parliament in the shapes of its sources. At the Assemblée: four organs, five sitting
 * deputies and a former one, two ballots, the agenda of 28 October 2026 (with a committee's
 * attendance), a legislative file's rapporteur; in the actors' history, a deputy of the
 * legislature who changed group then left office, and one of the previous legislature only. At the Sénat: three senators, the home page's
 * colours, two ballots of the session 2026. And which constituency a few communes are in. The
 * Assemblée's JSON comes from XML: single children are objects, several are arrays, empty ones null.
 */

export const organ = (uid: string, codeType: string, libelle: string, libelleAbrege: string, libelleAbrev: string, couleurAssociee: string | null = null) => ({
  organe: { uid, codeType, libelle, libelleAbrege, libelleAbrev, couleurAssociee }
})

const mandate = (typeOrgane: string, organeRef: string, extra: Record<string, unknown> = {}) => ({
  typeOrgane,
  legislature: '17',
  dateFin: null,
  organes: { organeRef },
  ...extra
})

export const actor = (
  id: string,
  ident: { civ: string; prenom: string; nom: string },
  place: { departement: string; numDepartement: string; numCirco: string },
  mandates: unknown[],
  options: { ended?: boolean; seat?: number } = {}
) => ({
  acteur: {
    uid: { '#text': id },
    etatCivil: { ident, infoNaissance: { dateNais: '1960-01-01' } },
    profession: { libelleCourant: 'Enseignant' },
    uri_hatvp: `https://www.hatvp.fr/pages_nominatives/${ident.nom.toLowerCase()}`,
    adresses: {
      adresse: [
        { '@xsi:type': 'AdressePostale_Type', type: '2', numeroRue: '7', nomRue: 'Avenue Roger Schwob', codePostal: '33150', ville: 'Cenon' },
        { '@xsi:type': 'AdresseMail_Type', valElec: `${ident.prenom}.${ident.nom}@assemblee-nationale.fr` }
      ]
    },
    mandats: {
      mandat: [
        mandate('ASSEMBLEE', 'PO838901', {
          election: { lieu: place },
          mandature: { datePriseFonction: '2024-07-08', placeHemicycle: String(options.seat ?? 0) },
          ...(options.ended ? { dateFin: '2025-01-01' } : {})
        }),
        ...mandates
      ]
    }
  }
})

export const ORGANS = [
  organ('PO838901', 'ASSEMBLEE', 'Assemblée nationale de la 17ème législature', 'Assemblée', 'AN'),
  organ('PO845419', 'GP', 'Socialistes et apparentés', 'SOC', 'SOC', '#F5B4CE'),
  organ('PO845401', 'GP', 'Rassemblement National', 'RN', 'RN', '#313567'),
  organ('PO59046', 'COMPER', 'Commission de la défense nationale et des forces armées', 'Défense', 'CION_DEF'),
  organ('PO884520', 'MISINFO', 'Mission d’information sur la protection des personnels éducatifs', 'PROTECEDUC', 'PROTECEDUC')
]

/** Seats from the official plan, whose numbers grow from right to left: SOC on the left (400s, 600s), RN on the right (72). */
export const ACTORS = [
  actor(
    'PA1008',
    { civ: 'M.', prenom: 'Alain', nom: 'David' },
    { departement: 'Gironde', numDepartement: '33', numCirco: '4' },
    [mandate('GP', 'PO845419'), mandate('COMPER', 'PO59046', { infosQualite: { libQualite: 'Président' } })],
    { seat: 410 }
  ),
  actor(
    'PA841553',
    { civ: 'M.', prenom: 'Thierry', nom: 'Tesson' },
    { departement: 'Nord', numDepartement: '59', numCirco: '17' },
    [
      mandate('GP', 'PO845401'),
      mandate('MISINFO', 'PO884520', { infosQualite: { libQualite: 'Membre' } }),
      mandate('MISINFO', 'PO884520', { infosQualite: { libQualite: 'Rapporteur' } })
    ],
    { seat: 72 }
  ),
  actor(
    'PA2',
    { civ: 'M.', prenom: 'Jean-Paul', nom: 'Dupuis' },
    { departement: 'Corse-du-Sud', numDepartement: '2A', numCirco: '1' },
    [mandate('GP', 'PO845419')],
    {
      seat: 645
    }
  ),
  actor(
    'PA3501',
    { civ: 'Mme', prenom: 'Laurence', nom: 'Maillart' },
    { departement: 'Ille-et-Vilaine', numDepartement: '35', numCirco: '1' },
    [mandate('GP', 'PO845419')],
    {
      seat: 643
    }
  ),
  actor(
    'PA3508',
    { civ: 'M.', prenom: 'Mickaël', nom: 'Bouloux' },
    { departement: 'Ille-et-Vilaine', numDepartement: '35', numCirco: '8' },
    [mandate('GP', 'PO845419')],
    {
      seat: 436
    }
  ),
  actor('PA9', { civ: 'Mme', prenom: 'Ancienne', nom: 'Députée' }, { departement: 'Gironde', numDepartement: '33', numCirco: '1' }, [], { ended: true })
]

/** In the actors' history (AMO30) only: a deputy who sat with the RN, then the SOC, and left office; one of the 16th legislature. */
export const HISTORY = [
  actor(
    'PA795950',
    { civ: 'M.', prenom: 'David', nom: 'Amiel' },
    { departement: 'Paris', numDepartement: '75', numCirco: '13' },
    [
      mandate('GP', 'PO845401', { dateDebut: '2024-07-19', dateFin: '2025-03-31' }),
      mandate('GP', 'PO845419', { dateDebut: '2025-04-01', dateFin: '2025-11-12' })
    ],
    { ended: true }
  ),
  {
    acteur: {
      uid: { '#text': 'PA16' },
      etatCivil: { ident: { civ: 'M.', prenom: 'Pierre', nom: 'Seizième' } },
      mandats: { mandat: [{ typeOrgane: 'ASSEMBLEE', legislature: '16', organes: { organeRef: 'PO800000' }, dateFin: '2024-06-09' }] }
    }
  }
]

const voters = (...refs: Array<[string, boolean]>) =>
  refs.length === 1
    ? { votant: { acteurRef: refs[0][0], parDelegation: String(refs[0][1]) } }
    : refs.length
      ? { votant: refs.map(([acteurRef, proxy]) => ({ acteurRef, parDelegation: String(proxy) })) }
      : null

export const ballot = (number: number, date: string, titre: string, sort: string, groups: unknown[], seanceRef = 'RUANR5L17S2027IDS30959') => ({
  scrutin: {
    uid: `VTANR5L17V${number}`,
    numero: String(number),
    dateScrutin: date,
    titre,
    typeVote: { libelleTypeVote: 'scrutin public ordinaire' },
    sort: { code: sort },
    syntheseVote: { nombreVotants: '3', decompte: { pour: '1', contre: '1', abstentions: '1' } },
    seanceRef,
    objet: { libelle: titre, dossierLegislatif: { libelle: 'Projet de loi de finances pour 2027', dossierRef: 'DLR5L17N54629' } },
    ventilationVotes: { organe: { groupes: { groupe: groups } } }
  }
})

export const group = (
  organeRef: string,
  positionMajoritaire: string,
  named: { pours?: Array<[string, boolean]>; contres?: Array<[string, boolean]>; abstentions?: Array<[string, boolean]> }
) => ({
  organeRef,
  nombreMembresGroupe: '100',
  vote: {
    positionMajoritaire,
    decompteVoix: {
      pour: String(named.pours?.length ?? 0),
      contre: String(named.contres?.length ?? 0),
      abstentions: String(named.abstentions?.length ?? 0),
      nonVotants: '0'
    },
    decompteNominatif: {
      pours: voters(...(named.pours ?? [])),
      contres: voters(...(named.contres ?? [])),
      abstentions: voters(...(named.abstentions ?? [])),
      nonVotants: null
    }
  }
})

export const SITTING = 'RUANR5L17S2027IDS30966'
export const HEARING = 'RUANR5L17S2027IDC461515'

export const BALLOTS = [
  ballot(9000, '2026-10-22', "l'amendement n° 1781 de M. Tesson après l'article 7 du projet de loi de financement de la sécurité sociale pour 2027", 'rejeté', [
    group('PO845419', 'contre', {
      contres: [
        ['PA1008', false],
        ['PA3508', false]
      ],
      pours: [['PA3501', false]]
    }),
    group('PO845401', 'pour', { pours: [['PA841553', true]] })
  ]),
  ballot(
    9097,
    '2026-10-28',
    "l'ensemble du projet de loi de finances pour 2027 (première lecture)",
    'adopté',
    [
      group('PO845419', 'abstention', {
        abstentions: [
          ['PA1008', false],
          ['PA2', false]
        ],
        pours: [['PA3508', true]]
      })
    ],
    SITTING
  )
]

export const meeting = (
  uid: string,
  type: string,
  start: string,
  organeReuniRef: string,
  etat: string,
  odj: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) => ({
  reunion: {
    '@xsi:type': type,
    uid,
    timeStampDebut: start,
    lieu: { libelleLong: type === 'seance_type' ? 'Assemblée nationale' : 'salle 4088,  9 rue de Bourgogne' },
    cycleDeVie: { etat },
    organeReuniRef,
    captationVideo: 'true',
    ODJ: odj,
    ...extra
  }
})

export const MEETINGS = [
  meeting(SITTING, 'seance_type', '2026-10-28T14:00:00.000+01:00', 'PO838901', 'Confirmé', {
    pointsODJ: {
      pointODJ: [
        { objet: 'Questions au Gouvernement', cycleDeVie: { etat: 'Confirmé' } },
        { objet: 'Suite de la discussion du projet de loi de finances pour 2027', cycleDeVie: { etat: 'Confirmé' } }
      ]
    }
  }),
  meeting(
    HEARING,
    'reunionCommission_type',
    '2026-10-28T15:00:00.000+01:00',
    'PO884520',
    'Confirmé',
    {
      convocationODJ: { item: '- Audition, ouverte à la presse, de Mme Mickaëlle Paty' },
      pointsODJ: { pointODJ: { objet: 'Audition', cycleDeVie: { etat: 'Confirmé' } } }
    },
    {
      timeStampFin: '2026-10-28T17:00:00.000+01:00',
      participants: {
        participantsInternes: {
          participantInterne: [
            { acteurRef: 'PA841553', presence: 'présent' },
            { acteurRef: 'PA1008', presence: 'excusé' }
          ]
        }
      }
    }
  ),
  meeting('RUANR5L17S2027IDC461468', 'reunionCommission_type', '2026-10-28T11:00:00.000+01:00', 'PO59046', 'Annulé', {
    convocationODJ: { item: 'Audition du général Bellon' }
  }),
  meeting('RUANR5L17S2027IDC461999', 'reunionCommission_type', '2026-10-28T16:00:00.000+01:00', 'PO59046', 'Eventuel', {
    convocationODJ: { item: 'Examen pour avis' }
  }),
  meeting('RUANR5L17S2027IDFL461503', 'reunionInitParlementaire_type', '2026-10-28T11:00:00.000+01:00', 'PO854471', 'Confirmé', {
    convocationODJ: { item: 'Rencontre' }
  }),
  meeting('RUANR5L17S2027IDC400000', 'reunionCommission_type', '2026-10-28T09:00:00.000+01:00', 'PO59046', 'Supprimé', { convocationODJ: { item: 'Retirée' } }),
  meeting('RUANR5L17S2027IDS30970', 'seance_type', '2026-10-29T09:00:00.000+01:00', 'PO838901', 'Confirmé', {
    pointsODJ: { pointODJ: { objet: 'Suite de la discussion du projet de loi de finances pour 2027', cycleDeVie: { etat: 'Confirmé' } } }
  })
]

export const BILLS = [
  {
    dossierParlementaire: {
      uid: 'DLR5L17N54629',
      titreDossier: { titre: 'Projet de loi de finances pour 2027' },
      actesLegislatifs: {
        acteLegislatif: {
          '@xsi:type': 'NominRapporteurs_Type',
          codeActe: 'AN1-COM-FOND-NOMIN',
          organeRef: 'PO59048',
          dateActe: '2026-07-08T00:00:00.000+02:00',
          rapporteurs: { rapporteur: { acteurRef: 'PA841553', typeRapporteur: 'rapporteur général' } }
        }
      }
    }
  }
]

const zip = (files: Record<string, unknown>) => zipSync(Object.fromEntries(Object.entries(files).map(([name, doc]) => [name, strToU8(JSON.stringify(doc))])))

const uidOf = (doc: { organe?: { uid: string }; acteur?: { uid: { '#text': string } } }) => doc.organe?.uid ?? doc.acteur!.uid['#text']

/** The Assemblée's dumps as their zips: AMO10 (with a déport the indexer skips), AMO30, Scrutins, Agenda and Dossiers. */
export function dumps(ballots = BALLOTS, meetings = MEETINGS) {
  return {
    deputies: zip({
      ...Object.fromEntries(ORGANS.map((o) => [`json/organe/${uidOf(o)}.json`, o])),
      ...Object.fromEntries(ACTORS.map((a) => [`json/acteur/${uidOf(a)}.json`, a])),
      'json/deport/PD1.json': { deport: { uid: 'PD1' } }
    }),
    former: zip({
      ...Object.fromEntries(ORGANS.map((o) => [`json/organe/${uidOf(o)}.json`, o])),
      ...Object.fromEntries([...ACTORS, ...HISTORY].map((a) => [`json/acteur/${uidOf(a)}.json`, a]))
    }),
    ballots: zip(Object.fromEntries(ballots.map((b) => [`json/${b.scrutin.uid}.json`, b]))),
    meetings: zip(Object.fromEntries(meetings.map((m) => [`json/reunion/${m.reunion.uid}.json`, m]))),
    bills: zip(Object.fromEntries(BILLS.map((b) => [`json/dossierParlementaire/${b.dossierParlementaire.uid}.json`, b])))
  }
}

// ---------------------------------------------------------------- the Sénat

const senator = (
  matricule: string,
  civilite: string,
  prenom: string,
  nom: string,
  groupe: { code: string; libelle: string; libelleCourt: string; ordre: number },
  circonscription: { code: string; libelle: string },
  siege: number,
  organismes: unknown[] = []
) => {
  const slug = `${nom.toLowerCase().replace(/\s+/g, '_')}_${prenom.toLowerCase()}${matricule.toLowerCase()}`
  return {
    matricule,
    nom,
    prenom,
    civilite,
    feminise: civilite === 'Mme',
    siege,
    url: `/senateur/${slug}.html`,
    urlAvatar: `/senimg/${slug}_carre.jpg`,
    organismes,
    groupe: { ...groupe, codeTypeAppartenance: 'N' },
    circonscription
  }
}

const SER = { code: 'SOC', libelle: 'Groupe Socialiste, Écologiste et Républicain', libelleCourt: 'SER', ordre: 3 }
const LR = { code: 'UMP', libelle: 'Groupe Les Républicains', libelleCourt: 'Les Républicains', ordre: 1 }

export const SENATORS = [
  senator('21089R', 'Mme', 'Colombe', 'Brossel', SER, { code: '75', libelle: 'Paris' }, 72, [
    { code: 'COM-CULT', type: 'COMMISSION', libelle: 'Commission de la culture, de l’éducation, de la communication et du sport', ordre: 7001 }
  ]),
  senator('20032U', 'Mme', 'Agnès', 'Evren', LR, { code: '75', libelle: 'Paris' }, 30),
  senator('21000A', 'M.', 'Hervé', 'Gillé', SER, { code: '33', libelle: 'Gironde' }, 75)
]

const attr = (value: unknown) => JSON.stringify(value).replace(/"/g, '&quot;')

export const SENATE_HOME = `<p class="lead">Répartition des groupes politiques dans l’hémicycle</p>
<hemicycle-groups
    groups="${attr([
      { id: 'UMP', name: 'Groupe Les R\\u00e9publicains', seats: [30], color: '#2E70D1' },
      { id: 'SOC', name: 'Groupe Socialiste', seats: [72, 75], color: '#FB6F99' },
      { id: 'X', name: 'Sans couleur', seats: [], color: 'bleu' }
    ])}"></hemicycle-groups>`

export const SENATE_BALLOT_PAGE = `<main><h1 class="page-title"> Scrutin n&deg;44 - s&eacute;ance du 29 octobre 2026 </h1>
<p class="page-lead">sur l'amendement n&deg; 304 rectifi&eacute; quater, repris par Mme Colombe Brossel, &agrave; l'article 5 quater du projet de loi relatif &agrave; la protection des enfants</p>
<span class="badge rounded-pill me-2 text-bg-danger">Rejet&eacute;</span>
<aside><a href="https://www.senat.fr/amendements/2026-2027/89/Amdt_304.html">L'amendement</a><a href="/dossier-legislatif/pjl25-911.html">Le dossier</a></aside></main>`

export const SENATE_SESSION_PAGE = `<ol class="list-group list-group-flush">
<li class="list-group-item list-group-flush">
<div class="list-group-subtitle">21 juillet 2026</div>
<p class="my-2">
<a href="2025/scr2025-340.html">Scrutin N&deg;340</a>&nbsp;: sur l'ensemble du
projet de loi d'urgence pour la protection et la souveraineté agricoles -
<a href="/dossier-legislatif/pjl25-689.html">consulter le dossier
l&eacute;gislatif</a>.
<span class="badge rounded-pill text-bg-success">Adoption</span>
</p>
</li>
<li class="list-group-item list-group-flush">
<div class="list-group-subtitle">9 juillet 2026</div>
<p class="my-2">
<a href="2025/scr2025-335.html">Scrutin N&deg;335</a>&nbsp;: sur l'amendement n&deg; 5, pr&eacute;sent&eacute; par M. Bernard Jomier et plusieurs de ses coll&egrave;gues, &agrave; l'article 1er de la proposition de loi -
<a href="/dossier-legislatif/ppl25-610.html">consulter le dossier l&eacute;gislatif</a> .
<span class="badge rounded-pill text-bg-danger">Rejet</span>
</p>
</li>
</ol>`

/** Each senator's vote in the session 2026's two ballots: the first on an amendment of Colombe Brossel's, the second on a whole text. */
export const SENATE_VOTES: Record<number, unknown> = {
  1: {
    votes: [
      { matricule: '21089R', vote: 'p', siege: 72 },
      { matricule: '20032U', vote: 'c', siege: 30 },
      { matricule: '21000A', vote: 'p', siege: 75 }
    ]
  },
  2: {
    votes: [
      { matricule: '21089R', vote: 'c', siege: 72 },
      { matricule: '20032U', vote: 'p', siege: 30 },
      { matricule: '21000A', vote: 'a', siege: 75 }
    ]
  }
}

export const SENATE_HEADS = [
  {
    number: 1,
    date: '2026-10-28',
    title: "sur l'amendement n° 12, repris par Mme Colombe Brossel, à l'article 2 du projet de loi relatif à la protection des enfants",
    result: 'rejeté',
    bill: 'pjl25-911',
    amendmentUrl: ''
  },
  {
    number: 2,
    date: '2026-10-28',
    title: "sur l'ensemble du projet de loi relatif à la protection des enfants",
    result: 'adopté',
    bill: 'pjl25-911',
    amendmentUrl: ''
  }
]

// ---------------------------------------------------------------- constituencies

/** Cenon is in one constituency; Rennes in two; a station of Guadeloupe; a name with a comma, in quotes. */
export const POLLING_STATIONS = `codeDepartement,nomDepartement,codeCirconscription,nomCirconscription,codeCommune,nomCommune,numeroBureauVote,codeBureauVote
01,Ain,0104,4ème circonscription,01001,"L'Abergement-Clémenciat, centre",0001,01001_0001
01,Ain,0104,4ème circonscription,01001,"L'Abergement-Clémenciat, centre",0002,01001_0002
35,Ille-et-Vilaine,3501,1ère circonscription,35238,Rennes,0101,35238_0101
35,Ille-et-Vilaine,3508,8ème circonscription,35238,Rennes,0801,35238_0801
ZA,Guadeloupe,ZA01,1ère circonscription,97101,Les Abymes,0001,97101_0001
`

/** Cenon, in Gironde's 4th constituency. */
export const CENON = `${POLLING_STATIONS}33,Gironde,3304,4ème circonscription,33119,Cenon,0001,33119_0001\n`

const square = (west: number, south: number, east: number, north: number) => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south]
]

/** Rennes's two constituencies, side by side; the eastern one with a hole; and one nobody asked for. */
export const CONTOURS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { codeDepartement: '35', codeCirconscription: '3501' },
      geometry: { type: 'Polygon', coordinates: [square(-1.7, 48.1, -1.68, 48.12)] }
    },
    {
      type: 'Feature',
      properties: { codeDepartement: '35', codeCirconscription: '3508' },
      geometry: { type: 'MultiPolygon', coordinates: [[square(-1.68, 48.1, -1.66, 48.12), square(-1.671, 48.11, -1.67, 48.111)]] }
    },
    {
      type: 'Feature',
      properties: { codeDepartement: '01', codeCirconscription: '0104' },
      geometry: { type: 'Polygon', coordinates: [square(5, 46, 5.1, 46.1)] }
    }
  ]
}

/** Every source in the index, as a first sync would put them. */
export function buildIndex(db: DatabaseSync): void {
  transaction(db, () => resetSchema(db))
  const zips = dumps()
  indexDeputies(db, zips.deputies)
  indexFormer(db, zips.former)
  indexSenators(db, parseSenators(SENATORS), parseSenateColors(SENATE_HOME), { SOC: 3, UMP: 1 })
  indexBallots(db, zips.ballots)
  addSenateBallots(
    db,
    SENATE_HEADS.map((head) => ({ session: 2026, head, votes: parseSenateVotes(SENATE_VOTES[head.number]) }))
  )
  indexMeetings(db, zips.meetings)
  indexBills(db, zips.bills)
  indexConstituencies(db, parsePollingStations(CENON), CONTOURS)
}

/** An Http that answers from a table of URL prefixes; anything else fails as the network would. */
export function fakeHttp(answers: Record<string, string>): Http & { asked: string[] } {
  const asked: string[] = []
  return {
    asked,
    async text(url) {
      asked.push(url)
      const key = Object.keys(answers).find((k) => url.startsWith(k))
      if (key === undefined) throw new Error(`HTTP 404 de ${new URL(url).host}`)
      return answers[key]
    }
  }
}
