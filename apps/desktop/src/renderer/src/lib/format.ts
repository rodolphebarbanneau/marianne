/** Short French formats for dates, durations and sizes. */

const DAY = 86_400_000

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`

/** "08:42" today, "hier", "lun.", then "24/10". */
export function when(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  const now = new Date()
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY)
  if (days <= 0) {
    const minutes = Math.round((now.getTime() - date.getTime()) / 60_000)
    if (minutes < 1) return 'à l’instant'
    if (minutes < 60) return `${minutes} min`
    return `${Math.round(minutes / 60)} h`
  }
  if (days === 1) return 'hier'
  if (days < 7) return date.toLocaleDateString('fr-FR', { weekday: 'short' })
  if (days < 30) return `${Math.round(days / 7)} sem.`
  if (days < 365) return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
}

export function clock(iso: string): string {
  const date = new Date(iso)
  return startOfDay(new Date()) === startOfDay(date)
    ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

/** 24/10/2026 */
export const shortDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '')

/** How fresh something is (a tile): "à l’instant", "il y a 12 min", "il y a 3 h", "hier", "le 24/10". */
export function freshness(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  if (days <= 0) return `il y a ${Math.floor(minutes / 60)} h`
  if (days === 1) return 'hier'
  return `le ${date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`
}

/** When something was last done, by the day: "aujourd’hui", "hier", "lundi", "il y a 2 semaines"; absent: "jamais". */
export function lastDay(iso: string | undefined, now = new Date()): string {
  if (!iso) return 'jamais'
  const date = new Date(iso)
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY)
  if (days <= 0) return 'aujourd’hui'
  if (days === 1) return 'hier'
  if (days < 7) return date.toLocaleDateString('fr-FR', { weekday: 'long' })
  if (days < 30) return `il y a ${Math.floor(days / 7)} semaine${days >= 14 ? 's' : ''}`
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`
  return 'il y a plus d’un an'
}

/** A day of the year, short: "12 oct.". */
export const dayMonth = (ymd: string) => (ymd ? new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '')

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** 412 Mo, 1 Go */
export function bytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2).toLocaleString('fr-FR')} Mo`
  if (n >= 1024) return `${Math.round(n / 1024).toLocaleString('fr-FR')} Ko`
  return `${n} o`
}

/** "7f3a9c21" → "7F3A·9C21" */
export const accountLabel = (id: string) => `${id.slice(0, 4)}·${id.slice(4)}`.toUpperCase()

/** An ISO date `days` from now, at 9 a.m. */
export function daysFromNow(days: number): string {
  const d = new Date(Date.now() + days * DAY)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}
