import { readContent } from '@marianne/content'
import { files } from '@marianne/content/files'
import { describe, expect, it } from 'vitest'
import { publicHosts } from '../src/shared/sites'

describe('public hosts', () => {
  it('includes the sites given, the sources and the institutions', () => {
    const hosts = publicHosts([
      ...readContent(files).sites,
      { id: 'x', name: 'x', url: 'https://www.mairie-exemple.fr/a', domain: 'identity', description: '', login: 'none' }
    ])
    expect(hosts).toContain('www.impots.gouv.fr')
    expect(hosts).toContain('www.legifrance.gouv.fr')
    expect(hosts).toContain('www.conseil-etat.fr')
    expect(hosts).toContain('www.mairie-exemple.fr')
  })
})
