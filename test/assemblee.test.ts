import { describe, expect, it } from 'vitest'
import { asArray, fold, parseActeur, parseOrgane, parseScrutin } from '../src/main/data/assemblee'
import { parseVideoRef, videoPage } from '../src/main/data/videos'

const acteur = (mandats: unknown) => ({
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
    mandats: { mandat: mandats }
  }
})

const assemblee = {
  typeOrgane: 'ASSEMBLEE',
  dateFin: null,
  organes: { organeRef: 'PO838901' },
  election: { lieu: { departement: 'Gironde', numDepartement: '33', numCirco: '4' } },
  mandature: { datePriseFonction: '2024-07-08' }
}

describe('parseActeur', () => {
  it('reads a sitting deputy', () => {
    const d = parseActeur(
      acteur([
        assemblee,
        { typeOrgane: 'GP', dateFin: null, organes: { organeRef: 'PO845419' } },
        { typeOrgane: 'GP', dateFin: '2024-07-01', organes: { organeRef: 'POold' } },
        { typeOrgane: 'COMPER', dateFin: null, organes: { organeRef: 'PO59046' }, infosQualite: { libQualite: 'Membre' } }
      ])
    )!
    expect(d).toMatchObject({
      id: 'PA1008',
      nom: 'David',
      groupeId: 'PO845419',
      departement: 'Gironde',
      numDepartement: '33',
      circo: '4',
      mandatDebut: '2024-07-08'
    })
    expect(d.emails).toEqual(['Alain.David@assemblee-nationale.fr'])
    expect(d.permanence).toBe('7 Avenue Roger Schwob 33150 Cenon')
    expect(d.organes).toEqual([{ id: 'PO59046', qualite: 'Membre' }])
  })

  it('accepts a single mandate given as an object, and skips former deputies', () => {
    expect(parseActeur(acteur(assemblee))?.id).toBe('PA1008')
    expect(parseActeur(acteur({ ...assemblee, dateFin: '2024-06-09' }))).toBeNull()
  })
})

describe('parseScrutin', () => {
  it('reads the result, the groups and every vote, whatever the shape of the lists', () => {
    const r = parseScrutin({
      scrutin: {
        uid: 'VTANR5L17V9097',
        numero: '9097',
        dateScrutin: '2026-10-23',
        titre: "l'amendement n° 12",
        typeVote: { libelleTypeVote: 'scrutin public ordinaire' },
        sort: { code: 'rejeté' },
        syntheseVote: { nombreVotants: '3', decompte: { pour: '1', contre: '1', abstentions: '1' } },
        seanceRef: 'RUANR5L17S2027IDS30959',
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
    expect(r.scrutin).toMatchObject({ numero: 9097, sort: 'rejeté', votants: 3, pour: 1, contre: 1, abstentions: 1, seance: 'RUANR5L17S2027IDS30959' })
    expect(r.scrutin.groupes.map((g) => g.position)).toEqual(['contre', 'abstention'])
    expect(r.votes).toEqual([
      { scrutin: 'VTANR5L17V9097', acteur: 'PA1', position: 'pour', delegation: false },
      { scrutin: 'VTANR5L17V9097', acteur: 'PA2', position: 'contre', delegation: true },
      { scrutin: 'VTANR5L17V9097', acteur: 'PA3', position: 'abstention', delegation: false }
    ])
  })
})

describe('helpers', () => {
  it('normalizes lists and text', () => {
    expect(asArray(null)).toEqual([])
    expect(asArray({ a: 1 })).toEqual([{ a: 1 }])
    expect(asArray([1, 2])).toEqual([1, 2])
    expect(fold('Côte-d’Or Éléonore')).toBe('cote-d’or eleonore')
    expect(parseOrgane({ organe: { uid: 'PO1', codeType: 'GP', libelle: 'Groupe', libelleAbrege: 'GRP' } })).toEqual({
      id: 'PO1',
      type: 'GP',
      libelle: 'Groupe',
      abrege: 'GRP'
    })
  })
})

describe('videos', () => {
  it('reads video references from search hits, ids and page links', () => {
    expect(parseVideoRef('/19635048_6ae106e3a1fa9')).toEqual({ id: '19635048_6ae106e3a1fa9' })
    // Speaker hits carry the passage.
    expect(parseVideoRef('/19634676_6ae0f545798fb?timecode=1069980')).toEqual({ id: '19634676_6ae0f545798fb', timecode: 1069980 })
    expect(parseVideoRef('https://videos.assemblee-nationale.fr/video.19632460_6ae0ce76adf9c.commission?timecode=848880')).toEqual({
      id: '19632460_6ae0ce76adf9c',
      timecode: 848880
    })
    expect(parseVideoRef('pas une vidéo')).toBeNull()
    expect(videoPage('19634676_6ae0f545798fb', 1069980)).toBe('https://videos.assemblee-nationale.fr/video.19634676_6ae0f545798fb?timecode=1069980')
  })
})
