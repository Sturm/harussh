<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Host } from '../../../shared/types'
import {
  addGroup,
  deleteHost,
  editHost,
  moveHostsToGroup,
  newHostDraft,
  openHost,
  parseQuickConnect,
  removeGroup,
  renameGroup,
  state,
  toggleGroup
} from '../state'
import Icon from './Icon.vue'

const search = ref('')
const quick = ref('')
const quickError = ref(false)
const quickInput = ref<HTMLInputElement>()

function focusQuick(): void {
  void nextTick(() => quickInput.value?.focus())
}
watch(() => state.quickFocus, focusQuick)
onMounted(() => {
  if (state.quickFocus) focusQuick()
})

// Every group gets a section, empty ones too; Unassigned ('') is always last.
// While searching, only sections with matches are shown.
const groups = computed(() => {
  const q = search.value.trim().toLowerCase()
  const filtered = state.hosts.filter((h) =>
    !q ? true : [h.label, h.hostname, h.username, h.group].some((v) => v.toLowerCase().includes(q))
  )
  const map = new Map<string, Host[]>([...state.groups, ''].map((g) => [g, []]))
  for (const h of [...filtered].sort((a, b) => (a.label || a.hostname).localeCompare(b.label || b.hostname))) {
    const key = h.group.trim()
    map.set(key, [...(map.get(key) ?? []), h])
  }
  return [...map.entries()]
    .filter(([, hosts]) => !q || hosts.length)
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
})

const creating = ref<string | null>(null)
const createInput = ref<HTMLInputElement>()

function startCreate(): void {
  creating.value = ''
  void nextTick(() => createInput.value?.focus())
}

function commitCreate(): void {
  const name = creating.value
  creating.value = null
  if (name) void addGroup(name)
}

// While searching every section is open, so matches are never hidden.
function isCollapsed(group: string): boolean {
  return !search.value.trim() && state.settings.collapsedGroups.includes(group)
}

const renaming = ref<{ group: string; value: string } | null>(null)
const renameInput = ref<HTMLInputElement[]>()

function startRename(group: string): void {
  renaming.value = { group, value: group }
  void nextTick(() => renameInput.value?.[0]?.select())
}

function commitRename(): void {
  const r = renaming.value
  renaming.value = null
  if (r) void renameGroup(r.group, r.value)
}

// --- drag hosts between groups ---

const DRAG_TYPE = 'application/x-harussh-host'
const dropTarget = ref<string | null>(null)

function onDragStart(h: Host, e: DragEvent): void {
  e.dataTransfer?.setData(DRAG_TYPE, h.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(group: string, e: DragEvent): void {
  if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dropTarget.value = group
}

function onDragLeave(group: string, e: DragEvent): void {
  const into = e.relatedTarget as Node | null
  if (dropTarget.value === group && !(e.currentTarget as HTMLElement).contains(into)) dropTarget.value = null
}

function onDrop(group: string, e: DragEvent): void {
  dropTarget.value = null
  const id = e.dataTransfer?.getData(DRAG_TYPE)
  const host = id && state.hosts.find((h) => h.id === id)
  if (!host || host.group.trim() === group) return
  e.preventDefault()
  void moveHostsToGroup([host.id], group)
}

function initials(h: Host): string {
  const name = h.label || h.hostname
  return name.slice(0, 2).toUpperCase()
}

function submitQuick(): void {
  const parsed = parseQuickConnect(quick.value)
  quickError.value = !parsed
  if (!parsed) return
  // A saved host already matches — connect right away
  const existing = state.hosts.find(
    (h) =>
      h.hostname === parsed.hostname && h.port === parsed.port && (!parsed.username || h.username === parsed.username)
  )
  if (existing) openHost(existing)
  else state.editingHost = newHostDraft(parsed)
  quick.value = ''
}

function duplicate(h: Host): void {
  editHost(h)
  if (!state.editingHost) return
  delete state.editingHost.id
  state.editingHost.label = `${h.label || h.hostname} (copy)`
  state.editingHost.hasPassword = state.editingHost.hasKey = state.editingHost.hasPassphrase = false
}
</script>

<template>
  <section class="view">
    <header class="view-header">
      <h1>Hosts</h1>
      <div class="search">
        <Icon name="search" :size="16" />
        <input v-model="search" placeholder="Search hosts…" />
      </div>
      <button class="btn" @click="startCreate"><Icon name="folderPlus" :size="16" /> New group</button>
      <button class="btn primary" @click="state.editingHost = newHostDraft()">
        <Icon name="plus" :size="16" /> New host
      </button>
    </header>

    <form class="quick-connect" :class="{ error: quickError }" @submit.prevent="submitQuick">
      <Icon name="bolt" :size="16" />
      <input ref="quickInput" v-model="quick" placeholder="Quick connect: user@host:port" @input="quickError = false" />
      <kbd>Enter</kbd>
    </form>

    <div v-if="creating !== null" class="host-group">
      <div class="group-header">
        <input
          ref="createInput"
          v-model="creating"
          class="group-rename"
          placeholder="Group name"
          spellcheck="false"
          @keydown.enter="commitCreate"
          @keydown.esc="creating = null"
          @blur="commitCreate"
        />
      </div>
    </div>

    <div v-if="!state.hosts.length && !state.groups.length" class="empty">
      <div class="empty-icon"><Icon name="server" :size="28" /></div>
      <h2>No hosts yet</h2>
      <p>Add your first virtual machine to connect with a single click.</p>
      <button class="btn primary" @click="state.editingHost = newHostDraft()">
        <Icon name="plus" :size="16" /> Add host
      </button>
    </div>

    <div v-else-if="!groups.length" class="empty small">
      <p>Nothing matches "{{ search }}".</p>
    </div>

    <div
      v-for="[group, hosts] in groups"
      :key="group"
      class="host-group"
      :class="{ 'drop-target': dropTarget === group }"
      @dragover="onDragOver(group, $event)"
      @dragleave="onDragLeave(group, $event)"
      @drop="onDrop(group, $event)"
    >
      <div class="group-header">
        <input
          v-if="renaming?.group === group"
          ref="renameInput"
          v-model="renaming.value"
          class="group-rename"
          spellcheck="false"
          @keydown.enter="commitRename"
          @keydown.esc="renaming = null"
          @blur="commitRename"
        />
        <button v-else class="group-toggle" :aria-expanded="!isCollapsed(group)" @click="toggleGroup(group)">
          <Icon name="chevron" :size="13" class="group-chevron" :class="{ open: !isCollapsed(group) }" />
          <h3 class="group-title">{{ group || 'Unassigned' }}</h3>
          <span class="group-count">{{ hosts.length }}</span>
        </button>
        <span v-if="renaming?.group !== group" class="group-actions">
          <button class="icon-btn" title="New host in this group" @click="state.editingHost = newHostDraft({ group })">
            <Icon name="plus" :size="13" />
          </button>
          <button v-if="group" class="icon-btn" title="Rename group" @click="startRename(group)">
            <Icon name="edit" :size="13" />
          </button>
          <button
            v-if="group"
            class="icon-btn danger"
            title="Remove group (keeps its hosts)"
            @click="removeGroup(group)"
          >
            <Icon name="trash" :size="13" />
          </button>
        </span>
      </div>
      <p v-if="!hosts.length && !isCollapsed(group)" class="group-empty">
        {{ group ? 'Empty group — drag hosts here or use +.' : 'Every host is in a group.' }}
      </p>
      <div v-show="!isCollapsed(group)" class="host-grid">
        <div
          v-for="h in hosts"
          :key="h.id"
          class="host-card"
          tabindex="0"
          draggable="true"
          :title="`Connect to ${h.username}@${h.hostname}`"
          @dragstart="onDragStart(h, $event)"
          @click="openHost(h)"
          @keydown.enter="openHost(h)"
        >
          <div class="host-icon" :style="{ background: h.color }">{{ initials(h) }}</div>
          <div class="host-info">
            <div class="host-label">{{ h.label || h.hostname }}</div>
            <div class="host-sub">
              <Icon :name="h.auth === 'password' ? 'lock' : h.auth === 'key' ? 'key' : 'shield'" :size="12" />
              {{ h.username }}@{{ h.hostname }}<template v-if="h.port !== 22">:{{ h.port }}</template>
            </div>
          </div>
          <div class="host-actions" @click.stop>
            <button class="icon-btn" title="SFTP" @click="openHost(h, 'sftp')">
              <Icon name="folder" :size="15" />
            </button>
            <button class="icon-btn" title="Edit" @click="editHost(h)"><Icon name="edit" :size="15" /></button>
            <button class="icon-btn" title="Duplicate" @click="duplicate(h)"><Icon name="copy" :size="15" /></button>
            <button class="icon-btn danger" title="Delete" @click="deleteHost(h)">
              <Icon name="trash" :size="15" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
