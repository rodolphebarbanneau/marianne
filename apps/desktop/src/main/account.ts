import { mkdirSync, statSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { EventEmitter } from 'node:events'
import {
  accountFile,
  ARCHIVE_EXT,
  createArchive,
  listAccounts,
  newAccountId,
  openArchive,
  PinStore,
  readHeader,
  recoverArchive,
  unlockArchive,
  type Archive,
  type Keystore,
  type LockReason
} from '@marianne/archive'
import { safeStorage } from 'electron'
import { DEFAULT_ACCOUNT_SETTINGS } from '../shared/config'
import { checkPassword, checkPin } from '../shared/password'
import type { AccountInfo, AccountSettings, DeepPartial, SessionState, Usage } from '../shared/types'
import { accountSettings, configStore } from './config'
import { content } from './content'
import { samePath } from './files'
import { paths } from './paths'
import { session } from './session'
import { upgradeNews } from './upgrade-news'
import { isLinux } from './util'

/**
 * Accounts on this computer: creating one, unlocking it (master password, recovery key, or the
 * PIN set on this computer), and what an open account owns besides its data: its settings and
 * its space. The data itself goes through the stores (profile, folders, keychain).
 */

let keystoreReady = false

/** Asked once, when the app is ready: whether the OS keystore can seal a PIN's device secret here. */
export async function checkKeystore(): Promise<void> {
  // Linux without a keyring falls back to a fixed key: a PIN would protect nothing there.
  keystoreReady = (await safeStorage.isAsyncEncryptionAvailable()) && !(isLinux && safeStorage.getSelectedStorageBackend() === 'basic_text')
}

const electronKeystore: Keystore = {
  available: () => keystoreReady,
  encrypt: (plain) => safeStorage.encryptStringAsync(plain),
  decrypt: async (sealed) => (await safeStorage.decryptStringAsync(sealed)).result
}

export const pins = new PinStore(paths.devices, electronKeystore)

export type Secret = { password: string } | { recoveryKey: string } | { pin: string }

const SETTINGS = 'settings'

function info(file: string, id: string, display: string): AccountInfo {
  const stat = statSync(file)
  return { id, display, file, size: stat.size, modified: stat.mtime.toISOString(), hasPin: pins.has(id) }
}

class Accounts extends EventEmitter {
  constructor() {
    super()
    session.on('unlocked', () => this.emit('state'))
    session.on('locked', () => this.emit('state'))
  }

  state(): SessionState {
    const archive = session.maybe
    return { unlocked: !!archive, account: archive ? info(archive.path, archive.id, archive.header.display) : null, pinAvailable: pins.available() }
  }

  /** The accounts in the chosen folder, and the ones opened from elsewhere. */
  list(): AccountInfo[] {
    const config = configStore.get()
    const open = session.maybe
    const files = [...listAccounts(config.archiveFolder)]
    for (const file of config.otherArchives) {
      const header = readHeader(file)
      if (header && !files.some((f) => f.id === header.id)) files.push({ ...header, file, size: 0, modified: '' })
    }
    const out = files.map((f) => info(f.file, f.id, f.display))
    // The open archive is locked exclusively: its header can't be read from outside, so it comes from the session.
    if (open && !out.some((a) => a.id === open.id)) out.unshift(info(open.path, open.id, open.header.display))
    return out
  }

  setFolder(folder: string): void {
    configStore.update({ archiveFolder: folder })
    this.emit('list')
  }

  /** Remember an archive picked anywhere (a USB key…). */
  addOther(file: string): AccountInfo {
    if (!file.toLowerCase().endsWith(ARCHIVE_EXT)) throw new Error('Ce fichier n’est pas une archive Marianne.')
    const header = readHeader(file)
    if (!header) throw new Error('Ce fichier n’est pas une archive Marianne, ou il est déjà ouvert.')
    const { archiveFolder, otherArchives } = configStore.get()
    if (!samePath(dirname(file), archiveFolder) && !otherArchives.some((f) => samePath(f, file)))
      configStore.update({ otherArchives: [...otherArchives, file] })
    this.emit('list')
    return info(file, header.id, header.display)
  }

  private fileOf(id: string): string {
    const found = this.list().find((a) => a.id === id)
    if (!found) throw new Error('Compte introuvable.')
    return found.file
  }

  async create(options: { password: string; display: string; avoid?: string[] }): Promise<{ recoveryKey: string; state: SessionState }> {
    const folder = configStore.get().archiveFolder
    if (!folder) throw new Error('Choisissez d’abord où ranger les archives.')
    if (!checkPassword(options.password, options.avoid).ok) throw new Error('Cette phrase de passe n’est pas assez solide.')
    mkdirSync(folder, { recursive: true })
    const id = newAccountId(folder)
    const { archive, recoveryKey } = await createArchive(accountFile(folder, id), { id, display: options.display, password: options.password })
    archive.put(SETTINGS, 'account', DEFAULT_ACCOUNT_SETTINGS)
    this.opened(archive)
    return { recoveryKey, state: this.state() }
  }

  /** Unlock an account. A recovery key opens it so a new password can be set. */
  async unlock(id: string, secret: Secret): Promise<SessionState> {
    const file = this.fileOf(id)
    let archive: Archive
    if ('password' in secret) archive = await unlockArchive(file, secret.password)
    else if ('recoveryKey' in secret) archive = await recoverArchive(file, secret.recoveryKey)
    else {
      const key = await pins.unlock(id, secret.pin)
      try {
        archive = openArchive(file, key)
      } finally {
        key.fill(0)
      }
    }
    this.opened(archive)
    return this.state()
  }

  private opened(archive: Archive): void {
    // Before anyone reads or saves the settings: a save would drop what an older Marianne kept.
    upgradeNews(
      archive,
      content.get().newsSources.map((s) => s.id)
    )
    session.open(archive)
    session.setIdleMinutes(configStore.get().lockAfterMinutes)
    configStore.update({ lastAccount: archive.id })
  }

  lock(reason: LockReason = 'user'): void {
    session.lock(reason)
  }

  async setPin(pin: string): Promise<void> {
    const problem = checkPin(pin)
    if (problem) throw new Error(problem)
    const key = session.archive.dataKey()
    try {
      await pins.set(session.archive.id, pin, key)
    } finally {
      key.fill(0)
    }
    this.emit('state')
  }

  removePin(): void {
    pins.remove(session.archive.id)
    this.emit('state')
  }

  async changePassword(current: string, next: string, avoid: string[] = []): Promise<void> {
    if (!(await session.archive.verifyPassword(current))) throw new Error('Phrase de passe actuelle incorrecte.')
    if (!checkPassword(next, avoid).ok) throw new Error('Cette phrase de passe n’est pas assez solide.')
    await session.archive.changePassword(next)
  }

  /** After unlocking with the recovery key: a new password without the old one. */
  async resetPassword(next: string, avoid: string[] = []): Promise<void> {
    if (!checkPassword(next, avoid).ok) throw new Error('Cette phrase de passe n’est pas assez solide.')
    await session.archive.changePassword(next)
  }

  renewRecoveryKey(): Promise<string> {
    return session.archive.renewRecoveryKey()
  }

  setDisplay(display: string): void {
    session.archive.setDisplay(display)
    this.emit('state')
  }

  usage(): Usage {
    const archive = session.archive
    const { used, capacity } = archive.usage()
    const conversations = archive.recordBytes('messages') + archive.fileBytes('transcript:')
    const documents = archive.fileBytes() - archive.fileBytes('transcript:')
    return { used, capacity, documents, conversations, other: Math.max(0, used - documents - conversations) }
  }

  /** A backup: a copy of the archive, still encrypted with the same password. */
  backup(path: string): void {
    session.archive.copyTo(path)
  }

  defaultBackupName(): string {
    return basename(session.archive.path, ARCHIVE_EXT) + `-sauvegarde-${new Date().toISOString().slice(0, 10)}${ARCHIVE_EXT}`
  }

  settings(): AccountSettings {
    return accountSettings(session.archive.get(SETTINGS, 'account'))
  }

  updateSettings(patch: DeepPartial<AccountSettings>): AccountSettings {
    const next = accountSettings(this.settings(), patch)
    session.archive.put(SETTINGS, 'account', next)
    this.emit('settings', next)
    return next
  }
}

export const accounts = new Accounts()
