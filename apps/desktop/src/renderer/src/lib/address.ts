/** Web addresses as the window reads them: where an image would come from. What the browser's bar opens is shared/address.ts. */

/** The host of a web address; '' for anything else, and for an address that doesn't parse (« http:// »). */
export function webHost(url: unknown): string {
  if (typeof url !== 'string' || !/^https?:/i.test(url)) return ''
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
