// Generates the app icons, and the website's (no dependencies): node scripts/generate-icons.mjs
// Design: a Minitel screen tile, deep navy with a faint dot matrix, showing a mosaic "M" (Videotex
// blocks with a hairline gap, like the "disjoint" mosaic mode) in the French colours: blue left stem,
// white V, red right stem. Each size is laid out on whole pixels, and the Windows .ico / macOS .icns
// carry one image per size.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------- design

/** The "M", on a grid of mosaic blocks. */
const GLYPH = ['W.....W', 'WW...WW', 'W.W.W.W', 'W..W..W', 'W.....W', 'W.....W']
/** A narrower "M" for tiles too small to give the full one 2px blocks and a margin (16px). */
const SMALL_GLYPH = ['W...W', 'WW.WW', 'W.W.W', 'W...W', 'W...W']
const COLS = GLYPH[0].length
const ROWS = GLYPH.length

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const TILE = hex('#0a0f2e')
const DOT = hex('#1b2560')
const WHITE = hex('#f2f4ff')
// Lighter than the UI's blue (#3d5afe): on the navy tile it contrasts as much as the red (5:1).
const BLUE = hex('#5b78ff')
const RED = hex('#ff4757')

/**
 * Block layout at `size`: whole-pixel blocks, the glyph exactly centered. Small sizes drop the gap
 * between blocks (it would eat the strokes) and the dot matrix. The full glyph needs 2px blocks at
 * least; where those would fill more than 3/4 of the tile, the narrower one keeps the "M" off its
 * edges. The in-app logo (src/renderer/src/components/logo.tsx) follows this same layout.
 */
function layout(size, { glyph = 2 * COLS <= size * 0.75 ? GLYPH : SMALL_GLYPH, fill = 0.66 } = {}) {
  const cols = glyph[0].length
  const rows = glyph.length
  const block = Math.max(2, Math.floor((size * fill) / cols))
  const gap = block >= 6 ? Math.max(1, Math.round(block * 0.1)) : 0
  // The last block's gap is not part of the "M". And whole pixels can't split an odd margin
  // evenly: then the middle column (the tip of the V) and the bottom row (the stems' feet) give up
  // a pixel, so the "M" sits exactly in the middle at every size.
  const trimX = (size - (block * cols - gap)) % 2
  const trimY = (size - (block * rows - gap)) % 2
  const ox = (size - (block * cols - gap - trimX)) / 2
  const oy = (size - (block * rows - gap - trimY)) / 2
  const mid = (cols - 1) / 2
  const rects = []
  glyph.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== 'W') return
      const color = x === 0 ? BLUE : x === cols - 1 ? RED : WHITE
      const left = ox + x * block - (x > mid ? trimX : 0)
      rects.push([color, left, oy + y * block, block - gap - (x === mid ? trimX : 0), block - gap - (y === rows - 1 ? trimY : 0)])
    })
  )
  return { rects, dots: size >= 96 }
}

// ---------------------------------------------------------------- rendering

/**
 * Coverage of a rounded square tile (4×4 supersampled; the glyph itself is pixel-exact). Its margin
 * is whole pixels, so only the corners are soft: a fractional one leaves a faint half-transparent
 * line along each side, which looks frayed at tray sizes.
 */
function tileCoverage(size, m, x, y) {
  const r = size * 0.18
  let hits = 0
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      const px = x + (sx + 0.5) / 4
      const py = y + (sy + 0.5) / 4
      const qx = Math.abs(px - size / 2) - (size / 2 - m - r)
      const qy = Math.abs(py - size / 2) - (size / 2 - m - r)
      if (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0) hits++
    }
  }
  return hits / 16
}

/**
 * The tray's tile fills its whole slot and carries the narrow "M" in bigger blocks: with the app
 * icon's margin and thin strokes, it looked smaller than the icons next to it (3px strokes instead of
 * 2 at 20px, 125 %).
 */
const TRAY = { margin: 0, glyph: SMALL_GLYPH, fill: 0.84 }

function render(size, { margin = Math.round(size * 0.04), ...options } = {}) {
  const { rects, dots } = layout(size, options)
  const rgba = Buffer.alloc(size * size * 4)
  const pitch = Math.max(4, Math.round(size / 64))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = tileCoverage(size, margin, x, y)
      if (!a) continue
      const dot = dots && x % pitch === pitch >> 1 && y % pitch === pitch >> 1
      rgba.set([...(dot ? DOT : TILE), Math.round(a * 255)], (y * size + x) * 4)
    }
  }
  // The glyph keeps the tile's alpha: nothing of it can show outside the rounded square.
  for (const [color, x, y, w, h] of rects) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) rgba.set(color, (yy * size + xx) * 4)
  }
  return png(size, rgba)
}

// The archive's document icon: a page with a folded corner, the tile's navy and the same mosaic "M".
// A light edge sets the page apart on dark folders; on light ones, its navy does.
const EDGE = hex('#9aa6e8')
const FLAP = hex('#2c3a8f')

function renderDocument(size) {
  const w = Math.round(size * 0.76)
  const h = Math.round(size * 0.94)
  const x0 = Math.floor((size - w) / 2)
  const y0 = Math.floor((size - h) / 2)
  const fold = Math.max(3, Math.round(w * 0.3))
  const fx = x0 + w - fold
  const edge = Math.max(1, Math.round(size / 64))
  const pitch = Math.max(4, Math.round(size / 64))
  // Which part of the page a point is in: 0 outside (and the corner folded away), 1 the edge, 2 the flap, 3 the page.
  const part = (px, py) => {
    if (px < x0 || px >= x0 + w || py < y0 || py >= y0 + h) return 0
    const corner = px >= fx && py < y0 + fold
    const beyond = px - fx - (py - y0) // > 0 past the fold's diagonal
    if (corner && beyond > 0) return 0
    const inset = Math.min(px - x0, x0 + w - px, py - y0, y0 + h - py, corner ? -beyond / Math.SQRT2 : Infinity)
    if (inset < edge || (corner && (px - fx < edge || y0 + fold - py < edge))) return 1
    return corner ? 2 : 3
  }
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fill = size >= 96 && x % pitch === pitch >> 1 && y % pitch === pitch >> 1 ? DOT : TILE
      const colors = [null, EDGE, FLAP, fill]
      const sum = [0, 0, 0]
      let hits = 0
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const c = colors[part(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)]
          if (!c) continue
          hits++
          for (let i = 0; i < 3; i++) sum[i] += c[i]
        }
      }
      if (hits) rgba.set([...sum.map((s) => Math.round(s / hits)), Math.round((hits / 16) * 255)], (y * size + x) * 4)
    }
  }
  // The "M" laid out as on a tile as wide as the page, below the fold.
  const g = w
  const ox = x0 + Math.floor((w - g) / 2)
  const oy = Math.min(y0 + h - g, Math.max(y0 + fold, Math.round(y0 + h * 0.56 - g / 2)))
  for (const [color, x, y, rw, rh] of layout(g).rects) {
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) rgba.set([...color, 255], ((oy + yy) * size + ox + xx) * 4)
  }
  return png(size, rgba)
}

// A service file's icon, for .3615 files: the floppy of the Services page (its blue case, white
// shutter and yellow label) in the same mosaic blocks as the "M", on the tile's navy, which shows
// in the gaps between blocks and inside the case. Its cut corner is the only part left clear.
const FILE_GLYPH = ['bbbbbbbb.', 'b.wwww.bb', 'b.wwww..b', 'b.......b', 'b.jjjjj.b', 'b.j...j.b', 'b.jjjjj.b', 'bbbbbbbbb']
/** A narrower floppy for 16px, where the full one would get 1px blocks. */
const SMALL_FILE_GLYPH = ['bbbbbb.', 'b.ww.bb', 'b.ww..b', 'b.....b', 'b.jjj.b', 'b.jjj.b', 'bbbbbbb']
// Marianne's yellow (the UI's --jaune).
const YELLOW = hex('#ffd23f')
const FILE_COLORS = { b: BLUE, w: WHITE, j: YELLOW }

function renderServiceFile(size) {
  const glyph = 2 * FILE_GLYPH[0].length <= size * 0.94 ? FILE_GLYPH : SMALL_FILE_GLYPH
  const cols = glyph[0].length
  const rows = glyph.length
  const block = Math.max(2, Math.floor((size * 0.94) / cols))
  const gap = block >= 6 ? Math.max(1, Math.round(block * 0.1)) : 0
  const w = block * cols - gap
  const h = block * rows - gap
  const ox = Math.floor((size - w) / 2)
  const oy = Math.floor((size - h) / 2)
  // The clear cells: those the outside reaches through clear cells (the cut corner), not the ones the case holds.
  const clear = new Set()
  const reach = (x, y) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows || clear.has(y * cols + x) || glyph[y][x] !== '.') return
    clear.add(y * cols + x)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ])
      reach(x + dx, y + dy)
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!x || !y || x === cols - 1 || y === rows - 1) reach(x, y)
  // A pixel of the gap between two cells is the case's when both are.
  const inCase = (px, py) => {
    const cx = Math.floor(px / block)
    const cy = Math.floor(py / block)
    const xs = px % block >= block - gap ? [cx, cx + 1] : [cx]
    const ys = py % block >= block - gap ? [cy, cy + 1] : [cy]
    return xs.every((x) => ys.every((y) => x < cols && y < rows && !clear.has(y * cols + x)))
  }
  const pitch = Math.max(4, Math.round(size / 64))
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inCase(x, y)) continue
      const X = ox + x
      const Y = oy + y
      const dot = size >= 96 && X % pitch === pitch >> 1 && Y % pitch === pitch >> 1
      rgba.set([...(dot ? DOT : TILE), 255], (Y * size + X) * 4)
    }
  }
  glyph.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const color = FILE_COLORS[c]
      if (!color) return
      for (let yy = 0; yy < block - gap; yy++)
        for (let xx = 0; xx < block - gap; xx++) rgba.set([...color, 255], ((oy + y * block + yy) * size + ox + x * block + xx) * 4)
    })
  )
  return png(size, rgba)
}

// ---------------------------------------------------------------- file formats

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** Windows .ico with PNG-compressed entries. */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + images.length * 16
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e.writeUInt16LE(1, 4) // planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    return e
  })
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

/** macOS .icns with PNG entries (one per size and Retina variant). */
function icns(entries) {
  const blocks = entries.map(([type, data]) => {
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(8 + data.length, 4)
    return Buffer.concat([head, data])
  })
  const head = Buffer.alloc(8)
  head.write('icns', 0, 'ascii')
  head.writeUInt32BE(8 + blocks.reduce((n, b) => n + b.length, 0), 4)
  return Buffer.concat([head, ...blocks])
}

// ---------------------------------------------------------------- outputs

const out = (rel, data) => {
  const file = join(root, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, data)
  console.log('wrote', rel)
}

// Every size Windows requests at 100–200 % scaling (shell, taskbar, alt-tab, tray).
const appIco = ico([16, 20, 24, 28, 30, 32, 36, 40, 48, 56, 60, 64, 72, 80, 96, 128, 256].map((size) => ({ size, data: render(size) })))
// The .icns entries, each size and its Retina variant (ic11–ic14: 16, 32, 128 and 256 points at 2×).
const ICNS_SIZES = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512]
]

out('build/icon.png', render(1024)) // Linux + fallback
out('build/icon.ico', appIco)
out('build/icon.icns', icns(ICNS_SIZES.map(([type, size]) => [type, render(size)])))

// The archive's icon, for .marianne files: Windows and macOS take it from build/ (fileAssociations in
// electron-builder.yml), Linux from the icon theme, one PNG per size (the .deb installs them).
out('build/archive.ico', ico([16, 20, 24, 32, 40, 48, 64, 96, 128, 256].map((size) => ({ size, data: renderDocument(size) }))))
out('build/archive.icns', icns(ICNS_SIZES.map(([type, size]) => [type, renderDocument(size)])))
for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) out(`build/mime/${size}.png`, renderDocument(size))
// The service file's icon, for .3615 files: the same places, the same sizes.
out('build/service.ico', ico([16, 20, 24, 32, 40, 48, 64, 96, 128, 256].map((size) => ({ size, data: renderServiceFile(size) }))))
out('build/service.icns', icns(ICNS_SIZES.map(([type, size]) => [type, renderServiceFile(size)])))
for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) out(`build/mime/service-${size}.png`, renderServiceFile(size))
out('resources/icon.png', render(256))
out('resources/icon.ico', appIco)

// Tray: on Linux, the tile; on Windows, an .ico of it with every scaling's size (16px at 100 %, 20 at
// 125 %, where a PNG gets stretched); on macOS, a black "M" template the menu bar recolors.
const trayIco = ico([16, 20, 24, 28, 32, 36, 40, 48].map((size) => ({ size, data: render(size, TRAY) })))
out('resources/tray.png', render(16, TRAY))
out('resources/tray@2x.png', render(32, TRAY))
out('resources/tray.ico', trayIco)
for (const [size, suffix] of [
  [18, ''],
  [36, '@2x']
]) {
  const block = Math.floor(size / (COLS + 1))
  const ox = Math.floor((size - block * COLS) / 2)
  const oy = Math.floor((size - block * ROWS) / 2)
  const rgba = Buffer.alloc(size * size * 4)
  GLYPH.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== 'W') return
      for (let yy = 0; yy < block; yy++) for (let xx = 0; xx < block; xx++) rgba.set([0, 0, 0, 255], ((oy + y * block + yy) * size + ox + x * block + xx) * 4)
    })
  )
  out(`resources/tray-mac${suffix}.png`, png(size, rgba))
}

// The website's (site/public/): in a browser tab, the tray's tile, among the other sites' icons as the
// tray's is among the system's, one image per scaling (/favicon.ico, where browsers look first); on an
// iPhone's home screen, the app's tile edge to edge, iOS rounding the corners itself.
out('../../site/public/favicon.ico', trayIco)
out('../../site/public/apple-touch-icon.png', render(180, { margin: 0 }))
