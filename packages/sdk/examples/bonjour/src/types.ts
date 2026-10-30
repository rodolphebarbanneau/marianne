/** What 3615 BONJOUR's screen calls on its main side, and gets back: plain data. */

export interface Greeting {
  /** "Bonjour Camille, et bon jeudi !" */
  text: string
  /** How many times the user was greeted here. */
  visits: number
  /** The commune of the user's address, when they gave one. */
  from: string | null
}

export type BonjourMethods = {
  greet(name: string): Greeting
  visits(): number
  reset(): number
}
