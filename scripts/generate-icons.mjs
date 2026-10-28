// Generates the app icons (no dependencies): node scripts/generate-icons.mjs
// Design: a Minitel screen tile, deep navy with a faint dot matrix, showing a mosaic "M" (Videotex
// blocks with a hairline gap, like the "disjoint" mosaic mode) above a blue-white-red bar. Each size
// is laid out on whole pixels, and the Windows .ico / macOS .icns carry one image per size.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------- design

/** The "M", on a grid of mosaic blocks. */
const GLYPH = ['W.....W', 'WW...WW', 'W.W.W.W', 'W..W..W', 'W.....W', 'W.....W']
const COLS = GLYPH[0].length
const ROWS = GLYPH.length

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const TILE = hex('#0a0f2e')
const DOT = hex('#1b2560')
const WHITE = hex('#f2f4ff')
const BLUE = hex('#3d5afe')
const RED = hex('#ff4757')

/**
 * Block layout at `size`: whole-pixel blocks, the glyph and its bar centered. Small sizes drop the
 * gap between blocks (it would eat the strokes) and the dot matrix.
 */
function layout(size) {
  const content = size * 0.6
  const block = Math.max(2, Math.floor(content / COLS))
  const gap = block >= 6 ? Math.max(1, Math.round(block * 0.1)) : 0
  const width = block * COLS
  const barHeight = Math.max(1, Math.round(block * 0.75))
  const height = block * ROWS + block + barHeight
  const ox = Math.floor((size - width) / 2)
  const oy = Math.floor((size - height) / 2)
  const rects = []
  GLYPH.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === 'W') rects.push([WHITE, ox + x * block, oy + y * block, block - gap, block - gap])
    })
  )
  // Bar under the glyph, in three equal parts (the middle one takes the rounding).
  const third = Math.round(width / 3)
  const barY = oy + block * ROWS + block
  rects.push([BLUE, ox, barY, third, barHeight], [WHITE, ox + third, barY, width - 2 * third, barHeight], [RED, ox + width - third, barY, third, barHeight])
  return { rects, dots: size >= 96 }
}

// ---------------------------------------------------------------- rendering

/** Coverage of a rounded square tile (4×4 supersampled; the glyph itself is pixel-exact). */
function tileCoverage(size, x, y) {
  const m = size * 0.04
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

function render(size) {
  const { rects, dots } = layout(size)
  const rgba = Buffer.alloc(size * size * 4)
  const pitch = Math.max(4, Math.round(size / 64))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = tileCoverage(size, x, y)
      if (!a) continue
      const dot = dots && x % pitch === pitch >> 1 && y % pitch === pitch >> 1
      rgba.set([...(dot ? DOT : TILE), Math.round(a * 255)], (y * size + x) * 4)
    }
  }
  for (const [color, x, y, w, h] of rects) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) rgba.set([...color, 255], (yy * size + xx) * 4)
  }
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

// Every size Windows requests at 100–200 % scaling (shell, taskbar, alt-tab).
const appIco = ico([16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 128, 256].map((size) => ({ size, data: render(size) })))

out('build/icon.png', render(1024)) // Linux + fallback
out('build/icon.ico', appIco)
out(
  'build/icon.icns',
  icns([
    ['icp4', render(16)],
    ['icp5', render(32)],
    ['icp6', render(64)],
    ['ic07', render(128)],
    ['ic08', render(256)],
    ['ic09', render(512)],
    ['ic10', render(1024)],
    ['ic11', render(32)],
    ['ic12', render(64)],
    ['ic13', render(256)],
    ['ic14', render(512)]
  ])
)
out('resources/icon.png', render(256))
out('resources/icon.ico', appIco)

// Tray: the tile on Windows and Linux; on macOS a black "M" template the menu bar recolors.
out('resources/tray.png', render(16))
out('resources/tray@2x.png', render(32))
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
