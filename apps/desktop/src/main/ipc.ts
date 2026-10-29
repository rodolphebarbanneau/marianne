import { writeFile } from 'node:fs/promises'
import { ARCHIVE_EXT } from '@marianne/archive'
import { display, type ProfileOp } from '@marianne/profile'
import type { ProfileField } from '@marianne/sdk'
import { app, dialog, ipcMain, shell } from 'electron'
import type { Rect, UnlockSecret } from '../shared/api'
import type {
  AccountSettings,
  AppInfo,
  BrowserState,
  DeepPartial,
  DeviceConfig,
  DisplayChoice,
  DocumentPart,
  DomainId,
  EngineId,
  KeychainInput,
  PublicSourceId,
  SendRequest
} from '../shared/types'
import { accounts } from './account'
import { approvals } from './approvals'
import { browser } from './browser'
import { chat } from './chat'
import { configStore } from './config'
import { deadlines } from './deadlines'
import { content } from './content'
import { engineEvents, engineLights, engineStatus, forgetTranscripts, listModels, listSkills, openLogin } from './engines'
import { exportAll } from './export'
import { folders } from './folders'
import { keychain } from './keychain'
import { searchAddress, searchCommunes, lookupSiren } from './lookup'
import { openedArchives } from './opened-archives'
import { paths } from './paths'
import { documents, type DocumentPatch } from './profile/documents'
import { profile } from './profile/store'
import { franceDigest } from './public/france'
import { fetchNews } from './public/news'
import { sync } from './public/sync'
import { todayEvents } from './public/today'
import { services } from './host'
import { session } from './session'
import { applyLoginItem } from './tray'
import { updater } from './updater'
import { broadcast, dimTitleBar, mainWindow } from './windows'

/** When this run of the app started. */
const STARTED_AT = new Date().toISOString()

type Handler = (...args: any[]) => unknown // eslint-disable-line @typescript-eslint/no-explicit-any

const openDialog = (options: Electron.OpenDialogOptions) => (mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options))
const saveDialog = (options: Electron.SaveDialogOptions) => (mainWindow ? dialog.showSaveDialog(mainWindow, options) : dialog.showSaveDialog(options))

const pickFolder = async (title: string, defaultPath?: string) => {
  const r = await openDialog({ title, defaultPath, properties: ['openDirectory', 'createDirectory'] })
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
}

const DOCUMENT_FILTERS = [
  { name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv', 'md', 'json', 'xml', 'html'] },
  { name: 'Tous les fichiers', extensions: ['*'] }
]

/** Pick files and seal each into the archive. */
async function addFiles(title: string, domain: DomainId, folderId?: string) {
  const r = await openDialog({ title, properties: ['openFile', 'multiSelections'], filters: DOCUMENT_FILTERS })
  if (r.canceled) return []
  const added = []
  for (const file of r.filePaths) added.push(await documents.add(file, { domain, folderId }))
  return added
}

/** What the lock screen shows of the account, from the profile. */
function displayLabel(choice: DisplayChoice): string {
  const p = profile.get().person
  const first = p.firstNames.trim().split(/[\s,]+/)[0] ?? ''
  const last = (p.usedName || p.birthName).trim()
  if (choice === 'firstName') return first
  if (choice === 'initials') return [first, last].map((s) => s.charAt(0).toUpperCase()).join('')
  return ''
}

/** The user's names: a password built on them is weaker than it looks. */
function ownWords(): string[] {
  const p = profile.get().person
  return [p.firstNames, p.usedName, p.birthName]
    .join(' ')
    .split(/[\s,-]+/)
    .filter((w) => w.length > 2)
}

const pushFolders = () => {
  if (session.unlocked) broadcast('folders', folders.list())
}
const pushLights = () => void engineLights().then((lights) => broadcast('engineLights', lights))

export function registerIpc(): void {
  // Only the app's own pages may call: never a website, whatever view it ended up in.
  const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
  const trusted = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => {
    const url = e.senderFrame?.url ?? ''
    return url.startsWith('file://') || (!!devUrl && url.startsWith(devUrl))
  }
  const handle = (name: string, fn: Handler) =>
    ipcMain.handle(`marianne:${name}`, (e, ...args) => {
      if (!trusted(e)) throw new Error('Appel refusé')
      return fn(...args)
    })
  const on = (name: string, fn: Handler) =>
    ipcMain.on(`marianne:${name}`, (e, ...args) => {
      if (trusted(e)) fn(...args)
    })

  // ---------- app ----------
  handle('getInfo', (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform,
    dataDir: paths.home,
    dev: !app.isPackaged,
    startedAt: STARTED_AT
  }))
  on('openExternal', (url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })
  on('toggleFullscreen', () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()))
  on('dimTitleBar', (dim: boolean) => dimTitleBar(!!dim))
  // The screens from scratch, the archive still open. The browser panel is drawn here, over them: hidden until they show it again.
  on('reloadWindow', () => {
    browser.setBounds(null)
    mainWindow?.webContents.reload()
  })
  on('activity', () => session.touch())

  // ---------- updates ----------
  handle('getUpdateState', () => updater.state)
  on('checkForUpdates', () => void updater.check())
  on('downloadUpdate', () => void updater.download())
  on('installUpdate', () => updater.install())

  // ---------- this computer ----------
  handle('getConfig', () => configStore.get())
  handle('setConfig', (patch: DeepPartial<DeviceConfig>) => configStore.update(patch))

  // ---------- accounts and the session ----------
  handle('getSession', () => accounts.state())
  handle('listAccounts', () => accounts.list())
  handle('pickArchiveFolder', async () => {
    const folder = await pickFolder('Dossier des archives', configStore.get().archiveFolder || paths.home)
    if (folder) accounts.setFolder(folder)
    return folder
  })
  handle('pickArchiveFile', async () => {
    const r = await openDialog({
      title: 'Ouvrir une archive',
      properties: ['openFile'],
      filters: [{ name: 'Archive Marianne', extensions: [ARCHIVE_EXT.slice(1)] }]
    })
    return r.canceled || !r.filePaths[0] ? null : accounts.addOther(r.filePaths[0])
  })
  handle('takeOpenedArchive', () => openedArchives.take())
  handle('createAccount', (input: { password: string; display: string; avoid: string[] }) => accounts.create(input))
  handle('unlock', (id: string, secret: UnlockSecret) => accounts.unlock(id, secret))
  on('lock', () => accounts.lock('user'))
  handle('setPin', (pin: string) => accounts.setPin(pin))
  handle('removePin', () => accounts.removePin())
  handle('changePassword', (current: string, next: string) => accounts.changePassword(current, next, ownWords()))
  handle('resetPassword', (next: string) => accounts.resetPassword(next, ownWords()))
  handle('renewRecoveryKey', () => accounts.renewRecoveryKey())
  handle('setDisplay', (choice: DisplayChoice) => accounts.setDisplay(displayLabel(choice)))
  handle('getUsage', () => accounts.usage())
  handle('backupArchive', async () => {
    const r = await saveDialog({
      title: 'Copie de sauvegarde',
      defaultPath: accounts.defaultBackupName(),
      filters: [{ name: 'Archive Marianne', extensions: [ARCHIVE_EXT.slice(1)] }]
    })
    if (r.canceled || !r.filePath) return null
    accounts.backup(r.filePath)
    return r.filePath
  })
  handle('exportAll', async () => {
    const parent = await pickFolder('Tout exporter, en clair')
    return parent ? exportAll(parent) : null
  })
  on('showArchive', () => {
    if (session.unlocked) shell.showItemInFolder(session.archive.path)
  })
  handle('getAccountSettings', () => accounts.settings())
  handle('setAccountSettings', (patch: DeepPartial<AccountSettings>) => accounts.updateSettings(patch))

  // ---------- folders ----------
  handle('listFolders', () => folders.list())
  handle('getFolder', (id: string) => chat.view(id))
  on('seeFolder', (id: string) => folders.markSeen(id))
  handle('renameFolder', (id: string, title: string) => void folders.update(id, { title: title.trim() || 'Sans titre' }))
  handle('pinFolder', (id: string, pinned: boolean) => folders.pin(id, pinned))
  handle('snoozeFolder', (id: string, until: string) => folders.snooze(id, until))
  handle('settleFolder', (id: string, settled: boolean) => folders.settle(id, settled))
  handle('deleteFolder', (id: string) => {
    chat.cancel(id)
    folders.remove(id)
    forgetTranscripts(id)
  })
  handle('setFolderEngine', (id: string, engine: EngineId) => void folders.update(id, { engine }))
  handle('setFolderStep', (id: string, step: number, done: boolean) => void folders.setStep(id, step, done))
  handle('send', (req: SendRequest) => chat.send(req))
  handle('regenerate', (id: string) => chat.regenerate(id))
  on('cancel', (id: string) => chat.cancel(id))
  on('respondApproval', (id: string, accepted: boolean) => approvals.respond(id, accepted))
  handle('attachFiles', async (folderId?: string): Promise<DocumentPart[]> => {
    const folder = folderId ? folders.get(folderId) : null
    const added = await addFiles('Joindre des pièces', folder?.domain || 'identity', folderId)
    return added.map((d) => ({ type: 'document', id: d.id, title: d.title }))
  })

  // ---------- engines ----------
  handle('engineStatus', (id: EngineId, refresh?: boolean) => engineStatus(id, !!refresh))
  handle('engineLights', () => engineLights())
  handle('engineModels', (id: EngineId) => listModels(id))
  handle('engineLogin', (id: EngineId) => openLogin(id))
  handle('pickEngineHome', async (id: EngineId) => {
    const folder = await pickFolder('Dossier de configuration du moteur', configStore.get().engines[id].home || app.getPath('home'))
    if (folder) configStore.update({ engines: { [id]: { home: folder } } })
    return folder
  })

  // ---------- profile, documents, procedures ----------
  handle('getProfile', () => profile.get())
  handle('updateProfile', (op: ProfileOp) => profile.apply(op))
  handle('tokenValues', () => profile.tokens().map((t) => ({ token: t.token, label: t.label, value: display(t) })))
  handle('getDeadlines', (days?: number) => deadlines(new Date(), days ?? 400))
  handle('listProcedures', () => content.get().procedures)
  handle('listDocuments', () => documents.list())
  handle('addDocuments', (options: { domain: DomainId; folderId?: string }) => addFiles('Ajouter des pièces à l’archive', options.domain, options.folderId))
  handle('updateDocument', (id: string, patch: DocumentPatch) => documents.update(id, patch))
  handle('openDocument', async (id: string) => {
    const error = await shell.openPath(await documents.decryptedCopy(id))
    if (error) throw new Error(error)
  })
  handle('exportDocument', async (id: string) => {
    const meta = documents.get(id)
    if (!meta) return false
    const r = await saveDialog({ title: 'Enregistrer une copie en clair', defaultPath: meta.fileName })
    if (r.canceled || !r.filePath) return false
    await writeFile(r.filePath, documents.bytes(id))
    return true
  })
  handle('deleteDocument', (id: string) => documents.remove(id))
  handle('searchAddress', (q: string) => searchAddress(q))
  handle('searchCommunes', (q: string) => (q.trim().length < 2 ? [] : searchCommunes(q)))
  handle('lookupSiren', (siren: string) => lookupSiren(siren))

  // ---------- keychain ----------
  handle('listKeychain', () => keychain.list())
  handle('saveKeychain', (input: KeychainInput) => keychain.save(input))
  handle('deleteKeychain', (id: string) => keychain.remove(id))
  handle('revealKeychain', (id: string) => keychain.secret(id)?.password ?? '')

  // ---------- built-in browser ----------
  handle('browserState', () => browser.state())
  on('browserBounds', (rect: Rect | null) => browser.setBounds(rect))
  on('browserOpen', (url: string, folderId?: string) => browser.open(url, folderId))
  on('browserNavigate', (input: string) => browser.navigate(input))
  on('browserBack', () => browser.back())
  on('browserForward', () => browser.forward())
  on('browserReload', () => browser.reload())
  on('browserExternal', () => browser.openExternal())
  on('browserControl', (controller: BrowserState['controller']) => browser.setController(controller))
  handle('browserFillLogin', (entryId: string) => browser.fillLogin(entryId))
  handle('browserCapture', () => browser.capture())

  // ---------- skills ----------
  handle('listSkills', () => listSkills())
  on('openSkillsDir', () => void shell.openPath(paths.skills))

  // ---------- public information ----------
  handle('listPublicSources', () => sync.status())
  handle('syncPublicSource', (id: PublicSourceId) => sync.sync(id))
  handle('news', () => {
    const { news } = accounts.settings()
    return fetchNews({ sources: news.sources, perSource: news.perSource, group: news.group, custom: news.custom })
  })
  handle('todayEvents', () => todayEvents())
  handle('franceDigest', () => franceDigest())
  handle('listSites', () => content.get().sites)
  handle('newsSources', () => content.get().newsSources)
  handle('parliamentGroups', () => content.get().parliament)

  // ---------- services ----------
  handle('listServices', () => services.states())
  handle('callService', (id: string, method: string, args: unknown[]) => services.call(id, method, Array.isArray(args) ? args : []))
  handle('getServiceData', (id: string, key: string) => services.data(id, key))
  handle('setServiceData', (id: string, key: string, value: unknown) => services.setData(id, key, value))
  handle('syncService', (id: string) => services.sync(id))
  handle('serviceSummaries', (domain: DomainId) => services.summaries(domain))
  handle('setServiceAccess', (id: string, granted: ProfileField[]) => services.setAccess(id, Array.isArray(granted) ? granted : []))

  // ---------- pushed to the window ----------
  accounts.on('state', () => broadcast('session', accounts.state()))
  accounts.on('list', () => broadcast('accounts', accounts.list()))
  accounts.on('settings', (s: AccountSettings) => {
    broadcast('accountSettings', s)
    broadcast('services', services.states())
  })
  session.on('unlocked', () => broadcast('accounts', accounts.list()))
  session.on('locked', () => {
    chat.cancelAll()
    broadcast('accounts', accounts.list())
  })
  configStore.on('change', (next: DeviceConfig, prev: DeviceConfig) => {
    broadcast('config', next)
    if (next.background !== prev.background) applyLoginItem()
    if (next.updates.auto !== prev.updates.auto) updater.applyConfig()
    if (next.lockAfterMinutes !== prev.lockAfterMinutes) session.setIdleMinutes(next.lockAfterMinutes)
    if (JSON.stringify(next.engines) !== JSON.stringify(prev.engines)) pushLights()
    if (JSON.stringify(next.sources) !== JSON.stringify(prev.sources)) broadcast('services', services.states())
  })
  folders.on('list', pushFolders)
  folders.on('folder', (id: string) => {
    const view = chat.view(id)
    if (view) broadcast('folder', view)
  })
  chat.on('folder', (view) => broadcast('folder', view))
  engineEvents.on('busy', pushLights)
  profile.on('change', (p) => broadcast('profile', p))
  documents.on('change', () => broadcast('documents', documents.list()))
  keychain.on('change', () => broadcast('keychain'))
  browser.on('state', (s: BrowserState) => broadcast('browserState', s))
  browser.on('reveal', (folderId: string) => broadcast('browserReveal', folderId))
  updater.on('change', (s) => broadcast('update', s))
  sync.on('change', (list) => broadcast('publicSources', list))
  services.on('change', () => broadcast('services', services.states()))
  content.on('change', () => broadcast('content'))
}
