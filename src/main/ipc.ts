import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, dialog, ipcMain, shell } from 'electron'
import { RELEASES_URL } from '../shared/constants'
import type { DomainId, DossierOp } from '../shared/dossier'
import type {
  AgentId,
  AgentTestResult,
  Attachment,
  BackupResult,
  Config,
  DeepPartial,
  SendRequest,
  SourceId,
  VaultEntryInput,
  VideoQuery
} from '../shared/types'
import { actions } from './actions'
import { agentLogin, agentModels, agentStatus, runTurn } from './agent'
import { userMessage } from './agent/prompt'
import { exportBackup, importBackup } from './backup'
import { browser } from './browser'
import { chat } from './chat'
import { configStore } from './config'
import { conversations } from './conversations'
import { getSpDoc, searchSp, spTitles } from './data/sp-query'
import { sync } from './data/sync'
import { liveStreams, searchVideos, videoDetail } from './data/videos'
import { demarches } from './dossier/demarches'
import { addDocuments, decryptedCopy, deleteDocument, documentBytes } from './dossier/documents'
import { dossier } from './dossier/store'
import { display } from './dossier/tokens'
import { fetchJson, query } from './http'
import { log } from './log'
import { paths } from './paths'
import { skills } from './skills'
import { findCommunes, searchAddress } from './tools/geo'
import { base } from './tools/tool'
import { applyLoginItem } from './tray'
import { updater } from './updater'
import { vault } from './vault'
import { broadcast, mainWindow, showMain } from './windows'

const MAX_FILE_BYTES = 25 * 1024 * 1024

const openDialog = (options: Electron.OpenDialogOptions) => (mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options))
const saveDialog = (options: Electron.SaveDialogOptions) => (mainWindow ? dialog.showSaveDialog(mainWindow, options) : dialog.showSaveDialog(options))
const confirm = async (options: Electron.MessageBoxOptions) =>
  (mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options)).response === 1

/** Documents with text go to the vault: the agent reads them through lire_document, identifiers scrubbed. */
const TEXT_DOCUMENT = /\.(pdf|txt|md|csv|json|xml|html?)$/i

/**
 * Attach files: documents with text are added to the vault (the agent gets a reference), images
 * are copied into the workspace, where the agent can look at them.
 */
async function pickFiles(domain: DomainId = 'identite'): Promise<Attachment[]> {
  const r = await openDialog({
    title: 'Joindre des fichiers',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'csv', 'json', 'xml', 'html', 'png', 'jpg', 'jpeg', 'webp', 'gif'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ]
  })
  if (r.canceled) return []
  const documents = r.filePaths.filter((f) => TEXT_DOCUMENT.test(f))
  const parts: Attachment[] = (await addDocuments(documents, domain)).map((d) => ({ type: 'document', id: d.id, title: d.title }))
  const files = r.filePaths.filter((f) => !TEXT_DOCUMENT.test(f))
  if (!files.length) return parts
  const dir = randomUUID().slice(0, 8)
  await mkdir(join(paths.files, dir), { recursive: true })
  for (const src of files) {
    const { size } = await stat(src)
    if (size > MAX_FILE_BYTES) throw new Error(`${basename(src)} dépasse 25 Mo.`)
    const name = basename(src).replace(/[^\w.\- ()àâäéèêëîïôöùûüç]/gi, '_')
    await copyFile(src, join(paths.files, dir, name))
    parts.push({ type: 'file', name, path: `files/${dir}/${name}`, size })
  }
  return parts
}

/** A short real turn: checks the CLI, the sign-in and Marianne's tools in one go. */
async function testAgent(): Promise<AgentTestResult> {
  const started = Date.now()
  let text = ''
  let tools = 0
  let error: string | undefined
  try {
    await runTurn(configStore.get().agent.provider, {
      message: userMessage(
        "Test de connexion : appelle l'outil jours_feries pour l'année en cours, puis réponds en une phrase avec le prochain jour férié.",
        []
      ),
      sessionId: randomUUID(),
      resume: false,
      signal: AbortSignal.timeout(180_000),
      onEvent: (e) => {
        if (e.type === 'text-delta') text += e.delta
        else if (e.type === 'text') text = e.text
        else if (e.type === 'tool') tools++
        else if (e.type === 'done') error = e.error
      }
    })
  } catch (err) {
    error = (err as Error).message
  }
  return error ? { ok: false, error } : { ok: true, text: text.trim(), ms: Date.now() - started, tools }
}

/** The commonest legal forms, by INSEE code (catégorie juridique). */
const FORMS: Record<string, string> = {
  '1000': 'entreprise individuelle',
  '5202': 'société en nom collectif',
  '5410': 'SARL',
  '5498': 'EURL',
  '5499': 'SARL',
  '5505': 'SA',
  '5510': 'SA',
  '5599': 'SA',
  '5710': 'SAS',
  '5720': 'SASU',
  '6540': 'SCI',
  '6541': 'SCI',
  '9210': 'association non déclarée',
  '9220': 'association déclarée'
}

/** A company's public details from its SIREN (the user types their own). */
async function lookupSiren(siren: string) {
  const s = siren.replace(/\s+/g, '')
  const data = await fetchJson<{
    results: Array<{
      siren: string
      nom_complet: string
      nature_juridique: string
      date_creation: string
      activite_principale: string
      siege: { adresse: string; libelle_activite_principale?: string }
      complements?: { est_entrepreneur_individuel?: boolean; est_association?: boolean }
    }>
  }>(`${base('entreprises')}/search${query({ q: s, per_page: 1 })}`)
  const r = data.results?.find((x) => x.siren === s)
  if (!r) return null
  const individual = !!r.complements?.est_entrepreneur_individuel
  return {
    siren: r.siren,
    denomination: r.nom_complet,
    forme: individual ? 'entreprise individuelle' : (FORMS[r.nature_juridique] ?? `catégorie juridique ${r.nature_juridique}`),
    activite: [r.activite_principale, r.siege.libelle_activite_principale].filter(Boolean).join(' · '),
    creation: r.date_creation ?? '',
    adresse: r.siege.adresse ?? '',
    association: !!r.complements?.est_association,
    individual
  }
}

/** The deputies of the département of the user's address. */
function myDeputies() {
  const insee = dossier.get().address.codeInsee
  if (!insee || !sync.ready('assemblee')) return []
  const dep = /^97/.test(insee) ? insee.slice(0, 3) : insee.slice(0, 2)
  const rows = sync.db
    .prepare(
      'select d.id, d.data, o.abrege as groupe from an_deputes d left join an_organes o on o.id = d.groupe_id where d.num_departement = ? order by cast(d.circo as integer)'
    )
    .all(dep.replace(/^0/, '').padStart(2, '0')) as Array<{ id: string; data: string; groupe: string | null }>
  return rows.map((r) => {
    const d = JSON.parse(r.data) as { prenom: string; nom: string; circo: string; departement: string; emails: string[] }
    return { id: r.id, name: `${d.prenom} ${d.nom}`, circo: d.circo, departement: d.departement, groupe: r.groupe ?? '', email: d.emails[0] ?? '' }
  })
}

export function registerIpc(): void {
  // Only the app's own pages may call: never a website, whatever window it ended up in.
  const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
  const trusted = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => {
    const url = e.senderFrame?.url ?? ''
    return url.startsWith('file://') || (!!devUrl && url.startsWith(devUrl))
  }
  const handle = (channel: string, fn: (...args: any[]) => unknown) =>
    // eslint-disable-line @typescript-eslint/no-explicit-any
    ipcMain.handle(`marianne:${channel}`, (e, ...args) => {
      if (!trusted(e)) throw new Error('Appel refusé')
      return fn(...args)
    })
  const on = (channel: string, fn: (...args: any[]) => void) =>
    // eslint-disable-line @typescript-eslint/no-explicit-any
    ipcMain.on(`marianne:${channel}`, (e, ...args) => {
      if (trusted(e)) fn(...args)
    })

  // App
  handle('getInfo', () => ({ version: app.getVersion(), platform: process.platform, dataDir: paths.home }))
  on('openDataDir', () => void shell.openPath(paths.home))
  on('openExternal', (url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })

  // Updates
  handle('getUpdateState', () => updater.state)
  on('checkForUpdates', () => void updater.check())
  on('downloadUpdate', () => void updater.download())
  on('installUpdate', () => updater.install())
  on('openReleases', () => void shell.openExternal(RELEASES_URL))

  // Config
  handle('getConfig', () => configStore.get())
  handle('setConfig', (patch: DeepPartial<Config>) => configStore.update(patch))

  // Agents
  handle('getAgentStatus', (id: AgentId, refresh?: boolean) => agentStatus(id, !!refresh))
  handle('openAgentLogin', (id: AgentId) => agentLogin(id))
  handle('listAgentModels', (id: AgentId) => agentModels(id))
  handle('testAgent', () => testAgent())

  // Conversations
  handle('listConversations', () => conversations.list())
  handle('getConversation', (id: string) => conversations.get(id))
  handle('deleteConversation', (id: string) => {
    chat.cancel(id)
    return conversations.delete(id)
  })
  handle('renameConversation', (id: string, title: string) => conversations.rename(id, title))
  handle('send', (req: SendRequest) => chat.send(req))
  handle('regenerate', (id: string) => chat.regenerate(id))
  on('cancel', (id: string) => chat.cancel(id))
  handle('pickFiles', (domain?: DomainId) => pickFiles(domain))
  on('respondAction', (id: string, accepted: boolean) => actions.respond(id, accepted))

  // Personal file
  handle('getDossier', () => ({ state: dossier.state, error: dossier.error, dossier: dossier.get() }))
  handle('dossierUpdate', (op: DossierOp) => dossier.apply(op))
  handle('tokenValues', () => dossier.tokens().map((t) => ({ token: t.token, label: t.label, value: display(t) })))
  handle('getDeadlines', (days?: number) => dossier.deadlines(new Date(), days ?? 400))
  handle('listDemarches', () => demarches())
  handle('addDocuments', async (domain: DomainId) => {
    const r = await openDialog({
      title: 'Ajouter des documents au coffre',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv', 'md', 'json', 'xml', 'html'] },
        { name: 'Tous les fichiers', extensions: ['*'] }
      ]
    })
    return r.canceled ? [] : addDocuments(r.filePaths, domain)
  })
  handle('openDocument', async (id: string) => {
    const error = await shell.openPath(await decryptedCopy(id))
    if (error) throw new Error(error)
  })
  handle('exportDocument', async (id: string) => {
    const meta = dossier.get().documents.find((x) => x.id === id)
    if (!meta) return false
    const r = await saveDialog({ title: 'Enregistrer une copie déchiffrée', defaultPath: meta.fileName })
    if (r.canceled || !r.filePath) return false
    await writeFile(r.filePath, documentBytes(id))
    return true
  })
  handle('deleteDocument', async (id: string) => {
    const meta = dossier.get().documents.find((x) => x.id === id)
    if (!meta) return false
    const ok = await confirm({
      type: 'warning',
      title: 'Supprimer du coffre',
      message: `Supprimer « ${meta.title} » du coffre ?`,
      detail: 'Le document chiffré sera effacé de cet ordinateur.',
      buttons: ['Annuler', 'Supprimer'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (ok) await deleteDocument(id)
    return ok
  })
  handle('spFiche', (id: string) => getSpDoc(id))
  handle('spSearch', (q: string, limit?: number) => searchSp(q, limit ?? 10).hits)
  handle('spTitles', (ids: string[]) => spTitles(ids))
  handle('searchAddress', (q: string) => searchAddress(q))
  handle('searchCommunes', async (q: string) =>
    q.trim().length < 2
      ? []
      : (await findCommunes(q, 6)).map((c) => ({ nom: c.nom, code: c.code, departement: c.codeDepartement, codesPostaux: c.codesPostaux }))
  )
  handle('lookupSiren', (siren: string) => lookupSiren(siren))
  handle('myDeputies', () => myDeputies())

  // Backup
  handle('exportBackup', async (passphrase: string): Promise<BackupResult> => {
    const r = await saveDialog({
      title: 'Enregistrer la sauvegarde',
      defaultPath: `marianne-${new Date().toISOString().slice(0, 10)}.marianne`,
      filters: [{ name: 'Sauvegarde Marianne', extensions: ['marianne'] }]
    })
    if (r.canceled || !r.filePath) return { ok: false }
    try {
      await exportBackup(passphrase, r.filePath)
      return { ok: true, path: r.filePath }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  handle('importBackup', async (passphrase: string): Promise<BackupResult> => {
    const r = await openDialog({
      title: 'Restaurer une sauvegarde',
      properties: ['openFile'],
      filters: [{ name: 'Sauvegarde Marianne', extensions: ['marianne'] }]
    })
    if (r.canceled || !r.filePaths[0]) return { ok: false }
    const ok = await confirm({
      type: 'warning',
      title: 'Restaurer une sauvegarde',
      message: 'Remplacer le dossier, les documents, les conversations et le trousseau de cet ordinateur par ceux de la sauvegarde ?',
      detail: 'Les données actuelles seront remplacées.',
      buttons: ['Annuler', 'Restaurer'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (!ok) return { ok: false }
    try {
      await importBackup(passphrase, r.filePaths[0])
      configStore.load()
      vault.load()
      conversations.reload()
      broadcast('config', configStore.get())
      broadcast('vault')
      return { ok: true, path: r.filePaths[0] }
    } catch (err) {
      log.warn('Backup restore failed:', (err as Error).message)
      return { ok: false, error: (err as Error).message }
    }
  })

  // Data sources
  handle('listSources', () => sync.status())
  handle('syncSource', (id: SourceId) => sync.sync(id))

  // Keychain
  handle('vaultStatus', () => vault.status())
  handle('listVault', () => vault.list())
  handle('saveVaultEntry', (entry: VaultEntryInput) => vault.save(entry))
  handle('deleteVaultEntry', async (id: string) => {
    const entry = vault.list().find((e) => e.id === id)
    if (!entry) return
    const ok = await confirm({
      type: 'warning',
      title: 'Supprimer du trousseau',
      message: `Supprimer « ${entry.label} » du trousseau ?`,
      detail: 'L’identifiant et le mot de passe seront effacés de cet ordinateur.',
      buttons: ['Annuler', 'Supprimer'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (ok) vault.delete(id)
  })
  handle('revealVaultSecret', (id: string) => vault.secret(id)?.password ?? '')

  // Websites and the built-in browser
  handle('listServices', () => dossier.services())
  on('openBrowser', (url: string) => browser.open(url))
  handle('getBrowserState', () => browser.state())
  on('browserNavigate', (url: string) => browser.navigate(url))
  on('browserBack', () => browser.back())
  on('browserForward', () => browser.forward())
  on('browserReload', () => browser.reload())
  on('browserFill', (id: string) => void browser.fill(id))
  on('browserOpenExternal', () => browser.openExternal())
  on('browserSendToChat', async () => {
    const page = await browser.capture()
    if (!page) return
    showMain()
    broadcast('attach', page)
  })

  // Assemblée nationale videos
  handle('searchVideos', (q: VideoQuery) => searchVideos(q))
  handle('getVideo', (id: string) => videoDetail(id))
  handle('liveStreams', () => liveStreams())

  // Skills
  handle('listSkills', () => skills.list())
  on('openSkillsDir', () => void shell.openPath(paths.skills))

  // Push events
  chat.on('update', (c) => broadcast('conversation', c))
  const pushList = () => void conversations.list().then((list) => broadcast('conversations', list))
  chat.on('list', pushList)
  conversations.on('changed', pushList)
  dossier.on('change', () => broadcast('dossier', { state: dossier.state, error: dossier.error, dossier: dossier.get() }))
  sync.on('change', (list) => broadcast('sources', list))
  vault.on('change', () => {
    broadcast('vault')
    browser.refresh()
  })
  updater.on('change', (s) => broadcast('update', s))
  configStore.on('change', (next: Config, prev: Config) => {
    broadcast('config', next)
    if (next.background.launchAtLogin !== prev.background.launchAtLogin) applyLoginItem()
  })
}
