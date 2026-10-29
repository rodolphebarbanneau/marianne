// In the browser: the visitor's system, and the latest release. The page is built with the release
// of its build day (in #release-data); this reads GitHub again, at most once per visit, so a release
// published since gets its buttons without rebuilding the site.

import { latest, RELEASES_API, type Installer, type Release } from './release'

export type Kind = 'windows' | 'mac' | 'linux' | 'mobile' | null

export interface System {
  kind: Kind
  /** The installer to offer first; Linux gets the .deb (Ubuntu, Mint, Debian: most people's). */
  installer: Installer | null
}

/** Phones and tablets first: Android says Linux, iPhones say Mac OS X, iPads say Macintosh. */
export function detect(): System {
  const ua = navigator.userAgent
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || ''
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Mac/i.test(platform) && navigator.maxTouchPoints > 1)) return { kind: 'mobile', installer: null }
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return { kind: 'windows', installer: 'windows' }
  if (/Mac/i.test(platform) || /Mac OS X/i.test(ua)) return { kind: 'mac', installer: intelMac ? 'mac-x64' : 'mac-arm64' }
  if (/Linux|X11|CrOS/i.test(platform + ' ' + ua)) return { kind: 'linux', installer: 'deb' }
  return { kind: null, installer: null }
}

// Only Chromium tells a Mac's chip; Safari and Firefox don't, and most Macs sold since 2021 are Apple
// silicon: they get the arm64 build, with the Intel one beside it.
let intelMac = false
const chip: Promise<void> = (async () => {
  const data = (navigator as Navigator & { userAgentData?: { getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string }> } }).userAgentData
  try {
    const { architecture } = (await data?.getHighEntropyValues?.(['architecture'])) ?? {}
    intelMac = architecture === 'x86'
  } catch {}
})()

const CACHE = 'marianne-release'

function built(): Release | null {
  try {
    return JSON.parse(document.getElementById('release-data')?.textContent || 'null')
  } catch {
    return null
  }
}

async function fresh(): Promise<Release | null> {
  try {
    const cached = sessionStorage.getItem(CACHE)
    if (cached) return JSON.parse(cached)
  } catch {}
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) return null
    const release = latest(await res.json())
    if (release) sessionStorage.setItem(CACHE, JSON.stringify(release))
    return release
  } catch {
    return null
  }
}

type Listener = (release: Release | null, lang: 'fr' | 'en') => void
const listeners: Listener[] = []
let current: Release | null | undefined

/** Called with the build's release at once (once the chip is known), and again if GitHub has a newer one. */
export function ready(fn: Listener) {
  listeners.push(fn)
  if (current !== undefined) fn(current, lang())
}

const lang = () => (document.documentElement.lang === 'en' ? 'en' : 'fr')

;(async () => {
  await chip
  current = built()
  for (const fn of listeners) fn(current, lang())
  const latest = await fresh()
  if (latest && latest.tag !== current?.tag) {
    current = latest
    for (const fn of listeners) fn(current, lang())
  }
})()
