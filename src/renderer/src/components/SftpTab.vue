<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { formatSize } from '../files'
import type { Host } from '../../../shared/types'
import { closeTab, connectSftpTab, disconnectSftpTab, editHost, SFTP_TAB, state, type Tab } from '../state'
import FilePane from './FilePane.vue'
import Icon from './Icon.vue'

const props = defineProps<{ tab: Tab; active: boolean }>()

// What FilePane exposes via defineExpose.
interface Pane {
  getPath(): string
  refresh(): Promise<void>
  has(name: string): boolean
}

const localPane = ref<Pane>()
const remotePane = ref<Pane>()

const host = computed(() => state.hosts.find((h) => h.id === props.tab.hostId))
const transfers = computed(() => state.transfers.filter((t) => t.tabId === props.tab.id))
const finished = computed(() => transfers.value.filter((t) => t.state !== 'queued' && t.state !== 'running'))

// The fixed SFTP tab starts without a host and can switch hosts later.
const isFixed = computed(() => props.tab.id === SFTP_TAB)
const search = ref('')
const pickable = computed(() => {
  const q = search.value.trim().toLowerCase()
  return state.hosts
    .filter((h) => !q || [h.label, h.hostname, h.username, h.group].some((v) => v.toLowerCase().includes(q)))
    .sort((a, b) => (a.label || a.hostname).localeCompare(b.label || b.hostname))
})

function pick(h: Host): void {
  connectSftpTab(h)
}

onMounted(() => {
  if (props.tab.hostId) api.sftpOpen(props.tab.id, props.tab.hostId)
})
watch(
  () => props.tab.hostId,
  (hostId) => {
    if (hostId) api.sftpOpen(props.tab.id, hostId)
  }
)

// When a transfer lands in the folder a pane is showing, refresh that pane.
watch(
  () => transfers.value.filter((t) => t.state === 'done').map((t) => t.id),
  (done, before) => {
    const added = done.filter((id) => !before?.includes(id))
    for (const t of transfers.value.filter((x) => added.includes(x.id))) {
      const pane = t.direction === 'upload' ? remotePane.value : localPane.value
      if (pane?.getPath() === t.destDir) void pane.refresh()
    }
  }
)

function confirmOverwrite(paths: string[], destDir: string, pane: Pane | undefined): boolean {
  if (!pane || pane.getPath() !== destDir) return true
  const clashes = paths.map((p) => p.split(/[/\\]/).pop()!).filter((name) => pane.has(name))
  if (!clashes.length) return true
  const what = clashes.length === 1 ? `"${clashes[0]}" already exists` : `${clashes.length} items already exist`
  return confirm(`${what} in ${destDir}. Overwrite?`)
}

function upload(localPaths: string[], destDir = remotePane.value?.getPath()): void {
  if (!destDir || !confirmOverwrite(localPaths, destDir, remotePane.value)) return
  api.sftpUpload(props.tab.id, localPaths, destDir)
}

function download(remotePaths: string[], destDir = localPane.value?.getPath()): void {
  if (!destDir || !confirmOverwrite(remotePaths, destDir, localPane.value)) return
  api.sftpDownload(props.tab.id, remotePaths, destDir)
}

function clearFinished(): void {
  const ids = new Set(finished.value.map((t) => t.id))
  state.transfers = state.transfers.filter((t) => !ids.has(t.id))
}

function percent(bytes: number, total: number): number {
  return total ? Math.min(100, (bytes / total) * 100) : 0
}

function editThisHost(): void {
  if (host.value) editHost(host.value)
}
</script>

<template>
  <div v-show="active" class="sftp-tab">
    <div class="sftp-panes">
      <FilePane
        ref="localPane"
        side="local"
        title="This computer"
        :tab-id="tab.id"
        :ready="true"
        @send="upload"
        @receive="download"
      />
      <FilePane
        v-if="tab.hostId"
        :key="tab.hostId"
        ref="remotePane"
        side="remote"
        :title="host ? `${host.username}@${host.hostname}` : 'Remote'"
        :tab-id="tab.id"
        :ready="tab.status === 'connected'"
        :closable="isFixed"
        @send="download"
        @receive="upload"
        @close="disconnectSftpTab"
      />
      <section v-else class="file-pane host-picker">
        <header class="file-pane-header">
          <h3><Icon name="server" :size="14" /> Choose a host</h3>
        </header>
        <div class="search compact">
          <Icon name="search" :size="14" />
          <input v-model="search" placeholder="Search hosts…" @keydown.enter="pickable[0] && pick(pickable[0])" />
        </div>
        <div class="host-picker-list">
          <button v-for="h in pickable" :key="h.id" class="host-picker-item" @click="pick(h)">
            <span class="host-icon small" :style="{ background: h.color }">
              {{ (h.label || h.hostname).slice(0, 2).toUpperCase() }}
            </span>
            <span class="host-info">
              <span class="host-label">{{ h.label || h.hostname }}</span>
              <span class="host-sub">{{ h.username }}@{{ h.hostname }}</span>
            </span>
          </button>
          <p v-if="!state.hosts.length" class="hint center">No hosts yet — add one under Hosts.</p>
          <p v-else-if="!pickable.length" class="hint center">Nothing matches "{{ search }}".</p>
        </div>
      </section>
    </div>

    <section v-if="transfers.length" class="transfers">
      <header>
        <h3>Transfers</h3>
        <div class="spacer" />
        <button v-if="finished.length" class="link" @click="clearFinished">Clear finished</button>
      </header>
      <div class="transfer-list">
        <div v-for="t in transfers" :key="t.id" class="transfer" :class="t.state">
          <Icon :name="t.direction === 'upload' ? 'upload' : 'download'" :size="14" />
          <span class="transfer-name" :title="`${t.name} → ${t.destDir}`">{{ t.name }}</span>
          <div class="transfer-bar"><div :style="{ width: `${percent(t.bytes, t.total)}%` }" /></div>
          <span class="transfer-meta">
            <template v-if="t.state === 'queued'">Waiting</template>
            <template v-else-if="t.state === 'running'">
              {{ formatSize(t.bytes) }} / {{ formatSize(t.total) }}
            </template>
            <template v-else-if="t.state === 'done'">
              {{ t.files === 1 ? formatSize(t.total) : `${t.files} files, ${formatSize(t.total)}` }}
            </template>
            <template v-else-if="t.state === 'canceled'">Canceled</template>
            <span v-else class="text-danger" :title="t.error">{{ t.error || 'Failed' }}</span>
          </span>
          <button
            v-if="t.state === 'queued' || t.state === 'running'"
            class="icon-btn"
            title="Cancel"
            @click="api.sftpCancel(t.id)"
          >
            <Icon name="x" :size="13" />
          </button>
          <Icon v-else-if="t.state === 'done'" name="check" :size="14" class="transfer-done" />
        </div>
      </div>
    </section>

    <Transition name="fade">
      <div v-if="tab.hostId && tab.status !== 'connected'" class="term-banner" :class="tab.status">
        <span class="status-dot" :class="tab.status" />
        <span class="term-banner-text">
          <template v-if="tab.status === 'connecting'">Connecting…</template>
          <template v-else>{{ tab.message || 'Disconnected' }}</template>
        </span>
        <button
          v-if="tab.status === 'error' && tab.code === 'hostkey'"
          class="btn small danger"
          @click="api.sftpTrustHostKey(tab.id)"
        >
          Trust new key
        </button>
        <button v-if="tab.status === 'error' && tab.code === 'auth'" class="btn small" @click="editThisHost">
          <Icon name="edit" :size="13" /> Edit host
        </button>
        <button v-if="tab.status !== 'connecting'" class="btn small primary" @click="api.sftpReconnect(tab.id)">
          <Icon name="refresh" :size="13" /> Reconnect
        </button>
        <button v-if="tab.status !== 'connecting'" class="btn small" @click="closeTab(tab.id)">
          {{ isFixed ? 'Choose another host' : 'Close tab' }}
        </button>
      </div>
    </Transition>
  </div>
</template>
