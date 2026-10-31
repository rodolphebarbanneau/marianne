import { getDomain } from 'tldts'

/**
 * Which site an address belongs to, by the Public Suffix List (tldts, updated with each release),
 * its private part included: under github.io or asso.fr, each site is someone else's. The keychain,
 * the browser's consents and a planned task's sites group addresses with it, in the main process
 * and in the window alike.
 */

/**
 * Hosts under which anyone may publish a site that the Public Suffix List leaves out: a page
 * on mapage.free.fr is not Free's. The list has the others (github.io, netlify.app, blogspot.com…).
 */
const SHARED = new Set(['free.fr', 'ovh.net', 'wordpress.com'])

const PSL = { allowPrivateDomains: true }

/** A URL's host, lower case; '' for what isn't one. An address without its scheme is read as https. */
export function hostOf(url: string): string {
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * The site a URL belongs to, its registrable domain: login pages often live on another subdomain
 * than the home page (www.impots.gouv.fr → cfspart.impots.gouv.fr), while x.asso.fr and
 * evil.asso.fr are two sites. An address, localhost or a suffix of its own is its own site; '' for
 * what isn't a URL.
 */
export function siteOf(url: string): string {
  const host = hostOf(url)
  const domain = host && getDomain(host, PSL)
  if (!domain) return host
  if (!SHARED.has(domain)) return domain
  // Under a host the list leaves out, one label more is the site.
  const labels = host.replace(/^www\./, '').split('.')
  const kept = domain.split('.').length + 1
  return labels.length < kept ? domain : labels.slice(-kept).join('.')
}

/**
 * Whether a host is a whole hosting service or a public suffix (github.io, asso.fr, gouv.fr), « www. »
 * standing for what follows: anyone may own a site under it, so it never stands for one.
 */
export function isSharedHost(host: string): boolean {
  const name = host.toLowerCase().replace(/^www\./, '')
  return SHARED.has(name) || !getDomain(name, PSL)
}
