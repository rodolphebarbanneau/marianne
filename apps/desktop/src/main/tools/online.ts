import { fold } from './tool'

/**
 * The two rules of acting online for the user. Going to a website needs their consent first:
 * once per folder, or once per site of a folder, as they chose. And a step that commits them
 * (sign, pay, send, submit, confirm, declare, delete…) needs their yes every time.
 */

export type AskOnline = 'folder' | 'site'

/** The sites each folder was allowed to go to, in memory: forgotten when the session locks. */
export class Consents {
  private sites = new Map<string, Set<string>>()

  /** "folder": any consent given in the folder covers every site; "site": each site needs its own. */
  has(folderId: string, site: string, ask: AskOnline): boolean {
    const given = this.sites.get(folderId)
    return !!given && (ask === 'folder' ? given.size > 0 : given.has(site))
  }

  add(folderId: string, site: string): void {
    const given = this.sites.get(folderId) ?? new Set<string>()
    given.add(site)
    this.sites.set(folderId, given)
  }

  clear(): void {
    this.sites.clear()
  }
}

/** Words that commit the user, folded (no accents, lower case): French stems and words, then English. */
const COMMITS = [
  /\b(valid|envo[iy]|pay(er|ez)|paiement|sign(er|ez|ature)|confirm|transm|suppr|soumet|termin(er|ez)|finali|enregistr|accept|souscri|command(er|ez)|achet(er|ez)|resili|depos(er|ez)|reserv(er|ez)|certifi(er|e)|attest(er|e)|honneur)/,
  /\b(regl(er|ez|ement)|declar(er|ez|e))(?![a-z])/,
  /\bannuler (ma|mon|mes|la|le|les|l'|votre|vos|cette|ce)\b/,
  /\b(submit|send|payment|delete|remove|finish|save|agree|purchase|checkout|(pay|buy|book|sign(?! ?(in|up|on|out)\b))(?![a-z]))/
]

/** Folded, with straight apostrophes. */
const plain = (text: string) => fold(text).replace(/[’`]/g, "'")
const commits = (text: string) => COMMITS.some((re) => re.test(plain(text)))

/** What a submit button may do without committing: move, search, show, sign in. */
const MOVES =
  /\b(recherch|cherch|search|filtr|filter|trier|sort|afficher|voir|show|masquer|hide|ouvrir|open|fermer|close|menu|suivant|next|precedent|previous|retour|back|continuer|continue|accueil|home|connexion|connecter|identifier|sign ?in|log ?in|login|aide|help|langue|language|imprimer|print|telecharger|download)/

export interface Clickable {
  role: string
  type: string
  label: string
}

/**
 * Whether clicking an element commits the user. From its label (and what the engine says it is
 * for): signing, paying, sending, submitting… And a button that submits a form commits, unless
 * it plainly moves on or searches. When in doubt, it does: asking costs one click.
 */
export function consequential(element: Clickable, purpose = ''): boolean {
  if (commits(element.label) || commits(purpose)) return true
  return (element.type === 'submit' || element.type === 'image') && !MOVES.test(plain(element.label))
}
