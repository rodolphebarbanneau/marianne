import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SERVICES } from '../src/shared/constants'
import { ageOf, EMPTY_DOSSIER, formatNir, monthDay, nirValid, sirenValid, type Dossier } from '../src/shared/dossier'
import { missingFor, serviceReady, setupRoute } from '../src/shared/setup'
import { passphraseKey, seal, unseal } from '../src/main/crypto'
import { contextView } from '../src/main/dossier/context'
import { parseDemarche } from '../src/main/dossier/demarches'
import { guessType } from '../src/main/dossier/documents'
import { computeDeadlines, type CalendarItem } from '../src/main/dossier/rules'
import { normalize } from '../src/main/dossier/store'
import { redact, resolve, resolveDeep, tokensOf, unknownTokens } from '../src/main/dossier/tokens'

/** A file with every kind of identifier (fictitious). NIR key: 97 − (2880344109123 mod 97) = 76. */
function sample(): Dossier {
  const d = structuredClone(EMPTY_DOSSIER)
  d.person = {
    ...d.person,
    civilite: 'Mme',
    nomNaissance: 'Martin',
    prenoms: 'Camille Anne',
    dateNaissance: '1988-03-14',
    communeNaissance: 'Nantes',
    nir: '288034410912376',
    telephone: '06 12 34 56 78',
    email: 'camille.martin@example.fr',
    situationFamiliale: 'pacse',
    situationPro: 'salarie'
  }
  d.address = { rue: '12 rue des Olivettes', complement: '', codePostal: '44000', commune: 'Nantes', codeInsee: '44109', depuis: '' }
  d.household = [{ id: 'm1', lien: 'enfant', prenom: 'Léo', nom: '', dateNaissance: '2017-05-02', aCharge: true }]
  d.accounts = [{ serviceId: 'impots', fields: { numero_fiscal: '3012345678901' }, since: '2026-01-01' }]
  d.entreprises = [
    {
      id: 'c1',
      siren: '356000000',
      denomination: 'Studio Martin',
      forme: 'EI',
      activite: '74.10Z',
      creation: '2021-03-01',
      adresse: '',
      role: 'entrepreneur',
      regime: 'micro',
      periodicite: 'trimestrielle',
      tva: 'franchise',
      cloture: '12-31'
    }
  ]
  d.vehicules = [{ id: 'v1', immatriculation: 'GH-482-KX', modele: 'Clio', premiereImmatriculation: '2019-05-11', dernierControle: '2025-05-11', critair: '1' }]
  return d
}

describe('identifiers', () => {
  it('checks the NIR key, Corsica included', () => {
    expect(nirValid('2 88 03 44 109 123 76')).toBe(true)
    expect(nirValid('288034410912377')).toBe(false)
    expect(nirValid('12345')).toBe(false)
    // 2A counts as 19 in the key: 97 − (1850219004005 mod 97).
    const body = '185022A004005'
    const key = 97 - Number(BigInt('1850219004005') % 97n)
    expect(nirValid(`${body}${String(key).padStart(2, '0')}`)).toBe(true)
    expect(formatNir('288034410912376')).toBe('2 88 03 44 109 123 76')
  })

  it('checks SIREN numbers (Luhn)', () => {
    expect(sirenValid('356 000 000')).toBe(true)
    expect(sirenValid('356000001')).toBe(false)
  })

  it('computes ages', () => {
    expect(ageOf('1988-03-14', new Date(2026, 9, 28))).toBe(38)
    expect(ageOf('1988-11-14', new Date(2026, 9, 28))).toBe(37)
    expect(ageOf('', new Date())).toBeNull()
  })
})

describe('tokens', () => {
  const d = sample()
  const defs = tokensOf(d, SERVICES)

  it('lists the identifiers of the file', () => {
    const names = defs.map((t) => t.token)
    for (const t of [
      'nom',
      'prenoms',
      'prenom',
      'date_naissance',
      'nir',
      'telephone',
      'email',
      'adresse',
      'numero_fiscal',
      'foyer.1.prenom',
      'entreprise.1.siren',
      'entreprise.1.denomination',
      'vehicule.1.immatriculation'
    ])
      expect(names).toContain(t)
  })

  it('redacts identifiers in any spacing or format', () => {
    const text =
      'Mme Camille Anne MARTIN, née le 14/03/1988, NIR 2 88 03 44 109 123 76, tél. +33 6 12 34 56 78, camille.martin@example.fr, 12 rue des Olivettes. Numéro fiscal : 30 12 345 678 901. SIREN 356 000 000, véhicule GH-482-KX, Studio Martin. Léo.'
    const out = redact(text, defs)
    for (const leak of ['Martin', 'MARTIN', 'Camille', '14/03/1988', '123 76', '345 678', 'example.fr', 'Olivettes', '356 000 000', 'GH-482-KX', 'Léo'])
      expect(out).not.toContain(leak)
    expect(out).toContain('[[nir]]')
    expect(out).toContain('[[numero_fiscal]]')
    expect(out).toContain('[[entreprise.1.siren]]')
  })

  it('redacts the formats of administrative pages and documents', () => {
    const accents = structuredClone(d)
    accents.person.nomNaissance = 'Lefèvre'
    accents.person.prenoms = 'Marie-Hélène'
    accents.address = { ...accents.address, rue: '12 rue des Olivettes', complement: 'Bâtiment B, apt 12' }
    accents.household.push({ id: 'm2', lien: 'conjoint', prenom: 'Paul', nom: 'Durand', dateNaissance: '1986-07-01', aCharge: false })
    accents.pieces = [{ id: 'p1', type: 'cni', titulaire: 'm2', numero: 'X4RTBPFW4', delivrance: '', expiration: '' }]
    const defs2 = tokensOf(accents, SERVICES)
    const text = [
      'LEFEVRE MARIE HELENE', // impots.gouv: upper case, no accents
      '12 RUE DES OLIVETTES 44000 NANTES', // street without its complement
      'NIR 2 88 03 44 109 123 (clé 76)', // without the key
      'SIRET 356 000 000 00012, TVA FR32356000000', // SIREN inside
      'né le 14 mars 1988, 14031988, conjoint né le 1er juillet 1986',
      'CNI du conjoint X4RTBPFW4',
      'Déclarant 2 : NIR 1 86 07 75 112 345 12' // someone else's NIR (valid key)
    ].join('\n')
    const out = redact(text, defs2)
    for (const leak of [
      'LEFEVRE',
      'HELENE',
      'OLIVETTES',
      '109 123',
      '356 000 000',
      '356000000',
      '14 mars',
      '14031988',
      '1er juillet 1986',
      'X4RTBPFW4',
      '112 345'
    ])
      expect(out, out).not.toContain(leak)
    expect(out).toContain('[[nir.autre]]')
    expect(out).toContain('00012') // the establishment number is not an identifier
  })

  it('catches a short surname next to the first names, nowhere else', () => {
    const short = structuredClone(d)
    short.person.nomNaissance = 'Ly'
    const defs3 = tokensOf(short, SERVICES)
    expect(redact('Camille Anne LY, Mme Ly, Ly Camille Anne', defs3)).toBe('[[prenoms]] [[nom]], Mme [[nom]], [[nom]] [[prenoms]]')
    expect(redact('Lyon, un lycée', defs3)).toBe('Lyon, un lycée')
  })

  it('does not erase ordinary words', () => {
    expect(redact('Le marteau de Nantes coûte 12 euros.', defs)).toBe('Le marteau de Nantes coûte 12 euros.')
  })

  it('resolves tokens locally, leaves unknown ones', () => {
    expect(resolve('NIR [[nir]], né le [[date_naissance]], [[numero_allocataire]]', defs)).toBe('NIR 288034410912376, né le 14/03/1988, [[numero_allocataire]]')
    expect(resolveDeep({ a: ['[[nom]]'], b: 3 }, defs)).toEqual({ a: ['Martin'], b: 3 })
    expect(unknownTokens('[[nir]] [[numero_allocataire]]', defs)).toEqual(['numero_allocataire'])
  })
})

describe('context view', () => {
  it('gives the agent context and tokens, never identifier values', () => {
    const d = sample()
    const defs = tokensOf(d, SERVICES)
    const view = contextView(d, { services: SERVICES, tokens: defs, deadlines: [], hasLogin: () => true, now: new Date(2026, 9, 28) })
    expect(view).toContain('38 ans')
    expect(view).toContain('Nantes (code insee 44109)')
    expect(view).toContain('[[nir]]')
    expect(view).toContain('impots.gouv.fr ✓')
    for (const t of defs) if (t.value.length >= 4 && !t.keep) expect(view).not.toContain(t.value)
    // Unconfigured services are listed with their target.
    expect(view).toContain('cible « compte:caf »')
  })
})

describe('setup', () => {
  it('knows what is configured and where to configure the rest', () => {
    const d = sample()
    const impots = SERVICES.find((s) => s.id === 'impots')!
    const caf = SERVICES.find((s) => s.id === 'caf')!
    expect(serviceReady(d, impots)).toBe(true)
    expect(serviceReady(d, caf)).toBe(false)
    expect(missingFor(d, 'famille', SERVICES, true).map((m) => m.target)).toContain('compte:caf')
    // The page doesn't nag about services the user doesn't use.
    expect(missingFor(d, 'famille', SERVICES).map((m) => m.target)).not.toContain('compte:caf')
    expect(missingFor(d, 'impots', SERVICES)).toEqual([])
    expect(setupRoute('compte:caf', SERVICES)).toEqual({ route: 'domaine/famille#compte:caf', label: 'votre compte Caf' })
    expect(setupRoute('adresse', SERVICES)?.route).toBe('dossier#adresse')
    expect(setupRoute('inconnu', SERVICES)).toBeNull()
  })

  it('fills in fields added since a file was written', () => {
    const d = normalize({ person: { prenoms: 'A' } } as Partial<Dossier>)
    expect(d.person.prenoms).toBe('A')
    expect(d.person.nir).toBe('')
    expect(d.deadlineStatus).toEqual({})
    expect(d.logements).toEqual([])
  })
})

describe('deadlines', () => {
  const calendar: CalendarItem[] = [
    { id: 'tf', domain: 'impots', title: 'taxe foncière', monthDay: '10-15', applies: 'proprietaire' },
    { id: 'cfe', domain: 'entreprises', title: 'CFE', monthDay: '12-15', applies: 'entreprise' }
  ]

  it('computes URSSAF quarters, CFE, inspections and document expiry', () => {
    const d = sample()
    d.pieces = [{ id: 'p1', type: 'passeport', numero: '', delivrance: '', expiration: '2027-02-02', titulaire: 'moi' }]
    const list = computeDeadlines(d, calendar, new Date(2026, 9, 28), 400)
    const keys = list.map((x) => x.key)
    expect(keys).toContain('urssaf:c1:2026-T3')
    expect(list.find((x) => x.key === 'urssaf:c1:2026-T3')?.date).toBe('2026-10-31')
    expect(list.find((x) => x.key === 'urssaf:c1:2026-T4')?.date).toBe('2027-01-31')
    expect(keys).toContain('calendrier:cfe:2026')
    expect(keys.some((k) => k.startsWith('calendrier:tf'))).toBe(false) // not an owner
    expect(list.find((x) => x.key.startsWith('ct:v1'))?.date).toBe('2027-05-11')
    expect(list.find((x) => x.key.startsWith('piece:p1'))?.date).toBe('2027-02-02')
    // Sorted by date.
    expect([...list].sort((a, b) => a.date.localeCompare(b.date)).map((x) => x.key)).toEqual(keys)
  })

  it('declares monthly turnover by the end of the next month, the first one after 90 days of activity', () => {
    const d = sample()
    // Start on 6 March: the 90th day falls in June, the first declaration (March to June) by 31 July.
    d.entreprises[0] = { ...d.entreprises[0], periodicite: 'mensuelle', creation: '2026-03-06' }
    const urssaf = computeDeadlines(d, [], new Date(2026, 2, 10), 200).filter((x) => x.key.startsWith('urssaf:'))
    expect(urssaf[0]).toMatchObject({ key: 'urssaf:c1:2026-06', date: '2026-07-31' })
    expect(urssaf[0].title).toContain('première déclaration')
    expect(urssaf[1]).toMatchObject({ key: 'urssaf:c1:2026-07', date: '2026-08-31' })
  })

  it('declares by quarter, the first one after 90 days of activity', () => {
    const d = sample()
    // Start on 12 April: the 90th day falls in the 3rd quarter, declared by 31 October.
    d.entreprises[0] = { ...d.entreprises[0], periodicite: 'trimestrielle', creation: '2026-04-12' }
    const urssaf = computeDeadlines(d, [], new Date(2026, 4, 1), 300).filter((x) => x.key.startsWith('urssaf:'))
    expect(urssaf.map((x) => [x.key, x.date])).toEqual([
      ['urssaf:c1:2026-T3', '2026-10-31'],
      ['urssaf:c1:2026-T4', '2027-01-31']
    ])
  })

  it('keeps an overdue inspection, estimates one from the first registration', () => {
    const d = sample()
    d.vehicules = [
      { id: 'v1', immatriculation: 'AA-111-AA', modele: 'Clio', premiereImmatriculation: '2015-02-01', dernierControle: '2024-06-01', critair: '' },
      { id: 'v2', immatriculation: 'BB-222-BB', modele: 'Zoé', premiereImmatriculation: '2015-03-10', dernierControle: '', critair: '' }
    ]
    const list = computeDeadlines(d, [], new Date(2026, 9, 28), 400)
    expect(list.find((x) => x.key === 'ct:v1:2026-06-01')).toMatchObject({ date: '2026-10-28' })
    expect(list.find((x) => x.key === 'ct:v1:2026-06-01')?.title).toContain('en retard')
    expect(list.find((x) => x.key.startsWith('ct:v2'))).toMatchObject({ date: '2027-03-10', indicative: true })
  })

  it('reminds a residence permit renewal two months before it expires', () => {
    const d = sample()
    d.pieces = [{ id: 'p1', type: 'titre_sejour', numero: '', delivrance: '', expiration: '2027-03-01', titulaire: 'moi' }]
    const x = computeDeadlines(d, [], new Date(2026, 9, 28), 400).find((y) => y.key.startsWith('piece:p1'))
    expect(x?.date).toBe('2026-12-31')
    expect(x?.title).toContain('01/03/2027')
  })

  it('applies the statuses the user set, and keeps manual deadlines', () => {
    const d = sample()
    d.deadlineStatus = { 'urssaf:c1:2026-T3': 'fait' }
    d.deadlines = [{ id: 'x1', domain: 'justice', title: 'répondre', date: '2026-11-20', note: '', source: 'agent' }]
    const list = computeDeadlines(d, [], new Date(2026, 9, 28), 60)
    expect(list.find((x) => x.key === 'urssaf:c1:2026-T3')?.status).toBe('fait')
    expect(list.find((x) => x.key === 'x1')).toMatchObject({ source: 'agent', status: 'a_faire' })
  })

  it('computes company accounts from the closing date', () => {
    const d = sample()
    d.entreprises[0] = { ...d.entreprises[0], regime: 'societe_is', cloture: '12-31' }
    const list = computeDeadlines(d, [], new Date(2027, 0, 10), 300)
    expect(list.find((x) => x.key === 'comptes:c1:2026:approbation')?.date).toBe('2027-06-30')
    expect(list.find((x) => x.key === 'comptes:c1:2026:depot')?.date).toBe('2027-07-31')
  })

  it('reads the year end as typed, never before the company existed, month ends kept', () => {
    const d = sample()
    d.entreprises[0] = { ...d.entreprises[0], regime: 'societe_is', cloture: '30/06', creation: '2026-03-01' }
    const list = computeDeadlines(d, [], new Date(2026, 4, 1), 400)
    // Closed 30/06/2026 (the year closed in 2025 didn't exist): approved by 31/12, filed by 31/01.
    expect(list.find((x) => x.key === 'comptes:c1:2025:approbation')).toBeUndefined()
    expect(list.find((x) => x.key === 'comptes:c1:2026:approbation')?.date).toBe('2026-12-31')
    expect(list.find((x) => x.key === 'comptes:c1:2026:depot')?.date).toBe('2027-01-31')
    // A year end that isn't a date gives nothing, and no crash.
    d.entreprises[0].cloture = '31-12'
    expect(() => computeDeadlines(d, [], new Date(2026, 4, 1), 400)).not.toThrow()
    expect(monthDay('31-12')).toBeNull()
    expect(monthDay('31/12')).toEqual([12, 31])
  })
})

describe('encryption', () => {
  it('seals and opens, and detects tampering', () => {
    const key = Buffer.alloc(32, 7)
    const sealed = seal(key, 'secret dossier')
    expect(unseal(key, sealed).toString('utf8')).toBe('secret dossier')
    const tampered = Buffer.from(sealed)
    tampered[tampered.length - 1] ^= 1
    expect(() => unseal(key, tampered)).toThrow()
    expect(() => unseal(Buffer.alloc(32, 8), sealed)).toThrow()
  })

  it('derives the same key from the same passphrase and salt only', () => {
    const salt = Buffer.alloc(16, 1)
    const a = passphraseKey('une phrase de passe longue', salt)
    expect(passphraseKey('une phrase de passe longue', salt).equals(a)).toBe(true)
    expect(passphraseKey('une autre phrase de passe', salt).equals(a)).toBe(false)
  })
})

describe('guided procedures', () => {
  const dir = join(__dirname, '../resources/demarches')

  it('all parse, with valid actions', () => {
    const ids = new Set<string>()
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const d = parseDemarche(readFileSync(join(dir, name), 'utf8'))
      expect(ids.has(d.id)).toBe(false)
      ids.add(d.id)
      expect(d.steps.length).toBeGreaterThan(1)
      for (const step of d.steps)
        for (const a of step.actions) {
          if (a.kind === 'ouvrir') expect(/^https:\/\//.test(a.target) || SERVICES.some((s) => s.id === a.target), `${d.id}: ouvrir ${a.target}`).toBe(true)
          if (a.kind === 'configurer') expect(setupRoute(a.target, SERVICES), `${d.id}: configurer ${a.target}`).not.toBeNull()
          if (a.kind === 'fiche') expect(a.target).toMatch(/^[FNR]\d+$/)
        }
    }
    expect(ids.size).toBeGreaterThanOrEqual(12)
  })

  it('reads steps and their actions', () => {
    const d = parseDemarche('---\nid: x\ndomaine: impots\ntitre: Test\npieces: a; b\n---\n## Un\nTexte.\n> ouvrir: impots | Ouvrir\n## Deux\nFin.')
    expect(d).toMatchObject({ id: 'x', domain: 'impots', title: 'Test', pieces: ['a', 'b'] })
    expect(d.steps[0]).toEqual({ title: 'Un', body: 'Texte.', actions: [{ kind: 'ouvrir', target: 'impots', label: 'Ouvrir' }] })
  })
})

describe('documents', () => {
  it('guesses the type from the file name', () => {
    expect(guessType('avis-impot-2026.pdf')).toBe('avis_impot')
    expect(guessType('Avis_d’imposition 2025.pdf')).toBe('avis_impot')
    expect(guessType('Bulletin de salaire mars.pdf')).toBe('bulletin_paie')
    expect(guessType('attestation-droits-ameli.pdf')).toBe('attestation')
    expect(guessType('Relevé de carrière.pdf')).toBe('releve')
    expect(guessType('scan0042.jpg')).toBe('autre')
  })
})
