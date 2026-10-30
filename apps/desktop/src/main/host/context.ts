import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { allowedUrl, type ServiceManifest } from '@marianne/sdk'
import type { ProfileField } from '@marianne/sdk'
import type { Leaning, ServiceContext, ServiceHttp, ServiceProfile, Vehicle } from '@marianne/sdk/main'
import { accepted, keptSections, refusedSources, regionOf } from '../../shared/news'
import { accounts } from '../account'
import { content } from '../content'
import { fetchAsBrowser, fetchJson, fetchText } from '../http'
import { log } from '../log'
import { paths } from '../paths'
import { profile } from '../profile/store'
import { findCommunes, getCommune } from '../public/geo'
import { serviceNews } from '../public/news'
import { parisDay } from '../public/time'
import { session } from '../session'
import { serviceStorage, storageKind } from './storage'
import type { ServiceSync } from './sync'

/**
 * What a service gets of Marianne: its context. Each capability is narrowed to the service: the
 * network to its declared hosts, the storage to its own records, a data folder of its own.
 * Nothing personal but the commune of the user's address, and never a [[token]] value.
 */

export { storageKind }

function http(m: ServiceManifest): ServiceHttp {
  const check = (url: string) => {
    if (!allowedUrl(m, url)) throw new Error(`3615 ${m.id.toUpperCase()} n’a pas déclaré ${new URL(url).host} (package.json, marianne.hosts).`)
  }
  return {
    json: (url, options) => (check(url), fetchJson(url, options)),
    text: (url, options) => (check(url), fetchText(url, options)),
    page: (url, options) => (check(url), fetchAsBrowser(url, options))
  }
}

/** The profile fields the user granted the service: those it asked for, and nothing else. */
export function grantedFields(m: ServiceManifest): ProfileField[] {
  if (!session.unlocked) return []
  const granted = accounts.settings().services.access[m.id] ?? []
  return m.permissions.profile.filter((f) => granted.includes(f))
}

function vehicles(m: ServiceManifest): Vehicle[] {
  const fields = grantedFields(m)
    .filter((f) => f.startsWith('vehicles.'))
    .map((f) => f.slice('vehicles.'.length) as keyof Omit<Vehicle, 'id'>)
  if (!fields.length) return []
  return profile.get().vehicles.map((v) => ({ id: v.id, ...Object.fromEntries(fields.map((f) => [f, v[f]])) }))
}

/**
 * The day a service last read the user's opinions (leaning, themes, sources), kept so that Réglages › Identité can say it:
 * written once a day at most.
 */
function noteRead(m: ServiceManifest): void {
  const day = parisDay()
  const { reads } = accounts.settings().services
  // `reads` is an open record: a patch replaces it whole, so the other services' days come along.
  if (reads[m.id] !== day) accounts.updateSettings({ services: { reads: { ...reads, [m.id]: day } } })
}

/** The groups the user leans to, when they granted it and said something. */
function leaning(m: ServiceManifest): Leaning | null {
  if (!grantedFields(m).includes('opinions.leaning')) return null
  const l = profile.get().opinions.leaning
  if (!l.assembly.length && !l.senate.length) return null
  noteRead(m)
  return { assembly: [...l.assembly], senate: [...l.senate] }
}

function themes(m: ServiceManifest): string[] {
  if (!grantedFields(m).includes('opinions.themes')) return []
  const chosen = profile.get().opinions.themes
  if (chosen.length) noteRead(m)
  return [...chosen]
}

/** The region of the user's address, for the default sources (the regional ones of their region); null without one, or locked. */
function homeRegion(): string | null {
  // Locked, the profile can't be read (a service's news still can, unfiltered).
  if (!session.unlocked) return null
  const code = profile.get().address.inseeCode
  return code ? regionOf(code) : null
}

/** The news sources the user accepts, the sections they keep and their colours, when the service may read them. */
function sources(m: ServiceManifest): ReturnType<ServiceProfile['sources']> {
  if (!grantedFields(m).includes('opinions.sources')) return null
  noteRead(m)
  const choice = profile.get().opinions.sources
  const catalogue = content.get().newsSources
  const refused = refusedSources(catalogue, choice, homeRegion())
  const kept = catalogue.filter((s) => accepted(s, choice, refused))
  return {
    accepted: kept.map((s) => s.id),
    // Only the sources whose sections the user changed: absent, all of them.
    sections: Object.fromEntries(kept.filter((s) => choice?.sections[s.id]).map((s) => [s.id, keptSections(s, choice)])),
    leanings: { ...(choice?.leanings ?? {}) }
  }
}

/**
 * `stored`: the service wrote the user's data for it (what its tile shows may have changed).
 * `dataDir: false`: no data folder (a community service has no sync job to fill one). `news: false`:
 * no ctx.news whatever the manifest says (a community service: the headlines would need a bridge
 * over its worker, and it is refused when added).
 */
export function serviceContext(
  m: ServiceManifest,
  sync: ServiceSync,
  stored: () => void = () => {},
  options: { dataDir?: boolean; news?: boolean } = {}
): ServiceContext {
  const dataDir = options.dataDir === false ? '' : join(paths.services, m.id)
  if (dataDir) mkdirSync(dataDir, { recursive: true })
  const prefix = `[3615 ${m.id.toUpperCase()}]`
  return {
    manifest: m,
    http: http(m),
    log: {
      info: (...args) => log.info(prefix, ...args),
      warn: (...args) => log.warn(prefix, ...args),
      error: (...args) => log.error(prefix, ...args)
    },
    storage: serviceStorage(m.id, () => session.archive, stored),
    dataDir,
    geo: { findCommunes, getCommune },
    home() {
      if (!session.unlocked) return null
      const a = profile.get().address
      return a.inseeCode ? { code: a.inseeCode, name: a.city, postcode: a.postcode, latitude: a.lat, longitude: a.lon } : null
    },
    profile: { granted: () => grantedFields(m), vehicles: () => vehicles(m), leaning: () => leaning(m), themes: () => themes(m), sources: () => sources(m) },
    sync: { status: () => sync.status(), run: () => sync.run() },
    ...(m.news && options.news !== false
      ? {
          news: serviceNews({
            granted: () => grantedFields(m).includes('opinions.sources'),
            choice: () => profile.get().opinions.sources,
            region: homeRegion,
            noteRead: () => noteRead(m)
          })
        }
      : {})
  }
}
