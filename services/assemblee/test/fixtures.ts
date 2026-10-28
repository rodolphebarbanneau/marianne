import { strToU8, zipSync } from 'fflate'
import type { Dump } from '../src/store'
import type { Http } from '../src/videos'

/**
 * A small Assemblée in the shapes of the open-data dumps: four organs, three sitting deputies and
 * a former one, two ballots, and the agenda of 28 October 2026. The JSON comes from XML: single
 * children are objects, several are arrays, empty ones null.
 */

export const organ = (uid: string, codeType: string, libelle: string, libelleAbrege: string, libelleAbrev: string, couleurAssociee: string | null = null) => ({
  organe: { uid, codeType, libelle, libelleAbrege, libelleAbrev, couleurAssociee }
})

const mandate = (typeOrgane: string, organeRef: string, extra: Record<string, unknown> = {}) => ({
  typeOrgane,
  dateFin: null,
  organes: { organeRef },
  ...extra
})

export const actor = (
  id: string,
  ident: { civ: string; prenom: string; nom: string },
  place: { departement: string; numDepartement: string; numCirco: string },
  mandates: unknown[],
  ended = false
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
          mandature: { datePriseFonction: '2024-07-08' },
          ...(ended ? { dateFin: '2025-01-01' } : {})
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

export const ACTORS = [
  actor('PA1008', { civ: 'M.', prenom: 'Alain', nom: 'David' }, { departement: 'Gironde', numDepartement: '33', numCirco: '4' }, [
    mandate('GP', 'PO845419'),
    mandate('COMPER', 'PO59046', { infosQualite: { libQualite: 'Membre' } })
  ]),
  actor('PA841553', { civ: 'M.', prenom: 'Thierry', nom: 'Tesson' }, { departement: 'Nord', numDepartement: '59', numCirco: '17' }, [
    mandate('GP', 'PO845401'),
    mandate('MISINFO', 'PO884520', { infosQualite: { libQualite: 'Membre' } }),
    mandate('MISINFO', 'PO884520', { infosQualite: { libQualite: 'Rapporteur' } })
  ]),
  actor('PA2', { civ: 'M.', prenom: 'Jean-Paul', nom: 'Dupuis' }, { departement: 'Corse-du-Sud', numDepartement: '2A', numCirco: '1' }, [
    mandate('GP', 'PO845419')
  ]),
  actor('PA9', { civ: 'Mme', prenom: 'Ancienne', nom: 'Députée' }, { departement: 'Gironde', numDepartement: '33', numCirco: '1' }, [], true)
]

const voters = (...refs: Array<[string, boolean]>) =>
  refs.length === 1
    ? { votant: { acteurRef: refs[0][0], parDelegation: String(refs[0][1]) } }
    : refs.length
      ? { votant: refs.map(([acteurRef, proxy]) => ({ acteurRef, parDelegation: String(proxy) })) }
      : null

export const ballot = (number: number, date: string, titre: string, sort: string, groups: unknown[]) => ({
  scrutin: {
    uid: `VTANR5L17V${number}`,
    numero: String(number),
    dateScrutin: date,
    titre,
    typeVote: { libelleTypeVote: 'scrutin public ordinaire' },
    sort: { code: sort },
    syntheseVote: { nombreVotants: '3', decompte: { pour: '1', contre: '1', abstentions: '1' } },
    seanceRef: 'RUANR5L17S2027IDS30959',
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

export const BALLOTS = [
  ballot(
    9000,
    '2026-10-22',
    "l'amendement n° 1781 de Mme Hignet après l'article 7 du projet de loi de financement de la sécurité sociale pour 2027",
    'rejeté',
    [group('PO845419', 'pour', { pours: [['PA1008', false]] }), group('PO845401', 'contre', { contres: [['PA841553', true]] })]
  ),
  ballot(9097, '2026-10-23', "l'ensemble du projet de loi de finances pour 2027 (première lecture)", 'adopté', [
    group('PO845419', 'abstention', {
      abstentions: [
        ['PA1008', false],
        ['PA2', false]
      ]
    })
  ])
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

export const SITTING = 'RUANR5L17S2027IDS30966'
export const HEARING = 'RUANR5L17S2027IDC461515'

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
    { timeStampFin: '2026-10-28T17:00:00.000+01:00' }
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

const zip = (files: Record<string, unknown>) => zipSync(Object.fromEntries(Object.entries(files).map(([name, doc]) => [name, strToU8(JSON.stringify(doc))])))

const uidOf = (doc: { organe?: { uid: string }; acteur?: { uid: { '#text': string } } }) => doc.organe?.uid ?? doc.acteur!.uid['#text']

/** The three dumps as their zips: AMO10 (with a déport the indexer skips), Scrutins and Agenda. */
export function dumps(ballots = BALLOTS, meetings = MEETINGS): Record<Dump, Uint8Array> {
  return {
    deputies: zip({
      ...Object.fromEntries(ORGANS.map((o) => [`json/organe/${uidOf(o)}.json`, o])),
      ...Object.fromEntries(ACTORS.map((a) => [`json/acteur/${uidOf(a)}.json`, a])),
      'json/deport/PD1.json': { deport: { uid: 'PD1' } }
    }),
    ballots: zip(Object.fromEntries(ballots.map((b) => [`json/${b.scrutin.uid}.json`, b]))),
    meetings: zip(Object.fromEntries(meetings.map((m) => [`json/reunion/${m.reunion.uid}.json`, m])))
  }
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
