<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { api, isMac, matchShortcut, onTabData } from '../api'
import { closeTab, currentTheme, editHost, recordCommand, state, type Tab } from '../state'
import Icon from './Icon.vue'
import SidePanel from './SidePanel.vue'
import { CommandCapture } from '../commandCapture'
import type { ResolvedTheme } from '../../../shared/types'

const props = defineProps<{ tab: Tab; active: boolean }>()

const el = ref<HTMLDivElement>()
let term: Terminal
let fit: FitAddon
let resizeObserver: ResizeObserver
let offData: () => void

function safeFit(): void {
  // A hidden tab has zero size; fitting would send 1×1 and garble the remote session.
  if (el.value && el.value.offsetWidth > 0 && el.value.offsetHeight > 0) fit.fit()
}

async function paste(): Promise<void> {
  const text = await api.clipboardRead()
  if (text) term.paste(text)
}

function copySelection(): boolean {
  if (!term.hasSelection()) return false
  api.clipboardWrite(term.getSelection())
  return true
}

function onContextMenu(): void {
  // Like many SSH clients: right-click copies the selection, or pastes when nothing is selected.
  if (copySelection()) term.clearSelection()
  else void paste()
}

// With a theme wallpaper the tab paints the (translucent) background and
// xterm draws on a transparent canvas, so the color is not applied twice.
function xtermTheme(theme: ResolvedTheme): ResolvedTheme['terminal'] {
  return theme.background ? { ...theme.terminal, background: 'rgba(0, 0, 0, 0)' } : theme.terminal
}

onMounted(() => {
  const s = state.settings
  term = new Terminal({
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    cursorStyle: s.cursorStyle,
    cursorBlink: s.cursorBlink,
    scrollback: s.scrollback,
    theme: xtermTheme(currentTheme.value),
    allowTransparency: !!currentTheme.value.background,
    macOptionIsMeta: true
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebLinksAddon((_e, uri) => api.openExternal(uri)))
  term.open(el.value!)
  try {
    const webgl = new WebglAddon()
    webgl.onContextLoss(() => webgl.dispose())
    term.loadAddon(webgl)
  } catch {
    // no WebGL, so xterm falls back to the DOM renderer
  }

  term.attachCustomKeyEventHandler((e) => {
    if (matchShortcut(e)) return false // handled by App
    if (e.type !== 'keydown') return true
    if (isMac && e.metaKey && e.code === 'KeyC') return !copySelection()
    if (!isMac && e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
      copySelection()
      return false
    }
    if (!isMac && e.ctrlKey && e.shiftKey && e.code === 'KeyV') {
      e.preventDefault()
      void paste()
      return false
    }
    return true
  })

  const capture = new CommandCapture(term)
  term.onData((data) => {
    // Read the command line before sending Enter, while it's still on screen.
    const command = capture.input(data)
    api.sshWrite(props.tab.id, data)
    if (command) recordCommand(props.tab.hostId, command)
  })
  term.onResize(({ cols, rows }) => api.sshResize(props.tab.id, cols, rows))
  term.onSelectionChange(() => {
    if (state.settings.copyOnSelect) copySelection()
  })
  offData = onTabData(props.tab.id, (data) => term.write(data))

  safeFit()
  api.sshOpen(props.tab.id, props.tab.hostId, term.cols, term.rows)

  resizeObserver = new ResizeObserver(() => requestAnimationFrame(safeFit))
  resizeObserver.observe(el.value!)
  if (props.active) term.focus()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  offData?.()
  term?.dispose()
})

watch(
  () => props.active,
  async (active) => {
    if (!active) return
    await nextTick()
    safeFit()
    term.focus()
  }
)

watch(
  () => state.termFocus,
  () => {
    if (props.active) term.focus()
  }
)

watch(
  () => [currentTheme.value, { ...state.settings }] as const,
  ([theme, s]) => {
    term.options.allowTransparency = !!theme.background
    term.options.theme = xtermTheme(theme)
    term.options.fontFamily = s.fontFamily
    term.options.fontSize = s.fontSize
    term.options.lineHeight = s.lineHeight
    term.options.cursorStyle = s.cursorStyle
    term.options.cursorBlink = s.cursorBlink
    term.options.scrollback = s.scrollback
    requestAnimationFrame(safeFit)
  }
)

function reconnect(): void {
  api.sshReconnect(props.tab.id)
  term.focus()
}

function editThisHost(): void {
  const host = state.hosts.find((h) => h.id === props.tab.hostId)
  if (host) editHost(host)
}
</script>

<template>
  <div v-show="active" class="term-tab" :style="{ background: currentTheme.terminal.background }">
    <div class="term-main">
      <div ref="el" class="term-host" @contextmenu.prevent="onContextMenu" />

      <Transition name="fade">
        <div v-if="tab.status !== 'connected'" class="term-banner" :class="tab.status">
          <span class="status-dot" :class="tab.status" />
          <span class="term-banner-text">
            <template v-if="tab.status === 'connecting'">Connecting…</template>
            <template v-else>{{ tab.message || 'Disconnected' }}</template>
          </span>
          <template v-if="tab.status === 'error' && tab.code === 'hostkey'">
            <button class="btn small danger" @click="api.sshTrustHostKey(tab.id)">Trust new key</button>
          </template>
          <template v-if="tab.status === 'error' && tab.code === 'auth'">
            <button class="btn small" @click="editThisHost"><Icon name="edit" :size="13" /> Edit host</button>
          </template>
          <button v-if="tab.status !== 'connecting'" class="btn small primary" @click="reconnect">
            <Icon name="refresh" :size="13" /> {{ tab.status === 'reconnecting' ? 'Reconnect now' : 'Reconnect' }}
          </button>
          <button
            v-if="tab.status === 'disconnected' || tab.status === 'error'"
            class="btn small"
            @click="closeTab(tab.id)"
          >
            Close tab
          </button>
        </div>
      </Transition>
    </div>
    <SidePanel v-if="state.sidePanel" :tab-id="tab.id" :host-id="tab.hostId" />
  </div>
</template>
