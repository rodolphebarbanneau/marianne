import { writeFile } from 'node:fs/promises'
import { ARCHIVE_EXT } from '@marianne/archive'
import { display, type ProfileOp } from '@marianne/profile'
import type { ProfileField } from '@marianne/sdk'
import { app, dialog, ipcMain, shell } from 'electron'
import type { Rect, UnlockSecret } from '../shared/api'
import type { BugReportRequest } from '../shared/bug-report'
import type {
  AccountSettings,
  AppInfo,
  ApprovalAnswer,
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
import { cancelBugReport, prepareBugReport } from './bug-reporter'
import { chat } from './chat'
import { catalogue, communityPackages, SERVICE_FILE_EXT } from './community'
import { configStore } from './config'
import { deadlines } from './deadlines'
import { content } from './content'
import { engineEvents, engineLights, engineStatus, listModels, listSkills, openLogin } from './engines'
import { exportAll } from './export'
import { folders } from './folders'
import { everyLabel } from '../shared/tasks'
import type { CreateTask, PlannedTask, TaskEvery } from '../shared/types'
import { offeredTemplate, tasks, templateTask } from './tasks'
import { keychain } from './keychain'
import { searchAddress, searchCommunes, lookupSiren } from './lookup'
import { openedArchives } from './opened-archives'
import { openedServiceFiles } from './opened-service-files'
import { paths } from './paths'
import { documents, type DocumentPatch } from './profile/documents'
import { profile } from './profile/store'
import { news } from './public/news'
import { sync } from './public/sync'
import { REVIEWED_TICKET, screens, services } from './host'
import { session } from './session'
import { applyLoginItem } from './tray'
import { updater } from './updater'
import { broadcast, dimTitleBar, mainWindow } from './windows'

/** When this run of the app started. */
const STARTED_AT = new Date().toISOString()

type Handler = (...args: any[]) => unknown // eslint-disable-line @typescript-eslint/no-explicit-any

const openDialog = (options: Electron.OpenDialogOptions) => (mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options))
const saveDialog = (options: Electron.SaveDialogOptions) => (mainWindow ? dialog.showSaveDialog(mainWindow, options) : dialog.showSaveDialog(options))

/** A rhythm from the window: a period of zero would never end, and the calendar would loop on it. */
function checkEvery({ unit, n }: TaskEvery): void {
  if (!['day', 'week', 'month', 'year'].includes(unit) || !Number.isInteger(n) || n < 1 || n > 366) throw new Error('Ce rythme n’est pas valable.')
}

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
  handle('prepareBugReport', (req: BugReportRequest) => prepareBugReport(req))
  on('cancelBugReport', () => cancelBugReport())
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
  handle('renewRecoveryKey', (password: string) => accounts.renewRecoveryKey(password))
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
  handle('removeApprovalRule', (id: string) => approvals.removeRule(id))

  // ---------- folders ----------
  handle('listFolders', () => folders.list())
  handle('getFolder', (id: string) => chat.view(id))
  on('seeFolder', (id: string) => folders.markSeen(id))
  handle('renameFolder', (id: string, title: string) => void folders.update(id, { title: title.trim() || 'Sans titre' }))
  handle('pinFolder', (id: string, pinned: boolean) => folders.pin(id, pinned))
  handle('snoozeFolder', (id: string, until: string) => folders.snooze(id, until))
  handle('settleFolder', (id: string, settled: boolean) => folders.settle(id, settled))
  handle('deleteFolder', (id: string) => chat.deleteFolder(id))
  handle('setFolderEngine', (id: string, engine: EngineId) => void folders.update(id, { engine }))
  handle('setFolderStep', (id: string, step: number, done: boolean) => void folders.setStep(id, step, done))
  handle('send', (req: SendRequest) => chat.send(req))
  handle('regenerate', (id: string) => chat.regenerate(id))
  on('cancel', (id: string) => chat.cancel(id))
  on('respondApproval', (id: string, answer: ApprovalAnswer) => approvals.respond(id, answer))
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

  // ---------- planned tasks ----------
  handle('listTasks', () => tasks.list())
  handle('taskTemplates', () => services.taskTemplates())
  handle('createTask', (request: CreateTask) => {
    if (request.kind === 'reminder') {
      const title = request.title.trim()
      if (!title) throw new Error('Dites ce qui doit revenir.')
      checkEvery(request.every)
      return tasks.create({
        title,
        domain: request.domain,
        runner: 'remind',
        origin: { kind: 'user' },
        every: request.every,
        everyLabel: everyLabel(request.every)
      })
    }
    // The instruction and the sites come from the service here, never from the window.
    const template = offeredTemplate(services.taskTemplates(), tasks.list(), request.service, request.template)
    const task = template && templateTask(template, request.rhythm)
    if (!task) throw new Error('Cette tâche n’est plus proposée.')
    return tasks.create({ ...task, notify: request.notify })
  })
  handle('updateTask', (id: string, patch: { every?: TaskEvery; notify?: PlannedTask['notify'] }) => {
    if (patch.every) checkEvery(patch.every)
    const every = patch.every ? { every: patch.every, everyLabel: everyLabel(patch.every) } : {}
    void tasks.update(id, { ...every, ...(patch.notify ? { notify: patch.notify } : {}) })
  })
  handle('setTaskOn', (id: string, on: boolean) => void tasks.setOn(id, on))
  handle('runTask', (id: string) => tasks.runNow(id))
  handle('removeTask', (id: string) => tasks.remove(id))
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
  // The user's own addresses: a planned task's run gives way before they load (browser/index.ts).
  on('browserOpen', (url: string, folderId?: string) => void browser.openForUser(url, folderId))
  on('browserNavigate', (input: string) => void browser.navigate(input))
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
  handle('listSites', () => content.get().sites)
  handle('newsSources', () => content.get().newsSources)
  handle('newsStats', () => news.stats())
  handle('parliamentGroups', () => content.get().parliament)

  // ---------- services ----------
  handle('listServices', () => services.states())
  handle('callService', (id: string, method: string, args: unknown[]) => services.call(id, method, Array.isArray(args) ? args : []))
  handle('getServiceData', (id: string, key: string) => services.data(id, key))
  handle('setServiceData', (id: string, key: string, value: unknown) => services.setData(id, key, value))
  handle('syncService', (id: string) => services.sync(id))
  handle('serviceSummaries', (domain: DomainId) => services.summaries(domain))
  handle('setServiceAccess', (id: string, granted: ProfileField[]) => services.setAccess(id, Array.isArray(granted) ? granted : []))
  handle('addService', (id: string) => services.add(id))
  handle('removeService', (id: string) => services.remove(id))
  handle('serviceOpened', (id: string) => services.opened(id))
  handle('pinService', (id: string, pinned: boolean) => services.pin(id, pinned === true))
  handle('switchService', (id: string, on: boolean) => services.switch(id, on === true))
  handle('serviceTiles', () => services.tiles())
  handle('serviceHelp', (id: string) => services.help(id))
  // A community screen: a view of its own over the window, its messages checked and relayed (main/community/runtime/screen.ts).
  on('communityScreenOpen', (code: string) => screens.open(code))
  on('communityScreenBounds', (rect: Rect | null) => screens.setBounds(rect))
  on('communityScreenPost', (code: string, message: unknown) => screens.post(code, message))
  on('communityScreenClose', (code: string) => screens.close(code))
  screens.on('window', (event: { code: string; message: unknown }) => broadcast('communityScreen', event))
  services.on('change', () => screens.check())

  // ---------- community services: the catalogue, .3615 files ----------
  // Reviews and installs need an open account; a file reviewed waits for the user's agreement until the lock.
  const withAccount = () => {
    if (!session.unlocked) throw new Error('Ouvrez votre compte pour ajouter un service.')
  }
  handle('catalogue', () => catalogue.state(true))
  handle('chooseServiceFile', async () => {
    withAccount()
    const r = await openDialog({
      title: 'Ajouter un service',
      properties: ['openFile'],
      filters: [{ name: 'Service Marianne', extensions: [SERVICE_FILE_EXT.slice(1)] }]
    })
    return r.canceled || !r.filePaths[0] ? null : communityPackages.review(r.filePaths[0])
  })
  handle('readServiceFile', (path: string) => {
    withAccount()
    return communityPackages.review(path)
  })
  handle('installServiceFile', async (ticket: string) => {
    withAccount()
    // A version already on this computer, reviewed by this account now.
    if (typeof ticket === 'string' && ticket.startsWith(REVIEWED_TICKET)) return services.acceptVersion(ticket)
    await communityPackages.install(ticket)
  })
  handle('reviewInstalledService', (code: string) => {
    withAccount()
    return services.reviewInstalled(code)
  })
  handle('takeServiceFiles', () => openedServiceFiles.take())
  handle('addCatalogueService', async (code: string) => {
    withAccount()
    await communityPackages.addFromCatalogue(code)
  })
  catalogue.on('change', (state) => broadcast('catalogue', state))
  session.on('locked', () => communityPackages.forget())

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
    cancelBugReport()
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
  tasks.on('change', () => {
    if (session.unlocked) broadcast('tasks', tasks.list())
  })
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
  // What the tiles hold now, without asking any again: only the page, as it shows, does.
  services.on('tiles', () => broadcast('serviceTiles', services.tiles(false)))
  content.on('change', () => broadcast('content'))
}
