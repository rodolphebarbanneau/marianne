import type { PixelArt, ProfileField, ServiceCategory, ServiceManifest, ServiceTrust } from '@marianne/sdk'

/**
 * The community catalogue: the services of the community repository, as its index lists them.
 * The index is one JSON file the project signs with its key (ed25519, the key the content bundles
 * are signed with); Marianne reads it, checks its signature, and sends nothing about the user to
 * get it. A service is « validé » when this exact version (its file's SHA-256) was reviewed and
 * listed so by the project; « non validé » when it is published, its author known, not reviewed.
 */

/** The index's format: an older Marianne refuses an index of a newer format rather than misread it. */
export const CATALOGUE_FORMAT = 1

/** What a community service's version is worth, by the index: reviewed, published only, or taken back. */
export type CatalogueStatus = 'validated' | 'unvalidated'

/** A community service as the index lists it: one version. */
export interface CatalogueEntry {
  /** Its code: what follows 3615. */
  code: string
  version: string
  name: string
  /** One line, in French. */
  description: string
  category: ServiceCategory
  keywords: string[]
  /** Who publishes it, as the repository knows them. */
  author: string
  /** The hosts it reaches. */
  hosts: string[]
  /** The pages it opens itself in the user's browser (URL prefixes on its hosts), shown before it is added. */
  links: string[]
  /** Marianne's connections it relies on ("geo": it knows the commune of the user's address). */
  connections: string[]
  /** What of the user's profile it asks to read. */
  reads: ProfileField[]
  /** The tools it lends the engines, as the conversation names them (French labels). */
  tools: string[]
  /** It keeps public data on this computer (a sync job): false in this version, which refuses a community service's sync.js. */
  sync: boolean
  icon: PixelArt | null
  status: CatalogueStatus
  /** Marianne recommends it, on top of « découvrir » (validated services only). */
  recommended: boolean
  /** When this version was published, YYYY-MM-DD. */
  published: string
  /** Its .3615 file: where it is, its size in bytes, its SHA-256 (lowercase hex). */
  file: { url: string; size: number; sha256: string }
}

/** A validation the project took back: Marianne warns and switches the service off when this file is installed. */
export interface Withdrawal {
  code: string
  version: string
  sha256: string
  /** Why, in French, for the user. */
  reason: string
}

/** The signed index. */
export interface CatalogueIndex {
  format: number
  /** When the project published it (ISO). */
  published: string
  /** Until when it may be used (ISO): past it, its validations no longer count, until a newer one comes. */
  expires: string
  services: CatalogueEntry[]
  withdrawn: Withdrawal[]
}

/**
 * What Marianne found in a .3615 file, before the user adds it: the file (its name, size and
 * SHA-256), its manifest once checked, and its verdict by the catalogue. Nothing of the file runs
 * before the user agrees.
 */
export interface ServiceFileReview {
  /** A key for the file read, to add it once the user agrees (the main process keeps the file). */
  ticket: string
  fileName: string
  size: number
  sha256: string
  /** Its manifest, checked; null when the file was refused. */
  manifest: ServiceManifest | null
  /**
   * By the catalogue: validated, unvalidated, outside (not listed), withdrawn (its validation taken
   * back); refused: not a service Marianne can add (`problems` says why).
   */
  verdict: ServiceTrust | 'refused'
  /** Why it was refused, in French, one line each. */
  problems: string[]
  /** It keeps public data on this computer (it has a sync job): always false in this version, which refuses a file with a sync.js. */
  sync: boolean
  /** The tools it declares, as the conversation names them. */
  tools: string[]
  /** The pages it opens itself in the user's browser (its manifest's links). */
  links: string[]
  /** The catalogue's entry for this exact file, when it lists it. */
  entry?: CatalogueEntry
  /** The version of it already among the user's services, if any. */
  installed?: string
  /** For a withdrawn validation: why, as the project says it. */
  withdrawnReason?: string
}

/** The catalogue as the window sees it. */
export interface CatalogueState {
  /**
   * none: there is no catalogue to read (the community repository isn't open yet); loading: being
   * read for the first time; ready; failed: the last reading failed (the entries are the last read).
   */
  status: 'none' | 'loading' | 'ready' | 'failed'
  entries: CatalogueEntry[]
  withdrawn: Withdrawal[]
  /** When the index in use was read (ISO). */
  readAt?: string
  error?: string
}
