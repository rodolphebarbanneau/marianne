import { cutText, TILE_LIMITS, type HomeCommune, type ServiceTile, type TileLine, type TileVisual } from '@marianne/sdk/main'
import { officesNear, type DirectoryContext } from './directory'
import { DAYS, dayHours, dayOfWeek } from './hours'
import { OFFICE_KINDS, type OpeningPeriod, type PublicOffice } from './types'

/**
 * 3615 ANNUAIRE's tile on the Services page: the user's mairie, open or closed now, how much of
 * its day has gone, when it closes or opens next; under it, when the Caf opens. Hours are read in
 * the computer's time zone, as the screen reads them. Pure but for `annuaireTile`, which asks the
 * directory.
 */

/** The offices of the tile: the mairie, then the one under it. */
const TILE_KINDS = ['mairie', 'caf']
/** As many of each kind as the screen asks for (officesNear's default): the same requests, cached. */
const PER_KIND = 2
/** Days ahead to look for the next opening: a whole week. */
const WEEK = 7

/** The tile while the profile has no address: where to give it. */
export const NO_HOME_TILE: ServiceTile = {
  title: 'votre commune ?',
  lines: [{ text: 'renseignez votre adresse dans Réglages › Identité', tone: 'dim' }]
}

/** "17 h 30", "16 h": a time of the directory ("17:30"). */
export function clock(time: string): string {
  const [hours, minutes] = time.split(':')
  return `${Number(hours)} h${minutes === '00' ? '' : ` ${minutes}`}`
}

/** "1 h 40", "2 h", "25 min". */
export function duration(minutes: number): string {
  const [h, m] = [Math.floor(minutes / 60), minutes % 60]
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

/** "de Rennes", "d’Angers", "du Mans", "des Ulis", "de La Rochelle". */
export function ofPlace(name: string): string {
  if (name.startsWith('Le ')) return `du ${name.slice(3)}`
  if (name.startsWith('Les ')) return `des ${name.slice(4)}`
  return /^[AEIOUYÂÉÈÊÎÔ]/i.test(name) ? `d’${name}` : `de ${name}`
}

/**
 * Where an office stands at a moment. Open: until when ("17:30"), and whether it is the day's last
 * slot (else it closes for a pause). Closed: its next opening, `days` from today (0: later today,
 * `reopens` when it was open earlier), null when the hours don't tell.
 */
export type OfficeStatus =
  { open: true; until: string; last: boolean } | { open: false; next: { days: number; weekday: number; from: string } | null; reopens: boolean }

/** Where an office stands at a moment; null when its hours don't say. */
export function statusAt(hours: OpeningPeriod[], date: Date): OfficeStatus | null {
  const today = dayHours(hours, date)
  if (today === null) return null
  const now = date.getHours() * 60 + date.getMinutes()
  const current = today.find((s) => now >= minutesOf(s.from) && now < minutesOf(s.to))
  if (current) return { open: true, until: current.to, last: current === today[today.length - 1] }
  const later = today.find((s) => minutesOf(s.from) > now)
  // It opened earlier today: it reopens.
  const reopens = !!later && today.some((s) => minutesOf(s.to) <= now)
  if (later) return { open: false, next: { days: 0, weekday: dayOfWeek(date), from: later.from }, reopens }
  for (let days = 1; days <= WEEK; days++) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12)
    const slots = dayHours(hours, day)
    // A day whose hours aren't given: the next opening can't be told.
    if (slots === null) break
    if (slots.length) return { open: false, next: { days, weekday: dayOfWeek(day), from: slots[0].from }, reopens: false }
  }
  return { open: false, next: null, reopens: false }
}

/** "ouverte jusqu’à 17 h 30", "rouvre à 13 h 30", "ouvre demain à 8 h 30", "ouvre lundi à 9 h", "fermée". */
export function statusText(status: OfficeStatus | null): string {
  if (!status) return 'horaires non précisés'
  if (status.open) return `ouverte jusqu’à ${clock(status.until)}`
  const { next } = status
  if (!next) return 'fermée'
  const day = next.days === 0 ? '' : next.days === 1 ? 'demain ' : `${DAYS[next.weekday - 1]} `
  return `${status.reopens ? 'rouvre' : 'ouvre'} ${day}à ${clock(next.from)}`
}

/** How much of the day's opening hours has gone, and what is left of them. */
function dayGauge(hours: OpeningPeriod[], status: OfficeStatus, date: Date): TileVisual | null {
  const today = dayHours(hours, date)
  if (!today) return null
  if (!today.length) return { kind: 'gauge', value: 0, label: 'fermée aujourd’hui', color: 'gris' }
  const now = date.getHours() * 60 + date.getMinutes()
  const span = (s: OpeningPeriod['slots'][number]) => minutesOf(s.to) - minutesOf(s.from)
  const total = today.reduce((sum, s) => sum + span(s), 0)
  const gone = today.reduce((sum, s) => sum + Math.min(span(s), Math.max(0, now - minutesOf(s.from))), 0)
  const value = total ? Math.round((gone / total) * 100) / 100 : 0
  if (status.open) {
    const left = duration(minutesOf(status.until) - now)
    return { kind: 'gauge', value, label: `la journée : ${left} avant ${status.last ? 'la fermeture' : 'la pause'}`, color: 'vert' }
  }
  const slots = today.map((s) => `${clock(s.from)}–${clock(s.to)}`).join(', ')
  return { kind: 'gauge', value, label: `la journée : ${slots}`, color: 'gris' }
}

/** "● ouverte jusqu’à 17 h 30", "fermée · ouvre demain à 8 h 30". */
function mairieLine(status: OfficeStatus | null): TileLine {
  if (status?.open) return { text: `● ${statusText(status)}`, tone: 'ok' }
  return { text: status?.next ? `fermée · ${statusText(status)}` : statusText(status), tone: 'dim' }
}

/** The tile of a commune's mairie at a moment, and of the office under it (the Caf). */
export function officeTile(commune: string, mairie: PublicOffice | undefined, other: PublicOffice | undefined, now: Date): ServiceTile {
  const lines: TileLine[] = []
  let visual: TileVisual | null = null
  if (!mairie) lines.push({ text: 'introuvable dans l’annuaire', tone: 'dim' })
  else {
    const status = statusAt(mairie.hours, now)
    if (status) visual = dayGauge(mairie.hours, status, now)
    lines.push(mairieLine(status))
  }
  if (other) {
    const name = OFFICE_KINDS.find((k) => k.id === other.kind)?.short ?? other.kindLabel
    lines.push({ text: cutText(`${name} : ${statusText(statusAt(other.hours, now))}`, TILE_LIMITS.line), tone: 'dim' })
  }
  return { title: cutText(`Mairie ${ofPlace(commune)}`, TILE_LIMITS.title), ...(visual ? { visual } : {}), lines }
}

/**
 * The tile of the user's commune; a commune Marianne doesn't know: the default tile. Fails when the
 * directory can't be reached, or doesn't answer for the mairie: « introuvable » would be untrue, and
 * Marianne keeps the last tile.
 */
export async function annuaireTile(ctx: DirectoryContext & { home(): HomeCommune | null }, now = new Date()): Promise<ServiceTile | null> {
  const home = ctx.home()
  if (!home) return NO_HOME_TILE
  const commune = await ctx.geo.getCommune(home.code)
  if (!commune) return null
  const [mairie, other] = await officesNear(ctx.http, commune, TILE_KINDS, PER_KIND)
  if (mairie.error) throw new Error(mairie.error)
  return officeTile(commune.name, mairie.offices[0], other.offices[0], now)
}
