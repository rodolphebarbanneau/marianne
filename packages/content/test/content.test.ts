import { describe, expect, it } from 'vitest'
import { ContentError, officialHost, readContent, splitFrontMatter, urlProblem } from '../src/index'
import { minimal } from './fixtures'

/** The problems readContent finds in a set of files. */
function problems(files: Record<string, string>): string[] {
  try {
    readContent(files)
  } catch (err) {
    if (err instanceof ContentError) return err.problems
    throw err
  }
  return []
}

/** The fixture, with one file's text changed. */
const edited = (path: string, change: (text: string) => string) => {
  const files = minimal()
  files[path] = change(files[path])
  return files
}

describe('front matter', () => {
  it('reads one key per line, then the body, whatever the line endings', () => {
    expect(splitFrontMatter('---\r\nname: x\r\ntitle: Un titre : deux points\r\n---\r\n# Corps\r\n')).toEqual({
      meta: { name: 'x', title: 'Un titre : deux points' },
      body: '# Corps\n',
      errors: []
    })
    expect(splitFrontMatter('# Pas de front matter')).toBeNull()
  })

  it('reports lines it cannot read and keys given twice', () => {
    expect(splitFrontMatter('---\nname: x\n- a list\nname: y\n---\n')?.errors).toEqual(['"- a list" is not "key: value"', 'name: given twice'])
  })
})

describe('official sites', () => {
  it('takes gouv.fr and the official domains, with their subdomains', () => {
    for (const host of ['www.impots.gouv.fr', 'cfspart.impots.gouv.fr', 'www.ameli.fr', 'ameli.fr', 'citoyens.telerecours.fr', 'www.service-public.fr'])
      expect(officialHost(host), host).toBe(true)
    for (const host of ['gouv.fr.example.com', 'ameli.fr.example.com', 'faux-ameli.fr', 'www.lemonde.fr', 'impots-gouv.fr'])
      expect(officialHost(host), host).toBe(false)
  })

  it('wants https, on an official site unless any host will do', () => {
    expect(urlProblem('https://www.impots.gouv.fr/accueil')).toBeNull()
    expect(urlProblem('http://www.impots.gouv.fr')).toMatch('is not https')
    expect(urlProblem('https://www.example.com')).toMatch('is not on an official site')
    expect(urlProblem('https://user:secret@www.impots.gouv.fr')).toMatch('carries credentials')
    expect(urlProblem('www.impots.gouv.fr')).toMatch('is not a URL')
    expect(urlProblem('https://www.lemonde.fr/rss', true)).toBeNull()
    expect(urlProblem('http://www.lemonde.fr/rss', true)).toMatch('is not https')
  })
})

describe('reading the content', () => {
  it('reads skills, démarches with every kind of action, dates, sites and news sources', () => {
    const c = readContent(minimal())
    expect(c.updated).toBe('2026-10-25')
    expect(c.skills).toEqual([
      expect.objectContaining({ name: 'fines', title: 'Amendes', sources: ['F18509', 'https://www.antai.gouv.fr'], updated: '2026-10-20', owner: 'marianne' })
    ])
    expect(c.skills[0]).not.toHaveProperty('verified')
    const p = c.procedures[0]
    expect(p).toMatchObject({ id: 'contest-fine', domain: 'mobility', when: 'dans les 45 jours', duration: '', documents: ['l’avis', 'vos justificatifs'] })
    expect(p).toMatchObject({ owner: 'someone-else', verified: '2026-10-26' })
    expect(p.steps[0]).toEqual({
      title: 'Lire l’avis',
      body: 'Repérez la date.',
      actions: [
        { kind: 'document', target: 'letter', label: 'Ajouter l’avis' },
        { kind: 'sheet', target: 'F18509', label: 'Lire la fiche' },
        { kind: 'setup', target: 'account:antai', label: 'Renseigner mon compte' }
      ]
    })
    expect(p.steps[1].actions.map((a) => `${a.kind} ${a.target}`)).toEqual([
      'open antai',
      'open https://www.antai.gouv.fr/contester',
      'ask Comment contester ?',
      'service peage'
    ])
    expect(c.calendar).toEqual([
      { id: 'fines', domain: 'mobility', title: 'payer', monthDay: '02-29', applies: 'always', site: 'antai', procedure: 'contest-fine' }
    ])
    expect(c.sites.map((s) => s.id)).toEqual(['antai', 'ameli'])
    expect(c.sites[1]).toMatchObject({ fields: [{ key: 'ameli_id', label: 'identifiant', pattern: '^[0-9]+$' }], needsNir: true })
    expect(c.newsSources).toEqual([
      { id: 'press', name: 'La Presse', group: 'national', feed: 'https://www.presse.example/rss', homepage: 'https://www.presse.example' }
    ])
  })

  it('sorts skills by name and démarches by title', () => {
    const files = minimal()
    files['skills/appeals.md'] = files['skills/fines.md'].replace('name: fines', 'name: appeals')
    files['procedures/mobility/appeal.md'] = files['procedures/mobility/contest-fine.md']
      .replace('id: contest-fine', 'id: appeal')
      .replace('title: Contester une amende', 'title: Appel')
    const c = readContent(files)
    expect(c.skills.map((s) => s.name)).toEqual(['appeals', 'fines'])
    expect(c.procedures.map((p) => p.id)).toEqual(['appeal', 'contest-fine'])
  })

  it('lists every problem, with its file and field', () => {
    const files = minimal()
    files['skills/fines.md'] = files['skills/fines.md']
      .replace('name: fines', 'name: amendes')
      .replace('sources: F18509; https://www.antai.gouv.fr', 'sources: F18509; https://www.example.com; F18509')
      .replace('updated: 2026-10-20', 'updated: 20/10/2026\nreviewer: x')
    files['procedures/taxes/contest-fine.md'] = files['procedures/mobility/contest-fine.md']
    delete files['procedures/mobility/contest-fine.md']
    files['notes.txt'] = 'x'
    delete files['news-sources.json']
    expect(problems(files)).toEqual([
      'notes.txt: not a content file: skills/<name>.md, procedures/<domain>/<id>.md, calendar.json, sites.json or news-sources.json',
      'procedures/taxes/contest-fine.md: domain: must be its folder\'s, "taxes"',
      'skills/fines.md: reviewer: unknown key (expected: name, title, description, sources, updated, owner, verified)',
      'skills/fines.md: name: must be the file\'s name, "fines"',
      'skills/fines.md: sources: "https://www.example.com" is not on an official site (gouv.fr, or a domain of OFFICIAL_DOMAINS)',
      'skills/fines.md: sources: "F18509" is listed twice',
      'skills/fines.md: updated: "20/10/2026" is not a date (YYYY-MM-DD)',
      'news-sources.json: missing'
    ])
  })

  it('checks the metadata', () => {
    expect(problems(edited('skills/fines.md', (t) => t.replace(/^sources: .*\n/m, '').replace('owner: marianne', 'owner: -x-')))).toEqual([
      'skills/fines.md: sources: at least one is required: a Service-Public id (F18509) or an official https URL',
      'skills/fines.md: owner: "-x-" is not a name (marianne, or a GitHub handle)'
    ])
    expect(problems(edited('procedures/mobility/contest-fine.md', (t) => t.replace('verified: 2026-10-26', 'verified: yes')))).toEqual([
      'procedures/mobility/contest-fine.md: verified: "yes" is not a date (YYYY-MM-DD)'
    ])
    expect(problems(edited('skills/fines.md', (t) => t.replace('sources: F18509;', 'sources: F18509; service-public;')))).toEqual([
      'skills/fines.md: sources: "service-public" is neither a Service-Public id (F18509) nor a URL'
    ])
  })

  it('checks the steps and their actions', () => {
    const files = edited('procedures/mobility/contest-fine.md', (t) =>
      t
        .replace('Repérez la date.', 'Repérez la date sur http://www.antai.gouv.fr ou https://www.example.com/aide.')
        .replace('> sheet: F18509 | Lire la fiche', '> sheet: 18509 | Lire la fiche\n> link: x | y\n> https://www.antai.gouv.fr')
        .replace('> setup: account:antai | Renseigner mon compte', '> setup: account:cerfa | Renseigner\n> document: Avis')
        .replace('> open: antai | Ouvrir l’ANTAI', '> open: www.antai.gouv.fr | Ouvrir l’ANTAI')
        .replace('> service: peage | Ouvrir 3615 PEAGE', '> service: Péage | Ouvrir')
    )
    expect(problems(files)).toEqual([
      'procedures/mobility/contest-fine.md: step 1 "Lire l’avis": sheet: "18509" is not a Service-Public id (F18509)',
      'procedures/mobility/contest-fine.md: step 1 "Lire l’avis": unknown action "link:" (expected: open, setup, document, ask, sheet, service)',
      'procedures/mobility/contest-fine.md: step 1 "Lire l’avis": document: Avis: no label (> document: target | label)',
      'procedures/mobility/contest-fine.md: step 1 "Lire l’avis": document: "Avis" is not a document type (tax_notice, letter…)',
      'procedures/mobility/contest-fine.md: step 1 "Lire l’avis": "http://www.antai.gouv.fr" is not https',
      'procedures/mobility/contest-fine.md: step 1 "Lire l’avis": "https://www.example.com/aide" is not on an official site (gouv.fr, or a domain of OFFICIAL_DOMAINS)',
      'procedures/mobility/contest-fine.md: step 2 "Contester": open: "www.antai.gouv.fr" is neither a site id nor an https URL',
      'procedures/mobility/contest-fine.md: step 2 "Contester": service: "Péage" is not a service code (lowercase letters and digits)',
      'procedures/mobility/contest-fine.md: step 1 "Lire l’avis": setup: "cerfa" is not a site of sites.json'
    ])
  })

  it('wants at least two steps, and nothing before the first one', () => {
    const files = edited('procedures/mobility/contest-fine.md', (t) =>
      t.replace('## Lire l’avis\nRepérez la date.', 'Introduction.\n## Lire l’avis').replace(/## Contester[\s\S]*$/, '')
    )
    expect(problems(files)).toEqual([
      'procedures/mobility/contest-fine.md: body: text before the first step (## Title) is never shown',
      'procedures/mobility/contest-fine.md: steps: a guided démarche has at least two steps (## Title)'
    ])
  })

  it('checks the catalogs', () => {
    const files = minimal()
    files['calendar.json'] = JSON.stringify({
      updated: '2026-10-01',
      items: [
        { id: 'a', domain: 'taxes', title: 'x', monthDay: '02-30', applies: 'tenant', procedure: 'nowhere', site: 'nowhere', indicative: 'yes' },
        { id: 'a', domain: 'impots', title: 'x', monthDay: '12-01', applies: 'always', source: 'https://www.example.com', color: 'red' }
      ]
    })
    files['sites.json'] = JSON.stringify({
      updated: '2026-10-01',
      sites: [
        { id: 'antai', name: 'ANTAI', url: 'https://www.antai.gouv.fr', domain: 'mobility', login: 'none', description: 'amendes' },
        {
          id: 'antai',
          name: '',
          url: 'https://www.antai.example',
          domain: 'mobility',
          login: 'sso',
          description: 'x',
          fields: [{ key: 'A', label: 'x', pattern: '(' }]
        }
      ]
    })
    files['news-sources.json'] = JSON.stringify({
      updated: '2026-10',
      sources: [{ id: 'press', name: 'La Presse', group: 'local', feed: 'http://www.presse.example/rss', homepage: 'https://www.presse.example' }]
    })
    expect(problems(files)).toEqual([
      'sites.json: sites[1] (antai).name: must be text',
      'sites.json: sites[1] (antai).url: "https://www.antai.example" is not on an official site (gouv.fr, or a domain of OFFICIAL_DOMAINS)',
      'sites.json: sites[1] (antai).login: "sso" is not one of franceconnect, account, none',
      'sites.json: sites[1] (antai).fields[0].key: "A" is not a key (lowercase letters, digits and _)',
      'sites.json: sites[1] (antai).fields[0].pattern: "(" is not a regular expression',
      'sites.json: sites: id "antai" is used twice',
      'news-sources.json: updated: "2026-10" is not a date (YYYY-MM-DD)',
      'news-sources.json: sources[0] (press).group: "local" is not one of national, regional, broadcast, factcheck',
      'news-sources.json: sources[0] (press).feed: "http://www.presse.example/rss" is not https',
      'calendar.json: items[0] (a).monthDay: "02-30" is not a day of the year (MM-DD)',
      'calendar.json: items[0] (a).applies: "tenant" is not one of always, owner, company',
      'calendar.json: items[0] (a).indicative: must be true or false',
      'calendar.json: items[0] (a).site: "nowhere" is not a site of sites.json',
      'calendar.json: items[0] (a).procedure: "nowhere" is not a guided démarche',
      'calendar.json: items[1] (a).color: unknown key (expected: id, domain, title, monthDay, applies, indicative, site, procedure, source)',
      'calendar.json: items[1] (a).domain: "impots" is not one of identity, family, health, taxes, work, retirement, housing, mobility, justice, business',
      'calendar.json: items[1] (a).source: "https://www.example.com" is not on an official site (gouv.fr, or a domain of OFFICIAL_DOMAINS)',
      'calendar.json: items: id "a" is used twice'
    ])
  })

  it('refuses catalogs that are not JSON objects', () => {
    expect(problems({ ...minimal(), 'sites.json': '{ "sites": [' })[0]).toMatch(/^sites\.json: not JSON: /)
    expect(problems({ ...minimal(), 'calendar.json': '[]' })).toEqual(['calendar.json: must be an object: { "updated", "note", "items" }'])
  })

  it('says how many problems there are', () => {
    expect(() => readContent({})).toThrow(/^3 problems in the content:\n- calendar\.json: missing\n/)
  })
})
