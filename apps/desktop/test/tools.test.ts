import { readContent } from '@marianne/content'
import { files } from '@marianne/content/files'
import { EMPTY_PROFILE, type Profile } from '@marianne/profile'
import { describe, expect, it } from 'vitest'
import { siteOf } from '../src/shared/hosts'
import { computeDeadline, weekday } from '../src/main/tools/calendar'
import { articleNumber, findCode } from '../src/main/tools/legifrance'
import { binding, consequential, Consents, knownSites, reading } from '../src/main/tools/online'
import { setupCard } from '../src/main/tools/profile'
import { normalizeValues, opId, plan } from '../src/main/tools/proposals'
import { ToolError } from '../src/main/tools/tool'

/** The catalog of sites built into the app. */
const SITES = readContent(files).sites

const holidays = new Map([
  ['2026-11-11', '11 novembre'],
  ['2026-12-25', 'Jour de Noël'],
  ['2027-01-01', '1er janvier']
])

describe('what a planned task’s run may click', () => {
  const el = (label: string, type = 'button', role = 'button') => ({ role, type, label })

  it('what plainly reads', () => {
    for (const label of ['Rechercher', 'Voir le détail', 'Suivant', 'Page précédente', 'Fermer', 'Tout refuser', 'Continuer sans accepter'])
      expect(reading(el(label))).toBe(true)
    expect(reading(el('Rechercher', 'submit'))).toBe(true)
  })

  it('nothing that could commit, whatever its type or the engine’s reason', () => {
    for (const label of ['Payer', 'Valider', 'Oui', 'OK', 'Autoriser le prélèvement', 'Continuer', 'Se connecter', 'Envoyer', 'Accepter', '', 'Télécharger'])
      expect(reading(el(label))).toBe(false)
    expect(reading(el('Rechercher'), 'payer le passage')).toBe(false)
    expect(reading(el('Voir et payer'))).toBe(false)
  })
})

describe('computeDeadline', () => {
  it('does not count the starting day', () => {
    // Notified Monday 2 November 2026, 15 days: ends Tuesday 17 November.
    expect(computeDeadline('2026-11-02', 15, 'days', false, holidays).end).toBe('2026-11-17')
  })

  it('ends a month deadline on the same day number, or the last day of a shorter month', () => {
    expect(computeDeadline('2026-03-16', 2, 'months', false, holidays).nominal).toBe('2026-05-16')
    expect(computeDeadline('2027-01-31', 1, 'months', false, holidays).nominal).toBe('2027-02-28')
    expect(computeDeadline('2026-08-31', 2, 'months', false, holidays).nominal).toBe('2026-10-31')
  })

  it('moves a weekend end to the next working day', () => {
    // 2026-10-31 is a Saturday: Monday 2 November.
    const d = computeDeadline('2026-08-31', 2, 'months', false, holidays)
    expect(weekday('2026-10-31')).toBe('Saturday')
    expect(d.end).toBe('2026-11-02')
    expect(d.steps.map((s) => s.date)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02'])
  })

  it('moves a public holiday end, then any weekend after it', () => {
    // 25 December 2026 is a Friday: Monday 28 December.
    expect(computeDeadline('2026-12-10', 15, 'days', false, holidays).end).toBe('2026-12-28')
    // 11 November 2026 is a Wednesday: Thursday 12.
    const d = computeDeadline('2026-10-28', 2, 'weeks', false, holidays)
    expect(d.end).toBe('2026-11-12')
    expect(d.steps.at(-1)?.reason).toContain('public holiday (11 novembre)')
  })

  it('adds the last day for a délai franc', () => {
    // Notified 3 March, two-month délai franc: until 4 May (a Monday).
    const d = computeDeadline('2026-03-03', 2, 'months', true, holidays)
    expect(d.nominal).toBe('2026-05-04')
    expect(d.end).toBe('2026-05-04')
  })

  it('handles years and leap days, and refuses other date formats', () => {
    expect(computeDeadline('2024-02-29', 1, 'years', false, new Map()).nominal).toBe('2025-02-28')
    expect(() => computeDeadline('03/03/2026', 2, 'months', false, holidays)).toThrow(ToolError)
  })
})

describe('legifrance', () => {
  it('finds codes by name, loosely', () => {
    expect(findCode('Code civil')).toEqual({ name: 'Code civil', id: 'LEGITEXT000006070721' })
    expect(findCode('code de la securite sociale')?.id).toBe('LEGITEXT000006073189')
    expect(findCode('impôts')?.name).toBe('Code général des impôts')
    expect(findCode('LEGITEXT000006072050')?.name).toBe('Code du travail')
    // civile, pénale, d'exécution: ambiguous.
    expect(findCode('procédure')).toBeNull()
  })

  it('normalizes article numbers', () => {
    expect(articleNumber('L. 1237-1')).toBe('L1237-1')
    expect(articleNumber('article 1240')).toBe('1240')
  })
})

describe('consequential clicks', () => {
  const button = (label: string, type = 'button') => ({ role: 'button', type, label })
  const link = (label: string) => ({ role: 'link', type: '', label })

  it('asks for steps that sign, pay, send, submit, confirm, declare or delete', () => {
    for (const label of [
      'Valider',
      'Signer ma déclaration',
      'Payer 135 €',
      'Envoyer',
      'Transmettre le dossier',
      'Confirmer le rendez-vous',
      'Je déclare',
      'Supprimer le compte',
      'Soumettre',
      'Terminer',
      'Régler l’amende',
      'J’atteste sur l’honneur',
      'Annuler ma demande',
      'Submit',
      'Pay now',
      'Sign'
    ])
      expect(consequential(button(label)), label).toBe(true)
    expect(consequential(link('Payer en ligne'))).toBe(true)
  })

  it('lets plain navigation through', () => {
    for (const label of [
      'Menu',
      'Fermer',
      'Rechercher',
      'Suivant',
      'Accéder à ma déclaration',
      'Télécharger l’attestation',
      'Se connecter',
      'Sign in',
      'Annuler',
      'Mon pays'
    ])
      expect(consequential(button(label)), label).toBe(false)
    expect(consequential(link('Mes documents'))).toBe(false)
  })

  it('treats a submit button as committing unless it plainly moves on or searches', () => {
    expect(consequential(button('OK', 'submit'))).toBe(true)
    expect(consequential(button('', 'submit'))).toBe(true)
    expect(consequential(button('Continuer', 'submit'))).toBe(false)
    expect(consequential(button('Valider et continuer', 'submit'))).toBe(true)
    expect(consequential(button('Rechercher', 'submit'))).toBe(false)
    expect(consequential(button('Se connecter', 'submit'))).toBe(false)
  })

  it('says no to a cookie banner without asking, and only that', () => {
    expect(consequential(button('Tout refuser', 'submit'))).toBe(false)
    expect(consequential(button('Continuer sans accepter →'))).toBe(false)
    expect(consequential(button('Tout refuser et payer'))).toBe(true)
    expect(consequential(button('Continuer sans accepter et valider', 'submit'))).toBe(true)
    // What the engine says the click is for still counts.
    expect(consequential(button('Tout refuser'), 'Payer le passage')).toBe(true)
  })

  it('reads what the click is for, too', () => {
    expect(consequential({ role: 'field', type: 'checkbox', label: 'on' })).toBe(false)
    expect(consequential({ role: 'field', type: 'checkbox', label: 'on' }, 'Certifier l’exactitude des informations')).toBe(true)
    expect(consequential(button('Suivant'), 'Envoyer la déclaration')).toBe(true)
  })
})

describe('what binds the user beyond paying: what still asks on a site Marianne’s own services declare', () => {
  const button = (label: string, type = 'submit') => ({ role: 'button', type, label })

  it('signing, sending, declaring, deleting, certifying, subscribing, cancelling a contract, waiving, a direct debit', () => {
    for (const label of [
      'Signer',
      'Signer ma déclaration',
      'Envoyer',
      'Transmettre le dossier',
      'Soumettre',
      'Déposer ma demande',
      'Je déclare',
      'Supprimer',
      'Supprimer le compte',
      'Je certifie sur l’honneur',
      'J’atteste',
      'Je m’engage à payer',
      'Souscrire',
      'M’abonner',
      'Résilier mon contrat',
      'Annuler mon abonnement',
      'Clôturer mon compte',
      'Renoncer au droit de rétractation',
      'Autoriser le prélèvement',
      'Mandat SEPA',
      'Send',
      'Submit',
      'Delete',
      'Remove',
      'Sign',
      'I certify',
      'Subscribe',
      'Unsubscribe',
      'Cancel my subscription',
      'Terminate',
      'Waive'
    ])
      expect(binding(button(label)), label).toBe(true)
  })

  it('not the steps on the way to paying: the toll pages’ searches and buttons, validating, confirming, accepting, saving, paying', () => {
    for (const label of [
      'Vérifier mes péages à payer',
      'PLAQUE D’IMMATRICULATION',
      'VALIDER',
      'CONTINUER',
      'ANNULER',
      'Payer mes trajets',
      'Carte bancaire',
      'Poursuivre vers le paiement',
      'Payer 12,40 €',
      'Confirmer',
      'J’accepte les conditions générales',
      'Enregistrer',
      'OK',
      '',
      'Se connecter',
      'Sign in',
      'Signaler un problème',
      'Télécharger l’attestation',
      'Voir le certificat',
      'Mon abonnement',
      'Accéder à ma déclaration',
      'Sans engagement'
    ])
      expect(binding(button(label)), label).toBe(false)
  })

  it('reads what the click is for, too', () => {
    expect(binding(button('Valider'), 'Envoyer la déclaration')).toBe(true)
    expect(binding(button('Valider'), 'Chercher les passages à payer')).toBe(false)
  })
})

describe('online consents', () => {
  it('covers every site of a folder, or each site of it, as the user chose', () => {
    const c = new Consents()
    expect(c.has('f1', 'impots.gouv.fr', 'folder')).toBe(false)
    c.add('f1', 'impots.gouv.fr')
    expect(c.has('f1', 'caf.fr', 'folder')).toBe(true)
    expect(c.has('f1', 'impots.gouv.fr', 'site')).toBe(true)
    expect(c.has('f1', 'caf.fr', 'site')).toBe(false)
    // Another folder asks again.
    expect(c.has('f2', 'impots.gouv.fr', 'folder')).toBe(false)
    c.clear()
    expect(c.has('f1', 'impots.gouv.fr', 'site')).toBe(false)
  })
})

describe('the sites Marianne knows', () => {
  it('are the content’s public sites, by registrable domain', () => {
    const known = knownSites(SITES.map((s) => s.url))
    expect(known.has('impots.gouv.fr')).toBe(true)
    expect(SITES.filter((s) => !known.has(siteOf(s.url))).map((s) => s.url)).toEqual([])
  })

  it('never a whole hosting service or a public suffix', () => {
    const known = knownSites([
      'https://cfspart.impots.gouv.fr/x',
      'https://mairie.github.io/',
      'https://gouv.fr/',
      'https://www.free.fr/',
      'https://github.io/',
      'nothing'
    ])
    expect([...known].sort()).toEqual(['impots.gouv.fr', 'mairie.github.io'])
  })
})

describe('setup cards', () => {
  it('sends each target to its settings page', () => {
    expect(setupCard('address')).toEqual({ page: 'identity', label: 'votre adresse' })
    expect(setupCard('vehicles')).toEqual({ page: 'household', label: 'vos véhicules' })
    expect(setupCard('account:impots')?.page).toBe('sites')
    expect(setupCard('browser')).toEqual({ page: 'browser', label: 'le navigateur' })
    expect(setupCard('approvals')).toEqual({ page: 'approvals', label: 'vos autorisations' })
    expect(setupCard('payment')).toEqual({ page: 'payment', label: 'vos cartes de paiement' })
    // Légifrance is off by default: turn the source on first.
    expect(setupCard('legifrance')?.page).toBe('data')
    expect(setupCard('account:nowhere')).toBeNull()
    expect(setupCard('elsewhere')).toBeNull()
  })
})

describe('proposals', () => {
  const profile = (): Profile => {
    const p = structuredClone(EMPTY_PROFILE)
    p.address = { street: '12 rue des Olivettes', complement: '', postcode: '44000', city: 'Nantes', inseeCode: '44109', lat: 47.2, lon: -1.5, since: '' }
    p.household = [{ id: 'm1', relation: 'child', firstName: 'Léo', lastName: '', birthDate: '2017-05-02', dependent: true }]
    p.vehicles = [{ id: 'v1', plate: 'GH-482-KX', model: 'Clio', firstRegistration: '2019-05-11', lastInspection: '2025-05-11', critair: '1' }]
    return p
  }

  it('normalizes dates, year ends and booleans', () => {
    expect(normalizeValues('deadline', { date: '5/3/2027' }).date).toBe('2027-03-05')
    expect(normalizeValues('company', { yearEnd: '31/12' }).yearEnd).toBe('12-31')
    expect(normalizeValues('household_member', { dependent: 'oui' }).dependent).toBe('true')
    expect(() => normalizeValues('company', { yearEnd: '31-31' })).toThrow(ToolError)
  })

  it('shows real values with French labels, and adds with a new id', () => {
    const p = plan('deadline', 'add', undefined, { title: 'Répondre à la caf', date: '2027-03-05', domain: 'family' }, profile(), SITES)
    expect(p.title).toBe('Ajouter une échéance')
    expect(p.fields).toEqual([
      { label: 'intitulé', value: 'Répondre à la caf' },
      { label: 'date', value: '05/03/2027' },
      { label: 'domaine', value: 'famille & solidarités' }
    ])
    expect(p.op).toMatchObject({ type: 'deadline', deadline: { title: 'Répondre à la caf', domain: 'family', source: 'agent' } })
    expect(opId(p.op)).toMatch(/\w+/)
  })

  it('updates and deletes entities by id', () => {
    const update = plan('vehicle', 'update', 'v1', { lastInspection: '2027-05-02' }, profile(), SITES)
    expect(update.op).toMatchObject({ type: 'entity', kind: 'vehicles', item: { id: 'v1', plate: 'GH-482-KX', lastInspection: '2027-05-02' } })
    expect(update.fields).toEqual([{ label: 'dernier contrôle technique', value: '02/05/2027' }])
    const remove = plan('vehicle', 'delete', 'v1', {}, profile(), SITES)
    expect(remove.op).toEqual({ type: 'deleteEntity', kind: 'vehicles', id: 'v1' })
    expect(remove.fields).toContainEqual({ label: 'immatriculation', value: 'GH-482-KX' })
    expect(() => plan('vehicle', 'delete', 'v9', {}, profile(), SITES)).toThrow('Ids: v1')
  })

  it('refuses unknown fields, invalid values and missing required fields', () => {
    expect(() => plan('vehicle', 'add', undefined, { plate: 'AB-123-CD', colour: 'red' }, profile(), SITES)).toThrow('Unknown fields')
    expect(() => plan('property', 'add', undefined, { address: 'x', status: 'squatter' }, profile(), SITES)).toThrow('Values: tenant, owner, hosted')
    expect(() => plan('employer', 'add', undefined, { position: 'cuisinier' }, profile(), SITES)).toThrow('Missing required field')
    expect(() => plan('company', 'add', undefined, { siren: '123456789' }, profile(), SITES)).toThrow('Invalid SIREN')
    expect(() => plan('person', 'update', undefined, { nir: '188034410912376' }, profile(), SITES)).toThrow('social security number')
    expect(() => plan('person', 'delete', undefined, {}, profile(), SITES)).toThrow('only be updated')
  })

  it('sets up a site account with the site’s own fields', () => {
    const p = plan('account', 'add', undefined, { siteId: 'impots', tax_number: '3012345678901' }, profile(), SITES)
    expect(p.title).toMatch(/^Configurer votre compte /)
    expect(p.op).toEqual({ type: 'account', account: { siteId: 'impots', fields: { tax_number: '3012345678901' }, since: '' } })
    expect(() => plan('account', 'add', undefined, { siteId: 'impots', tax_number: '42' }, profile(), SITES)).toThrow('Invalid numéro fiscal')
    expect(() => plan('account', 'add', undefined, { siteId: 'nowhere' }, profile(), SITES)).toThrow('Unknown site')
  })

  it('drops the INSEE code and coordinates of a former commune', () => {
    const moved = plan('address', 'update', undefined, { street: '3 place du Capitole', postcode: '31000', city: 'Toulouse' }, profile(), SITES)
    expect(moved.op).toMatchObject({ type: 'address', address: { city: 'Toulouse', inseeCode: '', lat: undefined, lon: undefined } })
    const found = plan('address', 'update', undefined, { street: '3 place du Capitole', postcode: '31000', city: 'Toulouse' }, profile(), SITES, {
      inseeCode: '31555',
      lat: 43.6,
      lon: 1.44
    })
    expect(found.op).toMatchObject({ address: { inseeCode: '31555', lat: 43.6, lon: 1.44 } })
    expect(found.fields).toContainEqual({ label: 'code insee', value: '31555' })
  })

  it('checks who holds an ID document and keeps a member’s fields', () => {
    expect(plan('id_document', 'add', undefined, { type: 'passport', holder: 'm1' }, profile(), SITES).fields).toContainEqual({
      label: 'titulaire',
      value: 'Léo'
    })
    expect(() => plan('id_document', 'add', undefined, { type: 'passport', holder: 'm9' }, profile(), SITES)).toThrow('Unknown holder')
    const member = plan('household_member', 'update', 'm1', { lastName: 'Martin' }, profile(), SITES)
    expect(member.op).toMatchObject({ type: 'member', member: { id: 'm1', firstName: 'Léo', lastName: 'Martin', dependent: true } })
  })
})
