// The seat plans of both hemicycles, from the chambers' own sites, into src/hemicycle.json.
// Run when a chamber changes its plan: node services/parlement/scripts/hemicycle.mjs
//
// - Assemblée nationale: the plan of https://www.assemblee-nationale.fr/dyn/vos-deputes/hemicycle,
//   one SVG path per seat (id "p<seat>", the seat of placeHemicycle in the open data); a seat is
//   the centre of its path's corners.
// - Sénat: the plan senat.fr draws its hemicycle with, in its script: one circle per seat (the
//   "siege" of its senators' list).
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AN_PLAN = 'https://www.assemblee-nationale.fr/dyn/vos-deputes/hemicycle?siege=1'
const SENATE_SCRIPT = 'https://www.senat.fr/assets/scripts/senat.js'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/hemicycle.json')

const get = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.text()
}

const round = (n) => Math.round(n * 100) / 100

/** The corners of an SVG path (curves by their end points): enough for a seat's centre. */
function corners(d) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g)
  const points = []
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  let cmd = ''
  let i = 0
  const take = (n) => tokens.slice(i, (i += n)).map(Number)
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++]
    const rel = cmd === cmd.toLowerCase()
    switch (cmd.toUpperCase()) {
      case 'Z':
        ;[x, y] = [startX, startY]
        continue
      case 'M': {
        const [a, b] = take(2)
        ;[x, y] = rel ? [x + a, y + b] : [a, b]
        ;[startX, startY] = [x, y]
        cmd = rel ? 'l' : 'L'
        break
      }
      case 'L': {
        const [a, b] = take(2)
        ;[x, y] = rel ? [x + a, y + b] : [a, b]
        break
      }
      case 'H': {
        const [a] = take(1)
        x = rel ? x + a : a
        break
      }
      case 'V': {
        const [b] = take(1)
        y = rel ? y + b : b
        break
      }
      case 'C': {
        const c = take(6)
        ;[x, y] = rel ? [x + c[4], y + c[5]] : [c[4], c[5]]
        break
      }
      case 'S':
      case 'Q': {
        const c = take(4)
        ;[x, y] = rel ? [x + c[2], y + c[3]] : [c[2], c[3]]
        break
      }
      default:
        throw new Error(`path command ${cmd}`)
    }
    points.push([x, y])
  }
  return points
}

async function assembly() {
  const html = await get(AN_PLAN)
  const seats = {}
  const re = /<path transform="matrix\(([^)]*)\)"\s+d="([^"]+)"\s+class="place" id="p(\d+)"/g
  for (const m of html.matchAll(re)) {
    const [a, b, c, d, e, f] = m[1].split(',').map(Number)
    const pts = corners(m[2])
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
    seats[m[3]] = [round(a * cx + c * cy + e), round(b * cx + d * cy + f)]
  }
  const viewBox = html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  if (Object.keys(seats).length < 570 || !viewBox) throw new Error('the Assemblée plan has changed shape')
  return { width: Number(viewBox[1]), height: Number(viewBox[2]), r: 1.55, seats }
}

async function senate() {
  const js = await get(SENATE_SCRIPT)
  const list = js.match(/const \w+=(\[\{id:1,cx:[^\]]*\])/)?.[1]
  if (!list) throw new Error('the Sénat plan has moved in its script')
  const seats = {}
  for (const m of list.matchAll(/\{id:(\d+),cx:([\d.]+),cy:([\d.]+)\}/g)) seats[m[1]] = [Number(m[2]), Number(m[3])]
  if (Object.keys(seats).length < 340) throw new Error('the Sénat plan has changed shape')
  return { width: 655, height: 322, r: 4.6, seats }
}

const plans = { an: await assembly(), se: await senate() }
writeFileSync(OUT, `${JSON.stringify(plans)}\n`)
console.log(`hemicycle.json: ${Object.keys(plans.an.seats).length} seats at the Assemblée, ${Object.keys(plans.se.seats).length} at the Sénat`)
