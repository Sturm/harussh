<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { PromptRequest } from '../../../shared/types'
import { answerPrompt } from '../state'
import Icon from './Icon.vue'

// Asked by the main process while connecting: trust an unknown host key, or
// answer keyboard-interactive prompts (password, one-time code, 2FA).
const props = defineProps<{ request: PromptRequest }>()

const form = ref<HTMLFormElement>()
const values = reactive<string[]>(props.request.kind === 'auth' ? props.request.prompts.map(() => '') : [])

const title = computed(() => {
  const r = props.request
  if (r.kind === 'hostkey') return `Unknown host: ${r.host}`
  return r.title.trim() || `Sign in to ${r.host}`
})

function submit(): void {
  answerPrompt(props.request.id, props.request.kind === 'auth' ? [...values] : [])
}

function cancel(): void {
  answerPrompt(props.request.id, null)
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  cancel()
}
// Capture phase, so Esc never reaches the terminal behind the dialog.
onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  // Take focus from the terminal: the first field, or the Trust button.
  form.value?.querySelector<HTMLElement>('input, button[type="submit"]')?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="modal-backdrop prompt-backdrop">
    <form ref="form" class="modal" @submit.prevent="submit">
      <header class="drawer-header">
        <Icon :name="request.kind === 'hostkey' ? 'shield' : 'lock'" />
        <h2>{{ title }}</h2>
        <button type="button" class="icon-btn" title="Cancel (Esc)" @click="cancel"><Icon name="x" /></button>
      </header>

      <div v-if="request.kind === 'hostkey'" class="modal-body">
        <p class="hint">
          This is the first connection to <strong>{{ request.target }}</strong>. Check that the fingerprint matches the
          server's key (on the server: <code>ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub</code>). Once trusted, it is
          saved and a changed key will be reported.
        </p>
        <div class="field">
          <span>{{ request.keyType }} fingerprint</span>
          <div class="prompt-fingerprint mono">{{ request.fingerprint }}</div>
        </div>
      </div>

      <div v-else class="modal-body">
        <p v-if="request.instructions.trim()" class="prompt-instructions">{{ request.instructions.trim() }}</p>
        <p v-else class="hint">{{ request.host }} asks for more information to sign in.</p>
        <label v-for="(p, i) in request.prompts" :key="i" class="field">
          <span>{{ p.prompt.trim() || 'Response' }}</span>
          <input
            v-model="values[i]"
            :type="p.echo ? 'text' : 'password'"
            autocomplete="one-time-code"
            spellcheck="false"
          />
        </label>
      </div>

      <footer class="drawer-footer">
        <span class="spacer" />
        <button type="button" class="btn" @click="cancel">Cancel</button>
        <button v-if="request.kind === 'hostkey'" type="submit" class="btn primary">
          <Icon name="check" :size="14" /> Trust and connect
        </button>
        <button v-else type="submit" class="btn primary">Continue</button>
      </footer>
    </form>
  </div>
</template>
