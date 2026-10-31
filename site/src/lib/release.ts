// The installers of the latest release on GitHub: read when the site is built, and again in the
// browser, so the buttons point at a release published since. GitHub's /releases/latest skips
// prereleases, and Marianne's are alpha ones: the latest is the first published release with an
// installer. Anything that fails falls back to the releases page.

export const REPO = 'rodolphebarbanneau/marianne'
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=10`

/** An installer, by the names electron-builder gives them (apps/desktop/electron-builder.yml). */
export type Installer = 'windows' | 'mac-arm64' | 'mac-x64' | 'appimage' | 'deb'

const NAMES: Record<Installer, RegExp> = {
  windows: /^Marianne-Setup-.+\.exe$/,
  'mac-arm64': /-arm64\.dmg$/,
  'mac-x64': /-x64\.dmg$/,
  appimage: /^Marianne-(?!.*arm64).+\.AppImage$/,
  deb: /_amd64\.deb$/
}

export interface Asset {
  name: string
  url: string
  size: number
}

export interface Release {
  tag: string
  version: string
  /** The day it was published, YYYY-MM-DD, as the page shows it. */
  date: string
  /** When it was published, to the second: which of two releases is the newer. */
  published: string
  url: string
  prerelease: boolean
  assets: Partial<Record<Installer, Asset>>
}

interface GitHubRelease {
  tag_name: string
  html_url: string
  draft: boolean
  prerelease: boolean
  published_at: string | null
  assets: { name: string; browser_download_url: string; size: number }[]
}

/** The latest published release with at least one installer, from GitHub's list (newest first). */
export function latest(releases: GitHubRelease[]): Release | null {
  for (const r of releases) {
    if (r.draft) continue
    const assets: Release['assets'] = {}
    for (const [installer, name] of Object.entries(NAMES) as [Installer, RegExp][]) {
      const a = r.assets.find((x) => name.test(x.name))
      if (a) assets[installer] = { name: a.name, url: a.browser_download_url, size: a.size }
    }
    if (Object.keys(assets).length === 0) continue
    return {
      tag: r.tag_name,
      version: r.tag_name.replace(/^v/, ''),
      date: (r.published_at ?? '').slice(0, 10),
      published: r.published_at ?? '',
      url: r.html_url,
      prerelease: r.prerelease,
      assets
    }
  }
  return null
}

/**
 * Whether `a` was published after `b` (none at all counts as before). Only a newer release may take
 * the place of the one a page shows: an older one, read before it came out, never brings it back.
 */
export function newer(a: Release | null | undefined, b: Release | null | undefined): boolean {
  if (!a) return false
  if (!b) return true
  const at = (r: Release) => Date.parse(r.published || r.date) || 0
  return at(a) > at(b)
}

export async function fetchLatest(token?: string): Promise<Release | null> {
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) return null
    return latest((await res.json()) as GitHubRelease[])
  } catch {
    return null
  }
}

/** A size as the app writes it: 112 Mo, 112 MB. */
export function megabytes(bytes: number, lang: 'fr' | 'en'): string {
  return `${Math.round(bytes / 1024 / 1024)} ${lang === 'fr' ? 'Mo' : 'MB'}`
}
