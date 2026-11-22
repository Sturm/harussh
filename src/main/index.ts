import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  powerMonitor,
  screen,
  session,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { AppData } from '../shared/types'
import * as schema from './schemas'
import { SftpManager } from './sftp'
import { SshManager } from './ssh'
import { Store } from './store'
import { ThemeStore } from './themes'

const isMac = process.platform === 'darwin'
const TABBAR_HEIGHT = 44

let win: BrowserWindow | null = null
let store: Store
let themes: ThemeStore
let ssh: SshManager
let sftp: SftpManager

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

// Restores window size; position only if it is still on some display.
function restoreBounds(): Partial<Electron.Rectangle> | undefined {
  const b = store.getWindowState()?.bounds
  if (!b) return undefined
  const visible = screen.getAllDisplays().some(({ workArea: a }) => {
    return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y
  })
  return visible ? b : { width: b.width, height: b.height }
}

function createWindow(): void {
  const bounds = restoreBounds()
  win = new BrowserWindow({
    width: 1200,
    height: 760,
    ...bounds,
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: 'harussh',
    // Packaged builds get their icon from electron-builder; this covers `npm run dev`.
    ...(!app.isPackaged && !isMac ? { icon: join(app.getAppPath(), 'build/icon.png') } : {}),
    backgroundColor: '#171a23',
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 16, y: 15 } }
      : { titleBarOverlay: { color: '#0f1117', symbolColor: '#e6e9f0', height: TABBAR_HEIGHT } }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (store.getWindowState()?.maximized) win.maximize()
  win.once('ready-to-show', () => win?.show())

  win.on('close', () => {
    if (!win) return
    store.setWindowState({ bounds: win.getNormalBounds(), maximized: win.isMaximized() })
  })
  win.on('closed', () => {
    ssh.closeAll()
    sftp.closeAll()
    win = null
  })

  // Links from the terminal open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win?.webContents.toggleDevTools()
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function openExternal(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
}

function buildMenu(): void {
  if (!isMac) {
    // No menu on Windows/Linux — default accelerators (Ctrl+R, Ctrl+W…) would
    // steal keys the remote shell needs.
    Menu.setApplicationMenu(null)
    return
  }
  // On macOS the Edit menu is required for Cmd+C/V/A to work in inputs.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [{ role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }]
      },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] }
    ])
  )
}

// Every IPC channel validates its arguments and only accepts calls from our own window.
function fromOwnWindow(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return !!win && !win.isDestroyed() && e.sender === win.webContents
}

function handle<T extends z.ZodTuple>(channel: string, args: T, fn: (...args: z.output<T>) => unknown): void {
  ipcMain.handle(channel, (e, ...raw: unknown[]) => {
    if (!fromOwnWindow(e)) throw new Error(`IPC ${channel}: unexpected sender`)
    return fn(...args.parse(raw))
  })
}

function on<T extends z.ZodTuple>(channel: string, args: T, fn: (...args: z.output<T>) => void): void {
  ipcMain.on(channel, (e, ...raw: unknown[]) => {
    if (!fromOwnWindow(e)) return
    const parsed = args.safeParse(raw)
    if (parsed.success) fn(...parsed.data)
    else console.error(`IPC ${channel}: invalid arguments`, z.prettifyError(parsed.error))
  })
}

const noArgs = z.tuple([])

function registerIpc(): void {
  handle('data:get', noArgs, (): AppData => ({
    hosts: store.getHosts(),
    snippets: store.getSnippets(),
    history: store.getHistory(),
    settings: store.getSettings(),
    themes: themes.list(),
    commands: store.getCommands(),
    groups: store.getGroups(),
    secretsEncrypted: store.secretsEncrypted
  }))

  handle('hosts:save', z.tuple([schema.hostInput]), (input) => store.saveHost(input))
  handle('hosts:delete', z.tuple([schema.id]), (id) => store.deleteHost(id))
  const group = z.string().max(200)
  handle('hosts:setGroup', z.tuple([z.array(schema.id).max(10_000), group]), (ids, name) => store.setGroup(ids, name))
  handle('groups:add', z.tuple([group]), (name) => store.addGroup(name))
  handle('groups:rename', z.tuple([group, group]), (from, to) => store.renameGroup(from, to))
  handle('groups:remove', z.tuple([group]), (name) => store.removeGroup(name))
  handle('hosts:readKeyFile', noArgs, async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Choose a private key',
      defaultPath: join(homedir(), '.ssh'),
      properties: ['openFile', 'showHiddenFiles']
    })
    const path = res.filePaths[0]
    if (res.canceled || !path) return null
    if ((await stat(path)).size > 64 * 1024) throw new Error("This doesn't look like an SSH key (file too large).")
    return readFile(path, 'utf8')
  })

  handle('snippets:save', z.tuple([schema.snippetInput]), (s) => store.saveSnippet(s))
  handle('snippets:delete', z.tuple([schema.id]), (id) => store.deleteSnippet(id))

  const command = z.string().min(1).max(8192)
  on('commands:add', z.tuple([schema.id, command]), (hostId, cmd) => store.addCommand(hostId, cmd))
  on('commands:delete', z.tuple([schema.id, command]), (hostId, cmd) => store.deleteCommand(hostId, cmd))
  on('commands:clear', z.tuple([schema.id]), (hostId) => store.clearCommands(hostId))

  handle('history:get', noArgs, () => store.getHistory())
  handle('history:clear', noArgs, () => store.clearHistory())

  handle('settings:save', z.tuple([schema.settingsPatch]), (patch) => store.saveSettings(patch))

  handle('themes:list', noArgs, () => themes.list())
  handle('themes:openFolder', noArgs, () => shell.openPath(themes.dir))
  handle('themes:saveCopy', z.tuple([schema.themeInput]), (theme) => {
    const saved = themes.saveCopy(theme)
    if (saved.file) shell.showItemInFolder(saved.file)
    return saved
  })
  handle('themes:import', noArgs, async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Import theme',
      filters: [{ name: 'harussh theme', extensions: ['json'] }],
      properties: ['openFile']
    })
    const path = res.filePaths[0]
    if (res.canceled || !path) return null
    const theme = themes.import(path)
    if (!theme) throw new Error('Invalid theme file.')
    return theme
  })
  on('window:titleBarColors', z.tuple([schema.cssColor, schema.cssColor]), (color, symbolColor) => {
    if (!isMac && win) win.setTitleBarOverlay({ color, symbolColor, height: TABBAR_HEIGHT })
  })

  const { tabId, termSize } = schema
  on('ssh:open', z.tuple([tabId, schema.id, termSize, termSize]), (tab, hostId, cols, rows) =>
    ssh.open(tab, hostId, cols, rows)
  )
  on('ssh:write', z.tuple([tabId, z.string().max(1024 * 1024)]), (tab, data) => ssh.write(tab, data))
  on('ssh:resize', z.tuple([tabId, termSize, termSize]), (tab, cols, rows) => ssh.resize(tab, cols, rows))
  on('ssh:close', z.tuple([tabId]), (tab) => ssh.close(tab))
  on('ssh:reconnect', z.tuple([tabId]), (tab) => ssh.reconnect(tab))
  on('ssh:trustHostKey', z.tuple([tabId]), (tab) => ssh.trustHostKey(tab))

  const { fileSide, fsPath, fsPaths } = schema
  on('sftp:open', z.tuple([tabId, schema.id]), (tab, hostId) => sftp.open(tab, hostId))
  on('sftp:close', z.tuple([tabId]), (tab) => sftp.close(tab))
  on('sftp:reconnect', z.tuple([tabId]), (tab) => sftp.reconnect(tab))
  on('sftp:trustHostKey', z.tuple([tabId]), (tab) => sftp.trustHostKey(tab))
  on('sftp:upload', z.tuple([tabId, fsPaths, fsPath]), (tab, from, to) => sftp.upload(tab, from, to))
  on('sftp:download', z.tuple([tabId, fsPaths, fsPath]), (tab, from, to) => sftp.download(tab, from, to))
  on('sftp:cancel', z.tuple([schema.id]), (id) => sftp.cancel(id))
  handle('fs:home', z.tuple([fileSide, tabId]), (side, tab) => sftp.home(side, tab))
  handle('fs:list', z.tuple([fileSide, tabId, fsPath]), (side, tab, path) => sftp.list(side, tab, path))
  handle('fs:mkdir', z.tuple([fileSide, tabId, fsPath]), (side, tab, path) => sftp.mkdir(side, tab, path))
  handle('fs:rename', z.tuple([fileSide, tabId, fsPath, fsPath]), (side, tab, from, to) =>
    sftp.rename(side, tab, from, to)
  )
  handle('fs:delete', z.tuple([fileSide, tabId, fsPaths]), (side, tab, paths) => sftp.delete(side, tab, paths))

  handle('clipboard:read', noArgs, () => clipboard.readText())
  on('clipboard:write', z.tuple([z.string().max(16 * 1024 * 1024)]), (text) => {
    void clipboard.writeText(text)
  })
  on('app:openExternal', z.tuple([z.string().max(8192)]), (url) => openExternal(url))
}

// Separate data dir (e.g. for testing): HARUSSH_USER_DATA=/tmp/x npm run dev
if (process.env.HARUSSH_USER_DATA) app.setPath('userData', process.env.HARUSSH_USER_DATA)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    if (isMac && !app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build/icon-mac.png'))
    const userData = app.getPath('userData')
    store = new Store(userData)
    themes = new ThemeStore(userData)
    ssh = new SshManager(store, {
      data: (tabId, data) => send('ssh:data', tabId, data),
      status: (tabId, event) => send('ssh:status', tabId, event)
    })
    sftp = new SftpManager(store, {
      status: (tabId, event) => send('sftp:status', tabId, event),
      transfer: (transfer) => send('sftp:transfer', transfer)
    })
    themes.watch(() => send('themes:changed'))
    powerMonitor.on('resume', () => ssh.onResume())

    if (app.isPackaged) {
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:"
            ]
          }
        })
      })
    }

    buildMenu()
    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (!isMac) app.quit()
  })

  app.on('before-quit', () => {
    ssh?.closeAll()
    sftp?.closeAll()
    themes?.dispose()
  })
}
