import { DOMAIN_CATEGORIES, DOMAINS, type Deadline } from '@marianne/profile'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TodoSources } from '../../src/renderer/src/lib/demarches'
import { Sommaire } from '../../src/renderer/src/pages/demarches/sommaire'

/**
 * The sommaire of Démarches: each category a group of its own under its heading, so that hovering
 * any of its rows can light the heading (a cell spanning the group belonged to its first row alone),
 * and each domain on two lines: its name, then its state or what it covers.
 */

const none: TodoSources = { folders: [], deadlines: [], documents: [], tasks: [], services: [] }
const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
const render = (sources: TodoSources = none, typed: number | null = null) =>
  renderToStaticMarkup(createElement(Sommaire, { sources, services: [], typed, onOpen: () => undefined }))

describe('the sommaire', () => {
  it('groups the domains by category, each under a heading row of its own, with no cell spanning rows', () => {
    const html = render()
    expect(html.match(/<tbody class="dm-grp">/g)).toHaveLength(DOMAIN_CATEGORIES.length)
    for (const category of DOMAIN_CATEGORIES) expect(html).toContain(`<th scope="rowgroup">${category.label}</th>`)
    expect(html).not.toContain('rowSpan')
    expect(html).not.toContain('rowspan')
    expect(html.match(/aria-label="ouvrir /g)).toHaveLength(DOMAINS.length)
  })

  it('puts under an idle domain what it covers, and under a busy one what is coming', () => {
    const taxes = DOMAINS.find((d) => d.id === 'taxes')!
    const identity = DOMAINS.find((d) => d.id === 'identity')!
    const deadline: Deadline = { key: 'k', domain: 'taxes', title: 'Taxe foncière', date: soon, source: 'rule', status: 'todo' }
    const html = render({ ...none, deadlines: [deadline] })
    expect(html).toContain(identity.description)
    expect(html).not.toContain('rien en cours')
    const taxesRow = html.slice(html.indexOf(`ouvrir ${taxes.label.replace(/&/g, '&amp;')}`))
    expect(taxesRow.slice(0, taxesRow.indexOf('</tr>'))).toContain('Taxe foncière')
  })

  it('lights the row of the number typed', () => {
    const html = render(none, 3)
    const third = DOMAINS.find((d) => d.num === 3)!
    expect(html).toMatch(new RegExp(`<tr class="[^"]*\\bsel\\b[^"]*" tabindex="0" aria-label="ouvrir ${third.label.replace(/&/g, '&amp;')}"`))
  })
})
