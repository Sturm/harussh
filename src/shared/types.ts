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
  autoReconnect: boolean
  password?: string | null | undefined
  privateKey?: string | null | undefined
  passphrase?: string | null | undefined
}

export interface Snippet {
  id: string
  name: string
  command: string
  // true = press Enter right after pasting
  autoRun: boolean
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

export interface ThemeDef {
  id: string
  name: string
  type: 'dark' | 'light'
  ui: Partial<ThemeUi>
  terminal: Partial<ThemeTerminal>
  custom?: boolean
  file?: string
}

export interface ResolvedTheme {
  id: string
  name: string
  type: 'dark' | 'light'
  ui: ThemeUi
  terminal: ThemeTerminal
  custom?: boolean | undefined
}

export type SessionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'

export interface SessionStatusEvent {
  status: SessionStatus
  message?: string | undefined
  // 'hostkey' = host key changed, 'auth' = bad credentials
  code?: 'hostkey' | 'auth' | undefined
}

export interface AppData {
  hosts: Host[]
  snippets: Snippet[]
  history: HistoryEntry[]
  settings: Settings
  themes: ThemeDef[]
  // false = no OS secret store; passwords/keys are kept only until the app quits
  secretsEncrypted: boolean
}

export interface HarusshApi {
  platform: 'darwin' | 'win32' | 'linux' | (string & {})
  getData(): Promise<AppData>

  saveHost(input: HostInput): Promise<Host>
  deleteHost(id: string): Promise<void>
  readKeyFile(): Promise<string | null>

  saveSnippet(snippet: Omit<Snippet, 'id'> & { id?: string }): Promise<Snippet>
  deleteSnippet(id: string): Promise<void>

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

  clipboardRead(): Promise<string>
  clipboardWrite(text: string): void
  openExternal(url: string): void
}
