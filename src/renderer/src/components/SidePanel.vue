<script setup lang="ts">
import { computed, ref } from 'vue'
import { clearCommands, deleteCommand, runSnippet, state, useCommand } from '../state'
import Icon from './Icon.vue'
import { formatDate, formatWhen } from '../files'

const props = defineProps<{ tabId: string; hostId: string }>()
const search = ref('')

const q = computed(() => search.value.trim().toLowerCase())
const snippets = computed(() =>
  state.snippets.filter(
    (s) => !q.value || s.name.toLowerCase().includes(q.value) || s.command.toLowerCase().includes(q.value)
  )
)
const commands = computed(() =>
  (state.commands[props.hostId] ?? []).filter((c) => !q.value || c.command.toLowerCase().includes(q.value))
)
</script>

<template>
  <aside class="snippet-panel">
    <header>
      <div class="segmented panel-tabs">
        <button :class="{ active: state.sidePanelTab === 'snippets' }" @click="state.sidePanelTab = 'snippets'">
          Snippets
        </button>
        <button :class="{ active: state.sidePanelTab === 'history' }" @click="state.sidePanelTab = 'history'">
          History
        </button>
      </div>
      <button
        v-if="state.sidePanelTab === 'snippets'"
        class="icon-btn"
        title="New snippet"
        @click="state.editingSnippet = { name: '', command: '', autoRun: true, color: '' }"
      >
        <Icon name="plus" :size="16" />
      </button>
      <button
        v-else
        class="icon-btn danger"
        title="Clear history for this host"
        :disabled="!state.commands[hostId]?.length"
        @click="clearCommands(hostId)"
      >
        <Icon name="trash" :size="15" />
      </button>
      <button class="icon-btn" title="Close" @click="state.sidePanel = false"><Icon name="x" :size="16" /></button>
    </header>
    <div class="search compact">
      <Icon name="search" :size="14" />
      <input v-model="search" placeholder="Search…" />
    </div>

    <div v-if="state.sidePanelTab === 'snippets'" class="snippet-panel-list">
      <button
        v-for="s in snippets"
        :key="s.id"
        class="snippet-item"
        :class="{ colored: s.color }"
        :style="s.color ? { '--snippet-color': s.color } : undefined"
        :title="s.autoRun ? 'Click to run' : 'Click to paste (without Enter)'"
        @click="runSnippet(s, props.tabId)"
      >
        <span class="snippet-item-name">
          <Icon :name="s.autoRun ? 'play' : 'code'" :size="12" />
          {{ s.name }}
        </span>
        <code>{{ s.command }}</code>
      </button>
      <p v-if="!snippets.length" class="hint center">No snippets</p>
    </div>

    <div v-else class="snippet-panel-list">
      <div
        v-for="c in commands"
        :key="c.command"
        class="history-item"
        title="Click to paste, ▶ to run"
        @click="useCommand(tabId, hostId, c.command, false)"
      >
        <code>{{ c.command }}</code>
        <time v-if="c.at" class="history-item-time" :datetime="new Date(c.at).toISOString()" :title="formatDate(c.at)">
          {{ formatWhen(c.at) }}
        </time>
        <span class="history-item-actions" @click.stop>
          <button class="icon-btn" title="Run" @click="useCommand(tabId, hostId, c.command, true)">
            <Icon name="play" :size="12" />
          </button>
          <button class="icon-btn danger" title="Remove from history" @click="deleteCommand(hostId, c.command)">
            <Icon name="x" :size="12" />
          </button>
        </span>
      </div>
      <p v-if="!commands.length" class="hint center">
        {{ q ? 'Nothing matches.' : 'Commands you run on this host will show up here.' }}
      </p>
    </div>
  </aside>
</template>
