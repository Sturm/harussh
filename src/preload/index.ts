import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { HarusshApi } from '../shared/types'

function subscribe<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as A))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: HarusshApi = {
  platform: process.platform,
  getData: () => ipcRenderer.invoke('data:get'),

  saveHost: (input) => ipcRenderer.invoke('hosts:save', input),
  deleteHost: (id) => ipcRenderer.invoke('hosts:delete', id),
  readKeyFile: () => ipcRenderer.invoke('hosts:readKeyFile'),

  saveSnippet: (snippet) => ipcRenderer.invoke('snippets:save', snippet),
  deleteSnippet: (id) => ipcRenderer.invoke('snippets:delete', id),

  getHistory: () => ipcRenderer.invoke('history:get'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),

  listThemes: () => ipcRenderer.invoke('themes:list'),
  openThemesFolder: () => ipcRenderer.invoke('themes:openFolder'),
  importTheme: () => ipcRenderer.invoke('themes:import'),
  saveThemeCopy: (theme) => ipcRenderer.invoke('themes:saveCopy', theme),
  onThemesChanged: (cb) => subscribe('themes:changed', cb),
  setTitleBarColors: (background, symbols) => ipcRenderer.send('window:titleBarColors', background, symbols),

  sshOpen: (tabId, hostId, cols, rows) => ipcRenderer.send('ssh:open', tabId, hostId, cols, rows),
  sshWrite: (tabId, data) => ipcRenderer.send('ssh:write', tabId, data),
  sshResize: (tabId, cols, rows) => ipcRenderer.send('ssh:resize', tabId, cols, rows),
  sshClose: (tabId) => ipcRenderer.send('ssh:close', tabId),
  sshReconnect: (tabId) => ipcRenderer.send('ssh:reconnect', tabId),
  sshTrustHostKey: (tabId) => ipcRenderer.send('ssh:trustHostKey', tabId),
  onSshData: (cb) => subscribe('ssh:data', cb),
  onSshStatus: (cb) => subscribe('ssh:status', cb),

  clipboardRead: () => ipcRenderer.invoke('clipboard:read'),
  clipboardWrite: (text) => ipcRenderer.send('clipboard:write', text),
  openExternal: (url) => ipcRenderer.send('app:openExternal', url)
}

contextBridge.exposeInMainWorld('api', api)
