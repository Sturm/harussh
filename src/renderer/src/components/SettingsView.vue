<script setup lang="ts">
import type { CursorStyle } from '../../../shared/types'
import { isMac, modLabel } from '../api'
import { saveSettings, state } from '../state'

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
      <p class="hint">
        A keepalive packet is sent this often so the server, NAT or firewall don't drop an idle connection. After 3
        missed replies the connection is considered dead and — if the host has auto-reconnect on — harussh reconnects.
        Applies to new connections.
      </p>
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
