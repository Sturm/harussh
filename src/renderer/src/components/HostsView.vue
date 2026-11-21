<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Host } from '../../../shared/types'
import { deleteHost, editHost, newHostDraft, openHost, parseQuickConnect, state } from '../state'
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

const groups = computed(() => {
  const q = search.value.trim().toLowerCase()
  const filtered = state.hosts.filter((h) =>
    !q ? true : [h.label, h.hostname, h.username, h.group].some((v) => v.toLowerCase().includes(q))
  )
  const map = new Map<string, Host[]>()
  for (const h of [...filtered].sort((a, b) => (a.label || a.hostname).localeCompare(b.label || b.hostname))) {
    const key = h.group.trim()
    map.set(key, [...(map.get(key) ?? []), h])
  }
  return [...map.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
})

const hasGroups = computed(() => groups.value.some(([g]) => g !== ''))

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
      <button class="btn primary" @click="state.editingHost = newHostDraft()">
        <Icon name="plus" :size="16" /> New host
      </button>
    </header>

    <form class="quick-connect" :class="{ error: quickError }" @submit.prevent="submitQuick">
      <Icon name="bolt" :size="16" />
      <input ref="quickInput" v-model="quick" placeholder="Quick connect: user@host:port" @input="quickError = false" />
      <kbd>Enter</kbd>
    </form>

    <div v-if="!state.hosts.length" class="empty">
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

    <div v-for="[group, hosts] in groups" :key="group" class="host-group">
      <h3 v-if="hasGroups" class="group-title">{{ group || 'Ungrouped' }}</h3>
      <div class="host-grid">
        <div
          v-for="h in hosts"
          :key="h.id"
          class="host-card"
          tabindex="0"
          :title="`Connect to ${h.username}@${h.hostname}`"
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
