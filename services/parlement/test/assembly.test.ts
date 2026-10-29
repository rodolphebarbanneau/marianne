import { describe, expect, it } from 'vitest'
import { actorNumber, asArray, parseAttendance, parseBallot, parseBill, parseDeputy, parseMeeting, parseOrgan, searchKey } from '../src/assembly'
import { ballotPage, deputyPage, deputyPhoto, ordinal, parseVideoRef, videoKey, videoPage } from '../src/links'

const actor = (mandates: unknown) => ({
  acteur: {
    uid: { '#text': 'PA1008' },
    etatCivil: { ident: { civ: 'M.', prenom: 'Alain', nom: 'David' }, infoNaissance: { dateNais: '1949-06-02' } },
    profession: { libelleCourant: 'Ingénieur' },
    uri_hatvp: 'https://www.hatvp.fr/pages_nominatives/david-alain',
    adresses: {
      adresse: [
        { '@xsi:type': 'AdressePostale_Type', type: '2', numeroRue: '7', nomRue: 'Avenue Roger Schwob', codePostal: '33150', ville: 'Cenon' },
        { '@xsi:type': 'AdresseMail_Type', valElec: 'Alain.David@assemblee-nationale.fr' }
      ]
    },
    mandats: { mandat: mandates }
  }
})

const assembly = {
  typeOrgane: 'ASSEMBLEE',
  dateFin: null,
  organes: { organeRef: 'PO838901' },
  election: { lieu: { departement: 'Gironde', numDepartement: '33', numCirco: '4' } },
  mandature: { datePriseFonction: '2024-07-08', placeHemicycle: '410' }
}

describe('parseDeputy', () => {
  it('reads a sitting deputy', () => {
    const d = parseDeputy(
      actor([
        assembly,
        { typeOrgane: 'GP', dateFin: null, organes: { organeRef: 'PO845419' } },
        { typeOrgane: 'GP', dateFin: '2024-07-01', organes: { organeRef: 'POold' } },
        { typeOrgane: 'COMPER', dateFin: null, organes: { organeRef: 'PO59046' }, infosQualite: { libQualite: 'Membre' } },
        // A member who is also the rapporteur: the more specific role wins.
        { typeOrgane: 'MISINFO', dateFin: null, organes: { organeRef: 'PO884520' }, infosQualite: { libQualite: 'Membre' } },
        { typeOrgane: 'MISINFO', dateFin: null, organes: { organeRef: 'PO884520' }, infosQualite: { libQualite: 'Rapporteur' } },
        { typeOrgane: 'COMPER', dateFin: '2025-01-01', organes: { organeRef: 'POold' }, infosQualite: { libQualite: 'Membre' } }
      ])
    )!
    expect(d).toMatchObject({
      id: 'PA1008',
      lastName: 'David',
      groupId: 'PO845419',
      department: 'Gironde',
      departmentNumber: '33',
      constituency: '4',
      seat: 410,
      mandateStart: '2024-07-08'
    })
    expect(d.emails).toEqual(['Alain.David@assemblee-nationale.fr'])
    expect(d.office).toBe('7 Avenue Roger Schwob 33150 Cenon')
    expect(d.organs).toEqual([
      { id: 'PO59046', role: 'Membre' },
      { id: 'PO884520', role: 'Rapporteur' }
    ])
  })

  it('accepts a single mandate given as an object, and skips former deputies', () => {
    expect(parseDeputy(actor(assembly))?.id).toBe('PA1008')
    expect(parseDeputy(actor({ ...assembly, dateFin: '2024-06-09' }))).toBeNull()
  })
})

describe('parseBallot', () => {
  it('reads the result, the groups and every vote, whatever the shape of the lists', () => {
    const r = parseBallot({
      scrutin: {
        uid: 'VTANR5L17V9097',
        numero: '9097',
        dateScrutin: '2026-10-23',
        titre: "l'amendement n° 12",
        typeVote: { libelleTypeVote: 'scrutin public ordinaire' },
        sort: { code: 'rejeté' },
        syntheseVote: { nombreVotants: '3', decompte: { pour: '1', contre: '1', abstentions: '1' } },
        seanceRef: 'RUANR5L17S2027IDS30959',
        objet: { libelle: "l'amendement n° 12", dossierLegislatif: { libelle: 'Projet de loi de finances pour 2027', dossierRef: 'DLR5L17N54629' } },
        ventilationVotes: {
          organe: {
            groupes: {
              groupe: [
                {
                  organeRef: 'PO1',
                  nombreMembresGroupe: '100',
                  vote: {
                    positionMajoritaire: 'contre',
                    decompteVoix: { pour: '1', contre: '1', abstentions: '0', nonVotants: '0' },
                    // One voter: an object; several: an array; none: null.
                    decompteNominatif: {
                      pours: { votant: { acteurRef: 'PA1', parDelegation: 'false' } },
                      contres: { votant: [{ acteurRef: 'PA2', parDelegation: 'true' }] },
                      abstentions: null
                    }
                  }
                },
                {
                  organeRef: 'PO2',
                  nombreMembresGroupe: '50',
                  vote: { positionMajoritaire: 'abstention', decompteNominatif: { abstentions: { votant: { acteurRef: 'PA3' } } } }
                }
              ]
            }
          }
        }
      }
    })!
    expect(r.ballot).toMatchObject({
      number: 9097,
      result: 'rejeté',
      voters: 3,
      for: 1,
      against: 1,
      abstentions: 1,
      sitting: 'RUANR5L17S2027IDS30959',
      bill: 'DLR5L17N54629',
      billTitle: 'Projet de loi de finances pour 2027'
    })
    expect(r.ballot.groups.map((g) => g.position)).toEqual(['against', 'abstention'])
    expect(r.votes).toEqual([
      { ballot: 'VTANR5L17V9097', deputy: 'PA1', position: 'for', proxy: false },
      { ballot: 'VTANR5L17V9097', deputy: 'PA2', position: 'against', proxy: true },
      { ballot: 'VTANR5L17V9097', deputy: 'PA3', position: 'abstention', proxy: false }
    ])
  })
})

describe('parseMeeting', () => {
  it('reads a sitting by its points, leaving out withdrawn ones', () => {
    const m = parseMeeting({
      reunion: {
        '@xsi:type': 'seance_type',
        uid: 'RUANR5L17S2027IDS30966',
        timeStampDebut: '2026-10-28T14:00:00.000+01:00',
        lieu: { libelleLong: 'Assemblée nationale' },
        cycleDeVie: { etat: 'Confirmé' },
        organeReuniRef: 'PO838901',
        captationVideo: 'true',
        ODJ: {
          convocationODJ: null,
          pointsODJ: {
            pointODJ: [
              { objet: 'Questions au Gouvernement', cycleDeVie: { etat: 'Confirmé' } },
              { objet: 'Ancien point', cycleDeVie: { etat: 'Supprimé' } },
              { objet: 'Suite de la discussion du projet de loi de finances pour 2027', cycleDeVie: { etat: 'Confirmé' } }
            ]
          }
        }
      }
    })
    expect(m).toEqual({
      id: 'RUANR5L17S2027IDS30966',
      chamber: 'an',
      kind: 'sitting',
      state: 'confirmed',
      start: '2026-10-28T14:00:00.000+01:00',
      organId: 'PO838901',
      place: 'Assemblée nationale',
      items: ['Questions au Gouvernement', 'Suite de la discussion du projet de loi de finances pour 2027'],
      video: true
    })
  })

  it('reads a committee by its notice rather than its generic points, and skips meetings withdrawn from the agenda', () => {
    const committee = (etat: string) => ({
      reunion: {
        '@xsi:type': 'reunionCommission_type',
        uid: 'RUANR5L17S2027IDC461515',
        timeStampDebut: '2026-10-28T15:00:00.000+01:00',
        timeStampFin: '2026-10-28T18:00:00.000+01:00',
        lieu: { libelleLong: 'salle 4088,  9 rue de Bourgogne' },
        cycleDeVie: { etat },
        organeReuniRef: 'PO884520',
        captationVideo: 'false',
        ODJ: {
          convocationODJ: { item: '– audition, ouverte à la presse, de Mme Mickaëlle Paty.' },
          resumeODJ: { item: ['audition'] },
          pointsODJ: { pointODJ: { objet: 'Audition', cycleDeVie: { etat: 'Confirmé' } } }
        }
      }
    })
    expect(parseMeeting(committee('Annulé'))).toMatchObject({
      kind: 'committee',
      state: 'cancelled',
      end: '2026-10-28T18:00:00.000+01:00',
      place: 'salle 4088, 9 rue de Bourgogne',
      items: ['Audition, ouverte à la presse, de Mme Mickaëlle Paty.'],
      video: false
    })
    expect(parseMeeting(committee('Eventuel'))?.state).toBe('tentative')
    expect(parseMeeting(committee('Supprimé'))).toBeNull()
  })
})

describe('parseAttendance', () => {
  const minutes = (presences: string[]) => ({
    reunion: {
      participants: {
        participantsInternes: { participantInterne: presences.map((presence, i) => ({ acteurRef: `PA${i + 1}`, presence })) },
        personnesAuditionnees: null
      }
    }
  })

  it('reads who attended a committee meeting', () => {
    expect(parseAttendance(minutes(['présent', 'excusé', 'absent']))).toEqual([
      { deputy: 'PA1', status: 'present' },
      { deputy: 'PA2', status: 'excused' },
      { deputy: 'PA3', status: 'absent' }
    ])
  })

  it('says nothing while the minutes are not filled in: everyone absent, or no list', () => {
    expect(parseAttendance(minutes(['absent', 'absent']))).toEqual([])
    expect(parseAttendance({ reunion: { participants: null } })).toEqual([])
  })
})

describe('parseBill', () => {
  it('reads a legislative file’s title and the rapporteurs named by its committee, not those of an opinion', () => {
    const acte = (codeActe: string, rapporteur: unknown) => ({
      '@xsi:type': 'NominRapporteurs_Type',
      codeActe,
      organeRef: 'PO59048',
      dateActe: '2026-07-08T00:00:00.000+02:00',
      rapporteurs: { rapporteur }
    })
    const bill = parseBill({
      dossierParlementaire: {
        uid: 'DLR5L17N54629',
        titreDossier: { titre: 'Projet de loi de finances pour 2027' },
        actesLegislatifs: {
          acteLegislatif: {
            actesLegislatifs: {
              acteLegislatif: [
                acte('AN1-COM-FOND-NOMIN', { acteurRef: 'PA346782', typeRapporteur: 'rapporteur général' }),
                acte('AN1-COM-FOND-NOMIN', [{ acteurRef: 'PA841531', typeRapporteur: 'rapporteur spécial' }]),
                acte('AN1-COM-AVIS-NOMIN', { acteurRef: 'PA722374', typeRapporteur: 'rapporteur pour avis' })
              ]
            }
          }
        }
      }
    })
    expect(bill).toEqual({
      id: 'DLR5L17N54629',
      title: 'Projet de loi de finances pour 2027',
      rapporteurs: [{ deputy: 'PA346782', type: 'rapporteur général', organ: 'PO59048', date: '2026-07-08' }]
    })
    expect(parseBill({ dossierParlementaire: null })).toBeNull()
  })
})

describe('helpers', () => {
  it('normalizes lists and text', () => {
    expect(asArray(null)).toEqual([])
    expect(asArray({ a: 1 })).toEqual([{ a: 1 }])
    expect(asArray([1, 2])).toEqual([1, 2])
    expect(searchKey('  Côte-d’Or  Éléonore ')).toBe('cote d or eleonore')
    expect(actorNumber('PA1008')).toBe(1008)
  })

  it('reads organs, their acronym and their color', () => {
    expect(
      parseOrgan({ organe: { uid: 'PO1', codeType: 'GP', libelle: 'Groupe', libelleAbrege: 'GRP', libelleAbrev: 'GRP', couleurAssociee: '#F5B4CE' } })
    ).toEqual({
      id: 'PO1',
      type: 'GP',
      name: 'Groupe',
      shortName: 'GRP',
      code: 'GRP',
      color: '#F5B4CE'
    })
    expect(
      parseOrgan({ organe: { uid: 'PO2', codeType: 'COMPER', libelle: 'Commission des affaires sociales', libelleAbrev: 'CION-SOC', couleurAssociee: null } })
    ).toMatchObject({
      shortName: 'CION-SOC',
      code: 'CION-SOC',
      color: ''
    })
    expect(parseOrgan({ organe: null })).toBeNull()
  })
})

describe('links', () => {
  it('points at the Assemblée’s pages', () => {
    expect(deputyPage('PA1008')).toBe('https://www.assemblee-nationale.fr/dyn/deputes/PA1008')
    expect(deputyPhoto('PA1008')).toBe('https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/1008.jpg')
    expect(ballotPage({ chamber: 'an', id: 'VTANR5L16V12', number: 12 })).toBe('https://www.assemblee-nationale.fr/dyn/16/scrutins/12')
    expect(ballotPage({ chamber: 'se', id: 'SE2026-44', number: 44 })).toBe('https://www.senat.fr/scrutin-public/2026/scr2026-44.html')
    expect(ordinal('1')).toBe('1re')
    expect(ordinal('4')).toBe('4e')
  })
})

describe('videos', () => {
  it('reads video references of both portals from search hits, ids and page links', () => {
    expect(parseVideoRef('/19635048_6ae106e3a1fa9')).toEqual({ chamber: 'an', id: '19635048_6ae106e3a1fa9' })
    // Speaker hits carry the passage.
    expect(parseVideoRef('/19634676_6ae0f545798fb?timecode=1069980')).toEqual({ chamber: 'an', id: '19634676_6ae0f545798fb', timecode: 1069980 })
    expect(parseVideoRef('https://videos.assemblee-nationale.fr/video.19632460_6ae0ce76adf9c.commission?timecode=848880')).toEqual({
      chamber: 'an',
      id: '19632460_6ae0ce76adf9c',
      timecode: 848880
    })
    // The Sénat's: its portal's links, and the "se:" keys the service gives its videos.
    expect(parseVideoRef('https://videos.senat.fr/video.5979506_6ae25732cc856?timecode=60000')).toEqual({
      chamber: 'se',
      id: '5979506_6ae25732cc856',
      timecode: 60000
    })
    expect(parseVideoRef(videoKey('se', '5979506_6ae25732cc856'))).toEqual({ chamber: 'se', id: '5979506_6ae25732cc856' })
    expect(videoKey('an', '19634676_6ae0f545798fb')).toBe('19634676_6ae0f545798fb')
    expect(parseVideoRef('pas une vidéo')).toBeNull()
    expect(videoPage('an', '19634676_6ae0f545798fb', 1069980)).toBe('https://videos.assemblee-nationale.fr/video.19634676_6ae0f545798fb?timecode=1069980')
    expect(videoPage('se', '5979506_6ae25732cc856')).toBe('https://videos.senat.fr/video.5979506_6ae25732cc856')
  })
})
