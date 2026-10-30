import { describe, expect, it } from 'vitest'
import {
  colorDistance,
  cutText,
  isPaletteColor,
  nearestPaletteColor,
  PALETTE,
  PALETTE_REFERENCE,
  paletteValue,
  pictureCells,
  pictureProblems,
  PICTURE_SIZE,
  readTile,
  TILE_LIMITS,
  tileMinutes
} from '../src/index'

describe('the palette', () => {
  it('has six hues at four levels, four greys and black: 29 colours, by name', () => {
    expect(PALETTE).toHaveLength(29)
    expect(PALETTE.slice(0, 4)).toEqual(['bleu-sombre', 'bleu', 'bleu-clair', 'bleu-pale'])
    expect(PALETTE.slice(-5)).toEqual(['gris-sombre', 'gris', 'gris-clair', 'blanc', 'noir'])
    expect(new Set(PALETTE).size).toBe(29)
    expect(isPaletteColor('jaune-pale')).toBe(true)
    expect(isPaletteColor('yellow')).toBe(false)
    expect(paletteValue('cyan-clair')).toBe('var(--palette-cyan-clair)')
  })

  it('draws the painted cells of a picture, transparent ones left out', () => {
    expect(pictureCells({ palette: { r: 'rouge', b: 'bleu' }, pixels: ['r.', '.b'] })).toEqual([
      { x: 0, y: 0, color: 'rouge' },
      { x: 1, y: 1, color: 'bleu' }
    ])
  })

  it('takes a tile’s picture up to 24 × 8, smaller ones too', () => {
    expect(pictureProblems({ palette: { r: 'rouge' }, pixels: ['r'.repeat(24)] }, PICTURE_SIZE)).toEqual([])
    expect(pictureProblems({ palette: { r: 'rouge' }, pixels: ['r'.repeat(25)] }, PICTURE_SIZE)).toEqual(['rows of 25 pixels: the picture is at most 24 × 8'])
    expect(pictureProblems({ palette: { r: 'rouge' }, pixels: Array(9).fill('r') }, PICTURE_SIZE)).toEqual([
      '"pixels" has 9 rows: the picture is at most 24 × 8'
    ])
  })
})

describe('readTile', () => {
  it('keeps a tile within its limits as it is, with nothing to say', () => {
    const tile = {
      value: { text: '12°', unit: 'Rennes · averses à 16 h' },
      visual: { kind: 'bars', bars: [{ value: 14, label: 'jeu', text: '14°', color: 'jaune' }] },
      lines: [{ text: 'vent 25 km/h, rafales 50', tone: 'dim' }],
      params: { commune: '35238' }
    }
    expect(readTile(tile)).toEqual({ tile, problems: [] })
  })

  it('cuts long texts with an ellipsis and drops extra lines, bars and blocks, saying so', () => {
    const { tile, problems } = readTile({
      value: { text: '1 234 567', unit: 'x'.repeat(50) },
      lines: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      visual: { kind: 'blocks', blocks: Array.from({ length: 20 }, () => ({ color: 'vert' })) },
      action: { label: 'payer maintenant sur le site' }
    })
    expect(tile?.value).toEqual({ text: '1 234…', unit: `${'x'.repeat(TILE_LIMITS.unit - 1)}…` })
    expect(tile?.lines).toEqual([{ text: 'a' }, { text: 'b' }])
    expect(tile?.visual?.kind === 'blocks' && tile.visual.blocks).toHaveLength(TILE_LIMITS.blocks)
    expect(tile?.action?.label).toBe('payer maintenan…')
    expect([...(tile?.action?.label ?? '')]).toHaveLength(TILE_LIMITS.action)
    expect(problems).toHaveLength(5)
    expect(problems[0]).toMatch(/value.text is cut to 6 characters/)
  })

  it('leaves out what isn’t right, and never throws', () => {
    const { tile, problems } = readTile({
      title: 'Mairie de Rennes',
      visual: { kind: 'gauge', value: 1.4, color: 'orange' },
      lines: [{ text: 'ouverte', tone: 'green' }, { text: 42 }],
      urgency: 'now',
      params: { when: new Date() }
    })
    expect(tile).toEqual({ title: 'Mairie de Rennes', visual: { kind: 'gauge', value: 1 }, lines: [{ text: 'ouverte' }] })
    expect(problems).toEqual([
      'visual.value (gauge) is held between 0 and 1',
      'visual.color: "orange" is not a colour of the palette',
      'lines[0].tone "green" is not one of normal, dim, accent, ok, bad, live',
      'lines[1].text must be a non-empty string',
      'urgency "now" is not one of none, soon, urgent',
      'params must map names to strings or numbers'
    ])
    expect(() => readTile({ visual: { kind: 'pixels', palette: { r: 'rouge' }, pixels: 'rrr' } })).not.toThrow()
  })

  it('shows the value rather than a title, and blocks may be empty', () => {
    const { tile, problems } = readTile({
      value: { text: '3' },
      title: 'pétitions',
      visual: { kind: 'blocks', blocks: [{ color: null, label: 'lu' }, { color: 'jaune' }] }
    })
    expect(tile).toEqual({ value: { text: '3' }, visual: { kind: 'blocks', blocks: [{ color: null, label: 'lu' }, { color: 'jaune' }] } })
    expect(problems).toEqual(['title is left out: the tile shows its value'])
  })

  it('checks a picture as an icon is, up to 24 × 8', () => {
    const ok = readTile({ visual: { kind: 'pixels', palette: { r: 'rouge', b: 'bleu' }, pixels: ['r.b', 'rrb'] } })
    expect(ok.tile?.visual).toEqual({ kind: 'pixels', palette: { r: 'rouge', b: 'bleu' }, pixels: ['r.b', 'rrb'] })
    const wrong = readTile({ title: 'x', visual: { kind: 'pixels', palette: { r: 'rouge' }, pixels: ['r'.repeat(30)] } })
    expect(wrong.tile).toEqual({ title: 'x' })
    expect(wrong.problems).toEqual(['visual (pixels): rows of 30 pixels: the picture is at most 24 × 8'])
  })

  it('gives the default tile for null, and for a tile that shows nothing', () => {
    expect(readTile(null)).toEqual({ tile: null, problems: [] })
    expect(readTile({ urgency: 'urgent' }).tile).toBeNull()
    expect(readTile('12°')).toEqual({ tile: null, problems: ['tile() must return an object, or null'] })
  })

  it('asks a tile again every 15 minutes by default, every 5 at the most often', () => {
    expect(tileMinutes()).toBe(15)
    expect(tileMinutes(1)).toBe(5)
    expect(tileMinutes(60)).toBe(60)
    expect(tileMinutes(Number.NaN)).toBe(15)
  })
})

describe('a data’s own colours, in the palette', () => {
  it('takes the nearest hue, then its level; a grey for a colour without hue', () => {
    expect(nearestPaletteColor('#3d5afe')).toBe('bleu')
    // A dark navy stays blue rather than turning grey.
    expect(nearestPaletteColor('#1d3a8a')).toBe('bleu-sombre')
    expect(nearestPaletteColor('#ff8000')).toMatch(/^(rouge|jaune)/)
    // A colour without hue takes a light grey, never one that would sink into the dark ground.
    expect(['gris', 'gris-clair', 'blanc']).toContain(nearestPaletteColor('#9e9e9e'))
    expect(nearestPaletteColor('#000000')).toBe('gris')
    expect(nearestPaletteColor('#ffffff')).toBe('blanc')
    expect(nearestPaletteColor('orange')).toBe('gris-clair')
  })

  it('draws each colour from the tokens, as the stylesheet mixes them', () => {
    expect(PALETTE_REFERENCE.bleu).toBe('#3d5afe')
    expect(Object.keys(PALETTE_REFERENCE)).toHaveLength(29)
    expect(Object.values(PALETTE_REFERENCE).every((hex) => /^#[0-9a-f]{6}$/.test(hex))).toBe(true)
    expect(colorDistance('bleu', '#3d5afe')).toBe(0)
    expect(colorDistance('bleu-sombre', 'bleu')).toBeGreaterThan(colorDistance('bleu-clair', 'bleu-pale') / 4)
  })
})

describe('a text too long', () => {
  it('is cut before it is split: a tile of a hundred million characters costs no more than a short one', () => {
    const huge = `${'é'.repeat(50_000_000)} fin`
    const started = Date.now()
    expect(cutText(huge, 40)).toBe(`${'é'.repeat(39)}…`)
    expect(readTile({ title: huge }).tile?.title).toHaveLength(TILE_LIMITS.title)
    expect(Date.now() - started).toBeLessThan(1000)
    expect(cutText('  deux   mots  ', 40)).toBe('deux mots')
  })
})
