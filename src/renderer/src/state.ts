import { computed, reactive } from 'vue'
import type {
  CommandEntry,
  CustomIcon,
  GroupsUpdate,
  HistoryEntry,
  Host,
  HostInput,
  SessionStatus,
  SessionStatusEvent,
  Settings,
  Snippet,
  ThemeDef,
  Transfer
} from '../../shared/types'
import { api } from './api'
import { imageFileToIcon } from './hostIcons'
import { builtInThemes, resolveTheme } from './themes'

export type TabKind = 'ssh' | 'sftp'

export interface Tab {
  id: string
  kind: TabKind
  hostId: string
  title: string
  color: string
  status: SessionStatus
  message?: string | undefined
  code?: 'hostkey' | 'auth' | undefined
}

export type View = 'hosts' | 'snippets' | 'history' | 'themes' | 'settings'

export type HostDraft = HostInput & { hasPassword: boolean; hasKey: boolean; hasPassphrase: boolean }
export type SnippetDraft = Omit<Snippet, 'id'> & { id?: string }

export const hostColors = ['#3d8bfd', '#3fcf8e', '#f5b84a', '#f05d6c', '#a78bfa', '#2dd4bf', '#ff8a4c', '#8b93a7']

const initialView = 'hosts' as View
const initialPanelTab = 'snippets' as 'snippets' | 'history'
// Commands typed in terminal sessions, per host id, newest first.
const commands: Record<string, CommandEntry[]> = {}

export const state = reactive({
  ready: false,
  secretsEncrypted: true,
  hosts: [] as Host[],
  groups: [] as string[],
  // Images added to the host icon gallery.
  customIcons: [] as CustomIcon[],
  snippets: [] as Snippet[],
  history: [] as HistoryEntry[],
  settings: {} as Settings,
  customThemes: [] as ThemeDef[],
  tabs: [] as Tab[],
  // The fixed "SFTP" tab next to "Hosts": picks a host inside the tab instead of
  // opening a new one. Created on first use.
  sftpTab: null as Tab | null,
  transfers: [] as Transfer[],
  active: 'home',
  lastSessionTab: null as string | null,
  view: initialView,
  editingHost: null as HostDraft | null,
  editingSnippet: null as SnippetDraft | null,
  commands,
  // Side panel in terminal tabs: open by default, Snippets first.
  sidePanel: true,
  sidePanelTab: initialPanelTab,
  // Bumped to put keyboard focus back into the active terminal.
  termFocus: 0,
  quickFocus: 0
})

export const allThemes = computed(() => [...builtInThemes, ...state.customThemes])
export const currentTheme = computed(() =>
  resolveTheme(allThemes.value.find((t) => t.id === state.settings.themeId) ?? builtInThemes[0]!)
)

export async function loadData(): Promise<void> {
  const data = await api.getData()
  state.hosts = data.hosts
  state.groups = data.groups
  state.customIcons = data.icons
  state.snippets = data.snippets
  state.history = data.history
  state.settings = data.settings
  state.customThemes = data.themes
  state.commands = data.commands
  state.secretsEncrypted = data.secretsEncrypted
  state.ready = true
}

api.onThemesChanged(() => {
  void api.listThemes().then((themes) => (state.customThemes = themes))
})

export const SFTP_TAB = 'sftp'

function findTab(id: string): Tab | undefined {
  return id === SFTP_TAB ? (state.sftpTab ?? undefined) : state.tabs.find((t) => t.id === id)
}

function applyStatus(tabId: string, event: SessionStatusEvent): Tab | undefined {
  const tab = findTab(tabId)
  if (!tab) return
  tab.status = event.status
  tab.message = event.message
  tab.code = event.code
  return tab
}

api.onSshStatus((tabId, event) => {
  if (!applyStatus(tabId, event)) return
  if (event.status === 'connected' || event.status === 'error') void refreshHistory()
})

api.onSftpStatus((tabId, event) => void applyStatus(tabId, event))

api.onSftpTransfer((transfer) => {
  if (!findTab(transfer.tabId)) return
  const idx = state.transfers.findIndex((t) => t.id === transfer.id)
  if (idx >= 0) state.transfers[idx] = transfer
  else state.transfers.push(transfer)
})

export async function refreshHistory(): Promise<void> {
  state.history = await api.getHistory()
}

// --- tabs ---

export function activate(id: string): void {
  state.active = id
  if (state.tabs.find((t) => t.id === id)?.kind === 'ssh') state.lastSessionTab = id
}

/** "+" / new-tab shortcut: back to the hosts list with quick connect focused. */
export function newConnection(): void {
  activate('home')
  state.view = 'hosts'
  state.quickFocus++
}

export function openHost(host: Host, kind: TabKind = 'ssh'): void {
  const same = state.tabs.filter((t) => t.hostId === host.id && t.kind === kind).length
  const label = (host.label || host.hostname) + (kind === 'sftp' ? ' — SFTP' : '')
  const tab: Tab = {
    id: crypto.randomUUID(),
    kind,
    hostId: host.id,
    title: same ? `${label} (${same + 1})` : label,
    color: host.color,
    status: 'connecting'
  }
  state.tabs.push(tab)
  activate(tab.id)
}

export function closeTab(id: string): void {
  if (id === SFTP_TAB) {
    disconnectSftpTab()
    return
  }
  const idx = state.tabs.findIndex((t) => t.id === id)
  if (idx < 0) return
  if (state.tabs[idx]!.kind === 'sftp') {
    api.sftpClose(id)
    state.transfers = state.transfers.filter((t) => t.tabId !== id)
  } else {
    api.sshClose(id)
  }
  state.tabs.splice(idx, 1)
  if (state.lastSessionTab === id) state.lastSessionTab = state.tabs.findLast((t) => t.kind === 'ssh')?.id ?? null
  if (state.active === id) activate(state.tabs[Math.min(idx, state.tabs.length - 1)]?.id ?? 'home')
}

export function cycleTab(dir: 1 | -1): void {
  const ids = ['home', ...(state.sftpTab ? [SFTP_TAB] : []), ...state.tabs.map((t) => t.id)]
  const idx = ids.indexOf(state.active)
  activate(ids[(idx + dir + ids.length) % ids.length] ?? 'home')
}

export function openSftpTab(): void {
  state.sftpTab ??= { id: SFTP_TAB, kind: 'sftp', hostId: '', title: 'SFTP', color: '', status: 'disconnected' }
  activate(SFTP_TAB)
}

export function connectSftpTab(host: Host): void {
  const tab = state.sftpTab
  if (!tab) return
  if (tab.hostId) disconnectSftpTab()
  Object.assign(tab, { hostId: host.id, color: host.color, status: 'connecting', message: undefined, code: undefined })
}

/** Back to the host picker. */
export function disconnectSftpTab(): void {
  const tab = state.sftpTab
  if (!tab?.hostId) return
  api.sftpClose(SFTP_TAB)
  state.transfers = state.transfers.filter((t) => t.tabId !== SFTP_TAB)
  Object.assign(tab, { hostId: '', color: '', status: 'disconnected', message: undefined, code: undefined })
}

// --- hosts ---

export function newHostDraft(partial: Partial<HostInput> = {}): HostDraft {
  return {
    label: '',
    group: '',
    hostname: '',
    port: 22,
    username: '',
    auth: 'password',
    color: hostColors[state.hosts.length % hostColors.length]!,
    icon: '',
    autoReconnect: true,
    hasPassword: false,
    hasKey: false,
    hasPassphrase: false,
    ...partial
  }
}

export function editHost(host: Host): void {
  const { createdAt: _c, lastConnectedAt: _l, ...rest } = host
  state.editingHost = { ...rest }
}

export async function saveHost(input: HostInput): Promise<Host> {
  const host = await api.saveHost(input)
  const idx = state.hosts.findIndex((h) => h.id === host.id)
  if (idx >= 0) state.hosts[idx] = host
  else state.hosts.push(host)
  // Update the color of open tabs for this host
  for (const t of state.tabs) if (t.hostId === host.id) t.color = host.color
  const group = host.group.trim()
  if (group && !state.groups.includes(group)) state.groups.push(group)
  return host
}

export async function addCustomIcon(file: File): Promise<CustomIcon> {
  const icon = await api.addIcon(await imageFileToIcon(file))
  state.customIcons.push(icon)
  return icon
}

export async function removeCustomIcon(id: string): Promise<void> {
  await api.removeIcon(id)
  state.customIcons = state.customIcons.filter((i) => i.id !== id)
  for (const h of state.hosts) if (h.icon === `custom:${id}`) h.icon = ''
}

export async function deleteHost(host: Host): Promise<void> {
  if (!confirm(`Delete host "${host.label || host.hostname}"? Its saved password and key will be removed too.`)) return
  await api.deleteHost(host.id)
  state.hosts = state.hosts.filter((h) => h.id !== host.id)
}

/** Parses "user@host:port" from the quick-connect box. */
export function parseQuickConnect(input: string): Partial<HostInput> | null {
  const m = /^\s*(?:([^@\s]+)@)?([^\s:@]+|\[[^\]]+\])(?::(\d+))?\s*$/.exec(input)
  if (!m) return null
  const hostname = m[2]!.replace(/^\[|\]$/g, '')
  return { username: m[1] ?? '', hostname, port: m[3] ? Number(m[3]) : 22, label: hostname }
}

// --- host groups ('' = Unassigned) ---

function applyGroups(update: GroupsUpdate): void {
  for (const host of update.hosts) {
    const idx = state.hosts.findIndex((h) => h.id === host.id)
    if (idx >= 0) state.hosts[idx] = host
  }
  state.groups = update.groups
}

function setCollapsed(groups: string[]): void {
  void saveSettings({ collapsedGroups: [...new Set(groups)] })
}

export async function moveHostsToGroup(ids: string[], group: string): Promise<void> {
  applyGroups(await api.setHostGroup(ids, group))
}

export async function addGroup(name: string): Promise<void> {
  if (name.trim()) applyGroups(await api.addGroup(name))
}

export function toggleGroup(group: string): void {
  const collapsed = state.settings.collapsedGroups
  setCollapsed(collapsed.includes(group) ? collapsed.filter((g) => g !== group) : [...collapsed, group])
}

/** Renaming onto an existing group's name merges the two. */
export async function renameGroup(from: string, to: string): Promise<void> {
  const name = to.trim()
  if (!name || name === from) return
  applyGroups(await api.renameGroup(from, name))
  const collapsed = state.settings.collapsedGroups
  if (collapsed.includes(from)) setCollapsed([...collapsed.filter((g) => g !== from), name])
}

/** Removes the group only — its hosts become Unassigned. */
export async function removeGroup(group: string): Promise<void> {
  const count = state.hosts.filter((h) => h.group.trim() === group).length
  const note = !count
    ? ''
    : count === 1
      ? ' Its 1 host moves to Unassigned.'
      : ` Its ${count} hosts move to Unassigned.`
  if (!confirm(`Remove group "${group}"?${note}`)) return
  applyGroups(await api.removeGroup(group))
  setCollapsed(state.settings.collapsedGroups.filter((g) => g !== group))
}

// --- snippets ---

export async function saveSnippet(draft: SnippetDraft): Promise<void> {
  const saved = await api.saveSnippet(draft)
  const idx = state.snippets.findIndex((s) => s.id === saved.id)
  if (idx >= 0) state.snippets[idx] = saved
  else state.snippets.push(saved)
}

export async function deleteSnippet(snippet: Snippet): Promise<void> {
  if (!confirm(`Delete snippet "${snippet.name}"?`)) return
  await api.deleteSnippet(snippet.id)
  state.snippets = state.snippets.filter((s) => s.id !== snippet.id)
}

export function runSnippet(snippet: Snippet, tabId = state.lastSessionTab): void {
  if (!tabId) return
  const command = snippet.command.replace(/\r?\n/g, '\r')
  api.sshWrite(tabId, command + (snippet.autoRun ? '\r' : ''))
  activate(tabId)
  state.termFocus++
}

// --- command history ---

export function recordCommand(hostId: string, command: string): void {
  const rest = (state.commands[hostId] ?? []).filter((c) => c.command !== command)
  state.commands[hostId] = [{ command, at: Date.now() }, ...rest].slice(0, 500)
  api.addCommand(hostId, command)
}

/** Pastes a command from history into the terminal; with run = true also presses Enter. */
export function useCommand(tabId: string, hostId: string, command: string, run: boolean): void {
  api.sshWrite(tabId, command + (run ? '\r' : ''))
  if (run) recordCommand(hostId, command)
  state.termFocus++
}

export function deleteCommand(hostId: string, command: string): void {
  state.commands[hostId] = (state.commands[hostId] ?? []).filter((c) => c.command !== command)
  api.deleteCommand(hostId, command)
}

export function clearCommands(hostId: string): void {
  if (!confirm('Clear the command history for this host?')) return
  delete state.commands[hostId]
  api.clearCommands(hostId)
}

// --- settings ---

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  Object.assign(state.settings, patch)
  state.settings = await api.saveSettings(patch)
}
