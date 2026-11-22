// Types shared by the main process, preload and renderer.

export type AuthMethod = 'password' | 'key' | 'agent'

export interface Host {
  id: string
  label: string
  group: string
  hostname: string
  port: number
  username: string
  auth: AuthMethod
  color: string
  // '' = picked automatically from the username/name, a preset id, or "custom:<id>"
  icon: string
  autoReconnect: boolean
  createdAt: number
  lastConnectedAt?: number | undefined
  // Secrets never reach the renderer — only whether they are stored.
  hasPassword: boolean
  hasKey: boolean
  hasPassphrase: boolean
}

// Secret fields: undefined = keep, null = remove, string = set.
export interface HostInput {
  id?: string | undefined
  label: string
  group: string
  hostname: string
  port: number
  username: string
  auth: AuthMethod
  color: string
  icon: string
  autoReconnect: boolean
  password?: string | null | undefined
  privateKey?: string | null | undefined
  passphrase?: string | null | undefined
}

// An image the user added to the host icon gallery: a 128×128 PNG data URL.
export interface CustomIcon {
  id: string
  data: string
}

export interface Snippet {
  id: string
  name: string
  command: string
  // true = press Enter right after pasting
  autoRun: boolean
  // CSS color shown on the snippet; '' = none
  color: string
}

export interface HistoryEntry {
  id: string
  hostId: string
  label: string
  target: string
  connectedAt: number
  endedAt?: number
  ok: boolean
  error?: string
}

export interface CommandEntry {
  command: string
  // When it was last run (ms since epoch)
  at: number
}

export type CursorStyle = 'block' | 'bar' | 'underline'

export interface Settings {
  themeId: string
  fontFamily: string
  fontSize: number
  lineHeight: number
  cursorStyle: CursorStyle
  cursorBlink: boolean
  scrollback: number
  copyOnSelect: boolean
  keepAliveInterval: number
  // Host groups folded on the Hosts screen ('' = Unassigned)
  collapsedGroups: string[]
}

// Theme = UI colors + terminal palette. Custom (JSON) themes may set only
// some keys — the rest comes from the base theme (dark/light).
export interface ThemeUi {
  bg: string
  sidebar: string
  tabbar: string
  surface: string
  surface2: string
  border: string
  text: string
  textMuted: string
  textFaint: string
  accent: string
  accentText: string
  accentSoft: string
  danger: string
  success: string
  warning: string
  radius: string
  fontUi: string
}

export interface ThemeTerminal {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

// Optional wallpaper behind the whole window. Panels show it through
// translucent (rgba) theme colors.
export interface ThemeBackground {
  // data: URL. In a theme file: the name of an image next to the JSON, e.g. "wallpaper.jpg".
  image: string
  // 0–0.9: how much the image is darkened
  dim: number
  // CSS background-position, e.g. "center" or "70% 30%"
  position: string
  // px of blur behind panels and cards (frosted glass); 0 = off
  blur: number
}

export interface ThemeDef {
  id: string
  name: string
  type: 'dark' | 'light'
  ui: Partial<ThemeUi>
  terminal: Partial<ThemeTerminal>
  background?: ThemeBackground | undefined
  custom?: boolean
  file?: string
}

export interface ResolvedTheme {
  id: string
  name: string
  type: 'dark' | 'light'
  ui: ThemeUi
  terminal: ThemeTerminal
  background?: ThemeBackground | undefined
  custom?: boolean | undefined
}

export type SessionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'

export interface SessionStatusEvent {
  status: SessionStatus
  message?: string | undefined
  // 'hostkey' = host key changed, 'auth' = bad credentials
  code?: 'hostkey' | 'auth' | undefined
}

export type FileSide = 'local' | 'remote'

export interface FileEntry {
  name: string
  // Symlinks report the type of their target; `link` marks them.
  type: 'file' | 'dir' | 'other'
  link: boolean
  size: number
  // ms since epoch
  mtime: number
  mode: number
}

export interface DirListing {
  path: string
  entries: FileEntry[]
}

export type TransferState = 'queued' | 'running' | 'done' | 'error' | 'canceled'

export interface Transfer {
  id: string
  tabId: string
  direction: 'upload' | 'download'
  name: string
  // Directory the item is copied into (on the destination side).
  destDir: string
  bytes: number
  total: number
  files: number
  state: TransferState
  error?: string | undefined
}

export interface GroupsUpdate {
  hosts: Host[]
  groups: string[]
}

export interface AppData {
  hosts: Host[]
  snippets: Snippet[]
  history: HistoryEntry[]
  settings: Settings
  themes: ThemeDef[]
  // Commands typed in terminal sessions, per host id, newest first.
  commands: Record<string, CommandEntry[]>
  // Named host groups, including empty ones. Hosts without a group are "Unassigned".
  groups: string[]
  icons: CustomIcon[]
  // false = no OS secret store; passwords/keys are kept only until the app quits
  secretsEncrypted: boolean
}

export interface HarusshApi {
  platform: 'darwin' | 'win32' | 'linux' | (string & {})
  getData(): Promise<AppData>

  saveHost(input: HostInput): Promise<Host>
  deleteHost(id: string): Promise<void>
  readKeyFile(): Promise<string | null>
  // Group changes return the hosts they moved and the new list of groups.
  setHostGroup(ids: string[], group: string): Promise<GroupsUpdate>
  addGroup(name: string): Promise<GroupsUpdate>
  renameGroup(from: string, to: string): Promise<GroupsUpdate>
  // Hosts in a removed group become Unassigned; none are deleted.
  removeGroup(name: string): Promise<GroupsUpdate>
  addIcon(data: string): Promise<CustomIcon>
  // Hosts using a removed icon fall back to the automatic one.
  removeIcon(id: string): Promise<void>

  saveSnippet(snippet: Omit<Snippet, 'id'> & { id?: string }): Promise<Snippet>
  deleteSnippet(id: string): Promise<void>

  addCommand(hostId: string, command: string): void
  deleteCommand(hostId: string, command: string): void
  clearCommands(hostId: string): void

  getHistory(): Promise<HistoryEntry[]>
  clearHistory(): Promise<void>

  saveSettings(patch: Partial<Settings>): Promise<Settings>

  listThemes(): Promise<ThemeDef[]>
  openThemesFolder(): Promise<void>
  importTheme(): Promise<ThemeDef | null>
  saveThemeCopy(theme: ThemeDef): Promise<ThemeDef>
  onThemesChanged(cb: () => void): () => void
  setTitleBarColors(background: string, symbols: string): void

  sshOpen(tabId: string, hostId: string, cols: number, rows: number): void
  sshWrite(tabId: string, data: string): void
  sshResize(tabId: string, cols: number, rows: number): void
  sshClose(tabId: string): void
  sshReconnect(tabId: string): void
  sshTrustHostKey(tabId: string): void
  onSshData(cb: (tabId: string, data: string) => void): () => void
  onSshStatus(cb: (tabId: string, event: SessionStatusEvent) => void): () => void

  sftpOpen(tabId: string, hostId: string): void
  sftpClose(tabId: string): void
  sftpReconnect(tabId: string): void
  sftpTrustHostKey(tabId: string): void
  onSftpStatus(cb: (tabId: string, event: SessionStatusEvent) => void): () => void
  onSftpTransfer(cb: (transfer: Transfer) => void): () => void
  // Paths are absolute: POSIX on the remote side, native on the local side.
  fsHome(side: FileSide, tabId: string): Promise<string>
  fsList(side: FileSide, tabId: string, path: string): Promise<DirListing>
  fsMkdir(side: FileSide, tabId: string, path: string): Promise<void>
  fsRename(side: FileSide, tabId: string, from: string, to: string): Promise<void>
  // Local files go to the system trash; remote files are deleted permanently.
  fsDelete(side: FileSide, tabId: string, paths: string[]): Promise<void>
  sftpUpload(tabId: string, localPaths: string[], remoteDir: string): void
  sftpDownload(tabId: string, remotePaths: string[], localDir: string): void
  sftpCancel(transferId: string): void
  pathForFile(file: File): string

  clipboardRead(): Promise<string>
  clipboardWrite(text: string): void
  openExternal(url: string): void
}
