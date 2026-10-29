import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MarianneApi } from '../shared/api'

/**
 * `window.marianne`: each method calls the main-process channel of the same name
 * (`marianne:<name>`); `onX` listens to the event `x`. Fire-and-forget methods are listed apart.
 */

const SEND = [
  'openExternal',
  'toggleFullscreen',
  'reloadWindow',
  'dimTitleBar',
  'activity',
  'checkForUpdates',
  'downloadUpdate',
  'installUpdate',
  'lock',
  'showArchive',
  'seeFolder',
  'cancel',
  'respondApproval',
  'browserBounds',
  'browserOpen',
  'browserNavigate',
  'browserBack',
  'browserForward',
  'browserReload',
  'browserExternal',
  'browserControl',
  'openSkillsDir'
] as const

const INVOKE = [
  'getInfo',
  'getUpdateState',
  'getConfig',
  'setConfig',
  'getSession',
  'listAccounts',
  'pickArchiveFolder',
  'pickArchiveFile',
  'takeOpenedArchive',
  'createAccount',
  'unlock',
  'setPin',
  'removePin',
  'changePassword',
  'resetPassword',
  'renewRecoveryKey',
  'setDisplay',
  'getUsage',
  'backupArchive',
  'exportAll',
  'getAccountSettings',
  'setAccountSettings',
  'listFolders',
  'getFolder',
  'renameFolder',
  'pinFolder',
  'snoozeFolder',
  'settleFolder',
  'deleteFolder',
  'setFolderEngine',
  'setFolderStep',
  'send',
  'regenerate',
  'attachFiles',
  'engineStatus',
  'engineLights',
  'engineModels',
  'engineLogin',
  'pickEngineHome',
  'getProfile',
  'updateProfile',
  'tokenValues',
  'getDeadlines',
  'listProcedures',
  'listDocuments',
  'addDocuments',
  'updateDocument',
  'openDocument',
  'exportDocument',
  'deleteDocument',
  'searchAddress',
  'searchCommunes',
  'lookupSiren',
  'listKeychain',
  'saveKeychain',
  'deleteKeychain',
  'revealKeychain',
  'browserState',
  'browserFillLogin',
  'browserCapture',
  'listPublicSources',
  'syncPublicSource',
  'news',
  'todayEvents',
  'franceDigest',
  'listServices',
  'callService',
  'getServiceData',
  'setServiceData',
  'syncService',
  'serviceSummaries',
  'setServiceAccess',
  'listSkills',
  'listSites',
  'newsSources',
  'parliamentGroups'
] as const

const LISTEN = [
  'onNavigate',
  'onFullscreen',
  'onUpdate',
  'onConfig',
  'onSession',
  'onAccounts',
  'onOpenArchive',
  'onAccountSettings',
  'onFolders',
  'onFolder',
  'onEngineLights',
  'onProfile',
  'onDocuments',
  'onKeychain',
  'onBrowserState',
  'onBrowserReveal',
  'onPublicSources',
  'onServices',
  'onContent'
] as const

const api: Record<string, unknown> = { platform: process.platform }
for (const name of SEND) api[name] = (...args: unknown[]) => ipcRenderer.send(`marianne:${name}`, ...args)
for (const name of INVOKE) api[name] = (...args: unknown[]) => ipcRenderer.invoke(`marianne:${name}`, ...args)
for (const name of LISTEN) {
  const channel = `marianne:${name[2].toLowerCase()}${name.slice(3)}`
  api[name] = (cb: (payload: unknown) => void) => {
    const handler = (_e: IpcRendererEvent, payload: unknown) => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

// Every method of the API is in one of the lists.
type Listed = (typeof SEND)[number] | (typeof INVOKE)[number] | (typeof LISTEN)[number] | 'platform'
const complete: Exclude<keyof MarianneApi, Listed> extends never ? true : false = true
void complete

contextBridge.exposeInMainWorld('marianne', api as unknown as MarianneApi)
