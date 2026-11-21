<script setup lang="ts">
import { modLabel } from '../api'
import { activate, closeTab, newConnection, state } from '../state'
import Icon from './Icon.vue'
</script>

<template>
  <header class="tabbar">
    <button class="tab home-tab" :class="{ active: state.active === 'home' }" @click="activate('home')">
      <Icon name="grid" :size="16" />
      <span>Hosts</span>
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
        <span class="tab-title">{{ tab.title }}</span>
        <button class="tab-close" :title="`Close (${modLabel}W)`" @click.stop="closeTab(tab.id)">
          <Icon name="x" :size="13" />
        </button>
      </div>
      <button class="tab-new" :title="`New connection (${modLabel}T)`" @click="newConnection">
        <Icon name="plus" :size="16" />
      </button>
    </div>

    <div v-if="state.active !== 'home'" class="tabbar-actions">
      <button
        class="icon-btn"
        :class="{ on: state.snippetPanel }"
        :title="`Snippets (${modLabel}S)`"
        @click="state.snippetPanel = !state.snippetPanel"
      >
        <Icon name="code" :size="16" />
      </button>
    </div>
  </header>
</template>
