<script setup lang="ts">
import { computed } from 'vue'
import { api } from '../api'
import { state, type View } from '../state'
import type { IconName } from '../icons'
import Icon from './Icon.vue'

const items: { view: View; label: string; icon: IconName }[] = [
  { view: 'hosts', label: 'Hosts', icon: 'server' },
  { view: 'snippets', label: 'Snippets', icon: 'code' },
  { view: 'history', label: 'History', icon: 'history' },
  { view: 'themes', label: 'Themes', icon: 'palette' },
  { view: 'settings', label: 'Settings', icon: 'settings' }
]

const connected = computed(() => state.tabs.filter((t) => t.status === 'connected').length)

// Shown once there is something to act on: a downloaded update, or a newer
// version this build can't install by itself.
const update = computed(() => {
  const u = state.update
  if (u?.state === 'ready')
    return { label: `Restart to update to ${u.version}`, title: 'Install the update and restart' }
  if (u?.state === 'available') return { label: `Version ${u.version} available`, title: 'Open the download page' }
  return null
})
</script>

<template>
  <nav class="sidebar">
    <button
      v-for="item in items"
      :key="item.view"
      class="nav-item"
      :class="{ active: state.view === item.view }"
      @click="state.view = item.view"
    >
      <Icon :name="item.icon" />
      <span>{{ item.label }}</span>
      <span v-if="item.view === 'hosts'" class="nav-count">{{ state.hosts.length }}</span>
    </button>
    <button v-if="update" class="sidebar-update" :title="update.title" @click="api.installUpdate()">
      <Icon name="download" :size="14" />
      <span>{{ update.label }}</span>
    </button>
    <div v-if="connected" class="sidebar-footer">
      <span class="status-dot connected" />
      Active sessions: {{ connected }}
    </div>
  </nav>
</template>
