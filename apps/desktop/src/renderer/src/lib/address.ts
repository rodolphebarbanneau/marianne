/** Web addresses as the window reads them: what the browser's bar opens, where an image would come from. */

/**
 * What the browser panel's bar opens for what was typed: an address as it is, a site's name
 * (« impots.gouv.fr ») on https, anything else a search on service-public.gouv.fr, as its
 * placeholder says; null when nothing was typed. The main process reads an address of the page
 * already open the same way (browser.navigate), and this must agree with it.
 */
export function addressUrl(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  if (/^https?:\/\//i.test(text)) return text
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(text)) return `https://${text}`
  return `https://www.service-public.gouv.fr/particuliers/recherche?keyword=${encodeURIComponent(text)}`
}

/** The host of a web address; '' for anything else, and for an address that doesn't parse (« http:// »). */
export function webHost(url: unknown): string {
  if (typeof url !== 'string' || !/^https?:/i.test(url)) return ''
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
