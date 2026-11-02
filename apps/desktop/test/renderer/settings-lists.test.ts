import { EMPTY_PROFILE, type DocumentMeta, type Profile } from '@marianne/profile'
import { describe, expect, it } from 'vitest'
import type { Site } from '../../src/shared/sites'
import { routeTarget } from '../../src/renderer/src/app/routes'
import { documentWords, filterDocuments, filterSites, frDate, listing, settableSites, siteState } from '../../src/renderer/src/settings/lists'
import { SETTINGS_PAGES, settingsTarget, tokenPage } from '../../src/renderer/src/settings/pages'

describe('the settings pages', () => {
  it('keep each page once, the application’s and the user’s only', () => {
    const ids = SETTINGS_PAGES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('services')
    expect(ids).toEqual(expect.arrayContaining(['identity', 'contact', 'assets', 'money', 'leaning', 'themes', 'sources', 'web', 'access']))
  })

  it('send an old link where what it showed is now', () => {
    expect(settingsTarget('identity#sources')).toEqual({ page: 'sources', section: '' })
    expect(settingsTarget('payment')).toEqual({ page: 'money', section: '' })
    expect(settingsTarget('browser')).toEqual({ page: 'web', section: '' })
    expect(settingsTarget('privacy')).toEqual({ page: 'access', section: '' })
    expect(settingsTarget('household')).toEqual({ page: 'household', section: '' })
    expect(settingsTarget('nowhere')).toEqual({ page: 'identity', section: '' })
  })

  it('open the page where a value the profile lacks is set', () => {
    const siteFields = ['tax_number', 'caf_number']
    const page = (token: string) => tokenPage(token, siteFields)
    expect(['last_name', 'first_names', 'birth_date', 'nir', 'id_document.passport.number'].map(page)).toEqual(Array(5).fill('identity'))
    expect(['phone', 'email', 'address'].map(page)).toEqual(['contact', 'contact', 'contact'])
    expect(page('iban')).toBe('money')
    expect(page('household.2.first_name')).toBe('household')
    expect(page('household.2.id_document.identity_card.number')).toBe('identity')
    expect(['company.1.siren', 'employer.1.name', 'vehicle.1.plate', 'property.1.address'].map(page)).toEqual(Array(4).fill('assets'))
    expect(page('tax_number')).toBe('sites')
    expect(page('something_else')).toBe('identity')
    // Every page it opens is one of the dialog's.
    for (const t of ['iban', 'phone', 'household.1.first_name', 'vehicle.1.plate', 'tax_number']) expect(SETTINGS_PAGES.map((p) => p.id)).toContain(page(t))
  })

  it('send Réglages › Services, which went, to the Services page', () => {
    expect(routeTarget('settings/services')).toEqual({ kind: 'view', view: { kind: 'page', page: 'services' } })
    expect(routeTarget('settings:sources')).toEqual({ kind: 'settings', page: 'sources', section: '' })
  })
})

describe('the lists’ words', () => {
  it('write dates the French way, and a missing one as a dash', () => {
    expect(frDate('2021-04-12')).toBe('12/04/2021')
    expect(frDate('2021-04-12T10:00:00Z')).toBe('12/04/2021')
    expect(frDate('')).toBe('—')
    expect(frDate(undefined)).toBe('—')
  })

  it('list words with commas and a last « et »', () => {
    expect(listing(['PARLEMENT'])).toBe('PARLEMENT')
    expect(listing(['INFOS', 'PARLEMENT'])).toBe('INFOS et PARLEMENT')
    expect(listing(['a', 'b', 'c'])).toBe('a, b et c')
  })
})

const doc = (id: string, more: Partial<DocumentMeta> = {}): DocumentMeta => ({
  id,
  domain: 'taxes',
  title: id,
  type: 'other',
  date: '',
  entity: '',
  fileName: `${id}.pdf`,
  mime: 'application/pdf',
  size: 1000,
  addedAt: '2026-01-01T10:00:00.000Z',
  ...more
})

describe('Réglages › Documents', () => {
  const docs = [
    doc('avis', { title: 'Avis d’impôt 2026', type: 'tax_notice', date: '2026-08-28', folderId: 'f-impots' }),
    doc('bail', { title: 'Bail du logement', domain: 'housing', type: 'contract', date: '2022-09-01', entity: 'p1' }),
    doc('releve', {
      title: 'Relevé de passages',
      domain: 'mobility',
      type: 'statement',
      addedAt: '2026-10-28T08:00:00.000Z',
      folderId: 'f-peage',
      entity: 'v1'
    })
  ]
  const folders: Record<string, string> = { 'f-impots': 'Déclaration de revenus', 'f-peage': 'Péages en flux libre' }
  const entities: Record<string, string> = { p1: '12 rue Sainte-Catherine', v1: 'AB-123-CD' }
  const words = documentWords((d) => [d.folderId && folders[d.folderId], entities[d.entity]])
  const ids = (list: DocumentMeta[]) => list.map((d) => d.id)
  const all = { query: '', place: 'all' as const, domain: 'all' }

  it('show every document, the latest first, by its own date or else when it was added', () => {
    expect(ids(filterDocuments(docs, all, words))).toEqual(['releve', 'avis', 'bail'])
  })

  it('keep those of a folder, or those of none', () => {
    expect(ids(filterDocuments(docs, { ...all, place: 'folder' }, words))).toEqual(['releve', 'avis'])
    expect(ids(filterDocuments(docs, { ...all, place: 'loose' }, words))).toEqual(['bail'])
  })

  it('keep a domain’s', () => {
    expect(ids(filterDocuments(docs, { ...all, domain: 'housing' }, words))).toEqual(['bail'])
  })

  it('find a document by its title, its type, its file, its folder or what it is linked to, accents aside', () => {
    expect(ids(filterDocuments(docs, { ...all, query: 'impot' }, words))).toEqual(['avis'])
    expect(ids(filterDocuments(docs, { ...all, query: 'contrat' }, words))).toEqual(['bail'])
    expect(ids(filterDocuments(docs, { ...all, query: 'releve.pdf' }, words))).toEqual(['releve'])
    expect(ids(filterDocuments(docs, { ...all, query: 'péages' }, words))).toEqual(['releve'])
    expect(ids(filterDocuments(docs, { ...all, query: 'AB-123' }, words))).toEqual(['releve'])
    expect(ids(filterDocuments(docs, { ...all, query: 'nulle part' }, words))).toEqual([])
  })
})

describe('Réglages › Sites et API', () => {
  const site = (id: string, more: Partial<Site>): Site =>
    ({ id, name: id, url: `https://${id}.gouv.fr`, domain: 'taxes', login: 'none', description: '', ...more }) as Site
  const sites = [
    site('impots', { login: 'account', fields: [{ key: 'tax', label: 'numéro fiscal' }] }),
    site('ameli', { domain: 'health', login: 'account', needsNir: true }),
    site('retraite', { domain: 'retirement', login: 'franceconnect', needsNir: true }),
    site('ants', { domain: 'identity', login: 'franceconnect' }),
    site('cadastre', { domain: 'housing', login: 'none' })
  ]
  const profile = (): Profile => structuredClone(EMPTY_PROFILE)

  it('list the sites where Marianne keeps something: an identifier, numbers, the social security number they need', () => {
    expect(settableSites(sites).map((s) => s.id)).toEqual(['impots', 'ameli', 'retraite'])
  })

  it('say what is given and what is left to give', () => {
    const p = profile()
    p.accounts = [{ siteId: 'impots', fields: { tax: '0123456789012' }, since: '2026-01-01' }]
    expect(siteState(sites[0], p, true)).toEqual({ login: true, numbers: [{ label: 'numéro fiscal', given: true }], done: true })
    expect(siteState(sites[0], p, false).done).toBe(false)
    expect(siteState(sites[1], p, true)).toEqual({ login: true, numbers: [{ label: 'n° de sécurité sociale', given: false }], done: false })
    p.person.nir = '288053306304217'
    expect(siteState(sites[1], p, true).done).toBe(true)
    // FranceConnect's: no identifier to keep, only the number it needs.
    expect(siteState(sites[2], p, false)).toEqual({ login: false, numbers: [{ label: 'n° de sécurité sociale', given: true }], done: true })
  })

  it('find a site by its name or its address, and keep those set up or those left to set up', () => {
    const p = profile()
    p.person.nir = '288053306304217'
    const rows = settableSites(sites).map((s) => ({ site: s, state: siteState(s, p, s.id === 'impots') }))
    expect(filterSites(rows, 'ameli.gouv', 'all').map((r) => r.site.id)).toEqual(['ameli'])
    expect(filterSites(rows, '', 'done').map((r) => r.site.id)).toEqual(['retraite'])
    expect(filterSites(rows, '', 'todo').map((r) => r.site.id)).toEqual(['impots', 'ameli'])
  })
})
