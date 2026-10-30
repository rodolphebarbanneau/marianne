import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PALETTE, PALETTE_HUES, PALETTE_MIX, PALETTE_TOKENS } from '@marianne/sdk'
import { describe, expect, it } from 'vitest'

/** The palette the SDK describes is the one Marianne's stylesheet draws: same tokens, same mixes, every colour defined. */

const css = readFileSync(join(__dirname, '../src/renderer/src/styles.css'), 'utf8')
/** The first `:root { … }` block: the default theme. */
const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(root)?.[1]?.toLowerCase()

describe('the Marianne palette, in the stylesheet', () => {
  it('has the tokens the SDK mixes it from', () => {
    for (const [name, hex] of Object.entries(PALETTE_TOKENS)) expect(token(name), name).toBe(hex)
  })

  it('defines every colour, each level mixed as the SDK says', () => {
    for (const color of PALETTE) expect(css, color).toMatch(new RegExp(`--palette-${color}:`))
    for (const hue of PALETTE_HUES)
      for (const [level, [other, share]] of Object.entries(PALETTE_MIX))
        expect(css).toContain(`--palette-${hue}-${level}: color-mix(in srgb, var(--${hue}) ${Math.round(share * 100)}%, var(--${other}));`)
  })
})
