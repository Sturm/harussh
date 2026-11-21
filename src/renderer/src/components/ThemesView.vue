<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ResolvedTheme } from '../../../shared/types'
import { api } from '../api'
import { allThemes, saveSettings, state } from '../state'
import { resolveTheme } from '../themes'
import Icon from './Icon.vue'

const themes = computed(() => allThemes.value.map(resolveTheme))
const error = ref('')

async function importTheme(): Promise<void> {
  error.value = ''
  try {
    const theme = await api.importTheme()
    if (theme) {
      state.customThemes = await api.listThemes()
      void saveSettings({ themeId: theme.id })
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function duplicate(theme: ResolvedTheme): Promise<void> {
  const copy = await api.saveThemeCopy({
    id: theme.id,
    name: theme.name,
    type: theme.type,
    ui: theme.ui,
    terminal: theme.terminal
  })
  state.customThemes = await api.listThemes()
  void saveSettings({ themeId: copy.id })
}

const ansi = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'] as const
</script>

<template>
  <section class="view">
    <header class="view-header">
      <h1>Themes</h1>
      <span class="spacer" />
      <button class="btn" @click="api.openThemesFolder()"><Icon name="folder" :size="15" /> Themes folder</button>
      <button class="btn" @click="importTheme"><Icon name="upload" :size="15" /> Import .json</button>
    </header>
    <p v-if="error" class="form-error">{{ error }}</p>

    <div class="theme-grid">
      <div
        v-for="t in themes"
        :key="t.id"
        class="theme-card"
        :class="{ active: state.settings.themeId === t.id }"
        tabindex="0"
        @click="saveSettings({ themeId: t.id })"
        @keydown.enter="saveSettings({ themeId: t.id })"
      >
        <div class="theme-preview" :style="{ background: t.ui.bg, borderRadius: t.ui.radius }">
          <div class="tp-tabbar" :style="{ background: t.ui.tabbar }">
            <span :style="{ background: t.ui.surface2 }" />
            <span :style="{ background: t.ui.accent }" />
          </div>
          <div class="tp-body">
            <div class="tp-sidebar" :style="{ background: t.ui.sidebar }">
              <i :style="{ background: t.ui.accentSoft, borderColor: t.ui.accent }" />
              <i :style="{ background: t.ui.surface2 }" />
              <i :style="{ background: t.ui.surface2 }" />
            </div>
            <div class="tp-term" :style="{ background: t.terminal.background, color: t.terminal.foreground }">
              <div>
                <span :style="{ color: t.terminal.green }">user@vm</span>:<span :style="{ color: t.terminal.blue }"
                  >~</span
                >$ ls
              </div>
              <div>
                <span :style="{ color: t.terminal.blue }">docs</span>&nbsp;
                <span :style="{ color: t.terminal.green }">run.sh</span>&nbsp;
                <span :style="{ color: t.terminal.yellow }">app.log</span>
              </div>
              <div class="tp-swatches">
                <span v-for="c in ansi" :key="c" :style="{ background: t.terminal[c] }" />
              </div>
            </div>
          </div>
        </div>
        <div class="theme-meta">
          <span class="theme-name">{{ t.name }}</span>
          <span class="badge">{{ t.type === 'light' ? 'light' : 'dark' }}</span>
          <span v-if="t.custom" class="badge accent">custom</span>
          <span class="spacer" />
          <button class="icon-btn" title="Duplicate to edit (JSON)" @click.stop="duplicate(t)">
            <Icon name="copy" :size="14" />
          </button>
          <Icon v-if="state.settings.themeId === t.id" name="check" :size="16" class="text-accent" />
        </div>
      </div>
    </div>

    <div class="info-box">
      <h3>Custom themes</h3>
      <p>
        A theme is a <code>.json</code> file in the themes folder. Edits show up instantly, no restart needed. Only set
        the keys you want to change — the rest comes from the base theme (<code>dark</code> or <code>light</code>). The
        easiest start: click <Icon name="copy" :size="12" /> on a theme and edit the copy.
      </p>
      <pre class="mono">
{
  "id": "my-theme",
  "name": "My theme",
  "type": "dark",
  "ui": { "accent": "#ff5c8a", "bg": "#1a1420", "radius": "14px" },
  "terminal": { "background": "#120e16", "foreground": "#f5e9f0", "cursor": "#ff5c8a" }
}</pre>
      <p class="hint">
        <code>ui</code> keys: bg, sidebar, tabbar, surface, surface2, border, text, textMuted, textFaint, accent,
        accentText, accentSoft, danger, success, warning, radius, fontUi. <code>terminal</code> keys: background,
        foreground, cursor, cursorAccent, selectionBackground and the 16 ANSI colors (black…brightWhite).
      </p>
    </div>
  </section>
</template>
