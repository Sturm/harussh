<script setup lang="ts">
import { computed } from 'vue'
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
</script>

<template>
  <nav class="sidebar">
    <div class="brand">
      <span class="brand-logo"><Icon name="prompt" :size="18" /></span>
    </div>
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
    <div v-if="connected" class="sidebar-footer">
      <span class="status-dot connected" />
      Active sessions: {{ connected }}
    </div>
  </nav>
</template>
