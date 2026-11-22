<script setup lang="ts">
import { api } from '../api'
import { openHost, state } from '../state'
import Icon from './Icon.vue'
import type { HistoryEntry } from '../../../shared/types'

const dateFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })

function duration(e: HistoryEntry): string {
  if (!e.ok) return ''
  if (!e.endedAt) return state.tabs.some((t) => t.hostId === e.hostId && t.status === 'connected') ? 'ongoing' : ''
  const min = Math.round((e.endedAt - e.connectedAt) / 60000)
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`
}

function reconnect(e: HistoryEntry): void {
  const host = state.hosts.find((h) => h.id === e.hostId)
  if (host) openHost(host)
}

async function remove(e: HistoryEntry): Promise<void> {
  await api.deleteHistory(e.id)
  state.history = state.history.filter((x) => x.id !== e.id)
}

async function clear(): Promise<void> {
  if (!confirm('Clear the entire connection history?')) return
  await api.clearHistory()
  state.history = []
}
</script>

<template>
  <section class="view">
    <header class="view-header">
      <h1>History</h1>
      <span class="spacer" />
      <button class="btn" :disabled="!state.history.length" @click="clear">
        <Icon name="trash" :size="15" /> Clear
      </button>
    </header>

    <div v-if="!state.history.length" class="empty small"><p>Your connections will show up here.</p></div>

    <div class="list">
      <div v-for="e in state.history" :key="e.id" class="list-row">
        <span class="status-dot" :class="e.ok ? 'connected' : 'error'" />
        <div class="history-main">
          <div class="row-title">{{ e.label }}</div>
          <div class="row-sub">
            {{ e.target }}
            <template v-if="e.error">
              — <span class="text-danger">{{ e.error }}</span></template
            >
          </div>
        </div>
        <div class="history-meta">
          <div>{{ dateFmt.format(e.connectedAt) }}</div>
          <div class="row-sub">{{ duration(e) }}</div>
        </div>
        <button class="btn small" :disabled="!state.hosts.some((h) => h.id === e.hostId)" @click="reconnect(e)">
          <Icon name="play" :size="13" /> Connect
        </button>
        <button class="icon-btn danger" title="Remove from history" @click="remove(e)">
          <Icon name="trash" :size="15" />
        </button>
      </div>
    </div>
  </section>
</template>
