import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MarianneApi } from '../shared/api'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(`marianne:${channel}`, ...args)
const send = (channel: string, ...args: unknown[]) => ipcRenderer.send(`marianne:${channel}`, ...args)
const listen =
  <T>(channel: string) =>
  (cb: (payload: T) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, payload: T) => cb(payload)
    ipcRenderer.on(`marianne:${channel}`, handler)
    return () => ipcRenderer.removeListener(`marianne:${channel}`, handler)
  }

const api: MarianneApi = {
  platform: process.platform,

  getInfo: () => invoke('getInfo'),
  openDataDir: () => send('openDataDir'),
  openExternal: (url) => send('openExternal', url),
  onNavigate: listen('navigate'),

  getUpdateState: () => invoke('getUpdateState'),
  checkForUpdates: () => send('checkForUpdates'),
  downloadUpdate: () => send('downloadUpdate'),
  installUpdate: () => send('installUpdate'),
  openReleases: () => send('openReleases'),
  onUpdate: listen('update'),

  getConfig: () => invoke('getConfig'),
  setConfig: (patch) => invoke('setConfig', patch),
  onConfig: listen('config'),

  getAgentStatus: (id, refresh) => invoke('getAgentStatus', id, refresh),
  openAgentLogin: (id) => invoke('openAgentLogin', id),
  listAgentModels: (id) => invoke('listAgentModels', id),
  testAgent: () => invoke('testAgent'),

  listConversations: () => invoke('listConversations'),
  getConversation: (id) => invoke('getConversation', id),
  deleteConversation: (id) => invoke('deleteConversation', id),
  renameConversation: (id, title) => invoke('renameConversation', id, title),
  send: (request) => invoke('send', request),
  regenerate: (id) => invoke('regenerate', id),
  cancel: (id) => send('cancel', id),
  pickFiles: (domain) => invoke('pickFiles', domain),
  respondAction: (id, accepted) => send('respondAction', id, accepted),
  onConversation: listen('conversation'),
  onConversations: listen('conversations'),
  onAttach: listen('attach'),

  getDossier: () => invoke('getDossier'),
  dossierUpdate: (op) => invoke('dossierUpdate', op),
  onDossier: listen('dossier'),
  tokenValues: () => invoke('tokenValues'),
  getDeadlines: (days) => invoke('getDeadlines', days),
  listDemarches: () => invoke('listDemarches'),
  addDocuments: (domain) => invoke('addDocuments', domain),
  openDocument: (id) => invoke('openDocument', id),
  exportDocument: (id) => invoke('exportDocument', id),
  deleteDocument: (id) => invoke('deleteDocument', id),
  spFiche: (id) => invoke('spFiche', id),
  spSearch: (q, limit) => invoke('spSearch', q, limit),
  spTitles: (ids) => invoke('spTitles', ids),
  searchAddress: (q) => invoke('searchAddress', q),
  searchCommunes: (q) => invoke('searchCommunes', q),
  lookupSiren: (siren) => invoke('lookupSiren', siren),
  myDeputies: () => invoke('myDeputies'),

  exportBackup: (passphrase) => invoke('exportBackup', passphrase),
  importBackup: (passphrase) => invoke('importBackup', passphrase),

  listSources: () => invoke('listSources'),
  syncSource: (id) => invoke('syncSource', id),
  onSources: listen('sources'),

  vaultStatus: () => invoke('vaultStatus'),
  listVault: () => invoke('listVault'),
  saveVaultEntry: (entry) => invoke('saveVaultEntry', entry),
  deleteVaultEntry: (id) => invoke('deleteVaultEntry', id),
  revealVaultSecret: (id) => invoke('revealVaultSecret', id),
  onVault: listen('vault'),

  listServices: () => invoke('listServices'),
  openBrowser: (url) => send('openBrowser', url),
  getBrowserState: () => invoke('getBrowserState'),
  onBrowserState: listen('browserState'),
  browserNavigate: (url) => send('browserNavigate', url),
  browserBack: () => send('browserBack'),
  browserForward: () => send('browserForward'),
  browserReload: () => send('browserReload'),
  browserFill: (id) => send('browserFill', id),
  browserSendToChat: () => send('browserSendToChat'),
  browserOpenExternal: () => send('browserOpenExternal'),

  searchVideos: (q) => invoke('searchVideos', q),
  getVideo: (id) => invoke('getVideo', id),
  liveStreams: () => invoke('liveStreams'),

  listSkills: () => invoke('listSkills'),
  openSkillsDir: () => send('openSkillsDir')
}

contextBridge.exposeInMainWorld('marianne', api)
