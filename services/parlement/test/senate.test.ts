import { describe, expect, it } from 'vitest'
import {
  decodeHtml,
  frenchDate,
  mondayOf,
  parseSenateAgenda,
  parseSenateBallotPage,
  parseSenateColors,
  parseSenateSessionPage,
  parseSenateVotes,
  parseSenators,
  senateBallotId,
  senateBallotKey,
  senateBillTitle,
  senateHour,
  senateSession,
  senatorKey
} from '../src/senate'
import { SENATE_BALLOT_PAGE, SENATE_HOME, SENATE_SESSION_PAGE, SENATORS } from './fixtures'

describe('senators', () => {
  it('reads the list senat.fr draws its hemicycle with: group, département, seat, page and photo', () => {
    const [first, second] = parseSenators(SENATORS)
    expect(first).toEqual({
      id: '21089R',
      civility: 'Mme',
      firstName: 'Colombe',
      lastName: 'Brossel',
      female: true,
      groupId: 'SOC',
      groupShort: 'SER',
      groupName: 'Socialiste, Écologiste et Républicain',
      departmentNumber: '75',
      department: 'Paris',
      seat: 72,
      page: 'https://www.senat.fr/senateur/brossel_colombe21089r.html',
      photo: 'https://www.senat.fr/senimg/brossel_colombe21089r_carre.jpg',
      organs: [{ code: 'COM-CULT', type: 'COMMISSION', name: 'Commission de la culture, de l’éducation, de la communication et du sport' }]
    })
    // A group whose short label is a name gets its usual acronym.
    expect(second).toMatchObject({ groupId: 'UMP', groupShort: 'LR', seat: 30 })
    expect(() => parseSenators({})).toThrow(/changed shape/)
  })

  it('reads the groups’ colours from the home page', () => {
    expect(parseSenateColors(SENATE_HOME)).toEqual({ UMP: '#2E70D1', SOC: '#FB6F99' })
    expect(parseSenateColors('<p>rien</p>')).toEqual({})
  })

  it('numbers senators and ballots for the index', () => {
    expect(senatorKey('19591F')).toBe(19591 * 32 + 6)
    expect(senatorKey('19591f')).toBe(senatorKey('19591F'))
    expect(senatorKey('nope')).toBe(0)
    expect(senateBallotId(2026, 44)).toBe('SE2026-44')
    expect(senateBallotKey(2026, 44)).toBe(20_260_044)
  })
})

describe('ballots', () => {
  it('reads a ballot’s page: number, sitting day, subject, result, legislative file and amendment', () => {
    expect(parseSenateBallotPage(SENATE_BALLOT_PAGE)).toEqual({
      number: 44,
      date: '2026-10-29',
      title:
        "sur l'amendement n° 304 rectifié quater, repris par Mme Colombe Brossel, à l'article 5 quater du projet de loi relatif à la protection des enfants",
      result: 'rejeté',
      bill: 'pjl25-911',
      amendmentUrl: 'https://www.senat.fr/amendements/2026-2027/89/Amdt_304.html'
    })
    expect(parseSenateBallotPage('<h1 class="page-title">Page introuvable</h1>')).toBeNull()
  })

  it('reads a session’s page: its days, and each ballot under them', () => {
    expect(parseSenateSessionPage(SENATE_SESSION_PAGE)).toEqual([
      {
        number: 340,
        date: '2026-07-21',
        title: "sur l'ensemble du projet de loi d'urgence pour la protection et la souveraineté agricoles",
        result: 'adopté',
        bill: 'pjl25-689',
        amendmentUrl: ''
      },
      {
        number: 335,
        date: '2026-07-09',
        title: "sur l'amendement n° 5, présenté par M. Bernard Jomier et plusieurs de ses collègues, à l'article 1er de la proposition de loi",
        result: 'rejeté',
        bill: 'ppl25-610',
        amendmentUrl: ''
      }
    ])
  })

  it('reads each senator’s vote, leaving out what it doesn’t know', () => {
    expect(
      parseSenateVotes({
        votes: [
          { matricule: '21071f', vote: 'c', siege: 97 },
          { matricule: '21704R', vote: 'p', siege: 291 },
          { matricule: '19591F', vote: 'a' },
          { matricule: '20032U', vote: 'n' },
          { matricule: '20046A', vote: '?' }
        ]
      })
    ).toEqual([
      { senator: '21071F', position: 'against' },
      { senator: '21704R', position: 'for' },
      { senator: '19591F', position: 'abstention' },
      { senator: '20032U', position: 'nonVoting' }
    ])
    expect(() => parseSenateVotes({})).toThrow(/changed shape/)
  })

  it('names the bill a ballot is about', () => {
    expect(senateBillTitle("sur l'amendement n° 5, présenté par M. Jomier, à l'article 1er de la proposition de loi révisant le dispositif des stocks")).toBe(
      'proposition de loi révisant le dispositif des stocks'
    )
    expect(senateBillTitle("sur l'ensemble du projet de loi relatif à la protection des enfants")).toBe('projet de loi relatif à la protection des enfants')
    expect(senateBillTitle('sur la motion')).toBe('')
  })
})

describe('the session and dates', () => {
  it('names the session after the October it opens in', () => {
    expect(senateSession('2026-10-29')).toBe(2026)
    expect(senateSession('2026-09-30')).toBe(2025)
    expect(senateSession('2027-07-15')).toBe(2026)
  })

  it('reads French dates and the site’s entities', () => {
    expect(frenchDate('Scrutin n°44 - séance du 29 octobre 2026')).toBe('2026-10-29')
    expect(frenchDate('1er juillet 2026')).toBe('2026-07-01')
    expect(frenchDate('le 31 février')).toBe('')
    expect(decodeHtml('s&eacute;ance n&deg;1 &agrave; l&#39;&#xE9;t&eacute; &OElig;uvre &oelig;uvre')).toBe("séance n°1 à l'été Œuvre œuvre")
  })
})

describe('agenda', () => {
  it('reads the API’s days as events, by day and hour, sittings told apart', () => {
    const events = parseSenateAgenda({
      '2026-10-29': {
        day: '2026-10-29',
        events: [
          {
            id: 559710,
            date: '2026-10-29',
            hour: '10h30',
            title: 'Suite PJL Protection des enfants',
            place: 'Hémicycle',
            instances: ['Séance publique'],
            forecast: false,
            public: true
          },
          {
            id: 560386,
            date: '2026-10-29',
            hour: '8h00',
            title: 'Audition',
            place: 'Salle René Monory',
            instances: ['Commission des affaires européennes'],
            forecast: true,
            public: false
          },
          { id: 560253, date: '2026-10-29', hour: '8h30', title: 'Réunion du Bureau', place: 'salons de Boffrand', instances: null }
        ]
      }
    })
    expect(events.map((e) => [e.id, e.hour, e.sitting, e.organ, e.tentative])).toEqual([
      ['SE-560386', '8h00', false, 'Commission des affaires européennes', true],
      ['SE-560253', '8h30', false, '', false],
      ['SE-559710', '10h30', true, 'Séance publique', false]
    ])
    expect(parseSenateAgenda(null)).toEqual([])
    expect(senateHour('9h')).toBe('09:00:00')
    expect(senateHour('14h30')).toBe('14:30:00')
    expect(mondayOf('2026-10-29')).toBe('2026-10-26')
    expect(mondayOf('2026-11-01')).toBe('2026-10-26')
  })
})
