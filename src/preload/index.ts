import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
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
  setHostGroup: (ids, group) => ipcRenderer.invoke('hosts:setGroup', ids, group),
  addGroup: (name) => ipcRenderer.invoke('groups:add', name),
  renameGroup: (from, to) => ipcRenderer.invoke('groups:rename', from, to),
  removeGroup: (name) => ipcRenderer.invoke('groups:remove', name),
  addIcon: (data) => ipcRenderer.invoke('icons:add', data),
  removeIcon: (id) => ipcRenderer.invoke('icons:remove', id),

  saveSnippet: (snippet) => ipcRenderer.invoke('snippets:save', snippet),
  deleteSnippet: (id) => ipcRenderer.invoke('snippets:delete', id),

  addCommand: (hostId, command) => ipcRenderer.send('commands:add', hostId, command),
  deleteCommand: (hostId, command) => ipcRenderer.send('commands:delete', hostId, command),
  clearCommands: (hostId) => ipcRenderer.send('commands:clear', hostId),

  getHistory: () => ipcRenderer.invoke('history:get'),
  deleteHistory: (id) => ipcRenderer.invoke('history:delete', id),
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

  sftpOpen: (tabId, hostId) => ipcRenderer.send('sftp:open', tabId, hostId),
  sftpClose: (tabId) => ipcRenderer.send('sftp:close', tabId),
  sftpReconnect: (tabId) => ipcRenderer.send('sftp:reconnect', tabId),
  sftpTrustHostKey: (tabId) => ipcRenderer.send('sftp:trustHostKey', tabId),
  onSftpStatus: (cb) => subscribe('sftp:status', cb),
  onSftpTransfer: (cb) => subscribe('sftp:transfer', cb),
  fsHome: (side, tabId) => ipcRenderer.invoke('fs:home', side, tabId),
  fsList: (side, tabId, path) => ipcRenderer.invoke('fs:list', side, tabId, path),
  fsMkdir: (side, tabId, path) => ipcRenderer.invoke('fs:mkdir', side, tabId, path),
  fsRename: (side, tabId, from, to) => ipcRenderer.invoke('fs:rename', side, tabId, from, to),
  fsDelete: (side, tabId, paths) => ipcRenderer.invoke('fs:delete', side, tabId, paths),
  sftpUpload: (tabId, localPaths, remoteDir) => ipcRenderer.send('sftp:upload', tabId, localPaths, remoteDir),
  sftpDownload: (tabId, remotePaths, localDir) => ipcRenderer.send('sftp:download', tabId, remotePaths, localDir),
  sftpCancel: (transferId) => ipcRenderer.send('sftp:cancel', transferId),
  pathForFile: (file) => webUtils.getPathForFile(file),

  onPrompt: (cb) => subscribe('prompt:show', cb),
  onPromptHide: (cb) => subscribe('prompt:hide', cb),
  answerPrompt: (id, answers) => ipcRenderer.send('prompt:answer', id, answers),

  getUpdateStatus: () => ipcRenderer.invoke('updates:get'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.send('updates:install'),
  onUpdateStatus: (cb) => subscribe('updates:status', cb),

  clipboardRead: () => ipcRenderer.invoke('clipboard:read'),
  clipboardWrite: (text) => ipcRenderer.send('clipboard:write', text),
  openExternal: (url) => ipcRenderer.send('app:openExternal', url)
}

contextBridge.exposeInMainWorld('api', api)
