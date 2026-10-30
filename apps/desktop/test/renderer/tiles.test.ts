import { readManifest, type ServiceState, type ServiceTile } from '@marianne/sdk'
import { createElement, isValidElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Tile } from '../../src/renderer/src/pages/services/tiles'

// A tile as the Services page draws it: where a click and its button open the service, and what a list shows.

const STATE: ServiceState = {
  manifest: readManifest({
    name: '@marianne/service-infos',
    version: '1.0.0',
    marianne: {
      code: 'infos',
      name: 'Infos',
      description: 'les titres de vos sources',
      category: 'daily',
      hosts: [],
      tabs: [{ id: 'front', label: 'à la une' }]
    }
  }),
  available: true,
  on: true,
  added: true,
  pinned: true,
  tools: [],
  builtIn: true,
  access: { asked: [], granted: null }
}

const LIST: ServiceTile = {
  visual: {
    kind: 'list',
    numbered: true,
    items: [
      { text: 'Budget 2027 : le Sénat adopte les recettes', figure: '6/7', tone: 'live' },
      { text: 'Coup de vent en Bretagne', figure: '4/7' }
    ]
  },
  lines: [{ text: '12 sujets sur vos 7 sources', tone: 'dim' }],
  action: { label: 'voir le sujet', params: { subject: 'b1' } }
}

const props = (tile: ServiceTile | null, onOpen: (params: Record<string, string | number>) => void) => ({
  state: STATE,
  tileState: { tile, at: '2026-10-30T08:00:00.000Z', loading: false },
  now: new Date('2026-10-30T08:05:00.000Z'),
  dragging: false,
  onOpen,
  grip: { onPointerDown: () => undefined, onKeyDown: () => undefined },
  drag: { onDragStart: () => undefined, onDragOver: () => undefined, onDrop: () => undefined, onDragEnd: () => undefined }
})

/** The elements of a tree that match, depth first; a component's own element is a leaf (what it draws isn't called). */
function find(node: unknown, match: (el: ReactElement<Record<string, unknown>>) => boolean): Array<ReactElement<Record<string, unknown>>> {
  if (Array.isArray(node)) return node.flatMap((n) => find(n, match))
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [...(match(node) ? [node] : []), ...find(node.props.children, match)]
}

describe('a tile', () => {
  it('opens its service on its first tab when clicked, or with Entrée, whatever it shows', () => {
    const onOpen = vi.fn()
    const tile = Tile(props(LIST, onOpen))
    ;(tile.props as { onClick: () => void }).onClick()
    const key = { key: 'Enter', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault: () => undefined }
    ;(tile.props as { onKeyDown: (e: unknown) => void }).onKeyDown({ ...key, target: 1, currentTarget: 1 })
    // Entrée on its grip or its button is theirs.
    ;(tile.props as { onKeyDown: (e: unknown) => void }).onKeyDown({ ...key, target: 1, currentTarget: 2 })
    expect(onOpen.mock.calls).toEqual([[{}], [{}]])
  })

  it('opens it elsewhere only from its button, with the action’s params, and without the click reaching the tile', () => {
    const onOpen = vi.fn()
    const [button] = find(Tile(props(LIST, onOpen)), (el) => el.type === 'button' && String(el.props.className).includes('primary'))
    const stopPropagation = vi.fn()
    ;(button.props.onClick as (e: unknown) => void)({ stopPropagation })
    expect(onOpen.mock.calls).toEqual([[{ subject: 'b1' }]])
    expect(stopPropagation).toHaveBeenCalled()
    // An action without params opens the first tab too.
    const plain = vi.fn()
    const [other] = find(
      Tile(props({ ...LIST, action: { label: 'ouvrir' } }, plain)),
      (el) => el.type === 'button' && String(el.props.className).includes('primary')
    )
    ;(other.props.onClick as (e: unknown) => void)({ stopPropagation })
    expect(plain.mock.calls).toEqual([[{}]])
  })

  it('draws a list as numbered rows, each its text and its figure, a live one after the blinking dot', () => {
    const html = renderToStaticMarkup(
      createElement(
        Tile,
        props(LIST, () => undefined)
      )
    )
    expect(html).toContain('<ol class="v-list">')
    expect(html).toContain(
      '<li><span class="n" aria-hidden="true">1</span><span class="t ell tone-live"><span class="dotlive" aria-label="en ce moment"></span>Budget 2027 : le Sénat adopte les recettes</span><span class="f">6/7</span></li>'
    )
    expect(html).toContain(
      '<li><span class="n" aria-hidden="true">2</span><span class="t ell tone-normal">Coup de vent en Bretagne</span><span class="f">4/7</span></li>'
    )
    // Not numbered: the rows alone.
    const bare = renderToStaticMarkup(
      createElement(
        Tile,
        props({ visual: { kind: 'list', items: [{ text: 'TER 8 h 12' }] } }, () => undefined)
      )
    )
    expect(bare).toContain('<li><span class="t ell tone-normal">TER 8 h 12</span></li>')
  })
})
