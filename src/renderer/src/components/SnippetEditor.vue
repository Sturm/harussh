<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { saveSnippet, snippetColors, state, type SnippetDraft } from '../state'
import Icon from './Icon.vue'

const props = defineProps<{ draft: SnippetDraft }>()
const form = reactive({ ...props.draft })
const error = ref('')

async function submit(): Promise<void> {
  if (!form.name.trim() || !form.command.trim()) {
    error.value = 'Enter a name and a command.'
    return
  }
  await saveSnippet({ ...form, name: form.name.trim() })
  state.editingSnippet = null
}

function close(): void {
  state.editingSnippet = null
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="modal-backdrop" @mousedown.self="close">
    <form class="modal" @submit.prevent="submit">
      <header class="drawer-header">
        <h2>{{ form.id ? 'Edit snippet' : 'New snippet' }}</h2>
        <button type="button" class="icon-btn" @click="close"><Icon name="x" /></button>
      </header>
      <div class="modal-body">
        <label class="field">
          <span>Name</span>
          <input v-model="form.name" placeholder="e.g. Restart nginx" autofocus />
        </label>
        <label class="field">
          <span>Command</span>
          <textarea
            v-model="form.command"
            class="mono"
            rows="4"
            spellcheck="false"
            placeholder="sudo systemctl restart nginx"
          />
        </label>
        <div class="field">
          <span>Color</span>
          <div class="color-row">
            <button
              type="button"
              class="color-swatch none"
              :class="{ selected: !form.color }"
              title="No color"
              @click="form.color = ''"
            />
            <button
              v-for="c in snippetColors"
              :key="c"
              type="button"
              class="color-swatch"
              :class="{ selected: form.color === c }"
              :style="{ background: c }"
              @click="form.color = c"
            />
          </div>
        </div>
        <label class="toggle">
          <input v-model="form.autoRun" type="checkbox" />
          <span class="toggle-ui" />
          <span>Run immediately (send Enter)</span>
        </label>
        <p v-if="error" class="form-error">{{ error }}</p>
      </div>
      <footer class="drawer-footer">
        <span class="spacer" />
        <button type="button" class="btn" @click="close">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </footer>
    </form>
  </div>
</template>
