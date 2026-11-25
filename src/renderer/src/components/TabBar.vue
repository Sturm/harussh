<script setup lang="ts">
import { computed } from 'vue'
import { modLabel } from '../api'
import { activate, closeTab, newConnection, openHost, openSftpTab, SFTP_TAB, state } from '../state'
import Icon from './Icon.vue'

const activeTab = computed(() => state.tabs.find((t) => t.id === state.active))
const sftpHost = computed(() => state.hosts.find((h) => h.id === state.sftpTab?.hostId))
const activeHost = computed(() => state.hosts.find((h) => h.id === activeTab.value?.hostId))
</script>

<template>
  <header class="tabbar">
    <button class="tab home-tab" :class="{ active: state.active === 'home' }" @click="activate('home')">
      <Icon name="grid" :size="16" />
      <span>Hosts</span>
    </button>
    <button
      class="tab home-tab"
      :class="{ active: state.active === SFTP_TAB }"
      :title="sftpHost ? `SFTP: ${sftpHost.label || sftpHost.hostname}` : 'SFTP'"
      @click="openSftpTab"
    >
      <span v-if="state.sftpTab?.hostId" class="status-dot" :class="state.sftpTab.status" />
      <Icon v-else name="folder" :size="16" />
      <span>SFTP</span>
    </button>

    <div class="tabs-scroll">
      <div
        v-for="tab in state.tabs"
        :key="tab.id"
        class="tab session-tab"
        :class="{ active: state.active === tab.id }"
        :style="{ '--tab-color': tab.color }"
        :title="tab.message || tab.title"
        @click="activate(tab.id)"
        @mousedown.middle.prevent="closeTab(tab.id)"
      >
        <span class="status-dot" :class="tab.status" />
        <Icon v-if="tab.kind === 'sftp'" name="folder" :size="13" class="tab-kind" />
        <span class="tab-title">{{ tab.title }}</span>
        <button class="tab-close" :title="`Close (${modLabel}W)`" @click.stop="closeTab(tab.id)">
          <Icon name="x" :size="13" />
        </button>
      </div>
      <button class="tab-new" :title="`New connection (${modLabel}T)`" @click="newConnection">
        <Icon name="plus" :size="16" />
      </button>
    </div>

    <div v-if="activeTab" class="tabbar-actions">
      <button
        v-if="activeHost"
        class="icon-btn"
        :title="activeTab.kind === 'ssh' ? 'Open SFTP for this host' : 'Open a terminal for this host'"
        @click="openHost(activeHost, activeTab.kind === 'ssh' ? 'sftp' : 'ssh')"
      >
        <Icon :name="activeTab.kind === 'ssh' ? 'folder' : 'terminal'" :size="16" />
      </button>
      <button
        v-if="activeTab.kind === 'ssh'"
        class="icon-btn"
        :class="{ on: state.sidePanel }"
        :title="`Snippets & history (${modLabel}S)`"
        @click="state.sidePanel = !state.sidePanel"
      >
        <Icon name="code" :size="16" />
      </button>
    </div>
  </header>
</template>
