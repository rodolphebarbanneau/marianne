import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { clipboard } from 'electron'
import {
  readManifest,
  serviceCode,
  type DomainId,
  type ProfileField,
  type ServiceDeadline,
  type ServiceManifest,
  type ServiceState,
  type ServiceSummary,
  type ServiceTrust
} from '@marianne/sdk'
import type { HomeCommune, ServiceModule, ServiceRuntime } from '@marianne/sdk/main'
import type { ServiceFileReview } from '../../shared/catalogue'
import type { TodayEvent } from '../../shared/public'
import { accelOf } from '../../shared/shortcuts'
import type { TileState } from '../../shared/types'
import { accounts } from '../account'
import { approvals } from '../approvals'
import { verdictOf, type CatalogueStore } from '../community/catalogue'
import type { CommunityPackages, InstalledPackage } from '../community/install'
import { linkProblems } from '../community/package'
import { MAX_STORED_BYTES, sandboxBridge } from '../community/runtime/bridge'
import { STORAGE_QUOTA } from '../community/runtime/limits'
import { askConsent } from '../community/runtime/consent'
import { communityHttp, servicePicture } from '../community/runtime/net'
import { electronSandbox } from '../community/runtime/sandbox'
import { listRuntime, type SchemeSource } from '../community/runtime/scheme'
import { CommunityScreens } from '../community/runtime/screen'
import { CommunityService } from '../community/runtime/service'
import { configStore } from '../config'
import { userAgent } from '../http'
import { log } from '../log'
import { paths } from '../paths'
import { profile } from '../profile/store'
import { getCommune } from '../public/geo'
import { session } from '../session'
import type { Tool } from '../tools/tool'
import { grantedFields, serviceContext, storageKind } from './context'
import { quotaStorage, type QuotaStorage } from './storage'
import { BUILTIN_SERVICES, RENAMED_SERVICES } from './registry'
import { ServiceSync } from './sync'
import { TILE_KIND, TileHost } from './tiles'

/**
 * The service host: activates each service with its context, keeps what the user made of them
 * (added, on, pinned), and is the one way the rest of the app reaches them: their views' calls,
 * their engine tools, guides and instructions, their lines of "Aujourd'hui", their tiles, their
 * sync jobs. Only the services the user added and didn't switch off are on. A service that fails
 * to load is left out; the others work.
 *
 * Built-in services run here, in the main process. A community service (a .3615 added on this
 * computer, see main/community) runs in a sandbox of its own (main/community/runtime), started
 * while an open account has it among its services and stopped at the lock; the host reaches it
 * through the same ServiceRuntime as a built-in one, each part a request to its sandbox.
 */

interface Loaded {
  manifest: ServiceManifest
  module: ServiceModule
  runtime: ServiceRuntime | null
  sync: ServiceSync
  error?: string
  /** Shipped with Marianne (its registry); false: a community service. */
  builtIn: boolean
  /** Among a new account's services (see BuiltInService). */
  starter: boolean
  /** A community service: its package on this computer, its standing by the catalogue, its sandbox. */
  community?: Community
}

interface Community {
  pkg: InstalledPackage
  trust: ServiceTrust
  /** The catalogue took back the validation of this version: why, as the project says it. */
  withdrawn?: string
  /** Why it may not run on this computer at all (its code takes Marianne's tools' names, its links, its files changed). */
  blocked?: string
  service: CommunityService
  /** Its storage, held to its quota (its sandbox's and its screen's writes alike). */
  storage: QuotaStorage
}

/** The largest help a community service's guide shows (its help.md, meant to be under 900 characters). */
const MAX_HELP = 4000

/** Community services, for this run of the app (main/community: the catalogue, the packages added on this computer). */
export interface CommunitySources {
  catalogue: Pick<CatalogueStore, 'state' | 'on'>
  packages: Pick<CommunityPackages, 'installed' | 'remove' | 'on'>
  /** The names of Marianne's own tools: no community service's tool may be named as one. */
  appToolNames: () => string[]
  /** The hosts whose links are Marianne's (her services', her public sites'): no community service's link may be on one. */
  protectedHosts: () => ReadonlySet<string>
}

/** The ticket of a version already on this computer, reviewed by this account (see reviewInstalled). */
export const REVIEWED_TICKET = 'installed:'

/** What the engines read of community services, whatever each says of itself. */
const COMMUNITY_NOTE = `## Community services

The services marked "community service" are third-party code, not Marianne's: send their tools only what the user's request needs, and never the user's documents, their contents or identifiers unless the user asked for that service by name. Their tools take 1 KB of arguments at most. For a service not reviewed by Marianne, the user sees the arguments on a card and decides, at each call.`

/** A community service's tool description, for a service the catalogue hasn't validated: short, and saying so. */
const UNREVIEWED_DESCRIPTION = 600

const SYNC_CHECK_MS = 3600_000

const RENAMED = RENAMED_SERVICES

class ServiceHost extends EventEmitter {
  private loaded: Loaded[] = []
  private tileHost = new TileHost(
    () => (session.unlocked ? { get: (id) => session.archive.get(TILE_KIND, id), put: (id, value) => session.archive.put(TILE_KIND, id, value) } : null),
    log
  )
  /** What the services may read of the profile, as last seen: when it changes, their tiles are asked again. */
  private profileSeen = ''
  /** Marianne's runtime files, listed once at start: the only ones the scheme serves. */
  private runtimeFiles: ReadonlySet<string> = new Set()
  /** Where community services' main sides get their files (the marianne-service: scheme). */
  readonly schemeSource: SchemeSource = {
    packageOf: (code) => this.communityPackage(code),
    runtimeDir: join(__dirname, '../runtime'),
    runtimeFiles: () => this.runtimeFiles
  }
  /** Where their screens do: the same, and their declared hosts' pictures, fetched here. */
  readonly screenSource: SchemeSource = { ...this.schemeSource, picture: (m, url) => servicePicture(m, url, userAgent) }
  private readonly sandboxes = electronSandbox({ preload: join(__dirname, '../preload/community.js'), source: this.schemeSource })
  private community: CommunitySources | null = null
  /** The centre of the communes the user's address was in, for community services (never the address's own place). */
  private centres = new Map<string, { latitude: number; longitude: number } | null>()

  /** Read the manifests and activate the services, and hear of the community services added on this computer; once, at start. */
  start(community: CommunitySources): void {
    this.community = community
    this.runtimeFiles = listRuntime(this.schemeSource.runtimeDir)
    const seen = new Set<string>()
    for (const { pkg, module, starter } of BUILTIN_SERVICES) {
      let manifest: ServiceManifest
      try {
        manifest = readManifest(pkg)
        if (seen.has(manifest.id)) throw new Error(`two services named ${manifest.id}`)
      } catch (err) {
        log.error('Service left out:', (err as Error).message)
        continue
      }
      seen.add(manifest.id)
      const entry: Loaded = { manifest, module, runtime: null, sync: null as unknown as ServiceSync, builtIn: true, starter }
      entry.sync = new ServiceSync(manifest, module.sync?.everyHours ?? 0, () => entry.runtime?.synced?.())
      entry.sync.on('change', () => this.emit('change'))
      try {
        entry.runtime = module.activate(serviceContext(manifest, entry.sync, () => this.tileHost.invalidate(manifest.id, true)))
        this.checkTools(entry)
      } catch (err) {
        entry.runtime = null
        entry.error = (err as Error).message
        log.error(`3615 ${manifest.id.toUpperCase()} failed to start:`, entry.error)
      }
      this.loaded.push(entry)
    }
    // The public data of a renamed service is downloaded again under its new code.
    for (const from of Object.keys(RENAMED)) rmSync(join(paths.services, from), { recursive: true, force: true })
    this.startCommunity(community)
    session.on('unlocked', () => {
      this.followRenamed()
      this.offerBuiltIns()
      this.adoptReviewed()
      this.communityHome()
      this.reconcileCommunity()
      // What the services may read now, so that the first change after unlocking is seen as one.
      this.profileSeen = this.profileKey()
    })
    session.on('unlocked', () => setTimeout(() => void this.syncDue(), 10_000).unref())
    session.on('locked', () => {
      this.tileHost.clear()
      this.profileSeen = ''
      this.reconcileCommunity()
      // The next account has its own records: the quotas' tallies are read again.
      for (const s of this.loaded) s.community?.storage.reset()
    })
    this.tileHost.on('change', () => this.emit('tiles'))
    profile.on('change', () => this.profileChanged())
    setInterval(() => void this.syncDue(), SYNC_CHECK_MS).unref()
  }

  /**
   * The user's data of a renamed service (favorites, clips…), its pin and its switch, moved to its new
   * code, once. What it may read of the profile is asked again: the new service asks for other fields.
   */
  private followRenamed(): void {
    const archive = session.archive
    for (const [from, to] of Object.entries(RENAMED)) {
      for (const id of archive.ids(storageKind(from))) {
        if (archive.get(storageKind(to), id) === null) archive.put(storageKind(to), id, archive.get(storageKind(from), id))
        archive.remove(storageKind(from), id)
      }
      const { pinned, added, offered, disabled, access } = accounts.settings().services
      if (![pinned, added, offered, disabled].some((list) => list.includes(from)) && !(from in access)) continue
      const rename = (list: string[]) => [...new Set(list.map((x) => (x === from ? to : x)))]
      const { [from]: _dropped, ...kept } = access
      accounts.updateSettings({
        services: { pinned: rename(pinned), added: rename(added), offered: rename(offered), disabled: rename(disabled), access: kept }
      })
    }
  }

  /**
   * The built-in services this account was never offered, offered once: the starters join its
   * services, the others wait in « découvrir ». An account from before « découvrir » keeps every
   * service it had.
   */
  private offerBuiltIns(): void {
    const { offered, added } = accounts.settings().services
    const fresh = this.loaded.filter((s) => s.builtIn && !offered.includes(s.manifest.id))
    if (!fresh.length) return
    accounts.updateSettings({
      services: {
        offered: [...offered, ...fresh.map((s) => s.manifest.id)],
        added: [...new Set([...added, ...fresh.filter((s) => s.starter).map((s) => s.manifest.id)])]
      }
    })
  }

  /** What of the profile the services' tiles may show: the whole address (a street chooses a constituency), the vehicles, the opinions. */
  private profileKey(): string {
    const p = profile.get()
    return JSON.stringify([p.address, p.vehicles, p.opinions])
  }

  /** The address, the vehicles or the opinions changed: what the services' tiles show may have. */
  private profileChanged(): void {
    if (!session.unlocked) return
    this.communityHome()
    const seen = this.profileKey()
    if (seen !== this.profileSeen) this.tileHost.invalidate()
    this.profileSeen = seen
  }

  // ---------------------------------------------------------------- community services

  /** The community services added on this computer, and what keeps them current: installs, removals, the catalogue, the account. */
  private startCommunity({ catalogue, packages }: CommunitySources): void {
    for (const pkg of packages.installed()) {
      const entry = this.communityEntry(pkg)
      if (entry) this.loaded.push(entry)
    }
    packages.on('installed', (pkg: InstalledPackage) => this.communityInstalled(pkg))
    packages.on('removed', ({ code }: { code: string }) => this.communityRemoved(code))
    catalogue.on('change', () => this.trustChanged())
    accounts.on('settings', () => this.reconcileCommunity())
    configStore.on('change', () => this.reconcileCommunity())
  }

  /** A community package as the host runs it: its manifest read again from its folder, its sandbox not started. */
  private communityEntry(pkg: InstalledPackage): Loaded | null {
    let manifest: ServiceManifest
    try {
      manifest = readManifest(JSON.parse(readFileSync(join(pkg.dir, 'package.json'), 'utf8')))
      if (manifest.id !== pkg.code) throw new Error(`its folder is ${pkg.code}, its manifest says ${manifest.id}`)
      if (this.loaded.some((s) => s.builtIn && s.manifest.id === manifest.id)) throw new Error(`${manifest.id} is a built-in service`)
    } catch (err) {
      log.error(`Community service ${pkg.code} left out:`, (err as Error).message)
      return null
    }
    const sync = new ServiceSync(manifest, 0, () => {})
    let service: CommunityService | null = null
    const stored = () => {
      this.tileHost.invalidate(manifest.id, true)
      service?.stored()
    }
    const storage = quotaStorage(manifest.id, `3615 ${serviceCode(manifest)}`, () => session.archive, stored, STORAGE_QUOTA)
    // A built-in service's context, but its network checked at each redirect and address, its home the commune only, its storage held to a quota.
    const ctx = {
      ...serviceContext(manifest, sync, stored, { dataDir: false }),
      http: communityHttp(manifest, userAgent),
      home: () => this.communityHome(),
      storage
    }
    service = new CommunityService({
      manifest,
      bridge: sandboxBridge(manifest, ctx),
      factory: this.sandboxes,
      log,
      // Its trust as it is at the call: the catalogue may have changed its mind since it started.
      beforeTool: (tool, args, call) => askConsent(approvals.request.bind(approvals), call.folderId, manifest, tool, community.trust, args)
    })
    const { verdict, reason } = verdictOf(this.community!.catalogue.state(), pkg.code, pkg.sha256)
    const blocked = this.blockedReason(manifest)
    const community: Community = {
      pkg,
      trust: verdict,
      ...(verdict === 'withdrawn' ? { withdrawn: reason ?? '' } : {}),
      ...(blocked ? { blocked } : {}),
      service,
      storage
    }
    service.on('change', () => this.emit('change'))
    const running = service
    return {
      manifest,
      module: running.module,
      sync,
      builtIn: false,
      starter: false,
      community,
      get runtime() {
        return running.status === 'starting' || running.status === 'ready' ? running.runtime : null
      },
      get error() {
        if (community.withdrawn !== undefined)
          return `la validation de cette version a été retirée par le projet${community.withdrawn ? ` (${community.withdrawn.replace(/[.\s]+$/, '')})` : ''}.`
        return community.blocked ?? running.error
      }
    }
  }

  /**
   * Why a community service may not run on this computer at all, or undefined: its code would
   * name its tools as Marianne's own or a built-in service's (`<code>_` starts one of their
   * names), or its links are on another's hosts.
   */
  private blockedReason(m: ServiceManifest): string | undefined {
    const builtIn = this.loaded.filter((s) => s.builtIn).flatMap((s) => (s.runtime?.tools ?? []).map((t) => toolName(s.manifest, t.name)))
    const taken = [...(this.community?.appToolNames() ?? []), ...builtIn].find((name) => name.startsWith(`${m.id}_`))
    if (taken) return `son code (${m.id}) se confond avec un outil de Marianne (${taken}) : Marianne ne le démarre pas.`
    const links = linkProblems(m, this.community?.protectedHosts() ?? new Set())
    if (links.length) return links[0].replace(/\.$/, '').replace(/^Le lien/, 'son lien') + '.'
    return undefined
  }

  /** Whether the files of a community service are still the ones added (installed.json): a file changed since, it doesn't run. */
  private untouched(c: Community): boolean {
    try {
      const names = Object.keys(c.pkg.files)
      return (
        names.length > 0 &&
        names.every(
          (name) =>
            createHash('sha256')
              .update(readFileSync(join(c.pkg.dir, name)))
              .digest('hex') === c.pkg.files[name]
        )
      )
    } catch {
      return false
    }
  }

  /** This account reviewed the version now on this computer (another account may have replaced it since). */
  private reviewed(entry: Loaded): boolean {
    const r = accounts.settings().services.reviewed[entry.manifest.id]
    return !!r && r.sha256 === entry.community!.pkg.sha256
  }

  /** Whether a community service should run now: among the open account's services, on, its connections on, not withdrawn nor blocked, reviewed. */
  private wanted(entry: Loaded): boolean {
    const c = entry.community
    if (!session.unlocked || !c || c.withdrawn !== undefined || c.blocked) return false
    const { added, disabled } = accounts.settings().services
    const connections = configStore.get().sources as Record<string, { enabled: boolean } | undefined>
    const id = entry.manifest.id
    return added.includes(id) && !disabled.includes(id) && entry.manifest.connections.every((c) => connections[c]?.enabled) && this.reviewed(entry)
  }

  /** Each community service's sandbox started or stopped, as `wanted` says; its files checked before it starts. */
  private reconcileCommunity(): void {
    for (const entry of this.loaded) {
      const c = entry.community
      if (!c) continue
      const want = this.wanted(entry)
      if (want && c.service.status === 'stopped') {
        if (!this.untouched(c)) {
          c.blocked = 'ses fichiers ont changé sur cet ordinateur depuis qu’il a été ajouté : Marianne ne le démarre pas.'
          log.warn(`3615 ${serviceCode(entry.manifest)}: its files changed since it was added; not started`)
          this.emit('change')
          continue
        }
        c.service.start()
      } else if (!want && c.service.status !== 'stopped') c.service.stop()
    }
  }

  /** The community services this account had before it said which version it reviewed: the ones here now, once. */
  private adoptReviewed(): void {
    const { added, reviewed } = accounts.settings().services
    const adopted = this.loaded.filter((s) => s.community && added.includes(s.manifest.id) && !reviewed[s.manifest.id])
    if (!adopted.length) return
    accounts.updateSettings({
      services: {
        reviewed: { ...reviewed, ...Object.fromEntries(adopted.map((s) => [s.manifest.id, { sha256: s.community!.pkg.sha256, version: s.manifest.version }])) }
      }
    })
  }

  /** This account reviewed this version of a community service (it added it, or reviewed it once another account had). */
  private noteReviewed(code: string, sha256: string, version: string): void {
    const { reviewed } = accounts.settings().services
    accounts.updateSettings({ services: { reviewed: { ...reviewed, [code]: { sha256, version } } } })
  }

  /** The version of a community service on this computer, to review: as a .3615 file is, its ticket the version's. */
  reviewInstalled(code: string): ServiceFileReview {
    const entry = this.find(code)
    const c = entry.community
    if (!c) throw new Error('Ce service n’est pas un service de la communauté.')
    const { verdict, entry: listed, reason } = verdictOf(this.community!.catalogue.state(), code, c.pkg.sha256)
    const before = accounts.settings().services.reviewed[code]
    return {
      ticket: `${REVIEWED_TICKET}${code}:${c.pkg.sha256}`,
      fileName: `${code}.3615`,
      // Its files' size on this computer (its .3615 isn't kept).
      size: Object.keys(c.pkg.files).reduce((n, name) => {
        try {
          return n + statSync(join(c.pkg.dir, name)).size
        } catch {
          return n
        }
      }, 0),
      sha256: c.pkg.sha256,
      manifest: entry.manifest,
      verdict,
      problems: [],
      sync: false,
      tools: entry.manifest.tools.map((t) => t.label),
      links: entry.manifest.links,
      ...(listed ? { entry: listed } : {}),
      ...(before ? { installed: before.version } : {}),
      ...(reason ? { withdrawnReason: reason } : {})
    }
  }

  /** The user agreed to the version reviewed (its ticket): among their services, on. */
  acceptVersion(ticket: string): void {
    const [code, sha] = ticket.slice(REVIEWED_TICKET.length).split(':')
    const entry = this.find(code)
    if (!entry.community || entry.community.pkg.sha256 !== sha) throw new Error('Cette version n’est plus celle de cet ordinateur : revoyez-la à nouveau.')
    if (verdictOf(this.community!.catalogue.state(), code, sha).verdict === 'withdrawn')
      throw new Error('La validation de cette version a été retirée : Marianne ne l’ajoute pas.')
    this.noteReviewed(code, sha, entry.manifest.version)
    this.add(code)
  }

  /** The commune of the user's address, as community services get it: its code, name, postcode and centre, never the address's own place. */
  communityHome(): HomeCommune | null {
    if (!session.unlocked) return null
    const a = profile.get().address
    if (!a.inseeCode) return null
    const centre = this.centres.get(a.inseeCode)
    if (centre === undefined) {
      const code = a.inseeCode
      this.centres.set(code, null)
      void getCommune(code).then(
        (c) => this.centres.set(code, c ? { latitude: c.latitude, longitude: c.longitude } : null),
        () => this.centres.delete(code)
      )
    }
    return { code: a.inseeCode, name: a.city, postcode: a.postcode, ...(centre ?? {}) }
  }

  /** A community service added (or updated): among the open account's services, started again on its new version. */
  private communityInstalled(pkg: InstalledPackage): void {
    try {
      this.communityRemoved(pkg.code, false)
      const entry = this.communityEntry(pkg)
      if (!entry) return
      this.loaded.push(entry)
      this.tileHost.invalidate(pkg.code)
      // Added by the open account's user, who reviewed this very file.
      if (session.unlocked) {
        this.noteReviewed(pkg.code, pkg.sha256, entry.manifest.version)
        this.add(pkg.code)
      }
      this.reconcileCommunity()
    } catch (err) {
      log.error(`Community service ${pkg.code} not started:`, (err as Error).message)
    } finally {
      this.emit('change')
    }
  }

  /** A community service off this computer: its sandbox stopped, its entry gone. */
  private communityRemoved(code: string, tell = true): void {
    const at = this.loaded.findIndex((s) => s.community && s.manifest.id === code)
    if (at < 0) return
    const { service } = this.loaded[at].community!
    service.stop()
    service.removeAllListeners()
    this.loaded.splice(at, 1)
    if (tell) this.emit('change')
  }

  /** The catalogue changed: each community service's standing again; a withdrawn validation switches it off. */
  private trustChanged(): void {
    let changed = false
    for (const entry of this.loaded) {
      const c = entry.community
      if (!c) continue
      const { verdict, reason } = verdictOf(this.community!.catalogue.state(), c.pkg.code, c.pkg.sha256)
      const withdrawn = verdict === 'withdrawn' ? (reason ?? '') : undefined
      if (verdict === c.trust && withdrawn === c.withdrawn) continue
      if (withdrawn !== undefined && c.withdrawn === undefined) log.warn(`3615 ${serviceCode(entry.manifest)}: its validation was withdrawn; switched off`)
      c.trust = verdict
      c.withdrawn = withdrawn
      changed = true
    }
    if (!changed) return
    this.reconcileCommunity()
    this.emit('change')
  }

  /** An active community service's folder and manifest, for the scheme that serves its pages; null otherwise. */
  communityPackage(code: string): { dir: string; manifest: ServiceManifest } | null {
    const entry = this.loaded.find((s) => s.community && s.manifest.id === code)
    if (!entry?.community || !entry.runtime) return null
    return { dir: entry.community.pkg.dir, manifest: entry.manifest }
  }

  /** A community service's help (its help.md), for Marianne's guide; '' for a built-in service (the window has theirs) or none. */
  help(id: string): string {
    const entry = this.find(id)
    if (!entry.community) return ''
    try {
      // Its words, as it wrote them: the guide shows them without resolving any [[token]].
      return readFileSync(join(entry.community.pkg.dir, 'help.md'), 'utf8').slice(0, MAX_HELP)
    } catch {
      return ''
    }
  }

  private checkTools(entry: Loaded): void {
    const names = new Set<string>()
    for (const t of entry.runtime?.tools ?? []) {
      if (!/^[a-z][a-z0-9_]*$/.test(t.name) || names.has(t.name)) throw new Error(`tool name "${t.name}" must be unique, lowercase, with underscores`)
      names.add(t.name)
    }
  }

  private find(id: string): Loaded {
    const entry = this.loaded.find((s) => s.manifest.id === id)
    if (!entry) throw new Error(`Service inconnu : ${id}`)
    return entry
  }

  /** Every service, with what the user made of it (while locked: the starters, none pinned nor off). */
  states(): ServiceState[] {
    const connections = configStore.get().sources as Record<string, { enabled: boolean } | undefined>
    const chosen = session.unlocked ? accounts.settings().services : null
    // A community service shows only to an open account that has it.
    const listed = this.loaded.filter((s) => s.builtIn || !!chosen?.added.includes(s.manifest.id))
    return listed.map((entry) => {
      const { manifest, module, runtime, sync, error, builtIn, starter, community } = entry
      const id = manifest.id
      const connected = manifest.connections.every((c) => connections[c]?.enabled)
      // Another account replaced it since this one reviewed it: off until this one reviews the new version.
      const pending = community && chosen && !this.reviewed(entry) ? chosen.reviewed[id] : undefined
      // A community service is available while it may run (its sandbox may still be starting, or stopped while it is off).
      const available = community ? connected && !error && !pending : !!runtime && connected
      const added = chosen ? chosen.added.includes(id) : starter
      return {
        manifest,
        available,
        on: available && added && !chosen?.disabled.includes(id),
        added,
        pinned: added && !!chosen?.pinned.includes(id),
        ...(chosen?.opened[id] ? { openedAt: chosen.opened[id] } : {}),
        tools: (runtime?.tools ?? []).map((t) => ({ name: toolName(manifest, t.name), label: t.label })),
        ...(module.sync ? { sync: sync.status() } : {}),
        ...(error ? { error } : {}),
        builtIn,
        ...(community ? { trust: community.trust } : {}),
        ...(pending ? { reviewedVersion: pending.version } : {}),
        access: {
          asked: manifest.permissions.profile,
          granted: chosen && id in chosen.access ? grantedFields(manifest) : null,
          ...(chosen?.reads[id] ? { readAt: chosen.reads[id] } : {})
        }
      }
    })
  }

  private active(): Loaded[] {
    const on = new Set(
      this.states()
        .filter((s) => s.on)
        .map((s) => s.manifest.id)
    )
    return this.loaded.filter((s) => on.has(s.manifest.id) && s.runtime)
  }

  /** A method of a service, called by its view. */
  async call(id: string, method: string, args: unknown[]): Promise<unknown> {
    const entry = this.find(id)
    if (!this.active().includes(entry)) throw new Error(`Le service ${entry.manifest.name} est désactivé.`)
    const fn = (entry.runtime!.methods as Record<string, (...a: unknown[]) => unknown>)[method]
    if (typeof fn !== 'function') throw new Error(`${entry.manifest.name} : méthode inconnue (${method})`)
    return fn(...args)
  }

  /** The tools of the services that are on, as the app's MCP server serves them. */
  tools(): Tool[] {
    return this.active().flatMap(({ manifest, runtime, community }) =>
      (runtime!.tools ?? []).map((t): Tool => {
        // A community service's tool says whose it is; one the catalogue hasn't validated says it briefly, and that it wasn't reviewed.
        const reviewed = !community || community.trust === 'validated'
        return {
          name: toolName(manifest, t.name),
          title: community ? `3615 ${serviceCode(manifest)} · ${t.label}` : `${manifest.name} · ${t.label}`,
          description: reviewed ? t.description : `Community service, not reviewed by Marianne: ${t.description.slice(0, UNREVIEWED_DESCRIPTION)}`,
          input: t.input,
          readOnly: t.readOnly,
          // A service never sees the user's identifiers: [[tokens]] are refused in its arguments.
          tokens: false,
          // Nor does a community service see the folder: it goes as far as the card, and stops there (CommunityService).
          run: (args, ctx) => t.run(args as never, { folderId: ctx.folderId })
        }
      })
    )
  }

  /** The guides of the services that are on (Markdown with front matter): a community service's only when the catalogue validates it. */
  skills(): Array<{ service: string; text: string; community: boolean }> {
    return this.active()
      .filter((s) => !s.community || s.community.trust === 'validated')
      .flatMap(({ manifest, runtime, community }) => (runtime!.skills ?? []).map((text) => ({ service: manifest.id, text, community: !!community })))
  }

  /**
   * The services that are on, for the engines' instructions: each with what it adds, or what it
   * is. A community service says so; its own instructions count only when the catalogue validates
   * it (otherwise its description, short), and a note on community services follows.
   */
  instructions(): string {
    const active = this.active()
    const parts = active.map(({ manifest, runtime, community }) => {
      const head = `## 3615 ${manifest.id.toUpperCase()} · ${manifest.name} (code ${manifest.id})`
      if (!community) return `${head}\n\n${runtime!.instructions?.trim() || manifest.description}`
      if (community.trust === 'validated') return `${head}\n\nCommunity service, reviewed by Marianne. ${runtime!.instructions?.trim() || manifest.description}`
      // Not reviewed: its code alone heads it, and its description (one line, 200 characters at most) says what it is.
      return `## 3615 ${manifest.id.toUpperCase()} (code ${manifest.id})\n\nCommunity service, not reviewed by Marianne. ${manifest.description}`
    })
    if (active.some((s) => s.community)) parts.push(COMMUNITY_NOTE)
    return parts.join('\n\n')
  }

  /** Their lines of "Aujourd'hui"; a failing service is left out. */
  async today(day: string): Promise<TodayEvent[]> {
    const parts = await Promise.allSettled(
      this.active()
        .filter((s) => s.runtime!.today)
        .map(async ({ manifest, runtime }) =>
          (await runtime!.today!(day)).map((item): TodayEvent => ({ ...item, id: `${manifest.id}:${item.id}`, kind: 'service', service: manifest.id }))
        )
    )
    return parts.flatMap((p) => (p.status === 'fulfilled' ? p.value : (log.warn('Today, from a service:', (p.reason as Error).message), [])))
  }

  /** The lines of the services that are on and useful for a domain, for its dashboard. */
  async summaries(domain: DomainId): Promise<Array<{ service: string; summary: ServiceSummary }>> {
    const parts = await Promise.allSettled(
      this.active()
        .filter((s) => s.manifest.domains.includes(domain) && s.runtime!.summary)
        .map(async ({ manifest, runtime }) => ({ service: manifest.id, summary: await runtime!.summary!(domain) }))
    )
    return parts.flatMap((p) =>
      p.status === 'fulfilled'
        ? p.value.summary
          ? [p.value as { service: string; summary: ServiceSummary }]
          : []
        : (log.warn('Summary, from a service:', (p.reason as Error).message), [])
    )
  }

  /** The deadlines the services that are on know of; a failing service is left out. */
  deadlines(): Array<ServiceDeadline & { service: string }> {
    return this.active().flatMap(({ manifest, runtime }) => {
      try {
        return (runtime!.deadlines?.() ?? []).filter((d) => manifest.domains.includes(d.domain)).map((d) => ({ ...d, service: manifest.id }))
      } catch (err) {
        log.warn(`Deadlines of 3615 ${manifest.id.toUpperCase()}:`, (err as Error).message)
        return []
      }
    })
  }

  /** The user's answer to what a service asks to read: the fields granted (none: refused). */
  setAccess(id: string, granted: ProfileField[]): void {
    const { manifest } = this.find(id)
    const access = { ...accounts.settings().services.access, [id]: manifest.permissions.profile.filter((f) => granted.includes(f)) }
    accounts.updateSettings({ services: { access } })
    this.tileHost.invalidate(id)
  }

  /** A service among the user's services (from « découvrir »), switched on. */
  add(id: string): void {
    this.find(id)
    const { added, disabled } = accounts.settings().services
    accounts.updateSettings({ services: { added: [...new Set([...added, id])], disabled: disabled.filter((x) => x !== id) } })
  }

  /**
   * A service out of the user's services, back in « découvrir »: unpinned, and what it may read
   * of the profile taken back (it asks again when added again). What it stored for the user stays.
   * A community service also leaves this computer: its sandbox stopped, its folder removed.
   */
  async remove(id: string): Promise<void> {
    const entry = this.find(id)
    const { added, pinned, access } = accounts.settings().services
    const { [id]: _taken, ...kept } = access
    accounts.updateSettings({ services: { added: added.filter((x) => x !== id), pinned: pinned.filter((x) => x !== id), access: kept } })
    if (!entry.community) return
    entry.community.service.stop()
    await this.community?.packages.remove(id)
  }

  /** Pinned as a tile, at the end, or unpinned: read and written at once, so that two quick clicks both count. */
  pin(id: string, pinned: boolean): void {
    this.find(id)
    const list = accounts.settings().services.pinned.filter((x) => x !== id)
    accounts.updateSettings({ services: { pinned: pinned ? [...list, id] : list } })
  }

  /** Switched on or off by the user, in the same way. */
  switch(id: string, on: boolean): void {
    this.find(id)
    const list = accounts.settings().services.disabled.filter((x) => x !== id)
    accounts.updateSettings({ services: { disabled: on ? list : [...list, id] } })
  }

  /** The user opened its screen: the Services page says when they last did. */
  opened(id: string): void {
    this.find(id)
    const { opened } = accounts.settings().services
    accounts.updateSettings({ services: { opened: { ...opened, [id]: new Date().toISOString() } } })
  }

  /**
   * The tiles of the pinned services that are on. `ask`: the page shows them, so the ones older
   * than their service's period are asked again (what comes is told by the 'tiles' event).
   */
  tiles(ask = true): Record<string, TileState> {
    if (!session.unlocked) return {}
    const shown = new Set(
      this.states()
        .filter((s) => s.on && s.pinned)
        .map((s) => s.manifest.id)
    )
    const sources = this.loaded
      .filter((s) => shown.has(s.manifest.id) && s.runtime)
      .map(({ manifest, module, runtime }) => ({
        manifest,
        tile: runtime!.tile ? () => runtime!.tile!() : undefined,
        everyMinutes: module.tile?.everyMinutes
      }))
    return this.tileHost.states(sources, ask)
  }

  /** The user's stored data for a service, read and written by its view. */
  data(id: string, key: string): unknown {
    this.find(id)
    return session.archive.get(storageKind(id), key) ?? null
  }

  setData(id: string, key: string, value: unknown): void {
    const entry = this.find(id)
    if (entry.community) {
      // A community screen's data, as its sandbox's: a key, plain data within a size, within its quota.
      const json = typeof key === 'string' && key && key.length <= 200 ? JSON.stringify(value ?? null) : undefined
      if (json === undefined || Buffer.byteLength(json) > MAX_STORED_BYTES)
        throw new Error(`3615 ${serviceCode(entry.manifest)} : donnée refusée (des données simples, 1 Mo au plus).`)
      entry.community.storage.put(key, JSON.parse(json))
    } else session.archive.put(storageKind(id), key, value)
    // What the user keeps in a service (a trip to pay, a favourite) is what its tile may show.
    this.tileHost.invalidate(id)
    entry.community?.service.stored()
  }

  /** Run a service's sync job now. */
  sync(id: string): Promise<void> {
    return this.find(id).sync.run()
  }

  /** The services that are on and whose data is old or missing. */
  private async syncDue(): Promise<void> {
    for (const s of this.active()) if (s.sync.due()) await s.sync.run()
  }
}

/** Engines see a service's tool as "<code>_<name>": parlement_ballots. */
const toolName = (m: ServiceManifest, name: string) => `${m.id}_${name}`

export const services = new ServiceHost()

/** Community services' screens, each a view of its own over Marianne's window (main/community/runtime/screen.ts). */
export const screens = new CommunityScreens({
  preload: join(__dirname, '../preload/community-screen.js'),
  source: services.screenSource,
  host: {
    manifestOf: (code) => services.communityPackage(code)?.manifest ?? null,
    home: () => services.communityHome(),
    call: (code, method, args) => services.call(code, method, args),
    load: (code, key) => services.data(code, key),
    save: (code, key, value) => services.setData(code, key, value),
    copy: (text) => clipboard.writeText(text.slice(0, 100_000)),
    touch: () => session.touch(),
    lockShortcut: () => accelOf('lock', process.platform === 'darwin', configStore.get().shortcuts),
    lock: () => accounts.lock('user'),
    log
  }
})

export const serviceTools = () => services.tools()
export const serviceToday = (day: string) => services.today(day)
