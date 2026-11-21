<script setup lang="ts">
import { computed, ref } from 'vue'
import { runSnippet, state } from '../state'
import Icon from './Icon.vue'

const props = defineProps<{ tabId: string }>()
const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return state.snippets.filter((s) => !q || s.name.toLowerCase().includes(q) || s.command.toLowerCase().includes(q))
})
</script>

<template>
  <aside class="snippet-panel">
    <header>
      <h3>Snippets</h3>
      <button
        class="icon-btn"
        title="New snippet"
        @click="state.editingSnippet = { name: '', command: '', autoRun: true }"
      >
        <Icon name="plus" :size="16" />
      </button>
      <button class="icon-btn" title="Close" @click="state.snippetPanel = false"><Icon name="x" :size="16" /></button>
    </header>
    <div class="search compact">
      <Icon name="search" :size="14" />
      <input v-model="search" placeholder="Search…" />
    </div>
    <div class="snippet-panel-list">
      <button
        v-for="s in filtered"
        :key="s.id"
        class="snippet-item"
        :title="s.autoRun ? 'Click to run' : 'Click to paste (without Enter)'"
        @click="runSnippet(s, props.tabId)"
      >
        <span class="snippet-item-name">
          <Icon :name="s.autoRun ? 'play' : 'code'" :size="12" />
          {{ s.name }}
        </span>
        <code>{{ s.command }}</code>
      </button>
      <p v-if="!filtered.length" class="hint center">No snippets</p>
    </div>
  </aside>
</template>
