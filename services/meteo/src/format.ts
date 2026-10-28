/** How the view writes the weather, in French. */

/** A sign for a WMO weather code, in the spirit of the Minitel's mosaic. */
export function weatherGlyph(code: number, isDay = true): string {
  if (code <= 1) return isDay ? '☀' : '☾'
  if (code === 2) return '⛅'
  if (code === 3) return '☁'
  if (code === 45 || code === 48) return '≡'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '❄'
  if (code >= 95) return '⚡'
  if (code >= 51) return '☂'
  return '·'
}

/** "aujourd’hui", "demain", then "vendredi 30": the days of a forecast, the first being today at the place. */
export function dayName(date: string, index: number): string {
  if (index === 0) return 'aujourd’hui'
  if (index === 1) return 'demain'
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', timeZone: 'UTC' })
}

/** "16,6 °C", never "-0 °C". */
export function degrees(n: number, digits = 0): string {
  const rounded = Math.round(n * 10 ** digits) / 10 ** digits || 0
  return `${rounded.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} °C`
}

/** "NO 21 km/h" */
export const wind = (from: string, speed: number) => `${from} ${Math.round(speed)} km/h`

/** "4,2 mm" */
export const millimetres = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mm`
