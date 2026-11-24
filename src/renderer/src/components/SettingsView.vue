<script setup lang="ts">
import { computed } from 'vue'
import type { CursorStyle } from '../../../shared/types'
import { api, isMac, modLabel } from '../api'
import { checkForUpdates, saveSettings, state } from '../state'

const fontSuggestions = [
  'Menlo, Monaco, monospace',
  'SF Mono, Menlo, monospace',
  'JetBrains Mono, monospace',
  'Fira Code, monospace',
  'Cascadia Mono, Consolas, monospace',
  'Consolas, monospace',
  "'DejaVu Sans Mono', monospace",
  "'Ubuntu Mono', monospace"
]

function num(e: Event, min: number, max: number): number {
  const v = Number((e.target as HTMLInputElement).value)
  return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min))
}

const updateText = computed(() => {
  const u = state.update
  switch (u?.state) {
    case 'checking':
      return 'Checking for updates…'
    case 'latest':
      return 'You have the latest version.'
    case 'available':
      return `Version ${u.version} is available — download it from GitHub.`
    case 'downloading':
      return `Downloading version ${u.version}… ${u.percent ?? 0}%`
    case 'ready':
      return `Version ${u.version} is ready — it installs when you restart or quit the app.`
    case 'error':
      return `Couldn't check for updates: ${u.message}`
    case 'unsupported':
      return u.message
    default:
      return ''
  }
})

const shortcuts = [
  [`${modLabel}T`, 'New connection (host list)'],
  [`${modLabel}W`, 'Close tab'],
  [`${modLabel}1…9`, 'Go to tab'],
  ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous tab'],
  [`${modLabel}S`, 'Snippets panel'],
  [isMac ? '⌘C / ⌘V' : 'Ctrl+Shift+C / Ctrl+Shift+V', 'Copy / paste in the terminal'],
  ['Right click', 'Copy selection or paste'],
  ['F12', 'Developer tools']
]
</script>

<template>
  <section class="view">
    <header class="view-header">
      <h1>Settings</h1>
    </header>

    <div class="settings-section">
      <h3>Terminal</h3>
      <label class="setting">
        <span>Font</span>
        <input
          :value="state.settings.fontFamily"
          list="font-suggestions"
          spellcheck="false"
          @change="saveSettings({ fontFamily: ($event.target as HTMLInputElement).value })"
        />
        <datalist id="font-suggestions">
          <option v-for="f in fontSuggestions" :key="f" :value="f" />
        </datalist>
      </label>
      <label class="setting">
        <span>Font size</span>
        <input
          type="number"
          min="9"
          max="32"
          :value="state.settings.fontSize"
          @change="saveSettings({ fontSize: num($event, 9, 32) })"
        />
      </label>
      <label class="setting">
        <span>Line height</span>
        <input
          type="number"
          min="1"
          max="2"
          step="0.05"
          :value="state.settings.lineHeight"
          @change="saveSettings({ lineHeight: num($event, 1, 2) })"
        />
      </label>
      <label class="setting">
        <span>Cursor</span>
        <select
          :value="state.settings.cursorStyle"
          @change="saveSettings({ cursorStyle: ($event.target as HTMLSelectElement).value as CursorStyle })"
        >
          <option value="block">Block</option>
          <option value="bar">Bar</option>
          <option value="underline">Underline</option>
        </select>
      </label>
      <label class="setting">
        <span>Scrollback (lines)</span>
        <input
          type="number"
          min="500"
          max="200000"
          step="500"
          :value="state.settings.scrollback"
          @change="saveSettings({ scrollback: num($event, 500, 200000) })"
        />
      </label>
      <label class="toggle">
        <input
          type="checkbox"
          :checked="state.settings.cursorBlink"
          @change="saveSettings({ cursorBlink: !state.settings.cursorBlink })"
        />
        <span class="toggle-ui" />
        <span>Blinking cursor</span>
      </label>
      <label class="toggle">
        <input
          type="checkbox"
          :checked="state.settings.copyOnSelect"
          @change="saveSettings({ copyOnSelect: !state.settings.copyOnSelect })"
        />
        <span class="toggle-ui" />
        <span>Copy on select</span>
      </label>
    </div>

    <div class="settings-section">
      <h3>Connection</h3>
      <label class="setting">
        <span>Keepalive interval (seconds)</span>
        <input
          type="number"
          min="5"
          max="300"
          :value="state.settings.keepAliveInterval"
          @change="saveSettings({ keepAliveInterval: num($event, 5, 300) })"
        />
      </label>
    </div>

    <div class="settings-section">
      <h3>Updates</h3>
      <div class="update-row">
        <span>harussh {{ state.update?.current }}</span>
        <button
          v-if="state.update?.state === 'ready' || state.update?.state === 'available'"
          class="btn small primary"
          @click="api.installUpdate()"
        >
          {{ state.update.state === 'ready' ? 'Restart and update' : 'Download' }}
        </button>
        <button
          v-else
          class="btn small"
          :disabled="
            state.update?.state === 'unsupported' ||
            state.update?.state === 'checking' ||
            state.update?.state === 'downloading'
          "
          @click="checkForUpdates()"
        >
          Check for updates
        </button>
      </div>
      <p v-if="updateText" class="hint" :class="{ warn: state.update?.state === 'error' }">{{ updateText }}</p>
      <label class="toggle">
        <input
          type="checkbox"
          :checked="state.settings.autoUpdate"
          @change="saveSettings({ autoUpdate: !state.settings.autoUpdate })"
        />
        <span class="toggle-ui" />
        <span>{{
          state.update?.canInstall ? 'Check for and download updates automatically' : 'Check for updates automatically'
        }}</span>
      </label>
    </div>

    <div class="settings-section">
      <h3>Keyboard shortcuts</h3>
      <div class="shortcuts">
        <template v-for="[keys, desc] in shortcuts" :key="keys">
          <kbd>{{ keys }}</kbd>
          <span>{{ desc }}</span>
        </template>
      </div>
    </div>
  </section>
</template>
