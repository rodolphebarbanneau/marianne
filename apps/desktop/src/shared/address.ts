/**
 * What the browser's address bar opens for what the user typed: an address as it is, a site's name
 * (« impots.gouv.fr ») on https, anything else a search on service-public.gouv.fr, as its
 * placeholder says; null when nothing was typed. The window reads the bar with it (a folder with
 * no page yet opens one) and so does the main process (browser.navigate, on the page already open).
 */
export function addressUrl(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  if (/^https?:\/\//i.test(text)) return text
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(text)) return `https://${text}`
  return `https://www.service-public.gouv.fr/particuliers/recherche?keyword=${encodeURIComponent(text)}`
}
