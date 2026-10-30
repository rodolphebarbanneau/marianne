import { LoadingGate } from '@marianne/sdk/view'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

describe('LoadingGate', () => {
  it('shows a bar and holds its children back, laid out but unseen, until they have loaded', () => {
    const html = renderToStaticMarkup(createElement(LoadingGate, { label: 'scrutins', children: createElement('p', null, 'le contenu') }))
    expect(html).toContain('role="status"')
    expect(html).toContain('class="load-gate waiting"')
    expect(html).toContain('<p>le contenu</p>')
  })
})
