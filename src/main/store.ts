import { safeStorage, type Rectangle } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type {
  CommandEntry,
  CustomIcon,
  GroupsUpdate,
  HistoryEntry,
  Host,
  HostInput,
  Settings,
  Snippet
} from '../shared/types'

// `icon` and `jumpHostId` are missing in hosts saved before they existed.
export type StoredHost = Omit<Host, 'hasPassword' | 'hasKey' | 'hasPassphrase' | 'icon' | 'jumpHostId'> & {
  icon?: string
  jumpHostId?: string
}
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
  // Ids of built-in snippets already added once, so a deleted one stays deleted.
  seededSnippets?: string[]
  // Named groups, so a group can exist before any host is in it.
  groups?: string[]
  // Images added to the host icon gallery.
  icons?: CustomIcon[]
  window?: { bounds: Rectangle; maximized: boolean }
}

const MAX_HISTORY = 200
const MAX_COMMANDS = 500
const MAX_ICONS = 200

// Snippets every install starts with. Each is added once; the user may edit or delete it.
const DEFAULT_SNIPPETS: Snippet[] = [
  { id: 'default-claude', name: 'Run Claude', command: 'claude', autoRun: true, color: '#d97757' }
]

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
  keepAliveInterval: 15,
  autoUpdate: true,
  collapsedGroups: []
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
    // e.g. data copied from another machine, so the OS key doesn't match
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
  // written to disk; they live in memory until the app quits.
  readonly secretsEncrypted = safeStorage.isEncryptionAvailable()
  private sessionSecrets: Record<string, Secrets> = {}

  constructor(dir: string) {
    this.file = join(dir, 'harussh-data.json')
    this.data = this.load()
    this.migrateLegacySecrets()
    this.seedSnippets()
  }

  private seedSnippets(): void {
    const seeded = new Set(this.data.seededSnippets)
    const missing = DEFAULT_SNIPPETS.filter((s) => !seeded.has(s.id))
    if (!missing.length) return
    for (const s of missing) {
      if (!this.data.snippets.some((x) => x.id === s.id)) this.data.snippets.unshift({ ...s })
      seeded.add(s.id)
    }
    this.data.seededSnippets = [...seeded]
    this.save()
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
        commands: normalizeCommands(parsed.commands),
        // Snippets saved before colors existed have no `color`.
        snippets: ((parsed.snippets ?? []) as (Omit<Snippet, 'color'> & { color?: string })[]).map((s) => ({
          ...s,
          color: s.color ?? ''
        }))
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
    return {
      ...h,
      icon: h.icon ?? '',
      jumpHostId: h.jumpHostId ?? '',
      hasPassword: !!s.password,
      hasKey: !!s.privateKey,
      hasPassphrase: !!s.passphrase
    }
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
      // A host can't be its own jump host.
      jumpHostId: fields.jumpHostId === id ? '' : fields.jumpHostId,
      port: Number(fields.port) || 22,
      createdAt: existing?.createdAt ?? Date.now(),
      lastConnectedAt: existing?.lastConnectedAt
    }
    if (existing) this.data.hosts = this.data.hosts.map((h) => (h.id === id ? host : h))
    else this.data.hosts.push(host)
    // Keep a group typed in the host editor even after its hosts move out.
    if (host.group.trim()) this.data.groups = [...new Set([...(this.data.groups ?? []), host.group.trim()])]

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

  // --- custom host icons ---

  getIcons(): CustomIcon[] {
    return this.data.icons ?? []
  }

  addIcon(data: string): CustomIcon {
    const icons = this.getIcons()
    if (icons.length >= MAX_ICONS) throw new Error(`You can add up to ${MAX_ICONS} icons.`)
    const icon = { id: randomUUID(), data }
    this.data.icons = [...icons, icon]
    this.save()
    return icon
  }

  removeIcon(id: string): void {
    this.data.icons = this.getIcons().filter((i) => i.id !== id)
    // Hosts that used it go back to the automatic icon.
    for (const h of this.data.hosts) if (h.icon === `custom:${id}`) h.icon = ''
    this.save()
  }

  deleteHost(id: string): void {
    this.data.hosts = this.data.hosts.filter((h) => h.id !== id)
    delete this.data.secrets[id]
    delete this.sessionSecrets[id]
    delete this.data.commands[id]
    // Hosts that jumped through it connect directly again.
    for (const h of this.data.hosts) if (h.jumpHostId === id) h.jumpHostId = ''
    this.save()
  }

  // --- groups ---

  /** Stored groups plus any only named on a host (e.g. typed in the host editor). */
  getGroups(): string[] {
    const names = [...(this.data.groups ?? []), ...this.data.hosts.map((h) => h.group.trim())]
    return [...new Set(names.filter(Boolean))]
  }

  private regroup(ids: string[], group: string): GroupsUpdate {
    const changed = this.data.hosts.filter((h) => ids.includes(h.id))
    for (const h of changed) h.group = group
    this.save()
    return { hosts: changed.map((h) => this.toPublic(h)), groups: this.getGroups() }
  }

  setGroup(ids: string[], group: string): GroupsUpdate {
    const name = group.trim()
    if (name) this.data.groups = [...new Set([...(this.data.groups ?? []), name])]
    return this.regroup(ids, name)
  }

  addGroup(name: string): GroupsUpdate {
    return this.setGroup([], name)
  }

  /** Renaming onto an existing group's name merges the two. */
  renameGroup(from: string, to: string): GroupsUpdate {
    const name = to.trim()
    if (!name) return { hosts: [], groups: this.getGroups() }
    this.data.groups = [...new Set((this.data.groups ?? []).map((g) => (g === from ? name : g)).concat(name))]
    return this.regroup(this.idsInGroup(from), name)
  }

  removeGroup(name: string): GroupsUpdate {
    this.data.groups = (this.data.groups ?? []).filter((g) => g !== name)
    return this.regroup(this.idsInGroup(name), '')
  }

  private idsInGroup(name: string): string[] {
    return this.data.hosts.filter((h) => h.group.trim() === name).map((h) => h.id)
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

  deleteHistory(id: string): void {
    this.data.history = this.data.history.filter((e) => e.id !== id)
    this.save()
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
