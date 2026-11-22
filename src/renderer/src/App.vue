<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { api, isMac, matchShortcut } from './api'
import { activate, closeTab, currentTheme, cycleTab, loadData, newConnection, state } from './state'
import { applyTheme } from './themes'
import TabBar from './components/TabBar.vue'
import Sidebar from './components/Sidebar.vue'
import HostsView from './components/HostsView.vue'
import SnippetsView from './components/SnippetsView.vue'
import HistoryView from './components/HistoryView.vue'
import ThemesView from './components/ThemesView.vue'
import SettingsView from './components/SettingsView.vue'
import TerminalTab from './components/TerminalTab.vue'
import SftpTab from './components/SftpTab.vue'
import HostEditor from './components/HostEditor.vue'
import SnippetEditor from './components/SnippetEditor.vue'

watch(
  currentTheme,
  (theme) => {
    applyTheme(theme)
    api.setTitleBarColors(theme.ui.tabbar, theme.ui.text)
  },
  { immediate: true }
)

// Theme wallpaper, as CSS variables used by `.app.has-backdrop`.
const backdrop = computed(() => {
  const bg = currentTheme.value.background
  if (!bg) return undefined
  return {
    '--backdrop-image': `url("${bg.image}")`,
    '--backdrop-dim': String(bg.dim),
    '--backdrop-position': bg.position,
    '--backdrop-blur': `${bg.blur}px`
  }
})

function onKey(e: KeyboardEvent): void {
  const shortcut = matchShortcut(e)
  if (!shortcut) return
  e.preventDefault()
  e.stopPropagation()
  if (shortcut === 'new') newConnection()
  else if (shortcut === 'close') {
    if (state.active !== 'home') closeTab(state.active)
  } else if (shortcut === 'next') cycleTab(1)
  else if (shortcut === 'prev') cycleTab(-1)
  else if (shortcut === 'snippets') {
    if (state.active === 'home') state.view = 'snippets'
    else if (state.tabs.find((t) => t.id === state.active)?.kind === 'ssh') state.sidePanel = !state.sidePanel
  } else {
    const tab = state.tabs[Number(shortcut.slice(4)) - 1]
    if (tab) activate(tab.id)
  }
}

onMounted(() => {
  void loadData()
  // capture phase: grab shortcuts before they reach the terminal
  window.addEventListener('keydown', onKey, true)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div
    v-if="state.ready"
    class="app"
    :class="[isMac ? 'is-mac' : 'is-pc', { 'has-backdrop': backdrop }]"
    :style="backdrop"
  >
    <TabBar />
    <div class="body">
      <div v-show="state.active === 'home'" class="home">
        <Sidebar />
        <main class="content">
          <HostsView v-if="state.view === 'hosts'" />
          <SnippetsView v-else-if="state.view === 'snippets'" />
          <HistoryView v-else-if="state.view === 'history'" />
          <ThemesView v-else-if="state.view === 'themes'" />
          <SettingsView v-else />
        </main>
      </div>
      <SftpTab v-if="state.sftpTab" :tab="state.sftpTab" :active="state.active === state.sftpTab.id" />
      <template v-for="tab in state.tabs" :key="tab.id">
        <SftpTab v-if="tab.kind === 'sftp'" :tab="tab" :active="state.active === tab.id" />
        <TerminalTab v-else :tab="tab" :active="state.active === tab.id" />
      </template>
    </div>
    <Transition name="drawer">
      <HostEditor v-if="state.editingHost" :key="state.editingHost.id ?? 'new'" :draft="state.editingHost" />
    </Transition>
    <SnippetEditor v-if="state.editingSnippet" :draft="state.editingSnippet" />
  </div>
</template>
