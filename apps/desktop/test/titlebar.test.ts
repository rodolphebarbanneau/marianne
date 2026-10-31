import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** macOS's window buttons sit over the sidebar's column: what the column holds goes past them, and the column stays above the sidebar. */

const css = readFileSync(join(__dirname, '../src/renderer/src/styles.css'), 'utf8')
const windows = readFileSync(join(__dirname, '../src/main/windows.ts'), 'utf8')
/** The declarations of the first rule with exactly this selector. */
const rule = (selector: string) => css.split(`\n${selector} {\n`)[1]?.split('\n}')[0] ?? ''

describe("the title bar, with the window's buttons at its start", () => {
  it('learns their room from the system, which gives none in full screen', () => {
    expect(windows).toContain('titleBarOverlay: isMac ? true :')
    expect(css).toContain('--titlebar-start: env(titlebar-area-x, 0px);')
  })

  it('leaves the column above the sidebar, as wide as it', () => {
    expect(rule('.titlebar')).not.toContain('padding-left')
    expect(rule('.brand')).toContain('width: max(var(--side-w), var(--side-min));')
    expect(rule('.side')).toContain('width: max(var(--side-w), var(--side-min));')
  })

  it('moves what the column holds past them, with or without the sidebar button', () => {
    expect(rule('.brand')).toContain('padding: 0 8px 0 calc(6px + var(--titlebar-start));')
    expect(css).toMatch(/\.app\.bare \.brand \{\s+padding-left: calc\(15px \+ var\(--titlebar-start\)\);/)
  })
})
