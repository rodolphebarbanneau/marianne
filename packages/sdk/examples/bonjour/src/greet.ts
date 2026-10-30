/** The words of 3615 BONJOUR: pure functions, tested without Marianne. */

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/** "Bonjour Camille, et bon jeudi !": a name, trimmed and capitalised; "Bonjour !" without one. */
export function greeting(name: string, day: Date): string {
  const first = name.trim().replace(/\s+/g, ' ').slice(0, 40)
  const shown = first ? `${first.charAt(0).toLocaleUpperCase('fr-FR')}${first.slice(1)}` : ''
  return `Bonjour${shown ? ` ${shown}` : ''}, et bon ${DAYS[day.getDay()]} !`
}

/** "1 visite", "12 visites". */
export const visitsText = (n: number) => `${n} visite${n > 1 ? 's' : ''}`

/** The week as blocks: the days gone in a light colour, today in yellow, the rest empty. */
export function weekBlocks(day: Date): Array<{ color: 'cyan-clair' | 'jaune' | null; label: string }> {
  // The French week starts on Monday.
  const today = (day.getDay() + 6) % 7
  return ['lu', 'ma', 'me', 'je', 've', 'sa', 'di'].map((label, i) => ({ color: i < today ? 'cyan-clair' : i === today ? 'jaune' : null, label }))
}
