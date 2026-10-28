import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readContent, type CalendarItem } from '@marianne/content'
import { files } from '@marianne/content/files'
import { afterAll, describe, expect, it } from 'vitest'
import { ageOf, EMPTY_PROFILE, formatNir, missingFor, monthDay, nirValid, setupLabel, sirenValid, siteReady, type Profile } from '../src/shared/profile'
import { createArchive, openArchive } from '../src/main/archive/archive'
import { LockedError, session } from '../src/main/archive/session'
import { contextView } from '../src/main/profile/context'
import { documents, guessType } from '../src/main/profile/documents'
import { computeDeadlines, serviceDeadlines } from '../src/main/profile/rules'
import { normalize, profile } from '../src/main/profile/store'
import { redact, resolve, resolveDeep, tokensOf, unknownTokens } from '../src/main/profile/tokens'

const PASSWORD = 'Kq7#-mZ2!-pR4w-Tx9%-bN3e'

/** The catalog of sites built into the app. */
const SITES = readContent(files).sites

/** A profile with every kind of identifier (fictitious). NIR key: 97 − (2880344109123 mod 97) = 76. */
function sample(): Profile {
  const p = structuredClone(EMPTY_PROFILE)
  p.person = {
    ...p.person,
    civility: 'ms',
    birthName: 'Martin',
    firstNames: 'Camille Anne',
    birthDate: '1988-03-14',
    birthPlace: 'Nantes',
    nir: '288034410912376',
    iban: 'FR7630006000011234567890189',
    phone: '06 12 34 56 78',
    email: 'camille.martin@example.fr',
    familyStatus: 'pacs',
    workStatus: 'employee'
  }
  p.address = { street: '12 rue des Olivettes', complement: '', postcode: '44000', city: 'Nantes', inseeCode: '44109', since: '' }
  p.household = [{ id: 'm1', relation: 'child', firstName: 'Léo', lastName: '', birthDate: '2017-05-02', dependent: true }]
  p.accounts = [{ siteId: 'impots', fields: { tax_number: '3012345678901' }, since: '2026-01-01' }]
  p.companies = [
    {
      id: 'c1',
      siren: '356000000',
      name: 'Studio Martin',
      legalForm: 'EI',
      activity: '74.10Z',
      created: '2021-03-01',
      address: '',
      role: 'entrepreneur',
      regime: 'micro',
      frequency: 'quarterly',
      vat: 'exempt',
      yearEnd: '12-31'
    }
  ]
  p.vehicles = [{ id: 'v1', plate: 'GH-482-KX', model: 'Clio', firstRegistration: '2019-05-11', lastInspection: '2025-05-11', critair: '1' }]
  return p
}

/** A one-page PDF with a text layer. */
function pdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
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
  const p = sample()
  const defs = tokensOf(p, SITES)

  it('lists the identifiers of the profile', () => {
    const names = defs.map((t) => t.token)
    for (const t of [
      'last_name',
      'first_names',
      'first_name',
      'birth_date',
      'nir',
      'iban',
      'phone',
      'email',
      'address',
      'tax_number',
      'household.1.first_name',
      'company.1.siren',
      'company.1.name',
      'vehicle.1.plate'
    ])
      expect(names).toContain(t)
  })

  it('redacts identifiers in any spacing or format', () => {
    const text =
      'Mme Camille Anne MARTIN, née le 14/03/1988, NIR 2 88 03 44 109 123 76, tél. +33 6 12 34 56 78, camille.martin@example.fr, 12 rue des Olivettes. Numéro fiscal : 30 12 345 678 901. IBAN FR76 3000 6000 0112 3456 7890 189. SIREN 356 000 000, véhicule GH-482-KX, Studio Martin. Léo.'
    const out = redact(text, defs)
    for (const leak of [
      'Martin',
      'MARTIN',
      'Camille',
      '14/03/1988',
      '123 76',
      '345 678',
      '3456 7890',
      'example.fr',
      'Olivettes',
      '356 000 000',
      'GH-482-KX',
      'Léo'
    ])
      expect(out).not.toContain(leak)
    for (const token of ['[[nir]]', '[[tax_number]]', '[[iban]]', '[[company.1.siren]]']) expect(out).toContain(token)
  })

  it('redacts the formats of administrative pages and documents', () => {
    const accents = structuredClone(p)
    accents.person.birthName = 'Lefèvre'
    accents.person.firstNames = 'Marie-Hélène'
    accents.address = { ...accents.address, street: '12 rue des Olivettes', complement: 'Bâtiment B, apt 12' }
    accents.household.push({ id: 'm2', relation: 'spouse', firstName: 'Paul', lastName: 'Durand', birthDate: '1986-07-01', dependent: false })
    accents.idDocuments = [{ id: 'p1', type: 'id_card', holder: 'm2', number: 'X4RTBPFW4', issued: '', expires: '' }]
    const defs2 = tokensOf(accents, SITES)
    expect(defs2.map((t) => t.token)).toContain('household.2.id_document.id_card.number')
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
    expect(out).toContain('[[nir.other]]')
    expect(out).toContain('00012') // the establishment number is not an identifier
  })

  it('catches a short surname next to the first names, nowhere else', () => {
    const short = structuredClone(p)
    short.person.birthName = 'Ly'
    const defs3 = tokensOf(short, SITES)
    expect(redact('Camille Anne LY, Mme Ly, Ly Camille Anne', defs3)).toBe('[[first_names]] [[last_name]], Mme [[last_name]], [[last_name]] [[first_names]]')
    expect(redact('Lyon, un lycée', defs3)).toBe('Lyon, un lycée')
  })

  it('does not erase ordinary words', () => {
    expect(redact('Le marteau de Nantes coûte 12 euros.', defs)).toBe('Le marteau de Nantes coûte 12 euros.')
  })

  it('resolves tokens locally, leaves unknown ones', () => {
    expect(resolve('NIR [[nir]], né le [[birth_date]], [[caf_number]]', defs)).toBe('NIR 288034410912376, né le 14/03/1988, [[caf_number]]')
    expect(resolveDeep({ a: ['[[last_name]]'], b: 3 }, defs)).toEqual({ a: ['Martin'], b: 3 })
    expect(unknownTokens('[[nir]] [[caf_number]]', defs)).toEqual(['caf_number'])
  })
})

describe('context view', () => {
  it('gives the engine context and tokens, never identifier values', () => {
    const p = sample()
    const defs = tokensOf(p, SITES)
    const view = contextView(p, { sites: SITES, tokens: defs, deadlines: [], hasLogin: () => true, now: new Date(2026, 9, 28) })
    expect(view).toContain('38 ans · pacsé(e) · salarié(e) du privé')
    expect(view).toContain('Nantes (code insee 44109)')
    expect(view).toContain('[[nir]]')
    expect(view).toContain('[[iban]]')
    expect(view).toContain('impots.gouv.fr ✓')
    expect(view).toContain(
      'micro-entreprise, EI, activité 74.10Z, créée le 2021-03-01, déclarations urssaf trimestrielles, tva franchise en base, rôle entrepreneur'
    )
    expect(view).toContain('enfant 9 ans à charge ([[household.1.first_name]], id m1)')
    for (const t of defs) if (t.value.length >= 4 && !t.keep) expect(view).not.toContain(t.value)
    // Unconfigured sites are listed with their target.
    expect(view).toContain('cible « account:caf »')
  })
})

describe('setup', () => {
  it('knows what is configured and how to name the rest', () => {
    const p = sample()
    const impots = SITES.find((s) => s.id === 'impots')!
    const caf = SITES.find((s) => s.id === 'caf')!
    expect(siteReady(p, impots)).toBe(true)
    expect(siteReady(p, caf)).toBe(false)
    expect(missingFor(p, 'family', SITES, true).map((m) => m.target)).toContain('account:caf')
    // The page doesn't nag about sites the user doesn't use.
    expect(missingFor(p, 'family', SITES).map((m) => m.target)).not.toContain('account:caf')
    expect(missingFor(p, 'taxes', SITES)).toEqual([])
    expect(missingFor(p, 'mobility', SITES, true)).toEqual([])
    expect(missingFor(structuredClone(EMPTY_PROFILE), 'health', SITES).map((m) => m.label)).toEqual([
      'votre identité',
      'votre adresse',
      'votre numéro de sécurité sociale'
    ])
    expect(setupLabel('account:caf', SITES)).toBe('votre compte Caf')
    expect(setupLabel('address', SITES)).toBe('votre adresse')
    expect(setupLabel('unknown', SITES)).toBeNull()
  })

  it('fills in fields added since a profile was written', () => {
    const p = normalize({ person: { firstNames: 'A' } } as Partial<Profile>)
    expect(p.person.firstNames).toBe('A')
    expect(p.person.nir).toBe('')
    expect(p.deadlineStatus).toEqual({})
    expect(p.properties).toEqual([])
  })
})

describe('deadlines', () => {
  const calendar: CalendarItem[] = [
    { id: 'tf', domain: 'taxes', title: 'taxe foncière', monthDay: '10-15', applies: 'owner' },
    { id: 'cfe', domain: 'business', title: 'CFE', monthDay: '12-15', applies: 'company' }
  ]

  it('computes URSSAF quarters, CFE, inspections and document expiry', () => {
    const p = sample()
    p.idDocuments = [{ id: 'p1', type: 'passport', number: '', issued: '', expires: '2027-02-02', holder: 'me' }]
    const list = computeDeadlines(p, calendar, new Date(2026, 9, 28), 400)
    const keys = list.map((x) => x.key)
    expect(keys).toContain('urssaf:c1:2026-T3')
    expect(list.find((x) => x.key === 'urssaf:c1:2026-T3')).toMatchObject({ date: '2026-10-31', siteId: 'urssaf-ae', procedureId: 'declare-micro-turnover' })
    expect(list.find((x) => x.key === 'urssaf:c1:2026-T4')?.date).toBe('2027-01-31')
    expect(keys).toContain('calendar:cfe:2026')
    expect(keys.some((k) => k.startsWith('calendar:tf'))).toBe(false) // not an owner
    expect(list.find((x) => x.key.startsWith('inspection:v1'))?.date).toBe('2027-05-11')
    expect(list.find((x) => x.key.startsWith('id-document:p1'))).toMatchObject({ date: '2027-02-02', siteId: 'ants', procedureId: 'renew-id-documents' })
    // Sorted by date.
    expect([...list].sort((a, b) => a.date.localeCompare(b.date)).map((x) => x.key)).toEqual(keys)
  })

  it('declares monthly turnover by the end of the next month, the first one after 90 days of activity', () => {
    const p = sample()
    // Start on 6 March: the 90th day falls in June, the first declaration (March to June) by 31 July.
    p.companies[0] = { ...p.companies[0], frequency: 'monthly', created: '2026-03-06' }
    const urssaf = computeDeadlines(p, [], new Date(2026, 2, 10), 200).filter((x) => x.key.startsWith('urssaf:'))
    expect(urssaf[0]).toMatchObject({ key: 'urssaf:c1:2026-06', date: '2026-07-31' })
    expect(urssaf[0].title).toContain('première déclaration')
    expect(urssaf[1]).toMatchObject({ key: 'urssaf:c1:2026-07', date: '2026-08-31' })
  })

  it('declares by quarter, the first one after 90 days of activity', () => {
    const p = sample()
    // Start on 12 April: the 90th day falls in the 3rd quarter, declared by 31 October.
    p.companies[0] = { ...p.companies[0], frequency: 'quarterly', created: '2026-04-12' }
    const urssaf = computeDeadlines(p, [], new Date(2026, 4, 1), 300).filter((x) => x.key.startsWith('urssaf:'))
    expect(urssaf.map((x) => [x.key, x.date])).toEqual([
      ['urssaf:c1:2026-T3', '2026-10-31'],
      ['urssaf:c1:2026-T4', '2027-01-31']
    ])
  })

  it('keeps an overdue inspection, estimates one from the first registration', () => {
    const p = sample()
    p.vehicles = [
      { id: 'v1', plate: 'AA-111-AA', model: 'Clio', firstRegistration: '2015-02-01', lastInspection: '2024-06-01', critair: '' },
      { id: 'v2', plate: 'BB-222-BB', model: 'Zoé', firstRegistration: '2015-03-10', lastInspection: '', critair: '' }
    ]
    const list = computeDeadlines(p, [], new Date(2026, 9, 28), 400)
    expect(list.find((x) => x.key === 'inspection:v1:2026-06-01')).toMatchObject({ date: '2026-10-28' })
    expect(list.find((x) => x.key === 'inspection:v1:2026-06-01')?.title).toContain('en retard')
    expect(list.find((x) => x.key.startsWith('inspection:v2'))).toMatchObject({ date: '2027-03-10', indicative: true })
  })

  it('reminds a residence permit renewal two months before it expires', () => {
    const p = sample()
    p.idDocuments = [{ id: 'p1', type: 'residence_permit', number: '', issued: '', expires: '2027-03-01', holder: 'me' }]
    const x = computeDeadlines(p, [], new Date(2026, 9, 28), 400).find((y) => y.key.startsWith('id-document:p1'))
    expect(x?.date).toBe('2026-12-31')
    expect(x?.title).toContain('01/03/2027')
  })

  it('reminds the tenant of the yearly home insurance certificate', () => {
    const p = sample()
    p.properties = [
      { id: 'l1', address: '', inseeCode: '', use: 'main_home', status: 'tenant', rent: '', leaseStart: '2024-12-01', landlord: '' },
      { id: 'l2', address: '', inseeCode: '', use: 'second_home', status: 'owner', rent: '', leaseStart: '', landlord: '' }
    ]
    const list = computeDeadlines(p, calendar, new Date(2026, 9, 28), 400)
    expect(list.find((x) => x.key === 'insurance:l1:2026')).toMatchObject({ date: '2026-12-01', domain: 'housing' })
    expect(list.find((x) => x.key === 'calendar:tf:2027')).toMatchObject({ date: '2027-10-15', source: 'calendar' })
  })

  it('applies the statuses the user set, and keeps manual deadlines', () => {
    const p = sample()
    p.deadlineStatus = { 'urssaf:c1:2026-T3': 'done' }
    p.deadlines = [{ id: 'x1', domain: 'justice', title: 'répondre', date: '2026-11-20', note: '', source: 'agent' }]
    const list = computeDeadlines(p, [], new Date(2026, 9, 28), 60)
    expect(list.find((x) => x.key === 'urssaf:c1:2026-T3')?.status).toBe('done')
    expect(list.find((x) => x.key === 'x1')).toMatchObject({ source: 'agent', status: 'todo' })
  })

  it('computes company accounts from the closing date', () => {
    const p = sample()
    p.companies[0] = { ...p.companies[0], regime: 'corporate_tax', yearEnd: '12-31' }
    const list = computeDeadlines(p, [], new Date(2027, 0, 10), 300)
    expect(list.find((x) => x.key === 'accounts:c1:2026:approval')?.date).toBe('2027-06-30')
    expect(list.find((x) => x.key === 'accounts:c1:2026:filing')?.date).toBe('2027-07-31')
  })

  it('reads the year end as typed, never before the company existed, month ends kept', () => {
    const p = sample()
    p.companies[0] = { ...p.companies[0], regime: 'corporate_tax', yearEnd: '30/06', created: '2026-03-01' }
    const list = computeDeadlines(p, [], new Date(2026, 4, 1), 400)
    // Closed 30/06/2026 (the year closed in 2025 didn't exist): approved by 31/12, filed by 31/01.
    expect(list.find((x) => x.key === 'accounts:c1:2025:approval')).toBeUndefined()
    expect(list.find((x) => x.key === 'accounts:c1:2026:approval')?.date).toBe('2026-12-31')
    expect(list.find((x) => x.key === 'accounts:c1:2026:filing')?.date).toBe('2027-01-31')
    // A year end that isn't a date gives nothing, and no crash.
    p.companies[0].yearEnd = '31-12'
    expect(() => computeDeadlines(p, [], new Date(2026, 4, 1), 400)).not.toThrow()
    expect(monthDay('31-12')).toBeNull()
    expect(monthDay('31/12')).toEqual([12, 31])
  })

  it('keeps a service deadline once past, today, until the service no longer reports it', () => {
    const toll = { service: 'peage', domain: 'mobility' as const, params: { trip: 't1' } }
    const list = serviceDeadlines(
      [
        { ...toll, id: 't1', title: 'Péage A13-A14 : trajet du 24/10 à payer', due: '2026-10-27T14:30:00+01:00' },
        { ...toll, id: 't2', title: 'Péage A79 : trajet du 28/10 à payer', due: '2026-10-31T09:00:00+01:00', detail: 'avant 9 h' },
        { ...toll, id: 't3', title: 'trop loin', due: '2027-06-01' }
      ],
      new Date(2026, 9, 28, 10),
      60
    )
    expect(list.map((d) => [d.key, d.date, d.note])).toEqual([
      ['service:peage:t1', '2026-10-28', 'en retard : l’échéance était le 27/10/2026'],
      ['service:peage:t2', '2026-10-31T09:00:00+01:00', 'avant 9 h']
    ])
    expect(list[0]).toMatchObject({ source: 'service', status: 'todo', service: 'peage', params: { trip: 't1' } })
  })
})

describe('documents', () => {
  it('guesses the type from the file name', () => {
    expect(guessType('avis-impot-2026.pdf')).toBe('tax_notice')
    expect(guessType('Avis_d’imposition 2025.pdf')).toBe('tax_notice')
    expect(guessType('Bulletin de salaire mars.pdf')).toBe('payslip')
    expect(guessType('attestation-droits-ameli.pdf')).toBe('certificate')
    expect(guessType('Relevé de carrière.pdf')).toBe('statement')
    expect(guessType('scan0042.jpg')).toBe('other')
  })
})

describe('in the archive', () => {
  const dir = mkdtempSync(join(tmpdir(), 'marianne-profile-'))
  afterAll(() => {
    session.lock()
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps the profile in the archive, normalized, and forgets it on lock', async () => {
    const file = join(dir, 'a.marianne')
    const { archive } = await createArchive(file, { id: 'a', display: '', password: PASSWORD })
    const dek = archive.dataKey()
    session.open(archive)
    let changes = 0
    const onChange = () => changes++
    profile.on('change', onChange)
    profile.apply({ type: 'person', patch: { birthName: ' Martin ', nir: '2 88 03 44 109 123 76' } })
    profile.apply({
      type: 'entity',
      kind: 'vehicles',
      item: { id: '', plate: 'gh-482-kx', model: 'Clio', firstRegistration: '', lastInspection: '', critair: '' }
    })
    profile.apply({ type: 'procedureStep', id: 'declare-income', step: 2, done: true })
    profile.apply({ type: 'procedureStep', id: 'declare-income', step: 0, done: true })
    profile.off('change', onChange)
    expect(changes).toBe(4)
    const p = profile.get()
    expect(p.person).toMatchObject({ birthName: 'Martin', nir: '288034410912376' })
    expect(p.vehicles[0].plate).toBe('GH-482-KX')
    expect(p.vehicles[0].id).not.toBe('')
    expect(p.procedures['declare-income']).toEqual([0, 2])
    expect(archive.get<Profile>('profile', 'main')?.person.nir).toBe('288034410912376')

    session.lock()
    expect(() => profile.get()).toThrow(LockedError)
    session.open(openArchive(file, dek))
    expect(profile.get().person.birthName).toBe('Martin')

    // Another account sees its own profile only.
    const other = await createArchive(join(dir, 'b.marianne'), { id: 'b', display: '', password: PASSWORD })
    session.open(other.archive)
    expect(profile.get().person.birthName).toBe('')
  })

  it('seals documents in the archive and gives engines their text masked', async () => {
    const { archive } = await createArchive(join(dir, 'c.marianne'), { id: 'c', display: '', password: PASSWORD })
    session.open(archive)
    profile.apply({ type: 'person', patch: { birthName: 'Martin', firstNames: 'Camille', nir: '288034410912376' } })

    const note = await documents.add(
      { name: 'avis-impot-2026.txt', data: Buffer.from('Avis pour Camille MARTIN, NIR 2 88 03 44 109 123 76') },
      { domain: 'taxes', folderId: 'f1' }
    )
    expect(note).toMatchObject({ title: 'avis impot 2026', type: 'tax_notice', mime: 'text/plain', folderId: 'f1', entity: '' })
    expect(await documents.text(note.id)).toBe('Avis pour [[first_names]] [[last_name]], NIR [[nir]]')
    expect(await documents.rawText(note.id)).toContain('2 88 03 44 109 123 76')
    expect(documents.update(note.id, { title: ' Avis 2026 ', type: 'letter' })).toMatchObject({ id: note.id, title: 'Avis 2026', type: 'letter' })

    const scan = await documents.add({ name: 'notice.pdf', data: pdf('Avis d impot de Camille MARTIN, NIR 2 88 03 44 109 123 76') }, { domain: 'taxes' })
    expect(await documents.text(scan.id)).toContain('NIR [[nir]]')
    // Extracted once, kept in the archive.
    expect(archive.get<{ text: string }>('doctext', scan.id)?.text).toContain('MARTIN')
    expect(documents.list().map((x) => x.id)).toEqual([note.id, scan.id])
    expect(documents.bytes(scan.id).subarray(0, 5).toString()).toBe('%PDF-')

    documents.remove(scan.id)
    expect(documents.list().map((x) => x.id)).toEqual([note.id])
    expect(archive.get('doctext', scan.id)).toBeNull()
  })
})
