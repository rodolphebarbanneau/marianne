import type { ServiceManifest } from '../src/index'

/** marianne-pack (pack.mjs): a community service's .3615 file, from its package folder. */

export declare const MAIN_IMPORTS: string[]
export declare const VIEW_IMPORTS: string[]
export declare const MAX_FILE_BYTES: number

export declare class PackError extends Error {}

export interface Packed {
  /** Where the .3615 was written. */
  file: string
  manifest: ServiceManifest
  size: number
  /** Its entries, by name. */
  entries: string[]
}

/** The .3615 of the service in `dir`, written into `out` (dir/dist by default). */
export declare function pack(dir: string, options?: { out?: string }): Promise<Packed>
