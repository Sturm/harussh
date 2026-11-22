<script setup lang="ts">
import { computed, ref } from 'vue'
import { deleteSnippet, state } from '../state'
import Icon from './Icon.vue'

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return state.snippets.filter((s) => !q || s.name.toLowerCase().includes(q) || s.command.toLowerCase().includes(q))
})
</script>

<template>
  <section class="view">
    <header class="view-header">
      <h1>Snippets</h1>
      <div class="search">
        <Icon name="search" :size="16" />
        <input v-model="search" placeholder="Search snippets…" />
      </div>
      <button class="btn primary" @click="state.editingSnippet = { name: '', command: '', autoRun: true, color: '' }">
        <Icon name="plus" :size="16" /> New snippet
      </button>
    </header>

    <div v-if="!filtered.length" class="empty small"><p>No snippets.</p></div>

    <div class="list">
      <div
        v-for="s in filtered"
        :key="s.id"
        class="list-row snippet-row"
        :class="{ colored: s.color }"
        :style="s.color ? { '--snippet-color': s.color } : undefined"
      >
        <div class="snippet-main">
          <div class="row-title">{{ s.name }}</div>
          <code class="snippet-code">{{ s.command }}</code>
        </div>
        <div class="row-actions">
          <button class="icon-btn" title="Edit" @click="state.editingSnippet = { ...s }">
            <Icon name="edit" :size="15" />
          </button>
          <button class="icon-btn danger" title="Delete" @click="deleteSnippet(s)">
            <Icon name="trash" :size="15" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
