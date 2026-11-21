import { computed, reactive } from 'vue'
import type { HistoryEntry, Host, HostInput, SessionStatus, Settings, Snippet, ThemeDef } from '../../shared/types'
import { api } from './api'
import { builtInThemes, resolveTheme } from './themes'

export interface Tab {
  id: string
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

export const state = reactive({
  ready: false,
  secretsEncrypted: true,
  hosts: [] as Host[],
  snippets: [] as Snippet[],
  history: [] as HistoryEntry[],
  settings: {} as Settings,
  customThemes: [] as ThemeDef[],
  tabs: [] as Tab[],
  active: 'home',
  lastSessionTab: null as string | null,
  view: initialView,
  editingHost: null as HostDraft | null,
  editingSnippet: null as SnippetDraft | null,
  snippetPanel: false,
  quickFocus: 0
})

export const allThemes = computed(() => [...builtInThemes, ...state.customThemes])
export const currentTheme = computed(() =>
  resolveTheme(allThemes.value.find((t) => t.id === state.settings.themeId) ?? builtInThemes[0]!)
)

export async function loadData(): Promise<void> {
  const data = await api.getData()
  state.hosts = data.hosts
  state.snippets = data.snippets
  state.history = data.history
  state.settings = data.settings
  state.customThemes = data.themes
  state.secretsEncrypted = data.secretsEncrypted
  state.ready = true
}

api.onThemesChanged(() => {
  void api.listThemes().then((themes) => (state.customThemes = themes))
})

api.onSshStatus((tabId, event) => {
  const tab = state.tabs.find((t) => t.id === tabId)
  if (!tab) return
  tab.status = event.status
  tab.message = event.message
  tab.code = event.code
  if (event.status === 'connected' || event.status === 'error') void refreshHistory()
})

export async function refreshHistory(): Promise<void> {
  state.history = await api.getHistory()
}

// --- tabs ---

export function activate(id: string): void {
  state.active = id
  if (id !== 'home') state.lastSessionTab = id
}

/** "+" / new-tab shortcut: back to the hosts list with quick connect focused. */
export function newConnection(): void {
  activate('home')
  state.view = 'hosts'
  state.quickFocus++
}

export function openHost(host: Host): void {
  const same = state.tabs.filter((t) => t.hostId === host.id).length
  const label = host.label || host.hostname
  const tab: Tab = {
    id: crypto.randomUUID(),
    hostId: host.id,
    title: same ? `${label} (${same + 1})` : label,
    color: host.color,
    status: 'connecting'
  }
  state.tabs.push(tab)
  activate(tab.id)
}

export function closeTab(id: string): void {
  const idx = state.tabs.findIndex((t) => t.id === id)
  if (idx < 0) return
  api.sshClose(id)
  state.tabs.splice(idx, 1)
  if (state.lastSessionTab === id) state.lastSessionTab = state.tabs.at(-1)?.id ?? null
  if (state.active === id) activate(state.tabs[Math.min(idx, state.tabs.length - 1)]?.id ?? 'home')
}

export function cycleTab(dir: 1 | -1): void {
  const ids = ['home', ...state.tabs.map((t) => t.id)]
  const idx = ids.indexOf(state.active)
  activate(ids[(idx + dir + ids.length) % ids.length] ?? 'home')
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
  return host
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
}

// --- settings ---

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  Object.assign(state.settings, patch)
  state.settings = await api.saveSettings(patch)
}
