<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { AuthMethod, HostInput } from '../../../shared/types'
import { api } from '../api'
import { hostColors, openHost, saveHost, state, type HostDraft } from '../state'
import Icon from './Icon.vue'

const props = defineProps<{ draft: HostDraft }>()

const form = reactive({ ...props.draft })
// Secrets: '' in the field = keep the stored value, unless the user clicks "remove".
const secrets = reactive({ password: '', privateKey: '', passphrase: '' })
const cleared = reactive({ password: false, privateKey: false, passphrase: false })
const error = ref('')
const saving = ref(false)

const isNew = !props.draft.id
const groups = computed(() => [...new Set(state.hosts.map((h) => h.group).filter(Boolean))])
const authOptions: { value: AuthMethod; label: string }[] = [
  { value: 'password', label: 'Password' },
  { value: 'key', label: 'SSH key' },
  { value: 'agent', label: 'SSH agent' }
]

function secretValue(key: keyof typeof secrets): string | null | undefined {
  if (secrets[key]) return secrets[key]
  return cleared[key] ? null : undefined
}

function clearSecret(key: keyof typeof secrets): void {
  secrets[key] = ''
  cleared[key] = true
}

async function loadKey(): Promise<void> {
  try {
    const content = await api.readKeyFile()
    if (content) {
      secrets.privateKey = content
      cleared.privateKey = false
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function submit(connect: boolean): Promise<void> {
  error.value = ''
  if (!form.hostname.trim()) return void (error.value = 'Enter a host address.')
  if (!form.username.trim()) return void (error.value = 'Enter a username.')
  if (form.auth === 'key' && !secrets.privateKey && (!form.hasKey || cleared.privateKey))
    return void (error.value = 'Paste or load a private key.')

  const input: HostInput = {
    id: form.id,
    label: form.label.trim(),
    group: form.group.trim(),
    hostname: form.hostname.trim(),
    port: Number(form.port) || 22,
    username: form.username.trim(),
    auth: form.auth,
    color: form.color,
    autoReconnect: form.autoReconnect,
    password: secretValue('password'),
    privateKey: secretValue('privateKey'),
    passphrase: secretValue('passphrase')
  }
  saving.value = true
  try {
    const host = await saveHost(input)
    state.editingHost = null
    if (connect) openHost(host)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

function close(): void {
  state.editingHost = null
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="drawer-backdrop" @mousedown.self="close">
    <aside class="drawer">
      <header class="drawer-header">
        <h2>{{ isNew ? 'New host' : 'Edit host' }}</h2>
        <button class="icon-btn" title="Close (Esc)" @click="close"><Icon name="x" /></button>
      </header>

      <form class="drawer-body" @submit.prevent="submit(false)">
        <section class="form-section">
          <h3>Address</h3>
          <div class="field-row">
            <label class="field grow">
              <span>Host / IP</span>
              <input
                v-model="form.hostname"
                placeholder="192.168.1.10 or vm.example.com"
                autofocus
                spellcheck="false"
              />
            </label>
            <label class="field port">
              <span>Port</span>
              <input v-model.number="form.port" type="number" min="1" max="65535" />
            </label>
          </div>
          <label class="field">
            <span>Label</span>
            <input v-model="form.label" :placeholder="form.hostname || 'e.g. My VM'" />
          </label>
          <label class="field">
            <span>Group</span>
            <input v-model="form.group" list="host-groups" placeholder="e.g. Production, Home…" />
            <datalist id="host-groups">
              <option v-for="g in groups" :key="g" :value="g" />
            </datalist>
          </label>
          <div class="field">
            <span>Color</span>
            <div class="color-row">
              <button
                v-for="c in hostColors"
                :key="c"
                type="button"
                class="color-swatch"
                :class="{ selected: form.color === c }"
                :style="{ background: c }"
                @click="form.color = c"
              />
            </div>
          </div>
        </section>

        <section class="form-section">
          <h3>Authentication</h3>
          <label class="field">
            <span>Username</span>
            <input v-model="form.username" placeholder="root" spellcheck="false" />
          </label>
          <div class="segmented">
            <button
              v-for="o in authOptions"
              :key="o.value"
              type="button"
              :class="{ active: form.auth === o.value }"
              @click="form.auth = o.value"
            >
              {{ o.label }}
            </button>
          </div>

          <label v-if="form.auth !== 'agent'" class="field">
            <span>
              {{ form.auth === 'key' ? 'Password (optional, for keyboard-interactive)' : 'Password' }}
              <button
                v-if="form.hasPassword && !cleared.password"
                type="button"
                class="link"
                @click="clearSecret('password')"
              >
                remove saved
              </button>
            </span>
            <input
              v-model="secrets.password"
              type="password"
              autocomplete="new-password"
              :placeholder="form.hasPassword && !cleared.password ? '•••••••• saved — type to change' : ''"
            />
          </label>

          <template v-if="form.auth === 'key'">
            <label class="field">
              <span>
                Private key
                <button
                  v-if="form.hasKey && !cleared.privateKey"
                  type="button"
                  class="link"
                  @click="clearSecret('privateKey')"
                >
                  remove saved
                </button>
              </span>
              <textarea
                v-model="secrets.privateKey"
                class="mono"
                rows="5"
                spellcheck="false"
                :placeholder="
                  form.hasKey && !cleared.privateKey
                    ? 'Key saved — paste a new one to change it'
                    : '-----BEGIN OPENSSH PRIVATE KEY-----'
                "
              />
            </label>
            <button type="button" class="btn subtle" @click="loadKey">
              <Icon name="upload" :size="15" /> Load from file (~/.ssh)
            </button>
            <label class="field">
              <span>
                Key passphrase
                <button
                  v-if="form.hasPassphrase && !cleared.passphrase"
                  type="button"
                  class="link"
                  @click="clearSecret('passphrase')"
                >
                  remove
                </button>
              </span>
              <input
                v-model="secrets.passphrase"
                type="password"
                autocomplete="new-password"
                :placeholder="form.hasPassphrase && !cleared.passphrase ? '•••••••• saved' : 'if the key is encrypted'"
              />
            </label>
          </template>

          <p v-if="form.auth === 'agent'" class="hint">
            Uses your running SSH agent (ssh-agent / 1Password / OpenSSH Agent on Windows) — no keys are stored in the
            app.
          </p>
          <p v-if="state.secretsEncrypted" class="hint">
            <Icon name="shield" :size="13" />Passwords and keys are encrypted with the OS secret store (Keychain / DPAPI
            / libsecret).
          </p>
          <p v-else class="hint warn">
            <Icon name="shield" :size="13" />No OS secret store found (e.g. no keyring on Linux). Passwords and keys are
            kept only until harussh quits and are never written to disk.
          </p>
        </section>

        <section class="form-section">
          <h3>Connection</h3>
          <label class="toggle">
            <input v-model="form.autoReconnect" type="checkbox" />
            <span class="toggle-ui" />
            <span>Automatically reconnect when the connection drops</span>
          </label>
        </section>

        <p v-if="error" class="form-error">{{ error }}</p>
      </form>

      <footer class="drawer-footer">
        <button class="btn" type="button" @click="close">Cancel</button>
        <span class="spacer" />
        <button class="btn" type="button" :disabled="saving" @click="submit(false)">Save</button>
        <button class="btn primary" type="button" :disabled="saving" @click="submit(true)">
          <Icon name="play" :size="14" /> Save & connect
        </button>
      </footer>
    </aside>
  </div>
</template>
