import { safeStorage, type Rectangle } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { CommandEntry, HistoryEntry, Host, HostInput, Settings, Snippet } from '../shared/types'

type StoredHost = Omit<Host, 'hasPassword' | 'hasKey' | 'hasPassphrase'>
type SecretField = 'password' | 'privateKey' | 'passphrase'
export type Secrets = Partial<Record<SecretField, string>>

interface DataFile {
  version: 1
  hosts: StoredHost[]
  // Encrypted with safeStorage (Keychain / DPAPI / libsecret).
  secrets: Record<string, Partial<Record<SecretField, string>>>
  snippets: Snippet[]
  history: HistoryEntry[]
  settings: Settings
  knownHosts: Record<string, string>
  // Commands typed in terminal sessions, per host id, newest first.
  commands: Record<string, CommandEntry[]>
  window?: { bounds: Rectangle; maximized: boolean }
}

const MAX_HISTORY = 200
const MAX_COMMANDS = 500

const defaultFont =
  process.platform === 'darwin'
    ? 'Menlo, Monaco, monospace'
    : process.platform === 'win32'
      ? 'Cascadia Mono, Consolas, monospace'
      : "'DejaVu Sans Mono', 'Ubuntu Mono', monospace"

export const defaultSettings: Settings = {
  themeId: 'midnight',
  fontFamily: defaultFont,
  fontSize: 14,
  lineHeight: 1.15,
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 10000,
  copyOnSelect: false,
  keepAliveInterval: 15
}

function encrypt(value: string): string {
  return 'enc:' + safeStorage.encryptString(value).toString('base64')
}

function decrypt(value: string): string | undefined {
  try {
    if (value.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'))
    // Legacy: older versions stored secrets as plain base64 when no keyring was available.
    if (value.startsWith('b64:')) return Buffer.from(value.slice(4), 'base64').toString('utf8')
  } catch {
    // e.g. data copied from another machine — the OS key doesn't match
  }
  return undefined
}

// Early builds stored plain strings without a time; their time shows as unknown (0).
function normalizeCommands(raw: unknown): Record<string, CommandEntry[]> {
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown[]>).map(([hostId, list]) => [
      hostId,
      (Array.isArray(list) ? list : []).map((c) =>
        typeof c === 'string' ? { command: c, at: 0 } : (c as CommandEntry)
      )
    ])
  )
}

export class Store {
  private file: string
  private data: DataFile
  // Without an OS secret store (e.g. Linux without a keyring) secrets are never
  // written to disk — they live in memory until the app quits.
  readonly secretsEncrypted = safeStorage.isEncryptionAvailable()
  private sessionSecrets: Record<string, Secrets> = {}

  constructor(dir: string) {
    this.file = join(dir, 'harussh-data.json')
    this.data = this.load()
    this.migrateLegacySecrets()
  }

  private migrateLegacySecrets(): void {
    let changed = false
    for (const [hostId, stored] of Object.entries(this.data.secrets)) {
      for (const key of Object.keys(stored) as SecretField[]) {
        const raw = stored[key]
        if (!raw?.startsWith('b64:')) continue
        const value = decrypt(raw)
        if (value && this.secretsEncrypted) stored[key] = encrypt(value)
        else {
          if (value) (this.sessionSecrets[hostId] ??= {})[key] = value
          delete stored[key]
        }
        changed = true
      }
    }
    if (changed) this.save()
  }

  private load(): DataFile {
    const empty: DataFile = {
      version: 1,
      hosts: [],
      secrets: {},
      snippets: [],
      history: [],
      settings: { ...defaultSettings },
      knownHosts: {},
      commands: {}
    }
    if (!existsSync(this.file)) return empty
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<DataFile>
      return {
        ...empty,
        ...parsed,
        settings: { ...defaultSettings, ...parsed.settings },
        commands: normalizeCommands(parsed.commands)
      }
    } catch (err) {
      console.error('Could not read data file, starting fresh:', err)
      renameSync(this.file, this.file + '.broken-' + Date.now())
      return empty
    }
  }

  private save(): void {
    const tmp = this.file + '.tmp'
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
  }

  private toPublic(h: StoredHost): Host {
    const s = { ...this.data.secrets[h.id], ...this.sessionSecrets[h.id] }
    return { ...h, hasPassword: !!s.password, hasKey: !!s.privateKey, hasPassphrase: !!s.passphrase }
  }

  // --- hosts ---

  getHosts(): Host[] {
    return this.data.hosts.map((h) => this.toPublic(h))
  }

  getHost(id: string): StoredHost | undefined {
    return this.data.hosts.find((h) => h.id === id)
  }

  getSecrets(id: string): Secrets {
    const stored = this.data.secrets[id] ?? {}
    const out: Secrets = { ...this.sessionSecrets[id] }
    for (const key of Object.keys(stored) as SecretField[]) {
      const raw = stored[key]
      const v = raw && decrypt(raw)
      if (v) out[key] = v
    }
    return out
  }

  saveHost(input: HostInput): Host {
    const { password, privateKey, passphrase, ...fields } = input
    const id = input.id ?? randomUUID()
    const existing = this.getHost(id)
    const host: StoredHost = {
      ...fields,
      id,
      port: Number(fields.port) || 22,
      createdAt: existing?.createdAt ?? Date.now(),
      lastConnectedAt: existing?.lastConnectedAt
    }
    if (existing) this.data.hosts = this.data.hosts.map((h) => (h.id === id ? host : h))
    else this.data.hosts.push(host)

    const secrets = { ...this.data.secrets[id] }
    const session = { ...this.sessionSecrets[id] }
    const apply = (key: SecretField, value: string | null | undefined): void => {
      if (value === undefined) return
      delete secrets[key]
      delete session[key]
      if (value === null || value === '') return
      if (this.secretsEncrypted) secrets[key] = encrypt(value)
      else session[key] = value
    }
    apply('password', password)
    apply('privateKey', privateKey)
    apply('passphrase', passphrase)
    this.data.secrets[id] = secrets
    this.sessionSecrets[id] = session

    this.save()
    return this.toPublic(host)
  }

  deleteHost(id: string): void {
    this.data.hosts = this.data.hosts.filter((h) => h.id !== id)
    delete this.data.secrets[id]
    delete this.sessionSecrets[id]
    delete this.data.commands[id]
    this.save()
  }

  touchHost(id: string): void {
    const h = this.getHost(id)
    if (h) {
      h.lastConnectedAt = Date.now()
      this.save()
    }
  }

  // --- known hosts (TOFU) ---

  getKnownHost(key: string): string | undefined {
    return this.data.knownHosts[key]
  }

  setKnownHost(key: string, fingerprint: string): void {
    this.data.knownHosts[key] = fingerprint
    this.save()
  }

  // --- snippets ---

  getSnippets(): Snippet[] {
    return this.data.snippets
  }

  saveSnippet(input: Omit<Snippet, 'id'> & { id?: string | undefined }): Snippet {
    const snippet: Snippet = { ...input, id: input.id ?? randomUUID() }
    const idx = this.data.snippets.findIndex((s) => s.id === snippet.id)
    if (idx >= 0) this.data.snippets[idx] = snippet
    else this.data.snippets.push(snippet)
    this.save()
    return snippet
  }

  deleteSnippet(id: string): void {
    this.data.snippets = this.data.snippets.filter((s) => s.id !== id)
    this.save()
  }

  // --- history ---

  getHistory(): HistoryEntry[] {
    return this.data.history
  }

  addHistory(entry: Omit<HistoryEntry, 'id'>): string {
    const id = randomUUID()
    this.data.history.unshift({ ...entry, id })
    this.data.history.length = Math.min(this.data.history.length, MAX_HISTORY)
    this.save()
    return id
  }

  endHistory(id: string): void {
    const e = this.data.history.find((h) => h.id === id)
    if (e && !e.endedAt) {
      e.endedAt = Date.now()
      this.save()
    }
  }

  clearHistory(): void {
    this.data.history = []
    this.save()
  }

  // --- command history ---

  getCommands(): Record<string, CommandEntry[]> {
    return this.data.commands
  }

  /** Moves a repeated command to the top instead of storing it twice. */
  addCommand(hostId: string, command: string): void {
    const list = [
      { command, at: Date.now() },
      ...(this.data.commands[hostId] ?? []).filter((c) => c.command !== command)
    ]
    this.data.commands[hostId] = list.slice(0, MAX_COMMANDS)
    this.save()
  }

  deleteCommand(hostId: string, command: string): void {
    this.data.commands[hostId] = (this.data.commands[hostId] ?? []).filter((c) => c.command !== command)
    this.save()
  }

  clearCommands(hostId: string): void {
    delete this.data.commands[hostId]
    this.save()
  }

  // --- settings / window ---

  getSettings(): Settings {
    return this.data.settings
  }

  saveSettings(patch: Partial<Settings>): Settings {
    this.data.settings = { ...this.data.settings, ...patch }
    this.save()
    return this.data.settings
  }

  getWindowState(): DataFile['window'] {
    return this.data.window
  }

  setWindowState(state: NonNullable<DataFile['window']>): void {
    this.data.window = state
    this.save()
  }
}
