<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { FileEntry, FileSide } from '../../../shared/types'
import { api, isMac } from '../api'
import { errorMessage, formatDate, formatSize, joinPath, parentPath } from '../files'
import Icon from './Icon.vue'

const props = defineProps<{ side: FileSide; tabId: string; title: string; ready: boolean; closable?: boolean }>()
const emit = defineEmits<{
  // Copy the selected paths to the other pane's current folder.
  send: [paths: string[]]
  // Paths from the other side (or from the OS) were dropped here, into destDir.
  receive: [paths: string[], destDir: string]
  // The "×" in the header (only with `closable`).
  close: []
}>()

// Drag payload for rows dragged between the two panes of the same tab.
const DRAG_TYPE = 'application/x-harussh-files'

const path = ref('')
const pathInput = ref('')
const entries = ref<FileEntry[]>([])
const loading = ref(false)
const error = ref('')
const selected = ref(new Set<string>())
const showHidden = ref(false)
const editing = ref<{ mode: 'rename'; name: string; value: string } | { mode: 'mkdir'; value: string } | null>(null)
const dragOver = ref(false)
const listEl = ref<HTMLDivElement>()
const editInput = ref<HTMLInputElement[]>()
let anchor: string | null = null

const sep = computed(() => (props.side === 'local' && api.platform === 'win32' ? '\\' : '/'))
const sendLabel = computed(() => (props.side === 'local' ? 'Upload' : 'Download'))

const visible = computed(() =>
  entries.value
    .filter((e) => showHidden.value || !e.name.startsWith('.'))
    .sort((a, b) => {
      if ((a.type === 'dir') !== (b.type === 'dir')) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })
)

const selectedPaths = computed(() => [...selected.value].map((name) => joinPath(path.value, name, sep.value)))

async function load(target: string): Promise<void> {
  loading.value = true
  try {
    const listing = await api.fsList(props.side, props.tabId, target)
    if (listing.path !== path.value) selected.value = new Set()
    path.value = listing.path
    entries.value = listing.entries
    error.value = ''
    const names = new Set(listing.entries.map((e) => e.name))
    selected.value = new Set([...selected.value].filter((n) => names.has(n)))
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    pathInput.value = path.value
    loading.value = false
  }
}

async function goHome(): Promise<void> {
  try {
    await load(await api.fsHome(props.side, props.tabId))
  } catch (err) {
    error.value = errorMessage(err)
  }
}

function refresh(): Promise<void> {
  return load(path.value)
}

watch(
  () => props.ready,
  (ready) => {
    if (!ready) return
    if (path.value) void refresh()
    else void goHome()
  },
  { immediate: true }
)

function open(entry: FileEntry): void {
  if (entry.type === 'dir') void load(joinPath(path.value, entry.name, sep.value))
}

function goUp(): void {
  void load(parentPath(path.value, sep.value))
}

function select(entry: FileEntry, e: MouseEvent): void {
  const mod = isMac ? e.metaKey : e.ctrlKey
  if (e.shiftKey && anchor) {
    const names = visible.value.map((v) => v.name)
    const [a, b] = [names.indexOf(anchor), names.indexOf(entry.name)].sort((x, y) => x - y)
    selected.value = new Set(names.slice(a, b! + 1))
    return
  }
  const next = new Set(mod ? selected.value : [])
  if (mod && next.has(entry.name)) next.delete(entry.name)
  else next.add(entry.name)
  selected.value = next
  anchor = entry.name
}

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (err) {
    error.value = errorMessage(err)
  }
  await refresh()
}

function startMkdir(): void {
  editing.value = { mode: 'mkdir', value: '' }
  focusEdit()
}

function startRename(): void {
  const [name] = selected.value
  if (!name || selected.value.size !== 1) return
  editing.value = { mode: 'rename', name, value: name }
  focusEdit()
}

function focusEdit(): void {
  void nextTick(() => {
    const input = editInput.value?.[0]
    if (!input) return
    input.focus()
    // Select the name without the extension, like Finder/Explorer.
    const dot = input.value.lastIndexOf('.')
    input.setSelectionRange(0, dot > 0 ? dot : input.value.length)
  })
}

function commitEdit(): void {
  const edit = editing.value
  editing.value = null
  listEl.value?.focus()
  const value = edit?.value.trim()
  if (!edit || !value || /[/\\]/.test(value)) return
  const target = joinPath(path.value, value, sep.value)
  if (edit.mode === 'mkdir') {
    void run(() => api.fsMkdir(props.side, props.tabId, target))
  } else if (value !== edit.name) {
    selected.value = new Set([value])
    void run(() => api.fsRename(props.side, props.tabId, joinPath(path.value, edit.name, sep.value), target))
  }
}

function cancelEdit(): void {
  editing.value = null
  listEl.value?.focus()
}

function remove(): void {
  const n = selected.value.size
  if (!n) return
  const what = n === 1 ? `"${[...selected.value][0]}"` : `${n} items`
  const question =
    props.side === 'local' ? `Move ${what} to the Trash?` : `Delete ${what} from the server? This cannot be undone.`
  if (!confirm(question)) return
  const paths = selectedPaths.value
  selected.value = new Set()
  void run(() => api.fsDelete(props.side, props.tabId, paths))
}

function send(): void {
  if (selected.value.size) emit('send', selectedPaths.value)
}

function onKey(e: KeyboardEvent): void {
  if (editing.value) return
  const mod = isMac ? e.metaKey : e.ctrlKey
  if (e.key === 'Enter') {
    const [name] = selected.value
    const entry = selected.value.size === 1 && entries.value.find((x) => x.name === name)
    if (entry) open(entry)
  } else if (e.key === 'Backspace' && !mod) goUp()
  else if (e.key === 'Delete' || (e.key === 'Backspace' && mod)) remove()
  else if (e.key === 'F2') startRename()
  else if (mod && e.code === 'KeyA') selected.value = new Set(visible.value.map((v) => v.name))
  else if (e.key === 'Escape') selected.value = new Set()
  else return
  e.preventDefault()
}

// --- drag & drop ---

function onDragStart(entry: FileEntry, e: DragEvent): void {
  if (!selected.value.has(entry.name)) selected.value = new Set([entry.name])
  e.dataTransfer?.setData(
    DRAG_TYPE,
    JSON.stringify({ tabId: props.tabId, side: props.side, paths: selectedPaths.value })
  )
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
}

function accepts(e: DragEvent): boolean {
  const types = e.dataTransfer?.types ?? []
  // Files from Finder/Explorer can only be uploaded, i.e. dropped on the remote pane.
  return types.includes(DRAG_TYPE) || (props.side === 'remote' && types.includes('Files'))
}

function onDragOver(e: DragEvent): void {
  if (!accepts(e) || !props.ready) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  dragOver.value = true
}

function onDrop(e: DragEvent, into?: FileEntry): void {
  dragOver.value = false
  if (!accepts(e) || !props.ready) return
  e.preventDefault()
  const destDir = into?.type === 'dir' ? joinPath(path.value, into.name, sep.value) : path.value
  const raw = e.dataTransfer?.getData(DRAG_TYPE)
  if (raw) {
    const data = JSON.parse(raw) as { tabId: string; side: FileSide; paths: string[] }
    if (data.tabId === props.tabId && data.side !== props.side) emit('receive', data.paths, destDir)
    return
  }
  const files = [...(e.dataTransfer?.files ?? [])].map((f) => api.pathForFile(f)).filter(Boolean)
  if (files.length) emit('receive', files, destDir)
}

defineExpose({ getPath: () => path.value, refresh, has: (name: string) => entries.value.some((e) => e.name === name) })
</script>

<template>
  <section class="file-pane" :class="{ 'drag-over': dragOver }">
    <header class="file-pane-header">
      <h3>
        <Icon :name="side === 'local' ? 'terminal' : 'server'" :size="14" />
        {{ title }}
      </h3>
      <div class="spacer" />
      <button class="icon-btn" :class="{ on: showHidden }" title="Show hidden files" @click="showHidden = !showHidden">
        <Icon name="eye" :size="15" />
      </button>
      <button class="icon-btn" title="New folder" :disabled="!ready" @click="startMkdir">
        <Icon name="folderPlus" :size="15" />
      </button>
      <button class="icon-btn" title="Rename (F2)" :disabled="selected.size !== 1" @click="startRename">
        <Icon name="edit" :size="15" />
      </button>
      <button class="icon-btn danger" title="Delete" :disabled="!selected.size" @click="remove">
        <Icon name="trash" :size="15" />
      </button>
      <button class="btn small" :disabled="!selected.size || !ready" @click="send">
        <template v-if="side === 'local'">{{ sendLabel }} <Icon name="arrowRight" :size="14" /></template>
        <template v-else><Icon name="arrowLeft" :size="14" /> {{ sendLabel }}</template>
      </button>
      <button v-if="closable" class="icon-btn" title="Disconnect and choose another host" @click="emit('close')">
        <Icon name="x" :size="15" />
      </button>
    </header>

    <div class="file-path">
      <button class="icon-btn" title="Up (Backspace)" :disabled="!path" @click="goUp">
        <Icon name="arrowUp" :size="15" />
      </button>
      <button class="icon-btn" title="Home" :disabled="!ready" @click="goHome"><Icon name="home" :size="15" /></button>
      <input
        v-model="pathInput"
        class="mono"
        spellcheck="false"
        :disabled="!ready"
        @keydown.enter="load(pathInput.trim() || path)"
        @keydown.esc="pathInput = path"
      />
      <button class="icon-btn" title="Refresh" :disabled="!ready" @click="refresh">
        <Icon name="refresh" :size="15" :class="{ spinning: loading }" />
      </button>
    </div>

    <p v-if="error" class="file-error" @click="error = ''">{{ error }}</p>

    <div class="file-columns">
      <span>Name</span>
      <span>Size</span>
      <span>Modified</span>
    </div>
    <div
      ref="listEl"
      class="file-list"
      tabindex="0"
      @keydown="onKey"
      @click.self="selected = new Set()"
      @dragover="onDragOver"
      @dragleave.self="dragOver = false"
      @drop="onDrop($event)"
    >
      <div v-if="editing?.mode === 'mkdir'" class="file-row editing">
        <span class="file-name">
          <Icon name="folder" :size="15" class="file-icon dir" />
          <input
            ref="editInput"
            v-model="editing.value"
            placeholder="New folder"
            spellcheck="false"
            @keydown.enter.stop="commitEdit"
            @keydown.esc.stop="cancelEdit"
            @blur="commitEdit"
          />
        </span>
      </div>
      <div
        v-for="entry in visible"
        :key="entry.name"
        class="file-row"
        :class="{ selected: selected.has(entry.name) }"
        :draggable="editing?.mode !== 'rename' || editing.name !== entry.name"
        @click="select(entry, $event)"
        @dblclick="open(entry)"
        @dragstart="onDragStart(entry, $event)"
        @drop.stop="onDrop($event, entry)"
      >
        <span class="file-name">
          <Icon
            :name="entry.type === 'dir' ? 'folder' : 'file'"
            :size="15"
            class="file-icon"
            :class="{ dir: entry.type === 'dir' }"
          />
          <input
            v-if="editing?.mode === 'rename' && editing.name === entry.name"
            ref="editInput"
            v-model="editing.value"
            spellcheck="false"
            @click.stop
            @dblclick.stop
            @keydown.enter.stop="commitEdit"
            @keydown.esc.stop="cancelEdit"
            @blur="commitEdit"
          />
          <template v-else>
            <span class="file-label">{{ entry.name }}</span>
            <Icon v-if="entry.link" name="link" :size="12" class="file-link" />
          </template>
        </span>
        <span class="file-size">{{ entry.type === 'dir' ? '-' : formatSize(entry.size) }}</span>
        <span class="file-date">{{ formatDate(entry.mtime) }}</span>
      </div>
      <p v-if="ready && !loading && !visible.length && !editing" class="hint center">Empty folder</p>
    </div>

    <footer class="file-footer">
      {{ visible.length }} items<template v-if="selected.size"> · {{ selected.size }} selected</template>
    </footer>
  </section>
</template>
